import {nextTick, type ComputedRef, type Ref} from 'vue'

type NotifyType = 'success' | 'error' | 'info' | 'warning'

interface UseCategoryImageComicActionsOptions {
  categoryId: ComputedRef<string>
  selectedDetailResource: Ref<any>
  resourceList: Ref<any[]>
  totalResources: Ref<number>
  sortBy: Ref<string>
  detailScreenshotPaths: Ref<string[]>
  detailAudioImagePaths: Ref<string[]>
  pictureViewerImagePaths: Ref<string[]>
  pictureViewerResourceIds: Ref<string[]>
  pictureViewerInitialIndex: Ref<number>
  pictureViewerAllowDelete: Ref<boolean>
  comicReaderImagePaths: Ref<string[]>
  comicReaderInitialIndex: Ref<number>
  currentScreenshotIndex: Ref<number>
  currentPictureViewerResourceId: Ref<string>
  currentComicReaderResourceId: Ref<string>
  showPictureViewer: Ref<boolean>
  showComicReader: Ref<boolean>
  detailIsManga: ComputedRef<boolean>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  getResourceFilePath: (resource: any) => string
  loadPictureViewerScrollMode: () => Promise<void>
  fetchData: () => Promise<void>
  readComicProgress: (resourceId: string) => Promise<number>
  writeComicProgress: (resourceId: string, progressIndex: number) => Promise<void>
  refreshDetailScreenshots: (nextIndex?: number, targetResource?: any) => Promise<void>
  startComicReadingSession: (resource: any) => Promise<boolean>
  stopComicReadingSession: () => Promise<void>
}

export const useCategoryImageComicActions = (options: UseCategoryImageComicActionsOptions) => {
  const handleOpenAudioTreeImage = async (imagePath: string) => {
    const normalizedPath = String(imagePath ?? '').trim()
    if (!normalizedPath) {
      return
    }

    const imagePaths = options.detailAudioImagePaths.value
    const initialIndex = imagePaths.findIndex((filePath) => filePath === normalizedPath)
    if (initialIndex < 0) {
      return
    }

    options.pictureViewerImagePaths.value = [...imagePaths]
    options.pictureViewerResourceIds.value = []
    options.pictureViewerInitialIndex.value = initialIndex
    options.pictureViewerAllowDelete.value = false
    await options.loadPictureViewerScrollMode()
    options.showPictureViewer.value = true
  }

  const openComicReader = async (resource: any, pageIndex?: number | null) => {
    const resourceId = String(resource?.id ?? '').trim()
    if (!resourceId) {
      options.showNotifyByType('warning', '漫画阅读', '当前漫画资源无效')
      return
    }

    if (
      options.showComicReader.value
      && options.currentComicReaderResourceId.value
      && options.currentComicReaderResourceId.value !== resourceId
    ) {
      await options.stopComicReadingSession()
    }

    await options.refreshDetailScreenshots(
      Number.isFinite(Number(pageIndex)) ? Number(pageIndex) : await options.readComicProgress(resourceId),
      resource
    )
    if (!options.detailScreenshotPaths.value.length) {
      options.showNotifyByType('warning', '漫画阅读', '当前漫画目录中没有可阅读的图片')
      return
    }

    const started = await options.startComicReadingSession(resource)
    if (!started) {
      return
    }

    const preferredIndex = Number.isFinite(Number(pageIndex)) ? Number(pageIndex) : await options.readComicProgress(resourceId)
    const resolvedIndex = Math.min(
      Math.max(0, Math.floor(preferredIndex)),
      Math.max(0, options.detailScreenshotPaths.value.length - 1)
    )

    options.currentScreenshotIndex.value = resolvedIndex
    options.currentComicReaderResourceId.value = resourceId
    options.comicReaderImagePaths.value = [...options.detailScreenshotPaths.value]
    options.comicReaderInitialIndex.value = resolvedIndex
    options.showPictureViewer.value = false
    options.showComicReader.value = true
    await options.writeComicProgress(resourceId, resolvedIndex)
    await options.fetchData()
  }

  const handlePreviewSingleImageResource = async (resource: any) => {
    const resourceId = String(resource?.id ?? '').trim()
    const fallbackPath = options.getResourceFilePath(resource)

    if (!resourceId && !fallbackPath) {
      options.showNotifyByType('warning', '查看图片', '当前图片路径无效')
      return
    }

    try {
      if (
        options.showPictureViewer.value
        && options.currentPictureViewerResourceId.value
        && options.currentPictureViewerResourceId.value !== resourceId
      ) {
        options.showPictureViewer.value = false
        await nextTick()
      }

      const pageSize = Math.max(options.totalResources.value, options.resourceList.value.length, 1)
      const result = await window.api.db.getResourceByCategoryId(options.categoryId.value, {
        page: 1,
        pageSize,
        sortBy: options.sortBy.value
      })
      const allResources = Array.isArray(result?.items) && result.items.length ? result.items : options.resourceList.value
      const imageResources = allResources.filter((item: any) => !item?.missingStatus && options.getResourceFilePath(item))
      const imagePaths = imageResources.map((item: any) => options.getResourceFilePath(item))

      if (!imagePaths.length) {
        options.showNotifyByType('warning', '查看图片', '当前分类下没有可预览的图片')
        return
      }

      let initialIndex = imageResources.findIndex((item: any) => String(item?.id ?? '').trim() === resourceId)
      if (initialIndex < 0 && fallbackPath) {
        initialIndex = imagePaths.findIndex((filePath) => filePath === fallbackPath)
      }

      options.pictureViewerImagePaths.value = imagePaths
      options.pictureViewerResourceIds.value = imageResources.map((item: any) => String(item?.id ?? '').trim())
      options.pictureViewerInitialIndex.value = Math.max(0, initialIndex)
      options.pictureViewerAllowDelete.value = false
      const startResult = await window.api.service.startReadingResource(resourceId)
      const startResultType = startResult?.type ?? 'info'
      if (startResultType === 'error' || startResultType === 'warning') {
        options.showNotifyByType(startResultType, '查看图片', startResult?.message ?? '打开图片预览失败')
        return
      }

      options.currentPictureViewerResourceId.value = resourceId
      await options.loadPictureViewerScrollMode()
      options.showPictureViewer.value = true
      await options.fetchData()
    } catch (error) {
      options.showNotifyByType('error', '查看图片', error instanceof Error ? error.message : '打开图片预览失败')
    }
  }

  const handleOpenPictureViewer = async (index: number = options.currentScreenshotIndex.value) => {
    if (!options.detailScreenshotPaths.value.length) {
      return
    }

    options.currentScreenshotIndex.value = Math.min(
      Math.max(0, index),
      Math.max(0, options.detailScreenshotPaths.value.length - 1)
    )

    if (options.detailIsManga.value) {
      await openComicReader(options.selectedDetailResource.value, options.currentScreenshotIndex.value)
      return
    }

    options.pictureViewerImagePaths.value = [...options.detailScreenshotPaths.value]
    options.pictureViewerResourceIds.value = []
    options.pictureViewerInitialIndex.value = options.currentScreenshotIndex.value
    options.pictureViewerAllowDelete.value = !options.detailIsManga.value
    await options.loadPictureViewerScrollMode()
    options.showPictureViewer.value = true
  }

  return {
    handleOpenAudioTreeImage,
    openComicReader,
    handlePreviewSingleImageResource,
    handleOpenPictureViewer
  }
}
