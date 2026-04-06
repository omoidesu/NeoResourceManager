const {
  axios,
  normalizeWhitespace,
  normalizeForMatch,
  tokenize,
  buildHeaders,
  requestText,
  htmlDecode,
  extractBracketAuthor,
  scoreTokenOverlap
} = require('./shared')

const EHENTAI_BASE_URL = 'https://e-hentai.org'
const EHENTAI_API_URL = 'https://api.e-hentai.org/api.php'
const EH_TAG_DATABASE_BASE_URL = 'https://raw.githubusercontent.com/EhTagTranslation/Database/master/database'
const ehTagNamespaceCache = new Map()

function parseEhTagMarkdown(markdown) {
  const translationMap = new Map()
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) {
      continue
    }

    const columns = trimmed.split('|').slice(1, -1).map((item) => item.trim())
    if (columns.length < 2) {
      continue
    }

    const raw = columns[0]
      .replace(/^`+|`+$/g, '')
      .replace(/^<\w+>|<\/\w+>$/g, '')
      .trim()
    const name = columns[1]
      .replace(/^`+|`+$/g, '')
      .replace(/!\[[^\]]*]\([^)]+\)/g, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .trim()

    if (!raw || !name) {
      continue
    }

    if (raw === 'raw' || /^:?-+:?$/i.test(raw) || /^==.*==$/.test(name)) {
      continue
    }

    translationMap.set(raw.toLowerCase(), htmlDecode(name))
  }

  return translationMap
}

async function getEhNamespaceTranslationMap(namespace, ctx) {
  const normalizedNamespace = String(namespace || '').trim().toLowerCase()
  if (!normalizedNamespace) {
    return null
  }

  if (ehTagNamespaceCache.has(normalizedNamespace)) {
    return ehTagNamespaceCache.get(normalizedNamespace)
  }

  const url = `${EH_TAG_DATABASE_BASE_URL}/${encodeURIComponent(normalizedNamespace)}.md`
  try {
    ctx.logger.info('load eh tag translation database', { namespace: normalizedNamespace, url })
    const markdown = await requestText(url)
    const translationMap = parseEhTagMarkdown(markdown)
    ehTagNamespaceCache.set(normalizedNamespace, translationMap)
    return translationMap
  } catch (error) {
    ctx.logger.warn('failed to load eh tag translation database', {
      namespace: normalizedNamespace,
      message: error instanceof Error ? error.message : String(error)
    })
    ehTagNamespaceCache.set(normalizedNamespace, null)
    return null
  }
}

async function translateEhTag(tag, ctx) {
  const normalizedTag = String(tag || '').trim()
  if (!normalizedTag) {
    return ''
  }

  const separatorIndex = normalizedTag.indexOf(':')
  if (separatorIndex <= 0) {
    return normalizedTag
  }

  const namespace = normalizedTag.slice(0, separatorIndex).trim().toLowerCase()
  const rawValue = normalizedTag.slice(separatorIndex + 1).trim()
  if (!namespace || !rawValue) {
    return normalizedTag
  }

  const translationMap = await getEhNamespaceTranslationMap(namespace, ctx)
  const translated = translationMap?.get(rawValue.toLowerCase())
  return translated || rawValue
}

async function translateEhTags(tags, ctx) {
  const translatedTags = []
  for (const tag of Array.isArray(tags) ? tags : []) {
    const translated = await translateEhTag(tag, ctx)
    if (translated) {
      translatedTags.push(translated)
    }
  }

  return Array.from(new Set(translatedTags))
}

function parseSearchResults(html) {
  const results = []
  const rowMatches = Array.from(
    String(html || '').matchAll(/<td class="gl3c glname"[\s\S]*?<a href="https:\/\/e-hentai\.org\/g\/(\d+)\/([0-9a-f]+)\/">[\s\S]*?<div class="glink">([\s\S]*?)<\/div>/gi)
  )

  for (const matched of rowMatches) {
    results.push({
      index: results.length,
      gid: Number(matched[1]),
      token: matched[2],
      title: htmlDecode(String(matched[3] || '').replace(/<[^>]+>/g, '')),
      url: `https://e-hentai.org/g/${matched[1]}/${matched[2]}/`
    })
  }

  return results
}

function getAuthorMatchScore(profile, title) {
  const normalizedTitle = normalizeForMatch(title)
  if (!normalizedTitle || !Array.isArray(profile.authorCandidates) || !profile.authorCandidates.length) {
    return 0
  }

  let score = 0
  for (const candidate of profile.authorCandidates) {
    const normalizedCandidate = normalizeForMatch(candidate)
    if (!normalizedCandidate) {
      continue
    }

    if (normalizedTitle.includes(normalizedCandidate)) {
      score = Math.max(score, 40 + normalizedCandidate.length * 2)
      continue
    }

    const candidateTokens = tokenize(normalizedCandidate)
    const overlap = candidateTokens.filter((token) => normalizedTitle.includes(token)).length
    if (overlap > 0) {
      score = Math.max(score, overlap * 12)
    }
  }

  return score
}

function scoreVisibleLanguagePreference(title) {
  const normalizedTitle = String(title || '')

  if (/\[Chinese]/i.test(normalizedTitle) || /\[中文]/i.test(normalizedTitle) || /漢化|汉化/.test(normalizedTitle)) {
    return 35
  }

  if (/\[Japanese]/i.test(normalizedTitle) || /\[日本語]/i.test(normalizedTitle)) {
    return 22
  }

  if (/\[English]/i.test(normalizedTitle)) {
    return 12
  }

  if (/\[Korean]/i.test(normalizedTitle)) {
    return -12
  }

  if (/\[Russian]/i.test(normalizedTitle) || /\[Spanish]/i.test(normalizedTitle) || /\[Portuguese/i.test(normalizedTitle)) {
    return -18
  }

  return 0
}

function getPrimaryVisibleTitle(title) {
  return String(title || '')
    .split('|')[0]
    .split('(')[0]
    .replace(/\[[^\]]+]/g, ' ')
    .trim()
}

function extractBracketGroups(title) {
  const matched = String(title || '').match(/\[([^\]]+)]/g) ?? []
  return matched
    .map((item) => item.replace(/^\[|\]$/g, '').trim())
    .filter(Boolean)
}

function isGenericTranslatorMarker(value) {
  const normalizedValue = normalizeForMatch(value)
  if (!normalizedValue) {
    return true
  }

  return [
    'chinese',
    '中国翻訳',
    '中国翻译',
    '汉化',
    '漢化',
    '翻訳',
    '翻译',
    'translated',
    'translation',
    'english',
    'japanese',
    'digital',
    'dl版',
    'dl',
    '修正',
    '無修正',
    '无修正'
  ].some((marker) => normalizedValue === normalizeForMatch(marker))
}

function extractTranslatorFromEhMetadata(metadata, author) {
  const titleGroups = extractBracketGroups(metadata?.title)
  const titleJpnGroups = new Set(extractBracketGroups(metadata?.title_jpn).map((item) => normalizeForMatch(item)))
  const normalizedAuthor = normalizeForMatch(author)

  for (const group of titleGroups) {
    const normalizedGroup = normalizeForMatch(group)
    if (!normalizedGroup || isGenericTranslatorMarker(group)) {
      continue
    }

    if (normalizedAuthor && normalizedGroup === normalizedAuthor) {
      continue
    }

    if (titleJpnGroups.has(normalizedGroup)) {
      continue
    }

    return group
  }

  return ''
}

function scoreEhentaiSearchCandidate(profile, candidate, query) {
  const overlap = scoreTokenOverlap(profile.titleTokens, candidate.title)
  let score = overlap.matchedCount * 35 + Math.round(overlap.ratio * 80)
  if (normalizeForMatch(candidate.title).includes(normalizeForMatch(profile.titleWithoutTrailingMeta))) {
    score += 70
  }

  score += getAuthorMatchScore(profile, candidate.title)
  score += scoreVisibleLanguagePreference(candidate.title)

  const primaryVisibleTitle = getPrimaryVisibleTitle(candidate.title)
  const primaryOverlap = scoreTokenOverlap(profile.titleTokens, primaryVisibleTitle)
  score += primaryOverlap.matchedCount * 18
  if (!primaryOverlap.matchedCount && overlap.matchedCount) {
    score -= 28
  }

  if (profile.hasOriginalMarker && /original/i.test(candidate.title)) {
    score += 18
  }

  if (/\[(english|chinese|spanish|portuguese|translated|翻訳|汉化|漢化)/i.test(candidate.title)) {
    score -= 12
  }

  if (query && normalizeForMatch(candidate.title).includes(normalizeForMatch(query))) {
    score += 20
  }

  // E-Hentai's own search ordering is often more useful than the raw title text,
  // especially when the visible title is translated but title_jpn still matches.
  score += Math.max(0, 30 - Number(candidate.index || 0) * 3)

  if (/#\d+\s*【PV】/i.test(candidate.title) || /\bPV\b/i.test(candidate.title)) {
    score -= 90
  }

  if (/\[incomplete]/i.test(candidate.title)) {
    score -= 45
  }

  if (overlap.ratio < 0.5) {
    score -= overlap.matchedCount ? 20 : 45
  }

  return score
}

function scoreEhentaiMetadata(profile, metadata) {
  const primaryTitle = metadata?.title_jpn || metadata?.title || ''
  const secondaryTitle = metadata?.title || ''
  const primaryOverlap = scoreTokenOverlap(profile.titleTokens, primaryTitle)
  const secondaryOverlap = scoreTokenOverlap(profile.titleTokens, secondaryTitle)
  const overlap = primaryOverlap.ratio >= secondaryOverlap.ratio ? primaryOverlap : secondaryOverlap

  let score = overlap.matchedCount * 40 + Math.round(overlap.ratio * 120)
  if (
    normalizeForMatch(primaryTitle).includes(normalizeForMatch(profile.titleWithoutTrailingMeta))
    || normalizeForMatch(secondaryTitle).includes(normalizeForMatch(profile.titleWithoutTrailingMeta))
  ) {
    score += 90
  }

  const authorTags = Array.isArray(metadata?.tags)
    ? metadata.tags.filter((item) => /^artist:|^group:/i.test(String(item)))
    : []
  const normalizedAuthors = authorTags.map((item) => String(item).split(':').slice(1).join(':'))
  for (const candidate of profile.authorCandidates) {
    const normalizedCandidate = normalizeForMatch(candidate)
    if (!normalizedCandidate) {
      continue
    }

    for (const author of normalizedAuthors) {
      if (normalizeForMatch(author).includes(normalizedCandidate) || normalizedCandidate.includes(normalizeForMatch(author))) {
        score += 70
      }
    }
  }

  const lowerTags = Array.isArray(metadata?.tags) ? metadata.tags.map((item) => String(item).toLowerCase()) : []
  if (profile.hasOriginalMarker && lowerTags.includes('parody:original')) {
    score += 25
  }

  if (/translated/i.test(String(metadata?.title || ''))) {
    score -= 10
  }

  if (/#\d+\s*【PV】/i.test(primaryTitle) || /\bPV\b/i.test(primaryTitle)) {
    score -= 120
  }

  if (/\[incomplete]/i.test(primaryTitle) || /\[incomplete]/i.test(secondaryTitle)) {
    score -= 60
  }

  if (overlap.ratio < 0.5) {
    score -= overlap.matchedCount ? 35 : 80
  }

  return score
}

function shouldAcceptBestCandidate(best, secondBest) {
  if (!best || best.totalScore < 60) {
    return false
  }

  if (!secondBest) {
    return true
  }

  return (best.totalScore - secondBest.totalScore) >= 8
}

async function searchEhentai(query, ctx, profile) {
  const url = `${EHENTAI_BASE_URL}/?f_search=${encodeURIComponent(query)}&f_sname=1&f_stags=0&advsearch=1`
  ctx.logger.info('search e-hentai', { query, url })
  const html = await requestText(url)
  if (/No hits found/i.test(html)) {
    return null
  }

  const results = parseSearchResults(html)
  if (!results.length) {
    return null
  }

  const rankedSearchResults = results
    .map((candidate) => ({
      ...candidate,
      searchScore: scoreEhentaiSearchCandidate(profile, candidate, query)
    }))
    .sort((left, right) => right.searchScore - left.searchScore)
    .slice(0, 12)

  if (!rankedSearchResults.length) {
    return null
  }

  const detailResponse = await axios.post(
    EHENTAI_API_URL,
    {
      method: 'gdata',
      gidlist: rankedSearchResults.map((item) => [item.gid, item.token]),
      namespace: 1
    },
    {
      timeout: 20000,
      headers: buildHeaders({ 'Content-Type': 'application/json' })
    }
  )

  const metadataList = Array.isArray(detailResponse.data?.gmetadata) ? detailResponse.data.gmetadata : []
  const metadataMap = new Map(metadataList.map((item) => [String(item?.gid), item]))

  const rankedCandidates = rankedSearchResults
    .map((candidate) => {
      const metadata = metadataMap.get(String(candidate.gid))
      const metadataScore = metadata ? scoreEhentaiMetadata(profile, metadata) : -1000
      return {
        ...candidate,
        metadata,
        metadataScore,
        totalScore: candidate.searchScore + Math.max(metadataScore, -200)
      }
    })
    .sort((left, right) => right.totalScore - left.totalScore)

  const best = rankedCandidates[0]
  const secondBest = rankedCandidates[1]
  ctx.logger.info('ehentai ranked candidates', {
    query,
    ranked: rankedCandidates.map((item) => ({
      gid: item.gid,
      title: item.title,
      searchScore: item.searchScore,
      metadataScore: item.metadataScore,
      totalScore: item.totalScore
    }))
  })

  if (!best?.metadata || !shouldAcceptBestCandidate(best, secondBest)) {
    return null
  }

  const metadata = best.metadata
  const rawTags = Array.isArray(metadata.tags) ? metadata.tags : []
  const translatedTags = await translateEhTags(rawTags, ctx)
  const authorTags = rawTags.filter((item) => /^artist:|^group:/i.test(String(item)))
  const translatedAuthors = await Promise.all(authorTags.map((item) => translateEhTag(item, ctx)))
  const author = translatedAuthors.filter(Boolean).join(' / ') || extractBracketAuthor(metadata.title_jpn || metadata.title)
  const translator = extractTranslatorFromEhMetadata(metadata, author)

  return {
    site: 'E-Hentai',
    website: `${EHENTAI_BASE_URL}/g/${best.gid}/${best.token}/`,
    name: metadata.title_jpn || metadata.title || best.title || '',
    author,
    translator,
    cover: metadata.thumb || '',
    tag: translatedTags,
    type: [metadata.category, 'E-Hentai'].filter(Boolean)
  }
}

module.exports = {
  searchEhentai
}
