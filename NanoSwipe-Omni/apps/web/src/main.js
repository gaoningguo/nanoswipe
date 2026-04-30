import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index.js'
import './style.css'
import { configurePlatformRuntime } from './platformRuntime.js'

const platformContext = await configurePlatformRuntime()

if (platformContext.isWeb && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error)
    })
  })
}

const app = createApp(App)

app.provide('platformContext', platformContext)
app.config.globalProperties.$platform = platformContext
app.use(createPinia())
app.use(router)
app.mount('#app')
