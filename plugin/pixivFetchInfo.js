const axios = require('axios')

const PIXIV_ARTWORK_ID_PATTERN = /^\d+$/
const PIXIV_ARTWORK_URL_PATTERN = /artworks\/(\d+)/i
const ILLUST_TYPE_LABELS = {
  0: 'illustration',
  1: 'manga',
  2: 'ugoira'
}

function resolveArtworkId(resourceId) {
  const normalized = String(resourceId || '').trim()
  if (!normalized) {
    return ''
  }

  if (PIXIV_ARTWORK_ID_PATTERN.test(normalized)) {
    return normalized
  }

  const matched = normalized.match(PIXIV_ARTWORK_URL_PATTERN)
  return matched?.[1] ?? ''
}

function buildHeaders(artworkId) {
  const cookie = String(process.env.PIXIV_COOKIE || '').trim()
  const headers = {
    Accept: 'application/json,text/plain,*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: `https://www.pixiv.net/artworks/${artworkId}`,
    'User-Agent': 'NeoResourceManager/1.0 (+https://www.pixiv.net/)'
  }

  if (cookie) {
    headers.Cookie = cookie
  }

  return headers
}

function normalizeTags(body) {
  const rawTags = body?.tags?.tags ?? body?.illustManga?.tags?.tags ?? []
  if (!Array.isArray(rawTags)) {
    return []
  }

  const tags = []
  for (const item of rawTags) {
    const tagName = typeof item?.tag === 'string' ? item.tag.trim() : ''
    const translatedName = typeof item?.translation?.zh === 'string'
      ? item.translation.zh.trim()
      : typeof item?.translation?.en === 'string'
        ? item.translation.en.trim()
        : ''

    if (translatedName && tagName && translatedName !== tagName) {
      tags.push(`${translatedName}(${tagName})`)
      continue
    }

    if (tagName) {
      tags.push(tagName)
    }
  }

  return Array.from(new Set(tags))
}

function normalizeTypes(body) {
  const types = []
  const illustType = ILLUST_TYPE_LABELS[body?.illustType]
  if (illustType) {
    types.push(illustType)
  }

  if (Number(body?.xRestrict) === 1) {
    types.push('R-18')
  } else if (Number(body?.xRestrict) === 2) {
    types.push('R-18G')
  }

  if (body?.aiType === 2) {
    types.push('AI')
  }

  return Array.from(new Set(types))
}

function normalizeCover(body) {
  return body?.urls?.regular ||
    body?.urls?.small ||
    body?.urls?.thumb ||
    body?.urls?.mini ||
    ''
}

function normalizeErrorMessage(error, artworkId) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status

    if (status === 404) {
      return `Pixiv 作品 ${artworkId} 不存在、已删除，或当前不可见`
    }

    if (status === 403) {
      return 'Pixiv 拒绝访问，请检查网络环境，必要时设置 PIXIV_COOKIE 后重试'
    }

    if (status) {
      return `Pixiv 请求失败: HTTP ${status}`
    }

    if (error.code === 'ECONNABORTED') {
      return 'Pixiv 请求超时，请稍后重试'
    }

    return error.message || 'Pixiv 请求失败'
  }

  return error instanceof Error ? error.message : String(error)
}

module.exports = {
  websiteName: 'Pixiv',

  async fetchInfo(resourceId, ctx) {
    ctx.logger.info('start fetchInfo', { resourceId })

    const artworkId = resolveArtworkId(resourceId)
    if (!artworkId) {
      ctx.logger.warn('invalid pixiv resource id', { resourceId })
      throw new Error(`当前资源ID“${resourceId}”不是有效的 Pixiv 作品 ID 或作品链接`)
    }

    const url = `https://www.pixiv.net/ajax/illust/${encodeURIComponent(artworkId)}`
    const headers = buildHeaders(artworkId)

    ctx.logger.info('request artwork api', {
      artworkId,
      url,
      hasCookie: Boolean(headers.Cookie)
    })

    try {
      const response = await axios.get(url, {
        timeout: 20000,
        headers
      })

      const payload = response.data
      const body = payload?.body

      ctx.logger.info('response summary', {
        artworkId,
        status: response.status,
        error: payload?.error,
        message: payload?.message ?? '',
        topLevelKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 20) : [],
        illustTitle: body?.illustTitle ?? '',
        userName: body?.userName ?? '',
        pageCount: body?.pageCount ?? null
      })

      if (payload?.error) {
        throw new Error(payload.message || `Pixiv 返回错误，作品 ID: ${artworkId}`)
      }

      if (!body || typeof body !== 'object') {
        throw new Error(`Pixiv 返回的数据结构异常，作品 ID: ${artworkId}`)
      }

      const result = {
        name: body.illustTitle ?? '',
        author: body.userName ?? '',
        cover: normalizeCover(body),
        tag: normalizeTags(body),
        type: normalizeTypes(body)
      }

      ctx.logger.debug('normalized result', result)
      return result
    } catch (error) {
      const message = normalizeErrorMessage(error, artworkId)
      ctx.logger.error('request artwork api failed', {
        artworkId,
        message
      })
      throw new Error(message)
    }
  }
}
