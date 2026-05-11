import { computed, nextTick, ref, watch, type Ref } from 'vue'

type Tone = 'mint' | 'blue' | 'amber' | 'purple' | 'rose' | 'green' | 'slate' | 'cyan' | 'orange' | 'magenta' | 'lime'
type CoverWallFilterKey = 'all' | 'recentRun' | 'recentAdd' | 'favorite' | 'coverOnly'
type RendererTimingPayload = Record<string, unknown> | undefined
type EmitRendererTiming = (message: string, meta?: RendererTimingPayload) => void
type MeasureDashboardTask = <T>(
  label: string,
  task: () => Promise<T>,
  meta?: Record<string, unknown>
) => Promise<T>

type ResourceChipLike = {
  routeId: string
  categoryName: string
  emoji: string
  color: string
  count: number
}

type CoverWallResource = {
  id: string
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  coverPath: string
  coverUrl: string
  favorite: boolean
  isCompleted: boolean
  missingStatus: boolean
  isPinned: boolean
  rating: number
  createTime: number | null
  lastAccessTime: number | null
  accessCount: number
  tagCount: number
  authorCount: number
  searchText: string
}

type CoverWallCategoryChip = {
  id: string
  label: string
  emoji: string
  color: string
  count: number
}

type CoverWallPageState = {
  offset: number
  hasMore: boolean
  loading: boolean
}

export const useDashboardCoverFeeds = ({
  categoryOverview,
  dashboardDisposed,
  defaultCategoryPillColor,
  emitRendererTiming,
  measureDashboardTask,
  toCssUrlValue,
  getCategoryEmoji,
  getCategoryTone,
  getToneColor,
  colorAlpha
}: {
  categoryOverview: Ref<ResourceChipLike[]>
  dashboardDisposed: Ref<boolean>
  defaultCategoryPillColor: string
  emitRendererTiming: EmitRendererTiming
  measureDashboardTask: MeasureDashboardTask
  toCssUrlValue: (value: unknown) => string
  getCategoryEmoji: (item: any, categoryName: string) => string
  getCategoryTone: (categoryName: string, index: number) => Tone
  getToneColor: (tone: Tone) => string
  colorAlpha: (color: string, alpha: number) => string
}) => {
  const coverWallLoading = ref(false)
  const coverWallActiveFilter = ref<CoverWallFilterKey>('all')
  const coverWallActiveCategoryId = ref('')
  const coverWallPageSize = 60
  const coverWallItems = ref<Record<CoverWallFilterKey, CoverWallResource[]>>({
    all: [],
    recentRun: [],
    recentAdd: [],
    favorite: [],
    coverOnly: []
  })
  const coverWallSearchKeyword = ref('')
  const coverWallQueryTotal = ref(0)
  const coverWallCounts = ref<Record<CoverWallFilterKey, number>>({
    all: 0,
    recentRun: 0,
    recentAdd: 0,
    favorite: 0,
    coverOnly: 0
  })
  const coverWallCategoryCounts = ref<CoverWallCategoryChip[]>([])
  const coverWallPageState = ref<Record<CoverWallFilterKey, CoverWallPageState>>({
    all: { offset: 0, hasMore: true, loading: false },
    recentRun: { offset: 0, hasMore: true, loading: false },
    recentAdd: { offset: 0, hasMore: true, loading: false },
    favorite: { offset: 0, hasMore: true, loading: false },
    coverOnly: { offset: 0, hasMore: true, loading: false }
  })
  const coverWallStageRef = ref<HTMLElement | null>(null)
  const coverWallLoadMoreRef = ref<HTMLElement | null>(null)
  const coverWallStickyRef = ref<HTMLElement | null>(null)
  const coverWallCardRefs = new Map<string, HTMLElement>()
  const coverWallHoverState = ref<{ id: string; left: number; top: number } | null>(null)
  const coverWallStickyStuck = ref(false)
  const coverWallCategoryItems = ref<CoverWallResource[]>([])
  const coverWallCategoryPageState = ref<CoverWallPageState>({
    offset: 0,
    hasMore: true,
    loading: false
  })
  const coverWallHydrationToken = ref<Record<CoverWallFilterKey, number>>({
    all: 0,
    recentRun: 0,
    recentAdd: 0,
    favorite: 0,
    coverOnly: 0
  })
  const coverWallCategoryHydrationToken = ref(0)

  let coverWallLoadMoreObserver: IntersectionObserver | null = null
  let coverWallHoverShowTimer: number | null = null
  let coverWallHoverHideTimer: number | null = null
  let coverWallSearchTimer: number | null = null
  let coverWallStickyScrollHost: HTMLElement | Window | null = null
  let coverWallStickyRafId: number | null = null

  const scrollCoverWallContainerToTop = () => {
    const sectionElement = coverWallStickyRef.value?.closest('#home-cover-wall') as HTMLElement | null
    if (!sectionElement) {
      return
    }

    const scrollHost = sectionElement.closest('.n-layout-scroll-container') as HTMLElement | null
    if (scrollHost) {
      const hostRect = scrollHost.getBoundingClientRect()
      const sectionRect = sectionElement.getBoundingClientRect()
      const targetTop = Math.max(0, scrollHost.scrollTop + sectionRect.top - hostRect.top - 18)
      scrollHost.scrollTo({ top: targetTop, behavior: 'auto' })
      return
    }

    const targetTop = Math.max(0, window.scrollY + sectionElement.getBoundingClientRect().top - 18)
    window.scrollTo({ top: targetTop, behavior: 'auto' })
  }

  const mapSingleCoverWallResource = (item: any, index: number) => {
    const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
    const categoryEmoji = String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, categoryName)
    const tone = getCategoryTone(categoryName, index)
    const categoryColor = String(item?.categoryPillColor ?? '').trim() || getToneColor(tone)
    const coverPath = String(item?.coverPath ?? '').trim()

    return {
      id: String(item?.id ?? ''),
      title: String(item?.title ?? '未命名资源'),
      categoryId: String(item?.categoryId ?? ''),
      categoryName,
      categoryEmoji,
      categoryColor,
      coverPath,
      coverUrl: '',
      favorite: Boolean(item?.ifFavorite),
      isCompleted: Boolean(item?.isCompleted),
      missingStatus: Boolean(item?.missingStatus),
      isPinned: Boolean(item?.isPinned),
      rating: Number(item?.rating ?? -1),
      createTime: normalizeDateValue(item?.createTime)?.getTime() ?? null,
      lastAccessTime: normalizeDateValue(item?.lastAccessTime)?.getTime() ?? null,
      accessCount: Math.max(0, Number(item?.accessCount ?? 0)),
      tagCount: Math.max(0, Number(item?.tagCount ?? 0)),
      authorCount: Math.max(0, Number(item?.authorCount ?? 0)),
      searchText: String(item?.searchText ?? '').trim()
    }
  }

  const resolveCoverWallItemPreviewUrl = async (coverPath: string) => {
    const normalizedCoverPath = String(coverPath ?? '').trim()
    if (!normalizedCoverPath) {
      return ''
    }

    return await window.api.dialog.getImagePreviewUrl(normalizedCoverPath, {
      maxWidth: 420,
      maxHeight: 560,
      fit: 'cover',
      quality: 88
    }) ?? ''
  }

  const patchCoverWallItems = (filterKey: CoverWallFilterKey, patches: Array<Partial<CoverWallResource> & { id: string }>) => {
    if (!patches.length) {
      return
    }

    const patchMap = new Map(patches.map((item) => [item.id, item]))
    coverWallItems.value[filterKey] = (coverWallItems.value[filterKey] ?? []).map((item) => {
      const patch = patchMap.get(item.id)
      return patch ? { ...item, ...patch } : item
    })
  }

  const patchCoverWallCategoryItems = (patches: Array<Partial<CoverWallResource> & { id: string }>) => {
    if (!patches.length) {
      return
    }

    const patchMap = new Map(patches.map((item) => [item.id, item]))
    coverWallCategoryItems.value = coverWallCategoryItems.value.map((item) => {
      const patch = patchMap.get(item.id)
      return patch ? { ...item, ...patch } : item
    })
  }

  const hydrateCoverWallPageCovers = async (
    filterKey: CoverWallFilterKey,
    items: CoverWallResource[],
    hydrationToken: number
  ) => {
    if (!items.length) {
      return
    }

    const startedAt = performance.now()
    const chunkSize = 12
    let coveredItemCount = 0

    for (let offset = 0; offset < items.length; offset += chunkSize) {
      if (dashboardDisposed.value || coverWallHydrationToken.value[filterKey] !== hydrationToken) {
        return
      }

      const chunk = items.slice(offset, offset + chunkSize)
      const patches = await Promise.all(chunk.map(async (item) => {
        const coverUrl = await resolveCoverWallItemPreviewUrl(item.coverPath)
        const currentItem = coverWallItems.value[filterKey]?.find((current) => current.id === item.id)
        if (currentItem && currentItem.coverPath !== item.coverPath) {
          return {
            id: item.id,
            coverUrl: currentItem.coverUrl
          }
        }

        if (coverUrl) {
          coveredItemCount += 1
        }

        return {
          id: item.id,
          coverUrl
        }
      }))

      if (dashboardDisposed.value || coverWallHydrationToken.value[filterKey] !== hydrationToken) {
        return
      }

      patchCoverWallItems(filterKey, patches)
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    emitRendererTiming('dashboard cover wall page hydration completed', {
      filterKey,
      itemCount: items.length,
      coveredItemCount,
      elapsedMs: Math.round(performance.now() - startedAt)
    })
  }

  const hydrateCoverWallCategoryPageCovers = async (
    categoryId: string,
    items: CoverWallResource[],
    hydrationToken: number
  ) => {
    if (!items.length) {
      return
    }

    const startedAt = performance.now()
    const chunkSize = 12
    let coveredItemCount = 0

    for (let offset = 0; offset < items.length; offset += chunkSize) {
      if (dashboardDisposed.value || coverWallCategoryHydrationToken.value !== hydrationToken) {
        return
      }

      const chunk = items.slice(offset, offset + chunkSize)
      const patches = await Promise.all(chunk.map(async (item) => {
        const coverUrl = await resolveCoverWallItemPreviewUrl(item.coverPath)
        const currentItem = coverWallCategoryItems.value.find((current) => current.id === item.id)
        if (currentItem && currentItem.coverPath !== item.coverPath) {
          return {
            id: item.id,
            coverUrl: currentItem.coverUrl
          }
        }

        if (coverUrl) {
          coveredItemCount += 1
        }

        return {
          id: item.id,
          coverUrl
        }
      }))

      if (dashboardDisposed.value || coverWallCategoryHydrationToken.value !== hydrationToken) {
        return
      }

      patchCoverWallCategoryItems(patches)
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    emitRendererTiming('dashboard cover wall category hydration completed', {
      categoryId,
      itemCount: items.length,
      coveredItemCount,
      elapsedMs: Math.round(performance.now() - startedAt)
    })
  }

  const resetCoverWallViewState = () => {
    coverWallHoverState.value = null
    coverWallCardRefs.clear()
  }

  const resetCoverWallPageState = (filterKey?: CoverWallFilterKey) => {
    if (filterKey) {
      coverWallHydrationToken.value[filterKey] += 1
      coverWallPageState.value[filterKey] = { offset: 0, hasMore: true, loading: false }
      coverWallItems.value[filterKey] = []
      return
    }

    coverWallHydrationToken.value = {
      all: coverWallHydrationToken.value.all + 1,
      recentRun: coverWallHydrationToken.value.recentRun + 1,
      recentAdd: coverWallHydrationToken.value.recentAdd + 1,
      favorite: coverWallHydrationToken.value.favorite + 1,
      coverOnly: coverWallHydrationToken.value.coverOnly + 1
    }
    coverWallPageState.value = {
      all: { offset: 0, hasMore: true, loading: false },
      recentRun: { offset: 0, hasMore: true, loading: false },
      recentAdd: { offset: 0, hasMore: true, loading: false },
      favorite: { offset: 0, hasMore: true, loading: false },
      coverOnly: { offset: 0, hasMore: true, loading: false }
    }
    coverWallItems.value = { all: [], recentRun: [], recentAdd: [], favorite: [], coverOnly: [] }
  }

  const resetCoverWallCategoryState = () => {
    coverWallCategoryHydrationToken.value += 1
    coverWallCategoryItems.value = []
    coverWallCategoryPageState.value = {
      offset: 0,
      hasMore: true,
      loading: false
    }
  }

  const mergeCoverWallPage = (filterKey: CoverWallFilterKey, items: CoverWallResource[], reset = false) => {
    const currentItems = reset ? [] : (coverWallItems.value[filterKey] ?? [])
    const seenIds = new Set(currentItems.map((item) => item.id))
    const mergedItems = [...currentItems]
    for (const item of items) {
      if (seenIds.has(item.id)) {
        continue
      }
      seenIds.add(item.id)
      mergedItems.push(item)
    }
    coverWallItems.value[filterKey] = mergedItems
  }

  const mergeCoverWallCategoryPage = (items: CoverWallResource[], reset = false) => {
    const currentItems = reset ? [] : coverWallCategoryItems.value
    const seenIds = new Set(currentItems.map((item) => item.id))
    const mergedItems = [...currentItems]
    for (const item of items) {
      if (seenIds.has(item.id)) {
        continue
      }
      seenIds.add(item.id)
      mergedItems.push(item)
    }
    coverWallCategoryItems.value = mergedItems
  }

  const findCoverWallResourceSnapshot = (resourceId: string) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return null
    }

    for (const items of Object.values(coverWallItems.value)) {
      const matchedItem = items.find((item) => item.id === normalizedResourceId)
      if (matchedItem) {
        return matchedItem
      }
    }

    return coverWallCategoryItems.value.find((item) => item.id === normalizedResourceId) ?? null
  }

  const refreshCoverWallResource = async (resourceId: string) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId || dashboardDisposed.value) {
      return
    }

    const existingItem = findCoverWallResourceSnapshot(normalizedResourceId)
    const detailResult = await window.api.service.getResourceDetail(normalizedResourceId)
    const detail = detailResult?.data
    if (!detail || dashboardDisposed.value) {
      return
    }

    const categoryName = String(detail?.categoryName ?? existingItem?.categoryName ?? '未分类').trim() || '未分类'
    const coverPath = String(detail?.coverPath ?? existingItem?.coverPath ?? '').trim()
    const coverUrl = await resolveCoverWallItemPreviewUrl(coverPath)
    if (dashboardDisposed.value) {
      return
    }

    const patch: Partial<CoverWallResource> & { id: string } = {
      id: normalizedResourceId,
      title: String(detail?.title ?? existingItem?.title ?? '未命名资源'),
      categoryId: String(detail?.categoryId ?? existingItem?.categoryId ?? ''),
      categoryName,
      categoryEmoji: String(existingItem?.categoryEmoji ?? '').trim() || getCategoryEmoji(detail, categoryName),
      categoryColor: String(existingItem?.categoryColor ?? '').trim() || defaultCategoryPillColor,
      coverPath,
      coverUrl,
      favorite: Boolean(detail?.ifFavorite ?? existingItem?.favorite),
      isCompleted: Boolean(detail?.isCompleted ?? existingItem?.isCompleted),
      missingStatus: Boolean(detail?.missingStatus ?? existingItem?.missingStatus),
      isPinned: Boolean(detail?.isPinned ?? existingItem?.isPinned),
      rating: Number(detail?.rating ?? existingItem?.rating ?? -1)
    }

    ;(['all', 'recentRun', 'recentAdd', 'favorite', 'coverOnly'] as CoverWallFilterKey[]).forEach((filterKey) => {
      patchCoverWallItems(filterKey, [patch])
    })
    patchCoverWallCategoryItems([patch])
  }

  const updateCoverWallPinnedState = (resourceId: string, isPinned: boolean) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return
    }

    const patch = {
      id: normalizedResourceId,
      isPinned
    }

    ;(['all', 'recentRun', 'recentAdd', 'favorite', 'coverOnly'] as CoverWallFilterKey[]).forEach((filterKey) => {
      patchCoverWallItems(filterKey, [patch])
    })
    patchCoverWallCategoryItems([patch])
  }

  const loadCoverWallPage = async (filterKey: CoverWallFilterKey, reset = false) => {
    const pageState = coverWallPageState.value[filterKey]
    if (pageState.loading || (!reset && !pageState.hasMore)) {
      return
    }

    pageState.loading = true
    if (reset) {
      pageState.offset = 0
      pageState.hasMore = true
    }
    const pageOffset = pageState.offset

    try {
      const result = await window.api.db.getHomeCoverWallData({
        filter: filterKey,
        limit: coverWallPageSize,
        offset: pageState.offset,
        keyword: coverWallSearchKeyword.value.trim() || undefined
      })

      coverWallCounts.value = {
        all: Number(result?.counts?.all ?? 0),
        recentRun: Number(result?.counts?.recentRun ?? 0),
        recentAdd: Number(result?.counts?.recentAdd ?? 0),
        favorite: Number(result?.counts?.favorite ?? 0),
        coverOnly: Number(result?.counts?.coverOnly ?? 0)
      }
      coverWallCategoryCounts.value = Array.isArray(result?.categoryCounts)
        ? result.categoryCounts.map((item: any) => ({
          id: String(item?.categoryId ?? '').trim(),
          label: String(item?.categoryName ?? '未分类').trim() || '未分类',
          emoji: String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, String(item?.categoryName ?? '未分类')),
          color: String(item?.categoryPillColor ?? '').trim() || defaultCategoryPillColor,
          count: Math.max(0, Number(item?.total ?? 0))
        })).filter((item: CoverWallCategoryChip) => item.id)
        : []

      const rawItems = Array.isArray(result?.items) ? result.items : []
      coverWallQueryTotal.value = Number(result?.total ?? rawItems.length)
      const pageItems = rawItems
        .map((item, index) => mapSingleCoverWallResource(item, pageOffset + index))
        .filter((item) => item.id)
      const hydrationToken = coverWallHydrationToken.value[filterKey]
      mergeCoverWallPage(filterKey, pageItems, reset)
      emitRendererTiming('dashboard cover wall page merged', {
        filterKey,
        reset,
        rawItemCount: rawItems.length,
        mergedItemCount: pageItems.length
      })
      void hydrateCoverWallPageCovers(filterKey, pageItems, hydrationToken)

      pageState.offset += rawItems.length
      pageState.hasMore = Boolean(result?.hasMore)
    } catch {
      emitRendererTiming('dashboard cover wall page merged', {
        filterKey,
        reset,
        status: 'error'
      })
      if (reset) {
        coverWallItems.value[filterKey] = []
        pageState.offset = 0
        pageState.hasMore = false
      }
    } finally {
      pageState.loading = false
    }
  }

  const loadCoverWallCategoryPage = async (categoryId: string, reset = false) => {
    const pageState = coverWallCategoryPageState.value
    if (pageState.loading || (!reset && !pageState.hasMore)) {
      return
    }

    const pageStartAt = performance.now()
    pageState.loading = true
    if (reset) {
      pageState.offset = 0
      pageState.hasMore = true
    }
    const pageOffset = pageState.offset
    emitRendererTiming('dashboard cover wall category page start', {
      categoryId,
      reset,
      offset: pageState.offset,
      keyword: coverWallSearchKeyword.value.trim()
    })

    try {
      const result = await window.api.db.getHomeCoverWallData({
        filter: 'all',
        categoryId,
        limit: coverWallPageSize,
        offset: pageState.offset,
        keyword: coverWallSearchKeyword.value.trim() || undefined
      })

      coverWallCategoryCounts.value = Array.isArray(result?.categoryCounts)
        ? result.categoryCounts.map((item: any) => ({
          id: String(item?.categoryId ?? '').trim(),
          label: String(item?.categoryName ?? '未分类').trim() || '未分类',
          emoji: String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, String(item?.categoryName ?? '未分类')),
          color: String(item?.categoryPillColor ?? '').trim() || defaultCategoryPillColor,
          count: Math.max(0, Number(item?.total ?? 0))
        })).filter((item: CoverWallCategoryChip) => item.id)
        : []

      const rawItems = Array.isArray(result?.items) ? result.items : []
      coverWallQueryTotal.value = Number(result?.total ?? rawItems.length)
      const pageItems = rawItems
        .map((item, index) => mapSingleCoverWallResource(item, pageOffset + index))
        .filter((item) => item.id)
      const hydrationToken = coverWallCategoryHydrationToken.value
      mergeCoverWallCategoryPage(pageItems, reset)
      emitRendererTiming('dashboard cover wall category page merged', {
        categoryId,
        reset,
        rawItemCount: rawItems.length,
        mergedItemCount: pageItems.length,
        total: Number(result?.total ?? rawItems.length),
        hasMore: Boolean(result?.hasMore),
        elapsedMs: Math.round(performance.now() - pageStartAt)
      })
      void hydrateCoverWallCategoryPageCovers(categoryId, pageItems, hydrationToken)

      pageState.offset += rawItems.length
      pageState.hasMore = Boolean(result?.hasMore)
    } catch {
      emitRendererTiming('dashboard cover wall category page merged', {
        categoryId,
        reset,
        status: 'error',
        elapsedMs: Math.round(performance.now() - pageStartAt)
      })
      if (reset) {
        coverWallCategoryItems.value = []
        pageState.offset = 0
        pageState.hasMore = false
      }
    } finally {
      pageState.loading = false
    }
  }

  const loadCoverWallData = async () => {
    coverWallLoading.value = true
    try {
      await measureDashboardTask('loadCoverWallData', async () => {
        resetCoverWallPageState()
        resetCoverWallCategoryState()
        await loadCoverWallPage('all', true)
        resetCoverWallViewState()
      })
    } catch {
      coverWallCounts.value = { all: 0, recentRun: 0, recentAdd: 0, favorite: 0, coverOnly: 0 }
      resetCoverWallPageState()
      resetCoverWallCategoryState()
      resetCoverWallViewState()
    } finally {
      coverWallLoading.value = false
    }
  }

  const handleCoverFilterClick = (filterKey: CoverWallFilterKey) => {
    emitRendererTiming('dashboard cover wall filter click', {
      previousSelectionKind: coverWallActiveSelection.value.kind,
      previousFilter: coverWallActiveFilter.value,
      previousCategoryId: coverWallActiveCategoryId.value,
      nextFilter: filterKey
    })
    if (coverWallActiveSelection.value.kind === 'status' && coverWallActiveFilter.value === filterKey) {
      return
    }

    coverWallActiveFilter.value = filterKey
    coverWallActiveCategoryId.value = ''
    coverWallSearchKeyword.value = ''
    resetCoverWallViewState()
    resetCoverWallCategoryState()
    if (!coverWallItems.value[filterKey].length && coverWallPageState.value[filterKey].hasMore) {
      void loadCoverWallPage(filterKey, true)
    }
  }

  const getCoverCardStyle = (item: CoverWallResource) => ({
    color: item.categoryColor,
    '--cover-card-url': toCssUrlValue(item.coverUrl)
  })

  const setCoverWallCardRef = (id: string, element: any) => {
    if (element instanceof HTMLElement) {
      coverWallCardRefs.set(id, element)
      return
    }

    coverWallCardRefs.delete(id)
  }

  const clearCoverWallHoverTimers = () => {
    if (coverWallHoverShowTimer != null) {
      clearTimeout(coverWallHoverShowTimer)
      coverWallHoverShowTimer = null
    }
    if (coverWallHoverHideTimer != null) {
      clearTimeout(coverWallHoverHideTimer)
      coverWallHoverHideTimer = null
    }
  }

  const positionCoverWallHoverCard = (itemId: string) => {
    const stageElement = coverWallStageRef.value
    const cardElement = coverWallCardRefs.get(itemId)
    if (!stageElement || !cardElement) {
      return
    }

    const stageRect = stageElement.getBoundingClientRect()
    const cardRect = cardElement.getBoundingClientRect()
    const panelWidth = 272
    const gap = 14
    const preferredRight = cardRect.right + gap + panelWidth <= stageRect.right
    const rawLeft = preferredRight
      ? cardRect.right - stageRect.left + gap
      : cardRect.left - stageRect.left - panelWidth - gap
    const maxLeft = Math.max(stageRect.width - panelWidth, 0)
    const left = Math.min(Math.max(rawLeft, 0), maxLeft)
    const maxTop = Math.max(stageRect.height - 210, 0)
    const top = Math.min(Math.max(cardRect.top - stageRect.top + 8, 0), maxTop)

    coverWallHoverState.value = {
      id: itemId,
      left,
      top
    }
  }

  const scheduleCoverWallHoverShow = (itemId: string) => {
    if (coverWallHoverHideTimer != null) {
      clearTimeout(coverWallHoverHideTimer)
      coverWallHoverHideTimer = null
    }
    if (coverWallHoverState.value?.id === itemId) {
      return
    }
    if (coverWallHoverShowTimer != null) {
      clearTimeout(coverWallHoverShowTimer)
    }
    coverWallHoverShowTimer = window.setTimeout(() => {
      positionCoverWallHoverCard(itemId)
      coverWallHoverShowTimer = null
    }, 600)
  }

  const scheduleCoverWallHoverHide = (itemId?: string) => {
    if (coverWallHoverShowTimer != null) {
      clearTimeout(coverWallHoverShowTimer)
      coverWallHoverShowTimer = null
    }
    if (!coverWallHoverState.value) {
      return
    }
    if (itemId && coverWallHoverState.value.id !== itemId) {
      return
    }
    if (coverWallHoverHideTimer != null) {
      clearTimeout(coverWallHoverHideTimer)
      coverWallHoverHideTimer = null
    }
    coverWallHoverState.value = null
  }

  const coverFilters = computed(() => ([
    { key: 'all' as const, label: `全部 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.all) || 0)))}`, tone: 'mint' as Tone },
    { key: 'recentRun' as const, label: `最近使用 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.recentRun) || 0)))}`, tone: 'slate' as Tone },
    { key: 'recentAdd' as const, label: `最近添加 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.recentAdd) || 0)))}`, tone: 'blue' as Tone },
    { key: 'favorite' as const, label: `已收藏 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.favorite) || 0)))}`, tone: 'purple' as Tone },
    { key: 'coverOnly' as const, label: `有封面 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.coverOnly) || 0)))}`, tone: 'green' as Tone }
  ]))

  const coverWallActiveSelection = computed<{ kind: 'status' | 'category'; key: string }>(() => {
    if (coverWallActiveCategoryId.value) {
      return { kind: 'category', key: coverWallActiveCategoryId.value }
    }
    return { kind: 'status', key: coverWallActiveFilter.value }
  })

  const currentCoverWallPageState = computed(() =>
    coverWallActiveSelection.value.kind === 'category'
      ? coverWallCategoryPageState.value
      : coverWallPageState.value[coverWallActiveFilter.value]
  )
  const displayedCoverWallItems = computed(() => {
    const baseItems = coverWallActiveSelection.value.kind === 'category'
      ? coverWallCategoryItems.value
      : (coverWallItems.value[coverWallActiveFilter.value] ?? [])
    return baseItems
  })
  const coverWallVisibleItems = computed(() => displayedCoverWallItems.value)
  const coverWallShouldLoadMore = computed(() =>
    !coverWallLoading.value
    && currentCoverWallPageState.value.hasMore
    && !currentCoverWallPageState.value.loading
  )
  const coverWallInitialLoading = computed(() =>
    coverWallLoading.value
    || (
      currentCoverWallPageState.value.loading
      && !displayedCoverWallItems.value.length
    )
  )
  const coverWallHoveredItem = computed(() =>
    coverWallVisibleItems.value.find((item) => item.id === coverWallHoverState.value?.id) ?? null
  )
  const coverWallCategoryFilters = computed(() => {
    const chipMap = new Map(coverWallCategoryCounts.value.map((item) => [item.id, item] as const))
    const orderedFromTop = categoryOverview.value
      .filter((item) => String(item.routeId ?? '').trim())
      .map((item) => {
        const categoryId = String(item.routeId ?? '').trim()
        const matched = chipMap.get(categoryId)
        return {
          id: categoryId,
          label: item.categoryName,
          emoji: item.emoji,
          color: item.color || matched?.color || defaultCategoryPillColor,
          count: Number(matched?.count ?? 0)
        }
      }) as CoverWallCategoryChip[]

    const appended = coverWallCategoryCounts.value.filter((item) =>
      !orderedFromTop.some((orderedItem) => orderedItem.id === item.id)
    )

    return [...orderedFromTop, ...appended]
  })

  const getCoverWallHoverMetaLabel = (item: CoverWallResource) => {
    return item.lastAccessTime
      ? `上次使用 ${formatPinnedRelativeTime(item.lastAccessTime)}`
      : '上次使用 暂无记录'
  }

  const getCoverWallCompletedLabel = (item: CoverWallResource) => {
    const categoryName = item.categoryName.trim().toLowerCase()
    if (categoryName.includes('游戏') || categoryName.includes('game') || categoryName.includes('galgame')) {
      return '已通关'
    }
    if (categoryName.includes('小说') || categoryName.includes('书') || categoryName.includes('novel') || categoryName.includes('book')) {
      return '已读完'
    }
    if (
      categoryName.includes('电影')
      || categoryName.includes('番剧')
      || categoryName.includes('anime')
      || categoryName.includes('movie')
      || categoryName.includes('视频')
      || categoryName.includes('video')
    ) {
      return '已播完'
    }
    return '已完成'
  }

  const getCoverWallStateBadges = (item: CoverWallResource) => {
    const badges: string[] = []
    if (item.missingStatus) badges.push('资源失效')
    if (item.favorite) badges.push('已收藏')
    if (item.isCompleted) badges.push(getCoverWallCompletedLabel(item))
    if (item.isPinned) badges.push('已固定')
    return badges
  }

  const getCoverWallSummaryText = () => {
    if (coverWallSearchKeyword.value.trim()) {
      return `当前结果 ${String(Math.max(0, Math.trunc(Number(coverWallQueryTotal.value) || 0)))} 项`
    }
    if (coverWallActiveSelection.value.kind === 'status') {
      return `当前结果 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value[coverWallActiveFilter.value] ?? 0))))} 项`
    }
    return `当前结果 ${String(Math.max(0, Math.trunc(Number(displayedCoverWallItems.value.length) || 0)))} 项`
  }

  const getCoverWallCategoryChipStyle = (chip: { color: string }, active = false) => {
    if (active) {
      return {}
    }
    return {
      color: chip.color,
      borderColor: colorAlpha(chip.color, 0.32),
      background: colorAlpha(chip.color, 0.14),
      opacity: Number((chip as any)?.count ?? 0) <= 0 ? '0.46' : '1'
    }
  }

  const getCoverWallHoverStyle = () => ({
    left: `${coverWallHoverState.value?.left ?? 0}px`,
    top: `${coverWallHoverState.value?.top ?? 0}px`
  })

  const handleCoverWallCategoryClick = (categoryId: string) => {
    emitRendererTiming('dashboard cover wall category click', {
      categoryId,
      previousSelectionKind: coverWallActiveSelection.value.kind,
      previousFilter: coverWallActiveFilter.value,
      previousCategoryId: coverWallActiveCategoryId.value,
      loadedAllCount: (coverWallItems.value.all ?? []).length
    })
    if (coverWallActiveSelection.value.kind === 'category' && coverWallActiveCategoryId.value === categoryId) {
      coverWallActiveCategoryId.value = ''
      coverWallActiveFilter.value = 'all'
      resetCoverWallCategoryState()
      if (!(coverWallItems.value.all ?? []).length && coverWallPageState.value.all.hasMore) {
        void loadCoverWallPage('all', true)
      }
    } else {
      coverWallActiveCategoryId.value = categoryId
      resetCoverWallCategoryState()
      void loadCoverWallCategoryPage(categoryId, true)
    }
    resetCoverWallViewState()
    requestAnimationFrame(() => {
      scrollCoverWallContainerToTop()
    })
  }

  const setupCoverWallLoadMoreObserver = () => {
    coverWallLoadMoreObserver?.disconnect()
    coverWallLoadMoreObserver = null

    if (typeof IntersectionObserver === 'undefined' || !coverWallShouldLoadMore.value) {
      return
    }

    nextTick(() => {
      if (!coverWallLoadMoreRef.value || !coverWallShouldLoadMore.value) {
        return
      }

      coverWallLoadMoreObserver = new IntersectionObserver((entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || !coverWallShouldLoadMore.value) {
          return
        }
        if (coverWallActiveSelection.value.kind === 'category') {
          void loadCoverWallCategoryPage(coverWallActiveSelection.value.key, false)
        } else {
          void loadCoverWallPage(coverWallActiveFilter.value, false)
        }
      }, {
        root: coverWallStickyScrollHost instanceof Window ? null : coverWallStickyScrollHost,
        rootMargin: '240px 0px 420px 0px',
        threshold: 0
      })

      coverWallLoadMoreObserver.observe(coverWallLoadMoreRef.value)
    })
  }

  const clearCoverWallStickyRaf = () => {
    if (coverWallStickyRafId != null) {
      cancelAnimationFrame(coverWallStickyRafId)
      coverWallStickyRafId = null
    }
  }

  const updateCoverWallStickyState = () => {
    clearCoverWallStickyRaf()
    coverWallStickyRafId = requestAnimationFrame(() => {
      coverWallStickyRafId = null
      const stickyElement = coverWallStickyRef.value
      if (!stickyElement) {
        coverWallStickyStuck.value = false
        return
      }

      const stickyTop = stickyElement.getBoundingClientRect().top
      const hostTop = coverWallStickyScrollHost instanceof Window
        ? 0
        : (coverWallStickyScrollHost?.getBoundingClientRect().top ?? 0)

      coverWallStickyStuck.value = stickyTop <= hostTop + 0.5
    })
  }

  const unbindCoverWallStickyEvents = () => {
    if (coverWallStickyScrollHost instanceof Window) {
      window.removeEventListener('scroll', updateCoverWallStickyState)
    } else if (coverWallStickyScrollHost) {
      coverWallStickyScrollHost.removeEventListener('scroll', updateCoverWallStickyState)
    }

    window.removeEventListener('resize', updateCoverWallStickyState)
    coverWallStickyScrollHost = null
    clearCoverWallStickyRaf()
  }

  const bindCoverWallStickyEvents = () => {
    unbindCoverWallStickyEvents()
    const stickyElement = coverWallStickyRef.value
    if (!stickyElement) {
      coverWallStickyStuck.value = false
      return
    }

    coverWallStickyScrollHost = stickyElement.closest('.n-layout-scroll-container') as HTMLElement | null ?? window

    if (coverWallStickyScrollHost instanceof Window) {
      window.addEventListener('scroll', updateCoverWallStickyState, { passive: true })
    } else {
      coverWallStickyScrollHost.addEventListener('scroll', updateCoverWallStickyState, { passive: true })
    }

    window.addEventListener('resize', updateCoverWallStickyState, { passive: true })
    updateCoverWallStickyState()
    setupCoverWallLoadMoreObserver()
  }

  const getCoverWallBackTopListenTarget = () =>
    coverWallStickyScrollHost instanceof Window
      ? document
      : (coverWallStickyScrollHost ?? document)

  const cleanupCoverWallFeeds = () => {
    coverWallLoadMoreObserver?.disconnect()
    coverWallLoadMoreObserver = null
    if (coverWallSearchTimer != null) {
      clearTimeout(coverWallSearchTimer)
      coverWallSearchTimer = null
    }
    clearCoverWallHoverTimers()
    unbindCoverWallStickyEvents()
  }

  watch(
    () => coverWallSearchKeyword.value,
    () => {
      coverWallHoverState.value = null
      if (coverWallSearchTimer != null) {
        clearTimeout(coverWallSearchTimer)
      }
      coverWallSearchTimer = window.setTimeout(() => {
        coverWallSearchTimer = null
        if (coverWallActiveSelection.value.kind === 'category') {
          resetCoverWallCategoryState()
          void loadCoverWallCategoryPage(coverWallActiveSelection.value.key, true)
        } else {
          resetCoverWallPageState(coverWallActiveFilter.value)
          void loadCoverWallPage(coverWallActiveFilter.value, true)
        }
      }, 220)
    }
  )

  watch(
    () => ({
      selectionKind: coverWallActiveSelection.value.kind,
      selectionKey: coverWallActiveSelection.value.key,
      activeFilter: coverWallActiveFilter.value,
      activeCategoryId: coverWallActiveCategoryId.value,
      loadedAllCount: (coverWallItems.value.all ?? []).length,
      loadedCategoryCount: coverWallCategoryItems.value.length,
      loadedFilterCount: (coverWallItems.value[coverWallActiveFilter.value] ?? []).length,
      queryTotal: coverWallQueryTotal.value,
      displayedCount: displayedCoverWallItems.value.length,
      visibleCount: coverWallVisibleItems.value.length,
      currentPageOffset: currentCoverWallPageState.value.offset,
      currentHasMore: currentCoverWallPageState.value.hasMore,
      currentLoading: currentCoverWallPageState.value.loading,
      keyword: coverWallSearchKeyword.value.trim()
    }),
    (state) => {
      emitRendererTiming('dashboard cover wall display state', state)
    },
    { immediate: true }
  )

  watch(
    () => [
      coverWallLoading.value,
      coverWallActiveFilter.value,
      currentCoverWallPageState.value.hasMore,
      currentCoverWallPageState.value.loading,
      displayedCoverWallItems.value.length
    ],
    () => {
      setupCoverWallLoadMoreObserver()
    }
  )

  return {
    coverWallLoading,
    coverWallActiveFilter,
    coverWallActiveCategoryId,
    coverWallSearchKeyword,
    coverWallStageRef,
    coverWallLoadMoreRef,
    coverWallStickyRef,
    coverWallHoverState,
    coverWallStickyStuck,
    coverFilters,
    coverWallActiveSelection,
    currentCoverWallPageState,
    displayedCoverWallItems,
    coverWallVisibleItems,
    coverWallShouldLoadMore,
    coverWallInitialLoading,
    coverWallHoveredItem,
    coverWallCategoryFilters,
    loadCoverWallData,
    refreshCoverWallResource,
    updateCoverWallPinnedState,
    handleCoverFilterClick,
    getCoverCardStyle,
    setCoverWallCardRef,
    scheduleCoverWallHoverShow,
    scheduleCoverWallHoverHide,
    getCoverWallHoverMetaLabel,
    getCoverWallStateBadges,
    getCoverWallSummaryText,
    getCoverWallCategoryChipStyle,
    getCoverWallHoverStyle,
    handleCoverWallCategoryClick,
    bindCoverWallStickyEvents,
    getCoverWallBackTopListenTarget,
    cleanupCoverWallFeeds
  }
}

const normalizeDateValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const numericValue = Number(value)
  if (Number.isFinite(numericValue)) {
    return new Date(numericValue < 10_000_000_000 ? numericValue * 1000 : numericValue)
  }

  const parsedDate = new Date(String(value ?? ''))
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

const formatPinnedRelativeTime = (value: unknown) => {
  const date = normalizeDateValue(value)
  if (!date) {
    return ''
  }

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) {
    return '刚刚'
  }

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) {
    return diffDays <= 1 ? '昨天' : `${diffDays} 天前`
  }

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) {
    return `${diffMonths} 个月前`
  }

  return `${Math.floor(diffMonths / 12)} 年前`
}
