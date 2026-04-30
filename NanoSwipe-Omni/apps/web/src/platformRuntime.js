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

function createTauriFetch() {
  const tauriHttp = window.__TAURI__?.http
  if (!tauriHttp?.fetch) return null

  return async (url, options = {}) => {
    const response = await tauriHttp.fetch(url, {
      method: options.method || 'GET',
      headers: normalizeHeaders(options.headers),
      body: options.body,
      responseType: 1,
    })

    return toResponse(response)
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
    const tauriFetch = createTauriFetch()
    if (tauriFetch) {
      setHttpAdapter(tauriFetch)
    } else {
      console.warn('[NanoSwipe] Tauri HTTP adapter unavailable, falling back to fetch.')
    }
  }

  return platformContext
}
