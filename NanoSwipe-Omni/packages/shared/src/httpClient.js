/**
 * Cross-platform HTTP adapter.
 *
 * - Web (PWA): default browser fetch + Vite dev proxy via setApiBaseOverride('/moonapi')
 * - Capacitor: setHttpAdapter(...) injects a CapacitorHttp-backed fetch implementation
 * - Tauri: setHttpAdapter(...) injects a tauri invoke('http_fetch', ...)-backed implementation
 *
 * The MoonTV API and any HLS xhrSetup hook should go through this module so we never
 * hard-code a platform-specific path like "/moonapi".
 */

let httpAdapter = null
let apiBaseOverride = null

/**
 * Inject a fetch-compatible function. The function must accept (url, options)
 * and return a Response (or a Response-like with .ok, .status, .json(), .text(), .headers).
 */
export function setHttpAdapter(fn) {
  httpAdapter = typeof fn === 'function' ? fn : null
}

export function getHttpAdapter() {
  if (httpAdapter) return httpAdapter
  if (typeof fetch !== 'undefined') return fetch
  throw new Error('No HTTP adapter configured and global fetch is unavailable')
}

/**
 * Override the base URL prefix for MoonTV API calls.
 * In web dev mode this should be set to '/moonapi' so requests hit the Vite proxy.
 * In native (capacitor/tauri) leave this null so requests go directly to the configured URL.
 */
export function setApiBaseOverride(base) {
  apiBaseOverride = base ? base.replace(/\/$/, '') : null
}

export function getApiBaseOverride() {
  return apiBaseOverride
}

/**
 * Resolve the effective base URL for an API call.
 *
 * @param {string} configuredUrl  The user-configured upstream URL (e.g. https://tv.example.com)
 * @returns {string}              Either the override base or the trimmed configured URL
 */
export function resolveApiBase(configuredUrl) {
  if (apiBaseOverride) return apiBaseOverride
  return (configuredUrl || '').replace(/\/$/, '')
}

/**
 * Build a URL rewriter for HLS.js xhrSetup hooks.
 *
 * In web dev, sub-resource requests for the configured MoonTV origin must be rewritten
 * to the local Vite proxy path; otherwise the browser blocks them via CORS. On native
 * platforms there is no proxy so this rewriter is a no-op.
 *
 * MoonTV's m3u8 proxy rewrites segment/key URLs using the upstream `referer` request
 * header for the protocol; when NanoSwipe is served on http://localhost the rewritten
 * URLs come back with `http://` even if the user configured an `https://` MoonTV URL.
 * We therefore match by host name only, not the full origin, so both protocols hit the
 * proxy.
 *
 * @param {string|null} originUrl   The configured MoonTV URL (host will be extracted)
 * @returns {(requestUrl: string) => string|null}  null when no rewrite needed
 */
export function makeHlsUrlRewriter(originUrl) {
  if (!apiBaseOverride || !originUrl) return () => null

  let originHost
  try {
    originHost = new URL(originUrl).host
  } catch {
    return () => null
  }

  const proxy = apiBaseOverride
  return (requestUrl) => {
    if (typeof requestUrl !== 'string') return null
    let parsed
    try {
      parsed = new URL(requestUrl)
    } catch {
      return null
    }
    if (parsed.host !== originHost) return null
    return proxy + parsed.pathname + parsed.search + parsed.hash
  }
}
