<template>
  <div
    class="video-card"
    :class="{ active: isActive }"
  >
    <!-- Video container for xgplayer -->
    <div ref="videoWrapRef" class="video-wrap" @click="onVideoClick"></div>

    <!-- Cover image while loading -->
    <div class="video-cover" v-if="showCover">
      <img v-if="video.cover" :src="video.cover" alt="封面" class="cover-img" />
      <div v-else class="cover-placeholder" />
    </div>

    <!-- Loading spinner -->
    <Transition name="fade">
      <div class="loading-overlay" v-if="isBuffering && isActive">
        <div class="ns-spinner" />
      </div>
    </Transition>

    <!-- Error state -->
    <Transition name="fade">
      <div class="error-overlay" v-if="videoError && isActive">
        <div class="error-icon">⚠️</div>
        <p>视频加载失败</p>
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

    <!-- Play / Pause flash indicator -->
    <Transition name="scale-fade">
      <div class="play-indicator" v-if="showPlayIndicator">
        <span>{{ indicatorText }}</span>
      </div>
    </Transition>

    <!-- Progress bar overlay -->
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

      <div class="progress-bar-wrap" 
           @click.stop="onProgressClick"
           @mousedown="onProgressMouseDown"
           @mousemove="onProgressMouseMove"
           @mouseup="onProgressMouseUp"
           @mouseleave="onProgressMouseUp"
           @touchstart.passive="onProgressTouchStart"
           @touchmove.passive="onProgressTouchMove"
           @touchend.passive="onProgressTouchEnd">
        <!-- Progress preview tooltip -->
        <div v-if="showPreview" 
             class="progress-preview" 
             :style="{ left: previewPct + '%' }">
          <div class="preview-frame">
            <!-- Reuse xgplayer's main video or use a lightweight thumbnail if available -->
            <div class="preview-placeholder">预览进度</div>
          </div>
          <span class="preview-time">{{ formatTime(previewTime) }}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <div class="time-info">
          <span>{{ formatTime(currentTime) }}</span>
          <span class="time-sep">/</span>
          <span>{{ formatTime(duration) }}</span>
        </div>
      </div>
    </div>

    <!-- Right action bar -->
    <div class="right-bar">
      <button class="action-btn" @click.stop="togglePlaybackSpeed" title="播放倍速">
        <span class="speed-text">{{ playbackSpeed }}x</span>
      </button>
      <button class="action-btn" @click.stop="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏'">
        <span class="action-icon">{{ isFullscreen ? '↙️' : '↗️' }}</span>
      </button>
      <button class="action-btn" @click.stop="playerStore.toggleMute()" :title="playerStore.isMuted ? '取消静音' : '静音'">
        <span class="action-icon">{{ playerStore.isMuted ? '🔇' : '🔊' }}</span>
      </button>
      <button class="action-btn" @click.stop="playerStore.toggleLoop()" :title="playerStore.isLooping ? '取消循环' : '循环播放'">
        <span class="action-icon" :class="{ 'icon-active': playerStore.isLooping }">🔁</span>
      </button>
      <button class="action-btn" @click.stop="shareVideo" title="分享">
        <span class="action-icon">🔗</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import Player, { Events } from 'xgplayer'
import HlsPlugin from 'xgplayer-hls'
import 'xgplayer/dist/index.min.css'
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
const isFullscreen = ref(false)
const playbackSpeed = ref(1.0)
const progressPct = ref(0)
const currentTime = ref(0)
const duration = ref(0)
const showPlayIndicator = ref(false)
const autoSkipCountdown = ref(0)
let player = null
let playIndicatorTimer = null
let autoSkipTimer = null
let lastClickTime = 0

// --- Lifecycle ---
onMounted(() => {
  initPlayer()
})

onUnmounted(() => {
  destroyPlayer()
  clearTimeout(playIndicatorTimer)
  clearInterval(autoSkipTimer)
})

function initPlayer() {
  if (!videoWrapRef.value) return
  
  player = new Player({
    el: videoWrapRef.value,
    url: '', // Load later
    width: '100%',
    height: '100%',
    autoplay: false,
    fluid: true,
    videoInit: true,
    lang: 'zh-cn',
    volume: 1,
    muted: playerStore.isMuted,
    loop: playerStore.isLooping,
    playbackRate: [0.5, 0.75, 1, 1.25, 1.5, 2],
    defaultPlaybackRate: playbackSpeed.value,
    playsinline: true,
    // Disable default mobile controls for TikTok-like UI
    controls: false,
    marginControls: false,
    mobile: {
      disableGesture: false,
      gestureX: true,
      gestureY: true,
    },
    plugins: [HlsPlugin],
    // HLS config for MoonTV proxy
    hls: {
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
  })

  player.on(Events.PLAY, () => { isPlaying.value = true; showCover.value = false; isBuffering.value = false })
  player.on(Events.PAUSE, () => { isPlaying.value = false })
  player.on(Events.TIME_UPDATE, () => {
    currentTime.value = player.currentTime
    duration.value = player.duration
    if (player.duration > 0) {
      progressPct.value = (player.currentTime / player.duration) * 100
      if (props.isActive && Math.floor(player.currentTime) % 5 === 0) {
        historyService.saveProgress(props.video, player.currentTime, player.duration)
      }
    }
  })
  player.on(Events.ENDED, () => {
    historyService.saveProgress(props.video, player.duration, player.duration)
    if (!playerStore.isLooping) emit('ended')
  })
  player.on(Events.WAITING, () => { if (props.isActive) isBuffering.value = true })
  player.on(Events.CANPLAY, () => { isBuffering.value = false })
  player.on(Events.ERROR, () => {
    videoError.value = true
    isBuffering.value = false
    showCover.value = false
  })
  player.on(Events.FULLSCREEN_CHANGE, (isFs) => { isFullscreen.value = isFs })
}

function destroyPlayer() {
  if (player) {
    player.destroy()
    player = null
  }
}

// --- Watchers ---
watch(() => [props.isActive, props.isNear], async ([active, near]) => {
  if (active || near) {
    await loadAndPlay()
  } else {
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
  if (!player) return
  
  videoError.value = false
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
    // xgplayer handles HLS automatically if HlsPlugin is provided
    player.switchURL(url)
    
    if (props.isActive) {
      const progress = await historyService.getProgress(props.video.id)
      if (progress && progress.currentTime > 0 && !progress.isFinished) {
        player.currentTime = progress.currentTime
      }
      player.play()
    }
  } catch (e) {
    console.error('Playback error:', e)
    if (props.isActive) videoError.value = true
  }
}

function togglePlay() {
  if (!props.isActive || !player) return
  if (player.paused) {
    player.play()
  } else {
    player.pause()
  }
  flashPlayIndicator()
}

function onVideoClick(e) {
  const now = Date.now()
  const delta = now - lastClickTime
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
  flashPlayIndicator(seconds > 0 ? '⏩' : '⏪')
}

function toggleFullscreen() {
  if (!player) return
  if (player.isFullscreen) {
    player.exitFullscreen()
  } else {
    player.getFullscreen(player.root)
  }
}

function togglePlaybackSpeed() {
  const speeds = [0.5, 1.0, 1.25, 1.5, 2.0]
  let idx = speeds.indexOf(playbackSpeed.value)
  idx = (idx + 1) % speeds.length
  playbackSpeed.value = speeds[idx]
  if (player) player.playbackRate = playbackSpeed.value
  flashPlayIndicator(`${playbackSpeed.value}x`)
}

let indicatorText = ref('▶')
function flashPlayIndicator(text) {
  indicatorText.value = text || (isPlaying.value ? '▶' : '⏸')
  showPlayIndicator.value = true
  clearTimeout(playIndicatorTimer)
  playIndicatorTimer = setTimeout(() => {
    showPlayIndicator.value = false
  }, 800)
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0 
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function onProgressClick(e) {
  if (!player) return
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  player.currentTime = ratio * player.duration
}

const isDragging = ref(false)
const previewTime = ref(0)
const previewPct = ref(0)
const showPreview = ref(false)

function onProgressMouseDown(e) {
  isDragging.value = true
  updateProgressFromEvent(e)
}

function onProgressMouseMove(e) {
  updatePreview(e)
  if (isDragging.value) updateProgressFromEvent(e)
}

function onProgressMouseUp() {
  isDragging.value = false
  showPreview.value = false
}

function onProgressTouchStart(e) {
  isDragging.value = true
  showPreview.value = true
  updateProgressFromEvent(e.touches[0])
  updatePreview(e.touches[0])
}

function onProgressTouchMove(e) {
  updatePreview(e.touches[0])
  if (isDragging.value) updateProgressFromEvent(e.touches[0])
}

function onProgressTouchEnd() {
  isDragging.value = false
  showPreview.value = false
}

function updatePreview(e) {
  if (!player) return
  const rect = e.currentTarget?.getBoundingClientRect() || document.querySelector('.progress-bar-wrap').getBoundingClientRect()
  let ratio = (e.clientX - rect.left) / rect.width
  ratio = Math.max(0, Math.min(1, ratio))
  previewTime.value = ratio * player.duration
  previewPct.value = ratio * 100
  showPreview.value = true
}

function updateProgressFromEvent(e) {
  if (!player) return
  const rect = document.querySelector('.progress-bar-wrap').getBoundingClientRect()
  let ratio = (e.clientX - rect.left) / rect.width
  ratio = Math.max(0, Math.min(1, ratio))
  if (player.duration > 0) {
    player.currentTime = ratio * player.duration
    currentTime.value = player.currentTime
    progressPct.value = ratio * 100
  }
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

function shareVideo() {
  const url = props.video.url || window.location.href
  if (navigator.share) {
    navigator.share({ title: props.video.title, url })
  } else {
    navigator.clipboard?.writeText(url)
  }
}

function retry() {
  videoError.value = false
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-el {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
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

/* Loading */
.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.3);
}

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

/* Play indicator */
.play-indicator {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.play-indicator span {
  font-size: 72px;
  opacity: 0.8;
  filter: drop-shadow(0 0 20px rgba(0,0,0,0.5));
}

/* Bottom overlay */
.bottom-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
  padding: 0 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
}

.video-info {
  padding-bottom: 12px;
}

.video-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.source-badge, .year-badge {
  padding: 2px 10px;
  border-radius: 20px;
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
  font-size: 17px;
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
  font-size: 12px;
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
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  flex-shrink: 0;
}
.ep-list {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
}
.ep-list::-webkit-scrollbar { display: none; }
.ep-btn {
  padding: 3px 10px;
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
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  flex-shrink: 0;
  align-self: center;
}

/* Progress bar */
.progress-bar-wrap {
  position: relative;
  padding: 12px 0 8px;
  cursor: pointer;
}
.progress-bar {
  height: 3px;
  background: rgba(255,255,255,0.2);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #FF385C, #FF6B35);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.time-info {
  display: flex;
  align-items: center;
  margin-top: 6px;
  font-size: 11px;
  font-family: monospace;
  color: rgba(255,255,255,0.7);
  letter-spacing: 0.5px;
}
.time-sep {
  margin: 0 4px;
  opacity: 0.5;
}

.progress-preview {
  position: absolute;
  bottom: 30px;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.9);
  color: white;
  padding: 4px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(255,255,255,0.2);
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  z-index: 100;
}

.preview-frame {
  width: 160px;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1);
}

.preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-time {
  font-size: 12px;
  font-family: monospace;
  font-weight: 600;
  padding-bottom: 2px;
}

.progress-preview::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: rgba(0,0,0,0.9);
}

/* Right action bar */
.right-bar {
  position: absolute;
  right: 12px;
  bottom: 120px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.15);
  transition: transform 0.15s, background 0.15s;
}
.action-btn:hover, .action-btn:active {
  transform: scale(1.1);
  background: rgba(255,56,92,0.3);
}
.action-icon {
  font-size: 20px;
  transition: transform 0.15s;
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

.scale-fade-enter-active { transition: all 0.15s var(--ease-spring); }
.scale-fade-leave-active { transition: all 0.3s ease; }
.scale-fade-enter-from { transform: scale(0.5); opacity: 0; }
.scale-fade-leave-to { transform: scale(1.3); opacity: 0; }
</style>
