import { reactive, type ComputedRef, type Ref } from 'vue'

export type BatchImportState = {
  items: any[]
  fetchInfoEnabled: boolean
  analyzeCurrent: number
  analyzeTotal: number
  analyzeMessage: string
  analyzeRunning: boolean
  importRunning: boolean
  analyzeCancelled: boolean
  analyzeInBackground: boolean
  analyzeToastDismissed: boolean
  showLoading: boolean
  showPreview: boolean
}

interface UseCategoryBatchImportStateOptions {
  categoryId: Ref<string>
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
  batchProgressRunning: ComputedRef<boolean>
  batchProgressStage: ComputedRef<'analyze' | 'import'>
  batchImportResourceLabel: ComputedRef<string>
  getBatchImportOngoingId: (targetCategoryId: string) => string
  getResourceNameFromBasePath: (path: string) => string
  upsertOngoingCenterItem: (payload: {
    id: string
    title: string
    content: string
    progress?: number
    onClick?: () => void
  }) => void
  removeOngoingCenterItem: (id: string) => void
}

const createBatchImportState = (): BatchImportState => ({
  items: [],
  fetchInfoEnabled: true,
  analyzeCurrent: 0,
  analyzeTotal: 0,
  analyzeMessage: '',
  analyzeRunning: false,
  importRunning: false,
  analyzeCancelled: false,
  analyzeInBackground: false,
  analyzeToastDismissed: false,
  showLoading: false,
  showPreview: false
})

export const useCategoryBatchImportState = (options: UseCategoryBatchImportStateOptions) => {
  const batchImportStateStore = reactive<Record<string, BatchImportState>>({})

  const ensureBatchImportState = (targetCategoryId: string) => {
    if (!targetCategoryId) {
      return createBatchImportState()
    }

    if (!batchImportStateStore[targetCategoryId]) {
      batchImportStateStore[targetCategoryId] = createBatchImportState()
    }

    return batchImportStateStore[targetCategoryId]
  }

  const syncBatchImportRefsFromState = (targetCategoryId: string) => {
    const state = ensureBatchImportState(targetCategoryId)
    options.batchImportItems.value = Array.isArray(state.items) ? state.items : []
    options.batchImportFetchInfoEnabled.value = state.fetchInfoEnabled !== false
    options.batchAnalyzeCurrent.value = state.analyzeCurrent
    options.batchAnalyzeTotal.value = state.analyzeTotal
    options.batchAnalyzeMessage.value = state.analyzeMessage
    options.batchAnalyzeRunning.value = state.analyzeRunning
    options.batchImportRunning.value = state.importRunning
    options.batchAnalyzeCancelled.value = state.analyzeCancelled
    options.batchAnalyzeInBackground.value = state.analyzeInBackground
    options.batchAnalyzeToastDismissed.value = state.analyzeToastDismissed
    options.showBatchImportLoading.value = state.showLoading
    options.showBatchImportModal.value = state.showPreview
  }

  const syncBatchImportStateFromRefs = (targetCategoryId: string) => {
    if (!targetCategoryId) {
      return
    }

    batchImportStateStore[targetCategoryId] = {
      items: options.batchImportItems.value,
      fetchInfoEnabled: options.batchImportFetchInfoEnabled.value,
      analyzeCurrent: options.batchAnalyzeCurrent.value,
      analyzeTotal: options.batchAnalyzeTotal.value,
      analyzeMessage: options.batchAnalyzeMessage.value,
      analyzeRunning: options.batchAnalyzeRunning.value,
      importRunning: options.batchImportRunning.value,
      analyzeCancelled: options.batchAnalyzeCancelled.value,
      analyzeInBackground: options.batchAnalyzeInBackground.value,
      analyzeToastDismissed: options.batchAnalyzeToastDismissed.value,
      showLoading: options.showBatchImportLoading.value,
      showPreview: options.showBatchImportModal.value
    }
  }

  const patchBatchImportState = (targetCategoryId: string, patch: Partial<BatchImportState>) => {
    const currentState = ensureBatchImportState(targetCategoryId)
    batchImportStateStore[targetCategoryId] = {
      ...currentState,
      ...patch
    }

    if (targetCategoryId === options.categoryId.value) {
      syncBatchImportRefsFromState(targetCategoryId)
    }
  }

  const resetBatchImportState = (targetCategoryId: string) => {
    batchImportStateStore[targetCategoryId] = createBatchImportState()

    if (targetCategoryId === options.categoryId.value) {
      syncBatchImportRefsFromState(targetCategoryId)
    }
  }

  const clearBatchImportOngoingCenter = (targetCategoryId = options.categoryId.value) => {
    if (!targetCategoryId) {
      return
    }

    options.removeOngoingCenterItem(options.getBatchImportOngoingId(targetCategoryId))
  }

  const syncBatchImportOngoingCenter = (
    targetCategoryId = options.categoryId.value,
    reopenCurrentCategoryProgress?: () => void
  ) => {
    if (!targetCategoryId) {
      return
    }

    const state = ensureBatchImportState(targetCategoryId)
    const isRunning = state.analyzeRunning || state.importRunning
    if (!isRunning) {
      clearBatchImportOngoingCenter(targetCategoryId)
      return
    }

    const [, secondLine] = String(state.analyzeMessage ?? '').split('\n')
    const currentDirectoryName = options.getResourceNameFromBasePath(secondLine || state.analyzeMessage || '')
      || secondLine
      || state.analyzeMessage
      || '正在准备分析目录'
    const current = Number(state.analyzeCurrent ?? 0)
    const total = Number(state.analyzeTotal ?? 0)
    const displayIndex = Math.min(total, current + 1)
    const progress = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
    const title = state.importRunning ? '批量导入进行中' : '批量导入'
    const resourceLabel = targetCategoryId === options.categoryId.value ? options.batchImportResourceLabel.value : '资源'
    const contentPrefix = state.importRunning
      ? `正在导入第 ${displayIndex} / ${total} 个${resourceLabel}`
      : `正在分析第 ${displayIndex} / ${total} 个目录`

    options.upsertOngoingCenterItem({
      id: options.getBatchImportOngoingId(targetCategoryId),
      title,
      content: `${contentPrefix}\n${currentDirectoryName}`,
      progress,
      onClick: () => {
        if (targetCategoryId === options.categoryId.value) {
          reopenCurrentCategoryProgress?.()
        }
      }
    })
  }

  const handleBatchImportRunInBackground = (
    syncOngoingCenter: (targetCategoryId?: string) => void
  ) => {
    if (!options.batchProgressRunning.value) {
      return
    }

    options.batchAnalyzeInBackground.value = true
    options.batchAnalyzeToastDismissed.value = false
    options.showBatchImportLoading.value = false
    syncOngoingCenter()
  }

  const handleReopenBatchImportProgress = (
    syncOngoingCenter: (targetCategoryId?: string) => void
  ) => {
    if (!options.batchProgressRunning.value) {
      return
    }

    options.batchAnalyzeInBackground.value = false
    options.batchAnalyzeToastDismissed.value = false
    options.showBatchImportLoading.value = true
    syncOngoingCenter()
  }

  const handleDismissBatchImportProgressToast = () => {
    options.batchAnalyzeToastDismissed.value = true
  }

  const handleStopBatchImportAnalysis = () => {
    if (!options.batchProgressRunning.value) {
      return
    }

    options.batchAnalyzeCancelled.value = true
    options.batchAnalyzeMessage.value = options.batchProgressStage.value === 'import'
      ? '正在停止导入，请稍候...'
      : '正在停止分析，请稍候...'
  }

  const handleCloseBatchImportModal = (isBatchImportSubmitting: boolean) => {
    if (isBatchImportSubmitting) {
      return
    }

    resetBatchImportState(options.categoryId.value)
  }

  return {
    batchImportStateStore,
    ensureBatchImportState,
    syncBatchImportRefsFromState,
    syncBatchImportStateFromRefs,
    patchBatchImportState,
    resetBatchImportState,
    syncBatchImportOngoingCenter,
    clearBatchImportOngoingCenter,
    handleBatchImportRunInBackground,
    handleReopenBatchImportProgress,
    handleDismissBatchImportProgressToast,
    handleStopBatchImportAnalysis,
    handleCloseBatchImportModal
  }
}
