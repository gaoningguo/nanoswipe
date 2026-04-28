<template>
  <div class="swipe-view">
    <!-- Nav bar (top) -->
    <header class="top-nav glass">
      <div class="nav-inner">
        <div class="nav-logo">
          <span class="logo-icon">▶</span>
          <span class="logo-text">NanoSwipe</span>
        </div>

        <div class="nav-actions">
          <!-- Counter -->
          <span class="video-counter" v-if="playerStore.queue.length">
            {{ playerStore.currentIndex + 1 }} / {{ playerStore.queue.length }}
          </span>

          <!-- Search button (MoonTV only) -->
          <button
            v-if="sourceStore.moontvEnabled"
            class="nav-btn"
            @click="showSearch = true"
            title="搜索"
          >🔍</button>

          <!-- Settings -->
          <router-link to="/settings" class="nav-btn" title="设置">⚙️</router-link>
        </div>
      </div>

      <!-- Source switcher pills -->
      <div class="source-pills">
        <button
          class="pill"
          :class="{ active: sourceStore.activeSource === 'custom' }"
          @click="switchSource('custom')"
        >自定义</button>
        <button
          v-if="sourceStore.moontvEnabled"
          class="pill"
          :class="{ active: sourceStore.activeSource === 'moontv' }"
          @click="switchSource('moontv')"
        >MoonTV</button>
        <span v-if="!sourceStore.moontvEnabled" class="pill-hint">
          <router-link to="/settings" class="pill-link">+ 接入 MoonTV</router-link>
        </span>
      </div>
    </header>

    <!-- Main swipe area -->
    <main class="swipe-area">
      <!-- Loading state -->
      <div class="state-overlay" v-if="playerStore.loading">
        <div class="ns-spinner" />
        <p>加载中...</p>
      </div>

      <!-- Error state -->
      <div class="state-overlay" v-else-if="playerStore.error">
        <span class="state-icon">⚠️</span>
        <p>{{ playerStore.error }}</p>
        <button class="ns-btn ns-btn-primary" @click="reload">重新加载</button>
      </div>

      <!-- Empty state -->
      <div class="state-overlay" v-else-if="playerStore.queue.length === 0">
        <span class="state-icon">📭</span>
        <p>暂无视频</p>
        <router-link to="/settings" class="ns-btn ns-btn-primary">去添加视频</router-link>
      </div>

      <!-- Swipe container -->
      <SwipeContainer v-else />
    </main>

    <!-- Toast -->
    <Transition name="fade">
      <div class="ns-toast" v-if="toast">{{ toast }}</div>
    </Transition>

    <!-- Search modal -->
    <Transition name="fade">
      <SearchModal v-if="showSearch" @close="showSearch = false" />
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, provide } from 'vue'
import { usePlayerStore } from '../stores/player.js'
import { useSourceStore } from '../stores/source.js'
import SwipeContainer from '../components/SwipeContainer.vue'
import SearchModal from '../components/SearchModal.vue'

const playerStore = usePlayerStore()
const sourceStore = useSourceStore()

const showSearch = ref(false)
const toast = ref('')
let toastTimer = null

function showToast(msg, dur = 2000) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, dur)
}

provide('showToast', showToast)

onMounted(() => {
  playerStore.loadInitialQueue()
})

async function switchSource(src) {
  sourceStore.setActiveSource(src)
  await playerStore.loadInitialQueue()
}

function reload() {
  playerStore.loadInitialQueue()
}
</script>

<style scoped>
.swipe-view {
  position: relative;
  width: 100%;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #000;
  overflow: hidden;
}

/* Nav */
.top-nav {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  border-bottom: 1px solid transparent;
  border-radius: 0;
  border: none;
  background: linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%);
  backdrop-filter: none;
  padding: 0;
  padding-top: env(safe-area-inset-top, 0px);
}

.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
}

.nav-logo {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-icon {
  width: 28px;
  height: 28px;
  background: var(--c-grad);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: white;
}
.logo-text {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.video-counter {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  font-variant-numeric: tabular-nums;
}
.nav-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background 0.15s, transform 0.15s;
  text-decoration: none;
}
.nav-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.05); }

/* Source pills */
.source-pills {
  display: flex;
  gap: 8px;
  padding: 0 16px 10px;
  align-items: center;
}
.pill {
  padding: 4px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.7);
  border: 1px solid rgba(255,255,255,0.15);
  transition: all 0.2s;
}
.pill.active {
  background: var(--c-grad);
  color: white;
  border-color: transparent;
}
.pill-hint {
  font-size: 12px;
}
.pill-link {
  color: var(--c-accent);
  text-decoration: none;
  font-size: 12px;
}

/* Swipe area */
.swipe-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* State overlays */
.state-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: #000;
  z-index: 10;
  color: var(--c-text-2);
}
.state-icon { font-size: 64px; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
