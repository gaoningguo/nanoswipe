<template>
  <div
    class="video-card"
    :class="{ active: isActive }"
  >
    <!-- Video element -->
    <video
      ref="videoRef"
      class="video-el"
      :muted="playerStore.isMuted"
      :loop="playerStore.isLooping"
      playsinline
      webkit-playsinline
      x5-playsinline
      preload="metadata"
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
      @waiting="onWaiting"
      @canplay="onCanPlay"
      @error="onError"
      @click="togglePlay"
    />

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
        <span>{{ isPlaying ? '▶' : '⏸' }}</span>
      </div>
    </Transition>

    <!-- Bottom info gradient -->
    <div class="bottom-overlay">
      <!-- Video info -->
      <div class="video-info">
        <div class="video-meta">
          <span class="source-badge">{{ video.sourceName || video.source }}</span>
          <span v-if="video.year" class="year-badge">{{ video.year }}</span>
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

      <!-- Progress bar -->
      <div class="progress-bar-wrap" @click.stop="onProgressClick">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
      </div>
    </div>

    <!-- Right action bar -->
    <div class="right-bar">
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
import { usePlayerStore } from '../stores/player.js'
import { useSourceStore } from '../stores/source.js'
import { HlsPlayer } from '../services/hlsPlayer.js'
import { historyService } from '../services/historyService.js'

const props = defineProps({
  video: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
})

const emit = defineEmits(['ended'])
const playerStore = usePlayerStore()
const sourceStore = useSourceStore()

const videoRef = ref(null)
const isPlaying = ref(false)
const isBuffering = ref(false)
const showCover = ref(true)
const videoError = ref(false)
const progressPct = ref(0)
const showPlayIndicator = ref(false)
const autoSkipCountdown = ref(0)
let playIndicatorTimer = null
let autoSkipTimer = null
let hlsPlayer = null

// --- Lifecycle ---
onMounted(() => {
  hlsPlayer = new HlsPlayer()
  hlsPlayer.attach(videoRef.value)
  // Tell HLS.js which MoonTV origin to rewrite through the Vite proxy
  if (sourceStore.moontvUrl) {
    hlsPlayer.setMoontvOrigin(sourceStore.moontvUrl)
  }
})

onUnmounted(() => {
  hlsPlayer?.destroy()
  clearTimeout(playIndicatorTimer)
  clearInterval(autoSkipTimer)
})

// --- Watch active state ---
watch(() => props.isActive, async (active) => {
  if (active) {
    await loadAndPlay()
  } else {
    hlsPlayer?.pause()
    isPlaying.value = false
  }
}, { immediate: false })

watch(() => playerStore.isMuted, (muted) => {
  if (videoRef.value) videoRef.value.muted = muted
})

// --- Methods ---
async function loadAndPlay() {
  videoError.value = false
  autoSkipCountdown.value = 0
  clearInterval(autoSkipTimer)
  isBuffering.value = true
  showCover.value = true

  // Ensure HLS player knows about the MoonTV origin for CORS proxy
  if (props.video.source === 'moontv' && sourceStore.moontvUrl) {
    hlsPlayer.setMoontvOrigin(sourceStore.moontvUrl)
  }

  let url = props.video.url
  if (!url && props.video.source === 'moontv') {
    url = await playerStore.resolveVideoUrl(props.video)
  }
  if (!url) {
    isBuffering.value = false
    videoError.value = true
    _startAutoSkip()
    return
  }

  try {
    // Check if URL is still valid or need proxy refresh?
    // In MoonTVPlus, sometimes we might want to use a proxy for certain sources.
    // The current resolveVideoUrl and resolvePlayUrl already handle proxyMode.
    
    await hlsPlayer.load(url, props.video.type || 'auto')
    
    // Resume from last position
    const progress = await historyService.getProgress(props.video.id)
    if (progress && progress.currentTime > 0 && !progress.isFinished) {
      console.log(`[Playback] Resuming ${props.video.title} from ${progress.currentTime}s`)
      videoRef.value.currentTime = progress.currentTime
    }

    await hlsPlayer.play()
    isPlaying.value = true
    showCover.value = false
  } catch (e) {
    console.error('Playback error:', e)
    videoError.value = true
    _startAutoSkip()
  } finally {
    isBuffering.value = false
  }
}

function _startAutoSkip() {
}

function togglePlay() {
  if (!props.isActive) return
  if (isPlaying.value) {
    hlsPlayer.pause()
    isPlaying.value = false
  } else {
    hlsPlayer.play()
    isPlaying.value = true
  }
  flashPlayIndicator()
}

function flashPlayIndicator() {
  showPlayIndicator.value = true
  clearTimeout(playIndicatorTimer)
  playIndicatorTimer = setTimeout(() => {
    showPlayIndicator.value = false
  }, 800)
}

function onTimeUpdate() {
  const dur = hlsPlayer?.duration || 0
  const cur = hlsPlayer?.currentTime || 0
  if (dur > 0) {
    progressPct.value = (cur / dur) * 100
    // Save progress periodically (every 5 seconds)
    if (props.isActive && Math.floor(cur) % 5 === 0) {
      historyService.saveProgress(props.video, cur, dur)
    }
  }
}

function onEnded() {
  const dur = hlsPlayer?.duration || 0
  if (dur > 0) {
    // Mark as finished
    historyService.saveProgress(props.video, dur, dur)
  }
  if (!playerStore.isLooping) {
    emit('ended')
  }
}

function onWaiting() {
  if (props.isActive) isBuffering.value = true
}

function onCanPlay() {
  isBuffering.value = false
}

function onError() {
  videoError.value = true
  isBuffering.value = false
  showCover.value = false
  _startAutoSkip()
}

function retry() {
  videoError.value = false
  clearInterval(autoSkipTimer)
  autoSkipCountdown.value = 0
  if (props.video.source === 'moontv') props.video.url = null
  loadAndPlay()
}

function onProgressClick(e) {
  if (!videoRef.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  if (videoRef.value) {
    videoRef.value.currentTime = ratio * (hlsPlayer?.duration || 0)
  }
}

async function switchEpisode(idx) {
  const video = props.video
  if (!video.episodes?.[idx]) return
  const ep = video.episodes[idx]
  const rawUrl = typeof ep === 'string' ? ep : ep.playUrl || ep.url

  let finalUrl = rawUrl
  if (rawUrl && video.source === 'moontv') {
    // Use the MoonTV proxy/vod/m3u8 endpoint with the correct source key
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
  hlsPlayer?.destroy()
  hlsPlayer = new HlsPlayer()
  hlsPlayer.attach(videoRef.value)
  // Ensure new hlsPlayer knows about MoonTV origin
  if (sourceStore.moontvUrl) {
    hlsPlayer.setMoontvOrigin(sourceStore.moontvUrl)
  }
  await loadAndPlay()
}

async function tryAutoSwitchSource() {
  const video = props.video
  if (!video.playbacks || video.playbacks.length <= 1) return
  
  let nextIdx = (video.currentPlaybackIdx || 0) + 1
  if (nextIdx >= video.playbacks.length) {
    nextIdx = 0 // Wrap around or stop? User might want to cycle
  }
  
  if (nextIdx === (video.currentPlaybackIdx || 0)) return // Only one source or cycled back
  
  await playerStore.switchPlayback(video, nextIdx)
  await loadAndPlay()
}

async function tryManualSwitchSource(idx) {
  const video = props.video
  if (video.currentPlaybackIdx === idx) return
  await playerStore.switchPlayback(video, idx)
  await loadAndPlay()
}

function shareVideo() {
  const url = props.video.url || window.location.href
  if (navigator.share) {
    navigator.share({ title: props.video.title, url })
  } else {
    navigator.clipboard?.writeText(url)
    // Toast handled by parent
  }
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
  padding: 8px 0 4px;
  cursor: pointer;
}
.progress-bar {
  height: 2px;
  background: rgba(255,255,255,0.2);
  border-radius: 1px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #FF385C, #FF6B35);
  border-radius: 1px;
  transition: width 0.3s linear;
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
