/**
 * CMS API Service (MacCMS/AppleCMS compatible)
 * Handles standard JSON APIs used by many resource sites.
 */

const ADULT_KEYWORDS = [
  '18+', '福利', '伦理', '成人', '性爱', '激情', '三级', '午夜', '写真',
  '伦理片', '成人片', '自拍', '偷拍', '精品', '限制级', 'R级', 'NC-17',
  'av', 'jav', 'pon', 'adult', 'sex', 'erotic', 'porn', 'x-rated',
  '女优', '男优', '番号', '巨乳', '偷欢', '出轨', '乱伦', '调教', '群交',
  '肉番', '肉片', '情色', '限制', '少妇', '嫩模', '足交', '口爆', '潮吹',
  '里番', '无修', '步兵', '骑兵', '熟女', '诱惑', '野战', '制服', '诱奸'
]

export const cmsApi = {
  /**
   * Filter adult content from results if needed
   */
  filterResults(results, includeAdult) {
    if (includeAdult) return results
    const adultRegex = new RegExp(ADULT_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')

    return results.filter(item => {
      const text = `${item.vod_name} ${item.vod_sub || ''} ${item.vod_class || ''}`.toLowerCase()
      return !adultRegex.test(text)
    })
  },

  /**
   * Search videos
   * CMS API: ?ac=videolist&wd=keyword&pg=page
   */
  async search(apiUrl, keyword, page = 1, includeAdult = false) {
    const url = `${apiUrl}?ac=videolist&wd=${encodeURIComponent(keyword)}&pg=${page}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const results = data.list || []
    return this.filterResults(results, includeAdult)
  },

  /**
   * Get recommended / home content
   * CMS API: ?ac=videolist&pg=page (usually returns latest updates)
   */
  async recommend(apiUrl, page = 1, includeAdult = false, categoryId = '') {
    let url = `${apiUrl}?ac=videolist&pg=${page}`
    if (categoryId) {
      url += `&t=${categoryId}`
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const results = data.list || []
    return this.filterResults(results, includeAdult)
  },

  /**
   * Get detail for a video
   * CMS API: ?ac=videolist&ids=id
   */
  async detail(apiUrl, id) {
    const url = `${apiUrl}?ac=videolist&ids=${id}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const item = data.list?.[0]
    if (!item) throw new Error('Video not found')
    
    // Parse episodes from vod_play_url
    // Format: name$url#name$url or just url
    // Note: there can be multiple play sources in vod_play_from (separated by $$$)
    const sources = item.vod_play_from.split('$$$')
    const urlGroups = item.vod_play_url.split('$$$')
    
    const playbacks = sources.map((source, idx) => {
      const groupStr = urlGroups[idx] || ''
      const items = groupStr.split('#').filter(s => s.trim())
      const episodes = []
      const episodeTitles = []
      
      items.forEach(it => {
        if (it.includes('$')) {
          const [name, url] = it.split('$')
          episodes.push(url)
          episodeTitles.push(name)
        } else {
          episodes.push(it)
          episodeTitles.push(`第${episodes.length}集`)
        }
      })
      
      return {
        name: source,
        episodes,
        episodeTitles
      }
    })

    return {
      ...item,
      playbacks
    }
  },

  /**
   * Get categories
   * CMS API: ?ac=list
   */
  async getCategories(apiUrl) {
    const url = `${apiUrl}?ac=list`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.class || []
  }
}
