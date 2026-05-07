import type { ComputedRef, Ref } from 'vue'

type NotifyType = 'success' | 'error' | 'info' | 'warning' | 'warn' | string

type ReaderSessionDeps = {
  categoryId: ComputedRef<string>
  completedResourceCount: Ref<number>
  resourceList: Ref<any[]>
  currentScreenshotIndex: Ref<number>
  pictureViewerResourceIds: Ref<string[]>
  currentPictureViewerResourceId: Ref<string>
  currentComicReaderResourceId: Ref<string>
  currentTextReaderResourceId: Ref<string>
  currentPdfReaderResourceId: Ref<string>
  currentEpubReaderResourceId: Ref<string>
  currentEbookReaderResourceId: Ref<string>
  textReaderInitialProgress: Ref<number>
  pdfReaderInitialProgress: Ref<number>
  epubReaderInitialProgress: Ref<number>
  ebookReaderInitialProgress: Ref<number>
  showEbookReader: Ref<boolean>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  fetchData: () => Promise<unknown> | unknown
}

export const useCategoryReaderSessions = (deps: ReaderSessionDeps) => {
  const readComicProgress = async (resourceId: string) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return 0
    }

    try {
      const result = await window.api.service.getMultiImageReadingProgress(normalizedResourceId)
      return Math.max(0, Math.floor(Number(result?.data?.lastReadPage ?? 0)))
    } catch {
      return 0
    }
  }

  const writeComicProgress = async (resourceId: string, pageIndex: number) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return
    }

    try {
      await window.api.service.updateMultiImageReadingProgress(
        normalizedResourceId,
        Math.max(0, Math.floor(Number(pageIndex ?? 0)))
      )
    } catch {
      // ignore progress persistence failure
    }
  }

  const startComicReadingSession = async (resource: any) => {
    const resourceId = String(resource?.id ?? '').trim()
    if (!resourceId) {
      return false
    }

    const result = await window.api.service.startReadingResource(resourceId)
    const resultType = result?.type ?? 'info'
    if (resultType === 'error' || resultType === 'warning') {
      deps.showNotifyByType(resultType, '开始阅读', result?.message ?? '开始阅读失败')
      return false
    }

    return true
  }

  const stopPictureViewingSession = async () => {
    const resourceId = String(deps.currentPictureViewerResourceId.value ?? '').trim()
    if (!resourceId) {
      return
    }

    deps.currentPictureViewerResourceId.value = ''
    const result = await window.api.service.stopResource(resourceId)
    if (result?.type === 'error') {
      deps.showNotifyByType('error', '结束查看图片', result?.message ?? '结束查看图片失败')
      return
    }

    await deps.fetchData()
  }

  const handlePictureViewerIndexChange = async (index: number) => {
    const nextResourceId = String(deps.pictureViewerResourceIds.value[Math.max(0, Math.floor(Number(index ?? 0)))] ?? '').trim()
    if (!nextResourceId) {
      return
    }

    const currentResourceId = String(deps.currentPictureViewerResourceId.value ?? '').trim()
    if (!currentResourceId || currentResourceId === nextResourceId) {
      deps.currentPictureViewerResourceId.value = nextResourceId
      return
    }

    const stopResult = await window.api.service.stopResource(currentResourceId)
    if (stopResult?.type === 'error') {
      deps.showNotifyByType('error', '切换图片', stopResult?.message ?? '结束上一张图片浏览失败')
      return
    }

    deps.currentPictureViewerResourceId.value = ''
    const startResult = await window.api.service.startReadingResource(nextResourceId)
    const startResultType = startResult?.type ?? 'info'
    if (startResultType === 'error' || startResultType === 'warning') {
      deps.showNotifyByType(startResultType, '切换图片', startResult?.message ?? '开始浏览下一张图片失败')
      return
    }

    deps.currentPictureViewerResourceId.value = nextResourceId
    await deps.fetchData()
  }

  const stopComicReadingSession = async () => {
    const resourceId = String(deps.currentComicReaderResourceId.value ?? '').trim()
    if (!resourceId) {
      return
    }

    deps.currentComicReaderResourceId.value = ''
    const result = await window.api.service.stopResource(resourceId)
    if (result?.type === 'error') {
      deps.showNotifyByType('error', '结束阅读', result?.message ?? '结束阅读失败')
      return
    }

    await deps.fetchData()
  }

  const handleComicReaderPageChange = (index: number) => {
    deps.currentScreenshotIndex.value = Math.max(0, Math.floor(Number(index ?? 0)))
    void writeComicProgress(deps.currentComicReaderResourceId.value, deps.currentScreenshotIndex.value)
  }

  const readNovelProgress = async (resourceId: string) => {
    const result = await window.api.service.getNovelReadingProgress(resourceId)
    return Math.max(0, Math.min(1, Number(result?.data?.lastReadPercent ?? 0)))
  }

  const markNovelCompletedIfNeeded = async (resourceId: string, progressPercent: number) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    const normalizedProgress = Math.max(0, Math.min(1, Number(progressPercent ?? 0)))
    if (!normalizedResourceId || normalizedProgress < 1) {
      return
    }

    const targetResource = deps.resourceList.value.find((item) => String(item?.id ?? '') === normalizedResourceId)
    if (targetResource?.isCompleted) {
      return
    }

    const result = await window.api.service.updateResourceCompleted(normalizedResourceId, true)
    if (result?.type === 'error') {
      return
    }

    if (targetResource) {
      targetResource.isCompleted = true
    }
    deps.completedResourceCount.value = await window.api.db.getCompletedResourceCountByCategoryId(deps.categoryId.value)
  }

  const writeNovelProgress = async (resourceId: string, progressPercent: number) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return
    }

    const normalizedProgress = Math.max(0, Math.min(1, Number(progressPercent ?? 0)))
    await window.api.service.updateNovelReadingProgress(
      normalizedResourceId,
      normalizedProgress
    )
    await markNovelCompletedIfNeeded(normalizedResourceId, normalizedProgress)
  }

  const stopTextReadingSession = async () => {
    const resourceId = String(deps.currentTextReaderResourceId.value ?? '').trim()
    if (!resourceId) {
      return
    }

    deps.currentTextReaderResourceId.value = ''
    const result = await window.api.service.stopResource(resourceId)
    if (result?.type === 'error') {
      deps.showNotifyByType('error', '结束阅读', result?.message ?? '结束阅读失败')
      return
    }

    await deps.fetchData()
  }

  const stopPdfReadingSession = async () => {
    const resourceId = String(deps.currentPdfReaderResourceId.value ?? '').trim()
    if (!resourceId) {
      return
    }

    deps.currentPdfReaderResourceId.value = ''
    const result = await window.api.service.stopResource(resourceId)
    if (result?.type === 'error') {
      deps.showNotifyByType('error', '结束阅读', result?.message ?? '结束阅读失败')
      return
    }

    await deps.fetchData()
  }

  const stopEpubReadingSession = async () => {
    const resourceId = String(deps.currentEpubReaderResourceId.value ?? '').trim()
    if (!resourceId) {
      return
    }

    deps.currentEpubReaderResourceId.value = ''
    const result = await window.api.service.stopResource(resourceId)
    if (result?.type === 'error') {
      deps.showNotifyByType('error', '结束阅读', result?.message ?? '结束阅读失败')
      return
    }

    await deps.fetchData()
  }

  const stopEbookReadingSession = async () => {
    const resourceId = String(deps.currentEbookReaderResourceId.value ?? '').trim()
    if (!resourceId) {
      return
    }

    deps.currentEbookReaderResourceId.value = ''
    const result = await window.api.service.stopResource(resourceId)
    if (result?.type === 'error') {
      deps.showNotifyByType('error', '结束阅读', result?.message ?? '结束阅读失败')
      return
    }

    await deps.fetchData()
  }

  const startNovelReaderSession = async (resource: any, title: string) => {
    const resourceId = String(resource?.id ?? '').trim()
    if (!resourceId) {
      deps.showNotifyByType('warning', title, '当前小说资源无效')
      return false
    }

    const result = await window.api.service.startReadingResource(resourceId)
    const resultType = result?.type ?? 'info'
    if (resultType === 'error' || resultType === 'warning') {
      deps.showNotifyByType(resultType, '开始阅读', result?.message ?? '开始阅读失败')
      return false
    }

    return true
  }

  const handleTextReaderProgressChange = (progressPercent: number) => {
    const resourceId = String(deps.currentTextReaderResourceId.value ?? '').trim()
    deps.textReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progressPercent ?? 0)))
    if (resourceId) {
      void writeNovelProgress(resourceId, deps.textReaderInitialProgress.value)
    }
  }

  const handlePdfReaderProgressChange = (progressPercent: number) => {
    const resourceId = String(deps.currentPdfReaderResourceId.value ?? '').trim()
    deps.pdfReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progressPercent ?? 0)))
    if (resourceId) {
      void writeNovelProgress(resourceId, deps.pdfReaderInitialProgress.value)
    }
  }

  const handleEpubReaderProgressChange = (progressPercent: number) => {
    const resourceId = String(deps.currentEpubReaderResourceId.value ?? '').trim()
    deps.epubReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progressPercent ?? 0)))
    if (resourceId) {
      void writeNovelProgress(resourceId, deps.epubReaderInitialProgress.value)
    }
  }

  const handleEbookReaderProgressChange = (progressPercent: number) => {
    const resourceId = String(deps.currentEbookReaderResourceId.value ?? '').trim()
    deps.ebookReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progressPercent ?? 0)))
    if (resourceId) {
      void writeNovelProgress(resourceId, deps.ebookReaderInitialProgress.value)
    }
  }

  const handleEbookReaderShowUpdate = (visible: boolean) => {
    deps.showEbookReader.value = visible
    if (!visible && deps.currentEbookReaderResourceId.value) {
      void stopEbookReadingSession()
    }
  }

  return {
    readComicProgress,
    writeComicProgress,
    startComicReadingSession,
    stopPictureViewingSession,
    handlePictureViewerIndexChange,
    stopComicReadingSession,
    handleComicReaderPageChange,
    readNovelProgress,
    writeNovelProgress,
    stopTextReadingSession,
    stopPdfReadingSession,
    stopEpubReadingSession,
    stopEbookReadingSession,
    startNovelReaderSession,
    handleTextReaderProgressChange,
    handlePdfReaderProgressChange,
    handleEpubReaderProgressChange,
    handleEbookReaderProgressChange,
    handleEbookReaderShowUpdate
  }
}
