import { getApiBaseOverride, getHttpAdapter, resolveApiBase } from './httpClient.js'

const COOKIE_KEY = 'ns_moontv_cookie'

function readSessionCookie() {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem(COOKIE_KEY)
}

function extractAuthFromCookie(cookie) {
  if (!cookie) return null
  const match = cookie.match(/auth=([^;]+)/)
  return match ? match[1] : null
}

function writeSessionCookie(value) {
  if (typeof sessionStorage === 'undefined') return
  if (value === null) sessionStorage.removeItem(COOKIE_KEY)
  else sessionStorage.setItem(COOKIE_KEY, value)
}

function addDevProxyTargetHeader(headers, configuredUrl) {
  if (!getApiBaseOverride() || !configuredUrl) return headers

  try {
    const target = new URL(configuredUrl)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return headers
    return {
      ...headers,
      'X-NanoSwipe-MoonTV-Target': target.origin,
    }
  } catch {
    return headers
  }
}

async function apiFetch(configuredUrl, token, path, options = {}) {
  const fetchImpl = getHttpAdapter()
  const base = resolveApiBase(configuredUrl)
  const url = `${base}${path}`

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token && token !== '__cookie__') {
    headers.Authorization = `Bearer ${token}`
  }

  const storedCookie = readSessionCookie()
  if (storedCookie) {
    const auth = extractAuthFromCookie(storedCookie)
    if (auth) {
      headers.Authorization = `Bearer ${auth}`
    }
  }

  const res = await fetchImpl(url, {
    ...options,
    headers: addDevProxyTargetHeader(headers, configuredUrl),
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
  async login(configuredUrl, username, password) {
    const fetchImpl = getHttpAdapter()
    const base = resolveApiBase(configuredUrl)
    const url = `${base}/api/login`

    const res = await fetchImpl(url, {
      method: 'POST',
      credentials: 'include',
      headers: addDevProxyTargetHeader({ 'Content-Type': 'application/json' }, configuredUrl),
      body: JSON.stringify({ username, password }),
    })

    if (res.status === 401 || res.status === 403) {
      throw new Error('账号或密码错误')
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`登录失败 (HTTP ${res.status}${text ? ': ' + text.slice(0, 100) : ''})`)
    }

    const setCookie = res.headers?.get?.('set-cookie')
    if (setCookie) {
      writeSessionCookie(setCookie)
    }

    let data = {}
    try {
      data = await res.json()
    } catch {}

    return data.token || data.access_token || '__cookie__'
  },

  async search(configuredUrl, token, keyword, page = 1) {
    const data = await apiFetch(configuredUrl, token, `/api/search?q=${encodeURIComponent(keyword)}&page=${page}`)
    return data.results || []
  },

  async recommend(configuredUrl, token, page = 1) {
    try {
      const keywords = ['热门', '电影', '剧集', '动漫']
      const kw = keywords[Math.floor(Math.random() * keywords.length)]
      const data = await apiFetch(configuredUrl, token, `/api/search?q=${encodeURIComponent(kw)}&page=${page}`)
      return data.results || []
    } catch {
      return []
    }
  },

  async detail(configuredUrl, token, id, source) {
    const data = await apiFetch(configuredUrl, token, `/api/source-detail?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`)
    return data
  },

  async resolvePlayUrl(configuredUrl, token, playUrl, source, episodeIndex = 0, proxyMode = false) {
    const base = resolveApiBase(configuredUrl)

    if (!playUrl) return ''

    let actualPlayUrl = playUrl

    if (actualPlayUrl.startsWith('/api/') && actualPlayUrl.includes('/play')) {
      try {
        const sep = actualPlayUrl.includes('?') ? '&' : '?'
        const jsonUrl = `${actualPlayUrl}${sep}format=json`
        const data = await apiFetch(configuredUrl, token, jsonUrl)
        if (data && data.url) {
          actualPlayUrl = data.url
        }
      } catch (error) {
        console.warn('[MoonTV] Failed to resolve internal play url', error)
      }
    }

    const isM3u8 = actualPlayUrl.toLowerCase().includes('.m3u8') || actualPlayUrl.toLowerCase().includes('.m3u')

    if (isM3u8 && proxyMode) {
      return this.buildProxyPlayUrl(configuredUrl, actualPlayUrl, source)
    }

    if (actualPlayUrl.startsWith('/')) {
      return `${base}${actualPlayUrl}`
    }

    return actualPlayUrl
  },

  buildProxyPlayUrl(configuredUrl, playUrl, source) {
    const base = resolveApiBase(configuredUrl)
    if (!playUrl) return ''
    return `${base}/api/proxy/vod/m3u8?url=${encodeURIComponent(playUrl)}&source=${encodeURIComponent(source || '')}`
  },

  // MoonTVPlus 的 directplay 通道：`/api/proxy-m3u8` 在 middleware.ts 白名单里、
  // 服务端跳过 source proxyMode 校验。proxyMode=false 的源、CORS 失败、用户手动
  // 强制代理的场景应走这条路径（参考 MoonTVPlus/src/app/play/page.tsx 中
  // `source=directplay` 分支）。
  buildDirectProxyPlayUrl(configuredUrl, playUrl) {
    const base = resolveApiBase(configuredUrl)
    if (!playUrl) return ''
    return `${base}/api/proxy-m3u8?url=${encodeURIComponent(playUrl)}&source=directplay`
  },

  // 与 MoonTVPlus 服务端 m3u8 改写产出一致的 segment URL；服务端会自动重写 m3u8
  // 内容里的分片，所以日常播放不需要前端构造，但保留以便特殊调用与对齐。
  buildProxySegmentUrl(configuredUrl, segUrl, source) {
    const base = resolveApiBase(configuredUrl)
    if (!segUrl) return ''
    return `${base}/api/proxy/vod/segment?url=${encodeURIComponent(segUrl)}&source=${encodeURIComponent(source || '')}`
  },

  buildProxyKeyUrl(configuredUrl, keyUrl, source) {
    const base = resolveApiBase(configuredUrl)
    if (!keyUrl) return ''
    return `${base}/api/proxy/vod/key?url=${encodeURIComponent(keyUrl)}&source=${encodeURIComponent(source || '')}`
  },

  // 与 apiFetch 一致：cookie 登录场景下从 sessionStorage 提取 auth；
  // hls.js xhrSetup 复用此逻辑确保播放请求也带上 Authorization
  resolveAuthToken(token) {
    let authToken = null
    if (token && token !== '__cookie__') authToken = token
    const auth = extractAuthFromCookie(readSessionCookie())
    if (auth) authToken = auth
    return authToken
  },

  async ping(configuredUrl, token) {
    try {
      await apiFetch(configuredUrl, token, '/api/search?q=test')
      return true
    } catch (error) {
      if (error.message === 'UNAUTHORIZED') return 'unauthorized'
      return false
    }
  },

  clearSession() {
    writeSessionCookie(null)
  },
}
