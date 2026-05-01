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
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
      @contextmenu.prevent
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
    <div class="bottom-overlay" :class="{ 'overlay-hide': !showControls }">
      <!-- Video info -->
      <div class="video-info">
        <div class="video-meta">
          <span class="source-badge">{{ video.sourceName || video.source }}</span>
          <span v-if="video.year" class="year-badge">{{ video.year }}</span>
<!--          <button class="seek-btn" @click.stop="seek(-10)">⏪ 10s</button>-->
<!--          <button class="seek-btn" @click.stop="seek(10)">10s ⏩</button>-->
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

    <!-- Right action bar (Buttons) -->
    <div class="right-bar">
      <!-- Mute/Unmute toggle -->
      <button class="action-btn" @click.stop="toggleMute">
        <span class="action-icon">{{ playerStore.isMuted ? '🔇' : '🔊' }}</span>
      </button>
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
      background: none !important; /* 移除默认渐变，避免与 bottom-overlay 的渐变重合导致过暗或遮挡 */
      padding-bottom: env(safe-area-inset-bottom, 0px) !important;
      z-index: 20 !important; /* 提升层级，确保在点击遮罩层之上 */
    }
    /* Ensure progress bar is visible and easy to touch */
    .video-card .art-control-progress {
      height: 4px !important;
      bottom: calc(4px + env(safe-area-inset-bottom, 0px)) !important;
      z-index: 25 !important; /* 同步提升层级 */
    }
    /* Ensure playback state button is also clickable */
    .video-card .art-state {
      z-index: 21 !important;
    }
    /* 强制显示控制栏和进度条，确保在播放过程中始终可见 */
    .video-card .art-controls,
    .video-card .art-control-progress {
      display: flex !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    /* Bottom overlay */
    .video-card .bottom-overlay {
      z-index: 30 !important;
      display: block !important;
      opacity: 1 !important;
      visibility: visible !important;
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
import { detectPlatform, makeHlsUrlRewriter, moontvApi } from '@nanoswipe/shared'
import { createHlsLoader } from '../services/hlsLoader.js'

const platformContext = detectPlatform()
const isNativeBuild = platformContext.isTauri || platformContext.isCapacitor

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
const showControls = ref(true)
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
let isDraggingVertical = ref(false)
let verticalDragSide = ref('') // 'left' for brightness, 'right' for volume
let dragStartTime = 0
let dragStartProgress = 0
let startVolume = 0
let startBrightness = 1

function getMoonTvTarget() {
  try {
    const target = new URL(sourceStore.moontvUrl)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return ''
    return target.origin
  } catch {
    return ''
  }
}

// Artplayer 通过 URL 扩展名匹配 customType 的 key。
// MoonTV 代理 URL（如 /api/proxy/vod/m3u8?url=...）路径里没有 .m3u8 扩展名，
// 不显式声明 type 时 hls.js 不会被触发，部分视频因此无法播放。
function getVideoType(url) {
  if (!url) return ''
  const urlPath = url.split('?')[0]
  if (/\.m3u8?$/i.test(urlPath)) return ''
  if (url.includes('/api/proxy/vod/m3u8') || url.includes('/api/proxy-m3u8')) return 'm3u8'
  return ''
}

function setupMoonTvHlsRequest(xhr, requestUrl) {
  let proxiedUrl = null
  const proxyUrl = makeHlsUrlRewriter(sourceStore.moontvUrl)(requestUrl)
  if (proxyUrl) {
    proxiedUrl = proxyUrl
    xhr.open('GET', proxyUrl, true)
  }

  const targetUrl = proxiedUrl || requestUrl
  if (typeof targetUrl === 'string' && targetUrl.includes('/moonapi/')) {
    if (!proxiedUrl) xhr.open('GET', targetUrl, true)
    const target = getMoonTvTarget()
    if (target) xhr.setRequestHeader('X-NanoSwipe-MoonTV-Target', target)
    const authToken = moontvApi.resolveAuthToken(sourceStore.moontvToken)
    if (authToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`)
    }
  }
}

const AdapterHlsLoader = createHlsLoader({
  getMoontvUrl: () => sourceStore.moontvUrl,
  getMoontvToken: () => sourceStore.moontvToken,
  urlRewriter: (url) => makeHlsUrlRewriter(sourceStore.moontvUrl)(url),
})

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
    autoplay: props.isActive,
    autoSize: false,
    autoMini: false,
    muted: props.isActive ? playerStore.isMuted : true,
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
            lowLatencyMode: false, // 禁用低延迟模式以换取更稳定的缓冲区
            backBufferLength: 90, // 增加回退缓冲区，滑动更顺滑
            maxBufferLength: 60, // 增加前向缓冲区，从 30s 提升到 60s
            maxMaxBufferLength: 120, // 最大缓冲区增加到 120s
            maxBufferSize: 120 * 1024 * 1024, // 限制缓冲区大小为 120MB
            maxBufferHole: 0.5,
            highBufferWatchdogPeriod: 1, // 更频繁的监控缓冲区空洞
            nudgeOffset: 0.2, // 遇到卡顿时跳过更大偏移量以尝试恢复
            nudgeMaxRetries: 10,
            fragLoadingTimeOut: 15000, // 分片加载超时 15s
            manifestLoadingTimeOut: 15000,
            abrEwmaDefaultEstimate: 1000000, // 默认带宽估计调高一点，加快初始画质选择
            appendErrorMaxRetry: 10, // 增加错误重试
            fragLoadingMaxRetry: 5,
            levelLoadingMaxRetry: 5,
            manifestLoadingMaxRetry: 5,
            xhrSetup: setupMoonTvHlsRequest,
            loader: AdapterHlsLoader,
          })
          hls.loadSource(url)
          hls.attachMedia(video)
          hls.on(Hls.Events.ERROR, (event, data) => {
            console.warn('[HLS error]', data?.type, data?.details, {
              fatal: data?.fatal,
              url: data?.url,
              response: data?.response,
              reason: data?.reason,
            })
            if (data?.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad()
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError()
              }
            }
          })
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
    // 强制执行一次静音状态检查，非激活视频必须静音
    if (!props.isActive) {
      player.muted = true
      player.pause()
    }
    const progress = player.template.$progress
    if (progress) {
      const handleMove = (e) => {
        if (!props.isActive || !player.duration) return
        
        const rect = progress.getBoundingClientRect()
        let clientX = e.clientX
        if (e.touches) clientX = e.touches[0].clientX
        
        let pos = (clientX - rect.left) / rect.width
        pos = Math.max(0, Math.min(1, pos))
        
        const targetTime = pos * player.duration
        previewTime.value = targetTime
        const cardRect = videoWrapRef.value.getBoundingClientRect()
        let xPos = clientX - cardRect.left
        
        const halfWidth = 75
        if (xPos < halfWidth) xPos = halfWidth
        if (xPos > cardRect.width - halfWidth) xPos = cardRect.width - halfWidth
        
        previewPos.value = xPos
        showPreview.value = true
        
        // 增加防抖判定：只有在时间变化超过 0.5 秒或上次请求已完成时才发起新请求
        const timeDiff = Math.abs(targetTime - (window._lastPreviewReqTime || 0))
        if (!window._previewSeeking && timeDiff > 0.5) {
          window._previewSeeking = true
          window._lastPreviewReqTime = targetTime
          requestAnimationFrame(() => {
            updatePreviewFrame(targetTime)
            setTimeout(() => { window._previewSeeking = false }, 50) // 略微增加间隔，保护解码器
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
    if (props.isActive && player.muted !== playerStore.isMuted) {
      playerStore.isMuted = player.muted
      if (!player.muted && player.volume === 0) {
        player.volume = 0.7 // 如果取消静音但音量为0，默认给个音量
      }
    }
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
      // 降低保存频率，每 2 秒尝试保存一次
      const current = Math.floor(player.currentTime)
      // 使用变量记录上次保存的时间点，避免一秒内多次触发
      if (props.isActive && current > 0 && current % 2 === 0 && player._lastSaveTime !== current) {
        player._lastSaveTime = current
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

  player.on('control', (state) => {
    showControls.value = state
  })

  player.on('error', (err) => {
    console.error('[Artplayer ERROR]', err)
    errorMsg.value = '视频加载失败'
    videoError.value = true
    isBuffering.value = false
    showCover.value = false
  })

  // TikTok style: Double click to like (or seek as before), Single click to play/pause
  // Artplayer handles some gestures by default, let's customize

  // 监听缓冲和播放状态
  player.on('video:waiting', () => {
    isBuffering.value = true
  })
  player.on('video:playing', () => {
    isBuffering.value = false
    showCover.value = false
  })
  player.on('video:canplay', () => {
    isBuffering.value = false
  })
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
    if (!oldActive) {
      await loadAndPlay()
    } else {
      if (player) {
        // 从预加载转为激活：恢复声音设置并确保播放
        player.muted = playerStore.isMuted
        player.play().catch(() => {})
      }
    }
  } else {
    // 只要不是 active，就必须暂停和静音
    if (player) {
      player.pause()
      player.muted = true
    }
    isPlaying.value = false
    
    // 如果进入预加载范围（isNear）且尚未加载过，则进行异步预取
    if (near && !oldNear) {
      await loadAndPlay()
    }
  }
}, { immediate: true })

watch(() => playerStore.isMuted, (muted) => {
  if (player && props.isActive) player.muted = muted
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

  // 确保静音状态与 store 同步
  player.muted = playerStore.isMuted
  
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

    // 显式设置类型：代理 URL 路径无 .m3u8 后缀时，
    // 强制 Artplayer 走 customType.m3u8 -> hls.js，避免回退到原生 <video src> 播放失败
    player.option.type = getVideoType(url)
    player.switch = url
    
  if (props.isActive || props.isNear) {
    initPreviewPlayer(url)
  }
    
  if (props.isActive) {
      // 增加加载超时处理
      const loadingTimeout = setTimeout(() => {
        if (isBuffering.value && props.isActive) {
          console.warn('Loading timeout, trying to nudge player...')
          player.currentTime += 0.1 // 尝试微调进度以唤醒加载
          player.play().catch(() => {})
        }
      }, 5000) // 缩短超时到 5s，更积极的干预

      // 确保静音状态与 store 同步
      player.muted = playerStore.isMuted
      
      // 监听一次 ready 事件来设置进度
      const progressHandler = async () => {
        // 如果在加载过程中用户已经划走，则不应再播放或取消静音
        if (!props.isActive) {
          player.muted = true
          player.pause()
          return
        }
        clearTimeout(loadingTimeout)
        const progress = await historyService.getProgress(props.video.id)
        if (progress && progress.currentTime > 0 && !progress.isFinished) {
          player.currentTime = progress.currentTime
          player.notice.show = `已为您续播到 ${formatTime(progress.currentTime)}`
        }
        player.play().catch(() => {})
      }
      player.once('ready', progressHandler)
      player.once('video:canplay', progressHandler)

      player.play().catch(err => {
        console.warn('Autoplay failed:', err)
      })
    } else {
      // 非激活视频（预加载视频）必须静音并暂停
      player.muted = true
      player.pause()
    }
  } catch (e) {
    console.error('Playback error:', e)
    if (props.isActive) videoError.value = true
  }
}

function toggleMute() {
  playerStore.isMuted = !playerStore.isMuted
  if (player) {
    player.muted = playerStore.isMuted
    player.notice.show = playerStore.isMuted ? '静音' : '开启声音'
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
    maxBufferLength: 10, // 增加缓冲区
    maxMaxBufferLength: 20,
    backBufferLength: 20,
    capLevelToPlayerSize: true,
    fragLoadingMaxRetry: 10, // 增加预览分片重试
    levelLoadingMaxRetry: 5,
    fragLoadingRetryDelay: 300, 
    fragLoadingMaxRetryTimeout: 3000,
    manifestLoadingTimeOut: 10000,
    fragLoadingTimeOut: 10000,
    startLevel: 0,
    xhrSetup: setupMoonTvHlsRequest,
    loader: AdapterHlsLoader,
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
      // MANIFEST_PARSED 后不要立即 play，等到第一次预览交互时再 play
      // 但我们需要它加载数据，所以执行一次 preload
      previewVideoRef.value.play().then(() => {
        previewVideoRef.value.pause()
      }).catch(() => {})
    })
  } else {
    previewVideoRef.value.src = url
    previewVideoRef.value.load()
    previewVideoRef.value.play().then(() => {
      previewVideoRef.value.pause()
    }).catch(() => {})
  }

  // 监听 seeked 事件来绘制 Canvas
  previewVideoRef.value.addEventListener('seeked', drawPreviewFrame)
  previewVideoRef.value.addEventListener('waiting', () => { isPreviewLoading.value = true })
  previewVideoRef.value.addEventListener('canplay', () => { isPreviewLoading.value = false })
  // 增加 error 监听
  previewVideoRef.value.addEventListener('error', (e) => {
    console.warn('Preview video error:', e)
    // 尝试重载一次
    if (previewHls) {
      previewHls.recoverMediaError()
    }
  })
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
    // 如果已经在目标时间附近，不要重复 seek
    if (Math.abs(previewVideoRef.value.currentTime - time) < 0.2) return
    
    isPreviewLoading.value = true
    // 强制跳转
    previewVideoRef.value.currentTime = time
    
    // 预览视频通常应该是暂停的，我们只在 seeked 之后绘制一帧
    // 但有些浏览器如果不 play 一下可能不会渲染新帧
    if (previewVideoRef.value.paused) {
      previewVideoRef.value.play().then(() => {
        // 播放后立即暂停，只为触发帧更新
        previewVideoRef.value.pause()
      }).catch(() => {})
    }
  }
}

function onMouseDown(e) {
  if (e.button !== 0) return // Only left click
  startLongPress()
  window.addEventListener('mouseup', stopLongPress, { once: true })
}

function onTouchStart(e) {
  if (e.touches.length > 1) return
  
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
  isDraggingProgress.value = false
  isDraggingVertical.value = false
  dragStartTime = Date.now()
  
  if (player) {
    dragStartProgress = player.currentTime
    startVolume = player.volume
  }
  
  // 如果当前是激活状态且未播放，尝试播放
  if (props.isActive && player && !isPlaying.value) {
    player.play().catch(() => {})
  }
  
  startLongPress()
}

function onTouchMove(e) {
  if (isLongPressing.value || e.touches.length > 1) return
  
  const touchX = e.touches[0].clientX
  const touchY = e.touches[0].clientY
  const dx = touchX - touchStartX
  const dy = touchY - touchStartY

  // 初始判定：判断是水平滑动还是垂直滑动
  if (!isDraggingProgress.value && !isDraggingVertical.value) {
    if (Math.abs(dx) > 15 || Math.abs(dy) > 15) {
      clearTimeout(longPressTimer)
      if (Math.abs(dx) > Math.abs(dy)) {
        isDraggingProgress.value = true
      } else {
        isDraggingVertical.value = true
        const rect = e.currentTarget.getBoundingClientRect()
        verticalDragSide.value = touchStartX < rect.left + rect.width / 2 ? 'left' : 'right'
      }
    }
  }

  if (isDraggingProgress.value && player && player.duration) {
    if (e.cancelable) e.preventDefault()
    const scrollScale = 0.2
    const newTime = Math.max(0, Math.min(player.duration, dragStartProgress + dx * scrollScale))
    player.currentTime = newTime
    player.notice.show = `${dx > 0 ? '▶▶' : '◀◀'} ${formatTime(newTime)} / ${formatTime(player.duration)}`
  } else if (isDraggingVertical.value && player) {
    if (e.cancelable) e.preventDefault()
    const sensitivity = 0.005
    const delta = -dy * sensitivity

    if (verticalDragSide.value === 'right') {
      // 音量控制 (0-1)
      const newVolume = Math.max(0, Math.min(1, startVolume + delta))
      player.volume = newVolume
      player.notice.show = `音量: ${Math.round(newVolume * 100)}%`
    } else {
      // 亮度控制 (通过滤镜模拟)
      // 注意：这里只是显示提示，实际亮度可以通过样式设置，但 Artplayer 自身可能没亮度 API
      // 我们用 notice 展示，并可以考虑后续增加 filter: brightness()
      const newBrightness = Math.max(0.1, Math.min(2, 1 + delta))
      if (videoWrapRef.value) {
        videoWrapRef.value.style.filter = `brightness(${newBrightness})`
      }
      player.notice.show = `亮度: ${Math.round(newBrightness * 100)}%`
    }
  }
}

function onTouchEnd(e) {
  stopLongPress()
  
  // 如果滑动距离很小且时间短，可能是点击，交给 onVideoClick 处理
  // 这里主要重置状态
  setTimeout(() => {
    isDraggingProgress.value = false
    isDraggingVertical.value = false
  }, 50)
}

function startLongPress() {
  clearTimeout(longPressTimer)
  longPressTimer = setTimeout(() => {
    // 只有在没滑动的情况下才算长按
    if (player && isPlaying.value && !isDraggingProgress.value && !isDraggingVertical.value) {
      isLongPressing.value = true
      player.playbackRate = 2.0
      player.notice.show = '2.0x 倍速播放中'
    }
  }, 600) // 略微增加长按判定时间，减少误触
}

function stopLongPress() {
  clearTimeout(longPressTimer)
  if (isLongPressing.value) {
    isLongPressing.value = false
    if (player) {
      player.playbackRate = 1.0
      player.notice.show = '恢复正常倍速'
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
  if (isLongPressing.value || isDraggingProgress.value || isDraggingVertical.value) return
  const now = Date.now()
  const delta = now - lastClickTime
  
  if (delta < 300) {
    // Double click
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 2) {
      seek(-10)
      if (player) player.notice.show = '◀◀ 快退 10s'
    } else {
      seek(10)
      if (player) player.notice.show = '▶▶ 快进 10s'
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
      video.proxyMode || false,
      isNativeBuild,
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
  z-index: 30; /* 确保在 Artplayer 控制栏 (z-index 20) 之上 */
  padding: 0 16px;
  /* Add margin to avoid overlapping with player controls */
  padding-bottom: calc(50px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
  pointer-events: none; /* Let clicks pass through to player */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.bottom-overlay.overlay-hide {
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
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
  bottom: calc(12px + env(safe-area-inset-bottom, 0px)); /* 降低一点以贴合新进度的位置 */
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
    padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
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
