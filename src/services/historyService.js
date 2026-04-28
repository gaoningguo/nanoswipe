const DB_NAME = 'nanoswipe_db'
const STORE_NAME = 'history'
const VERSION = 1

export const historyService = {
  getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
    })
  },

  async saveProgress(video, currentTime, duration) {
    if (!video?.id) return
    const db = await this.getDB()
    const isFinished = duration > 0 && (duration - currentTime) < 10
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const data = {
        id: video.id,
        currentTime,
        duration,
        isFinished,
        updatedAt: Date.now(),
        title: video.title
      }
      const request = store.put(data)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  },

  async getProgress(videoId) {
    if (!videoId) return null
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(videoId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  },

  async isFinished(videoId) {
    const progress = await this.getProgress(videoId)
    return progress?.isFinished || false
  },

  async getAllHistory() {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
}
