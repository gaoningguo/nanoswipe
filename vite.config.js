import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const moontvTarget = env.VITE_MOONTV_URL || 'https://tv.gaoningguo.eu.org'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 3333,
      host: true,
      proxy: {
        // Proxy /moonapi/* → MoonTV instance (bypasses browser CORS)
        '/moonapi': {
          target: moontvTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/moonapi/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log(`[MoonTV Proxy] ${req.method} ${req.url} → ${moontvTarget}`)
            })
            proxy.on('error', (err) => console.error('[MoonTV Proxy Error]', err.message))
          },
        },
      },
    },
  }
})
