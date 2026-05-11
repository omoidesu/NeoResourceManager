import {onBeforeUnmount, onMounted, watch} from 'vue'
import type {ComputedRef, Ref} from 'vue'
import type {RouteLocationNormalizedLoadedGeneric} from 'vue-router'
import {DictType, Settings} from '../../../../../common/constants'

interface UseCategoryPageBootstrapOptions {
  route: RouteLocationNormalizedLoadedGeneric
  categoryId: ComputedRef<string>
  keyword: Ref<string>
  currentPage: Ref<number>
  pageSize: Ref<number>
  sortBy: Ref<string>
  totalPages: ComputedRef<number>
  jumpPageInput: Ref<number | null>
  loading: Ref<boolean>
  suppressAutoFetch: Ref<boolean>
  resourceList: Ref<any[]>
  totalResources: Ref<number>
  categoryInfo: Ref<any>
  languageOptions: Ref<any[]>
  websiteTypeOptions: Ref<any[]>
  localeEmulatorPath: Ref<string>
  mtoolPath: Ref<string>
  authorList: Ref<any[]>
  actorList: Ref<any[]>
  albumList: Ref<any[]>
  engineList: Ref<any[]>
  engineOptionList: Ref<any[]>
  missingResourceCount: Ref<number>
  favoriteResourceCount: Ref<number>
  completedResourceCount: Ref<number>
  runningResourceCount: Ref<number>
  tagList: Ref<any[]>
  typeList: Ref<any[]>
  selectedDetailResource: Ref<any>
  showCompletedFilter: ComputedRef<boolean>
  isWebsiteCategory: ComputedRef<boolean>
  showVideoPlayer: Ref<boolean>
  detailIsManga: ComputedRef<boolean>
  detailIsAsmr: ComputedRef<boolean>
  showActorFilter: ComputedRef<boolean>
  isAudioCategory: ComputedRef<boolean>
  categorySettings: ComputedRef<Record<string, any>>
  showEngineFilter: ComputedRef<boolean>
  normalizedAuthorList: ComputedRef<any[]>
  normalizedActorList: ComputedRef<any[]>
  normalizedAlbumList: ComputedRef<any[]>
  normalizedEngineList: ComputedRef<any[]>
  normalizedTagList: ComputedRef<any[]>
  normalizedTypeList: ComputedRef<any[]>
  selectedAuthorList: Ref<string[]>
  selectedActorList: Ref<string[]>
  selectedAlbumList: Ref<string[]>
  selectedEngineList: Ref<string[]>
  selectedTagList: Ref<string[]>
  selectedTypeList: Ref<string[]>
  missingFile: Ref<boolean>
  favoriteOnly: Ref<boolean>
  completedOnly: Ref<boolean>
  runningOnly: Ref<boolean>
  batchImportItems: Ref<any[]>
  batchImportFetchInfoEnabled: Ref<boolean>
  batchAnalyzeCurrent: Ref<number>
  batchAnalyzeTotal: Ref<number>
  batchAnalyzeMessage: Ref<string>
  batchAnalyzeRunning: Ref<boolean>
  batchImportRunning: Ref<boolean>
  batchAnalyzeCancelled: Ref<boolean>
  batchAnalyzeInBackground: Ref<boolean>
  batchAnalyzeToastDismissed: Ref<boolean>
  showBatchImportLoading: Ref<boolean>
  showBatchImportModal: Ref<boolean>
  buildResourceQuery: (page: number, size: number) => any
  resetSelected: () => void
  resetCategoryListState: () => void
  mergeResourceSummaryIntoDetail: (detailResource: any, summaryResource: any) => any
  assignSanitizedSelectedFilterValues: (targetRef: { value: any[] }, options: any[], key?: 'id' | 'name') => boolean
  showNotifyByType: (type: 'error' | 'warning' | 'success' | 'info', title: string, message: string) => void
  handleShowResourceDetail: (resource: any) => void
  syncBatchImportRefsFromState: (categoryId: string) => void
  syncBatchImportStateFromRefs: (categoryId: string) => void
  ensureBatchImportState: (categoryId: string) => any
  patchBatchImportState: (categoryId: string, patch: Record<string, any>) => void
  syncBatchImportOngoingCenter: (categoryId?: string) => void
  clearBatchImportOngoingCenter: (categoryId: string) => void
  logger: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  }
  emitRendererTiming?: (message: string, meta?: Record<string, unknown>) => void
}

function formatDebugPayload(payload: Record<string, any>) {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

async function measureAsync<T>(
  logger: UseCategoryPageBootstrapOptions['logger'],
  scope: string,
  categoryId: string,
  fn: () => Promise<T>,
  extra?: Record<string, any>,
  emitRendererTiming?: UseCategoryPageBootstrapOptions['emitRendererTiming']
) {
  const startedAt = performance.now()
  try {
    const result = await fn()
    const payload = {
      scope,
      categoryId,
      elapsedMs: Math.round(performance.now() - startedAt),
      ...(extra ?? {})
    }
    logger.info('category bootstrap timing', payload)
    emitRendererTiming?.('category bootstrap timing', payload)
    return result
  } catch (error) {
    const payload = {
      scope,
      categoryId,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      ...(extra ?? {})
    }
    logger.warn('category bootstrap timing failed', payload)
    emitRendererTiming?.('category bootstrap timing failed', payload)
    throw error
  }
}

export const useCategoryPageBootstrap = (options: UseCategoryPageBootstrapOptions) => {
  let fetchDataRequestId = 0
  let handledAutoOpenResourceKey = ''
  let hasOpenedVideoPlayer = false
  let stopResourceStateListener: null | (() => void) = null
  let stopBatchImportProgressListener: null | (() => void) = null

  const getRouteQueryText = (value: unknown) => {
    const rawValue = Array.isArray(value) ? value[0] : value
    return String(rawValue ?? '').trim()
  }

  const getRouteKeyword = () => getRouteQueryText(options.route.query.keyword)
  const getRouteAutoOpenResourceId = () => getRouteQueryText(options.route.query.resourceId)
  const shouldAutoOpenRouteDetail = () => getRouteQueryText(options.route.query.openDetail) === '1'

  const getAutoOpenResourceKey = () => {
    const targetResourceId = getRouteAutoOpenResourceId()
    if (!options.categoryId.value || !targetResourceId || !shouldAutoOpenRouteDetail()) {
      return ''
    }

    return `${options.categoryId.value}:${targetResourceId}:${getRouteKeyword()}`
  }

  const syncRouteKeywordToPage = (nextKeyword = getRouteKeyword()) => {
    options.keyword.value = nextKeyword
  }

  const openRouteRequestedResourceDetail = () => {
    const autoOpenKey = getAutoOpenResourceKey()
    if (!autoOpenKey || autoOpenKey === handledAutoOpenResourceKey) {
      return
    }

    const targetResourceId = getRouteAutoOpenResourceId()
    const targetResource = options.resourceList.value.find((item) => String(item?.id ?? '') === targetResourceId)
    if (!targetResource) {
      return
    }

    handledAutoOpenResourceKey = autoOpenKey
    options.handleShowResourceDetail(targetResource)
  }

  const isActiveCategoryRequest = (requestId: number, activeCategoryId: string) => (
    requestId === fetchDataRequestId
    && activeCategoryId === String(options.categoryId.value ?? '').trim()
  )

  const measure = <T>(scope: string, activeCategoryId: string, fn: () => Promise<T>, extra?: Record<string, any>) =>
    measureAsync(options.logger, scope, activeCategoryId, fn, extra, options.emitRendererTiming)

  const loadDeferredCategoryData = async (requestId: number, activeCategoryId: string) => {
    options.logger.info('category bootstrap method start', {
      method: 'loadDeferredCategoryData',
      categoryId: activeCategoryId,
      requestId
    })
    try {
      const deferredStartedAt = performance.now()
      const websiteTypeDict = options.detailIsManga.value
        ? DictType.MANGA_SITE_TYPE
        : options.detailIsAsmr.value
          ? DictType.ASMR_SITE_TYPE
          : DictType.GAME_SITE_TYPE

      const [
        languageOptions,
        websiteTypeOptions,
        localeEmulatorSetting,
        mtoolSetting,
        authorList,
        actorList,
        albumList
      ] = await Promise.all([
        measure('deferred.languageOptions', activeCategoryId, () =>
          window.api.db.getSelectDictData(DictType.LANGUAGE_TYPE)
        ),
        measure('deferred.websiteTypeOptions', activeCategoryId, () =>
          window.api.db.getSelectDictData(websiteTypeDict)
        ),
        measure('deferred.localeEmulatorPath', activeCategoryId, () =>
          window.api.db.getSetting(Settings.LOCALE_EMULATOR_PATH)
        ),
        measure('deferred.mtoolPath', activeCategoryId, () =>
          window.api.db.getSetting(Settings.MTOOL_PATH)
        ),
        measure('deferred.authorList', activeCategoryId, () =>
          window.api.db.getAuthorByCategoryId(activeCategoryId)
        ),
        options.showActorFilter.value
          ? measure('deferred.actorList', activeCategoryId, () =>
              window.api.db.getActorByCategoryId(activeCategoryId)
            )
          : Promise.resolve([]),
        options.isAudioCategory.value
          ? measure('deferred.albumList', activeCategoryId, () =>
              window.api.db.getAlbumByCategoryId(activeCategoryId)
            )
          : Promise.resolve([])
      ])
      if (!isActiveCategoryRequest(requestId, activeCategoryId)) {
        return
      }

      options.languageOptions.value = languageOptions
      options.websiteTypeOptions.value = websiteTypeOptions
      options.localeEmulatorPath.value = String(localeEmulatorSetting?.value ?? '')
      options.mtoolPath.value = String(mtoolSetting?.value ?? '')
      options.authorList.value = authorList
      options.actorList.value = actorList
      options.albumList.value = albumList
      let sanitizedFilterChanged = false

      sanitizedFilterChanged = options.assignSanitizedSelectedFilterValues(
        options.selectedAuthorList,
        options.normalizedAuthorList.value,
        'id'
      ) || sanitizedFilterChanged
      sanitizedFilterChanged = options.assignSanitizedSelectedFilterValues(
        options.selectedActorList,
        options.normalizedActorList.value,
        'id'
      ) || sanitizedFilterChanged
      sanitizedFilterChanged = options.assignSanitizedSelectedFilterValues(
        options.selectedAlbumList,
        options.normalizedAlbumList.value,
        'name'
      ) || sanitizedFilterChanged

      const [engineOptionList, engineList] = await Promise.all([
        String(options.categorySettings.value.extendTable ?? '').trim() === 'game_meta'
          ? measure('deferred.engineOptions', activeCategoryId, () =>
              window.api.db.getSelectDictData(DictType.GAME_ENGINE_TYPE)
            )
          : Promise.resolve([]),
        options.showEngineFilter.value
          ? measure('deferred.engineList', activeCategoryId, () =>
              window.api.db.getEngineByCategoryId(activeCategoryId)
            )
          : Promise.resolve([])
      ])
      if (!isActiveCategoryRequest(requestId, activeCategoryId)) {
        return
      }

      options.engineOptionList.value = engineOptionList
      options.engineList.value = engineList
      sanitizedFilterChanged = options.assignSanitizedSelectedFilterValues(
        options.selectedEngineList,
        options.normalizedEngineList.value,
        'id'
      ) || sanitizedFilterChanged

      const [
        missingResourceCount,
        favoriteResourceCount,
        completedResourceCount,
        runningResourceCount,
        tagList,
        typeList
      ] = await Promise.all([
        measure('deferred.missingCount', activeCategoryId, () =>
          window.api.db.getMissingResourceCountByCategoryId(activeCategoryId)
        ),
        measure('deferred.favoriteCount', activeCategoryId, () =>
          window.api.db.getFavoriteResourceCountByCategoryId(activeCategoryId)
        ),
        measure('deferred.completedCount', activeCategoryId, () =>
          window.api.db.getCompletedResourceCountByCategoryId(activeCategoryId)
        ),
        measure('deferred.runningCount', activeCategoryId, () =>
          window.api.db.getRunningResourceCountByCategoryId(activeCategoryId)
        ),
        measure('deferred.tagList', activeCategoryId, () =>
          window.api.db.getTagByCategoryId(activeCategoryId)
        ),
        measure('deferred.typeList', activeCategoryId, () =>
          window.api.db.getTypeByCategoryId(activeCategoryId)
        )
      ])
      if (!isActiveCategoryRequest(requestId, activeCategoryId)) {
        return
      }

      options.missingResourceCount.value = missingResourceCount
      options.favoriteResourceCount.value = favoriteResourceCount
      options.completedResourceCount.value = completedResourceCount
      options.runningResourceCount.value = runningResourceCount
      options.tagList.value = tagList
      sanitizedFilterChanged = options.assignSanitizedSelectedFilterValues(options.selectedTagList, options.normalizedTagList.value, 'id')
        || sanitizedFilterChanged
      options.typeList.value = typeList
      sanitizedFilterChanged = options.assignSanitizedSelectedFilterValues(options.selectedTypeList, options.normalizedTypeList.value, 'id')
        || sanitizedFilterChanged

      if (sanitizedFilterChanged && requestId === fetchDataRequestId) {
        const rerunRequestId = ++fetchDataRequestId
        const rerunQuery = options.buildResourceQuery(options.currentPage.value, options.pageSize.value)
        const rerunResponse = await measure('deferred.sanitizeRerun', activeCategoryId, () =>
          window.api.db.getResourceByCategoryId(activeCategoryId, rerunQuery),
          {
            page: Number(rerunQuery?.page ?? 1),
            pageSize: Number(rerunQuery?.pageSize ?? 24),
            sortBy: String(rerunQuery?.sortBy ?? 'createTime-desc')
          }
        )
        if (!isActiveCategoryRequest(rerunRequestId, activeCategoryId)) {
          return
        }

        options.resourceList.value = rerunResponse?.items ?? []
        options.totalResources.value = Number(rerunResponse?.total ?? 0)
        if (String(options.categorySettings.value.extendTable ?? '').trim() === 'multi_image_meta') {
          options.logger.info('manga fetchData rerun after sanitize', formatDebugPayload({
            categoryId: activeCategoryId,
            requestId: rerunRequestId,
            query: rerunQuery,
            total: options.totalResources.value,
            itemCount: options.resourceList.value.length,
            basePaths: options.resourceList.value.slice(0, 10).map((item: any) => String(item?.basePath ?? '').trim())
          }))
        }
        openRouteRequestedResourceDetail()
      }
      const deferredTotalPayload = {
        scope: 'deferred.total',
        categoryId: activeCategoryId,
        elapsedMs: Math.round(performance.now() - deferredStartedAt)
      }
      options.logger.info('category bootstrap timing', deferredTotalPayload)
      options.emitRendererTiming?.('category bootstrap timing', deferredTotalPayload)
      options.logger.info('category bootstrap method end', {
        method: 'loadDeferredCategoryData',
        categoryId: activeCategoryId,
        requestId,
        status: 'success'
      })
    } catch (error) {
      options.logger.warn('category bootstrap method end', {
        method: 'loadDeferredCategoryData',
        categoryId: activeCategoryId,
        requestId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      if (isActiveCategoryRequest(requestId, activeCategoryId)) {
        options.logger.warn('deferred category data load failed', {
          categoryId: activeCategoryId,
          requestId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  const fetchData = async () => {
    if (!options.categoryId.value) {
      return
    }

    const requestId = ++fetchDataRequestId
    options.loading.value = true
    const firstStageStartedAt = performance.now()
    const activeCategoryId = String(options.categoryId.value ?? '').trim()
    const resourceQuery = options.buildResourceQuery(options.currentPage.value, options.pageSize.value)
    options.logger.info('category bootstrap method start', {
      method: 'fetchData',
      categoryId: activeCategoryId,
      requestId,
      query: {
        page: Number(resourceQuery?.page ?? 1),
        pageSize: Number(resourceQuery?.pageSize ?? 24),
        sortBy: String(resourceQuery?.sortBy ?? 'createTime-desc'),
        keyword: String(resourceQuery?.keyword ?? '').trim()
      }
    })

    try {
      const [nextCategoryInfo, resourceResponse] = await Promise.all([
        measure('firstStage.categoryInfo', activeCategoryId, () =>
          window.api.db.getCategoryById(activeCategoryId)
        ),
        measure('firstStage.resourceList', activeCategoryId, () =>
          window.api.db.getResourceByCategoryId(activeCategoryId, resourceQuery),
          {
            page: Number(resourceQuery?.page ?? 1),
            pageSize: Number(resourceQuery?.pageSize ?? 24),
            sortBy: String(resourceQuery?.sortBy ?? 'createTime-desc'),
            keyword: String(resourceQuery?.keyword ?? '').trim()
          }
        )
      ])
      if (!isActiveCategoryRequest(requestId, activeCategoryId)) {
        return
      }

      options.categoryInfo.value = nextCategoryInfo
      options.resourceList.value = resourceResponse?.items ?? []
      options.totalResources.value = Number(resourceResponse?.total ?? 0)
      if (String(options.categorySettings.value.extendTable ?? '').trim() === 'multi_image_meta') {
        options.logger.info('manga fetchData result', formatDebugPayload({
          categoryId: activeCategoryId,
          requestId,
          query: resourceQuery,
          total: options.totalResources.value,
          itemCount: options.resourceList.value.length,
          basePaths: options.resourceList.value.slice(0, 10).map((item: any) => String(item?.basePath ?? '').trim()),
          selectedFilters: {
            authorIds: [...options.selectedAuthorList.value],
            actorNames: [...options.selectedActorList.value],
            albumNames: [...options.selectedAlbumList.value],
            engineIds: [...options.selectedEngineList.value],
            tagIds: [...options.selectedTagList.value],
            typeIds: [...options.selectedTypeList.value],
            keyword: String(options.keyword.value ?? '').trim(),
            missingOnly: Boolean(options.missingFile.value),
            favoriteOnly: Boolean(options.favoriteOnly.value),
            completedOnly: Boolean(options.completedOnly.value),
            runningOnly: Boolean(options.runningOnly.value)
          }
        }))
      }
      openRouteRequestedResourceDetail()
      if (options.selectedDetailResource.value?.id) {
        const matchedDetailResource = options.resourceList.value.find(
          (item) => item.id === options.selectedDetailResource.value.id
        )
        if (matchedDetailResource) {
          options.selectedDetailResource.value = options.mergeResourceSummaryIntoDetail(
            options.selectedDetailResource.value,
            matchedDetailResource
          )
        }
      }
      options.loading.value = false
      const firstStageTotalPayload = {
        scope: 'firstStage.total',
        categoryId: activeCategoryId,
        elapsedMs: Math.round(performance.now() - firstStageStartedAt),
        totalResources: Number(options.totalResources.value ?? 0),
        itemCount: options.resourceList.value.length
      }
      options.logger.info('category bootstrap timing', firstStageTotalPayload)
      options.emitRendererTiming?.('category bootstrap timing', firstStageTotalPayload)
      options.logger.info('category bootstrap method end', {
        method: 'fetchData',
        categoryId: activeCategoryId,
        requestId,
        status: 'success',
        totalResources: Number(options.totalResources.value ?? 0),
        itemCount: options.resourceList.value.length
      })
      void loadDeferredCategoryData(requestId, activeCategoryId)
      return
    } catch (error) {
      options.logger.warn('category bootstrap method end', {
        method: 'fetchData',
        categoryId: activeCategoryId,
        requestId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      if (requestId === fetchDataRequestId) {
        options.showNotifyByType(
          'error',
          '加载失败',
          error instanceof Error ? error.message : '加载分类数据失败'
        )
      }
    } finally {
      if (requestId === fetchDataRequestId) {
        options.loading.value = false
      }
    }
  }

  watch(options.categoryId, (nextCategoryId, previousCategoryId) => {
    options.logger.info('category bootstrap watch fired', {
      watch: 'categoryId',
      nextCategoryId: String(nextCategoryId ?? ''),
      previousCategoryId: String(previousCategoryId ?? '')
    })
    if (previousCategoryId) {
      options.syncBatchImportStateFromRefs(previousCategoryId)
    }

    options.suppressAutoFetch.value = true
    options.syncBatchImportRefsFromState(String(nextCategoryId ?? ''))
    syncRouteKeywordToPage()
    options.resetSelected()
    options.resetCategoryListState()
    options.suppressAutoFetch.value = false
    void fetchData()
  }, {immediate: true})

  watch(
    () => [options.route.query.keyword, options.route.query.resourceId, options.route.query.openDetail],
    () => {
      options.logger.info('category bootstrap watch fired', {
        watch: 'route.query',
        categoryId: String(options.categoryId.value ?? ''),
        keyword: getRouteKeyword(),
        resourceId: getRouteAutoOpenResourceId(),
        openDetail: shouldAutoOpenRouteDetail()
      })
      if (!options.categoryId.value) {
        return
      }

      const nextKeyword = getRouteKeyword()
      const keywordChanged = nextKeyword !== options.keyword.value
      handledAutoOpenResourceKey = ''

      if (!keywordChanged) {
        openRouteRequestedResourceDetail()
        return
      }

      options.suppressAutoFetch.value = true
      syncRouteKeywordToPage(nextKeyword)
      options.currentPage.value = 1
      options.suppressAutoFetch.value = false
      void fetchData()
    }
  )

  watch(
    [
      options.keyword,
      options.missingFile,
      options.favoriteOnly,
      options.completedOnly,
      options.runningOnly,
      options.selectedAuthorList,
      options.selectedActorList,
      options.selectedAlbumList,
      options.selectedEngineList,
      options.selectedTagList,
      options.selectedTypeList,
      options.pageSize,
      options.sortBy
    ],
    () => {
      options.logger.info('category bootstrap watch fired', {
        watch: 'filters',
        categoryId: String(options.categoryId.value ?? ''),
        keyword: String(options.keyword.value ?? '').trim(),
        pageSize: Number(options.pageSize.value ?? 0),
        sortBy: String(options.sortBy.value ?? '')
      })
      if (options.suppressAutoFetch.value) {
        return
      }

      options.currentPage.value = 1
      void fetchData()
    },
    {deep: true}
  )

  watch(options.showCompletedFilter, (visible) => {
    if (!visible) {
      options.completedOnly.value = false
    }
  })

  watch(options.isWebsiteCategory, (visible) => {
    if (visible) {
      options.missingFile.value = false
      options.runningOnly.value = false
    }
  }, {immediate: true})

  watch(options.showVideoPlayer, (visible) => {
    options.logger.info('category bootstrap watch fired', {
      watch: 'showVideoPlayer',
      categoryId: String(options.categoryId.value ?? ''),
      visible: Boolean(visible)
    })
    if (visible) {
      hasOpenedVideoPlayer = true
      return
    }

    if (hasOpenedVideoPlayer) {
      void fetchData()
    }
  })

  watch(options.currentPage, () => {
    options.logger.info('category bootstrap watch fired', {
      watch: 'currentPage',
      categoryId: String(options.categoryId.value ?? ''),
      currentPage: Number(options.currentPage.value ?? 0)
    })
    if (options.suppressAutoFetch.value) {
      options.jumpPageInput.value = options.currentPage.value
      return
    }

    options.jumpPageInput.value = options.currentPage.value
    void fetchData()
  })

  watch(options.totalPages, (value) => {
    if (options.currentPage.value > value) {
      options.currentPage.value = value
      return
    }

    options.jumpPageInput.value = Math.min(
      value,
      Math.max(1, Number(options.jumpPageInput.value ?? options.currentPage.value))
    )
  })

  onMounted(() => {
    options.logger.info('category bootstrap lifecycle', {
      phase: 'mounted',
      categoryId: String(options.categoryId.value ?? '')
    })
    stopResourceStateListener = window.api.service.onResourceStateChanged((message) => {
      if (message.categoryId !== options.categoryId.value) {
        return
      }

      void fetchData()
    })

    stopBatchImportProgressListener = window.api.service.onBatchImportProgress((message) => {
      const targetCategoryId = String(message.categoryId ?? '').trim()
      if (!targetCategoryId) {
        return
      }

      const currentBatchImportState = options.ensureBatchImportState(targetCategoryId)

      options.patchBatchImportState(targetCategoryId, {
        analyzeTotal: Number(message.total ?? 0),
        analyzeCurrent: Number(message.current ?? 0),
        analyzeMessage: String(message.message ?? ''),
        importRunning: !message.done && message.stage === 'import',
        analyzeRunning: !message.done && message.stage === 'analyze',
        showLoading: !message.done
          && targetCategoryId === options.categoryId.value
          && !currentBatchImportState.analyzeInBackground
      })

      if (message.done) {
        options.patchBatchImportState(targetCategoryId, {
          importRunning: false,
          analyzeRunning: false,
          showLoading: false
        })
        options.clearBatchImportOngoingCenter(targetCategoryId)
        return
      }

      options.syncBatchImportOngoingCenter(targetCategoryId)
    })
  })

  onBeforeUnmount(() => {
    options.logger.info('category bootstrap lifecycle', {
      phase: 'beforeUnmount',
      categoryId: String(options.categoryId.value ?? '')
    })
    stopResourceStateListener?.()
    stopResourceStateListener = null
    stopBatchImportProgressListener?.()
    stopBatchImportProgressListener = null
  })

  watch(
    [
      options.batchImportItems,
      options.batchImportFetchInfoEnabled,
      options.batchAnalyzeCurrent,
      options.batchAnalyzeTotal,
      options.batchAnalyzeMessage,
      options.batchAnalyzeRunning,
      options.batchImportRunning,
      options.batchAnalyzeCancelled,
      options.batchAnalyzeInBackground,
      options.batchAnalyzeToastDismissed,
      options.showBatchImportLoading,
      options.showBatchImportModal
    ],
    () => {
      if (options.categoryId.value) {
        options.syncBatchImportStateFromRefs(options.categoryId.value)
      }
    },
    {deep: true}
  )

  return {
    fetchData
  }
}
