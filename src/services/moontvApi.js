/**
 * MoonTVPlus API Service
 *
 * 开发模式：请求走 Vite 代理 /moonapi/*，代理转发到实际 MoonTV 实例（绕过 CORS）
 * 生产模式：需要 MoonTV 实例配置允许跨域，或使用同源部署
 */

// Cookie storage key
const COOKIE_KEY = 'ns_moontv_cookie'

/**
 * Build the effective base URL:
 * - In dev, Vite proxies /moonapi/* → MoonTV, so we use a local path
 * - In prod, we use the configured remote URL directly
 */
function getEffectiveBase(configuredUrl) {
  // If the configured URL points to the same origin or is relative, use it directly
  // Otherwise use the Vite proxy path (only works in dev)
  if (import.meta.env.DEV) {
    return '/moonapi'
  }
  return configuredUrl.replace(/\/$/, '')
}

/**
 * Persist proxy target so vite.config knows which URL to proxy to.
 * In dev mode the proxy target is hardcoded in vite.config (tv.gaoningguo.eu.org).
 * If the user changes URL and needs a different proxy, they'd restart dev server.
 */

async function apiFetch(configuredUrl, token, path, options = {}) {
  const base = getEffectiveBase(configuredUrl)
  const url = `${base}${path}`

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // If token is a JWT, use it
  if (token && token !== '__cookie__') {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Attach stored cookie if present via Authorization header 
  // (Browser prevents setting Cookie header programmatically via fetch)
  const storedCookie = sessionStorage.getItem(COOKIE_KEY)
  if (storedCookie) {
    const match = storedCookie.match(/auth=([^;]+)/)
    if (match) {
      // MoonTVPlus auth.ts parses Authorization: Bearer <token>
      headers['Authorization'] = `Bearer ${match[1]}`
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (res.status === 401) {
    throw new Error('UNAUTHORIZED')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${text ? ': ' + text.slice(0, 100) : ''}`)
  }
  return res.json()
}

export const moontvApi = {
  /**
   * Login to MoonTVPlus.
   * MoonTV uses cookie-based auth (set-cookie on successful login).
   */
  async login(configuredUrl, username, password) {
    const base = getEffectiveBase(configuredUrl)
    const url = `${base}/api/login`

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (res.status === 401 || res.status === 403) {
      throw new Error('账号或密码错误')
    }
    if (!res.ok) {
      throw new Error(`登录失败 (HTTP ${res.status})`)
    }

    // Try to capture Set-Cookie for later requests
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      sessionStorage.setItem(COOKIE_KEY, setCookie)
    }

    let data = {}
    try { data = await res.json() } catch {}

    // Some deployments return JWT token in body, others use cookies only
    return data.token || data.access_token || '__cookie__'
  },

  /**
   * Search videos
   */
  async search(configuredUrl, token, keyword, page = 1) {
    const data = await apiFetch(
      configuredUrl, token,
      `/api/search?q=${encodeURIComponent(keyword)}&page=${page}`
    )
    return data.results || []
  },

  /**
   * Get recommended / home content
   */
  async recommend(configuredUrl, token, page = 1) {
    // /api/home no longer exists in MoonTVPlus; use search fallback as pseudo-recommendation
    try {
      const keywords = ['热门', '电影', '剧集', '动漫']
      const kw = keywords[Math.floor(Math.random() * keywords.length)]
      const data = await apiFetch(
        configuredUrl, token,
        `/api/search?q=${encodeURIComponent(kw)}&page=${page}`
      )
      return data.results || []
    } catch {
      return []
    }
  },

  /**
   * Get detail for a video (episodes + play URLs)
   */
  async detail(configuredUrl, token, id, source) {
    const data = await apiFetch(
      configuredUrl, token,
      `/api/source-detail?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`
    )
    return data
  },

  /**
   * Resolve a play URL to the final streaming address.
   *
   * @param {string}  configuredUrl  MoonTV instance URL
   * @param {string}  token          Auth token
   * @param {string}  playUrl        Raw episode play URL
   * @param {string}  source         Source key (e.g. "wolong", "dbzy")
   * @param {number}  episodeIndex   Episode index
   * @param {boolean} proxyMode      Whether this source has proxy mode enabled on the server
   */
  async resolvePlayUrl(configuredUrl, token, playUrl, source, episodeIndex = 0, proxyMode = false) {
    const base = getEffectiveBase(configuredUrl)

    if (!playUrl) return ''

    let actualPlayUrl = playUrl

    // If it's a relative API route (e.g. /api/xiaoya/play or /api/openlist/play)
    if (actualPlayUrl.startsWith('/api/') && actualPlayUrl.includes('/play')) {
      try {
        const sep = actualPlayUrl.includes('?') ? '&' : '?'
        const jsonUrl = `${actualPlayUrl}${sep}format=json`
        const data = await apiFetch(configuredUrl, token, jsonUrl)
        if (data && data.url) {
          actualPlayUrl = data.url
        }
      } catch (e) {
        console.warn('[MoonTV] Failed to resolve internal play url', e)
      }
    }

    const isM3u8 = actualPlayUrl.toLowerCase().includes('.m3u8') || actualPlayUrl.toLowerCase().includes('.m3u')

    // Only use the MoonTV proxy when proxyMode is enabled for this source.
    // The server returns 403 for sources without proxyMode.
    // Also, if the server is in the US, domestic CDNs will block it, so directplay is necessary.
    if (isM3u8 && proxyMode) {
      return `${base}/api/proxy/vod/m3u8?url=${encodeURIComponent(actualPlayUrl)}&source=${encodeURIComponent(source)}`
    }

    if (actualPlayUrl.startsWith('/')) {
      return `${base}${actualPlayUrl}`
    }

    return actualPlayUrl
  },

  /**
   * Ping to check if authenticated
   */
  async ping(configuredUrl, token) {
    try {
      await apiFetch(configuredUrl, token, '/api/search?q=test')
      return true
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') return 'unauthorized'
      return false
    }
  },

  clearSession() {
    sessionStorage.removeItem(COOKIE_KEY)
  },
}
