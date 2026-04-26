import { WEBSITE_DIRECT_DOWNLOAD_EXTENSIONS } from '../../../common/constants'

const DOWNLOAD_FILE_EXTENSION_PATTERN = new RegExp(
  `(?:${WEBSITE_DIRECT_DOWNLOAD_EXTENSIONS.map((item) => item.replace('.', '\\.')).join('|')})(?:$|[?#])`,
  'i'
)

const WEBSITE_DEFAULT_PLACEHOLDER_EMOJI = '🌐'
const WEBSITE_EASTER_EGG_EMOJI_POOL = [
  '🕸️',
  '📡',
  '🧭',
  '🧩',
  '✨',
  '⚡️',
  '☄️',
  '🌈',
  '🛰️',
  '🚀',
  '💡',
  '🔍',
  '🗺️',
  '🏠',
  '🏛️',
  '🏰',
  '🎯',
  '🎮',
  '🎬',
  '🎧',
  '📚',
  '🛒',
  '📰',
  '💬',
  '🤖',
  '🦊',
  '🐼',
  '🐧',
  '🦉',
  '🐙',
  '🐬',
  '🦄',
  '🌵',
  '🌲',
  '🌴',
  '🍀',
  '🌸',
  '🌻',
  '🍎',
  '🍉',
  '🍓',
  '🍕',
  '🍣',
  '🍿',
  '☕️',
  '⚽️',
  '🏀',
  '⚾️',
  '🎾',
  '🏸',
  '⛳️',
  '🎳',
  '🚗',
  '🚕',
  '🚌',
  '🚲',
  '🛵',
  '✈️',
  '⛵️',
  '⚓️',
  '🚄',
  '🎡',
]

function stableHash(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33 + input.charCodeAt(index)) >>> 0
  }
  return hash >>> 0
}

export function isWebsiteDownloadLink(url: string) {
  const normalizedUrl = String(url ?? '').trim()
  if (!normalizedUrl) {
    return false
  }

  if (DOWNLOAD_FILE_EXTENSION_PATTERN.test(normalizedUrl)) {
    return true
  }

  try {
    const parsedUrl = new URL(normalizedUrl)
    const contentDisposition = decodeURIComponent(
      String(
        parsedUrl.searchParams.get('response-content-disposition')
        ?? parsedUrl.searchParams.get('content-disposition')
        ?? parsedUrl.searchParams.get('rscd')
        ?? ''
      )
    )
    const responseContentType = String(
      parsedUrl.searchParams.get('response-content-type')
      ?? parsedUrl.searchParams.get('rsct')
      ?? ''
    ).toLowerCase()

    if (/attachment/i.test(contentDisposition) || DOWNLOAD_FILE_EXTENSION_PATTERN.test(contentDisposition)) {
      return true
    }

    if (responseContentType && !/text\/html|application\/xhtml\+xml/i.test(responseContentType)) {
      return true
    }
  } catch {
    return false
  }

  return false
}

export function getWebsitePlaceholderEmoji(resourceId: unknown, url: string, isDownloadLink?: boolean) {
  const normalizedUrl = String(url ?? '').trim()
  if (Boolean(isDownloadLink) || isWebsiteDownloadLink(normalizedUrl)) {
    return '🔗'
  }

  const seed = `${String(resourceId ?? '').trim()}::${normalizedUrl}`
  if (!seed.trim()) {
    return WEBSITE_DEFAULT_PLACEHOLDER_EMOJI
  }

  const probabilityBucket = stableHash(`${seed}::probability`) % 100
  if (probabilityBucket < 95) {
    return WEBSITE_DEFAULT_PLACEHOLDER_EMOJI
  }

  const emojiIndex = stableHash(`${seed}::emoji`) % WEBSITE_EASTER_EGG_EMOJI_POOL.length
  return WEBSITE_EASTER_EGG_EMOJI_POOL[emojiIndex] || WEBSITE_DEFAULT_PLACEHOLDER_EMOJI
}
