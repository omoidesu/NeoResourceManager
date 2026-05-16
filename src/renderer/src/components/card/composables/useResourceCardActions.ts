import {computed, onBeforeUnmount, ref, type ComputedRef} from 'vue'

export const useResourceCardActions = (params: {
  resource: ComputedRef<any>
  selectionMode: ComputedRef<boolean>
  stopNeedsConfirmProp: ComputedRef<boolean>
  isWebsiteCategory: ComputedRef<boolean>
  isRunning: ComputedRef<boolean>
  onLaunch: (resource: any) => void
  onStop: (resource: any) => void
  onToggleFavorite: (resource: any) => void
  onToggleCompleted: (resource: any) => void
  onToggleSelect: (resource: any) => void
  onShowDetail: (resource: any) => void
}) => {
  const {
    resource,
    selectionMode,
    stopNeedsConfirmProp,
    isWebsiteCategory,
    isRunning,
    onLaunch,
    onStop,
    onToggleFavorite,
    onToggleCompleted,
    onToggleSelect,
    onShowDetail
  } = params

  const showStopConfirm = ref(false)
  let stopClickTimer: ReturnType<typeof setTimeout> | null = null

  const launchButtonStyle = computed(() => {
    if (isRunning.value) {
      return {
        '--n-color': '#d03050',
        '--n-color-hover': '#de576d',
        '--n-color-pressed': '#ab1f3f',
        '--n-text-color': '#ffffff',
        '--n-icon-color': '#ffffff'
      }
    }

    return undefined
  })

  const canLaunch = computed(() => {
    if (selectionMode.value) {
      return false
    }

    if (resource.value?.missingStatus) {
      return false
    }

    if (isWebsiteCategory.value) {
      return Boolean(resource.value?.websiteMeta?.url || resource.value?.websiteMeta?.website || resource.value?.meta?.website || resource.value?.website)
    }

    return Boolean(resource.value?.basePath) && !resource.value?.missingStatus && !isRunning.value
  })
  const launchButtonHidden = computed(() => Boolean(resource.value?.missingStatus))

  const canStop = computed(() => {
    return !selectionMode.value && Boolean(resource.value?.isRunning)
  })

  const stopNeedsConfirm = computed(() => Boolean(stopNeedsConfirmProp.value))
  const canToggleFavorite = computed(() => !selectionMode.value)
  const canToggleCompleted = computed(() => !selectionMode.value)

  const clearStopClickTimer = () => {
    if (stopClickTimer) {
      clearTimeout(stopClickTimer)
      stopClickTimer = null
    }
  }

  const handleLaunch = () => {
    if (launchButtonHidden.value) {
      return
    }

    onLaunch(resource.value)
  }

  const handleStop = () => {
    if (!canStop.value) {
      return
    }

    onStop(resource.value)
  }

  const handleStopButtonClick = () => {
    if (!canStop.value) {
      return
    }

    if (!stopNeedsConfirm.value) {
      handleStop()
      return
    }

    clearStopClickTimer()
    stopClickTimer = setTimeout(() => {
      showStopConfirm.value = true
      stopClickTimer = null
    }, 220)
  }

  const handleStopButtonDoubleClick = () => {
    if (!canStop.value) {
      return
    }

    clearStopClickTimer()
    showStopConfirm.value = false
    handleStop()
  }

  const handleConfirmStop = () => {
    showStopConfirm.value = false
    handleStop()
  }

  const handleToggleFavorite = () => {
    if (!canToggleFavorite.value) {
      return
    }

    onToggleFavorite(resource.value)
  }

  const handleToggleCompleted = () => {
    if (!canToggleCompleted.value) {
      return
    }

    onToggleCompleted(resource.value)
  }

  const handleShowDetail = () => {
    if (selectionMode.value) {
      handleToggleSelect()
      return
    }

    onShowDetail(resource.value)
  }

  const handleToggleSelect = () => {
    onToggleSelect(resource.value)
  }

  const handleRunningStateChange = (isRunningNow: unknown) => {
    if (!isRunningNow) {
      clearStopClickTimer()
      showStopConfirm.value = false
    }
  }

  onBeforeUnmount(() => {
    clearStopClickTimer()
  })

  return {
    showStopConfirm,
    launchButtonStyle,
    canLaunch,
    launchButtonHidden,
    canStop,
    stopNeedsConfirm,
    canToggleFavorite,
    canToggleCompleted,
    handleLaunch,
    handleStop,
    handleStopButtonClick,
    handleStopButtonDoubleClick,
    handleConfirmStop,
    handleToggleFavorite,
    handleToggleCompleted,
    handleToggleSelect,
    handleShowDetail,
    handleRunningStateChange
  }
}
