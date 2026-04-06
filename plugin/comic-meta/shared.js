const axios = require('axios')

function getResourceName(resourceId) {
  const normalized = String(resourceId || '').trim().replace(/[\\/]+$/, '')
  if (!normalized) {
    return ''
  }

  const segments = normalized.split(/[\\/]/)
  return segments[segments.length - 1] || normalized
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function stripExtension(value) {
  const normalized = String(value || '').trim()
  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex <= 0) {
    return normalized
  }

  return normalized.slice(0, dotIndex)
}

function cleanupComicTitle(rawTitle) {
  return normalizeWhitespace(
    stripExtension(getResourceName(rawTitle))
      .replace(/^\[[^\]]*漢化[^\]]*]\s*/gi, '')
      .replace(/^\[[^\]]*翻译[^\]]*]\s*/gi, '')
      .replace(/^\[[^\]]*翻訳[^\]]*]\s*/gi, '')
      .replace(/^\[[^\]]*扫图[^\]]*]\s*/gi, '')
      .replace(/^\[[^\]]*校对[^\]]*]\s*/gi, '')
      .replace(/^\[[^\]]*]\s*/g, '')
      .replace(/\((オリジナル|同人誌?|DL版|無修正|修正|中文|汉化|漢化|翻译|翻訳)\)\s*$/gi, '')
      .replace(/[~～]/g, ' ')
      .replace(/[()\[\]【】]/g, ' ')
  )
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[~～\-_()[\]【】'"'":/\\|.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value) {
  return Array.from(new Set(
    normalizeForMatch(value)
      .split(' ')
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
  ))
}

function extractBracketContents(rawName) {
  return Array.from(String(rawName || '').matchAll(/\[([^\]]+)]/g)).map((item) => normalizeWhitespace(item[1]))
}

function extractAuthorCandidates(rawName) {
  const bracketContents = extractBracketContents(rawName)
  const filtered = bracketContents.filter((item) => item && !/漢化|翻译|翻訳|掃圖|校对|校對/i.test(item))
  const expanded = []

  for (const item of filtered) {
    expanded.push(item)
    const innerParts = item
      .replace(/[()]/g, ' ')
      .split(/\s{2,}|\/|,/)
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean)

    for (const part of innerParts) {
      expanded.push(part)
    }
  }

  return Array.from(new Set(expanded.filter(Boolean)))
}

function buildQueryCandidates(resourceId) {
  const rawName = stripExtension(getResourceName(resourceId))
  const cleanedTitle = cleanupComicTitle(rawName)
  const authorCandidates = extractAuthorCandidates(rawName)
  const primaryAuthor = authorCandidates[0] || ''
  const titleWithoutTrailingMeta = normalizeWhitespace(cleanedTitle.replace(/\s+(オリジナル|original)$/i, ''))

  const candidates = [
    titleWithoutTrailingMeta,
    cleanedTitle,
    primaryAuthor && titleWithoutTrailingMeta ? `${primaryAuthor} ${titleWithoutTrailingMeta}` : '',
    normalizeWhitespace(titleWithoutTrailingMeta.replace(/[^\p{L}\p{N}\s]/gu, ' '))
  ].filter(Boolean)

  return Array.from(new Set(candidates))
}

function buildResourceProfile(resourceId) {
  const rawName = stripExtension(getResourceName(resourceId))
  const cleanedTitle = cleanupComicTitle(rawName)
  const authorCandidates = extractAuthorCandidates(rawName)
  const titleWithoutTrailingMeta = normalizeWhitespace(cleanedTitle.replace(/\s+(オリジナル|original)$/i, ''))
  const titleTokens = tokenize(titleWithoutTrailingMeta)

  return {
    rawName,
    cleanedTitle,
    titleWithoutTrailingMeta,
    titleTokens,
    authorCandidates,
    hasOriginalMarker: /オリジナル|original/i.test(rawName)
  }
}

function extractBracketAuthor(title) {
  const matched = String(title || '').match(/\[([^\]]+)]/)
  return normalizeWhitespace(matched?.[1] || '')
}

function buildHeaders(extraHeaders = {}) {
  return {
    Accept: 'application/json,text/plain,*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'User-Agent': 'NeoResourceManager/1.0',
    ...extraHeaders
  }
}

async function requestText(url, options = {}) {
  const response = await axios.get(url, {
    timeout: options.timeoutMs || 20000,
    headers: buildHeaders(options.headers),
    maxRedirects: 5
  })
  return String(response.data || '')
}

function htmlDecode(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function scoreTokenOverlap(expectedTokens, candidateText) {
  const candidateTokens = tokenize(candidateText)
  if (!expectedTokens.length || !candidateTokens.length) {
    return { matchedCount: 0, ratio: 0, candidateTokens }
  }

  let matchedCount = 0
  for (const token of expectedTokens) {
    if (candidateTokens.some((candidateToken) => candidateToken.includes(token) || token.includes(candidateToken))) {
      matchedCount += 1
    }
  }

  return {
    matchedCount,
    ratio: matchedCount / expectedTokens.length,
    candidateTokens
  }
}

module.exports = {
  axios,
  getResourceName,
  normalizeWhitespace,
  stripExtension,
  cleanupComicTitle,
  normalizeForMatch,
  tokenize,
  buildQueryCandidates,
  buildResourceProfile,
  extractBracketAuthor,
  buildHeaders,
  requestText,
  htmlDecode,
  scoreTokenOverlap
}
