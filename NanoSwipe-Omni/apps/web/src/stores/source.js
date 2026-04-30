import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { readJSONStorage, readStorage, removeStorage, writeJSONStorage, writeStorage } from '@nanoswipe/shared'

// Default demo videos to show on first run
const DEMO_VIDEOS = [
  {
    id: 'demo-1',
    title: '欢迎使用 NanoSwipe 🎬',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    cover: '',
    source: 'custom',
    sourceName: '演示内容',
    desc: '向上滑动切换视频，在设置中添加你的视频源',
    type: 'hls',
  },
  {
    id: 'demo-2',
    title: 'Big Buck Bunny',
    url: 'https://test-streams.mux.dev/test_001/stream.m3u8',
    cover: 'https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217',
    source: 'custom',
    sourceName: '演示内容',
    desc: '经典开源动画片段',
    type: 'hls',
  },
]

export const useSourceStore = defineStore('source', () => {
  // MoonTV config
  const moontvUrl = ref(readStorage('moontvUrl', 'https://tv.gaoningguo.eu.org'))
  const moontvToken = ref(readStorage('moontvToken', ''))
  const moontvEnabled = ref(readStorage('moontvEnabled', 'false') === 'true')

  // Custom videos list (stored as JSON)
  const customVideos = ref(readJSONStorage('customVideos', null) || DEMO_VIDEOS)

  // Active source type: 'custom' | 'moontv'
  const activeSource = ref(readStorage('activeSource', 'custom'))

  // Source name labels
  const sourceName = computed(() => {
    if (activeSource.value === 'moontv') return 'MoonTVPlus'
    return '自定义视频'
  })

  function saveMoontvConfig(url, token) {
    moontvUrl.value = url
    moontvToken.value = token
    moontvEnabled.value = true
    writeStorage('moontvUrl', url)
    writeStorage('moontvToken', token)
    writeStorage('moontvEnabled', 'true')
  }

  function clearMoontvToken() {
    moontvToken.value = ''
    moontvEnabled.value = false
    removeStorage('moontvToken')
    writeStorage('moontvEnabled', 'false')
  }

  function setActiveSource(src) {
    activeSource.value = src
    writeStorage('activeSource', src)
  }

  function addCustomVideo(video) {
    const v = {
      id: 'custom-' + Date.now(),
      title: video.title || '未命名视频',
      url: video.url,
      cover: video.cover || '',
      source: 'custom',
      sourceName: '自定义',
      desc: video.desc || '',
      type: video.url.includes('.m3u8') ? 'hls' : 'mp4',
    }
    customVideos.value.unshift(v)
    _saveCustomVideos()
    return v
  }

  function removeCustomVideo(id) {
    customVideos.value = customVideos.value.filter(v => v.id !== id)
    _saveCustomVideos()
  }

  function _saveCustomVideos() {
    writeJSONStorage('customVideos', customVideos.value)
  }

  return {
    moontvUrl,
    moontvToken,
    moontvEnabled,
    customVideos,
    activeSource,
    sourceName,
    saveMoontvConfig,
    clearMoontvToken,
    setActiveSource,
    addCustomVideo,
    removeCustomVideo,
  }
})
