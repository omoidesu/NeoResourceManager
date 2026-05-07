import type { ComputedRef, Ref } from 'vue'

interface UseCategoryDetailRuntimeOptions {
  selectedDetailResource: Ref<any>
  showDetailDrawer: Ref<boolean>
  showPictureViewer: Ref<boolean>
  showComicReader: Ref<boolean>
  showTextReader: Ref<boolean>
  showPdfReader: Ref<boolean>
  showEpubReader: Ref<boolean>
  showEbookReader: Ref<boolean>
  visibleLogCount: Ref<number>
  currentScreenshotIndex: Ref<number>
  detailIsAudio: ComputedRef<boolean>
  getResourceFilePath: (resource: any) => string
  closeDetailAudioContextMenu: () => void
  clearDetailDerivedState: () => void
  refreshVideoSubCoverPreviewUrls: (resource: any) => Promise<void>
  applyDetailAudioTreePresentation: (targetResource?: any, shouldApply?: () => boolean) => void
  refreshDetailScreenshots: (nextIndex?: number, targetResource?: any, shouldApply?: () => boolean) => Promise<void>
  refreshDetailAudioTree: (targetResource?: any, shouldApply?: () => boolean) => Promise<void>
}

export const useCategoryDetailRuntime = (options: UseCategoryDetailRuntimeOptions) => {
  let detailLoadRequestId = 0

  const closeTransientReaders = () => {
    options.showPictureViewer.value = false
    options.showComicReader.value = false
    options.showTextReader.value = false
    options.showPdfReader.value = false
    options.showEpubReader.value = false
    options.showEbookReader.value = false
  }

  const loadDetailResource = async (resource: any) => {
    try {
      const detailResult = await window.api.service.getResourceDetail(String(resource?.id ?? ''))
      return detailResult?.data ?? resource
    } catch {
      return resource
    }
  }

  const enrichAudioDetail = async (resource: any, requestId: number) => {
    if (!options.detailIsAudio.value) {
      return resource
    }

    const detailResourceId = String(resource?.id ?? '')
    const detailBasePath = options.getResourceFilePath(resource)
    if (!detailResourceId || !detailBasePath) {
      return resource
    }

    try {
      const analysis = await window.api.service.analyzeAudioFilePath(detailBasePath)
      if (requestId !== detailLoadRequestId) {
        return resource
      }

      if (!analysis || detailResourceId !== String(options.selectedDetailResource.value?.id ?? '')) {
        return resource
      }

      return {
        ...resource,
        audioMeta: {
          ...(resource?.audioMeta ?? {}),
          duration: analysis.duration ?? resource?.audioMeta?.duration,
          bitrate: analysis.bitrate ?? resource?.audioMeta?.bitrate ?? null,
          sampleRate: analysis.sampleRate ?? resource?.audioMeta?.sampleRate ?? null
        }
      }
    } catch {
      return resource
    }
  }

  const handleShowResourceDetail = (resource: any) => {
    void (async () => {
      const requestId = ++detailLoadRequestId
      const isCurrentRequest = () => requestId === detailLoadRequestId
      options.selectedDetailResource.value = resource
      options.showDetailDrawer.value = true
      options.closeDetailAudioContextMenu()
      closeTransientReaders()
      options.visibleLogCount.value = 5
      options.currentScreenshotIndex.value = 0
      options.clearDetailDerivedState()

      const detail = await loadDetailResource(resource)
      if (!isCurrentRequest()) {
        return
      }

      options.selectedDetailResource.value = detail

      const enrichedDetail = await enrichAudioDetail(options.selectedDetailResource.value, requestId)
      if (!isCurrentRequest()) {
        return
      }

      options.selectedDetailResource.value = enrichedDetail
      await Promise.all([
        options.refreshDetailScreenshots(0, options.selectedDetailResource.value, isCurrentRequest),
        options.refreshDetailAudioTree(options.selectedDetailResource.value, isCurrentRequest)
      ])
      if (!isCurrentRequest()) {
        return
      }

      await options.refreshVideoSubCoverPreviewUrls(options.selectedDetailResource.value)
      if (!isCurrentRequest()) {
        return
      }

      options.applyDetailAudioTreePresentation(options.selectedDetailResource.value, isCurrentRequest)
    })()
  }

  return {
    handleShowResourceDetail
  }
}
