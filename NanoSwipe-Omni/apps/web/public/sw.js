/**
 * NanoSwipe Omni service worker.
 *
 * Strategy:
 *  - Precache the app shell (HTML, manifest, icon) on install
 *  - Runtime-cache same-origin static assets (JS/CSS/images) with stale-while-revalidate
 *  - Bypass cache entirely for API calls, HLS streams, and any cross-origin request
 *  - For navigation requests, fall back to the cached shell when offline
 */

const SHELL_CACHE = 'nanoswipe-shell-v2'
const RUNTIME_CACHE = 'nanoswipe-runtime-v2'
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
]

// URL prefixes that must always hit the network (never cached).
const NETWORK_ONLY_PATTERNS = [
  '/moonapi/',     // dev proxy to MoonTV
  '/api/',         // any direct backend call
]

// File extensions that look like HLS streams or media segments.
const MEDIA_EXT_RE = /\.(m3u8?|ts|mp4|webm|key)(\?|$)/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Skip cross-origin entirely — let the browser handle it (CORS rules apply normally).
  if (url.origin !== self.location.origin) return

  // Skip API calls and media streams — they should never be cached.
  if (NETWORK_ONLY_PATTERNS.some((p) => url.pathname.startsWith(p))) return
  if (MEDIA_EXT_RE.test(url.pathname)) return

  // Navigation requests: network-first with shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request)
      } catch {
        const shell = await caches.match('/index.html')
        if (shell) return shell
        return Response.error()
      }
    })())
    return
  }

  // Static assets: stale-while-revalidate.
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE)
    const cached = await cache.match(request)
    const network = fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(request, response.clone())
        }
        return response
      })
      .catch(() => null)

    return cached || (await network) || Response.error()
  })())
})
