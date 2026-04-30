import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const MOONTV_TARGET_HEADER = 'x-nanoswipe-moontv-target'

function loadMergedEnv(mode) {
  const legacyRoot = resolve(__dirname, '../../..')
  const omniRoot = resolve(__dirname, '../..')
  const appRoot = __dirname

  return {
    ...loadEnv(mode, legacyRoot, ''),
    ...loadEnv(mode, omniRoot, ''),
    ...loadEnv(mode, appRoot, ''),
  }
}

function normalizeMoonTvTarget(value, fallback) {
  try {
    const url = new URL(value || fallback)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback
    return url.origin
  } catch {
    return fallback
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined))
    req.on('error', reject)
  })
}

function moontvDevProxy(defaultTarget) {
  return {
    name: 'nanoswipe-moontv-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/moonapi', async (req, res) => {
        const target = normalizeMoonTvTarget(req.headers[MOONTV_TARGET_HEADER], defaultTarget)
        const requestPath = req.url?.startsWith('/moonapi')
          ? req.url.replace(/^\/moonapi/, '') || '/'
          : req.url || '/'
        const url = new URL(requestPath, target)

        const headers = { ...req.headers }
        delete headers.host
        delete headers.connection
        delete headers['content-length']
        delete headers['accept-encoding']
        delete headers.expect
        delete headers.origin
        delete headers['sec-fetch-dest']
        delete headers['sec-fetch-mode']
        delete headers['sec-fetch-site']
        delete headers[MOONTV_TARGET_HEADER]

        // MoonTV 的 m3u8 代理路由从 `referer` 推断子资源 URL 的协议（详见
        // MoonTVPlus/src/app/api/proxy/vod/m3u8/route.ts:rewriteM3U8Content），
        // 浏览器在 localhost 发出的 referer 是 http，会让重写出的 segment/key URL
        // 协议跟用户配置的 `moontvUrl`(https) 不一致。这里把 referer 改写成上游
        // origin，确保返回的 m3u8 子资源 URL 用的是上游同协议同 host。
        headers.referer = `${target}/`

        try {
          const body = req.method === 'GET' || req.method === 'HEAD'
            ? undefined
            : await readRequestBody(req)

          console.log(`[MoonTV Proxy] ${req.method} ${requestPath} -> ${target}`)

          const upstream = await fetch(url, {
            method: req.method,
            headers,
            body,
            redirect: 'manual',
          })

          res.statusCode = upstream.status

          // Set-Cookie 必须独立处理：Headers WebAPI 的 forEach 会把多值合并成
          // 单个逗号分隔字符串（cookie 的 Expires 字段含逗号，会破坏 cookie 解析）。
          // undici 的 Headers.getSetCookie() 会原样返回字符串数组。
          const setCookies = typeof upstream.headers.getSetCookie === 'function'
            ? upstream.headers.getSetCookie()
            : []
          if (setCookies.length > 0) {
            res.setHeader('Set-Cookie', setCookies)
          }

          upstream.headers.forEach((value, key) => {
            const lk = key.toLowerCase()
            if (lk === 'set-cookie') return
            if (lk === 'content-encoding' || lk === 'content-length' || lk === 'transfer-encoding') return
            res.setHeader(key, value)
          })

          const buffer = Buffer.from(await upstream.arrayBuffer())
          res.end(buffer)
        } catch (error) {
          const message = error.cause?.message || error.message
          console.error('[MoonTV Proxy Error]', message)
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            error: 'MoonTV proxy failed',
            message,
            target,
          }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadMergedEnv(mode)
  const moontvTarget = env.VITE_MOONTV_URL || 'https://tv.gaoningguo.eu.org'

  return {
    plugins: [vue(), moontvDevProxy(moontvTarget)],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@nanoswipe/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
    server: {
      port: 3333,
      host: true,
    },
  }
})
