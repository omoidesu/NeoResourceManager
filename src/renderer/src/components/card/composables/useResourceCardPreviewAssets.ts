import {computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref, watch} from 'vue'
import {
  getFileIconDataUrl,
  resolveImagePreviewSource,
  normalizeCoverPreviewSource,
  normalizeWebsiteIconSource
} from '../../../shared/preview/usePreviewAssetLoader'

export const useResourceCardPreviewAssets = (params: {
  resource: ComputedRef<any>
  showCover: ComputedRef<boolean>
  isWebsiteCategory: ComputedRef<boolean>
  showAsyncFileIcon: ComputedRef<boolean>
  cardTriggerRef: Ref<HTMLElement | null>
  reportCardMounted: (resourceId: string) => void
  logCardTiming: (scope: string, startedAt: number, extra?: Record<string, any>) => void
  coverPreviewLoadDelayMs: number
  fileIconLoadDelayMs: number
  websiteFaviconLoadDelayMs: number
  coverPreviewRootMargin: string
  fileIconRootMargin: string
  websiteFaviconRootMargin: string
  coverPreviewMaxWidth: number
  coverPreviewMaxHeight: number
  coverPreviewQuality: number
  websiteFaviconMaxWidth: number
  websiteFaviconMaxHeight: number
  websiteFaviconQuality: number
}) => {
  const {
    resource,
    showCover,
    isWebsiteCategory,
    showAsyncFileIcon,
    cardTriggerRef,
    reportCardMounted,
    logCardTiming,
    coverPreviewLoadDelayMs,
    fileIconLoadDelayMs,
    websiteFaviconLoadDelayMs,
    coverPreviewRootMargin,
    fileIconRootMargin,
    websiteFaviconRootMargin,
    coverPreviewMaxWidth,
    coverPreviewMaxHeight,
    coverPreviewQuality,
    websiteFaviconMaxWidth,
    websiteFaviconMaxHeight,
    websiteFaviconQuality
  } = params

  const coverPreviewSrc = ref('')
  const fileIconSrc = ref('')
  const websiteFaviconSrc = ref('')
  const shouldLoadCoverPreview = ref(showCover.value === false)
  const shouldLoadFileIcon = ref(false)
  const shouldLoadWebsiteFavicon = ref(false)
  let coverPreviewObserver: IntersectionObserver | null = null
  let fileIconObserver: IntersectionObserver | null = null
  let websiteFaviconObserver: IntersectionObserver | null = null
  let coverPreviewTaskId = 0
  let fileIconTaskId = 0
  let websiteFaviconTaskId = 0
  let coverPreviewLoadTimer: ReturnType<typeof setTimeout> | null = null
  let fileIconLoadTimer: ReturnType<typeof setTimeout> | null = null
  let websiteFaviconLoadTimer: ReturnType<typeof setTimeout> | null = null

  const resolveCardCoverPreviewUrl = async (coverPath: string) => await resolveImagePreviewSource(coverPath, {
    maxWidth: coverPreviewMaxWidth,
    maxHeight: coverPreviewMaxHeight,
    fit: 'cover',
    quality: coverPreviewQuality
  }, normalizeCoverPreviewSource)

  const resolveCardWebsiteFaviconPreviewUrl = async (faviconPath: string) => await resolveImagePreviewSource(faviconPath, {
    maxWidth: websiteFaviconMaxWidth,
    maxHeight: websiteFaviconMaxHeight,
    fit: 'cover',
    quality: websiteFaviconQuality,
    fallbackToFileUrl: true
  }, normalizeWebsiteIconSource)

  const resolveCardFileIconPreviewUrl = async (basePath: string, fileName: string) =>
    await getFileIconDataUrl(String(basePath ?? ''), String(fileName ?? ''))

  const clearFileIconLoadTimer = () => {
    if (fileIconLoadTimer) {
      clearTimeout(fileIconLoadTimer)
      fileIconLoadTimer = null
    }
  }

  const clearWebsiteFaviconLoadTimer = () => {
    if (websiteFaviconLoadTimer) {
      clearTimeout(websiteFaviconLoadTimer)
      websiteFaviconLoadTimer = null
    }
  }

  const isTargetNearViewport = (target: HTMLElement | null, extraBottom = 120) => {
    if (!target || typeof window === 'undefined') {
      return false
    }

    const rect = target.getBoundingClientRect()
    return rect.top <= window.innerHeight + extraBottom && rect.bottom >= -extraBottom
  }

  const scheduleFileIconLoad = (immediate = false) => {
    if (!showAsyncFileIcon.value) {
      shouldLoadFileIcon.value = false
      return
    }

    if (shouldLoadFileIcon.value) {
      return
    }

    clearFileIconLoadTimer()
    if (immediate) {
      logCardTiming('fileIcon.schedule', performance.now(), { immediate: true })
      shouldLoadFileIcon.value = true
      return
    }
    logCardTiming('fileIcon.schedule', performance.now(), { immediate: false, delayMs: fileIconLoadDelayMs })
    fileIconLoadTimer = setTimeout(() => {
      shouldLoadFileIcon.value = true
      fileIconLoadTimer = null
    }, fileIconLoadDelayMs)
  }

  const scheduleWebsiteFaviconLoad = (immediate = false) => {
    if (!isWebsiteCategory.value) {
      shouldLoadWebsiteFavicon.value = false
      return
    }

    if (shouldLoadWebsiteFavicon.value) {
      return
    }

    clearWebsiteFaviconLoadTimer()
    if (immediate) {
      logCardTiming('websiteFavicon.schedule', performance.now(), { immediate: true })
      shouldLoadWebsiteFavicon.value = true
      return
    }
    logCardTiming('websiteFavicon.schedule', performance.now(), { immediate: false, delayMs: websiteFaviconLoadDelayMs })
    websiteFaviconLoadTimer = setTimeout(() => {
      shouldLoadWebsiteFavicon.value = true
      websiteFaviconLoadTimer = null
    }, websiteFaviconLoadDelayMs)
  }

  const clearCoverPreviewLoadTimer = () => {
    if (coverPreviewLoadTimer) {
      clearTimeout(coverPreviewLoadTimer)
      coverPreviewLoadTimer = null
    }
  }

  const scheduleCoverPreviewLoad = (immediate = false) => {
    if (!showCover.value) {
      shouldLoadCoverPreview.value = false
      return
    }

    if (shouldLoadCoverPreview.value) {
      return
    }

    clearCoverPreviewLoadTimer()
    if (immediate) {
      logCardTiming('coverPreview.schedule', performance.now(), { immediate: true })
      shouldLoadCoverPreview.value = true
      return
    }
    logCardTiming('coverPreview.schedule', performance.now(), { immediate: false, delayMs: coverPreviewLoadDelayMs })
    coverPreviewLoadTimer = setTimeout(() => {
      shouldLoadCoverPreview.value = true
      coverPreviewLoadTimer = null
    }, coverPreviewLoadDelayMs)
  }

  watch(
    () => [resource.value?.coverPath, shouldLoadCoverPreview.value, showCover.value] as const,
    async ([coverPath, shouldLoadCover, showCurrentCover]) => {
      const startedAt = performance.now()
      const taskId = ++coverPreviewTaskId
      if (!showCurrentCover) {
        coverPreviewSrc.value = ''
        return
      }

      if (!shouldLoadCover) {
        coverPreviewSrc.value = ''
        return
      }

      if (!coverPath) {
        coverPreviewSrc.value = ''
        return
      }

      try {
        const previewUrl = await resolveCardCoverPreviewUrl(String(coverPath))
        if (taskId !== coverPreviewTaskId) {
          return
        }
        coverPreviewSrc.value = previewUrl ?? ''
        logCardTiming('coverPreview.resolve', startedAt, {
          success: Boolean(previewUrl)
        })
      } catch {
        if (taskId !== coverPreviewTaskId) {
          return
        }
        coverPreviewSrc.value = ''
        logCardTiming('coverPreview.resolve', startedAt, {
          success: false
        })
      }
    },
    {immediate: true}
  )

  watch(
    () => [resource.value?.basePath, resource.value?.fileName ?? resource.value?.filename ?? '', showAsyncFileIcon.value, shouldLoadFileIcon.value] as const,
    async ([basePath, fileName, shouldShowAsyncIcon, shouldLoadIcon]) => {
      const startedAt = performance.now()
      const taskId = ++fileIconTaskId
      if (!shouldShowAsyncIcon || !basePath) {
        fileIconSrc.value = ''
        return
      }

      if (!shouldLoadIcon) {
        fileIconSrc.value = ''
        return
      }

      try {
        const iconUrl = await resolveCardFileIconPreviewUrl(String(basePath), String(fileName ?? ''))
        if (taskId !== fileIconTaskId) {
          return
        }
        fileIconSrc.value = iconUrl ?? ''
        logCardTiming('fileIcon.load', startedAt, {
          success: Boolean(iconUrl)
        })
      } catch {
        if (taskId !== fileIconTaskId) {
          return
        }
        fileIconSrc.value = ''
        logCardTiming('fileIcon.load', startedAt, {
          success: false
        })
      }
    },
    {immediate: true}
  )

  watch(
    () => [isWebsiteCategory.value, resource.value?.websiteMeta?.favicon, shouldLoadWebsiteFavicon.value] as const,
    async ([isCurrentWebsite, favicon, shouldLoadFavicon]) => {
      const startedAt = performance.now()
      if (!isCurrentWebsite || !favicon) {
        websiteFaviconSrc.value = ''
        return
      }

      if (!shouldLoadFavicon) {
        websiteFaviconSrc.value = ''
        return
      }

      if (!normalizeWebsiteIconSource(String(favicon))) {
        websiteFaviconSrc.value = ''
        return
      }

      try {
        websiteFaviconSrc.value = (await resolveCardWebsiteFaviconPreviewUrl(String(favicon))) ?? ''
        logCardTiming('websiteFavicon.resolve', startedAt, {
          success: Boolean(websiteFaviconSrc.value)
        })
      } catch {
        websiteFaviconSrc.value = ''
        logCardTiming('websiteFavicon.resolve', startedAt, {
          success: false
        })
      }
    },
    {immediate: true}
  )

  onBeforeUnmount(() => {
    clearCoverPreviewLoadTimer()
    clearFileIconLoadTimer()
    clearWebsiteFaviconLoadTimer()
    coverPreviewTaskId += 1
    fileIconTaskId += 1
    websiteFaviconTaskId += 1
    coverPreviewObserver?.disconnect()
    coverPreviewObserver = null
    fileIconObserver?.disconnect()
    fileIconObserver = null
    websiteFaviconObserver?.disconnect()
    websiteFaviconObserver = null
  })

  onMounted(() => {
    reportCardMounted(String(resource.value?.id ?? ''))

    if (!showCover.value) {
      shouldLoadCoverPreview.value = false
    } else if (typeof IntersectionObserver === 'undefined') {
      scheduleCoverPreviewLoad()
    } else {
      const target = cardTriggerRef.value
      if (!target) {
        scheduleCoverPreviewLoad()
      } else if (isTargetNearViewport(target, 180)) {
        scheduleCoverPreviewLoad(true)
      } else {
        coverPreviewObserver = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            scheduleCoverPreviewLoad()
            coverPreviewObserver?.disconnect()
            coverPreviewObserver = null
          }
        }, {
          root: null,
          rootMargin: coverPreviewRootMargin,
          threshold: 0.01
        })

        coverPreviewObserver.observe(target)
      }
    }

    if (!showAsyncFileIcon.value) {
      shouldLoadFileIcon.value = false
    } else if (typeof IntersectionObserver === 'undefined') {
      scheduleFileIconLoad()
    } else {
      const target = cardTriggerRef.value
      if (!target) {
        scheduleFileIconLoad()
      } else if (isTargetNearViewport(target, 180)) {
        scheduleFileIconLoad(true)
      } else {
        fileIconObserver = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            scheduleFileIconLoad()
            fileIconObserver?.disconnect()
            fileIconObserver = null
          }
        }, {
          root: null,
          rootMargin: fileIconRootMargin,
          threshold: 0.01
        })

        fileIconObserver.observe(target)
      }
    }

    if (!isWebsiteCategory.value) {
      shouldLoadWebsiteFavicon.value = false
      return
    }

    if (typeof IntersectionObserver === 'undefined') {
      scheduleWebsiteFaviconLoad()
      return
    }

    const target = cardTriggerRef.value
    if (!target) {
      scheduleWebsiteFaviconLoad()
      return
    }

    if (isTargetNearViewport(target, 180)) {
      scheduleWebsiteFaviconLoad(true)
      return
    }

    websiteFaviconObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        scheduleWebsiteFaviconLoad()
        websiteFaviconObserver?.disconnect()
        websiteFaviconObserver = null
      }
    }, {
      root: null,
      rootMargin: websiteFaviconRootMargin,
      threshold: 0.01
    })

    websiteFaviconObserver.observe(target)
  })

  const showWebsiteCoverPlaceholder = computed(() =>
    isWebsiteCategory.value && !coverPreviewSrc.value && Boolean(websiteFaviconSrc.value)
  )

  const showWebsiteEmojiCoverPlaceholder = computed(() =>
    isWebsiteCategory.value && !coverPreviewSrc.value && !websiteFaviconSrc.value
  )

  return {
    coverPreviewSrc,
    fileIconSrc,
    websiteFaviconSrc,
    showWebsiteCoverPlaceholder,
    showWebsiteEmojiCoverPlaceholder
  }
}
