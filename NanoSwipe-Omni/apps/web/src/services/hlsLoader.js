// HLS.js custom loader that routes manifest/segment requests through the
// shared HTTP adapter. On Tauri this bypasses webview CORS by using the
// native HTTP client; on plain web it falls back to global fetch.
//
// Also injects MoonTV bearer auth when the request URL is on the user's
// MoonTV instance host, so segment/key fetches succeed in production builds.

import { getHttpAdapter, moontvApi } from '@nanoswipe/shared'

function makeAuthResolver(moontvUrl, token) {
  let host = ''
  try {
    host = moontvUrl ? new URL(moontvUrl).host : ''
  } catch {
    host = ''
  }
  return (requestUrl) => {
    if (!host || typeof requestUrl !== 'string') return null
    let parsed
    try {
      parsed = new URL(requestUrl)
    } catch {
      return null
    }
    if (parsed.host !== host) return null
    const auth = moontvApi.resolveAuthToken(token)
    return auth ? `Bearer ${auth}` : null
  }
}

export function createHlsLoader({ getMoontvUrl, getMoontvToken, urlRewriter } = {}) {
  return class AdapterHlsLoader {
    constructor(config) {
      this.config = config
      this.aborted = false
      this.controller = null
      this.stats = {
        aborted: false,
        loaded: 0,
        retry: 0,
        total: 0,
        chunkCount: 0,
        bwEstimate: 0,
        loading: { start: 0, first: 0, end: 0 },
        parsing: { start: 0, end: 0 },
        buffering: { start: 0, first: 0, end: 0 },
      }
    }

    abort() {
      this.aborted = true
      this.stats.aborted = true
      try { this.controller?.abort() } catch {}
    }

    destroy() {
      this.abort()
    }

    getResponseHeader(name) {
      const headers = this.response?.headers
      if (!headers || typeof headers.get !== 'function' || !name) return null
      return headers.get(name)
    }

    async load(context, config, callbacks) {
      this.context = context
      this.callbacks = callbacks

      const stats = this.stats
      stats.loading.start = performance.now()

      let url = context.url
      const rewritten = urlRewriter ? urlRewriter(url) : null
      if (rewritten) url = rewritten

      const headers = {}
      if (context.rangeStart !== undefined && context.rangeEnd !== undefined) {
        headers.Range = `bytes=${context.rangeStart}-${context.rangeEnd - 1}`
      }
      const auth = makeAuthResolver(getMoontvUrl?.(), getMoontvToken?.())(url)
      if (auth) headers.Authorization = auth

      try {
        this.controller = typeof AbortController !== 'undefined' ? new AbortController() : null
        const fetchImpl = getHttpAdapter()
        const response = await fetchImpl(url, {
          method: 'GET',
          headers,
          signal: this.controller?.signal,
        })

        if (this.aborted) return

        this.response = response

        if (!response.ok) {
          callbacks.onError(
            { code: response.status, text: response.statusText || `HTTP ${response.status}` },
            context,
            null,
            stats,
          )
          return
        }

        stats.loading.first = performance.now()

        const data = context.responseType === 'arraybuffer'
          ? await response.arrayBuffer()
          : await response.text()

        if (this.aborted) return

        stats.loading.end = performance.now()
        stats.loaded = stats.total = data.byteLength !== undefined ? data.byteLength : data.length

        callbacks.onSuccess(
          { url: response.url || url, data },
          stats,
          context,
          response,
        )
      } catch (error) {
        if (this.aborted) return
        callbacks.onError({ code: 0, text: error?.message || 'Network error' }, context, null, stats)
      }
    }
  }
}
