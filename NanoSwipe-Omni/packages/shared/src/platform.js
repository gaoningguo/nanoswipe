export function detectPlatform(globalObject = globalThis) {
  const win = globalObject?.window || globalObject
  const navigator = win?.navigator
  const userAgent = navigator?.userAgent || ''

  const isCapacitor =
    !!win?.Capacitor?.isNativePlatform?.() ||
    !!win?.Capacitor?.getPlatform?.() ||
    userAgent.includes('Capacitor')

  const isTauri = !!win?.__TAURI__ || !!win?.__TAURI_INTERNALS__

  if (isCapacitor) return createPlatformContext('capacitor')
  if (isTauri) return createPlatformContext('tauri')
  return createPlatformContext('web')
}

export function createPlatformContext(platform = 'web') {
  return {
    platform,
    isWeb: platform === 'web',
    isCapacitor: platform === 'capacitor',
    isTauri: platform === 'tauri',
  }
}
