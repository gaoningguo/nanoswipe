const DEFAULT_STORAGE_TYPE = 'localStorage'

function getBrowserStorage(storageType = DEFAULT_STORAGE_TYPE) {
  if (typeof window === 'undefined') return null

  try {
    return window[storageType] || null
  } catch {
    return null
  }
}

export function readStorage(key, fallback = '', storageType = DEFAULT_STORAGE_TYPE) {
  const storage = getBrowserStorage(storageType)
  if (!storage) return fallback

  const value = storage.getItem(key)
  return value === null ? fallback : value
}

export function writeStorage(key, value, storageType = DEFAULT_STORAGE_TYPE) {
  const storage = getBrowserStorage(storageType)
  if (!storage) return false

  storage.setItem(key, String(value))
  return true
}

export function removeStorage(key, storageType = DEFAULT_STORAGE_TYPE) {
  const storage = getBrowserStorage(storageType)
  if (!storage) return false

  storage.removeItem(key)
  return true
}

export function readJSONStorage(key, fallback = null, storageType = DEFAULT_STORAGE_TYPE) {
  const raw = readStorage(key, '', storageType)
  if (!raw) return fallback

  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeJSONStorage(key, value, storageType = DEFAULT_STORAGE_TYPE) {
  return writeStorage(key, JSON.stringify(value), storageType)
}