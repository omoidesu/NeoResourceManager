import {createLogger} from '../../../../../main/util/logger'

export const useResourceCardPerformance = (params: {
  getResource: () => any
  getCategoryName: () => string
}) => {
  const {getResource, getCategoryName} = params
  const logger = createLogger('resource-card')

  const emitRendererTiming = (message: string, meta?: Record<string, unknown>) => {
    window.api?.diagnostics?.logRenderer('info', message, meta)
  }

  const reportCardMounted = (resourceId: string) => {
    const perf = ((window as any).__nrmCategoryRoutePerf ?? null) as null | {
      startedAt: number
      categoryId: string
      cardMountedCount?: number
      firstCardLogged?: boolean
      fourthCardLogged?: boolean
    }

    if (!perf) {
      return
    }

    perf.cardMountedCount = Number(perf.cardMountedCount ?? 0) + 1
    const mountedCount = perf.cardMountedCount
    const elapsedMs = Math.round(performance.now() - Number(perf.startedAt ?? 0))

    if (mountedCount === 1 && !perf.firstCardLogged) {
      perf.firstCardLogged = true
      emitRendererTiming('category route perf', {
        phase: 'category-first-card-mounted',
        elapsedMs,
        resourceId
      })
    }

    if (mountedCount === 4 && !perf.fourthCardLogged) {
      perf.fourthCardLogged = true
      emitRendererTiming('category route perf', {
        phase: 'category-fourth-card-mounted',
        elapsedMs,
        resourceId
      })
    }

    ;(window as any).__nrmCategoryRoutePerf = perf
  }

  const logCardTiming = (scope: string, startedAt: number, extra?: Record<string, any>) => {
    const resource = getResource()
    logger.info('card timing', {
      scope,
      resourceId: String(resource?.id ?? ''),
      categoryName: getCategoryName(),
      title: String(resource?.title ?? ''),
      elapsedMs: Math.round(performance.now() - startedAt),
      ...(extra ?? {})
    })
  }

  return {
    reportCardMounted,
    logCardTiming,
    previewLoadStrategy: {
      coverPreviewLoadDelayMs: 140,
      fileIconLoadDelayMs: 180,
      websiteFaviconLoadDelayMs: 140,
      coverPreviewRootMargin: '80px 0px',
      fileIconRootMargin: '160px 0px',
      websiteFaviconRootMargin: '100px 0px',
      coverPreviewMaxWidth: 360,
      coverPreviewMaxHeight: 240,
      coverPreviewQuality: 68,
      websiteFaviconMaxWidth: 64,
      websiteFaviconMaxHeight: 64,
      websiteFaviconQuality: 80
    }
  }
}
