import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { DictType } from '../../../../../common/constants'

type DashboardDetailRuntimeOptions = {
  getCategoryMap: () => Record<string, any>
  nextPlayPool: Ref<any[]>
  nextPlayVisible: Ref<any[]>
  notify: (type: 'info' | 'success' | 'warning' | 'error', title: string, message: string) => void
  getWebsitePlaceholderEmoji: (id: unknown, url: string, isDownloadLink: boolean) => string
  resolveDashboardCategorySettings: (category: any) => any
  resolveCategoryProfile: (categorySettings: any) => any
  resolveHomeStoreIcon: (iconFileName: string) => string
  resolveHomeEngineIcon: (iconFileName: string) => string
  getWebsiteResourceUrl: (resource: any) => string
  buildDisplayDirectoryPath: (resource: any) => string
  getRatingComment: (rating: number | null | undefined) => string
  ensureDashboardCategorySource: (categoryId: string, categorySource: any) => Promise<any>
  decorateHomeDetailAudioTree: (resource: any, directoryTree: any[]) => Promise<any[]>
}

export const useDashboardDetailRuntime = ({
  getCategoryMap,
  nextPlayPool,
  nextPlayVisible,
  notify,
  getWebsitePlaceholderEmoji,
  resolveDashboardCategorySettings,
  resolveCategoryProfile,
  resolveHomeStoreIcon,
  resolveHomeEngineIcon,
  getWebsiteResourceUrl,
  buildDisplayDirectoryPath,
  getRatingComment,
  ensureDashboardCategorySource,
  decorateHomeDetailAudioTree
}: DashboardDetailRuntimeOptions) => {
  const showDetailDrawer = ref(false)
  const detailDrawerWidth = ref(500)
  const selectedDetailResource = ref<any | null>(null)
  const detailCategory = ref<any | null>(null)
  const detailEngineList = ref<any[]>([])
  const detailEngineOptionList = ref<any[]>([])
  const detailLanguageOptions = ref<any[]>([])
  const detailScreenshotPaths = ref<string[]>([])
  const detailAudioTree = ref<any[]>([])
  const detailAudioTreeLoading = ref(false)
  const detailAudioContextMenuVisible = ref(false)
  const detailAudioContextMenuX = ref(0)
  const detailAudioContextMenuY = ref(0)
  const detailAudioContextMenuTarget = ref<any | null>(null)
  const detailVisibleLogCount = ref(5)
  const detailCurrentScreenshotIndex = ref(0)
  const detailRatingDraft = ref(-1)
  const showDeleteScreenshotConfirm = ref(false)
  const isResizingDetailDrawer = ref(false)
  const detailDrawerResizeStartX = ref(0)
  const detailDrawerResizeStartWidth = ref(500)
  let detailRequestId = 0

  const detailCategoryName = computed(() =>
    String(detailCategory.value?.name ?? selectedDetailResource.value?.categoryName ?? '').trim() || '资源'
  )
  const detailCategorySettings = computed(() => {
    const category = detailCategory.value ?? {}
    return resolveDashboardCategorySettings(category)
  })
  const detailCategoryProfile = computed(() => resolveCategoryProfile(detailCategorySettings.value))
  const detailActorFilterLabel = computed(() => detailCategoryProfile.value.flags.isAsmr ? '声优' : '声优/演员')
  const detailIsWebsite = computed(() => detailCategoryProfile.value.flags.isWebsite)
  const detailIsSoftware = computed(() => detailCategoryProfile.value.flags.isSoftware)
  const detailIsManga = computed(() => detailCategoryProfile.value.flags.isManga)
  const detailIsAsmr = computed(() => detailCategoryProfile.value.flags.isAsmr)
  const detailIsAudio = computed(() => detailCategoryProfile.value.flags.isAudio)
  const detailIsNovel = computed(() => detailCategoryProfile.value.flags.isNovel)
  const detailIsVideoCategory = computed(() => detailCategoryProfile.value.flags.isVideo)
  const detailIsVideoFolderCategory = computed(() => detailCategoryProfile.value.flags.isVideoFolder)
  const detailStartText = computed(() => detailCategoryProfile.value.labels.startText)
  const detailStats = computed(() => selectedDetailResource.value?.stats ?? null)
  const detailLogs = computed(() =>
    Array.isArray(selectedDetailResource.value?.logs)
      ? selectedDetailResource.value.logs
      : []
  )
  const visibleDetailLogs = computed(() => detailLogs.value.slice(0, detailVisibleLogCount.value))
  const hasMoreDetailLogs = computed(() => detailVisibleLogCount.value < detailLogs.value.length)
  const noMore = computed(() => detailLogs.value.length > 5 && !hasMoreDetailLogs.value)
  const ratingComment = computed(() => getRatingComment(detailRatingDraft.value))
  const hasPendingRatingChange = computed(() => {
    if (!selectedDetailResource.value) {
      return false
    }

    return Number(selectedDetailResource.value.rating ?? -1) !== Number(detailRatingDraft.value)
  })
  const detailDisplayPath = computed(() => buildDisplayDirectoryPath(selectedDetailResource.value))
  const detailWebsiteUrl = computed(() => getWebsiteResourceUrl(selectedDetailResource.value))
  const detailWebsiteIsDownloadLink = computed(() => Boolean(
    selectedDetailResource.value?.websiteMeta?.isDownloadLink
    ?? selectedDetailResource.value?.meta?.isDownloadLink
  ))
  const detailWebsiteAddressLabel = computed(() => detailWebsiteIsDownloadLink.value ? '下载地址' : '网站地址')
  const detailWebsiteIconLabel = computed(() => detailWebsiteIsDownloadLink.value ? '链接图标' : '站点图标')
  const detailWebsitePlaceholderEmoji = computed(() =>
    getWebsitePlaceholderEmoji(
      selectedDetailResource.value?.id,
      detailWebsiteUrl.value,
      detailWebsiteIsDownloadLink.value
    )
  )
  const detailWebsiteCoverPlaceholderText = computed(() => detailWebsiteIsDownloadLink.value ? '下载链接' : '网站封面')
  const detailOpenFolderText = computed(() =>
    detailIsWebsite.value ? `打开${detailCategoryName.value}` : `打开${detailCategoryName.value}文件夹`
  )
  const detailWebsiteFaviconPath = computed(() =>
    String(selectedDetailResource.value?.websiteMeta?.favicon ?? selectedDetailResource.value?.meta?.icon ?? '').trim()
  )
  const detailCurrentScreenshotPath = computed(() =>
    detailScreenshotPaths.value[detailCurrentScreenshotIndex.value] ?? ''
  )
  const detailCanLaunch = computed(() => {
    const resource = selectedDetailResource.value
    if (detailCategoryProfile.value.flags.isWebsite) {
      return Boolean(detailWebsiteUrl.value)
    }

    return Boolean(resource?.basePath) && !resource?.missingStatus && !resource?.isRunning
  })
  const detailCanStop = computed(() => Boolean(selectedDetailResource.value?.isRunning))
  const detailCategoryDescriptionBoxStyle = computed(() => ({ height: 'auto' }))
  const detailStores = computed(() =>
    Array.isArray(selectedDetailResource.value?.stores)
      ? selectedDetailResource.value.stores
        .filter((item: any) => !item?.isDeleted && item?.store)
        .map((item: any) => ({
          id: String(item?.id ?? `${item?.storeId}-${item?.workId}`),
          name: String(item?.store?.name ?? ''),
          icon: resolveHomeStoreIcon(String(item?.store?.extra?.icon ?? '')),
          url: String(item?.url ?? '')
        }))
        .filter((item: any) => item.name)
      : []
  )
  const detailNormalizedEngineList = computed(() =>
    detailEngineList.value
      .map((item: any) => ({
        id: String(item?.id ?? item?.value ?? '').trim(),
        name: String(item?.name ?? item?.label ?? '').trim(),
        icon: ''
      }))
      .filter((item: any) => item.id && item.name)
  )
  const detailNormalizedEngineOptionList = computed(() =>
    detailEngineOptionList.value
      .map((option: any) => ({
        id: String(option?.value ?? '').trim(),
        name: String(option?.label ?? '').trim(),
        icon: resolveHomeEngineIcon(String(option?.extra?.icon ?? ''))
      }))
      .filter((item: any) => item.id && item.name)
  )
  const detailNormalizedLanguageList = computed(() =>
    detailLanguageOptions.value
      .map((item: any) => ({
        id: String(item?.value ?? item?.id ?? '').trim(),
        name: String(item?.label ?? item?.name ?? '').trim()
      }))
      .filter((item: any) => item.id && item.name)
  )

  const clampDetailDrawerWidth = (nextWidth: number) => {
    const maxWidth = Math.max(420, Math.floor(window.innerWidth * 0.9))
    return Math.min(maxWidth, Math.max(420, nextWidth))
  }

  watch(
    () => selectedDetailResource.value?.rating,
    (rating) => {
      detailRatingDraft.value = Number(rating ?? -1)
    },
    { immediate: true }
  )

  const handleDetailDrawerResizeStart = (event: MouseEvent) => {
    isResizingDetailDrawer.value = true
    detailDrawerResizeStartX.value = event.clientX
    detailDrawerResizeStartWidth.value = detailDrawerWidth.value
    document.body.style.userSelect = 'none'
  }

  const handleDetailDrawerResizeMove = (event: MouseEvent) => {
    if (!isResizingDetailDrawer.value) {
      return
    }

    const delta = detailDrawerResizeStartX.value - event.clientX
    detailDrawerWidth.value = clampDetailDrawerWidth(detailDrawerResizeStartWidth.value + delta)
  }

  const handleDetailDrawerResizeEnd = () => {
    if (!isResizingDetailDrawer.value) {
      return
    }

    isResizingDetailDrawer.value = false
    document.body.style.userSelect = ''
  }

  const handleDetailDrawerShowUpdate = (nextShow: boolean) => {
    showDetailDrawer.value = nextShow
    if (!nextShow) {
      detailRequestId += 1
      detailAudioContextMenuVisible.value = false
      detailAudioContextMenuTarget.value = null
      showDeleteScreenshotConfirm.value = false
      detailAudioTreeLoading.value = false
    }
  }

  onMounted(() => {
    window.addEventListener('mousemove', handleDetailDrawerResizeMove)
    window.addEventListener('mouseup', handleDetailDrawerResizeEnd)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', handleDetailDrawerResizeMove)
    window.removeEventListener('mouseup', handleDetailDrawerResizeEnd)
    document.body.style.userSelect = ''
  })

  const loadDetailCategoryAssets = async (categoryId: string) => {
    const normalizedCategoryId = String(categoryId ?? '').trim()
    if (!normalizedCategoryId) {
      detailEngineList.value = []
      detailEngineOptionList.value = []
      detailLanguageOptions.value = []
      return
    }

    const [engineList, engineOptions, languageOptions] = await Promise.all([
      window.api.db.getEngineByCategoryId(normalizedCategoryId),
      window.api.db.getSelectDictData(DictType.GAME_ENGINE_TYPE),
      window.api.db.getSelectDictData(DictType.LANGUAGE_TYPE)
    ])

    detailEngineList.value = Array.isArray(engineList) ? engineList : []
    detailEngineOptionList.value = Array.isArray(engineOptions) ? engineOptions : []
    detailLanguageOptions.value = Array.isArray(languageOptions) ? languageOptions : []
  }

  const openDetailDrawer = async (item: { id?: string; categoryId?: string } | null) => {
    const resourceId = String(item?.id ?? '').trim()
    const categoryId = String(item?.categoryId ?? '').trim()
    if (!resourceId) {
      return
    }

    const requestId = ++detailRequestId
    detailVisibleLogCount.value = 5
    detailCurrentScreenshotIndex.value = 0
    showDeleteScreenshotConfirm.value = false
    detailScreenshotPaths.value = []
    detailAudioTree.value = []
    detailAudioTreeLoading.value = false
    detailAudioContextMenuVisible.value = false
    detailAudioContextMenuTarget.value = null

    try {
      const [detailResult, categoryResult] = await Promise.all([
        window.api.service.getResourceDetail(resourceId),
        categoryId
          ? window.api.db.getCategoryById(categoryId)
          : Promise.resolve(getCategoryMap()[categoryId] ?? null)
      ])

      if (requestId !== detailRequestId) {
        return
      }

      const resource = detailResult?.data ?? detailResult
      if (!resource) {
        notify('error', '资源详情', '未能读取资源详情')
        return
      }

      const resolvedCategorySource = await ensureDashboardCategorySource(
        String(resource?.categoryId ?? categoryId),
        categoryResult ?? getCategoryMap()[categoryId] ?? resource?.category ?? null
      )
      if (requestId !== detailRequestId) {
        return
      }

      selectedDetailResource.value = resource
      detailCategory.value = resolvedCategorySource
      showDetailDrawer.value = true

      await loadDetailCategoryAssets(String(resource?.categoryId ?? categoryId))
      if (requestId !== detailRequestId) {
        return
      }

      if (detailIsManga.value && String(resource?.basePath ?? '').trim()) {
        const imagePaths = await window.api.dialog.getDirectoryImages(String(resource.basePath))
        if (requestId !== detailRequestId) {
          return
        }

        if (Array.isArray(imagePaths) && imagePaths.length) {
          detailScreenshotPaths.value = imagePaths
        } else if (String(resource?.id ?? '').trim()) {
          const screenshotPaths = await window.api.dialog.getScreenshotImages(String(resource.id))
          if (requestId !== detailRequestId) {
            return
          }

          detailScreenshotPaths.value = Array.isArray(screenshotPaths) ? screenshotPaths : []
        } else {
          detailScreenshotPaths.value = []
        }
      } else if (String(resource?.id ?? '').trim()) {
        const screenshotPaths = await window.api.dialog.getScreenshotImages(String(resource.id))
        if (requestId !== detailRequestId) {
          return
        }

        detailScreenshotPaths.value = Array.isArray(screenshotPaths) ? screenshotPaths : []
      }

      if (
        (detailIsAsmr.value || detailIsVideoFolderCategory.value)
        && String(resource?.basePath ?? '').trim()
      ) {
        detailAudioTreeLoading.value = true
        try {
          const audioTree = await window.api.dialog.getDirectoryAudioTree(String(resource.basePath), { includeMetadata: false })
          if (requestId !== detailRequestId) {
            return
          }

          detailAudioTree.value = await decorateHomeDetailAudioTree(resource, Array.isArray(audioTree) ? audioTree : [])
        } finally {
          if (requestId === detailRequestId) {
            detailAudioTreeLoading.value = false
          }
        }
      }
    } catch (error) {
      if (requestId !== detailRequestId) {
        return
      }

      notify('error', '资源详情', error instanceof Error ? error.message : '读取资源详情失败')
    }
  }

  const handleDetailOpenResourcePath = async () => {
    const resource = selectedDetailResource.value
    if (!resource) {
      return
    }

    if (detailIsWebsite.value) {
      const websiteUrl = detailWebsiteUrl.value
      if (websiteUrl) {
        await window.api.dialog.openExternalUrl(websiteUrl)
      }
      return
    }

    await window.api.dialog.openPath(String(resource?.basePath ?? ''))
  }

  const handleDetailOpenStoreWebsite = async (url: string) => {
    const normalizedUrl = String(url ?? '').trim()
    if (!normalizedUrl) {
      return
    }

    await window.api.dialog.openExternalUrl(normalizedUrl)
  }

  const handleDetailCopyText = async (text: string) => {
    await window.api.dialog.copyTextToClipboard(text)
  }

  const handleDetailPreviousScreenshot = () => {
    if (!detailScreenshotPaths.value.length) {
      return
    }

    detailCurrentScreenshotIndex.value = detailCurrentScreenshotIndex.value === 0
      ? detailScreenshotPaths.value.length - 1
      : detailCurrentScreenshotIndex.value - 1
  }

  const handleDetailNextScreenshot = () => {
    if (!detailScreenshotPaths.value.length) {
      return
    }

    detailCurrentScreenshotIndex.value = detailCurrentScreenshotIndex.value === detailScreenshotPaths.value.length - 1
      ? 0
      : detailCurrentScreenshotIndex.value + 1
  }

  const handleDetailDeleteCurrentScreenshot = () => {
    notify('info', '首页详情', '首页预览暂不支持删除截图，请进入分类详情操作')
  }

  const handleDetailOpenScreenshotFolder = async () => {
    if (!selectedDetailResource.value?.id) {
      return
    }

    await window.api.dialog.openScreenshotFolder(String(selectedDetailResource.value.id))
  }

  const handleDetailLoadMoreLogs = () => {
    if (!hasMoreDetailLogs.value) {
      return
    }

    detailVisibleLogCount.value = Math.min(detailLogs.value.length, detailVisibleLogCount.value + 5)
  }

  const handleDetailRatingUpdate = (value: number) => {
    detailRatingDraft.value = Number.isFinite(Number(value)) ? Number(value) : 0
  }

  const handleDetailSubmitRating = async () => {
    if (!selectedDetailResource.value || !hasPendingRatingChange.value) {
      return
    }

    try {
      const result = await window.api.service.updateResourceRating(
        String(selectedDetailResource.value.id ?? ''),
        Number(detailRatingDraft.value)
      )
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '评分更新完成'
      notify(resultType, '更新评分', resultMessage)

      if (resultType === 'error') {
        return
      }

      selectedDetailResource.value = {
        ...selectedDetailResource.value,
        rating: Number(detailRatingDraft.value)
      }
      nextPlayPool.value = nextPlayPool.value.map((item) =>
        item.id === selectedDetailResource.value?.id
          ? { ...item, rating: Number(detailRatingDraft.value) }
          : item
      )
      nextPlayVisible.value = nextPlayVisible.value.map((item) =>
        item.id === selectedDetailResource.value?.id
          ? { ...item, rating: Number(detailRatingDraft.value) }
          : item
      )
    } catch (error) {
      notify('error', '更新评分', error instanceof Error ? error.message : '更新评分失败')
    }
  }

  return {
    showDetailDrawer,
    detailDrawerWidth,
    selectedDetailResource,
    detailCategory,
    detailEngineList,
    detailEngineOptionList,
    detailLanguageOptions,
    detailScreenshotPaths,
    detailAudioTree,
    detailAudioTreeLoading,
    detailAudioContextMenuVisible,
    detailAudioContextMenuX,
    detailAudioContextMenuY,
    detailAudioContextMenuTarget,
    detailVisibleLogCount,
    detailCurrentScreenshotIndex,
    detailRatingDraft,
    showDeleteScreenshotConfirm,
    detailCategoryName,
    detailCategorySettings,
    detailCategoryProfile,
    detailActorFilterLabel,
    detailIsWebsite,
    detailIsSoftware,
    detailIsManga,
    detailIsAsmr,
    detailIsAudio,
    detailIsNovel,
    detailIsVideoCategory,
    detailIsVideoFolderCategory,
    detailStartText,
    detailStats,
    detailLogs,
    visibleDetailLogs,
    hasMoreDetailLogs,
    noMore,
    ratingComment,
    hasPendingRatingChange,
    detailDisplayPath,
    detailWebsiteUrl,
    detailWebsiteIsDownloadLink,
    detailWebsiteAddressLabel,
    detailWebsiteIconLabel,
    detailWebsitePlaceholderEmoji,
    detailWebsiteCoverPlaceholderText,
    detailOpenFolderText,
    detailWebsiteFaviconPath,
    detailCurrentScreenshotPath,
    detailCanLaunch,
    detailCanStop,
    detailCategoryDescriptionBoxStyle,
    detailStores,
    detailNormalizedEngineList,
    detailNormalizedEngineOptionList,
    detailNormalizedLanguageList,
    handleDetailDrawerResizeStart,
    handleDetailDrawerShowUpdate,
    loadDetailCategoryAssets,
    openDetailDrawer,
    handleDetailOpenResourcePath,
    handleDetailOpenStoreWebsite,
    handleDetailCopyText,
    handleDetailPreviousScreenshot,
    handleDetailNextScreenshot,
    handleDetailDeleteCurrentScreenshot,
    handleDetailOpenScreenshotFolder,
    handleDetailLoadMoreLogs,
    handleDetailRatingUpdate,
    handleDetailSubmitRating
  }
}
