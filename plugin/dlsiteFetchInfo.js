const STARTS_WITH_RULE = {
  RJ: 'maniax',
  BJ: 'books',
  VJ: 'pro',
  AI: 'girls',
  AK: 'home',
  BO: 'soft',
  RE: 'eng'
}

function resolveRule(resourceId) {
  const normalizedId = String(resourceId || '').trim().toUpperCase()
  for (const [prefix, rule] of Object.entries(STARTS_WITH_RULE)) {
    if (normalizedId.startsWith(prefix)) {
      return rule
    }
  }

  return ''
}

function normalizeGenres(genres) {
  if (Array.isArray(genres)) {
    return genres
      .map((genre) => genre?.name?.trim())
      .filter(Boolean)
  }

  if (genres && typeof genres === 'object') {
    return Object.values(genres)
      .map((genre) => typeof genre === 'string' ? genre.trim() : genre?.name?.trim())
      .filter(Boolean)
  }

  return []
}

function unwrapProductPayload(data) {
  if (Array.isArray(data)) {
    return data[0] ?? null
  }

  return data ?? null
}

module.exports = {
  websiteName: 'DLsite',

  async fetchInfo(resourceId, ctx) {
    ctx.logger.info('start fetchInfo', { resourceId })

    const rule = resolveRule(resourceId)
    if (!rule) {
      ctx.logger.warn('unable to resolve dlsite rule', {
        resourceId,
        supportedPrefixes: Object.keys(STARTS_WITH_RULE)
      })
      throw new Error(`当前资源ID“${resourceId}”不匹配 DLsite 规则`)
    }

    const url = `https://www.dlsite.com/${rule}/api/=/product.json?workno=${encodeURIComponent(resourceId)}`
    ctx.logger.info('request product api', { resourceId, rule, url })

    const rawData = await ctx.requestJson(url, { timeoutMs: 20000 })
    const data = unwrapProductPayload(rawData)
    ctx.logger.info('response summary', {
      resourceId,
      rawDataType: Array.isArray(rawData) ? 'array' : typeof rawData,
      rawLength: Array.isArray(rawData) ? rawData.length : null,
      dataType: Array.isArray(data) ? 'array' : typeof data,
      topLevelKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 20) : [],
      workName: data?.work_name ?? '',
      makerName: data?.maker_name ?? '',
      workType: data?.work_type ?? '',
      hasImage: Boolean(data?.image_main?.url),
      genresCount: Array.isArray(data?.genres) ? data.genres.length : Object.keys(data?.genres ?? {}).length
    })

    if (!data?.work_name && data && typeof data === 'object') {
      ctx.logger.warn('unexpected dlsite payload', data)
    }

    const genres = normalizeGenres(data?.genres)
    const result = {
      name: data?.work_name ?? '',
      author: data?.maker_name ?? '',
      cover: data?.image_main?.url ? `https:${data.image_main.url}` : '',
      tag: genres,
      type: data?.work_type ? [data.work_type] : []
    }

    ctx.logger.debug('normalized result', result)
    return result
  }
}
