import { ref, watch, type Ref } from 'vue'
import {
  isRemotePreviewSource,
  normalizeCoverPreviewSource,
  normalizeWebsiteIconSource,
  resolveImagePreviewSource
} from '../../../shared/preview/usePreviewAssetLoader'

export {normalizeCoverPreviewSource, normalizeWebsiteIconSource}

interface UseCategoryPreviewAssetsOptions {
  formCoverPath: Ref<string | null | undefined>
  detailCoverPath: Ref<string | null | undefined>
  currentScreenshotPath: Ref<string | null | undefined>
  detailIsWebsite: Ref<boolean>
  detailWebsiteFaviconPath: Ref<string | null | undefined>
  detailScreenshotPaths: Ref<string[]>
  onFormCoverPreviewError?: (message: string) => void
}

export const useCategoryPreviewAssets = (options: UseCategoryPreviewAssetsOptions) => {
  const coverPreviewSrc = ref('')
  const detailCoverPreviewSrc = ref('')
  const detailScreenshotPreviewSrc = ref('')
  const detailWebsiteFaviconSrc = ref('')
  const detailGalleryImageUrls = ref<Record<string, string>>({})

  const resolveCoverPreviewUrl = async (coverPath: string) => {
    try {
      return await resolveImagePreviewSource(coverPath, {
        maxWidth: 480,
        maxHeight: 320,
        fit: 'cover',
        quality: 84
      })
    } catch {
      return ''
    }
  }

  const resolveDetailCoverPreviewUrl = async (coverPath: string) => {
    try {
      return await resolveImagePreviewSource(coverPath, {
        maxWidth: 960,
        maxHeight: 720,
        fit: 'inside',
        quality: 84
      })
    } catch {
      return ''
    }
  }

  const resolveDetailScreenshotPreviewUrl = async (filePath: string) => {
    try {
      return await resolveImagePreviewSource(filePath, {
        maxWidth: 960,
        maxHeight: 720,
        fit: 'inside',
        quality: 84
      })
    } catch {
      return ''
    }
  }

  const resolveDetailGalleryPreviewUrl = async (filePath: string) => {
    try {
      return await resolveImagePreviewSource(filePath, {
        maxWidth: 360,
        maxHeight: 480,
        fit: 'cover',
        quality: 76
      })
    } catch {
      return ''
    }
  }

  const resolveDetailWebsiteFaviconPreviewUrl = async (faviconPath: string) => {
    try {
      return await resolveImagePreviewSource(faviconPath, {
        maxWidth: 64,
        maxHeight: 64,
        fit: 'cover',
        quality: 80,
        fallbackToFileUrl: true
      }, normalizeWebsiteIconSource)
    } catch {
      return ''
    }
  }

  const resolveVideoSubCoverPreviewUrl = async (coverPath: string) => {
    try {
      return await resolveImagePreviewSource(coverPath, {
        maxWidth: 320,
        maxHeight: 180,
        fit: 'cover',
        quality: 78
      })
    } catch {
      return ''
    }
  }

  const resolveAudioPlayerCoverPreviewUrl = async (coverPath: string) => {
    try {
      return await resolveImagePreviewSource(coverPath, {
        maxWidth: 960,
        maxHeight: 720,
        fit: 'inside',
        quality: 84
      })
    } catch {
      return ''
    }
  }

  const resolveVideoPlayerCoverPreviewUrl = async (coverPath: string) => {
    try {
      return await resolveImagePreviewSource(coverPath, {
        maxWidth: 320,
        maxHeight: 200,
        fit: 'cover',
        quality: 80
      })
    } catch {
      return ''
    }
  }

  watch(
    () => options.formCoverPath.value,
    async (coverPath) => {
      if (!coverPath) {
        coverPreviewSrc.value = ''
        return
      }

      if (
        coverPath.startsWith('screenshot://')
        || coverPath.startsWith('auto://')
        || coverPath.startsWith('custom://')
      ) {
        coverPreviewSrc.value = ''
        return
      }

      const normalizedCoverPath = normalizeCoverPreviewSource(coverPath)
      if (isRemotePreviewSource(normalizedCoverPath)) {
        coverPreviewSrc.value = normalizedCoverPath
        return
      }

      try {
        coverPreviewSrc.value = await resolveImagePreviewSource(normalizedCoverPath, {
          maxWidth: 720,
          maxHeight: 480,
          fit: 'inside',
          quality: 82
        })
      } catch (error) {
        options.onFormCoverPreviewError?.(error instanceof Error ? error.message : '加载封面预览失败')
        coverPreviewSrc.value = ''
      }
    },
    { immediate: true }
  )

  watch(
    () => options.detailCoverPath.value,
    async (coverPath) => {
      if (!coverPath) {
        detailCoverPreviewSrc.value = ''
        return
      }

      const normalizedCoverPath = normalizeCoverPreviewSource(coverPath)
      detailCoverPreviewSrc.value = await resolveDetailCoverPreviewUrl(normalizedCoverPath)
    },
    { immediate: true }
  )

  watch(
    () => options.currentScreenshotPath.value,
    async (filePath) => {
      if (!filePath) {
        detailScreenshotPreviewSrc.value = ''
        return
      }

      detailScreenshotPreviewSrc.value = await resolveDetailScreenshotPreviewUrl(filePath)
    },
    { immediate: true }
  )

  watch(
    () => [options.detailIsWebsite.value, options.detailWebsiteFaviconPath.value] as const,
    async ([isWebsite, favicon]) => {
      if (!isWebsite || !favicon) {
        detailWebsiteFaviconSrc.value = ''
        return
      }

      const normalizedFavicon = normalizeWebsiteIconSource(String(favicon))
      if (!normalizedFavicon) {
        detailWebsiteFaviconSrc.value = ''
        return
      }

      detailWebsiteFaviconSrc.value = await resolveDetailWebsiteFaviconPreviewUrl(normalizedFavicon)
    },
    { immediate: true }
  )

  watch(
    () => [...options.detailScreenshotPaths.value],
    async (paths) => {
      if (!paths.length) {
        detailGalleryImageUrls.value = {}
        return
      }

      const urlEntries = await Promise.all(paths.map(async (filePath) => {
        try {
          const previewUrl = await resolveDetailGalleryPreviewUrl(filePath)
          return [filePath, previewUrl] as const
        } catch {
          return [filePath, ''] as const
        }
      }))

      detailGalleryImageUrls.value = Object.fromEntries(urlEntries.filter(([, url]) => url))
    },
    { immediate: true }
  )

  return {
    coverPreviewSrc,
    detailCoverPreviewSrc,
    detailScreenshotPreviewSrc,
    detailWebsiteFaviconSrc,
    detailGalleryImageUrls,
    normalizeCoverPreviewSource,
    normalizeWebsiteIconSource,
    resolveCoverPreviewUrl,
    resolveDetailCoverPreviewUrl,
    resolveDetailScreenshotPreviewUrl,
    resolveDetailWebsiteFaviconPreviewUrl,
    resolveDetailGalleryPreviewUrl,
    resolveVideoSubCoverPreviewUrl,
    resolveAudioPlayerCoverPreviewUrl,
    resolveVideoPlayerCoverPreviewUrl
  }
}
