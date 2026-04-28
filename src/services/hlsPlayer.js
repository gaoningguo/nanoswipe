/**
 * HLS.js Player Service
 * Wraps HLS.js and native video element for seamless playback
 *
 * Key design: when playing MoonTV proxied m3u8 streams, the MoonTV server
 * rewrites TS segment / key URLs to point to its own domain, e.g.
 *   https://tv.example.com/api/proxy/vod/segment?url=...
 * These URLs will be blocked by the browser's CORS policy when loaded from
 * NanoSwipe's origin. To fix this we configure HLS.js's `xhrSetup` to
 * rewrite any request targeting the MoonTV domain into the local Vite proxy
 * path `/moonapi/...`, which in turn forwards the request server-side.
 */
import Hls from 'hls.js'

export class HlsPlayer {
  constructor() {
    this.hls = null
    this.videoEl = null
    this.currentUrl = null
    /** @type {string|null} MoonTV origin to intercept, e.g. "https://tv.example.com" */
    this._moontvOrigin = null
  }

  attach(videoElement) {
    this.videoEl = videoElement
  }

  /**
   * Set the MoonTV origin so that HLS.js sub-requests can be rewritten
   * through the local Vite proxy to avoid CORS.
   * @param {string} originUrl  Full MoonTV URL, e.g. "https://tv.gaoningguo.eu.org"
   */
  setMoontvOrigin(originUrl) {
    if (!originUrl) {
      this._moontvOrigin = null
      return
    }
    try {
      const u = new URL(originUrl)
      this._moontvOrigin = u.origin   // "https://tv.gaoningguo.eu.org"
    } catch {
      this._moontvOrigin = null
    }
  }

  async load(url, type = 'auto') {
    if (!this.videoEl || !url) return

    // Same URL already loaded
    if (this.currentUrl === url) return

    this.currentUrl = url
    this._destroyHls()

    // Only treat as HLS when the URL actually looks like an m3u8 stream
    const isHls =
      type === 'hls' ||
      /\.m3u8?(\?|$)/i.test(url) ||
      url.includes('/proxy/vod/m3u8') ||
      url.includes('/proxy-m3u8')

    if (isHls && Hls.isSupported()) {
      const moontvOrigin = this._moontvOrigin

      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 120,
        maxMaxBufferLength: 300,
        maxBufferSize: 60 * 1024 * 1024, // 60MB
        maxBufferHole: 0.5,
        manuallyPaused: false,
        startLevel: -1,    // auto quality
        abrEwmaDefaultEstimate: 2000000, // 2Mbps initial estimate for faster start
        testBandwidth: false,
        // Rewrite MoonTV-domain requests to go through the local Vite proxy
        xhrSetup: (xhr, requestUrl) => {
          if (moontvOrigin && requestUrl.startsWith(moontvOrigin)) {
            // e.g. "https://tv.example.com/api/proxy/vod/segment?url=..."
            // →   "/moonapi/api/proxy/vod/segment?url=..."
            const proxyUrl = '/moonapi' + requestUrl.slice(moontvOrigin.length)
            xhr.open('GET', proxyUrl, true)
          }
        },
      })
      this.hls.loadSource(url)
      this.hls.attachMedia(this.videoEl)
      return new Promise((resolve, reject) => {
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => resolve())
        this.hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) reject(new Error(data.details))
        })
      })
    } else if (this.videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      this.videoEl.src = url
    } else {
      // Plain MP4 / direct video
      this.videoEl.src = url
    }
  }

  play() {
    return this.videoEl?.play().catch(() => {})
  }

  pause() {
    this.videoEl?.pause()
  }

  get currentTime() {
    return this.videoEl?.currentTime || 0
  }

  get duration() {
    return this.videoEl?.duration || 0
  }

  get paused() {
    return this.videoEl?.paused ?? true
  }

  _destroyHls() {
    if (this.hls) {
      this.hls.destroy()
      this.hls = null
    }
  }

  destroy() {
    this._destroyHls()
    if (this.videoEl) {
      this.videoEl.pause()
      this.videoEl.src = ''
      this.videoEl = null
    }
    this.currentUrl = null
  }
}
