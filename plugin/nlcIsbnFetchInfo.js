const BASE_URL = 'http://opac.nlc.cn/F'
const ISBN_PATTERN = /(?:ISBN(?:-1[03])?:?\s*)?([0-9][0-9\-\s]{8,}[0-9Xx])/i

function normalizeIsbn(value) {
  const rawValue = String(value || '').trim()
  const matched = rawValue.match(ISBN_PATTERN)
  return String(matched?.[1] || rawValue).replace(/[^0-9Xx]/g, '').toUpperCase()
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

function parseDetailRows(html) {
  const tableMatch = String(html || '').match(/<table\b[^>]*\bid=["']?td["']?[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) {
    return null
  }

  const data = {}
  let previousKey = ''
  let previousValue = ''
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch

  while ((rowMatch = rowPattern.exec(tableMatch[1]))) {
    const cells = Array.from(rowMatch[1].matchAll(/<td\b[^>]*class=["']?td1["']?[^>]*>([\s\S]*?)<\/td>/gi))
    if (cells.length < 2) {
      continue
    }

    const key = stripTags(cells[0][1])
    const value = stripTags(cells[1][1])

    if (!key && !value) {
      continue
    }

    if (key) {
      data[key] = value
      previousKey = key
      previousValue = value
    } else if (previousKey && value) {
      data[previousKey] = [previousValue, value].filter(Boolean).join('\n')
      previousValue = data[previousKey]
    }
  }

  return data
}

function parseFirstDetailUrl(html) {
  const itemMatch = String(html || '').match(/<div\b[^>]*class=["'][^"']*\bitemtitle\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i)
  if (!itemMatch) {
    return ''
  }

  const href = decodeHtml(itemMatch[1]).trim()
  if (/^https?:\/\//i.test(href)) {
    return href
  }

  return new URL(href, BASE_URL).href
}

function parseTitle(value, fallback) {
  const title = String(value || '').split(/\s\/\s/)[0].trim()
  const cleaned = title
    .replace(/\s*\[[^\]]+\]\s*/g, ' ')
    .replace(/\s+([:：])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return String(cleaned || fallback || '').trim()
}

function parseAuthors(value) {
  return String(value || '')
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/\s*译\s*$/u.test(item))
    .map((item) => item
      .replace(/,\s*\d{4}-?\s*(?=\)|）|$)/g, '')
      .replace(/，\s*\d{4}-?\s*(?=\)|）|$)/g, '')
      .replace(/\(\s*\d{4}-?\s*\)/g, '')
      .replace(/（\s*\d{4}-?\s*）/g, '')
      .replace(/\(\s*\d{3,4}(?:[\/.~\-－—]\d{0,4})+(?:\s*[\/.~\-－—]\s*\d{0,4})*\s*\)/g, '')
      .replace(/（\s*\d{3,4}(?:[\/.~\-－—]\d{0,4})+(?:\s*[\/.~\-－—]\s*\d{0,4})*\s*）/g, '')
      .replace(/\s*(编著|主编|著|编|等)\s*$/u, '')
      .trim())
    .filter(Boolean)
    .join(' / ')
}

function parseTranslators(value) {
  return String(value || '')
    .split(/[\n;；]/)
    .map((item) => {
      const matched = item.trim().match(/^(.*?)\s*译\s*$/u)
      return String(matched?.[1] || '').trim()
    })
    .map((item) => item.replace(/^.*?\/\s*/u, '').trim())
    .filter(Boolean)
    .join(' / ')
}

function parsePublisher(value) {
  const text = String(value || '')
  const matched = text.match(/:\s*([^,，]+)[,，]/)
  return String(matched?.[1] || '').trim()
}

function parseYear(data) {
  const genericMatched = String(data['通用数据'] || '').match(/\d{9}(\d{4})/)
  const publicationMatched = String(data['出版项'] || '').match(/\b(19|20)\d{2}\b/)
  const year = Number(genericMatched?.[1] || publicationMatched?.[0] || '')
  return Number.isFinite(year) && year > 0 ? year : null
}

function parseWebIsbn(html, fallback) {
  const matched = String(html || '').match(/ISBN:\s*([\d\-Xx]+)/)
  return normalizeIsbn(matched?.[1] || fallback)
}

function parseTags(value) {
  return String(value || '')
    .split(/--|\n/)
    .map((item) => stripTags(item))
    .map((item) => item.trim())
    .filter(Boolean)
}

module.exports = {
  websiteName: '国家图书馆',
  dictTypeName: 'novelSiteType',
  websiteValue: 'nlc-isbn',
  websiteDescription: '中国国家图书馆 ISBN 图书信息',
  websiteExtra: {
    enableFetchInfo: true,
    url: {
      novel: 'http://opac.nlc.cn/F?func=find-b&find_code=ISB&request={}&local_base=NLC01'
    }
  },

  async fetchInfo(resourceId, ctx) {
    const isbn = normalizeIsbn(resourceId)
    if (!isbn) {
      throw new Error('请输入有效 ISBN')
    }

    const headers = {
      'Accept-Encoding': 'identity',
      'User-Agent': 'Mozilla/5.0',
      DNT: '1'
    }
    const searchUrl = `${BASE_URL}?func=find-b&find_code=ISB&request=${encodeURIComponent(isbn)}&local_base=NLC01`

    ctx.logger.info('request nlc isbn search', { isbn, url: searchUrl })
    let html = await ctx.requestText(searchUrl, { timeoutMs: 30000, headers })
    let data = parseDetailRows(html)

    if (!data) {
      const detailUrl = parseFirstDetailUrl(html)
      if (detailUrl) {
        ctx.logger.info('request nlc isbn detail', { isbn, url: detailUrl })
        html = await ctx.requestText(detailUrl, { timeoutMs: 30000, headers })
        data = parseDetailRows(html)
      }
    }

    if (!data) {
      throw new Error(`国家图书馆未找到 ISBN ${isbn} 的图书信息`)
    }

    const result = {
      name: parseTitle(data['题名与责任'], isbn),
      author: parseAuthors(data['著者']),
      translator: parseTranslators([data['著者'], data['题名与责任']].filter(Boolean).join('\n')),
      isbn: parseWebIsbn(html, isbn),
      publisher: parsePublisher(data['出版项']),
      year: parseYear(data),
      description: String(data['内容提要'] || '').trim(),
      website: searchUrl,
      tag: parseTags(data['主题'])
    }

    ctx.logger.info('nlc isbn result', {
      isbn,
      name: result.name,
      author: result.author,
      publisher: result.publisher,
      year: result.year
    })

    return result
  }
}
