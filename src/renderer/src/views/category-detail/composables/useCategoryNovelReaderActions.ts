import type {ComputedRef, Ref} from 'vue'

type NotifyType = 'success' | 'error' | 'info' | 'warning'

interface UseCategoryNovelReaderActionsOptions {
  categoryName: ComputedRef<string>
  currentTextReaderResourceId: Ref<string>
  currentPdfReaderResourceId: Ref<string>
  currentEpubReaderResourceId: Ref<string>
  currentEbookReaderResourceId: Ref<string>
  textReaderInitialProgress: Ref<number>
  pdfReaderInitialProgress: Ref<number>
  epubReaderInitialProgress: Ref<number>
  ebookReaderInitialProgress: Ref<number>
  textReaderFilePath: Ref<string>
  pdfReaderFilePath: Ref<string>
  epubReaderFilePath: Ref<string>
  ebookReaderFilePath: Ref<string>
  textReaderTitle: Ref<string>
  pdfReaderTitle: Ref<string>
  epubReaderTitle: Ref<string>
  ebookReaderTitle: Ref<string>
  showPictureViewer: Ref<boolean>
  showComicReader: Ref<boolean>
  showTextReader: Ref<boolean>
  showPdfReader: Ref<boolean>
  showEpubReader: Ref<boolean>
  showEbookReader: Ref<boolean>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  getResourceFilePath: (resource: any) => string
  getFileNameWithoutExtension: (filePath: string) => string
  fetchData: () => Promise<void>
  readNovelProgress: (resourceId: string) => Promise<number>
  startNovelReaderSession: (resource: any, title: string) => Promise<boolean>
  stopTextReadingSession: () => Promise<void>
  stopPdfReadingSession: () => Promise<void>
  stopEpubReadingSession: () => Promise<void>
  stopEbookReadingSession: () => Promise<void>
}

export const useCategoryNovelReaderActions = (options: UseCategoryNovelReaderActionsOptions) => {
  const openTextReader = async (resource: any) => {
    const resourceId = String(resource?.id ?? '').trim()
    const filePath = options.getResourceFilePath(resource)

    if (!resourceId || !filePath) {
      options.showNotifyByType('warning', 'TXT 阅读', '当前小说资源无效')
      return
    }

    if (options.showTextReader.value && options.currentTextReaderResourceId.value && options.currentTextReaderResourceId.value !== resourceId) {
      await options.stopTextReadingSession()
    }
    if (options.showPdfReader.value) {
      await options.stopPdfReadingSession()
    }
    if (options.showEpubReader.value) {
      await options.stopEpubReadingSession()
    }
    if (options.showEbookReader.value) {
      await options.stopEbookReadingSession()
    }
    if (!(await options.startNovelReaderSession(resource, 'TXT 阅读'))) {
      return
    }

    options.textReaderInitialProgress.value = await options.readNovelProgress(resourceId)
    options.textReaderFilePath.value = filePath
    options.textReaderTitle.value = String(resource?.title ?? options.getFileNameWithoutExtension(filePath) ?? options.categoryName.value)
    options.currentTextReaderResourceId.value = resourceId
    options.showPictureViewer.value = false
    options.showComicReader.value = false
    options.showPdfReader.value = false
    options.showEpubReader.value = false
    options.showTextReader.value = true
    options.showEbookReader.value = false
    await options.fetchData()
  }

  const openPdfReader = async (resource: any) => {
    const resourceId = String(resource?.id ?? '').trim()
    const filePath = options.getResourceFilePath(resource)

    if (!resourceId || !filePath) {
      options.showNotifyByType('warning', 'PDF 阅读', '当前小说资源无效')
      return
    }

    if (options.showPdfReader.value && options.currentPdfReaderResourceId.value && options.currentPdfReaderResourceId.value !== resourceId) {
      await options.stopPdfReadingSession()
    }
    if (options.showTextReader.value) {
      await options.stopTextReadingSession()
    }
    if (options.showEpubReader.value) {
      await options.stopEpubReadingSession()
    }
    if (options.showEbookReader.value) {
      await options.stopEbookReadingSession()
    }
    if (!(await options.startNovelReaderSession(resource, 'PDF 阅读'))) {
      return
    }

    options.pdfReaderInitialProgress.value = await options.readNovelProgress(resourceId)
    options.pdfReaderFilePath.value = filePath
    options.pdfReaderTitle.value = String(resource?.title ?? options.getFileNameWithoutExtension(filePath) ?? options.categoryName.value)
    options.currentPdfReaderResourceId.value = resourceId
    options.showPictureViewer.value = false
    options.showComicReader.value = false
    options.showTextReader.value = false
    options.showEpubReader.value = false
    options.showEbookReader.value = false
    options.showPdfReader.value = true
    await options.fetchData()
  }

  const openEpubReader = async (resource: any) => {
    const resourceId = String(resource?.id ?? '').trim()
    const filePath = options.getResourceFilePath(resource)

    if (!resourceId || !filePath) {
      options.showNotifyByType('warning', 'EPUB 阅读', '当前小说资源无效')
      return
    }

    if (options.showEpubReader.value && options.currentEpubReaderResourceId.value && options.currentEpubReaderResourceId.value !== resourceId) {
      await options.stopEpubReadingSession()
    }
    if (options.showTextReader.value) {
      await options.stopTextReadingSession()
    }
    if (options.showPdfReader.value) {
      await options.stopPdfReadingSession()
    }
    if (options.showEbookReader.value) {
      await options.stopEbookReadingSession()
    }
    if (!(await options.startNovelReaderSession(resource, 'EPUB 阅读'))) {
      return
    }

    options.epubReaderInitialProgress.value = await options.readNovelProgress(resourceId)
    options.epubReaderFilePath.value = filePath
    options.epubReaderTitle.value = String(resource?.title ?? options.getFileNameWithoutExtension(filePath) ?? options.categoryName.value)
    options.currentEpubReaderResourceId.value = resourceId
    options.showPictureViewer.value = false
    options.showComicReader.value = false
    options.showTextReader.value = false
    options.showPdfReader.value = false
    options.showEpubReader.value = true
    options.showEbookReader.value = false
    await options.fetchData()
  }

  const openEbookReader = async (resource: any) => {
    const resourceId = String(resource?.id ?? '').trim()
    const filePath = options.getResourceFilePath(resource)

    if (!resourceId || !filePath) {
      options.showNotifyByType('warning', '电子书阅读', '当前小说资源无效')
      return
    }

    if (options.showEbookReader.value && options.currentEbookReaderResourceId.value && options.currentEbookReaderResourceId.value !== resourceId) {
      await options.stopEbookReadingSession()
    }
    if (options.showTextReader.value) {
      await options.stopTextReadingSession()
    }
    if (options.showPdfReader.value) {
      await options.stopPdfReadingSession()
    }
    if (options.showEpubReader.value) {
      await options.stopEpubReadingSession()
    }
    if (!(await options.startNovelReaderSession(resource, '电子书阅读'))) {
      return
    }

    options.ebookReaderInitialProgress.value = await options.readNovelProgress(resourceId)
    options.ebookReaderFilePath.value = filePath
    options.ebookReaderTitle.value = String(resource?.title ?? options.getFileNameWithoutExtension(filePath) ?? options.categoryName.value)
    options.currentEbookReaderResourceId.value = resourceId
    options.showPictureViewer.value = false
    options.showComicReader.value = false
    options.showTextReader.value = false
    options.showPdfReader.value = false
    options.showEpubReader.value = false
    options.showEbookReader.value = true
    await options.fetchData()
  }

  const openNovelReader = async (resource: any) => {
    const filePath = options.getResourceFilePath(resource)
    const extension = filePath.replace(/\\/g, '/').split('/').pop()?.split('.').pop()?.toLowerCase() ?? ''

    if (['txt', 'md', 'markdown'].includes(extension)) {
      await openTextReader(resource)
      return
    }

    if (extension === 'pdf') {
      await openPdfReader(resource)
      return
    }

    if (extension === 'epub') {
      await openEpubReader(resource)
      return
    }

    if (['mobi', 'azw', 'azw3'].includes(extension)) {
      await openEbookReader(resource)
      return
    }

    options.showNotifyByType('warning', '阅读', '当前阅读器暂只支持 TXT、MD、PDF、EPUB、MOBI 和 AZW3 文件')
  }

  return {
    openTextReader,
    openPdfReader,
    openEpubReader,
    openEbookReader,
    openNovelReader
  }
}
