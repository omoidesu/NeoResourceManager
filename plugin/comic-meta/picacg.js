async function searchPicacg(query, ctx) {
  const username = String(process.env.PICACG_USERNAME || '').trim()
  const password = String(process.env.PICACG_PASSWORD || '').trim()

  if (!username || !password) {
    ctx.logger.info('skip picacg search because credentials are missing', { query })
    return null
  }

  ctx.logger.warn('picacg search is not configured in this plugin version', { query })
  return null
}

module.exports = {
  searchPicacg
}
