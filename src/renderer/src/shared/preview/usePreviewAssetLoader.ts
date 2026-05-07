export type PreviewFit = 'inside' | 'cover'

export interface PreviewOptions {
  maxWidth: number
  maxHeight: number
  fit: PreviewFit
  quality: number
  fallbackToFileUrl?: boolean
}

export const isRemotePreviewSource = (value: string) => /^https?:\/\//i.test(value) || /^data:/i.test(value)

export const normalizeProtocolRelativeSource = (value: string) => {
  if (!value) {
    return ''
  }

  if (value.startsWith('//')) {
    return `https:${value}`
  }

  return value
}

export const normalizeCoverPreviewSource = (coverPath: string) =>
  normalizeProtocolRelativeSource(String(coverPath ?? '').trim())

export const normalizeWebsiteIconSource = (iconPath: string) =>
  normalizeProtocolRelativeSource(String(iconPath ?? '').trim())

export const getImagePreviewUrl = async (filePath: string, options: PreviewOptions) =>
  (await window.api.dialog.getImagePreviewUrl(filePath, options)) ?? ''

export const getImageFileUrl = async (filePath: string) =>
  (await window.api.dialog.getImageFileUrl(filePath)) ?? ''

export const getFileIconDataUrl = async (basePath: string, fileName: string) =>
  (await window.api.dialog.getFileIconAsDataUrl(String(basePath ?? ''), String(fileName ?? ''))) ?? ''

export const resolveImagePreviewSource = async (
  inputPath: string,
  options: PreviewOptions,
  normalizer: (value: string) => string = normalizeCoverPreviewSource
) => {
  const normalizedPath = normalizer(String(inputPath ?? '').trim())
  if (!normalizedPath) {
    return ''
  }

  if (isRemotePreviewSource(normalizedPath)) {
    return normalizedPath
  }

  const previewUrl = await getImagePreviewUrl(normalizedPath, options)
  if (previewUrl) {
    return previewUrl
  }

  if (options.fallbackToFileUrl) {
    return await getImageFileUrl(normalizedPath)
  }

  return ''
}
