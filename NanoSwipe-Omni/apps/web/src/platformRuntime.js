import { detectPlatform, setApiBaseOverride, setHttpAdapter } from '@nanoswipe/shared'

function normalizeHeaders(headers = {}) {
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  return { ...headers }
}

function toResponse({ data, status = 200, headers = {} }) {
  if (data instanceof Blob || data instanceof ArrayBuffer) {
    return new Response(data, { status, headers })
  }

  const body = typeof data === 'string' ? data : JSON.stringify(data ?? null)
  return new Response(body, { status, headers })
}

async function createCapacitorFetch() {
  const { CapacitorHttp } = await import('@capacitor/core')

  return async (url, options = {}) => {
    const method = options.method || 'GET'
    const headers = normalizeHeaders(options.headers)
    const body = options.body
    let data = body

    if (typeof body === 'string' && headers['Content-Type']?.includes('application/json')) {
      try {
        data = JSON.parse(body)
      } catch {
        data = body
      }
    }

    const response = await CapacitorHttp.request({
      url,
      method,
      headers,
      data,
    })

    return toResponse(response)
  }
}

async function createTauriFetch() {
  const { fetch, Body, ResponseType } = await import('@tauri-apps/api/http')

  const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  function toTauriBody(rawBody, headers) {
    if (rawBody == null) return undefined
    const contentType = headers['Content-Type'] || headers['content-type'] || ''

    if (rawBody instanceof ArrayBuffer) return Body.bytes(new Uint8Array(rawBody))
    if (ArrayBuffer.isView(rawBody)) return Body.bytes(new Uint8Array(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength))

    if (typeof rawBody === 'string') {
      if (contentType.includes('application/json')) {
        try {
          return Body.json(JSON.parse(rawBody))
        } catch {
          return Body.text(rawBody)
        }
      }
      return Body.text(rawBody)
    }

    if (typeof rawBody === 'object') {
      return Body.json(rawBody)
    }

    return Body.text(String(rawBody))
  }

  function originFromUrl(url) {
    try {
      const parsed = new URL(url)
      return `${parsed.protocol}//${parsed.host}/`
    } catch {
      return null
    }
  }

  function withDefaultHeaders(url, headers) {
    const merged = { ...headers }
    if (!merged['User-Agent'] && !merged['user-agent']) {
      merged['User-Agent'] = BROWSER_UA
    }
    if (!merged['Referer'] && !merged['referer']) {
      const referer = originFromUrl(url)
      if (referer) merged['Referer'] = referer
    }
    return merged
  }

  return async (url, options = {}) => {
    const headers = withDefaultHeaders(url, normalizeHeaders(options.headers))
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: toTauriBody(options.body, headers),
      responseType: ResponseType.Binary,
    })

    let bodyData = response.data
    if (Array.isArray(bodyData)) {
      bodyData = new Uint8Array(bodyData)
    }

    const status = Number.isFinite(response.status) && response.status >= 200 && response.status <= 599
      ? response.status
      : 200
    const noBodyStatus = status === 204 || status === 205 || status === 304

    return new Response(noBodyStatus ? null : (bodyData ?? null), {
      status,
      headers: response.headers,
    })
  }
}

export async function configurePlatformRuntime() {
  const platformContext = detectPlatform()

  if (platformContext.isWeb && import.meta.env.DEV) {
    setApiBaseOverride('/moonapi')
  }

  if (platformContext.isCapacitor) {
    try {
      setHttpAdapter(await createCapacitorFetch())
    } catch (error) {
      console.warn('[NanoSwipe] Capacitor HTTP adapter unavailable, falling back to fetch:', error)
    }
  }

  if (platformContext.isTauri) {
    try {
      setHttpAdapter(await createTauriFetch())
    } catch (error) {
      console.warn('[NanoSwipe] Tauri HTTP adapter unavailable, falling back to fetch:', error)
    }
  }

  return platformContext
}
