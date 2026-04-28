<template>
  <Teleport to="body">
    <div class="search-modal-bg" @click.self="emit('close')">
      <div class="search-modal glass">
        <!-- Header -->
        <div class="modal-header">
          <h3 class="modal-title">搜索影视</h3>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>

        <!-- Search input -->
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input
            ref="inputRef"
            v-model="keyword"
            class="ns-input search-input"
            placeholder="输入影片名称..."
            @keydown.enter="doSearch"
            @keydown.esc="emit('close')"
          />
          <button v-if="keyword" class="clear-btn" @click="keyword = ''">✕</button>
        </div>

        <!-- Search button -->
        <button
          class="ns-btn ns-btn-primary search-btn"
          :disabled="!keyword.trim() || playerStore.searchLoading"
          @click="doSearch"
        >
          <span v-if="playerStore.searchLoading">搜索中...</span>
          <span v-else>搜索</span>
        </button>

        <!-- Results -->
        <div class="results-area" v-if="playerStore.searchResults.length > 0 || playerStore.searchLoading">
          <div v-if="playerStore.searchLoading" class="results-loading">
            <div class="ns-spinner" />
            <span>正在搜索...</span>
          </div>
          <div v-else class="results-grid">
            <div
              v-for="item in playerStore.searchResults"
              :key="`${item.source}-${item.id}`"
              class="result-card"
              @click="playResult(item)"
            >
              <div class="result-poster">
                <img v-if="item.poster" :src="item.poster" :alt="item.title" loading="lazy" />
                <div v-else class="poster-placeholder">
                  <span>🎬</span>
                </div>
              </div>
              <div class="result-info">
                <div class="result-title">{{ item.title }}</div>
                <div class="result-meta">
                  <span v-if="item.year" class="result-year">{{ item.year }}</span>
                  <span v-if="item.type_name" class="result-type">{{ item.type_name }}</span>
                </div>
                <div class="result-source">{{ item.source_name || item.source }}</div>
              </div>
              <button class="play-now-btn">▶</button>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div class="empty-state" v-else-if="searched && !playerStore.searchLoading">
          <span class="empty-icon">🔭</span>
          <p>没有找到相关结果</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { usePlayerStore } from '../stores/player.js'

const emit = defineEmits(['close'])
const playerStore = usePlayerStore()

const keyword = ref('')
const inputRef = ref(null)
const searched = ref(false)

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
})

async function doSearch() {
  if (!keyword.value.trim()) return
  searched.value = true
  await playerStore.search(keyword.value)
}

async function playResult(item) {
  await playerStore.playSearchResult(item)
  emit('close')
}

import { nextTick } from 'vue'
</script>

<style scoped>
.search-modal-bg {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: flex-end;
  animation: fadeIn 0.2s ease;
}

.search-modal {
  width: 100%;
  max-height: 85dvh;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px;
  padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: slideUp 0.3s var(--ease-snap);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-title {
  font-size: 18px;
  font-weight: 700;
}
.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--c-text-2);
  transition: background 0.2s;
}
.close-btn:hover { background: rgba(255,255,255,0.2); }

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 14px;
  font-size: 16px;
  pointer-events: none;
}
.search-input {
  padding-left: 40px;
  padding-right: 36px;
  font-size: 16px;
}
.clear-btn {
  position: absolute;
  right: 12px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  font-size: 10px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-btn {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  font-size: 15px;
}
.search-btn:disabled {
  opacity: 0.5;
  pointer-events: none;
}

.results-area {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.results-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
  color: var(--c-text-3);
}

.results-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}
.result-card:hover, .result-card:active {
  background: rgba(255,56,92,0.1);
  border-color: rgba(255,56,92,0.3);
  transform: scale(0.99);
}

.result-poster {
  width: 56px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255,255,255,0.08);
}
.result-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.poster-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.result-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.result-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.result-meta {
  display: flex;
  gap: 6px;
}
.result-year, .result-type {
  font-size: 11px;
  color: var(--c-text-3);
  padding: 2px 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
}
.result-source {
  font-size: 11px;
  color: var(--c-accent);
  font-weight: 500;
}

.play-now-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FF385C, #FF6B35);
  color: white;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s;
}
.play-now-btn:hover { transform: scale(1.1); }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  color: var(--c-text-3);
}
.empty-icon { font-size: 48px; }
</style>
