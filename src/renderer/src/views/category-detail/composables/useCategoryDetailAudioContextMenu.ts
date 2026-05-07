import {computed, type Ref} from 'vue'

type NotifyFn = (type: string, title: string, content: string) => void

export const useCategoryDetailAudioContextMenu = (params: {
  detailAudioContextMenuVisible: Ref<boolean>
  detailAudioContextMenuX: Ref<number>
  detailAudioContextMenuY: Ref<number>
  detailAudioContextMenuTarget: Ref<any | null>
  formatAsmrDuration: (seconds: number | null | undefined) => string
  formatAudioBitrate: (bitrate: number | null | undefined) => string
  formatAudioSampleRate: (sampleRate: number | null | undefined) => string
  formatFrameRate: (frameRate: number | null | undefined) => string
  formatImageResolution: (width: number | null | undefined, height: number | null | undefined) => string
  handleOpenAudioTreeImage: (filePath: string) => Promise<void>
  handleAudioTreePlay: (option: any) => void
  showNotifyByType: NotifyFn
}) => {
  const {
    detailAudioContextMenuVisible,
    detailAudioContextMenuX,
    detailAudioContextMenuY,
    detailAudioContextMenuTarget,
    formatAsmrDuration,
    formatAudioBitrate,
    formatAudioSampleRate,
    formatFrameRate,
    formatImageResolution,
    handleOpenAudioTreeImage,
    handleAudioTreePlay,
    showNotifyByType
  } = params

  const closeDetailAudioContextMenu = () => {
    detailAudioContextMenuVisible.value = false
    detailAudioContextMenuTarget.value = null
  }

  const ensureDetailAudioContextMenuMetadata = async (option: any) => {
    if (!option || option?.isDirectory || !option?.path) {
      return
    }

    const hasResolvedMetadata = option.__metadataResolved === true
    const hasInlineMetadata = [
      option?.duration,
      option?.bitrate,
      option?.sampleRate,
      option?.frameRate,
      option?.audioBitrate,
      option?.audioSampleRate,
      option?.width,
      option?.height
    ].some((item) => item != null)
    if (hasResolvedMetadata || hasInlineMetadata) {
      option.__metadataResolved = true
      return
    }

    option.__metadataResolved = true
    try {
      const metadata = await window.api.dialog.getMediaMetadata(String(option.path))
      if (!metadata) {
        return
      }

      Object.assign(option, {
        duration: metadata.duration ?? option.duration ?? null,
        bitrate: metadata.bitrate ?? option.bitrate ?? null,
        sampleRate: metadata.sampleRate ?? option.sampleRate ?? null,
        frameRate: metadata.frameRate ?? option.frameRate ?? null,
        audioBitrate: metadata.audioBitrate ?? option.audioBitrate ?? null,
        audioSampleRate: metadata.audioSampleRate ?? option.audioSampleRate ?? null,
        width: metadata.width ?? option.width ?? null,
        height: metadata.height ?? option.height ?? null
      })
      detailAudioContextMenuTarget.value = {
        ...option
      }
    } catch {
      // Keep lightweight tree responsive even if per-file metadata probe fails.
    }
  }

  const handleOpenAudioTreeContextMenu = (event: MouseEvent, option: any) => {
    if (!option || option?.isDirectory) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    detailAudioContextMenuTarget.value = option
    detailAudioContextMenuX.value = event.clientX
    detailAudioContextMenuY.value = event.clientY
    detailAudioContextMenuVisible.value = true
    void ensureDetailAudioContextMenuMetadata(option)
  }

  const detailAudioContextMenuOptions = computed(() => {
    const option = detailAudioContextMenuTarget.value
    if (!option || option?.isDirectory) {
      return []
    }

    if (option?.kind === 'image') {
      return [
        {label: '查看', key: 'view'},
        {label: `分辨率: ${formatImageResolution(option?.width, option?.height)}`, key: 'resolution', disabled: true}
      ]
    }

    if (option?.kind === 'video') {
      return [
        {label: '播放', key: 'play'},
        {label: '使用默认应用播放', key: 'play-default'},
        {label: `时长: ${formatAsmrDuration(option?.duration)}`, key: 'duration', disabled: true},
        {label: `分辨率: ${formatImageResolution(option?.width, option?.height)}`, key: 'resolution', disabled: true},
        {label: `比特率: ${formatAudioBitrate(option?.bitrate)}`, key: 'bitrate', disabled: true},
        {label: `帧速率: ${formatFrameRate(option?.frameRate)}`, key: 'frameRate', disabled: true},
        {label: `音频比特率: ${formatAudioBitrate(option?.audioBitrate)}`, key: 'audioBitrate', disabled: true},
        {label: `音频采样率: ${formatAudioSampleRate(option?.audioSampleRate)}`, key: 'audioSampleRate', disabled: true}
      ]
    }

    return [
      {label: '播放', key: 'play'},
      {label: '使用默认应用播放', key: 'play-default'},
      {label: `时长: ${formatAsmrDuration(option?.duration)}`, key: 'duration', disabled: true},
      {label: `比特率: ${formatAudioBitrate(option?.bitrate)}`, key: 'bitrate', disabled: true},
      {label: `采样率: ${formatAudioSampleRate(option?.sampleRate)}`, key: 'sampleRate', disabled: true}
    ]
  })

  const detailAudioContextMenuPosition = computed(() => {
    const menuWidth = 220
    const optionCount = detailAudioContextMenuOptions.value.length
    const menuHeight = Math.max(56, optionCount * 34 + 16)
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
    const padding = 12

    const safeX = viewportWidth > 0
      ? Math.max(padding, Math.min(detailAudioContextMenuX.value, viewportWidth - menuWidth - padding))
      : detailAudioContextMenuX.value
    const safeY = viewportHeight > 0
      ? Math.max(padding, Math.min(detailAudioContextMenuY.value, viewportHeight - menuHeight - padding))
      : detailAudioContextMenuY.value

    return {
      x: safeX,
      y: safeY
    }
  })

  const handleOpenPathWithDefaultApp = async (targetPath: string, title = '使用默认应用播放') => {
    const normalizedPath = String(targetPath ?? '').trim()
    if (!normalizedPath) {
      showNotifyByType('warning', title, '当前文件路径无效')
      return
    }

    try {
      const message = await window.api.dialog.openPath(normalizedPath)
      if (message) {
        showNotifyByType('error', title, message)
        return
      }

      showNotifyByType('success', title, '已使用默认应用打开文件')
    } catch (error) {
      showNotifyByType('error', title, error instanceof Error ? error.message : '打开文件失败')
    }
  }

  const handleSelectDetailAudioContextMenu = (key: string) => {
    const option = detailAudioContextMenuTarget.value
    closeDetailAudioContextMenu()

    if (!option || option?.isDirectory) {
      return
    }

    if (key === 'view' && option?.kind === 'image') {
      void handleOpenAudioTreeImage(String(option?.path ?? ''))
      return
    }

    if (key === 'play-default' && (option?.kind === 'audio' || option?.kind === 'video')) {
      void handleOpenPathWithDefaultApp(String(option?.path ?? ''), '使用默认应用播放')
      return
    }

    if (key === 'play' && (option?.kind === 'audio' || option?.kind === 'video')) {
      handleAudioTreePlay(option)
    }
  }

  return {
    closeDetailAudioContextMenu,
    ensureDetailAudioContextMenuMetadata,
    handleOpenAudioTreeContextMenu,
    detailAudioContextMenuOptions,
    detailAudioContextMenuPosition,
    handleSelectDetailAudioContextMenu
  }
}
