import { computed, nextTick, type ComputedRef, type Ref } from 'vue'
import { ResourceLaunchMode } from '../../../../../common/constants'

type Tone = 'mint' | 'blue' | 'amber' | 'purple' | 'rose' | 'green' | 'slate' | 'cyan' | 'orange' | 'magenta' | 'lime'

type HomePinnedCardLike = {
  id: string
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  coverUrl: string
  basePath: string
  fileName: string
  pinnedAt: number | null
  createTime: number | null
  lastAccessTime: number | null
  accessCount: number
  meta: string
  missingStatus?: boolean
}

type ContinueCardLike = {
  id: string
  categoryId: string
  time: string
  title: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  type: string
  launchMode: string
  launchModeLabel: string
  state: string
  note: string
  action: string
  tone: Tone
  missingStatus?: boolean
}

type MeasureDashboardTask = (
  label: string,
  task: () => Promise<void>,
  meta?: Record<string, unknown>
) => Promise<void>

export const useDashboardPinnedContinue = ({
  homePinnedCards,
  homePinnedLoading,
  homePinnedPage,
  continueRailRef,
  continueCards,
  continueLogsLoading,
  continueLogsPage,
  continueLogsTotal,
  continueRailShowBackButton,
  categoryOverview,
  isDark,
  defaultCategoryPillColor,
  measureDashboardTask,
  getCategoryEmoji,
  getCategoryTone,
  getToneColor,
  normalizeDateValue,
  formatPinnedRelativeTime,
  formatLogTime,
  formatLaunchMode,
  formatRuntime,
  getContinueActionLabel,
  colorAlpha,
  isValidCssColor
}: {
  homePinnedCards: Ref<HomePinnedCardLike[]>
  homePinnedLoading: Ref<boolean>
  homePinnedPage: Ref<number>
  continueRailRef: Ref<HTMLElement | null>
  continueCards: Ref<ContinueCardLike[]>
  continueLogsLoading: Ref<boolean>
  continueLogsPage: Ref<number>
  continueLogsTotal: Ref<number>
  continueRailShowBackButton: Ref<boolean>
  categoryOverview: Ref<Array<{ categoryName: string; color: string }>>
  isDark: ComputedRef<boolean>
  defaultCategoryPillColor: string
  measureDashboardTask: MeasureDashboardTask
  getCategoryEmoji: (item: any, categoryName: string) => string
  getCategoryTone: (categoryName: string, index: number) => Tone
  getToneColor: (tone: Tone) => string
  normalizeDateValue: (value: unknown) => Date | null
  formatPinnedRelativeTime: (value: unknown) => string
  formatLogTime: (value: unknown) => string
  formatLaunchMode: (value: unknown, isRunning: boolean) => string
  formatRuntime: (seconds: number) => string
  getContinueActionLabel: (categoryName: string) => string
  colorAlpha: (color: string, alpha: number) => string
  isValidCssColor: (value: string) => boolean
}) => {
  const getHomePinnedMeta = (item: { categoryName?: string; accessCount?: number; lastAccessTime?: unknown; pinnedAt?: unknown }) => {
    const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
    const accessCount = Number(item?.accessCount ?? 0)
    const lastAccess = formatPinnedRelativeTime(item?.lastAccessTime)
    const pinnedAt = formatPinnedRelativeTime(item?.pinnedAt)

    if (accessCount >= 6) {
      return `${categoryName} · 常用启动项`
    }

    if (lastAccess) {
      return `${categoryName} · 上次打开 ${lastAccess}`
    }

    if (pinnedAt) {
      return `${categoryName} · ${pinnedAt}固定`
    }

    return `${categoryName} · 已添加至快速启动`
  }

  const loadHomePinnedCards = async () => {
    homePinnedLoading.value = true
    try {
      await measureDashboardTask('loadHomePinnedCards', async () => {
        const items = await window.api.db.getHomePinnedResources(12)
        homePinnedCards.value = Array.isArray(items)
          ? await Promise.all(items.map(async (item: any) => {
            const coverPath = String(item?.coverPath ?? '').trim()
            let coverUrl = ''

            if (coverPath) {
              coverUrl = await window.api.dialog.getImagePreviewUrl(coverPath, {
                maxWidth: 720,
                maxHeight: 420,
                fit: 'cover',
                quality: 86
              }) ?? ''
            }

            return {
              id: String(item?.id ?? ''),
              title: String(item?.title ?? '未命名资源'),
              categoryId: String(item?.categoryId ?? ''),
              categoryName: String(item?.categoryName ?? '').trim() || '未分类',
              categoryEmoji: String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, String(item?.categoryName ?? '')),
              categoryColor: String(item?.categoryPillColor ?? '').trim() || defaultCategoryPillColor,
              coverUrl,
              basePath: String(item?.basePath ?? ''),
              fileName: String(item?.fileName ?? ''),
              missingStatus: Boolean(item?.missingStatus),
              pinnedAt: normalizeDateValue(item?.pinnedAt)?.getTime() ?? null,
              createTime: normalizeDateValue(item?.createTime)?.getTime() ?? null,
              lastAccessTime: normalizeDateValue(item?.lastAccessTime)?.getTime() ?? null,
              accessCount: Number(item?.accessCount ?? 0),
              meta: getHomePinnedMeta(item)
            }
          }))
          : []
        homePinnedPage.value = Math.min(homePinnedPage.value, Math.max(Math.ceil(homePinnedCards.value.length / 4) - 1, 0))
      })
    } catch {
      homePinnedCards.value = []
      homePinnedPage.value = 0
    } finally {
      homePinnedLoading.value = false
    }
  }

  const homePinnedPageSize = 4
  const homePinnedPageCount = computed(() => Math.max(Math.ceil(homePinnedCards.value.length / homePinnedPageSize), 1))
  const visibleHomePinnedCards = computed(() => {
    const start = homePinnedPage.value * homePinnedPageSize
    return homePinnedCards.value.slice(start, start + homePinnedPageSize)
  })
  const canMoveHomePinnedPrev = computed(() => homePinnedPage.value > 0)
  const canMoveHomePinnedNext = computed(() => homePinnedPage.value < homePinnedPageCount.value - 1)
  const homePinnedPageDots = computed(() => Array.from({ length: homePinnedPageCount.value }, (_, index) => index))

  const moveHomePinnedPage = (direction: -1 | 1) => {
    const nextPage = homePinnedPage.value + direction
    if (nextPage < 0 || nextPage >= homePinnedPageCount.value) {
      return
    }

    homePinnedPage.value = nextPage
  }

  const selectHomePinnedPage = (pageIndex: number) => {
    if (pageIndex < 0 || pageIndex >= homePinnedPageCount.value) {
      return
    }

    homePinnedPage.value = pageIndex
  }

  const continueLogsPageSize = 10
  const continueLogsHasMore = computed(() => continueCards.value.length < continueLogsTotal.value)

  const loadContinueLogs = async (page = 1, append = false) => {
    const normalizedPage = Math.max(1, page)
    if (continueLogsLoading.value) {
      return
    }

    continueLogsLoading.value = true
    try {
      await measureDashboardTask('loadContinueLogs', async () => {
        const result = await window.api.db.getRecentResourceLogs(normalizedPage, continueLogsPageSize)
        continueLogsPage.value = Number(result?.page ?? normalizedPage)
        continueLogsTotal.value = Number(result?.total ?? 0)
        const baseIndex = append ? continueCards.value.length : 0
        const nextCards = (result?.items ?? []).map((item: any, index: number) => {
          const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
          const categoryEmoji = String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, categoryName)
          const categoryColor = String(item?.categoryPillColor ?? '').trim() || defaultCategoryPillColor
          const endTime = normalizeDateValue(item?.endTime)
          const duration = Number(item?.duration ?? 0)
          const isRunning = !endTime

          return {
            id: String(item?.resourceId ?? ''),
            categoryId: String(item?.categoryId ?? ''),
            time: formatLogTime(item?.startTime),
            title: String(item?.title ?? '未命名资源'),
            categoryName,
            categoryEmoji,
            categoryColor,
            type: `${categoryEmoji} ${categoryName}`,
            launchMode: String(item?.launchMode ?? ResourceLaunchMode.NORMAL),
            launchModeLabel: formatLaunchMode(item?.launchMode, false),
            state: isRunning ? '正在运行' : `运行 ${formatRuntime(duration)}`,
            note: isRunning ? '当前还没有结束记录' : formatLogTime(item?.endTime),
            action: getContinueActionLabel(categoryName),
            tone: getCategoryTone(categoryName, baseIndex + index),
            missingStatus: Boolean(item?.missingStatus)
          }
        })

        continueCards.value = append ? [...continueCards.value, ...nextCards] : nextCards
      }, {
        page: normalizedPage,
        append: Boolean(append)
      })
    } catch {
      if (!append) {
        continueCards.value = []
        continueLogsTotal.value = 0
      }
    } finally {
      continueLogsLoading.value = false
      void nextTick(() => {
        handleContinueRailScroll()
      })
    }
  }

  const handleContinueRailScroll = () => {
    const rail = continueRailRef.value
    if (!rail) {
      return
    }

    continueRailShowBackButton.value = rail.scrollLeft > 12

    if (continueLogsLoading.value || !continueLogsHasMore.value) {
      return
    }

    const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft
    if (remaining <= 120) {
      void loadContinueLogs(continueLogsPage.value + 1, true)
    }
  }

  const scrollContinueRailToStart = () => {
    const rail = continueRailRef.value
    if (!rail) {
      return
    }

    continueRailShowBackButton.value = false
    rail.scrollTo({
      left: 0,
      behavior: 'smooth'
    })
  }

  const handleContinueRailWheel = (event: WheelEvent) => {
    const rail = continueRailRef.value
    if (!rail) {
      return
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) {
      return
    }

    const maxScrollLeft = rail.scrollWidth - rail.clientWidth
    if (maxScrollLeft <= 0) {
      return
    }

    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, rail.scrollLeft + delta))
    if (nextScrollLeft === rail.scrollLeft) {
      return
    }

    event.preventDefault()
    rail.scrollLeft = nextScrollLeft
    handleContinueRailScroll()
  }

  const getContinueCardColor = (card: { categoryName: string; categoryColor?: string; tone: Tone }) => {
    if (card.categoryColor && isValidCssColor(card.categoryColor)) {
      return card.categoryColor
    }

    const categoryColor = categoryOverview.value.find((item) => item.categoryName === card.categoryName)?.color
    return categoryColor || getToneColor(card.tone)
  }

  const getContinueCardStyle = (card: { categoryName: string; categoryColor?: string; tone: Tone }) => {
    const color = getContinueCardColor(card)
    return {
      color,
      backgroundColor: colorAlpha(color, isDark.value ? 0.24 : 0.14),
      borderColor: colorAlpha(color, isDark.value ? 0.42 : 0.3)
    }
  }

  return {
    loadHomePinnedCards,
    homePinnedPageSize,
    homePinnedPageCount,
    visibleHomePinnedCards,
    canMoveHomePinnedPrev,
    canMoveHomePinnedNext,
    homePinnedPageDots,
    moveHomePinnedPage,
    selectHomePinnedPage,
    continueLogsPageSize,
    continueLogsHasMore,
    loadContinueLogs,
    handleContinueRailScroll,
    scrollContinueRailToStart,
    handleContinueRailWheel,
    getContinueCardColor,
    getContinueCardStyle
  }
}
