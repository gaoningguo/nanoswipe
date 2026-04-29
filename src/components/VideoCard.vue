<template>
  <div
    class="video-card"
    :class="{ active: isActive }"
  >
    <!-- Artplayer container -->
    <div 
      ref="videoWrapRef" 
      class="video-wrap"
    ></div>
    <!-- Overlay for click events -->
    <div 
      class="video-click-overlay" 
      @click="onVideoClick"
      @mousedown="onMouseDown"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEnd"
    ></div>

    <!-- Cover image while loading -->
    <div class="video-cover" v-if="showCover">
      <img v-if="video.cover" :src="video.cover" alt="封面" class="cover-img" />
      <div v-else class="cover-placeholder" />
    </div>

    <!-- Error state -->
    <Transition name="fade">
      <div class="error-overlay" v-if="videoError && isActive">
        <div class="error-icon">⚠️</div>
        <p>{{ errorMsg || '视频加载失败' }}</p>
        <p v-if="autoSkipCountdown > 0" class="skip-countdown">{{ autoSkipCountdown }}s 后自动跳过...</p>
        <div class="error-btns">
          <button class="ns-btn ns-btn-ghost retry-btn" @click="retry">重试</button>
          <button 
            v-if="video.playbacks?.length > 1"
            class="ns-btn ns-btn-ghost retry-btn" 
            @click="tryAutoSwitchSource"
          >换源</button>
          <button class="ns-btn ns-btn-primary retry-btn" @click="playerStore.next()">跳过</button>
        </div>
      </div>
    </Transition>

    <!-- Play / Pause flash indicator removed - using Artplayer default state button -->

    <!-- Dynamic Frame Preview Bubble -->
    <div 
      v-show="showPreview" 
      class="progress-preview" 
      :style="{ left: previewPos + 'px' }"
    >
      <div class="preview-frame">
        <canvas ref="previewCanvasRef" class="preview-canvas"></canvas>
        <video 
          ref="previewVideoRef" 
          class="preview-video-hidden" 
          muted 
          playsinline
          preload="auto"
        ></video>
        <div v-if="isPreviewLoading" class="preview-loading">
          <div class="mini-spinner"></div>
        </div>
      </div>
      <div class="preview-time">{{ formatTime(previewTime) }}</div>
    </div>

    <!-- Progress bar overlay (Video info only) -->
    <div class="bottom-overlay">
      <!-- Video info -->
      <div class="video-info">
        <div class="video-meta">
          <span class="source-badge">{{ video.sourceName || video.source }}</span>
          <span v-if="video.year" class="year-badge">{{ video.year }}</span>
          <button class="seek-btn" @click.stop="seek(-10)">⏪ 10s</button>
          <button class="seek-btn" @click.stop="seek(10)">10s ⏩</button>
        </div>
        <h2 class="video-title">{{ video.title }}</h2>
        <p v-if="video.desc" class="video-desc">{{ video.desc }}</p>
        <!-- Episode selector for MoonTV -->
        <div class="episode-row" v-if="video.episodeTitles?.length > 1">
          <span class="ep-label">选集：</span>
          <div class="ep-list">
            <button
              v-for="(ep, i) in video.episodeTitles.slice(0, 10)"
              :key="i"
              class="ep-btn"
              :class="{ active: video.currentEpisode === i }"
              @click.stop="switchEpisode(i)"
            >{{ ep }}</button>
            <span v-if="video.episodeTitles.length > 10" class="ep-more">
              +{{ video.episodeTitles.length - 10 }}集
            </span>
          </div>
        </div>

        <!-- Playback Source selector for MoonTV -->
        <div class="episode-row" v-if="video.playbacks?.length > 1">
          <span class="ep-label">线路：</span>
          <div class="ep-list">
            <button
              v-for="(pb, i) in video.playbacks"
              :key="i"
              class="ep-btn"
              :class="{ active: video.currentPlaybackIdx === i }"
              @click.stop="tryManualSwitchSource(i)"
            >{{ pb.name }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right action bar (Empty/Hidden) -->
    <div class="right-bar">
    </div>

    <!-- Artplayer Global Styles Override -->
    <component is="style">
      .video-card .artplayer-app {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
      }
      .video-card .art-video-player {
        background: #000 !important;
      }
      .video-card .art-control-progress .art-progress-played {
        background: linear-gradient(90deg, #FF385C, #FF6B35) !important;
      }
      .video-card .art-control-progress .art-progress-indicator {
        background: #FF385C !important;
        box-shadow: 0 0 5px #FF385C !important;
      }
      /* Ensure Artplayer loading spinner matches theme */
      .video-card .art-state .art-loading svg path {
        fill: #FF385C !important;
      }
      /* Hide default context menu for a cleaner look */
      .art-contextmenu {
        display: none !important;
      }
    /* Adjust bottom control bar for immersive feel */
    .video-card .art-controls {
      background-image: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.3) 20%, rgba(0, 0, 0, 0.6) 100%) !important;
      padding-bottom: env(safe-area-inset-bottom, 0px) !important;
      z-index: 20 !important; /* 提升层级，确保在点击遮罩层之上 */
    }
    /* Ensure progress bar is visible and easy to touch */
    .video-card .art-control-progress {
      height: 4px !important;
      bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
      z-index: 25 !important; /* 同步提升层级 */
    }
    /* Ensure playback state button is also clickable */
    .video-card .art-state {
      z-index: 21 !important;
    }
      .video-card .art-control-progress:hover {
        height: 6px !important;
      }
    </component>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import { usePlayerStore } from '../stores/player.js'
import { useSourceStore } from '../stores/source.js'
import { historyService } from '../services/historyService.js'

const props = defineProps({
  video: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  isNear: { type: Boolean, default: false },
})

const emit = defineEmits(['ended'])
const playerStore = usePlayerStore()
const sourceStore = useSourceStore()

const videoWrapRef = ref(null)
const isPlaying = ref(false)
const isBuffering = ref(false)
const showCover = ref(true)
const videoError = ref(false)
const errorMsg = ref('')
const autoSkipCountdown = ref(0)
const previewVideoRef = ref(null)
const previewCanvasRef = ref(null)
const isPreviewLoading = ref(false)
const showPreview = ref(false)
const previewTime = ref(0)
const previewPos = ref(0)
let player = null
let previewHls = null
let autoSkipTimer = null
let lastClickTime = 0
let longPressTimer = null
let isLongPressing = ref(false)
let touchStartX = 0
let touchStartY = 0
let isDraggingProgress = ref(false)
let dragStartTime = 0
let dragStartProgress = 0

// --- Lifecycle ---
watch(() => props.video.id, () => {
  loadAndPlay()
})

onMounted(() => {
  initPlayer()
  if (props.isActive || props.isNear) {
    loadAndPlay()
  }
})

onUnmounted(() => {
  destroyPlayer()
  destroyPreviewPlayer()
  clearInterval(autoSkipTimer)
})

function initPlayer() {
  if (!videoWrapRef.value) return
  
  player = new Artplayer({
    container: videoWrapRef.value,
    url: '', // Load later
    autoplay: true,
    autoSize: false,
    autoMini: false,
    muted: playerStore.isMuted,
    lockTime: 0.1, // 增加一个小延迟，有时能帮助移动端更好的初始化
    clickConfig: {
      show: false,
      stop: false,
    },
    state: true, // 启用默认的中间状态按钮（播放/暂停）
    loop: playerStore.isLooping,
    playbackRate: true,
    aspectRatio: false,
    setting: true,
    pip: true,
    fullscreen: true,
    fullscreenWeb: false,
    playsInline: true,
    controls: [
      {
        name: 'playbackSpeed',
        position: 'right',
        html: '倍速',
        selector: [
          { html: '0.5x', value: 0.5 },
          { html: '0.75x', value: 0.75 },
          { default: true, html: '1.0x', value: 1.0 },
          { html: '1.25x', value: 1.25 },
          { html: '1.5x', value: 1.5 },
          { html: '2.0x', value: 2.0 },
        ],
        onSelect: (item) => {
          player.playbackRate = item.value
          return item.html
        },
      },
    ],
    customType: {
      m3u8: function (video, url, art) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 60,
            xhrSetup: (xhr, requestUrl) => {
              if (sourceStore.moontvUrl) {
                try {
                  const moontvOrigin = new URL(sourceStore.moontvUrl).origin
                  if (requestUrl.startsWith(moontvOrigin)) {
                    const proxyUrl = '/moonapi' + requestUrl.slice(moontvOrigin.length)
                    xhr.open('GET', proxyUrl, true)
                  }
                } catch (e) {}
              }
            }
          })
          hls.loadSource(url)
          hls.attachMedia(video)
          player.on('destroy', () => hls.destroy())
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url
        }
      },
    },
    theme: '#FF385C',
  })

  // Hook into Artplayer's progress bar for dynamic preview
  player.on('ready', () => {
    const progress = player.template.$progress
    if (progress) {
      const handleMove = (e) => {
        if (!props.isActive || !player.duration) return
        
        const rect = progress.getBoundingClientRect()
        let clientX = e.clientX
        if (e.touches) clientX = e.touches[0].clientX
        
        let pos = (clientX - rect.left) / rect.width
        pos = Math.max(0, Math.min(1, pos))
        
        previewTime.value = pos * player.duration
        const cardRect = videoWrapRef.value.getBoundingClientRect()
        let xPos = clientX - cardRect.left
        
        const halfWidth = 75
        if (xPos < halfWidth) xPos = halfWidth
        if (xPos > cardRect.width - halfWidth) xPos = cardRect.width - halfWidth
        
        previewPos.value = xPos
        showPreview.value = true
        
        if (!window._previewSeeking) {
          window._previewSeeking = true
          requestAnimationFrame(() => {
            updatePreviewFrame(previewTime.value)
            setTimeout(() => { window._previewSeeking = false }, 50)
          })
        }
      }

      progress.addEventListener('mousemove', handleMove)
      progress.addEventListener('mouseenter', () => { showPreview.value = true })
      progress.addEventListener('mouseleave', () => { showPreview.value = false })
      progress.addEventListener('touchstart', (e) => { 
        handleMove(e)
        showPreview.value = true 
      }, { passive: true })
      progress.addEventListener('touchmove', handleMove, { passive: true })
      progress.addEventListener('touchend', () => { showPreview.value = false })
    }
  })

  // 同步静音状态到 store，避免切换视频时状态丢失
  player.on('video:volumechange', () => {
    playerStore.isMuted = player.muted
  })

  // 监听播放状态，确保 isPlaying 响应式变量准确
  player.on('play', () => { 
    isPlaying.value = true
    showCover.value = false
    isBuffering.value = false
  })
  player.on('pause', () => { 
    isPlaying.value = false 
  })

  player.on('video:timeupdate', () => {
    if (player.duration > 0) {
      if (props.isActive && Math.floor(player.currentTime) % 5 === 0) {
        historyService.saveProgress(props.video, player.currentTime, player.duration)
      }
    }
  })
  player.on('video:ended', () => {
    historyService.saveProgress(props.video, player.duration, player.duration)
    
    // Auto play next episode if available
    const video = props.video
    if (video.episodeTitles?.length > 1 && typeof video.currentEpisode === 'number') {
      const nextIdx = video.currentEpisode + 1
      if (nextIdx < video.episodeTitles.length) {
        switchEpisode(nextIdx)
        return
      }
    }

    if (!playerStore.isLooping) emit('ended')
  })
  player.on('video:waiting', () => { if (props.isActive) isBuffering.value = true })
  player.on('video:canplay', () => { isBuffering.value = false })
  player.on('error', (err) => {
    console.error('[Artplayer ERROR]', err)
    errorMsg.value = '视频加载失败'
    videoError.value = true
    isBuffering.value = false
    showCover.value = false
  })

  // TikTok style: Double click to like (or seek as before), Single click to play/pause
  // Artplayer handles some gestures by default, let's customize
}

function destroyPlayer() {
  if (player && typeof player.destroy === 'function') {
    player.destroy(true)
    player = null
  }
}

function destroyPreviewPlayer() {
  if (previewHls) {
    previewHls.destroy()
    previewHls = null
  }
  if (previewVideoRef.value) {
    previewVideoRef.value.src = ''
    previewVideoRef.value.load()
  }
}

// --- Watchers ---
watch(() => [props.isActive, props.isNear], async ([active, near], [oldActive, oldNear]) => {
  if (active) {
    // 如果是从非 active 变 active，或者是初始加载
    if (!oldActive) {
      await loadAndPlay()
    } else {
      player?.play()
    }
  } else if (near) {
    // 预加载逻辑
    if (!player) {
      await loadAndPlay()
    }
    player?.pause()
  } else {
    // 离得远了就释放部分资源（或者直接暂停）
    player?.pause()
    isPlaying.value = false
  }
}, { immediate: true })

watch(() => playerStore.isMuted, (muted) => {
  if (player) player.muted = muted
})

watch(() => playerStore.isLooping, (loop) => {
  if (player) player.loop = loop
})

// --- Methods ---
async function loadAndPlay() {
  // 确保 player 实例已创建，如果没创建则初始化
  if (!player) {
    initPlayer()
  }
  if (!player) return
  
  videoError.value = false
  errorMsg.value = ''
  if (props.isActive) isBuffering.value = true
  showCover.value = true

  let url = props.video.url
  if (!url && props.video.source === 'moontv') {
    url = await playerStore.resolveVideoUrl(props.video)
  }
  
  if (!url) {
    if (props.isActive) {
      isBuffering.value = false
      videoError.value = true
    }
    return
  }

  try {
    const isHls = /\.m3u8?(\?|$)/i.test(url) || url.includes('/proxy/vod/m3u8')
    
    player.switch = url
    
    initPreviewPlayer(url)
    
    if (props.isActive) {
      const progress = await historyService.getProgress(props.video.id)
      if (progress && progress.currentTime > 0 && !progress.isFinished) {
        player.currentTime = progress.currentTime
      }
      // 确保静音状态与 store 同步，这有助于绕过自动播放限制
      player.muted = playerStore.isMuted
      player.play().catch(err => {
        console.warn('Autoplay failed, user interaction might be needed:', err)
      })
    } else if (props.isNear) {
      player.pause()
    }
  } catch (e) {
    console.error('Playback error:', e)
    if (props.isActive) videoError.value = true
  }
}

async function initPreviewPlayer(url) {
  destroyPreviewPlayer()
  await nextTick()
  if (!previewVideoRef.value) return

  const isHls = /\.m3u8?(\?|$)/i.test(url) || url.includes('/proxy/vod/m3u8')
  
  const hlsConfig = {
    enableWorker: true,
    autoStartLoad: true,
    maxBufferLength: 1,
    maxMaxBufferLength: 2,
    capLevelToPlayerSize: true, // 强制最低画质
    fragLoadingMaxRetry: 1,
    levelLoadingMaxRetry: 1,
    startLevel: 0, // 初始加载最低画质
    xhrSetup: (xhr, requestUrl) => {
      if (sourceStore.moontvUrl) {
        try {
          const moontvOrigin = new URL(sourceStore.moontvUrl).origin
          if (requestUrl.startsWith(moontvOrigin)) {
            const proxyUrl = '/moonapi' + requestUrl.slice(moontvOrigin.length)
            xhr.open('GET', proxyUrl, true)
          }
        } catch (e) {}
      }
    }
  }

  if (isHls && Hls.isSupported()) {
    previewHls = new Hls(hlsConfig)
    previewHls.loadSource(url)
    previewHls.attachMedia(previewVideoRef.value)
    
    previewHls.on(Hls.Events.MANIFEST_PARSED, () => {
      // 设置最低画质层
      if (previewHls.levels.length > 0) {
        previewHls.currentLevel = 0
      }
      previewVideoRef.value?.play().catch(() => {})
    })
  } else {
    previewVideoRef.value.src = url
    previewVideoRef.value.load()
    previewVideoRef.value.play().catch(() => {})
  }

  // 监听 seeked 事件来绘制 Canvas
  previewVideoRef.value.addEventListener('seeked', drawPreviewFrame)
  previewVideoRef.value.addEventListener('waiting', () => { isPreviewLoading.value = true })
  previewVideoRef.value.addEventListener('canplay', () => { isPreviewLoading.value = false })
}

function drawPreviewFrame() {
  if (!previewVideoRef.value || !previewCanvasRef.value) return
  const video = previewVideoRef.value
  const canvas = previewCanvasRef.value
  const ctx = canvas.getContext('2d', { alpha: false })
  
  // 设置 canvas 尺寸（保持 16:9）
  if (canvas.width !== 320) {
    canvas.width = 320
    canvas.height = 180
  }

  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    isPreviewLoading.value = false
  } catch (e) {}
}

function updatePreviewFrame(time) {
  if (previewVideoRef.value && !isNaN(time)) {
    isPreviewLoading.value = true
    // 限制跳转频率已经在 handleMove 中处理
    previewVideoRef.value.currentTime = time
  }
}

function onMouseDown(e) {
  if (e.button !== 0) return // Only left click
  startLongPress()
  window.addEventListener('mouseup', stopLongPress, { once: true })
}

function onTouchStart(e) {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
  isDraggingProgress.value = false
  dragStartTime = 0
  if (player) dragStartProgress = player.currentTime
  
  // 如果当前是激活状态且未播放，尝试播放（处理滑动后的播放行为）
  if (props.isActive && player && !isPlaying.value) {
    player.play().catch(() => {})
  }
  
  startLongPress()
}

function onTouchMove(e) {
  if (isLongPressing.value) return
  
  const touchX = e.touches[0].clientX
  const touchY = e.touches[0].clientY
  const dx = touchX - touchStartX
  const dy = touchY - touchStartY

  // 如果水平位移大于垂直位移，且超过阈值，判定为进度拖动
  if (!isDraggingProgress.value && Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy)) {
    isDraggingProgress.value = true
    clearTimeout(longPressTimer) // 拖动时取消长按
  }

  if (isDraggingProgress.value && player && player.duration) {
    if (e.cancelable) e.preventDefault() // 只有在可取消时才调用
    const scrollScale = 0.2 // 调节灵敏度
    const newTime = Math.max(0, Math.min(player.duration, dragStartProgress + dx * scrollScale))
    player.currentTime = newTime
    
    // 显示简单的进度提示（复用 Artplayer 的通知机制或后续添加 UI）
    player.notice.show = `${dx > 0 ? '▶▶' : '◀◀'} ${formatTime(newTime)} / ${formatTime(player.duration)}`
  }
}

function onTouchEnd() {
  stopLongPress()
  setTimeout(() => {
    isDraggingProgress.value = false
  }, 100)
}

function startLongPress() {
  clearTimeout(longPressTimer)
  longPressTimer = setTimeout(() => {
    if (player && isPlaying.value) {
      isLongPressing.value = true
      player.playbackRate = 2.0
    }
  }, 500)
}

function stopLongPress() {
  clearTimeout(longPressTimer)
  if (isLongPressing.value) {
    isLongPressing.value = false
    if (player) {
      player.playbackRate = 1.0
    }
  }
}

function formatTime(seconds) {
  if (isNaN(seconds)) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function togglePlay() {
  if (!props.isActive || !player) return
  player.toggle()
}

function onVideoClick(e) {
  if (isLongPressing.value || isDraggingProgress.value) return
  const now = Date.now()
  const delta = now - lastClickTime
  
  // 如果是移动端，检查是否发生了明显的位移（防止滑动时触发点击）
  if (e.type === 'click' && e.pointerType === 'touch') {
    // 这种情况下 e 可能不包含完整的 touch 坐标，但在 Vue event 中 e 是原生的
  }

  if (delta < 300) {
    // Double click
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 2) {
      seek(-10)
    } else {
      seek(10)
    }
    lastClickTime = 0
  } else {
    lastClickTime = now
    setTimeout(() => {
      if (lastClickTime === now) togglePlay()
    }, 300)
  }
}

function seek(seconds) {
  if (!player) return
  player.currentTime += seconds
}


async function switchEpisode(idx) {
  const video = props.video
  if (!video.episodes?.[idx]) return
  const ep = video.episodes[idx]
  const rawUrl = typeof ep === 'string' ? ep : ep.playUrl || ep.url

  let finalUrl = rawUrl
  if (rawUrl && video.source === 'moontv') {
    const { moontvApi } = await import('../services/moontvApi.js')
    finalUrl = await moontvApi.resolvePlayUrl(
      sourceStore.moontvUrl,
      sourceStore.moontvToken,
      rawUrl,
      video.moontvSource,
      idx,
      video.proxyMode || false
    )
  }

  video.currentEpisode = idx
  video.url = finalUrl
  await loadAndPlay()
}

async function tryAutoSwitchSource() {
  const video = props.video
  if (!video.playbacks || video.playbacks.length <= 1) return
  let nextIdx = ((video.currentPlaybackIdx || 0) + 1) % video.playbacks.length
  if (nextIdx === (video.currentPlaybackIdx || 0)) return
  await playerStore.switchPlayback(video, nextIdx)
  await loadAndPlay()
}

async function tryManualSwitchSource(idx) {
  if (props.video.currentPlaybackIdx === idx) return
  await playerStore.switchPlayback(props.video, idx)
  await loadAndPlay()
}


function retry() {
  videoError.value = false
  errorMsg.value = ''
  if (props.video.source === 'moontv') props.video.url = null
  loadAndPlay()
}
</script>

<style scoped>
.video-card {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

.video-wrap {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.video-click-overlay {
  position: absolute;
  inset: 0;
  z-index: 2; /* 位于视频容器之上 */
  /* 确保这个层能捕获到触摸事件，同时不影响下层的控制条交互（控制条 z-index 已调高） */
}

/* 覆盖 Artplayer 的默认手势层，防止冲突 */
:deep(.art-mask) {
  z-index: 1 !important;
}

.video-cover {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: #111;
}
.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.7;
}
.cover-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1a1a1a, #0a0a0a);
}

/* Loading removed - using Artplayer native loading */

/* Error */
.error-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0,0,0,0.7);
  color: white;
}
.error-icon { font-size: 48px; }
.skip-countdown {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  margin-top: -4px;
}
.error-btns {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.retry-btn { min-width: 80px; }


/* Bottom overlay */
.bottom-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
  padding: 0 16px;
  /* Add margin to avoid overlapping with player controls */
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
  pointer-events: none; /* Let clicks pass through to player */
}

.video-info {
  padding-bottom: 12px;
  pointer-events: auto; /* Re-enable for buttons/episodes */
  max-width: 85%; /* 避免遮挡右侧操作栏 */
}

.video-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap; /* 移动端支持换行 */
}

.source-badge, .year-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.source-badge {
  background: linear-gradient(135deg, #FF385C, #FF6B35);
  color: white;
}

.year-badge {
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.9);
  border: 1px solid rgba(255,255,255,0.2);
}

.seek-btn {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(255,255,255,0.1);
  color: white;
  border: 1px solid rgba(255,255,255,0.2);
  cursor: pointer;
  transition: background 0.2s;
}

.seek-btn:hover {
  background: rgba(255,255,255,0.2);
}

.video-title {
  font-size: 16px;
  font-weight: 700;
  color: white;
  line-height: 1.3;
  margin-bottom: 4px;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.video-desc {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  margin-bottom: 8px;
}

/* Episodes */
.episode-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  margin-bottom: 2px;
  flex-wrap: nowrap;
  overflow: hidden;
}

.ep-label {
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  flex-shrink: 0;
}

.ep-list {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
  -webkit-overflow-scrolling: touch;
}

.ep-list::-webkit-scrollbar { display: none; }

.ep-btn {
  padding: 2px 10px;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.85);
  white-space: nowrap;
  border: 1px solid transparent;
  transition: all 0.15s;
  flex-shrink: 0;
}

.ep-btn.active {
  background: linear-gradient(135deg, #FF385C, #FF6B35);
  color: white;
  border-color: transparent;
}

.ep-more {
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  flex-shrink: 0;
  align-self: center;
}

/* Progress bar */
.progress-preview {
  position: absolute;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px)); /* 位于控制栏上方 */
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 1000;
  transition: opacity 0.2s;
}

.preview-frame {
  width: 140px; /* 移动端减小一点 */
  aspect-ratio: 16/9;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.preview-canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.preview-video-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.preview-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}

.mini-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #FF385C;
  border-radius: 50%;
  animation: ns-spin 0.8s linear infinite;
}

@keyframes ns-spin {
  to { transform: rotate(360deg); }
}

.preview-time {
  font-size: 11px;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.progress-preview::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid rgba(0, 0, 0, 0.9);
}

/* Right action bar */
.right-bar {
  position: absolute;
  right: 8px;
  bottom: 120px; /* 降低位置，防止被全屏/倍速菜单遮挡或离中心太远 */
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  pointer-events: auto;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.1);
  transition: transform 0.1s;
}

.action-btn:active {
  transform: scale(0.9);
  background: rgba(255,56,92,0.4);
}

.action-icon {
  font-size: 18px;
}

/* 移动端媒体查询优化 */
@media (max-width: 600px) {
  .right-bar {
    right: 8px;
    bottom: 80px;
  }
  .action-btn {
    width: 40px;
    height: 40px;
  }
  .video-title {
    font-size: 15px;
  }
  .bottom-overlay {
    padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  }
}

.speed-text {
  font-size: 12px;
  font-weight: 700;
  color: white;
}

.icon-active {
  filter: drop-shadow(0 0 6px #FF385C);
}

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

</style>
