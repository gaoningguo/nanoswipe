import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSourceStore } from './source.js'
import { moontvApi } from '../services/moontvApi.js'
import { historyService } from '../services/historyService.js'

export const usePlayerStore = defineStore('player', () => {
  const sourceStore = useSourceStore()

  const queue = ref([])           // video queue
  const currentIndex = ref(0)
  const loading = ref(false)
  const loadingMore = ref(false)  // lock for appending more
  const recommendPage = ref(1)    // track page
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
    recommendPage.value = 1
    try {
      if (sourceStore.activeSource === 'custom') {
        queue.value = [...sourceStore.customVideos]
        currentIndex.value = 0
      } else if (sourceStore.activeSource === 'moontv') {
        await loadMoontvRecommend(1)
      }
    } catch (e) {
      error.value = e.message || '加载失败'
    } finally {
      loading.value = false
    }
  }

  async function loadMoontvRecommend(page = 1) {
    let results = []
    try {
      results = await moontvApi.recommend(sourceStore.moontvUrl, sourceStore.moontvToken, page)
    } catch (e) {
      console.error('Fetch recommend failed', e)
      return
    }
    
    if (!results || results.length === 0) return

    // Randomize results
    results = results.sort(() => Math.random() - 0.5)

    // Limit to 10 items per batch as requested
    const batchSize = 10
    const limitedResults = results.slice(0, batchSize)

    const videos = limitedResults.map(item => ({
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

    // Filter out finished videos
    const filteredVideos = []
    for (const v of videos) {
      const finished = await historyService.isFinished(v.id)
      if (!finished) {
        filteredVideos.push(v)
      }
    }

    if (page === 1) {
      queue.value = filteredVideos
      currentIndex.value = 0
      
      // If after filtering we have too few, try to take more from current results first
      if (queue.value.length < 5 && results.length > limitedResults.length) {
        const extraResults = results.slice(batchSize, batchSize + 20)
        for (const item of extraResults) {
          const v = {
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
          if (!(await historyService.isFinished(v.id))) {
            queue.value.push(v)
          }
        }
      }

      // If still empty, we don't call _appendMore here to avoid recursion.
      // The user can try refreshing or it will happen on next swipe if possible.
      _preloadNextUrl()
    } else {
      queue.value.push(...filteredVideos)
    }
  }

  function next() {
    if (currentIndex.value < queue.value.length - 1) {
      currentIndex.value++
      // Preload more when near end (e.g., 2 items left)
      // Since batches are small (10), 5 might trigger it too early and too often
      if (currentIndex.value >= queue.value.length - 2) {
        _appendMore()
      }
      // Pre-resolve next video's URL
      _preloadNextUrl()
    }
  }

  function _preloadNextUrl() {
    const nextIdx = currentIndex.value + 1
    if (nextIdx < queue.value.length) {
      const nextVideo = queue.value[nextIdx]
      if (!nextVideo.url && nextVideo.source === 'moontv') {
        resolveVideoUrl(nextVideo).catch(() => {})
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
      const playbacks = (detail?.playbacks || []).map(p => ({
        name: p.name || '默认线路',
        episodes: p.episodes || [],
        episodeTitles: p.episodeTitles || p.episodes_titles || []
      }))

      // Fallback if playbacks is empty but episodes exist
      if (playbacks.length === 0 && episodes.length > 0) {
        playbacks.push({
          name: '默认线路',
          episodes,
          episodeTitles
        })
      }

      const proxyMode = detail?.proxyMode === true

      // Get first playback and its first episode URL
      const currentPlaybackIdx = 0
      const currentPlayback = playbacks[currentPlaybackIdx]
      const currentEpisodes = currentPlayback?.episodes || []
      const firstEp = currentEpisodes[0]
      let epUrl = typeof firstEp === 'string' ? firstEp : firstEp?.playUrl || firstEp?.url

      let finalUrl = null

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
          queue.value[idx].episodes = currentEpisodes
          queue.value[idx].episodeTitles = currentPlayback?.episodeTitles || []
          queue.value[idx].currentEpisode = 0
          queue.value[idx].moontvSource = video.moontvSource
          queue.value[idx].playbacks = playbacks
          queue.value[idx].currentPlaybackIdx = currentPlaybackIdx
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
    // Check if finished
    const finished = await historyService.isFinished(video.id)
    if (finished) {
      // If user explicitly clicks a search result that was finished, 
      // maybe we should let them play it anyway?
      // The requirement says "already finished not added to queue".
      // But for manual search, it's better to allow it.
      // However, to follow the requirement strictly, I should skip it.
      // Actually, "首页每次加载的视频随机，已经看完不在往队列中加" likely refers to the recommendation queue.
    }
    
    // Insert at current position + 1
    queue.value.splice(currentIndex.value + 1, 0, video)
    currentIndex.value++
  }

  async function playAllSearchResults() {
    if (searchResults.value.length === 0) return
    const videos = searchResults.value.map(item => ({
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
    }))
    
    // Filter finished for "Play All"
    const filtered = []
    for (const v of videos) {
      if (!(await historyService.isFinished(v.id))) {
        filtered.push(v)
      }
    }
    
    if (filtered.length > 0) {
      queue.value = filtered
      currentIndex.value = 0
    }
  }

  function loadCustomVideos() {
    queue.value = [...sourceStore.customVideos]
    currentIndex.value = 0
    error.value = null
  }

  async function _appendMore() {
    if (sourceStore.activeSource !== 'moontv' || loadingMore.value) return
    
    loadingMore.value = true
    try {
      recommendPage.value++
      await loadMoontvRecommend(recommendPage.value)
    } finally {
      loadingMore.value = false
    }
  }

  async function switchPlayback(video, playbackIdx) {
    if (!video.playbacks || !video.playbacks[playbackIdx]) return null
    
    try {
      const playback = video.playbacks[playbackIdx]
      const episodes = playback.episodes || []
      const episodeIdx = Math.min(video.currentEpisode || 0, episodes.length - 1)
      const ep = episodes[episodeIdx]
      const epUrl = typeof ep === 'string' ? ep : ep?.playUrl || ep?.url
      
      if (!epUrl) return null

      const finalUrl = await moontvApi.resolvePlayUrl(
        sourceStore.moontvUrl,
        sourceStore.moontvToken,
        epUrl,
        video.moontvSource,
        episodeIdx,
        video.proxyMode
      )

      const idx = queue.value.findIndex(v => v.id === video.id)
      if (idx !== -1) {
        queue.value[idx].url = finalUrl
        queue.value[idx].rawEpisodeUrl = epUrl
        queue.value[idx].episodes = episodes
        queue.value[idx].episodeTitles = playback.episodeTitles || []
        queue.value[idx].currentPlaybackIdx = playbackIdx
        queue.value[idx].currentEpisode = episodeIdx
      }
      return finalUrl
    } catch (e) {
      console.error('[switchPlayback failed]', e)
      return null
    }
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
    switchPlayback,
    search,
    playSearchResult,
    playAllSearchResults,
  }
})
