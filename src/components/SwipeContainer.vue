<template>
  <div
    ref="containerRef"
    class="swipe-container"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
    @wheel.passive="onWheel"
  >
    <!-- Rendered windows: prev, current, next -->
    <div
      class="swipe-track"
      :style="trackStyle"
    >
      <div
        v-for="(video, slotIdx) in renderedSlots"
        :key="video?.id || slotIdx"
        class="swipe-slot"
      >
        <VideoCard
          v-if="video"
          :video="video"
          :isActive="slotIdx === 1"
          :isNear="slotIdx === 0 || slotIdx === 2"
          @ended="onVideoEnded"
        />
        <div v-else class="swipe-slot-empty" />
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

// Track style: translate based on current slot + drag
const trackStyle = computed(() => {
  const base = -containerHeight.value  // slot 1 (index=1) is center
  const offset = isDragging.value ? dragOffset.value : 0
  return {
    transform: `translateY(${base + offset}px)`,
    transition: isDragging.value || isAnimating.value === false ? 'none' : 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  }
})

// Render 3 slots: prev, current, next
const renderedSlots = computed(() => {
  const q = playerStore.queue
  const idx = playerStore.currentIndex
  return [
    idx > 0 ? q[idx - 1] : null,
    q[idx] || null,
    idx < q.length - 1 ? q[idx + 1] : null,
  ]
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
  dragOffset.value = 0
  isAnimating.value = true
  if (dir === 'next') playerStore.next()
  if (dir === 'prev') playerStore.prev()
  setTimeout(() => { isAnimating.value = false }, 350)

  // Hide swipe hint
  if (showHint.value) {
    showHint.value = false
    localStorage.setItem('ns_hinted', '1')
  }
}

function animateReset() {
  isAnimating.value = true
  dragOffset.value = 0
  setTimeout(() => { isAnimating.value = false }, 350)
}

function onVideoEnded() {
  if (playerStore.hasNext) {
    commit('next')
  }
}

// Resize
function onResize() {
  containerHeight.value = window.innerHeight
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  // Keyboard support
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
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
  will-change: transform;
}

.swipe-slot {
  width: 100%;
  height: 100dvh;
  position: relative;
  overflow: hidden;
}

.swipe-slot-empty {
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
