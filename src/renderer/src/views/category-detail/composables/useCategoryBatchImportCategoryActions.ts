import type { ComputedRef, Ref } from 'vue'
import { DictType } from '../../../../../common/constants'
import { createEmptyMetaByType } from '../../../components/meta/meta-factory'
import { createBatchImportItemEnricher } from './batch-import-helpers'

interface UseCategoryBatchImportCategoryActionsOptions {
  categoryId: ComputedRef<string>
  categoryInfo: Ref<any>
  categorySettings: ComputedRef<any>
  detailIsManga: ComputedRef<boolean>
  detailIsAsmr: ComputedRef<boolean>
  ensureBatchImportState: (targetCategoryId: string) => any
  patchBatchImportState: (targetCategoryId: string, patch: Record<string, any>) => void
  syncBatchImportOngoingCenter: (targetCategoryId?: string) => void
  clearBatchImportOngoingCenter: (targetCategoryId?: string) => void
  showNotifyByType: (type: string, title: string, content: string) => void
  confirmDialog: (title: string, content: string) => Promise<boolean>
  getResourceNameFromBasePath: (path: string) => string
  getFileName: (path: string) => string
  getFileNameWithoutExtension: (path: string) => string
  validateBasePathExtension: (path: string) => boolean
  detectPixivIdFromFilePath: (path: string) => string
  normalizeAudioAuthorList: (values: string[]) => string[]
  joinAudioAuthorNames: (names: string[]) => string
  fetchData: () => Promise<void>
  cloneFormData: (value: any) => any
  mapResourceDetailToFormData: (resource: any) => any
  syncAudioAuthorFields: (formData: any, value?: string[]) => void
  buildAudioFetchPayload: (basePath: string, analysis?: any) => any
  fetchAudioLyricsSilently: (payload: any) => Promise<any>
  fetchAudioAlbumCoverSilently: (payload: any) => Promise<any>
  logger: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  }
  BATCH_ANALYZE_CONCURRENCY: number
}

export const useCategoryBatchImportCategoryActions = (options: UseCategoryBatchImportCategoryActionsOptions) => {
  const enrichBatchImportItem = createBatchImportItemEnricher(options.detailIsManga, options.detailIsAsmr)

  const analyzeBatchImportComicDirectories = async (targetCategoryId: string, directoryPaths: string[]) => {
    const items: any[] = new Array(directoryPaths.length)
    let nextIndex = 0
    let completedCount = 0

    const updateAnalyzeProgress = (directoryPath?: string, index?: number) => {
      const currentDirectoryName = options.getResourceNameFromBasePath(directoryPath || '') || directoryPath || '正在准备分析目录'
      const currentIndex = typeof index === 'number'
        ? Math.min(directoryPaths.length, index + 1)
        : Math.min(directoryPaths.length, completedCount + 1)

      options.patchBatchImportState(targetCategoryId, {
        analyzeCurrent: completedCount,
        analyzeMessage: `正在分析第 ${currentIndex} / ${directoryPaths.length} 个漫画目录\n${currentDirectoryName}`
      })
      options.syncBatchImportOngoingCenter()
    }

    const worker = async () => {
      while (!options.ensureBatchImportState(targetCategoryId).analyzeCancelled) {
        const currentIndex = nextIndex
        nextIndex += 1

        if (currentIndex >= directoryPaths.length) {
          return
        }

        const directoryPath = directoryPaths[currentIndex]
        const directoryName = options.getResourceNameFromBasePath(directoryPath)
        updateAnalyzeProgress(directoryName || directoryPath, currentIndex)

        try {
          const analysisResult = await window.api.service.analyzeMultiImageDirectory(directoryPath)
          const analysisData = analysisResult?.data ?? {}
          const imageCount = Math.max(0, Number(analysisData?.imageCount ?? 0))
          items[currentIndex] = await enrichBatchImportItem({
            directoryPath: String(analysisData?.directoryPath ?? directoryPath),
            directoryName: String(analysisData?.directoryName ?? directoryName ?? ''),
            coverPath: String(analysisData?.coverPath ?? ''),
            imageCount,
            exists: Boolean(analysisData?.exists),
            existingResourceTitle: String(analysisData?.existingResourceTitle ?? ''),
            checked: !analysisData?.exists && imageCount > 0,
            errorMessage: analysisResult?.type === 'error' ? String(analysisResult?.message ?? '') : ''
          })
        } catch (error) {
          items[currentIndex] = {
            directoryPath,
            directoryName,
            coverPath: '',
            imageCount: 0,
            exists: false,
            checked: false,
            errorMessage: error instanceof Error ? error.message : '分析失败'
          }
        } finally {
          completedCount += 1
          options.patchBatchImportState(targetCategoryId, {
            analyzeCurrent: completedCount
          })
          options.syncBatchImportOngoingCenter()
        }
      }
    }

    const workerCount = Math.min(directoryPaths.length, options.BATCH_ANALYZE_CONCURRENCY)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    return items.filter(Boolean)
  }

  const handleBatchImportComics = async () => {
    const targetCategoryId = String(options.categoryId.value ?? '').trim()
    const currentState = options.ensureBatchImportState(targetCategoryId)

    if (currentState.analyzeRunning || currentState.importRunning) {
      options.patchBatchImportState(targetCategoryId, {
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        showLoading: true
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)
      return
    }

    try {
      const directoryPaths = await window.api.dialog.selectFolders()
      if (!directoryPaths?.length) {
        return
      }

      options.patchBatchImportState(targetCategoryId, {
        items: [],
        fetchInfoEnabled: true,
        analyzeTotal: directoryPaths.length,
        analyzeCurrent: 0,
        analyzeMessage: '正在分析漫画目录，请稍候...',
        analyzeCancelled: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        analyzeRunning: true,
        importRunning: false,
        showLoading: true,
        showPreview: false
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)

      const items = await analyzeBatchImportComicDirectories(targetCategoryId, directoryPaths)
      options.patchBatchImportState(targetCategoryId, {
        items,
        showPreview: items.length > 0,
        showLoading: false
      })

      if (!items.length && options.ensureBatchImportState(targetCategoryId).analyzeCancelled) {
        options.showNotifyByType('info', '批量导入漫画', '已停止分析')
      }
    } finally {
      options.patchBatchImportState(targetCategoryId, {
        analyzeRunning: false,
        analyzeInBackground: false,
        showLoading: false,
        analyzeToastDismissed: false
      })
      options.clearBatchImportOngoingCenter(targetCategoryId)
    }
  }

  const analyzeBatchImportAsmrDirectories = async (targetCategoryId: string, directoryPaths: string[]) => {
    const items: any[] = new Array(directoryPaths.length)
    let nextIndex = 0
    let completedCount = 0

    const updateAnalyzeProgress = (directoryPath?: string, index?: number) => {
      const currentDirectoryName = options.getResourceNameFromBasePath(directoryPath || '') || directoryPath || '正在准备分析目录'
      const currentIndex = typeof index === 'number'
        ? Math.min(directoryPaths.length, index + 1)
        : Math.min(directoryPaths.length, completedCount + 1)

      options.patchBatchImportState(targetCategoryId, {
        analyzeCurrent: completedCount,
        analyzeMessage: `正在分析第 ${currentIndex} / ${directoryPaths.length} 个音声目录\n${currentDirectoryName}`
      })
      options.syncBatchImportOngoingCenter()
    }

    const worker = async () => {
      while (!options.ensureBatchImportState(targetCategoryId).analyzeCancelled) {
        const currentIndex = nextIndex
        nextIndex += 1
        if (currentIndex >= directoryPaths.length) {
          return
        }

        const directoryPath = directoryPaths[currentIndex]
        const directoryName = options.getResourceNameFromBasePath(directoryPath)
        updateAnalyzeProgress(directoryName || directoryPath, currentIndex)

        try {
          const analysisResult = await window.api.service.analyzeAsmrDirectory(directoryPath)
          const analysisData = analysisResult?.data ?? {}
          const audioCount = Math.max(0, Number(analysisData?.audioCount ?? 0))
          items[currentIndex] = await enrichBatchImportItem({
            directoryPath: String(analysisData?.directoryPath ?? directoryPath),
            directoryName: String(analysisData?.directoryName ?? directoryName ?? ''),
            coverPath: String(analysisData?.coverPath ?? ''),
            audioCount,
            exists: Boolean(analysisData?.exists),
            existingResourceTitle: String(analysisData?.existingResourceTitle ?? ''),
            gameId: String(analysisData?.gameId ?? ''),
            websiteType: String(analysisData?.websiteType ?? ''),
            checked: !analysisData?.exists && audioCount > 0,
            errorMessage: analysisResult?.type === 'error' ? String(analysisResult?.message ?? '') : ''
          })
        } catch (error) {
          items[currentIndex] = {
            directoryPath,
            directoryName,
            coverPath: '',
            audioCount: 0,
            exists: false,
            checked: false,
            errorMessage: error instanceof Error ? error.message : '分析失败'
          }
        } finally {
          completedCount += 1
          options.patchBatchImportState(targetCategoryId, {
            analyzeCurrent: completedCount
          })
          options.syncBatchImportOngoingCenter()
        }
      }
    }

    const workerCount = Math.min(directoryPaths.length, options.BATCH_ANALYZE_CONCURRENCY)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    return items.filter(Boolean)
  }

  const handleBatchImportAsmrs = async () => {
    const targetCategoryId = String(options.categoryId.value ?? '').trim()
    const currentState = options.ensureBatchImportState(targetCategoryId)

    if (currentState.analyzeRunning || currentState.importRunning) {
      options.patchBatchImportState(targetCategoryId, {
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        showLoading: true
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)
      return
    }

    try {
      const directoryPaths = await window.api.dialog.selectFolders()
      if (!directoryPaths?.length) {
        return
      }

      options.patchBatchImportState(targetCategoryId, {
        items: [],
        fetchInfoEnabled: true,
        analyzeTotal: directoryPaths.length,
        analyzeCurrent: 0,
        analyzeMessage: '正在分析音声目录，请稍候...',
        analyzeCancelled: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        analyzeRunning: true,
        importRunning: false,
        showLoading: true,
        showPreview: false
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)

      const items = await analyzeBatchImportAsmrDirectories(targetCategoryId, directoryPaths)
      options.patchBatchImportState(targetCategoryId, {
        items,
        showPreview: items.length > 0,
        showLoading: false
      })

      if (!items.length && options.ensureBatchImportState(targetCategoryId).analyzeCancelled) {
        options.showNotifyByType('info', '批量导入音声', '已停止分析')
      }
    } finally {
      options.patchBatchImportState(targetCategoryId, {
        analyzeRunning: false,
        analyzeInBackground: false,
        showLoading: false,
        analyzeToastDismissed: false
      })
      options.clearBatchImportOngoingCenter(targetCategoryId)
    }
  }

  const handleBatchImportImages = async () => {
    const targetCategoryId = String(options.categoryId.value ?? '').trim()
    const currentState = options.ensureBatchImportState(targetCategoryId)
    if (currentState.analyzeRunning || currentState.importRunning) {
      options.patchBatchImportState(targetCategoryId, {
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        showLoading: true
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)
      return
    }

    try {
      const extensions = [...(options.categorySettings.value.extensions ?? [])]
      const filePaths = await window.api.dialog.selectFiles(extensions)
      if (!Array.isArray(filePaths) || !filePaths.length) {
        return
      }

      const imageSiteOptions = await window.api.db.getSelectDictData(DictType.IMAGE_SITE_TYPE)
      const pixivWebsiteId = String(
        imageSiteOptions.find((item: any) => String(item?.label ?? '').trim().toLowerCase() === 'pixiv')?.value ?? ''
      ).trim()
      const pixivMatches = filePaths
        .map((item) => options.detectPixivIdFromFilePath(String(item ?? '').trim()))
        .filter(Boolean)
      const shouldFetchPixivInfo = pixivMatches.length > 0
        ? await options.confirmDialog('批量导入图片', `检测到 ${pixivMatches.length} 个文件名符合 Pixiv 格式，是否在导入时自动获取 Pixiv 信息？`)
        : false

      options.patchBatchImportState(targetCategoryId, {
        items: [],
        fetchInfoEnabled: shouldFetchPixivInfo,
        analyzeTotal: filePaths.length,
        analyzeCurrent: 0,
        analyzeMessage: '正在准备导入图片，请稍候...',
        analyzeCancelled: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        analyzeRunning: false,
        importRunning: true,
        showLoading: true,
        showPreview: false
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)

      let successCount = 0
      let skippedCount = 0
      let failedCount = 0
      let pixivFetchedCount = 0

      for (const [index, rawFilePath] of filePaths.entries()) {
        if (options.ensureBatchImportState(targetCategoryId).analyzeCancelled) {
          break
        }

        const filePath = String(rawFilePath ?? '').trim()
        const fileName = options.getFileName(filePath) || filePath || '未知文件'
        options.patchBatchImportState(targetCategoryId, {
          analyzeCurrent: index,
          analyzeMessage: `正在导入第 ${index + 1} / ${filePaths.length} 张图片\n${fileName}`
        })
        options.syncBatchImportOngoingCenter(targetCategoryId)

        const normalizedPath = String(filePath ?? '').trim()
        if (!normalizedPath || !options.validateBasePathExtension(normalizedPath)) {
          skippedCount += 1
          continue
        }

        const existsResult = await window.api.service.checkResourceExistsByPath(normalizedPath)
        if (existsResult?.exists) {
          skippedCount += 1
          continue
        }
        if (existsResult?.type === 'error') {
          failedCount += 1
          continue
        }

        const pixivId = options.detectPixivIdFromFilePath(normalizedPath)
        const fileStem = options.getFileNameWithoutExtension(normalizedPath)
        const baseMeta = createEmptyMetaByType('single_image_meta') as Record<string, unknown>
        let fetchedPixivData: any = null

        if (shouldFetchPixivInfo && pixivId && pixivWebsiteId) {
          const fetchResult = await window.api.service.fetchResourceInfo(pixivWebsiteId, pixivId)
          if (fetchResult?.type === 'success' || fetchResult?.type === 'warning') {
            fetchedPixivData = fetchResult?.data ?? null
            if (fetchResult?.type === 'success') {
              pixivFetchedCount += 1
            }
          }
        }

        const payload = {
          name: String(fetchedPixivData?.name ?? '').trim() || fileStem || options.getFileName(normalizedPath),
          description: '',
          coverPath: String(fetchedPixivData?.cover ?? '').trim() || normalizedPath,
          basePath: normalizedPath,
          author: String(fetchedPixivData?.author ?? '').trim(),
          actors: [],
          tags: Array.isArray(fetchedPixivData?.tag) ? fetchedPixivData.tag : [],
          types: Array.isArray(fetchedPixivData?.type) ? fetchedPixivData.type : [],
          categoryId: targetCategoryId,
          meta: {
            ...baseMeta,
            pixivId,
            websiteType: pixivId ? pixivWebsiteId : '',
            gameId: pixivId,
            website: pixivId ? `https://www.pixiv.net/artworks/${pixivId}` : '',
            format: String(normalizedPath.match(/\.([^.\\/]+)$/)?.[1] ?? '').toLowerCase()
          }
        }

        const result = await window.api.service.saveResource(payload as any)
        if (result?.type === 'error') {
          failedCount += 1
        } else {
          successCount += 1
        }
      }

      options.patchBatchImportState(targetCategoryId, {
        analyzeCurrent: filePaths.length,
        analyzeMessage: '图片批量导入完成'
      })

      const stopped = options.ensureBatchImportState(targetCategoryId).analyzeCancelled
      const notifyType = failedCount > 0 && successCount === 0 ? 'error' : stopped ? 'warning' : 'success'
      options.showNotifyByType(
        notifyType,
        '批量导入图片',
        `${stopped ? '已停止，' : ''}导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}${shouldFetchPixivInfo ? `，获取 Pixiv 信息 ${pixivFetchedCount}` : ''}`
      )

      if (successCount > 0 && targetCategoryId === String(options.categoryId.value ?? '').trim()) {
        await options.fetchData()
      }
    } catch (error) {
      options.showNotifyByType('error', '批量导入图片', error instanceof Error ? error.message : '批量导入图片失败')
    } finally {
      options.patchBatchImportState(targetCategoryId, {
        importRunning: false,
        showLoading: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false
      })
      options.clearBatchImportOngoingCenter(targetCategoryId)
    }
  }

  const analyzeWebsiteBookmarkSource = async (
    targetCategoryId: string,
    sourceLabel: string,
    analyzer: () => Promise<any>
  ) => {
    const currentState = options.ensureBatchImportState(targetCategoryId)
    if (currentState.analyzeRunning || currentState.importRunning) {
      options.patchBatchImportState(targetCategoryId, {
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        showLoading: true
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)
      return
    }

    try {
      options.patchBatchImportState(targetCategoryId, {
        items: [],
        fetchInfoEnabled: true,
        analyzeTotal: 1,
        analyzeCurrent: 0,
        analyzeMessage: `正在读取网站书签\n${sourceLabel || '书签源'}`,
        analyzeCancelled: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        analyzeRunning: true,
        importRunning: false,
        showLoading: true,
        showPreview: false
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)

      const result = await analyzer()
      const items = Array.isArray(result?.data?.items) ? result.data.items : []
      options.patchBatchImportState(targetCategoryId, {
        items,
        analyzeCurrent: 1,
        analyzeTotal: Math.max(1, items.length),
        analyzeMessage: result?.message ?? '网站书签分析完成',
        showPreview: items.length > 0,
        showLoading: false
      })

      if (result?.type === 'error') {
        options.showNotifyByType('error', '批量导入网站', String(result?.message ?? '解析网站书签失败'))
      } else if (!items.length) {
        options.showNotifyByType('warning', '批量导入网站', String(result?.message ?? '未找到可导入的网站书签'))
      }
    } catch (error) {
      options.showNotifyByType('error', '批量导入网站', error instanceof Error ? error.message : '分析网站书签失败')
    } finally {
      options.patchBatchImportState(targetCategoryId, {
        analyzeRunning: false,
        analyzeInBackground: false,
        showLoading: false,
        analyzeToastDismissed: false
      })
      options.clearBatchImportOngoingCenter(targetCategoryId)
    }
  }

  const handleBatchImportWebsiteBookmarkFile = async () => {
    const targetCategoryId = String(options.categoryId.value ?? '').trim()
    const bookmarkFilePath = await window.api.dialog.selectBookmarkFile()
    if (!bookmarkFilePath) {
      return
    }

    await analyzeWebsiteBookmarkSource(
      targetCategoryId,
      options.getFileName(bookmarkFilePath),
      () => window.api.service.analyzeWebsiteBookmarkFile(bookmarkFilePath)
    )
  }

  const handleBatchImportWebsiteBrowserSource = async (sourceId: string, sourceLabel?: string) => {
    const targetCategoryId = String(options.categoryId.value ?? '').trim()
    const normalizedSourceId = String(sourceId ?? '').trim()
    if (!normalizedSourceId) {
      options.showNotifyByType('warning', '批量导入网站', '请选择浏览器书签来源')
      return
    }

    await analyzeWebsiteBookmarkSource(
      targetCategoryId,
      sourceLabel || '浏览器书签',
      () => window.api.service.analyzeWebsiteBookmarksFromBrowser(normalizedSourceId)
    )
  }

  const buildBatchNovelResourcePayload = (targetCategoryId: string, filePath: string, analysis: any) => {
    const fileStem = options.getFileNameWithoutExtension(filePath)
    const novelMetaBase = createEmptyMetaByType('novel_meta') as Record<string, unknown>
    const isbn = String(analysis?.isbn ?? '').trim()
    const coverDataUrl = String(analysis?.coverDataUrl ?? '').trim()

    return {
      name: fileStem || options.getFileName(filePath),
      description: '',
      coverPath: coverDataUrl,
      basePath: String(filePath ?? '').trim(),
      author: '',
      authors: [],
      actors: [],
      tags: [],
      types: [],
      categoryId: targetCategoryId,
      meta: {
        ...novelMetaBase,
        isbn,
        lastReadPercent: 0
      }
    }
  }

  const handleBatchImportNovelFiles = async () => {
    const targetCategoryId = String(options.categoryId.value ?? '').trim()
    const currentState = options.ensureBatchImportState(targetCategoryId)
    if (currentState.analyzeRunning || currentState.importRunning) {
      options.patchBatchImportState(targetCategoryId, {
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        showLoading: true
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)
      return
    }

    try {
      const extensions = [...(options.categorySettings.value.extensions ?? [])]
      const filePaths = await window.api.dialog.selectFiles(extensions)
      if (!Array.isArray(filePaths) || !filePaths.length) {
        return
      }

      options.patchBatchImportState(targetCategoryId, {
        items: [],
        fetchInfoEnabled: false,
        analyzeTotal: filePaths.length,
        analyzeCurrent: 0,
        analyzeMessage: '正在准备导入小说，请稍候...',
        analyzeCancelled: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        analyzeRunning: false,
        importRunning: true,
        showLoading: true,
        showPreview: false
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)

      let successCount = 0
      let skippedCount = 0
      let failedCount = 0

      for (const [index, rawFilePath] of filePaths.entries()) {
        if (options.ensureBatchImportState(targetCategoryId).analyzeCancelled) {
          break
        }

        const filePath = String(rawFilePath ?? '').trim()
        const fileName = options.getFileName(filePath) || filePath || '未知文件'
        options.patchBatchImportState(targetCategoryId, {
          analyzeCurrent: index,
          analyzeMessage: `正在导入第 ${index + 1} / ${filePaths.length} 个小说\n${fileName}`
        })
        options.syncBatchImportOngoingCenter(targetCategoryId)

        if (!filePath || !options.validateBasePathExtension(filePath)) {
          skippedCount += 1
          continue
        }

        const existsResult = await window.api.service.checkResourceExistsByPath(filePath)
        if (existsResult?.exists) {
          skippedCount += 1
          continue
        }
        if (existsResult?.type === 'error') {
          failedCount += 1
          continue
        }

        let analysis: any = {}
        try {
          const analysisResult = await window.api.service.analyzeNovelFilePath(filePath)
          analysis = analysisResult?.data ?? {}
        } catch {
          analysis = {}
        }

        const result = await window.api.service.saveResource(buildBatchNovelResourcePayload(targetCategoryId, filePath, analysis) as any)
        if (result?.type === 'error') {
          failedCount += 1
        } else {
          successCount += 1
        }
      }

      options.patchBatchImportState(targetCategoryId, {
        analyzeCurrent: filePaths.length,
        analyzeMessage: '小说批量导入完成'
      })

      const stopped = options.ensureBatchImportState(targetCategoryId).analyzeCancelled
      const notifyType = failedCount > 0 && successCount === 0 ? 'error' : stopped ? 'warning' : 'success'
      options.showNotifyByType(
        notifyType,
        '批量导入小说',
        `${stopped ? '已停止，' : ''}导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`
      )

      if (successCount > 0 && targetCategoryId === String(options.categoryId.value ?? '').trim()) {
        await options.fetchData()
      }
    } catch (error) {
      options.showNotifyByType('error', '批量导入小说', error instanceof Error ? error.message : '批量导入小说失败')
    } finally {
      options.patchBatchImportState(targetCategoryId, {
        importRunning: false,
        showLoading: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false
      })
      options.clearBatchImportOngoingCenter(targetCategoryId)
    }
  }

  const buildBatchVideoResourcePayload = (targetCategoryId: string, filePath: string) => {
    const fileStem = options.getFileNameWithoutExtension(filePath)
    const videoMetaBase = createEmptyMetaByType('video_meta') as Record<string, unknown>

    return {
      name: fileStem || options.getFileName(filePath),
      description: '',
      coverPath: '',
      basePath: String(filePath ?? '').trim(),
      author: '',
      authors: [],
      actors: [],
      tags: [],
      types: [],
      categoryId: targetCategoryId,
      meta: {
        ...videoMetaBase,
        year: null,
        lastPlayFile: '',
        lastPlayTime: 0
      }
    }
  }

  const handleBatchImportVideoFiles = async () => {
    const targetCategoryId = options.categoryId.value
    const currentState = options.ensureBatchImportState(targetCategoryId)
    if (currentState.analyzeRunning || currentState.importRunning) {
      options.patchBatchImportState(targetCategoryId, {
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        showLoading: true
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)
      return
    }

    try {
      const extensions = [...(options.categorySettings.value.extensions ?? [])]
      const filePaths = await window.api.dialog.selectFiles(extensions)
      if (!Array.isArray(filePaths) || !filePaths.length) {
        return
      }

      options.patchBatchImportState(targetCategoryId, {
        items: [],
        fetchInfoEnabled: false,
        analyzeTotal: filePaths.length,
        analyzeCurrent: 0,
        analyzeMessage: '正在准备导入电影，请稍候...',
        analyzeCancelled: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        analyzeRunning: false,
        importRunning: true,
        showLoading: true,
        showPreview: false
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)

      let successCount = 0
      let skippedCount = 0
      let failedCount = 0

      for (const [index, rawFilePath] of filePaths.entries()) {
        if (options.ensureBatchImportState(targetCategoryId).analyzeCancelled) {
          break
        }

        const filePath = String(rawFilePath ?? '').trim()
        const fileName = options.getFileName(filePath) || filePath || '未知文件'
        options.patchBatchImportState(targetCategoryId, {
          analyzeCurrent: index,
          analyzeMessage: `正在导入第 ${index + 1} / ${filePaths.length} 个电影\n${fileName}`
        })
        options.syncBatchImportOngoingCenter(targetCategoryId)

        if (!filePath || !options.validateBasePathExtension(filePath)) {
          skippedCount += 1
          continue
        }

        const existsResult = await window.api.service.checkResourceExistsByPath(filePath)
        if (existsResult?.exists) {
          skippedCount += 1
          continue
        }
        if (existsResult?.type === 'error') {
          failedCount += 1
          continue
        }

        const result = await window.api.service.saveResource(buildBatchVideoResourcePayload(targetCategoryId, filePath) as any)
        if (result?.type === 'error') {
          failedCount += 1
        } else {
          successCount += 1
        }
      }

      options.patchBatchImportState(targetCategoryId, {
        analyzeCurrent: filePaths.length,
        analyzeMessage: '电影批量导入完成'
      })

      const stopped = options.ensureBatchImportState(targetCategoryId).analyzeCancelled
      const notifyType = failedCount > 0 && successCount === 0 ? 'error' : stopped ? 'warning' : 'success'
      options.showNotifyByType(
        notifyType,
        '批量导入电影',
        `${stopped ? '已停止，' : ''}导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`
      )

      if (successCount > 0 && targetCategoryId === String(options.categoryId.value ?? '').trim()) {
        await options.fetchData()
      }
    } catch (error) {
      options.showNotifyByType('error', '批量导入电影', error instanceof Error ? error.message : '批量导入电影失败')
    } finally {
      options.patchBatchImportState(targetCategoryId, {
        importRunning: false,
        showLoading: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false
      })
      options.clearBatchImportOngoingCenter(targetCategoryId)
    }
  }

  const buildBatchAnimeResourcePayload = (targetCategoryId: string, directoryPath: string) => {
    const directoryName = options.getResourceNameFromBasePath(directoryPath)
    const videoMetaBase = createEmptyMetaByType('video_meta') as Record<string, unknown>

    return {
      name: directoryName || options.getFileName(directoryPath) || String(directoryPath ?? '').trim(),
      description: '',
      coverPath: '',
      basePath: String(directoryPath ?? '').trim(),
      author: '',
      authors: [],
      actors: [],
      tags: [],
      types: [],
      categoryId: targetCategoryId,
      meta: {
        ...videoMetaBase,
        year: null,
        lastPlayFile: '',
        lastPlayTime: 0
      }
    }
  }

  const handleBatchImportAnimeDirectories = async () => {
    const targetCategoryId = options.categoryId.value
    const currentState = options.ensureBatchImportState(targetCategoryId)
    if (currentState.analyzeRunning || currentState.importRunning) {
      options.patchBatchImportState(targetCategoryId, {
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        showLoading: true
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)
      return
    }

    try {
      const directoryPaths = await window.api.dialog.selectFolders()
      if (!Array.isArray(directoryPaths) || !directoryPaths.length) {
        return
      }

      options.patchBatchImportState(targetCategoryId, {
        items: [],
        fetchInfoEnabled: false,
        analyzeTotal: directoryPaths.length,
        analyzeCurrent: 0,
        analyzeMessage: '正在准备导入番剧，请稍候...',
        analyzeCancelled: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false,
        analyzeRunning: false,
        importRunning: true,
        showLoading: true,
        showPreview: false
      })
      options.syncBatchImportOngoingCenter(targetCategoryId)

      let successCount = 0
      let skippedCount = 0
      let failedCount = 0

      for (const [index, rawDirectoryPath] of directoryPaths.entries()) {
        if (options.ensureBatchImportState(targetCategoryId).analyzeCancelled) {
          break
        }

        const directoryPath = String(rawDirectoryPath ?? '').trim()
        const directoryName = options.getResourceNameFromBasePath(directoryPath) || directoryPath || '未知目录'
        options.patchBatchImportState(targetCategoryId, {
          analyzeCurrent: index,
          analyzeMessage: `正在导入第 ${index + 1} / ${directoryPaths.length} 个番剧\n${directoryName}`
        })
        options.syncBatchImportOngoingCenter(targetCategoryId)

        if (!directoryPath || !options.validateBasePathExtension(directoryPath)) {
          skippedCount += 1
          continue
        }

        const existsResult = await window.api.service.checkResourceExistsByPath(directoryPath)
        if (existsResult?.exists) {
          skippedCount += 1
          continue
        }
        if (existsResult?.type === 'error') {
          failedCount += 1
          continue
        }

        const result = await window.api.service.saveResource(buildBatchAnimeResourcePayload(targetCategoryId, directoryPath) as any)
        if (result?.type === 'error') {
          failedCount += 1
        } else {
          successCount += 1
        }
      }

      options.patchBatchImportState(targetCategoryId, {
        analyzeCurrent: directoryPaths.length,
        analyzeMessage: '番剧批量导入完成'
      })

      const stopped = options.ensureBatchImportState(targetCategoryId).analyzeCancelled
      const notifyType = failedCount > 0 && successCount === 0 ? 'error' : stopped ? 'warning' : 'success'
      options.showNotifyByType(
        notifyType,
        '批量导入番剧',
        `${stopped ? '已停止，' : ''}导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`
      )

      if (successCount > 0 && targetCategoryId === String(options.categoryId.value ?? '').trim()) {
        await options.fetchData()
      }
    } catch (error) {
      options.showNotifyByType('error', '批量导入番剧', error instanceof Error ? error.message : '批量导入番剧失败')
    } finally {
      options.patchBatchImportState(targetCategoryId, {
        importRunning: false,
        showLoading: false,
        analyzeInBackground: false,
        analyzeToastDismissed: false
      })
      options.clearBatchImportOngoingCenter(targetCategoryId)
    }
  }

  const buildBatchAudioResourcePayload = (targetCategoryId: string, filePath: string, analysis: any, coverPath: string, lyricsPath: string) => {
    const authorNames = options.normalizeAudioAuthorList([
      ...(Array.isArray(analysis?.artists) ? analysis.artists : []),
      String(analysis?.artist ?? '').trim()
    ])
    const artistDisplayName = options.joinAudioAuthorNames(authorNames) || String(analysis?.artist ?? '').trim()
    const fileStem = options.getFileNameWithoutExtension(filePath)
    const audioMetaBase = createEmptyMetaByType('audio_meta') as Record<string, unknown>

    return {
      name: String(analysis?.name ?? '').trim() || fileStem || options.getFileName(filePath),
      description: '',
      coverPath: String(coverPath ?? '').trim(),
      basePath: String(filePath ?? '').trim(),
      author: artistDisplayName,
      authors: authorNames,
      actors: [],
      tags: [],
      types: [],
      categoryId: targetCategoryId,
      meta: {
        ...audioMetaBase,
        artist: artistDisplayName,
        album: String(analysis?.album ?? '').trim(),
        lyricsPath: String(lyricsPath ?? '').trim(),
        duration: Number.isFinite(Number(analysis?.duration)) ? Math.max(0, Math.floor(Number(analysis.duration))) : 0,
        bitrate: Number.isFinite(Number(analysis?.bitrate)) ? Number(analysis.bitrate) : null,
        sampleRate: Number.isFinite(Number(analysis?.sampleRate)) ? Number(analysis.sampleRate) : null
      }
    }
  }

  const runBatchImportAudioAssetBackfill = async (targetCategoryId: string, tasks: Array<{
    resourceId: string
    filePath: string
    analysis: any
    shouldFetchLyrics: boolean
    shouldFetchCover: boolean
  }>) => {
    if (!tasks.length) {
      return { fetchedLyricsCount: 0, fetchedCoverCount: 0, failedLyricsCount: 0, failedCoverCount: 0 }
    }

    let fetchedLyricsCount = 0
    let fetchedCoverCount = 0
    let failedLyricsCount = 0
    let failedCoverCount = 0

    for (const task of tasks) {
      const resourceId = String(task?.resourceId ?? '').trim()
      const filePath = String(task?.filePath ?? '').trim()
      const analysis = task?.analysis
      if (!resourceId || !filePath) {
        continue
      }

      try {
        const detailResult = await window.api.service.getResourceDetail(resourceId)
        const detail = detailResult?.data
        if (!detail) {
          options.logger.warn('batch import audio: backfill skipped missing detail', { resourceId, filePath })
          continue
        }

        const detailFormData = options.cloneFormData(options.mapResourceDetailToFormData(detail))
        let hasChanges = false

        if (task.shouldFetchLyrics && !String(detailFormData?.meta?.lyricsPath ?? '').trim()) {
          const lyricsResult = await options.fetchAudioLyricsSilently(options.buildAudioFetchPayload(filePath, analysis))
          options.logger.info('batch import audio: async fetch lyrics result', { resourceId, filePath, lyricsResult })
          if (lyricsResult?.type === 'success' && lyricsResult?.data?.lyricsPath) {
            detailFormData.meta = {
              ...(detailFormData.meta ?? {}),
              lyricsPath: String(lyricsResult.data.lyricsPath)
            }
            fetchedLyricsCount += 1
            hasChanges = true
          } else if (lyricsResult?.type === 'error') {
            failedLyricsCount += 1
          }
        }

        if (task.shouldFetchCover && !String(detailFormData?.coverPath ?? '').trim()) {
          const coverResult = await options.fetchAudioAlbumCoverSilently(options.buildAudioFetchPayload(filePath, analysis))
          options.logger.info('batch import audio: async fetch cover result', { resourceId, filePath, coverResult })
          if (coverResult?.type === 'success' && coverResult?.data?.coverPath) {
            detailFormData.coverPath = String(coverResult.data.coverPath)
            fetchedCoverCount += 1
            hasChanges = true
          } else if (coverResult?.type === 'error') {
            failedCoverCount += 1
          }
        }

        if (!hasChanges) {
          continue
        }

        options.syncAudioAuthorFields(detailFormData)
        detailFormData.categoryId = targetCategoryId
        const updatePayload = options.cloneFormData(detailFormData)
        const updateResult = await window.api.service.updateResource(resourceId, updatePayload, { silent: true })
        options.logger.info('batch import audio: async update result', { resourceId, filePath, updateResult })
        if (updateResult?.type === 'error') {
          if (String(updatePayload?.meta?.lyricsPath ?? '').trim()) {
            failedLyricsCount += 1
          }
          if (String(updatePayload?.coverPath ?? '').trim()) {
            failedCoverCount += 1
          }
        }
      } catch (error) {
        options.logger.error('batch import audio: async asset backfill failed', {
          resourceId,
          filePath,
          error: error instanceof Error ? error.message : error
        })
        if (task.shouldFetchLyrics) {
          failedLyricsCount += 1
        }
        if (task.shouldFetchCover) {
          failedCoverCount += 1
        }
      }
    }

    return { fetchedLyricsCount, fetchedCoverCount, failedLyricsCount, failedCoverCount }
  }

  const handleBatchImportAudioFiles = async () => {
    try {
      const targetCategoryId = String(options.categoryId.value ?? '').trim()
      const extensions = [...(options.categorySettings.value.extensions ?? [])]
      options.logger.info('batch import audio: selecting files', { categoryId: targetCategoryId, extensions })
      const filePaths = await window.api.dialog.selectFiles(extensions)
      if (!Array.isArray(filePaths) || !filePaths.length) {
        options.logger.info('batch import audio: selection cancelled')
        return
      }

      options.logger.info('batch import audio: selected files', { count: filePaths.length, filePaths })
      const analyses = await Promise.all(filePaths.map(async (filePath) => ({
        filePath: String(filePath ?? '').trim(),
        analysis: await window.api.service.analyzeAudioFilePath(String(filePath ?? '').trim())
      })))

      const validItems = analyses.filter((item) => item.filePath && item.analysis)
      const invalidItems = analyses.filter((item) => !item.filePath || !item.analysis).map((item) => item.filePath)
      options.logger.info('batch import audio: analyses completed', {
        selectedCount: filePaths.length,
        validCount: validItems.length,
        invalidCount: invalidItems.length,
        invalidItems
      })

      const missingLyricsCount = validItems.filter((item) => !String(item.analysis?.lyricsPath ?? '').trim()).length
      const missingCoverCount = validItems.filter((item) => !String(item.analysis?.embeddedCoverPath ?? '').trim()).length
      const shouldFetchLyrics = missingLyricsCount > 0
        ? await options.confirmDialog('批量获取歌词', `有 ${missingLyricsCount} 首音乐未匹配到同名歌词文件，是否尝试自动获取歌词？`)
        : false
      const shouldFetchCover = missingCoverCount > 0
        ? await options.confirmDialog('批量获取封面', `有 ${missingCoverCount} 首音乐未检测到文件内嵌封面，是否尝试自动获取专辑封面？`)
        : false

      options.logger.info('batch import audio: fetch strategy decided', {
        missingLyricsCount,
        missingCoverCount,
        shouldFetchLyrics,
        shouldFetchCover
      })

      let successCount = 0
      let skippedCount = 0
      let failedCount = 0
      const backgroundAssetTasks: Array<{
        resourceId: string
        filePath: string
        analysis: any
        shouldFetchLyrics: boolean
        shouldFetchCover: boolean
      }> = []

      for (const item of validItems) {
        const filePath = item.filePath
        const analysis = item.analysis
        options.logger.info('batch import audio: processing item start', {
          filePath,
          title: String(analysis?.name ?? '').trim(),
          artist: String(analysis?.artist ?? '').trim(),
          album: String(analysis?.album ?? '').trim(),
          lyricsPath: String(analysis?.lyricsPath ?? '').trim(),
          embeddedCoverPath: String(analysis?.embeddedCoverPath ?? '').trim()
        })

        const existsResult = await window.api.service.checkResourceExistsByPath(filePath)
        options.logger.info('batch import audio: exists check result', { filePath, existsResult })
        if (existsResult?.exists) {
          skippedCount += 1
          options.logger.info('batch import audio: skipped existing resource', { filePath })
          continue
        }
        if (existsResult?.type === 'error') {
          failedCount += 1
          options.logger.error('batch import audio: exists check failed', { filePath, existsResult })
          continue
        }

        const lyricsPath = String(analysis?.lyricsPath ?? '').trim()
        const coverPath = String(analysis?.embeddedCoverPath ?? '').trim()
        const payload = buildBatchAudioResourcePayload(targetCategoryId, filePath, analysis, coverPath, lyricsPath)
        options.logger.info('batch import audio: save payload prepared', {
          filePath,
          payload: {
            name: payload.name,
            basePath: payload.basePath,
            author: payload.author,
            authors: payload.authors,
            coverPath: payload.coverPath,
            categoryId: payload.categoryId,
            meta: payload.meta
          }
        })

        const result = await window.api.service.saveResource(payload as any)
        options.logger.info('batch import audio: save result', { filePath, result })
        if (result?.type === 'error') {
          failedCount += 1
          options.logger.error('batch import audio: save failed', { filePath, result })
        } else {
          successCount += 1
          const savedResourceId = String(result?.data?.resourceId ?? '').trim()
          const needsLyricsBackfill = !lyricsPath && shouldFetchLyrics
          const needsCoverBackfill = !coverPath && shouldFetchCover
          if (savedResourceId && (needsLyricsBackfill || needsCoverBackfill)) {
            backgroundAssetTasks.push({
              resourceId: savedResourceId,
              filePath,
              analysis,
              shouldFetchLyrics: needsLyricsBackfill,
              shouldFetchCover: needsCoverBackfill
            })
            options.logger.info('batch import audio: queued async asset backfill', {
              resourceId: savedResourceId,
              filePath,
              needsLyricsBackfill,
              needsCoverBackfill
            })
          }
        }
      }

      options.logger.info('batch import audio: finished', {
        successCount,
        skippedCount,
        failedCount,
        queuedBackfillCount: backgroundAssetTasks.length
      })

      if (successCount > 0 && targetCategoryId === String(options.categoryId.value ?? '').trim()) {
        await options.fetchData()
      }

      const notifyType = failedCount > 0 && successCount === 0 ? 'error' : 'success'
      options.showNotifyByType(
        notifyType,
        '批量导入音乐',
        backgroundAssetTasks.length
          ? `导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}。歌词与封面正在后台获取。`
          : `导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`
      )

      if (backgroundAssetTasks.length) {
        void (async () => {
          const backfillResult = await runBatchImportAudioAssetBackfill(targetCategoryId, backgroundAssetTasks)
          options.logger.info('batch import audio: async asset backfill finished', backfillResult)
          if (
            (backfillResult.fetchedLyricsCount > 0 || backfillResult.fetchedCoverCount > 0)
            && targetCategoryId === String(options.categoryId.value ?? '').trim()
          ) {
            await options.fetchData()
          }
          options.showNotifyByType(
            backfillResult.failedLyricsCount > 0 || backfillResult.failedCoverCount > 0 ? 'warning' : 'success',
            '批量获取音乐资源',
            `后台处理完成：获取歌词 ${backfillResult.fetchedLyricsCount}，获取封面 ${backfillResult.fetchedCoverCount}${backfillResult.failedLyricsCount > 0 ? `，歌词失败 ${backfillResult.failedLyricsCount}` : ''}${backfillResult.failedCoverCount > 0 ? `，封面失败 ${backfillResult.failedCoverCount}` : ''}`
          )
        })()
      }
    } catch (error) {
      options.logger.error('batch import audio: fatal error', error)
      options.showNotifyByType('error', '批量导入音乐', error instanceof Error ? error.message : '批量导入音乐失败')
    }
  }

  return {
    handleBatchImportComics,
    handleBatchImportAsmrs,
    handleBatchImportImages,
    handleBatchImportWebsiteBookmarkFile,
    handleBatchImportWebsiteBrowserSource,
    handleBatchImportNovelFiles,
    handleBatchImportVideoFiles,
    handleBatchImportAnimeDirectories,
    handleBatchImportAudioFiles
  }
}
