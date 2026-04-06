const { buildQueryCandidates, buildResourceProfile } = require('./comic-meta/shared')
const { searchEhentai } = require('./comic-meta/ehentai')
const { searchNhentai } = require('./comic-meta/nhentai')
const { searchJmComic } = require('./comic-meta/jmcomic')
const { searchPicacg } = require('./comic-meta/picacg')

async function searchInOrder(resourceId, ctx) {
  const queryCandidates = buildQueryCandidates(resourceId)
  const profile = buildResourceProfile(resourceId)
  ctx.logger.info('comic query candidates', { resourceId, queryCandidates })

  const strategies = [
    { name: 'E-Hentai', search: (query) => searchEhentai(query, ctx, profile) },
    { name: 'nhentai', search: (query) => searchNhentai(query, ctx, profile) },
    // { name: '禁漫天堂', search: (query) => searchJmComic(query, ctx, profile) },
    // { name: '哔咔', search: (query) => searchPicacg(query, ctx, profile) }
  ]

  for (const strategy of strategies) {
    for (const query of queryCandidates) {
      try {
        const result = await strategy.search(query)
        if (result?.name) {
          return result
        }
      } catch (error) {
        ctx.logger.warn('comic source search failed', {
          query,
          source: strategy.name,
          message: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  return null
}

module.exports = {
  websiteName: 'ComicMeta',
  dictTypeName: 'mangaSiteType',
  websiteValue: 'comic-meta',
  websiteDescription: '综合漫画信息搜索',
  websiteExtra: {
    enableFetchInfo: true
  },

  async fetchInfo(resourceId, ctx) {
    ctx.logger.info('start comic meta fetch', { resourceId })
    const result = await searchInOrder(resourceId, ctx)

    if (!result) {
      throw new Error('未在已启用的漫画来源中搜索到匹配的漫画信息')
    }

    ctx.logger.info('comic meta fetch success', {
      resourceId,
      site: result.site,
      website: result.website,
      name: result.name
    })

    return {
      name: result.name || '',
      author: result.author || '',
      translator: result.translator || '',
      cover: result.cover || '',
      website: result.website || '',
      tag: Array.isArray(result.tag) ? result.tag : [],
      type: Array.isArray(result.type) ? result.type : []
    }
  }
}
