const {
  axios,
  normalizeWhitespace,
  extractBracketAuthor,
  buildHeaders
} = require('./shared')

const NHENTAI_BASE_URL = String(process.env.NHENTAI_BASE_URL || 'https://nhentai.net').trim().replace(/\/+$/, '')

function getNhentaiImageExtension(typeCode) {
  switch (String(typeCode || '').trim()) {
    case 'p':
      return 'png'
    case 'g':
      return 'gif'
    case 'j':
    default:
      return 'jpg'
  }
}

function mapNhentaiGallery(gallery) {
  if (!gallery) {
    return null
  }

  const mediaId = String(gallery.media_id || '').trim()
  const coverType = gallery.images?.cover?.t
  const coverExt = getNhentaiImageExtension(coverType)
  const artists = (gallery.tags || [])
    .filter((item) => item?.type === 'artist' || item?.type === 'group')
    .map((item) => normalizeWhitespace(item?.name))
    .filter(Boolean)

  return {
    site: 'nhentai',
    website: `${NHENTAI_BASE_URL}/g/${gallery.id}/`,
    name: gallery.title?.japanese || gallery.title?.pretty || gallery.title?.english || '',
    author: artists.join(' / ') || extractBracketAuthor(gallery.title?.japanese || gallery.title?.pretty || gallery.title?.english),
    cover: mediaId ? `https://t.nhentai.net/galleries/${mediaId}/cover.${coverExt}` : '',
    tag: (gallery.tags || []).map((item) => normalizeWhitespace(item?.name)).filter(Boolean),
    type: ['nhentai', ...(gallery.tags || []).filter((item) => item?.type === 'category').map((item) => normalizeWhitespace(item?.name)).filter(Boolean)]
  }
}

async function searchNhentai(query, ctx) {
  const searchUrl = `${NHENTAI_BASE_URL}/api/galleries/search?query=${encodeURIComponent(query)}&page=1`
  ctx.logger.info('search nhentai', { query, searchUrl })
  const response = await axios.get(searchUrl, {
    timeout: 20000,
    headers: buildHeaders()
  })

  const results = Array.isArray(response.data?.result) ? response.data.result : []
  if (!results.length) {
    return null
  }

  const selected = results[0]
  if (!selected?.id) {
    return null
  }

  try {
    const detailUrl = `${NHENTAI_BASE_URL}/api/gallery/${selected.id}`
    const detailResponse = await axios.get(detailUrl, {
      timeout: 20000,
      headers: buildHeaders()
    })
    return mapNhentaiGallery(detailResponse.data) || mapNhentaiGallery(selected)
  } catch (error) {
    ctx.logger.warn('nhentai detail fallback to search summary', {
      query,
      id: selected.id,
      message: error instanceof Error ? error.message : String(error)
    })
    return mapNhentaiGallery(selected)
  }
}

module.exports = {
  searchNhentai
}
