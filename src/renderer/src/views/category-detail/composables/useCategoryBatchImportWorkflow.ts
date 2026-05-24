import type { ComputedRef, Ref } from 'vue'
import { createBatchImportItemEnricher } from './batch-import-helpers'

type BatchImportMode = 'game' | 'manga' | 'asmr' | 'website'

function formatDebugPayload(payload: Record<string, any>) {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

interface UseCategoryBatchImportWorkflowOptions {
  categoryId: Ref<string>
  currentPage: Ref<number>
  resourceList: Ref<any[]>
  totalResources: Ref<number>
  categorySettings: ComputedRef<any>
  detailIsManga: ComputedRef<boolean>
  detailIsAsmr: ComputedRef<boolean>
  isSingleImageCategory: ComputedRef<boolean>
  isAudioCategory: ComputedRef<boolean>
  isNovelCategory: ComputedRef<boolean>
  isVideoCategory: ComputedRef<boolean>
  isVideoFolderCategory: ComputedRef<boolean>
  isWebsiteCategory: ComputedRef<boolean>
  batchImportItems: Ref<any[]>
  batchImportFetchInfoEnabled: Ref<boolean>
  isBatchImportSubmitting: Ref<boolean>
  batchProgressRunning: ComputedRef<boolean>
  ensureBatchImportState: (targetCategoryId: string) => any
  patchBatchImportState: (targetCategoryId: string, patch: Record<string, any>) => void
  syncBatchImportOngoingCenter: (targetCategoryId?: string) => void
  clearBatchImportOngoingCenter: (targetCategoryId?: string) => void
  handleBatchImportRunInBackground: () => void
  getResourceNameFromBasePath: (path: string) => string
  isBatchImportItemImportable: (item: any) => boolean
  showNotifyByType: (type: string, title: string, content: string) => void
  fetchData: () => Promise<void>
  resetCategoryListState: () => void
  logger: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  }
  handleBatchImportImages: () => Promise<void>
  handleBatchImportComics: () => Promise<void>
  handleBatchImportAsmrs: () => Promise<void>
  handleBatchImportAudioFiles: () => Promise<void>
  handleBatchImportNovelFiles: () => Promise<void>
  handleBatchImportVideoFiles: () => Promise<void>
  handleBatchImportAnimeDirectories: () => Promise<void>
  handleBatchImportWebsites: () => Promise<void>
  analyzeBatchImportComicDirectories?: never
  BATCH_ANALYZE_CONCURRENCY: number
}

const getBatchImportMode = (options: UseCategoryBatchImportWorkflowOptions): BatchImportMode => {
  if (options.detailIsManga.value) {
    return 'manga'
  }

  if (options.detailIsAsmr.value) {
    return 'asmr'
  }

  if (options.isWebsiteCategory.value) {
    return 'website'
  }

  return 'game'
}

const buildBatchImportResultKey = (item: any, mode: BatchImportMode) => {
  if (mode === 'website') {
    return String(item?.url ?? '').trim()
  }

  if (mode === 'manga' || mode === 'asmr') {
    return String(item?.directoryPath ?? '').trim()
  }

  return `${String(item?.directoryPath ?? '').trim()}::${String(item?.launchFilePath ?? '').trim()}`
}

export const useCategoryBatchImportWorkflow = (options: UseCategoryBatchImportWorkflowOptions) => {
  const enrichBatchImportItem = createBatchImportItemEnricher(options.detailIsManga, options.detailIsAsmr)

  const hasImportedMangaAppeared = (directoryPaths: string[]) => {
    const expectedPaths = new Set(
      (directoryPaths ?? [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    )
    if (!expectedPaths.size) {
      return true
    }

    const actualPaths = new Set(
      (options.resourceList.value ?? [])
        .map((item: any) => String(item?.basePath ?? '').trim())
        .filter(Boolean)
    )

    for (const expectedPath of expectedPaths) {
      if (actualPaths.has(expectedPath)) {
        return true
      }
    }

    return false
  }

  const analyzeBatchImportDirectories = async (targetCategoryId: string, directoryPaths: string[]) => {
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
        analyzeMessage: `正在分析第 ${currentIndex} / ${directoryPaths.length} 个目录\n${currentDirectoryName}`
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
          const analysis = await window.api.service.analyzeGameDirectory(directoryPath)
          items[currentIndex] = await enrichBatchImportItem({
            ...analysis,
            checked: !analysis?.exists && !analysis?.errorMessage && !!analysis?.launchFilePath
          })
        } catch (error) {
          items[currentIndex] = {
            directoryPath,
            directoryName,
            launchFilePath: '',
            launchFileName: '',
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

  const canToggleBatchImportItem = (item: any) =>
    !item?.exists && !item?.errorMessage && options.isBatchImportItemImportable(item)

  const handleBatchImportClick = () => {
    void (async () => {
      const targetCategoryId = String(options.categoryId.value ?? '').trim()

      if (options.isSingleImageCategory.value) {
        await options.handleBatchImportImages()
        return
      }

      if (options.detailIsManga.value) {
        await options.handleBatchImportComics()
        return
      }

      if (options.detailIsAsmr.value) {
        await options.handleBatchImportAsmrs()
        return
      }

      if (options.isAudioCategory.value) {
        await options.handleBatchImportAudioFiles()
        return
      }

      if (options.isNovelCategory.value) {
        await options.handleBatchImportNovelFiles()
        return
      }

      if (options.isVideoCategory.value && String(options.categorySettings.value.resourcePathType ?? '') === 'file') {
        await options.handleBatchImportVideoFiles()
        return
      }

      if (options.isVideoFolderCategory.value) {
        await options.handleBatchImportAnimeDirectories()
        return
      }

      if (options.isWebsiteCategory.value) {
        await options.handleBatchImportWebsites()
        return
      }

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
          analyzeMessage: '正在分析游戏启动文件，请稍候...',
          analyzeCancelled: false,
          analyzeInBackground: false,
          analyzeToastDismissed: false,
          analyzeRunning: true,
          importRunning: false,
          showLoading: true,
          showPreview: false
        })
        options.syncBatchImportOngoingCenter(targetCategoryId)

        const items = await analyzeBatchImportDirectories(targetCategoryId, directoryPaths)

        options.patchBatchImportState(targetCategoryId, {
          items,
          showPreview: items.length > 0,
          showLoading: false
        })

        if (!items.length && options.ensureBatchImportState(targetCategoryId).analyzeCancelled) {
          options.showNotifyByType('info', '批量导入', '已停止分析')
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
    })()
  }

  const handleBatchImportMaskClick = () => {
    if (!options.batchProgressRunning.value) {
      return
    }

    options.handleBatchImportRunInBackground()
  }

  const handleSelectBatchLaunchFile = (index: number) => {
    void (async () => {
      const item = options.batchImportItems.value[index]
      if (!item?.directoryPath) {
        return
      }

      try {
        const selectedFilePath = await window.api.dialog.selectGameLaunchFile(item.directoryPath)
        if (!selectedFilePath) {
          return
        }

        const analysis = await window.api.service.analyzeGameDirectory(item.directoryPath, selectedFilePath)
        options.batchImportItems.value[index] = await enrichBatchImportItem({
          ...analysis,
          checked: !analysis?.exists && !analysis?.errorMessage && !!analysis?.launchFilePath
        })
      } catch (error) {
        options.showNotifyByType('error', '批量导入', error instanceof Error ? error.message : '手动选择启动文件失败')
      }
    })()
  }

  const handleBatchImportSelectAll = () => {
    options.batchImportItems.value = options.batchImportItems.value.map((item) => ({
      ...item,
      checked: !item.exists && !item.errorMessage && options.isBatchImportItemImportable(item)
    }))
  }

  const handleBatchImportDeselectAll = () => {
    options.batchImportItems.value = options.batchImportItems.value.map((item) => ({
      ...item,
      checked: false
    }))
  }

  const handleBatchImportInvert = () => {
    options.batchImportItems.value = options.batchImportItems.value.map((item) => ({
      ...item,
      checked: !item.exists && !item.errorMessage && options.isBatchImportItemImportable(item)
        ? !item.checked
        : false
    }))
  }

  const handleToggleBatchImportItem = (index: number) => {
    const item = options.batchImportItems.value[index]
    if (!canToggleBatchImportItem(item)) {
      return
    }

    options.batchImportItems.value[index].checked = !options.batchImportItems.value[index].checked
  }

  const handleConfirmBatchImport = () => {
    void (async () => {
      const targetCategoryId = options.categoryId.value
      const mode = getBatchImportMode(options)
      const selectedItems = options.batchImportItems.value
        .filter((item) => item.checked && options.isBatchImportItemImportable(item))
        .map((item) => {
          if (mode === 'manga') {
            return {
              directoryPath: item.directoryPath,
              fetchInfoEnabled: options.batchImportFetchInfoEnabled.value
            }
          }

          if (mode === 'asmr') {
            return {
              directoryPath: item.directoryPath,
              websiteType: item.websiteType,
              gameId: item.gameId,
              fetchInfoEnabled: options.batchImportFetchInfoEnabled.value
            }
          }

          if (mode === 'website') {
            return {
              title: item.title,
              url: item.url,
              favicon: item.favicon,
              folder: item.folder,
              source: item.source,
              fetchInfoEnabled: options.batchImportFetchInfoEnabled.value
            }
          }

          return {
            directoryPath: item.directoryPath,
            launchFilePath: item.launchFilePath,
            websiteType: item.websiteType,
            gameId: item.gameId,
            fetchInfoEnabled: options.batchImportFetchInfoEnabled.value
          }
        })

      if (!selectedItems.length) {
        options.showNotifyByType('warning', '批量导入', `请至少选择一个可导入的${mode === 'website' ? '网站' : '目录'}`)
        return
      }

      try {
        options.isBatchImportSubmitting.value = true
        options.patchBatchImportState(targetCategoryId, {
          importRunning: true,
          showLoading: true,
          showPreview: false,
          analyzeTotal: selectedItems.length,
          analyzeCurrent: 0,
          analyzeMessage: '正在准备导入，请稍候...',
          analyzeInBackground: false,
          analyzeToastDismissed: false
        })
        options.syncBatchImportOngoingCenter(targetCategoryId)

        const result = mode === 'manga'
          ? await window.api.service.importBatchMultiImageDirectories(targetCategoryId, selectedItems)
          : mode === 'asmr'
            ? await window.api.service.importBatchAsmrDirectories(targetCategoryId, selectedItems)
            : mode === 'website'
              ? await window.api.service.importBatchWebsiteBookmarks(targetCategoryId, selectedItems)
              : await window.api.service.importBatchGameDirectories(targetCategoryId, selectedItems)
        const resultType = result?.type ?? 'info'
        const resultMessage = result?.message ?? '批量导入完成'
        const resultItems = Array.isArray(result?.data) ? result.data : []
        const hasSuccessfulImport = resultItems.some((item: any) => String(item?.type ?? '') === 'success')
        const successfulMangaDirectoryPaths = mode === 'manga'
          ? resultItems
            .filter((item: any) => String(item?.type ?? '') === 'success')
            .map((item: any) => String(item?.directoryPath ?? '').trim())
            .filter(Boolean)
          : []

        if (resultItems.length) {
          const resultMap = new Map<string, any>(
            resultItems.map((item: any) => [buildBatchImportResultKey(item, mode), item])
          )

          options.batchImportItems.value = options.batchImportItems.value.map((item) => {
            const matchedResult = resultMap.get(buildBatchImportResultKey(item, mode))

            if (!matchedResult) {
              return item
            }

            return {
              ...item,
              checked: false,
              exists: matchedResult.type === 'info' ? true : item.exists,
              importResultType: String(matchedResult.type ?? 'info'),
              importResultMessage: String(matchedResult.message ?? '处理完成')
            }
          })
        }

        options.showNotifyByType(resultType, '批量导入', resultMessage)

        if (resultType !== 'error') {
          options.patchBatchImportState(targetCategoryId, {
            items: [],
            showPreview: false
          })
          if (targetCategoryId === String(options.categoryId.value ?? '').trim()) {
            options.currentPage.value = 1
            await options.fetchData()
          }
          if (mode === 'manga' && hasSuccessfulImport && successfulMangaDirectoryPaths.length) {
            options.logger.info('manga batch import confirm result', formatDebugPayload({
              categoryId: targetCategoryId,
              successfulDirectoryPaths: successfulMangaDirectoryPaths,
              totalResourcesAfterFirstFetch: Number(options.totalResources.value ?? 0),
              resourceBasePathsAfterFirstFetch: (options.resourceList.value ?? [])
                .slice(0, 10)
                .map((item: any) => String(item?.basePath ?? '').trim())
            }))
            let retryCount = 0
            while (
              retryCount < 6
              && !hasImportedMangaAppeared(successfulMangaDirectoryPaths)
            ) {
              retryCount += 1
              await new Promise((resolve) => setTimeout(resolve, 250))
              if (targetCategoryId !== String(options.categoryId.value ?? '').trim()) {
                break
              }
              await options.fetchData()
              options.logger.info('manga batch import retry fetch', formatDebugPayload({
                categoryId: targetCategoryId,
                retryCount,
                totalResources: Number(options.totalResources.value ?? 0),
                resourceBasePaths: (options.resourceList.value ?? [])
                  .slice(0, 10)
                  .map((item: any) => String(item?.basePath ?? '').trim())
              }))
            }

            if (!hasImportedMangaAppeared(successfulMangaDirectoryPaths) && Number(options.totalResources.value ?? 0) === 0) {
              if (targetCategoryId === String(options.categoryId.value ?? '').trim()) {
                options.resetCategoryListState()
                options.currentPage.value = 1
                await options.fetchData()
              }
              options.logger.info('manga batch import fetch after resetCategoryListState', formatDebugPayload({
                categoryId: targetCategoryId,
                totalResources: Number(options.totalResources.value ?? 0),
                resourceBasePaths: (options.resourceList.value ?? [])
                  .slice(0, 10)
                  .map((item: any) => String(item?.basePath ?? '').trim())
              }))
            }
          }
        }
      } catch (error) {
        options.showNotifyByType('error', '批量导入', error instanceof Error ? error.message : '批量导入失败')
      } finally {
        options.isBatchImportSubmitting.value = false
        options.patchBatchImportState(targetCategoryId, {
          importRunning: false,
          showLoading: false,
          analyzeInBackground: false,
          analyzeToastDismissed: false
        })
        options.clearBatchImportOngoingCenter(targetCategoryId)
      }
    })()
  }

  return {
    enrichBatchImportItem,
    analyzeBatchImportDirectories,
    canToggleBatchImportItem,
    handleBatchImportClick,
    handleBatchImportMaskClick,
    handleSelectBatchLaunchFile,
    handleBatchImportSelectAll,
    handleBatchImportDeselectAll,
    handleBatchImportInvert,
    handleToggleBatchImportItem,
    handleConfirmBatchImport
  }
}
