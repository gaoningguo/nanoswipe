import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSourceStore } from './source.js'
import { moontvApi } from '../services/moontvApi.js'

export const usePlayerStore = defineStore('player', () => {
  const sourceStore = useSourceStore()

  const queue = ref([])           // video queue
  const currentIndex = ref(0)
  const loading = ref(false)
  const error = ref(null)
  const isMuted = ref(true)       // start muted for autoplay policy
  const isLooping = ref(false)
  const searchResults = ref([])
  const searchLoading = ref(false)

  const currentVideo = computed(() => queue.value[currentIndex.value] || null)
  const hasNext = computed(() => currentIndex.value < queue.value.length - 1)
  const hasPrev = computed(() => currentIndex.value > 0)

  async function loadInitialQueue() {
    loading.value = true
    error.value = null
    try {
      if (sourceStore.activeSource === 'custom') {
        queue.value = [...sourceStore.customVideos]
        currentIndex.value = 0
      } else if (sourceStore.activeSource === 'moontv') {
        await loadMoontvRecommend()
      }
    } catch (e) {
      error.value = e.message || '加载失败'
    } finally {
      loading.value = false
    }
  }

  async function loadMoontvRecommend(page = 1) {
    const results = await moontvApi.recommend(sourceStore.moontvUrl, sourceStore.moontvToken, page)
    const videos = results.map(item => ({
      id: `moontv-${item.source}-${item.id}`,
      title: item.title,
      url: null,         // to be resolved on demand
      cover: item.poster || '',
      source: 'moontv',
      sourceName: item.source_name || 'MoonTV',
      desc: item.desc || '',
      year: item.year || '',
      moontvId: item.id,
      moontvSource: item.source,
      type: 'hls',
    }))
    if (page === 1) {
      queue.value = videos
      currentIndex.value = 0
    } else {
      queue.value.push(...videos)
    }
  }

  function next() {
    if (currentIndex.value < queue.value.length - 1) {
      currentIndex.value++
      // Preload more when near end
      if (currentIndex.value >= queue.value.length - 3) {
        _appendMore()
      }
    }
  }

  function prev() {
    if (currentIndex.value > 0) {
      currentIndex.value--
    }
  }

  function goTo(index) {
    if (index >= 0 && index < queue.value.length) {
      currentIndex.value = index
    }
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
  }

  function toggleLoop() {
    isLooping.value = !isLooping.value
  }

  async function resolveVideoUrl(video) {
    if (video.url) return video.url
    if (video.source !== 'moontv') return null
    try {
      const detail = await moontvApi.detail(
        sourceStore.moontvUrl,
        sourceStore.moontvToken,
        video.moontvId,
        video.moontvSource
      )

      console.log('[MoonTV detail]', JSON.stringify(detail).slice(0, 300))

      const playback = detail?.playbacks?.[0]
      const episodes = detail?.episodes || playback?.episodes || []
      const episodeTitles = detail?.episodes_titles || detail?.episodeTitles || playback?.episodes_titles || playback?.episodeTitles || []
      const proxyMode = detail?.proxyMode === true

      // Get first episode URL
      const firstEp = episodes[0]
      let epUrl = typeof firstEp === 'string' ? firstEp : firstEp?.playUrl || firstEp?.url

      let finalUrl = epUrl

      if (epUrl) {
        finalUrl = await moontvApi.resolvePlayUrl(
          sourceStore.moontvUrl,
          sourceStore.moontvToken,
          epUrl,
          video.moontvSource,
          0,
          proxyMode
        )
        
        // Update queue item
        const idx = queue.value.findIndex(v => v.id === video.id)
        if (idx !== -1) {
          queue.value[idx].url = finalUrl
          queue.value[idx].rawEpisodeUrl = epUrl   // keep raw for episode switching
          queue.value[idx].proxyMode = proxyMode
          queue.value[idx].episodes = episodes
          queue.value[idx].episodeTitles = episodeTitles
          queue.value[idx].currentEpisode = 0
          queue.value[idx].moontvSource = video.moontvSource
        }
      }

      return finalUrl
    } catch (e) {
      console.error('[resolveVideoUrl failed]', e)
      return null
    }
  }

  async function search(keyword) {
    if (!keyword.trim()) return
    searchLoading.value = true
    searchResults.value = []
    try {
      const results = await moontvApi.search(
        sourceStore.moontvUrl,
        sourceStore.moontvToken,
        keyword
      )
      searchResults.value = results
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      searchLoading.value = false
    }
  }

  async function playSearchResult(item) {
    const video = {
      id: `moontv-${item.source}-${item.id}`,
      title: item.title,
      url: null,
      cover: item.poster || '',
      source: 'moontv',
      sourceName: item.source_name || 'MoonTV',
      desc: item.desc || '',
      year: item.year || '',
      moontvId: item.id,
      moontvSource: item.source,
      type: 'hls',
    }
    // Insert at current position + 1
    queue.value.splice(currentIndex.value + 1, 0, video)
    currentIndex.value++
  }

  function loadCustomVideos() {
    queue.value = [...sourceStore.customVideos]
    currentIndex.value = 0
    error.value = null
  }

  async function _appendMore() {
    if (sourceStore.activeSource !== 'moontv') return
    const page = Math.ceil(queue.value.length / 20) + 1
    await loadMoontvRecommend(page)
  }

  return {
    queue,
    currentIndex,
    currentVideo,
    loading,
    error,
    isMuted,
    isLooping,
    hasNext,
    hasPrev,
    searchResults,
    searchLoading,
    loadInitialQueue,
    loadCustomVideos,
    next,
    prev,
    goTo,
    toggleMute,
    toggleLoop,
    resolveVideoUrl,
    search,
    playSearchResult,
  }
})
