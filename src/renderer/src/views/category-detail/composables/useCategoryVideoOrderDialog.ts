import { ref } from 'vue'
import type { Ref } from 'vue'

type NotifyType = 'success' | 'error' | 'info' | 'warning' | 'warn' | string

export type VideoOrderItem = {
  id: string
  fileName: string
  relativePath: string
  coverPath?: string
  sortOrder: number
  isVisible: boolean
}

type VideoOrderDialogDeps = {
  showVideoOrderModal: Ref<boolean>
  showDetailDrawer: Ref<boolean>
  selectedDetailResource: Ref<any>
  fetchData: () => Promise<unknown> | unknown
  getDetailVideoSubItems: (resource: any) => VideoOrderItem[]
  scheduleVideoSubCoverPreviewRefresh: (resource: any) => void
  refreshVideoSubCoverPreviewUrls: (resource: any) => Promise<unknown> | unknown
  refreshDetailAudioTree: (resource?: any) => Promise<unknown> | unknown
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  compareByFileName: (left: string, right: string) => number
}

const normalizeVideoOrderItems = (items: VideoOrderItem[]) =>
  items.map((item, itemIndex) => ({
    ...item,
    sortOrder: itemIndex
  }))

export const useCategoryVideoOrderDialog = (deps: VideoOrderDialogDeps) => {
  const videoOrderResource = ref<any | null>(null)
  const videoOrderItems = ref<VideoOrderItem[]>([])
  const videoOrderInitialItems = ref<VideoOrderItem[]>([])
  const isVideoOrderSubmitting = ref(false)
  const videoOrderDragIndex = ref<number | null>(null)
  const videoOrderDragOverIndex = ref<number | null>(null)

  const resetVideoOrderDialog = () => {
    videoOrderResource.value = null
    videoOrderItems.value = []
    videoOrderInitialItems.value = []
    isVideoOrderSubmitting.value = false
    videoOrderDragIndex.value = null
    videoOrderDragOverIndex.value = null
  }

  const handleResetVideoOrderItems = () => {
    videoOrderItems.value = [...videoOrderItems.value]
      .sort((left, right) => {
        const fileNameCompare = deps.compareByFileName(left.fileName, right.fileName)
        if (fileNameCompare !== 0) {
          return fileNameCompare
        }

        return deps.compareByFileName(left.relativePath, right.relativePath)
      })
      .map((item, index) => ({
        ...item,
        sortOrder: index
      }))
  }

  const isVideoOrderItemChanged = (item: { relativePath: string; isVisible: boolean }, index: number) => {
    const initialItem = videoOrderInitialItems.value.find((entry) => entry.relativePath === item.relativePath)
    if (!initialItem) {
      return true
    }

    return initialItem.sortOrder !== index || initialItem.isVisible !== item.isVisible
  }

  const moveVideoOrderItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= videoOrderItems.value.length || toIndex >= videoOrderItems.value.length) {
      return
    }

    const nextItems = [...videoOrderItems.value]
    const [targetItem] = nextItems.splice(fromIndex, 1)
    if (!targetItem) {
      return
    }

    nextItems.splice(toIndex, 0, targetItem)
    videoOrderItems.value = normalizeVideoOrderItems(nextItems)
  }

  const handleVideoOrderDragStart = (index: number, event: DragEvent) => {
    videoOrderDragIndex.value = index
    videoOrderDragOverIndex.value = index
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
    }
  }

  const handleVideoOrderDragEnter = (index: number) => {
    if (videoOrderDragIndex.value == null || videoOrderDragIndex.value === index) {
      return
    }

    videoOrderDragOverIndex.value = index
  }

  const handleVideoOrderDrop = (index: number) => {
    const fromIndex = videoOrderDragIndex.value
    videoOrderDragIndex.value = null
    videoOrderDragOverIndex.value = null
    if (fromIndex == null || fromIndex === index) {
      return
    }

    moveVideoOrderItem(fromIndex, index)
  }

  const handleVideoOrderDragEnd = () => {
    videoOrderDragIndex.value = null
    videoOrderDragOverIndex.value = null
  }

  const handleOpenVideoOrderDialog = (resource: any) => {
    void (async () => {
      const resourceId = String(resource?.id ?? '').trim()
      if (!resourceId) {
        deps.showNotifyByType('warning', '修改顺序', '资源ID无效')
        return
      }

      const applyVideoOrderDetail = (detail: any) => {
        const videoSubs = deps.getDetailVideoSubItems(detail)
        if (!videoSubs.length) {
          deps.showNotifyByType('warning', '修改顺序', '当前番剧目录中没有可排序的视频文件')
          return false
        }

        videoOrderResource.value = detail
        videoOrderItems.value = videoSubs
        videoOrderInitialItems.value = videoSubs.map((item, index) => ({
          ...item,
          sortOrder: index
        }))
        deps.showVideoOrderModal.value = true
        return true
      }

      try {
        const hasPreloadedVideoSubs = Array.isArray(resource?.videoSubs) && resource.videoSubs.length > 0
        if (hasPreloadedVideoSubs && applyVideoOrderDetail(resource)) {
          deps.scheduleVideoSubCoverPreviewRefresh(resource)
          return
        }

        const result = await window.api.service.getResourceDetail(resourceId)
        const resultType = result?.type ?? 'warning'
        const detail = result?.data ?? null
        if (resultType === 'error' || !detail) {
          deps.showNotifyByType(resultType, '修改顺序', result?.message ?? '获取番剧详情失败')
          return
        }

        if (!applyVideoOrderDetail(detail)) {
          return
        }

        deps.scheduleVideoSubCoverPreviewRefresh(detail)
      } catch (error) {
        deps.showNotifyByType('error', '修改顺序', error instanceof Error ? error.message : '打开顺序编辑失败')
      }
    })()
  }

  const handleSubmitVideoOrder = async () => {
    const resourceId = String(videoOrderResource.value?.id ?? '').trim()
    if (!resourceId) {
      deps.showNotifyByType('warning', '修改顺序', '资源ID无效')
      return
    }

    isVideoOrderSubmitting.value = true
    try {
      const result = await window.api.service.updateVideoSubItems(resourceId, videoOrderItems.value.map((item, index) => ({
        relativePath: item.relativePath,
        isVisible: item.isVisible,
        sortOrder: index
      })))
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '操作完成'
      deps.showNotifyByType(resultType, '修改顺序', resultMessage)

      if (resultType === 'error') {
        return
      }

      if (deps.showDetailDrawer.value && String(deps.selectedDetailResource.value?.id ?? '') === resourceId) {
        deps.selectedDetailResource.value = {
          ...deps.selectedDetailResource.value,
          videoSubs: Array.isArray(result?.data) ? result.data : deps.selectedDetailResource.value?.videoSubs ?? []
        }
        await deps.refreshVideoSubCoverPreviewUrls(deps.selectedDetailResource.value)
        await deps.refreshDetailAudioTree(deps.selectedDetailResource.value)
      }

      deps.showVideoOrderModal.value = false
      await deps.fetchData()
    } catch (error) {
      deps.showNotifyByType('error', '修改顺序', error instanceof Error ? error.message : '保存番剧顺序失败')
    } finally {
      isVideoOrderSubmitting.value = false
    }
  }

  return {
    videoOrderResource,
    videoOrderItems,
    videoOrderInitialItems,
    isVideoOrderSubmitting,
    videoOrderDragIndex,
    videoOrderDragOverIndex,
    resetVideoOrderDialog,
    handleResetVideoOrderItems,
    isVideoOrderItemChanged,
    moveVideoOrderItem,
    handleVideoOrderDragStart,
    handleVideoOrderDragEnter,
    handleVideoOrderDrop,
    handleVideoOrderDragEnd,
    handleOpenVideoOrderDialog,
    handleSubmitVideoOrder
  }
}
