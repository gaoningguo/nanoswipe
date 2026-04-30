<template>
  <div class="settings-view">
    <!-- Header -->
    <header class="settings-header">
      <button class="back-btn" @click="$router.back()">←</button>
      <h1 class="settings-title">设置</h1>
      <div style="width:40px" />
    </header>

    <div class="settings-body">
      <!-- ===================== Section: MoonTV ===================== -->
      <section class="settings-section">
        <div class="section-title">
          <span class="section-icon">🌙</span>
          MoonTVPlus 接入
        </div>

        <div class="card">
          <div class="status-row">
            <div>
              <div class="label">连接状态</div>
              <div class="status-val" :class="moontvConnected ? 'status-ok' : 'status-off'">
                {{ moontvConnected ? '✓ 已连接' : '未连接' }}
              </div>
            </div>
            <span class="status-dot" :class="{ connected: moontvConnected }" />
          </div>

          <div class="form-group">
            <label class="form-label">实例地址</label>
            <input v-model="moontvUrl" class="ns-input" placeholder="https://tv.example.com" />
          </div>
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input v-model="moontvUser" class="ns-input" placeholder="admin" autocomplete="username" />
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input v-model="moontvPass" type="password" class="ns-input" placeholder="••••••••" autocomplete="current-password" />
          </div>

          <div class="btn-row">
            <button
              class="ns-btn ns-btn-primary"
              :disabled="loginLoading"
              @click="connectMoontv"
              style="flex:1"
            >
              {{ loginLoading ? '连接中...' : (moontvConnected ? '重新连接' : '连接') }}
            </button>
            <button
              v-if="moontvConnected"
              class="ns-btn ns-btn-ghost disconnect-btn"
              @click="disconnectMoontv"
            >断开</button>
          </div>

          <p v-if="loginError" class="error-msg">{{ loginError }}</p>

          <div class="tip-box">
            <p>✅ 开发模式已通过 <code>Vite 代理</code> 自动转发请求，无需配置 CORS。</p>
            <p style="margin-top:6px">⚠️ 部署到线上后若遇到跨域问题，需在 MoonTV 的 Nginx/Cloudflare 中添加 <code>Access-Control-Allow-Origin</code> 响应头。</p>
          </div>
        </div>
      </section>

      <!-- ===================== Section: Custom Videos ===================== -->
      <section class="settings-section">
        <div class="section-title">
          <span class="section-icon">📁</span>
          自定义视频列表
        </div>

        <!-- Add video form -->
        <div class="card">
          <div class="form-group">
            <label class="form-label">视频标题</label>
            <input v-model="newTitle" class="ns-input" placeholder="视频名称（可选）" />
          </div>
          <div class="form-group">
            <label class="form-label">视频地址 *</label>
            <input v-model="newUrl" class="ns-input" placeholder="https://example.com/video.mp4 或 .m3u8" />
          </div>
          <div class="form-group">
            <label class="form-label">封面图（可选）</label>
            <input v-model="newCover" class="ns-input" placeholder="https://example.com/cover.jpg" />
          </div>
          <button
            class="ns-btn ns-btn-primary"
            style="width:100%"
            :disabled="!newUrl.trim()"
            @click="addVideo"
          >+ 添加视频</button>
        </div>

        <!-- Video list -->
        <div class="video-list">
          <div
            v-for="video in sourceStore.customVideos"
            :key="video.id"
            class="video-item"
          >
            <div class="video-item-thumb">
              <img v-if="video.cover" :src="video.cover" :alt="video.title" />
              <span v-else>🎬</span>
            </div>
            <div class="video-item-info">
              <div class="video-item-title">{{ video.title }}</div>
              <div class="video-item-url">{{ video.url }}</div>
            </div>
            <button class="delete-btn" @click="removeVideo(video.id)">🗑</button>
          </div>

          <div class="empty-videos" v-if="sourceStore.customVideos.length === 0">
            <span>暂无自定义视频</span>
          </div>
        </div>
      </section>

      <!-- ===================== Section: Bulk Import ===================== -->
      <section class="settings-section">
        <div class="section-title">
          <span class="section-icon">📋</span>
          批量导入（JSON）
        </div>
        <div class="card">
          <p class="tip-text">粘贴以下格式的 JSON 导入多条视频：</p>
          <pre class="code-hint">[{"title":"视频名","url":"https://..."}]</pre>
          <textarea
            v-model="importJson"
            class="ns-input json-textarea"
            placeholder='[{"title":"...","url":"https://..."}]'
            rows="4"
          />
          <button
            class="ns-btn ns-btn-primary"
            style="width:100%;margin-top:8px"
            @click="importVideos"
          >导入</button>
          <p v-if="importMsg" class="import-msg" :class="{ error: importError }">{{ importMsg }}</p>
        </div>
      </section>

      <!-- ===================== Section: Playback ===================== -->
      <section class="settings-section">
        <div class="section-title">
          <span class="section-icon">▶️</span>
          播放设置
        </div>
        <div class="card">
          <div class="toggle-row">
            <div>
              <div class="label">循环播放</div>
              <div class="sublabel">每个视频播完后重新播放</div>
            </div>
            <button
              class="toggle-btn"
              :class="{ on: playerStore.isLooping }"
              @click="playerStore.toggleLoop()"
            >
              <span class="toggle-knob" />
            </button>
          </div>
          <div class="toggle-row">
            <div>
              <div class="label">静音启动</div>
              <div class="sublabel">以静音方式自动播放（遵循浏览器策略）</div>
            </div>
            <button
              class="toggle-btn"
              :class="{ on: playerStore.isMuted }"
              @click="playerStore.toggleMute()"
            >
              <span class="toggle-knob" />
            </button>
          </div>
        </div>
      </section>

      <!-- ===================== Section: About ===================== -->
      <section class="settings-section">
        <div class="card about-card">
          <div class="about-logo">
            <div class="about-icon">▶</div>
            <div>
              <div class="about-name">NanoSwipe</div>
              <div class="about-ver">v1.0.0</div>
            </div>
          </div>
          <p class="about-desc">TikTok 风格视频刷刷刷，支持自定义视频源与 MoonTVPlus。</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSourceStore } from '../stores/source.js'
import { usePlayerStore } from '../stores/player.js'
import { moontvApi } from '../services/moontvApi.js'

const sourceStore = useSourceStore()
const playerStore = usePlayerStore()

// MoonTV form
const moontvUrl = ref(sourceStore.moontvUrl)
const moontvUser = ref('')
const moontvPass = ref('')
const loginLoading = ref(false)
const loginError = ref('')
const moontvConnected = ref(!!sourceStore.moontvToken)

async function connectMoontv() {
  if (!moontvUrl.value.trim()) {
    loginError.value = '请输入实例地址'
    return
  }
  loginLoading.value = true
  loginError.value = ''
  try {
    const token = await moontvApi.login(moontvUrl.value, moontvUser.value, moontvPass.value)
    sourceStore.saveMoontvConfig(moontvUrl.value, token)
    moontvConnected.value = true
    moontvPass.value = ''
    loginError.value = ''
  } catch (e) {
    console.error('[MoonTV login error]', e)
    if (e.message.includes('401') || e.message.includes('403') || e.message.includes('账号')) {
      loginError.value = '❌ 账号或密码错误，请重新检查'
    } else if (e.message.includes('fetch') || e.message.includes('Failed')) {
      loginError.value = '❌ 网络连接失败：请确认实例地址是否正确，以及开发服务器正在运行'
    } else {
      loginError.value = '❌ 连接失败：' + e.message
    }
  } finally {
    loginLoading.value = false
  }
}

function disconnectMoontv() {
  sourceStore.clearMoontvToken()
  moontvConnected.value = false
  if (sourceStore.activeSource === 'moontv') {
    sourceStore.setActiveSource('custom')
  }
}

// Custom video form
const newTitle = ref('')
const newUrl = ref('')
const newCover = ref('')

function addVideo() {
  if (!newUrl.value.trim()) return
  sourceStore.addCustomVideo({
    title: newTitle.value || newUrl.value,
    url: newUrl.value,
    cover: newCover.value,
  })
  newTitle.value = ''
  newUrl.value = ''
  newCover.value = ''
  // Reload if using custom source
  if (sourceStore.activeSource === 'custom') {
    playerStore.loadCustomVideos()
  }
}

function removeVideo(id) {
  sourceStore.removeCustomVideo(id)
  if (sourceStore.activeSource === 'custom') {
    playerStore.loadCustomVideos()
  }
}

// Bulk import
const importJson = ref('')
const importMsg = ref('')
const importError = ref(false)

function importVideos() {
  importMsg.value = ''
  importError.value = false
  try {
    const list = JSON.parse(importJson.value)
    if (!Array.isArray(list)) throw new Error('应为数组格式')
    let count = 0
    for (const item of list) {
      if (item.url) {
        sourceStore.addCustomVideo(item)
        count++
      }
    }
    importMsg.value = `成功导入 ${count} 条视频`
    importJson.value = ''
    if (sourceStore.activeSource === 'custom') playerStore.loadCustomVideos()
  } catch (e) {
    importError.value = true
    importMsg.value = 'JSON 格式错误：' + e.message
  }
}
</script>

<style scoped>
.settings-view {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg);
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  padding-top: calc(14px + env(safe-area-inset-top, 0px));
  border-bottom: 1px solid var(--c-border);
  background: var(--c-surface);
}
.back-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: background 0.15s;
}
.back-btn:hover { background: rgba(255,255,255,0.15); }
.settings-title {
  font-size: 18px;
  font-weight: 700;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text-3);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.section-icon { font-size: 16px; }

.card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Status */
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.label { font-size: 14px; font-weight: 600; }
.sublabel { font-size: 12px; color: var(--c-text-3); margin-top: 2px; }
.status-val { font-size: 13px; margin-top: 4px; }
.status-ok { color: #4ade80; }
.status-off { color: var(--c-text-3); }
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--c-text-3);
}
.status-dot.connected { background: #4ade80; box-shadow: 0 0 8px #4ade80; }

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn-row {
  display: flex;
  gap: 10px;
}
.disconnect-btn { flex-shrink: 0; }

.error-msg {
  font-size: 13px;
  color: #f87171;
  margin-top: -4px;
}

.tip-box {
  background: rgba(255,56,92,0.08);
  border: 1px solid rgba(255,56,92,0.2);
  border-radius: 10px;
  padding: 10px 12px;
}
.tip-box p { font-size: 12px; color: rgba(255,255,255,0.65); line-height: 1.5; }
.tip-box code { background: rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 4px; font-size: 11px; }

/* Video list */
.video-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.video-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 12px;
}
.video-item-thumb {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: rgba(255,255,255,0.06);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.video-item-thumb img { width: 100%; height: 100%; object-fit: cover; }
.video-item-info { flex: 1; min-width: 0; }
.video-item-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.video-item-url { font-size: 11px; color: var(--c-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.delete-btn { font-size: 18px; flex-shrink: 0; opacity: 0.5; transition: opacity 0.15s; }
.delete-btn:hover { opacity: 1; }

.empty-videos {
  text-align: center;
  padding: 24px;
  color: var(--c-text-3);
  font-size: 13px;
}

/* Bulk import */
.tip-text { font-size: 13px; color: var(--c-text-3); }
.code-hint {
  background: rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--c-text-2);
  font-family: monospace;
  overflow-x: auto;
  white-space: pre;
}
.json-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: monospace;
  font-size: 12px;
}
.import-msg {
  font-size: 13px;
  color: #4ade80;
}
.import-msg.error { color: #f87171; }

/* Toggle switch */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.toggle-btn {
  width: 48px;
  height: 28px;
  border-radius: 14px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.15);
  position: relative;
  transition: background 0.25s;
  flex-shrink: 0;
}
.toggle-btn.on {
  background: var(--c-grad);
  border-color: transparent;
}
.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  transition: transform 0.25s var(--ease-spring);
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.toggle-btn.on .toggle-knob {
  transform: translateX(20px);
}

/* About */
.about-card { align-items: flex-start; }
.about-logo {
  display: flex;
  align-items: center;
  gap: 12px;
}
.about-icon {
  width: 40px;
  height: 40px;
  background: var(--c-grad);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: white;
}
.about-name { font-size: 16px; font-weight: 700; }
.about-ver { font-size: 12px; color: var(--c-text-3); }
.about-desc { font-size: 13px; color: var(--c-text-3); line-height: 1.5; }
</style>
