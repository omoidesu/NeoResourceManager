const {
  normalizeWhitespace,
  requestText,
  htmlDecode,
  extractBracketAuthor
} = require('./shared')

const JMCOMIC_BASE_URL = String(process.env.JMCOMIC_BASE_URL || 'https://18comic.vip').trim().replace(/\/+$/, '')

function extractMetaContent(html, propertyName) {
  const escapedName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`<meta[^>]+property=["']${escapedName}["'][^>]+content=["']([^"']+)["']`, 'i')
  return htmlDecode(pattern.exec(html)?.[1] || '')
}

function parseJmAlbumInfo(html, albumId) {
  const title = extractMetaContent(html, 'og:title')
  const image = extractMetaContent(html, 'og:image')
  const description = extractMetaContent(html, 'og:description')
  if (!title) {
    return null
  }

  const rawTags = Array.from(description.matchAll(/[#＃]([^\s#＃]+)/g)).map((item) => normalizeWhitespace(item[1])).filter(Boolean)
  return {
    site: '禁漫天堂',
    website: `${JMCOMIC_BASE_URL}/album/${albumId}/`,
    name: title,
    author: extractBracketAuthor(title),
    cover: image,
    tag: rawTags,
    type: ['禁漫天堂']
  }
}

async function searchJmComic(query, ctx) {
  const url = `${JMCOMIC_BASE_URL}/search/photos?search_query=${encodeURIComponent(query)}`
  ctx.logger.info('search jmcomic', { query, url })
  const html = await requestText(url, {
    headers: {
      Referer: `${JMCOMIC_BASE_URL}/`
    }
  })

  const matched = html.match(/\/album\/(\d+)\/?/i)
  if (!matched?.[1]) {
    return null
  }

  const albumId = matched[1]
  const detailHtml = await requestText(`${JMCOMIC_BASE_URL}/album/${albumId}/`, {
    headers: {
      Referer: url
    }
  })

  return parseJmAlbumInfo(detailHtml, albumId)
}

module.exports = {
  searchJmComic
}
