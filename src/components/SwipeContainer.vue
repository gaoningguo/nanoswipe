<template>
  <div
    ref="containerRef"
    class="swipe-container"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
    @wheel.passive="onWheel"
  >
    <!-- Infinite Track: renders items at their actual positions -->
    <div
      class="swipe-track"
      :style="trackStyle"
    >
      <div
        v-for="(video, index) in playerStore.queue"
        :key="video.id"
        class="swipe-slot"
      >
        <VideoCard
          v-if="Math.abs(index - playerStore.currentIndex) <= 1"
          :video="video"
          :isActive="index === playerStore.currentIndex"
          :isNear="Math.abs(index - playerStore.currentIndex) === 1"
          @ended="onVideoEnded"
        />
        <div v-else class="swipe-slot-placeholder" />
      </div>
    </div>

    <!-- Swipe hint (first launch) -->
    <Transition name="fade">
      <div class="swipe-hint" v-if="showHint">
        <span class="hint-arrow">↑</span>
        <span>向上滑动</span>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../stores/player.js'
import VideoCard from './VideoCard.vue'

const playerStore = usePlayerStore()

// Current offset during drag
const dragOffset = ref(0)
const isDragging = ref(false)
const isAnimating = ref(false)
const containerHeight = ref(window.innerHeight)

// Swipe hint
const showHint = ref(!localStorage.getItem('ns_hinted'))

let touchStartY = 0
let touchStartTime = 0
let wheelThrottle = false

const SWIPE_THRESHOLD = 60     // px to trigger switch
const VELOCITY_THRESHOLD = 0.3  // px/ms

// Track style: translate based on current index + drag
const trackStyle = computed(() => {
  const base = -playerStore.currentIndex * containerHeight.value
  const offset = isDragging.value ? dragOffset.value : 0
  return {
    transform: `translate3d(0, ${base + offset}px, 0)`,
    transition: isDragging.value || isAnimating.value === false ? 'none' : 'transform 0.4s cubic-bezier(0.15, 0.3, 0.25, 1)',
  }
})


// --- Touch Events ---
function onTouchStart(e) {
  touchStartY = e.touches[0].clientY
  touchStartTime = Date.now()
  isDragging.value = true
}

function onTouchMove(e) {
  if (!isDragging.value) return
  dragOffset.value = e.touches[0].clientY - touchStartY
}

function onTouchEnd(e) {
  if (!isDragging.value) return
  const dy = e.changedTouches[0].clientY - touchStartY
  const dt = Date.now() - touchStartTime
  const velocity = Math.abs(dy) / dt
  isDragging.value = false

  if (dy < -SWIPE_THRESHOLD || (dy < -20 && velocity > VELOCITY_THRESHOLD)) {
    commit('next')
  } else if (dy > SWIPE_THRESHOLD || (dy > 20 && velocity > VELOCITY_THRESHOLD)) {
    commit('prev')
  } else {
    // snap back
    animateReset()
  }
}

// --- Wheel Events (PC) ---
function onWheel(e) {
  if (wheelThrottle) return
  wheelThrottle = true
  setTimeout(() => { wheelThrottle = false }, 500)

  if (e.deltaY > 0) {
    commit('next')
  } else if (e.deltaY < 0) {
    commit('prev')
  }
}

function commit(dir) {
  if (isAnimating.value) return
  
  const hasNext = playerStore.currentIndex < playerStore.queue.length - 1
  const hasPrev = playerStore.currentIndex > 0
  
  if (dir === 'next' && !hasNext) {
    animateReset()
    return
  }
  if (dir === 'prev' && !hasPrev) {
    animateReset()
    return
  }

  isAnimating.value = true
  
  if (dir === 'next') playerStore.next()
  if (dir === 'prev') playerStore.prev()
  
  // Reset drag offset immediately, the CSS transition handles the smooth movement
  dragOffset.value = 0
  
  setTimeout(() => {
    isAnimating.value = false
  }, 400)

  // Hide swipe hint
  if (showHint.value) {
    showHint.value = false
    localStorage.setItem('ns_hinted', '1')
  }
}

function animateReset() {
  isAnimating.value = true
  dragOffset.value = 0
  setTimeout(() => { isAnimating.value = false }, 400)
}

function onVideoEnded() {
  if (playerStore.hasNext) {
    commit('next')
  }
}

// Resize
function onResize() {
  // 使用 visualViewport 获取更准确的移动端可用高度，防止工具栏干扰
  if (window.visualViewport) {
    containerHeight.value = window.visualViewport.height
  } else {
    containerHeight.value = window.innerHeight
  }
}

onMounted(() => {
  onResize()
  window.addEventListener('resize', onResize)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize)
  }
  // Keyboard support
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', onResize)
  }
  window.removeEventListener('keydown', onKeyDown)
})

function onKeyDown(e) {
  if (e.key === 'ArrowDown' || e.key === 'j') commit('next')
  if (e.key === 'ArrowUp' || e.key === 'k') commit('prev')
}
</script>

<style scoped>
.swipe-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.swipe-track {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%; /* Height will be determined by slots or set dynamically if needed, but relative positioning works best here */
  will-change: transform;
}

.swipe-slot {
  width: 100%;
  height: 100vh; /* Use vh or let it be filled by containerHeight via JS if you want perfect match */
  position: relative;
  overflow: hidden;
}

/* Force slot height to match dynamic container height */
.swipe-slot {
  height: v-bind('containerHeight + "px"');
}

.swipe-slot-placeholder {
  width: 100%;
  height: 100%;
  background: #000;
}

/* Swipe hint */
.swipe-hint {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: rgba(255,255,255,0.7);
  font-size: 13px;
  pointer-events: none;
  animation: pulse 2s ease-in-out infinite;
  z-index: 100;
}
.hint-arrow {
  font-size: 24px;
  animation: slideDown 1.2s ease-in-out infinite;
}

@keyframes slideDown {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.5s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
