import {DatabaseService} from './database.service'
import {FetchResourceInfoResult, ResourceForm, ResourceMeta} from "../model/models";
import {generateId} from "../util/id-generator"
import {DictType, ResourceLaunchMode, Settings, WEBSITE_DIRECT_DOWNLOAD_EXTENSIONS} from '../../common/constants'
import type { ResourceLaunchModeKey } from '../../common/constants'
import { BrowserWindow } from 'electron'
import path from 'path'
import sharp from "sharp";
import {db} from '../db'
import {ResourceWatcher} from "../watcher/resource.watcher";
import { buildResourceMarkerPayload, getMarkerDirectory, getMarkerFilePath, getMarkerFilePathCandidates } from '../util/resource-marker'
import { DialogService } from './dialog.service'
import { NotificationQueueService } from './notification-queue.service'
import { FetchPluginService } from './fetch-plugin.service'
import {createLogger} from '../util/logger'
import axios from 'axios'
import { WindowScreenshotService } from './window-screenshot.service'
import { detectGameEngineProfile } from '../util/game-engine-detector'
import { detectGameLaunchFile } from '../util/game-launch-file-detector'
import { analyzeNovelFile } from '../util/novel-file-analyzer'
import { parseFile } from 'music-metadata'
import { execFile } from 'child_process'
import crypto from 'crypto'

const fs = require('fs-extra')
const hidefile = require('hidefile')
const ffmpegPath = require('ffmpeg-static') as string | null
const ffprobeStatic = require('ffprobe-static') as { path?: string }
const VIDEO_COVER_FRAME_COUNT = 5
const MAX_COVER_PROCESS_PIXELS = 100_000_000
const VIDEO_FIXED_COVER_FRAME_TIMES = [
  { label: '1 分钟', time: 60 },
  { label: '5 分钟', time: 5 * 60 },
  { label: '10 分钟', time: 10 * 60 },
  { label: '20 分钟', time: 20 * 60 },
  { label: '30 分钟', time: 30 * 60 },
]
const WEBSITE_COVER_CAPTURE_WIDTH = 1440
const WEBSITE_COVER_CAPTURE_HEIGHT = 900
const WEBSITE_COVER_CAPTURE_TIMEOUT_MS = 20000
const WEBSITE_COVER_STABILIZE_DELAY_MS = 1800
const WEBSITE_DIRECT_DOWNLOAD_EXTENSION_SET = new Set(WEBSITE_DIRECT_DOWNLOAD_EXTENSIONS)

export class ResourceService {
  static readonly logger = createLogger('ResourceService')
  static normalizeVideoSubPath(targetPath: string) {
    return String(targetPath ?? '').replace(/\\/g, '/').trim()
  }

  static compareVideoSubText(left: string, right: string) {
    return String(left ?? '').localeCompare(String(right ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  }

  static getRelativeVideoSubPath(basePath: string, filePath: string) {
    const normalizedBasePath = ResourceService.normalizeVideoSubPath(basePath).replace(/\/+$/, '')
    const normalizedFilePath = ResourceService.normalizeVideoSubPath(filePath)

    if (!normalizedBasePath || !normalizedFilePath) {
      return normalizedFilePath
    }

    const normalizedBasePathLower = normalizedBasePath.toLowerCase()
    const normalizedFilePathLower = normalizedFilePath.toLowerCase()
    const basePrefix = `${normalizedBasePathLower}/`

    if (normalizedFilePathLower === normalizedBasePathLower) {
      return ''
    }

    if (!normalizedFilePathLower.startsWith(basePrefix)) {
      return normalizedFilePath
    }

    return normalizedFilePath.slice(normalizedBasePath.length + 1)
  }

  static isVideoFolderCategory(categoryInfo: any) {
    return getExtendTableName(categoryInfo) === 'video_meta'
      && String(categoryInfo?.meta?.extra?.resourcePathType ?? '').trim() === 'folder'
  }

  static isVirtualResourceCategory(categoryInfo: any) {
    return getExtendTableName(categoryInfo) === 'website_meta'
  }

  static collectVideoSubItems(nodes: any[], basePath: string) {
    const items: Array<{ fileName: string; relativePath: string }> = []

    const visit = (entries: any[]) => {
      for (const entry of entries) {
        if (!entry) {
          continue
        }

        if (entry.kind === 'video' && entry.path) {
          const relativePath = ResourceService.getRelativeVideoSubPath(basePath, String(entry.path))
          if (relativePath) {
            items.push({
              fileName: String(entry.label ?? path.basename(String(entry.path))),
              relativePath
            })
          }
        }

        if (Array.isArray(entry.children) && entry.children.length) {
          visit(entry.children)
        }
      }
    }

    visit(nodes)
    return items
  }

  static async buildVideoSubPayload(
    resourceId: string,
    basePath: string,
    existingItems: any[] = []
  ) {
    const tree = await DialogService.getDirectoryAudioTree(basePath)
    const scannedItems = ResourceService.collectVideoSubItems(tree, basePath)
    const scannedMap = new Map(
      scannedItems.map((item) => [ResourceService.normalizeVideoSubPath(item.relativePath).toLowerCase(), item] as const)
    )
    const preservedItems = [...existingItems]
      .filter((item) => scannedMap.has(ResourceService.normalizeVideoSubPath(String(item?.relativePath ?? '')).toLowerCase()))
      .sort((left, right) => {
        const sortCompare = Number(left?.sortOrder ?? 0) - Number(right?.sortOrder ?? 0)
        if (sortCompare !== 0) {
          return sortCompare
        }

        return ResourceService.compareVideoSubText(String(left?.fileName ?? ''), String(right?.fileName ?? ''))
      })

    const usedPaths = new Set<string>()
    const payload: Array<{
      id: string
      resourceId: string
      fileName: string
      relativePath: string
      coverPath: string | null
      sortOrder: number
      isVisible: boolean
    }> = []

    for (const existingItem of preservedItems) {
      const normalizedRelativePath = ResourceService.normalizeVideoSubPath(String(existingItem?.relativePath ?? '')).toLowerCase()
      const scannedItem = scannedMap.get(normalizedRelativePath)
      if (!scannedItem) {
        continue
      }

      usedPaths.add(normalizedRelativePath)
      const absoluteFilePath = path.join(basePath, scannedItem.relativePath)
      payload.push({
        id: String(existingItem?.id ?? generateId()),
        resourceId,
        fileName: scannedItem.fileName,
        relativePath: scannedItem.relativePath,
        coverPath: await ensureVideoSubCoverPath(
          resourceId,
          absoluteFilePath,
          scannedItem.relativePath,
          String(existingItem?.coverPath ?? '').trim()
        ),
        sortOrder: payload.length,
        isVisible: existingItem?.isVisible !== false
      })
    }

    for (const scannedItem of scannedItems) {
      const normalizedRelativePath = ResourceService.normalizeVideoSubPath(scannedItem.relativePath).toLowerCase()
      if (usedPaths.has(normalizedRelativePath)) {
        continue
      }

      usedPaths.add(normalizedRelativePath)
      const absoluteFilePath = path.join(basePath, scannedItem.relativePath)
      payload.push({
        id: generateId(),
        resourceId,
        fileName: scannedItem.fileName,
        relativePath: scannedItem.relativePath,
        coverPath: await ensureVideoSubCoverPath(resourceId, absoluteFilePath, scannedItem.relativePath),
        sortOrder: payload.length,
        isVisible: true
      })
    }

    return payload
  }

  static async syncVideoSubItems(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning' as const,
        message: '资源ID无效'
      }
    }

    const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!existingResource) {
      return {
        type: 'warning' as const,
        message: '资源不存在或已被删除'
      }
    }

    const categoryInfo = await DatabaseService.getCategoryById(String(existingResource.categoryId ?? '').trim())
    if (!ResourceService.isVideoFolderCategory(categoryInfo)) {
      return {
        type: 'success' as const,
        message: '当前资源无需同步番剧目录',
        data: []
      }
    }

    const basePath = String(existingResource.basePath ?? '').trim()
    if (!basePath) {
      return {
        type: 'warning' as const,
        message: '番剧目录路径无效'
      }
    }

    const existingItems = await DatabaseService.getVideoSubsByResourceId(normalizedResourceId)
    const nextItems = await ResourceService.buildVideoSubPayload(normalizedResourceId, basePath, existingItems)

    db.transaction((tx) => {
      DatabaseService.replaceVideoSubs(normalizedResourceId, nextItems, tx)
    })

    return {
      type: 'success' as const,
      message: '番剧目录同步成功',
      data: nextItems
    }
  }

  static async updateVideoSubItems(resourceId: string, items: any[]) {
    const syncResult = await ResourceService.syncVideoSubItems(resourceId)
    if (syncResult.type === 'warning') {
      return syncResult
    }

    const normalizedResourceId = String(resourceId ?? '').trim()
    const currentItems = Array.isArray(syncResult.data)
      ? syncResult.data
      : await DatabaseService.getVideoSubsByResourceId(normalizedResourceId)
    const currentItemMap = new Map(
      currentItems.map((item: any) => [ResourceService.normalizeVideoSubPath(String(item?.relativePath ?? '')).toLowerCase(), item] as const)
    )
    const submittedItems = Array.isArray(items) ? items : []
    const consumedPaths = new Set<string>()
    const nextItems: typeof currentItems = []

    for (const submittedItem of submittedItems) {
      const normalizedRelativePath = ResourceService.normalizeVideoSubPath(String(submittedItem?.relativePath ?? '')).toLowerCase()
      const currentItem = currentItemMap.get(normalizedRelativePath)
      if (!currentItem || consumedPaths.has(normalizedRelativePath)) {
        continue
      }

      consumedPaths.add(normalizedRelativePath)
      nextItems.push({
        ...currentItem,
        sortOrder: nextItems.length,
        isVisible: submittedItem?.isVisible !== false
      })
    }

    for (const currentItem of currentItems) {
      const normalizedRelativePath = ResourceService.normalizeVideoSubPath(String(currentItem?.relativePath ?? '')).toLowerCase()
      if (consumedPaths.has(normalizedRelativePath)) {
        continue
      }

      consumedPaths.add(normalizedRelativePath)
      nextItems.push({
        ...currentItem,
        sortOrder: nextItems.length
      })
    }

    db.transaction((tx) => {
      DatabaseService.replaceVideoSubs(normalizedResourceId, nextItems, tx)
    })

      return {
        type: 'success' as const,
        message: '番剧顺序已更新',
        data: nextItems
      }
    }

  static async extractVideoSubCoverFrames(basePath: string) {
      const normalizedBasePath = path.normalize(String(basePath ?? '').trim())

      if (!normalizedBasePath) {
        return {
          type: 'warning',
          message: '请先选择番剧目录',
        }
      }

      try {
        const exists = await fs.pathExists(normalizedBasePath)
        if (!exists) {
          return {
            type: 'warning',
            message: '番剧目录不存在',
            data: {
              items: []
            }
          }
        }

        const directoryTree = await DialogService.getDirectoryAudioTree(normalizedBasePath)
        const scannedItems = ResourceService.collectVideoSubItems(directoryTree, normalizedBasePath)
        if (!scannedItems.length) {
          return {
            type: 'warning',
            message: '目录中未找到可用的视频文件',
            data: {
              items: []
            }
          }
        }

        const items = await Promise.all(scannedItems.map(async (item) => {
          const videoPath = path.join(normalizedBasePath, item.relativePath)
          try {
            const coverCandidates = await extractRandomVideoSubCoverFrameCandidates(videoPath, item.relativePath, 3)
            return {
              fileName: item.fileName,
              relativePath: item.relativePath,
              coverCandidates
            }
          } catch (error) {
            ResourceService.logger.warn('extractVideoSubCoverFrames candidate failed', {
              basePath: normalizedBasePath,
              relativePath: item.relativePath,
              error: error instanceof Error ? error.message : String(error)
            })
            return {
              fileName: item.fileName,
              relativePath: item.relativePath,
              coverCandidates: []
            }
          }
        }))

        return {
          type: 'success',
          message: '已生成番剧分集随机帧候选',
          data: {
            items
          }
        }
      } catch (error) {
        ResourceService.logger.error('extractVideoSubCoverFrames', error)
        return {
          type: 'error',
          message: error instanceof Error ? error.message : '生成番剧分集随机帧失败',
          data: {
            items: []
          }
        }
      }
    }

  static async detectGameEngine(basePath: string, resourceId?: string | null) {
    const normalizedBasePath = String(basePath ?? '').trim()
    const normalizedResourceId = String(resourceId ?? '').trim()

    if (!normalizedBasePath) {
      return {
        type: 'warning',
        message: '请先选择游戏路径'
      }
    }

    try {
      const engineProfile = await detectGameEngineProfile(normalizedBasePath)
      const engineName = engineProfile.engineName
      if (!engineName) {
        return {
          type: 'warning',
          message: '未检测到游戏引擎'
        }
      }

      const engineOptions = await DatabaseService.getSelectDictData(DictType.GAME_ENGINE_TYPE)
      const matchedOption = engineOptions.find((item: any) => String(item?.label ?? '').trim().toLowerCase() === engineName.trim().toLowerCase())

      if (!matchedOption) {
        return {
          type: 'warning',
          message: `检测到引擎“${engineName}”，但未在引擎字典中找到对应项`,
          data: {
            engineName,
            mtoolSupported: engineProfile.mtoolSupported,
            mtoolHookFiles: engineProfile.mtoolHookFiles,
            requiresLocaleEmulator: engineProfile.requiresLocaleEmulator,
            localeEmulatorReason: engineProfile.localeEmulatorReason
          }
        }
      }

      const detectedEngineId = String(matchedOption.value ?? '').trim()

      if (normalizedResourceId && detectedEngineId) {
        await this.persistDetectedEngineIfMissing(normalizedResourceId, detectedEngineId)
      }

      return {
        type: 'success',
        message: `已检测到游戏引擎：${engineName}`,
        data: {
          engineId: detectedEngineId,
          engineName: matchedOption.label,
          mtoolSupported: engineProfile.mtoolSupported,
          mtoolHookFiles: engineProfile.mtoolHookFiles,
          requiresLocaleEmulator: engineProfile.requiresLocaleEmulator,
          localeEmulatorReason: engineProfile.localeEmulatorReason
        }
      }
    } catch (error) {
      ResourceService.logger.error('detectGameEngine', error)
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '检测游戏引擎失败'
      }
    }
  }

  static async detectGameLaunchFile(basePath: string) {
    const normalizedBasePath = String(basePath ?? '').trim()
    if (!normalizedBasePath) {
      return {
        type: 'warning',
        message: '请先提供游戏目录'
      }
    }

    try {
      const launchFilePath = await detectGameLaunchFile(normalizedBasePath)
      if (!launchFilePath) {
        return {
          type: 'warning',
          message: '未找到可用的游戏启动文件'
        }
      }

      return {
        type: 'success',
        message: '已定位到游戏启动文件',
        data: {
          launchFilePath
        }
      }
    } catch (error) {
      ResourceService.logger.error('detectGameLaunchFile', error)
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '分析游戏启动文件失败'
      }
    }
  }

  static async analyzeGameDirectory(directoryPath: string, launchFilePath?: string) {
    const normalizedDirectoryPath = path.normalize(String(directoryPath ?? '').trim())
    if (!normalizedDirectoryPath) {
      return {
        directoryPath: '',
        directoryName: '',
        launchFilePath: '',
        exists: false,
        errorMessage: '目录不能为空'
      }
    }

    const targetLaunchFilePath = launchFilePath
      ? path.normalize(String(launchFilePath).trim())
      : await detectGameLaunchFile(normalizedDirectoryPath)

    if (!targetLaunchFilePath) {
      return {
        directoryPath: normalizedDirectoryPath,
        directoryName: path.basename(normalizedDirectoryPath),
        launchFilePath: '',
        exists: false,
        errorMessage: '未找到可用的启动文件'
      }
    }

    // These checks are independent. Parallelizing them reduces single-directory
    // latency, which matters a lot during batch import analysis.
    const [existingResource, gamePathAnalysis, engineAnalysis] = await Promise.all([
      (async () => {
        const pathDealResult = await dealPath(targetLaunchFilePath)
        return DatabaseService.getResourceByStoragePath(
          pathDealResult.basePath,
          pathDealResult.fileName
        )
      })(),
      ResourceService.analyzeGamePath(targetLaunchFilePath),
      ResourceService.detectGameEngine(targetLaunchFilePath)
    ])

    return {
      directoryPath: normalizedDirectoryPath,
      directoryName: path.basename(normalizedDirectoryPath),
      launchFilePath: targetLaunchFilePath,
      launchFileName: path.basename(targetLaunchFilePath),
      exists: Boolean(existingResource),
      existingResourceTitle: existingResource?.title ?? '',
      gameId: String(gamePathAnalysis?.gameId ?? ''),
      websiteType: String(gamePathAnalysis?.websiteType ?? ''),
      engineId: String(engineAnalysis?.data?.engineId ?? ''),
      engineName: String(engineAnalysis?.data?.engineName ?? ''),
      errorMessage: ''
    }
  }

  static async analyzeMultiImageDirectory(directoryPath: string) {
    const normalizedDirectoryPath = path.normalize(String(directoryPath ?? '').trim())
    if (!normalizedDirectoryPath) {
      return {
        type: 'warning',
        message: '目录不能为空',
        data: {
          directoryName: '',
          coverPath: '',
          imageCount: 0,
        }
      }
    }

    try {
      const exists = await fs.pathExists(normalizedDirectoryPath)
      if (!exists) {
        return {
          type: 'warning',
          message: '目录不存在',
          data: {
            directoryName: path.basename(normalizedDirectoryPath),
            coverPath: '',
            imageCount: 0,
          }
        }
      }

      const directoryStat = await fs.stat(normalizedDirectoryPath)
      if (!directoryStat.isDirectory()) {
        return {
          type: 'warning',
          message: '当前路径不是目录',
          data: {
            directoryName: path.basename(normalizedDirectoryPath),
            coverPath: '',
            imageCount: 0,
          }
        }
      }

      const existingResource = await DatabaseService.getResourceByStoragePath(normalizedDirectoryPath, null)
      const imagePaths = await getDirectoryImageFiles(normalizedDirectoryPath)
      const coverPath = pickMultiImageCoverPath(normalizedDirectoryPath, imagePaths)

      return {
        type: 'success',
        message: coverPath ? '已分析漫画目录' : '目录中未找到可用图片',
        data: {
          directoryName: path.basename(normalizedDirectoryPath),
          exists: Boolean(existingResource),
          existingResourceTitle: String(existingResource?.title ?? ''),
          directoryPath: normalizedDirectoryPath,
          coverPath,
          imageCount: imagePaths.length,
        }
      }
    } catch (error) {
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '分析漫画目录失败',
        data: {
          directoryName: path.basename(normalizedDirectoryPath),
          coverPath: '',
          imageCount: 0,
        }
      }
    }
  }

  static async analyzeAsmrDirectory(directoryPath: string) {
    const normalizedDirectoryPath = path.normalize(String(directoryPath ?? '').trim())
    if (!normalizedDirectoryPath) {
      return {
        type: 'warning',
        message: '目录不能为空',
        data: {
          directoryPath: '',
          directoryName: '',
          coverPath: '',
          audioCount: 0,
          gameId: '',
          websiteType: ''
        }
      }
    }

    try {
      const exists = await fs.pathExists(normalizedDirectoryPath)
      if (!exists) {
        return {
          type: 'warning',
          message: '目录不存在',
          data: {
            directoryPath: normalizedDirectoryPath,
            directoryName: path.basename(normalizedDirectoryPath),
            coverPath: '',
            audioCount: 0,
            gameId: '',
            websiteType: ''
          }
        }
      }

      const directoryStat = await fs.stat(normalizedDirectoryPath)
      if (!directoryStat.isDirectory()) {
        return {
          type: 'warning',
          message: '当前路径不是目录',
          data: {
            directoryPath: normalizedDirectoryPath,
            directoryName: path.basename(normalizedDirectoryPath),
            coverPath: '',
            audioCount: 0,
            gameId: '',
            websiteType: ''
          }
        }
      }

      const existingResource = await DatabaseService.getResourceByStoragePath(normalizedDirectoryPath, null)
      const audioPaths = await getDirectoryAudioFiles(normalizedDirectoryPath)
      const imagePaths = await getDirectoryImageFiles(normalizedDirectoryPath)
      const coverPath = pickMultiImageCoverPath(normalizedDirectoryPath, imagePaths)
      const matchedGameId = await findGameIdInDirectory(normalizedDirectoryPath, normalizedDirectoryPath)
      const websiteType = await resolveWebsiteTypeByGameId(matchedGameId, DictType.ASMR_SITE_TYPE)

      return {
        type: 'success',
        message: audioPaths.length ? '已分析音声目录' : '目录中未找到可用音频文件',
        data: {
          directoryPath: normalizedDirectoryPath,
          directoryName: path.basename(normalizedDirectoryPath),
          coverPath,
          audioCount: audioPaths.length,
          exists: Boolean(existingResource),
          existingResourceTitle: String(existingResource?.title ?? ''),
          gameId: matchedGameId,
          websiteType
        }
      }
    } catch (error) {
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '分析音声目录失败',
        data: {
          directoryPath: normalizedDirectoryPath,
          directoryName: path.basename(normalizedDirectoryPath),
          coverPath: '',
          audioCount: 0,
          gameId: '',
          websiteType: ''
        }
      }
    }
  }

  static async importBatchGameDirectories(categoryId: string, items: Array<{
    directoryPath: string
    launchFilePath: string
    websiteType?: string
    gameId?: string
    fetchInfoEnabled?: boolean
  }>) {
    const results: Array<{ directoryPath: string; launchFilePath: string; type: string; message: string }> = []
    const total = Array.isArray(items) ? items.length : 0
    let completed = 0

    const pushImportProgress = (directoryPath: string, done = false) => {
      NotificationQueueService.getInstance().pushBatchImportProgress({
        categoryId,
        stage: 'import',
        current: completed,
        total,
        message: directoryPath,
        done
      })
    }

    for (const item of items ?? []) {
      const launchFilePath = String(item?.launchFilePath ?? '').trim()
      const directoryPath = String(item?.directoryPath ?? '').trim()

      if (!launchFilePath) {
        results.push({
          directoryPath,
          launchFilePath,
          type: 'warning',
          message: '未提供启动文件'
        })
        completed += 1
        pushImportProgress(directoryPath)
        continue
      }

      const analysis = await ResourceService.analyzeGameDirectory(directoryPath, launchFilePath)
      if (analysis.exists) {
        results.push({
          directoryPath,
          launchFilePath,
          type: 'info',
          message: analysis.existingResourceTitle ? `已存在：${analysis.existingResourceTitle}` : '该资源已存在'
        })
        completed += 1
        pushImportProgress(directoryPath)
        continue
      }

      const websiteType = String(item?.websiteType ?? analysis.websiteType ?? '').trim()
      const gameId = String(item?.gameId ?? analysis.gameId ?? '').trim()
      const fetchInfoEnabled = item?.fetchInfoEnabled !== false
      let fetchedData: any = null

      if (fetchInfoEnabled && websiteType && gameId) {
        const fetchResult = await ResourceService.fetchResourceInfo(websiteType, gameId)
        ResourceService.logger.info('importBatchGameDirectories fetchResourceInfo', {
          directoryPath,
          launchFilePath,
          websiteType,
          gameId,
          type: fetchResult?.type ?? '',
          message: fetchResult?.message ?? ''
        })

        if (fetchResult?.type === 'success' || fetchResult?.type === 'warning') {
          fetchedData = fetchResult?.data ?? null
        }
      }

      const saveResult = await ResourceService.saveResource({
        author: String(fetchedData?.author ?? '').trim(),
        actors: [],
        basePath: launchFilePath,
        categoryId,
        coverPath: String(fetchedData?.cover ?? '').trim(),
        description: '',
        name: String(fetchedData?.name || analysis.directoryName || path.basename(directoryPath || launchFilePath)),
        tags: Array.isArray(fetchedData?.tag) ? fetchedData.tag : [],
        types: Array.isArray(fetchedData?.type) ? fetchedData.type : [],
        meta: {
          additionalStores: [],
          commandLineArgs: '',
          engine: String(analysis.engineId ?? ''),
          gameId,
          illust: '',
          language: '',
          lastReadPage: 0,
          nameEn: '',
          nameJp: String(fetchedData?.name ?? ''),
          nameZh: '',
          nickname: '',
          pixivId: '',
          resolution: '',
          format: '',
          scenario: '',
          translator: String(fetchedData?.translator ?? ''),
          version: '1.0.0',
          website: '',
          websiteType
        } as ResourceMeta
      } as ResourceForm)

      results.push({
        directoryPath,
        launchFilePath,
        type: String(saveResult?.type ?? 'info'),
        message: String(saveResult?.message ?? '处理完成')
      })
      completed += 1
      pushImportProgress(directoryPath)
    }

    const successCount = results.filter((item) => item.type === 'success').length
    const skippedCount = results.filter((item) => item.type === 'info').length
    const failedCount = results.filter((item) => item.type === 'error').length
    pushImportProgress('', true)

    return {
      type: failedCount > 0 && successCount === 0 ? 'error' : 'success',
      message: `批量导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`,
      data: results
    }
  }

  static async importBatchMultiImageDirectories(categoryId: string, items: Array<{
    directoryPath: string
    searchKeyword?: string
    fetchInfoEnabled?: boolean
  }>) {
    const results: Array<{ directoryPath: string; type: string; message: string }> = []
    const total = Array.isArray(items) ? items.length : 0
    let completed = 0

    const pushImportProgress = (directoryPath: string, done = false) => {
      NotificationQueueService.getInstance().pushBatchImportProgress({
        categoryId,
        stage: 'import',
        current: completed,
        total,
        message: directoryPath,
        done
      })
    }

    for (const item of items ?? []) {
      const directoryPath = String(item?.directoryPath ?? '').trim()
      if (!directoryPath) {
        results.push({
          directoryPath,
          type: 'warning',
          message: '未提供漫画目录'
        })
        completed += 1
        pushImportProgress(directoryPath)
        continue
      }

      const analysisResult = await ResourceService.analyzeMultiImageDirectory(directoryPath)
      const analysis = analysisResult?.data ?? {}

      if (analysis?.exists) {
        results.push({
          directoryPath,
          type: 'info',
          message: analysis.existingResourceTitle ? `已存在：${analysis.existingResourceTitle}` : '该资源已存在'
        })
        completed += 1
        pushImportProgress(directoryPath)
        continue
      }

      const imageCount = Math.max(0, Number(analysis?.imageCount ?? 0))
      if (!imageCount) {
        results.push({
          directoryPath,
          type: 'warning',
          message: '目录中未找到可用图片'
        })
        completed += 1
        pushImportProgress(directoryPath)
        continue
      }

      const websiteType = await resolveComicMetaWebsiteId()
      const gameId = String(item?.searchKeyword ?? normalizeComicSearchKeyword(path.basename(directoryPath)) ?? '').trim()
      const fetchInfoEnabled = item?.fetchInfoEnabled !== false
      let fetchedData: any = null

      if (fetchInfoEnabled && websiteType && gameId) {
        const fetchResult = await ResourceService.fetchResourceInfo(websiteType, gameId)
        ResourceService.logger.info('importBatchMultiImageDirectories fetchResourceInfo', {
          directoryPath,
          websiteType,
          gameId,
          type: fetchResult?.type ?? '',
          message: fetchResult?.message ?? ''
        })

        if (fetchResult?.type === 'success' || fetchResult?.type === 'warning') {
          fetchedData = fetchResult?.data ?? null
        }
      }

      const saveResult = await ResourceService.saveResource({
        author: String(fetchedData?.author ?? '').trim(),
        actors: [],
        basePath: directoryPath,
        categoryId,
        coverPath: String(analysis?.coverPath ?? ''),
        description: '',
        name: String(fetchedData?.name || analysis?.directoryName || path.basename(directoryPath)),
        tags: Array.isArray(fetchedData?.tag) ? fetchedData.tag : [],
        types: Array.isArray(fetchedData?.type) ? fetchedData.type : [],
        meta: {
          additionalStores: [],
          commandLineArgs: '',
          engine: '',
          gameId,
          illust: '',
          language: '',
          lastReadPage: 0,
          nameEn: '',
          nameJp: String(fetchedData?.name ?? ''),
          nameZh: '',
          nickname: '',
          pixivId: '',
          resolution: '',
          format: '',
          scenario: '',
          translator: String(fetchedData?.translator ?? ''),
          version: '1.0.0',
          website: String(fetchedData?.website ?? ''),
          websiteType
        } as ResourceMeta
      } as ResourceForm)

      results.push({
        directoryPath,
        type: String(saveResult?.type ?? 'info'),
        message: String(saveResult?.message ?? '处理完成')
      })
      completed += 1
      pushImportProgress(directoryPath)
    }

    const successCount = results.filter((item) => item.type === 'success').length
    const skippedCount = results.filter((item) => item.type === 'info').length
    const failedCount = results.filter((item) => item.type === 'error').length
    pushImportProgress('', true)

    return {
      type: failedCount > 0 && successCount === 0 ? 'error' : 'success',
      message: `批量导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`,
      data: results
    }
  }

  static async importBatchAsmrDirectories(categoryId: string, items: Array<{
    directoryPath: string
    websiteType?: string
    gameId?: string
    fetchInfoEnabled?: boolean
  }>) {
    const results: Array<{ directoryPath: string; type: string; message: string }> = []
    const total = Array.isArray(items) ? items.length : 0
    let completed = 0

    const pushImportProgress = (directoryPath: string, done = false) => {
      NotificationQueueService.getInstance().pushBatchImportProgress({
        categoryId,
        stage: 'import',
        current: completed,
        total,
        message: directoryPath,
        done
      })
    }

    for (const item of items ?? []) {
      const directoryPath = String(item?.directoryPath ?? '').trim()
      if (!directoryPath) {
        results.push({
          directoryPath,
          type: 'warning',
          message: '未提供音声目录'
        })
        completed += 1
        pushImportProgress(directoryPath)
        continue
      }

      const analysisResult = await ResourceService.analyzeAsmrDirectory(directoryPath)
      const analysis = analysisResult?.data ?? {}

      if (analysis?.exists) {
        results.push({
          directoryPath,
          type: 'info',
          message: analysis.existingResourceTitle ? `已存在：${analysis.existingResourceTitle}` : '该资源已存在'
        })
        completed += 1
        pushImportProgress(directoryPath)
        continue
      }

      const audioCount = Math.max(0, Number(analysis?.audioCount ?? 0))
      if (!audioCount) {
        results.push({
          directoryPath,
          type: 'warning',
          message: '目录中未找到可用音频文件'
        })
        completed += 1
        pushImportProgress(directoryPath)
        continue
      }

      const websiteType = String(item?.websiteType ?? analysis?.websiteType ?? '').trim()
      const gameId = String(item?.gameId ?? analysis?.gameId ?? '').trim()
      const fetchInfoEnabled = item?.fetchInfoEnabled !== false
      let fetchedData: any = null

      if (fetchInfoEnabled && websiteType && gameId) {
        const fetchResult = await ResourceService.fetchResourceInfo(websiteType, gameId)
        ResourceService.logger.info('importBatchAsmrDirectories fetchResourceInfo', {
          directoryPath,
          websiteType,
          gameId,
          type: fetchResult?.type ?? '',
          message: fetchResult?.message ?? ''
        })

        if (fetchResult?.type === 'success' || fetchResult?.type === 'warning') {
          fetchedData = fetchResult?.data ?? null
        }
      }

      const actors = String(fetchedData?.cv ?? '')
        .split(/[\/,、，]/)
        .map((item) => item.trim())
        .filter(Boolean)

      const saveResult = await ResourceService.saveResource({
        author: String(fetchedData?.author ?? '').trim(),
        actors: Array.from(new Set(actors)),
        basePath: directoryPath,
        categoryId,
        coverPath: String(fetchedData?.cover ?? analysis?.coverPath ?? '').trim(),
        description: '',
        name: String(fetchedData?.name || analysis?.directoryName || path.basename(directoryPath)),
        tags: Array.isArray(fetchedData?.tag) ? fetchedData.tag : [],
        types: Array.isArray(fetchedData?.type) ? fetchedData.type : [],
        meta: {
          additionalStores: [],
          commandLineArgs: '',
          engine: '',
          gameId,
          illust: String(fetchedData?.illust ?? '').trim(),
          language: '',
          lastPlayFile: '',
          lastPlayTime: 0,
          lastReadPage: 0,
          nameEn: '',
          nameJp: String(fetchedData?.name ?? ''),
          nameZh: '',
          nickname: '',
          pixivId: '',
          resolution: '',
          format: '',
          scenario: String(fetchedData?.scenario ?? '').trim(),
          translator: '',
          version: '1.0.0',
          website: String(fetchedData?.website ?? ''),
          websiteType
        } as ResourceMeta
      } as ResourceForm)

      results.push({
        directoryPath,
        type: String(saveResult?.type ?? 'info'),
        message: String(saveResult?.message ?? '处理完成')
      })
      completed += 1
      pushImportProgress(directoryPath)
    }

    const successCount = results.filter((item) => item.type === 'success').length
    const skippedCount = results.filter((item) => item.type === 'info').length
    const failedCount = results.filter((item) => item.type === 'error').length
    pushImportProgress('', true)

    return {
      type: failedCount > 0 && successCount === 0 ? 'error' : 'success',
      message: `批量导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`,
      data: results
    }
  }

  static async fetchResourceInfo(websiteId: string, resourceId: string) {
    const normalizedWebsiteId = String(websiteId ?? '').trim()
    const normalizedResourceId = String(resourceId ?? '').trim()

    ResourceService.logger.info('fetchResourceInfo', { websiteId, resourceId })

    if (!normalizedWebsiteId) {
      return {
        type: 'warning',
        message: '请先选择贩售网站',
      }
    }

    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '请先输入资源ID',
      }
    }

    try {
      const data = await FetchPluginService.getInstance().fetchResourceInfo(normalizedWebsiteId, normalizedResourceId)
      ResourceService.logger.info('fetchResourceInfo result', data)

      if (!hasUsefulFetchedData(data)) {
        return {
          type: 'warning',
          message: '已请求成功，但未获取到可回填的资源信息',
          data,
        }
      }

      return {
        type: 'success',
        message: '获取资源信息成功',
        data,
      }
    } catch (error) {
      ResourceService.logger.error('fetchResourceInfo', error)
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '获取资源信息失败',
      }
    }
  }

  static async fetchWebsiteInfo(url: string) {
    const normalizedInputUrl = await resolveWebsiteFetchUrl(url, {
      probeTimeoutMs: 5000,
      allowGetFallback: true
    })
    if (!normalizedInputUrl) {
      return {
        type: 'warning',
        message: '请先输入合法的网站地址',
      }
    }

    try {
      const data = new FetchResourceInfoResult()
      let finalUrl = normalizedInputUrl
      let contentType = ''
      let contentDisposition = ''
      let htmlText = ''

      try {
        const headResponse = await probeWebsiteResponse(normalizedInputUrl, 'head', 5000)
        finalUrl = getAxiosResponseUrl(headResponse, normalizedInputUrl)
        contentType = String(headResponse.headers?.['content-type'] ?? '').toLowerCase()
        contentDisposition = String(headResponse.headers?.['content-disposition'] ?? '')
      } catch (error) {
        ResourceService.logger.debug('fetchWebsiteInfo head probe failed', {
          url: normalizedInputUrl,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      if (
        isLikelyDirectDownloadUrl(finalUrl)
        || hasAttachmentContentDisposition(contentDisposition)
      ) {
        const fallbackTitle = parseFileNameFromContentDisposition(contentDisposition)
          || getFileNameFromUrl(finalUrl)
          || getHostnameLabel(finalUrl)

        data.website = finalUrl
        data.name = fallbackTitle
        data.favicon = ''
        data.isDownloadLink = true

        return {
          type: 'success',
          message: '已根据下载链接提取文件名',
          data,
        }
      }

      const htmlPreview = await fetchWebsiteHtmlPreview(normalizedInputUrl, 256 * 1024, 10000)
      finalUrl = htmlPreview.finalUrl
      contentType = htmlPreview.contentType
      contentDisposition = htmlPreview.contentDisposition
      htmlText = htmlPreview.htmlText

      const fileNameFromHeader = parseFileNameFromContentDisposition(contentDisposition)
      const fileNameFromUrl = getFileNameFromUrl(finalUrl)
      const fallbackTitle = fileNameFromHeader || fileNameFromUrl || getHostnameLabel(finalUrl)

      data.website = finalUrl

      if (isHtmlContentType(contentType) || /<html[\s>]/i.test(htmlText)) {
        data.name = extractHtmlTitle(htmlText) || fallbackTitle
        data.favicon = extractFaviconUrl(htmlText, finalUrl) || buildFallbackFaviconUrl(finalUrl)
        data.isDownloadLink = false
      } else {
        data.name = fallbackTitle
        data.favicon = ''
        data.isDownloadLink = true
      }

      if (data.favicon && !data.isDownloadLink) {
        const faviconCacheKey = `website-fetch-${crypto
          .createHash('sha1')
          .update(`${finalUrl}::${String(data.favicon)}`)
          .digest('hex')
          .slice(0, 16)}`
        data.favicon = await cacheWebsiteFaviconToCache(String(data.favicon), faviconCacheKey)
      }

      if (!hasUsefulFetchedData(data) && !data.favicon) {
        return {
          type: 'warning',
          message: '已请求成功，但未获取到可回填的网站信息',
          data,
        }
      }

      return {
        type: 'success',
        message: isHtmlContentType(contentType) || /<html[\s>]/i.test(htmlText)
          ? '已获取网站信息'
          : '已根据下载链接提取文件名',
        data,
      }
    } catch (error) {
      ResourceService.logger.error('fetchWebsiteInfo failed', {
        url: normalizedInputUrl,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '获取网站信息失败',
      }
    }
  }

  private static scheduleWebsiteCoverRefresh(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return
    }

    setImmediate(() => {
      void ResourceService.refreshWebsiteCover(normalizedResourceId).catch((error) => {
        ResourceService.logger.warn('refreshWebsiteCover failed', {
          resourceId: normalizedResourceId,
          error: error instanceof Error ? error.message : String(error)
        })
      })
    })
  }

  private static async refreshWebsiteCover(resourceId: string) {
    const detail = await DatabaseService.getResourceDetailById(resourceId)
    if (!detail) {
      return
    }

    const categoryInfo = await DatabaseService.getCategoryById(String(detail.categoryId ?? '').trim())
    if (String(categoryInfo?.meta?.extra?.extendTable ?? '').trim() !== 'website_meta') {
      return
    }

    const websiteUrl = normalizeWebsiteFetchUrl(String(detail?.websiteMeta?.url ?? detail?.basePath ?? '').trim())
    if (!websiteUrl) {
      return
    }

    const managedCoverPath = await getManagedWebsiteCoverPath(resourceId)
    const currentCoverPath = String(detail?.coverPath ?? '').trim()
    const currentCoverIsManaged = isSameManagedWebsiteCoverPath(currentCoverPath, managedCoverPath)

    if (currentCoverPath && !currentCoverIsManaged) {
      return
    }

    const probeResult = await inspectWebsiteScreenshotTarget(websiteUrl)
    if (probeResult.url !== websiteUrl || detail?.websiteMeta?.isDownloadLink !== (probeResult.reason === 'download-url' || probeResult.reason === 'download-response')) {
      DatabaseService.upsertWebsiteMeta({
        resourceId,
        url: String(probeResult.url || websiteUrl).trim() || websiteUrl,
        favicon: probeResult.reason === 'download-url' || probeResult.reason === 'download-response'
          ? ''
          : String(detail?.websiteMeta?.favicon ?? '').trim() || null,
        isDownloadLink: probeResult.reason === 'download-url' || probeResult.reason === 'download-response'
      })
    }

    if (!probeResult.canCapture) {
      if (currentCoverIsManaged) {
        await removeManagedWebsiteCover(resourceId)
        await DatabaseService.updateResource({
          id: resourceId,
          coverPath: ''
        })
        NotificationQueueService.getInstance().pushResourceStateChanged({
          resourceId,
          categoryId: String(detail.categoryId ?? '').trim(),
          running: false,
          missingStatus: Boolean(detail.missingStatus),
          changedAt: Date.now(),
        })
      }
      return
    }

    const screenshotBuffer = await captureWebsiteCoverBuffer(probeResult.url, resourceId)
    const coverPath = await writeManagedWebsiteCover(resourceId, screenshotBuffer)
    const currentFavicon = String(detail?.websiteMeta?.favicon ?? '').trim()
    let nextFavicon = currentFavicon

    if (!currentFavicon) {
      try {
        const htmlPreview = await fetchWebsiteHtmlPreview(probeResult.url, 64 * 1024, 5000)
        nextFavicon = extractFaviconUrl(htmlPreview.htmlText, htmlPreview.finalUrl)
          || buildFallbackFaviconUrl(htmlPreview.finalUrl)
      } catch (error) {
        ResourceService.logger.debug('refreshWebsiteCover favicon probe failed', {
          resourceId,
          url: probeResult.url,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      if (nextFavicon) {
        nextFavicon = await cacheWebsiteFaviconToCache(nextFavicon, resourceId)
        DatabaseService.upsertWebsiteMeta({
          resourceId,
          url: String(probeResult.url || websiteUrl).trim() || websiteUrl,
          favicon: nextFavicon || null,
          isDownloadLink: false
        })
      }
    }

    await DatabaseService.updateResource({
      id: resourceId,
      coverPath
    })

    NotificationQueueService.getInstance().pushResourceStateChanged({
      resourceId,
      categoryId: String(detail.categoryId ?? '').trim(),
      running: false,
      missingStatus: Boolean(detail.missingStatus),
      changedAt: Date.now(),
    })
  }

  static async launchResource(resourceId: string, basePath: string, fileName?: string | null) {
    const launchOptions = await resolveResourceLaunchOptions(resourceId, basePath, fileName ?? undefined)
    const launchResult = await DialogService.launchPath(basePath, fileName ?? undefined, launchOptions)
    const message = launchResult.message

    if (message) {
      return {
        type: 'error',
        message,
      }
    }

    const accessTime = new Date()

    await DatabaseService.bumpResourceStatOnLaunch(resourceId, accessTime)

    await DatabaseService.insertResourceLog({
      resourceId,
      startTime: accessTime,
      endTime: launchResult.pid ? null : accessTime,
      duration: 0,
      pid: launchResult.pid,
      launchMode: ResourceLaunchMode.NORMAL,
      isDeleted: false,
    })

    const resource = await DatabaseService.getResourceById(resourceId)
    if (resource) {
      NotificationQueueService.getInstance().pushResourceStateChanged({
        resourceId,
        categoryId: resource.categoryId,
        running: Boolean(launchResult.pid),
        missingStatus: Boolean(resource.missingStatus),
        changedAt: Date.now(),
      })
    }

    return {
      type: 'success',
      message: launchResult.pid ? '启动成功' : '已启动，但暂不支持停止状态跟踪',
    }
  }

  static async startReadingResource(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    const resource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!resource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    const activeLog = await DatabaseService.getLatestActiveResourceLogByResourceId(normalizedResourceId)
    if (activeLog && !activeLog.endTime) {
      return {
        type: 'success',
        message: '已进入阅读',
      }
    }

    const accessTime = new Date()

    await DatabaseService.bumpResourceStatOnLaunch(normalizedResourceId, accessTime)
    await DatabaseService.insertResourceLog({
      resourceId: normalizedResourceId,
      startTime: accessTime,
      endTime: null,
      duration: 0,
      pid: null,
      launchMode: ResourceLaunchMode.NORMAL,
      isDeleted: false,
    })

    NotificationQueueService.getInstance().pushResourceStateChanged({
      resourceId: normalizedResourceId,
      categoryId: resource.categoryId,
      running: true,
      missingStatus: Boolean(resource.missingStatus),
      changedAt: Date.now(),
    })

    return {
      type: 'success',
      message: '已开始阅读',
    }
  }

  static async getMultiImageReadingProgress(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
        data: {
          lastReadPage: 0,
        }
      }
    }

    const lastReadPage = await DatabaseService.getMultiImageReadingProgress(normalizedResourceId)
    return {
      type: 'success',
      message: '获取阅读进度成功',
      data: {
        lastReadPage: Math.max(0, Number(lastReadPage ?? 0))
      }
    }
  }

  static async updateMultiImageReadingProgress(resourceId: string, lastReadPage: number) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    DatabaseService.upsertMultiImageReadingProgress(
      normalizedResourceId,
      Math.max(0, Math.floor(Number(lastReadPage ?? 0)))
    )

    return {
      type: 'success',
      message: '阅读进度已保存',
    }
  }

  static async getNovelReadingProgress(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
        data: {
          lastReadPercent: 0,
        }
      }
    }

    const lastReadPercent = await DatabaseService.getNovelReadingProgress(normalizedResourceId)
    return {
      type: 'success',
      message: '获取阅读进度成功',
      data: {
        lastReadPercent: Math.max(0, Math.min(1, Number(lastReadPercent ?? 0)))
      }
    }
  }

  static async updateNovelReadingProgress(resourceId: string, lastReadPercent: number) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    const normalizedProgress = Math.max(0, Math.min(1, Number(lastReadPercent ?? 0)))
    DatabaseService.upsertNovelReadingProgress(
      normalizedResourceId,
      normalizedProgress
    )

    if (normalizedProgress >= 0.995) {
      const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
      if (existingResource && !existingResource.isCompleted) {
        await DatabaseService.updateResource({
          id: normalizedResourceId,
          isCompleted: true,
        })
      }
    }

    return {
      type: 'success',
      message: '阅读进度已保存',
    }
  }

  static async updateAsmrPlaybackProgress(resourceId: string, lastPlayFile: string, lastPlayTime: number) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    const normalizedLastPlayFile = String(lastPlayFile ?? '').trim()
    const normalizedLastPlayTime = Math.max(0, Math.floor(Number(lastPlayTime ?? 0)))

    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '播放进度参数无效'
      }
    }

    const resource = await DatabaseService.getResourceById(normalizedResourceId)
    const categoryInfo = resource
      ? await DatabaseService.getCategoryById(String(resource.categoryId ?? '').trim())
      : null
    const extendTable = getExtendTableName(categoryInfo)

    if (extendTable === 'audio_meta') {
      DatabaseService.updateAudioPlaybackProgress(
        normalizedResourceId,
        normalizedLastPlayTime
      )

      return {
        type: 'success',
        message: '播放进度已保存'
      }
    }

    if (!normalizedLastPlayFile) {
      return {
        type: 'warning',
        message: '播放进度参数无效'
      }
    }

    const normalizedBasePath = path.normalize(String(resource?.basePath ?? '').trim())
    if (normalizedBasePath) {
      const resolvedBasePath = path.resolve(normalizedBasePath)
      const resolvedLastPlayFile = path.resolve(path.normalize(normalizedLastPlayFile))
      const relativePath = path.relative(resolvedBasePath, resolvedLastPlayFile)
      const isInsideResourcePath = relativePath === ''
        || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))

      if (!isInsideResourcePath) {
        return {
          type: 'warning',
          message: '播放进度文件不在当前资源目录内'
        }
      }
    }

    DatabaseService.updateAsmrPlaybackProgress(
      normalizedResourceId,
      normalizedLastPlayFile,
      normalizedLastPlayTime
    )

    return {
      type: 'success',
      message: '播放进度已保存'
    }
  }

  static async startAsmrPlayback(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    const resource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!resource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    const activeLog = await DatabaseService.getLatestActiveResourceLogByResourceId(normalizedResourceId)
    if (activeLog && !activeLog.endTime) {
      return {
        type: 'success',
        message: '已进入播放状态',
      }
    }

    const accessTime = new Date()

    await DatabaseService.bumpResourceStatOnLaunch(normalizedResourceId, accessTime)
    await DatabaseService.insertResourceLog({
      resourceId: normalizedResourceId,
      startTime: accessTime,
      endTime: null,
      duration: 0,
      pid: null,
      launchMode: ResourceLaunchMode.NORMAL,
      isDeleted: false,
    })

    NotificationQueueService.getInstance().pushResourceStateChanged({
      resourceId: normalizedResourceId,
      categoryId: resource.categoryId,
      running: true,
      missingStatus: Boolean(resource.missingStatus),
      changedAt: Date.now(),
    })

    return {
      type: 'success',
      message: '已开始播放',
    }
  }

  static async stopAsmrPlayback(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    const finalized = await this.finalizeStoppedResource(normalizedResourceId)
    if (!finalized) {
      return {
        type: 'warning',
        message: '当前没有活动中的播放记录',
      }
    }

    return {
      type: 'success',
      message: '已结束播放',
    }
  }

  static async startVideoPlayback(resourceId: string) {
    return this.startAsmrPlayback(resourceId)
  }

  static async stopVideoPlayback(resourceId: string) {
    return this.stopAsmrPlayback(resourceId)
  }

  static async recordResourceAccess(resourceId: string, launchMode: ResourceLaunchModeKey = ResourceLaunchMode.NORMAL) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    const resource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!resource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    const accessTime = new Date()

    await DatabaseService.bumpResourceStatOnLaunch(normalizedResourceId, accessTime)
    await DatabaseService.insertResourceLog({
      resourceId: normalizedResourceId,
      startTime: accessTime,
      endTime: accessTime,
      duration: 0,
      pid: null,
      launchMode,
      isDeleted: false,
    })

    NotificationQueueService.getInstance().pushResourceStateChanged({
      resourceId: normalizedResourceId,
      categoryId: resource.categoryId,
      running: false,
      missingStatus: Boolean(resource.missingStatus),
      changedAt: Date.now(),
    })

    return {
      type: 'success',
      message: '访问记录已保存',
    }
  }

  static async launchResourceAsAdmin(resourceId: string, basePath: string, fileName?: string | null) {
    const launchOptions = await resolveResourceLaunchOptions(resourceId, basePath, fileName ?? undefined)
    const launchResult = await DialogService.launchPathAsAdmin(basePath, fileName ?? undefined, launchOptions)
    const message = launchResult.message

    if (message) {
      return {
        type: 'error',
        message,
      }
    }

    const accessTime = new Date()

    await DatabaseService.bumpResourceStatOnLaunch(resourceId, accessTime)

    await DatabaseService.insertResourceLog({
      resourceId,
      startTime: accessTime,
      endTime: accessTime,
      duration: 0,
      pid: null,
      launchMode: ResourceLaunchMode.ADMIN,
      isDeleted: false,
    })

    return {
      type: 'success',
      message: '已请求以管理员身份运行',
    }
  }

  static async launchResourceWithMtool(resourceId: string, basePath: string, fileName?: string | null) {
    const targetPath = fileName ? path.join(basePath, fileName) : basePath
    const normalizedTargetPath = path.normalize(String(targetPath ?? '').trim())

    if (!normalizedTargetPath) {
      return {
        type: 'warning',
        message: '请先提供游戏路径',
      }
    }

    const mtoolSetting = await DatabaseService.getSetting(Settings.MTOOL_PATH)
    const mtoolPath = String(mtoolSetting?.value ?? '').trim()

    if (!mtoolPath) {
      return {
        type: 'warning',
        message: '请先在设置中配置 MTool 路径',
      }
    }

    const launchFilePath = await resolveMtoolLaunchFile(normalizedTargetPath)
    if (!launchFilePath) {
      return {
        type: 'warning',
        message: '未找到可供 MTool 注入的游戏启动文件',
      }
    }

    if (path.extname(launchFilePath).toLowerCase() !== '.exe') {
      return {
        type: 'warning',
        message: `MTool 目前只支持对 EXE 启动文件注入，当前解析到的是：${path.basename(launchFilePath)}`,
      }
    }

    const engineDetectionResult = await this.detectGameEngine(launchFilePath, resourceId)
    const engineProfile = engineDetectionResult?.data
    const engineName = String(engineProfile?.engineName ?? '').trim()

    if (!engineName) {
      return {
        type: 'warning',
        message: '未检测到游戏引擎，无法判断是否支持 MTool 注入',
      }
    }

    if (!engineProfile?.mtoolSupported || !Array.isArray(engineProfile?.mtoolHookFiles) || !engineProfile.mtoolHookFiles.length) {
      return {
        type: 'warning',
        message: `当前引擎“${engineName}”暂不支持通过 MTool 启动`,
        data: {
          engineName,
          mtoolSupported: Boolean(engineProfile?.mtoolSupported),
          mtoolHookFiles: Array.isArray(engineProfile?.mtoolHookFiles) ? engineProfile.mtoolHookFiles : [],
        }
      }
    }

    const launchResult = await DialogService.launchPathWithMtool(
      launchFilePath,
      mtoolPath,
      engineProfile.mtoolHookFiles
    )

    const message = launchResult.message

    if (message) {
      return {
        type: 'error',
        message,
      }
    }

    const accessTime = new Date()

    await DatabaseService.bumpResourceStatOnLaunch(resourceId, accessTime)

    await DatabaseService.insertResourceLog({
      resourceId,
      startTime: accessTime,
      endTime: accessTime,
      duration: 0,
      pid: null,
      launchMode: ResourceLaunchMode.MTOOL,
      isDeleted: false,
    })

    return {
      type: 'success',
      message: `已通过 MTool 启动，当前引擎：${engineName}`,
      data: {
        engineName,
        mtoolHookFiles: engineProfile.mtoolHookFiles,
        launchFilePath,
      }
    }
  }

  static async launchResourceWithLocaleEmulator(resourceId: string, basePath: string, fileName?: string | null) {
    const targetPath = fileName ? path.join(basePath, fileName) : basePath
    const normalizedTargetPath = path.normalize(String(targetPath ?? '').trim())

    if (!normalizedTargetPath) {
      return {
        type: 'warning',
        message: '请先提供游戏路径',
      }
    }

    const localeEmulatorSetting = await DatabaseService.getSetting(Settings.LOCALE_EMULATOR_PATH)
    const localeEmulatorPath = String(localeEmulatorSetting?.value ?? '').trim()

    if (!localeEmulatorPath) {
      return {
        type: 'warning',
        message: '请先在设置中配置 LE 转区工具路径',
      }
    }

    const launchFilePath = await resolveMtoolLaunchFile(normalizedTargetPath)
    if (!launchFilePath) {
      return {
        type: 'warning',
        message: '未找到可供 LE 启动的游戏启动文件',
      }
    }

    if (path.extname(launchFilePath).toLowerCase() !== '.exe') {
      return {
        type: 'warning',
        message: `LE 启动目前只支持 EXE 启动文件，当前解析到的是：${path.basename(launchFilePath)}`,
      }
    }

    const launchResult = await DialogService.launchPathWithLocaleEmulator(launchFilePath, localeEmulatorPath)
    const message = launchResult.message

    if (message) {
      return {
        type: 'error',
        message,
      }
    }

    const accessTime = new Date()

    await DatabaseService.bumpResourceStatOnLaunch(resourceId, accessTime)

    await DatabaseService.insertResourceLog({
      resourceId,
      startTime: accessTime,
      endTime: launchResult.pid ? null : accessTime,
      duration: 0,
      pid: launchResult.pid ?? null,
      launchMode: ResourceLaunchMode.LOCALE_EMULATOR,
      isDeleted: false,
    })

    return {
      type: 'success',
      message: '已通过 LE 转区启动',
      data: {
        launchFilePath,
      }
    }
  }

  private static async persistDetectedEngineIfMissing(resourceId: string, engineId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    const normalizedEngineId = String(engineId ?? '').trim()

    if (!normalizedResourceId || !normalizedEngineId) {
      return
    }

    const resourceDetail = await DatabaseService.getResourceDetailById(normalizedResourceId)
    if (!resourceDetail) {
      return
    }

    const existingEngineId = String(resourceDetail?.gameMeta?.engine ?? '').trim()
    if (existingEngineId) {
      return
    }

    DatabaseService.upsertGameMeta({
      resourceId: normalizedResourceId,
      nameZh: resourceDetail?.gameMeta?.nameZh ?? null,
      nameEn: resourceDetail?.gameMeta?.nameEn ?? null,
      nameJp: resourceDetail?.gameMeta?.nameJp ?? null,
      nickname: resourceDetail?.gameMeta?.nickname ?? null,
      engine: normalizedEngineId,
      version: resourceDetail?.gameMeta?.version ?? null,
      language: resourceDetail?.gameMeta?.language ?? null,
    })
  }

  static async stopResource(resourceId: string) {
    const resourceLog = await DatabaseService.getLatestActiveResourceLogByResourceId(resourceId)

    if (!resourceLog || resourceLog.endTime) {
      return {
        type: 'warning',
        message: '当前资源未处于运行状态',
      }
    }

    const stopTime = new Date()

    let stopMessage = ''
    if (resourceLog.pid) {
      const stopResult = await DialogService.stopProcess(resourceLog.pid)
      stopMessage = stopResult.message
    }

    await this.finalizeStoppedResource(resourceId, resourceLog, stopTime)

    if (stopMessage) {
      return {
        type: 'warning',
        message: `${stopMessage}，已同步更新资源状态`,
      }
    }

    return {
      type: 'success',
      message: '已停止运行',
    }
  }

  static async finalizeStoppedResource(
    resourceId: string,
    existingLog?: {
      resourceId: string | null
      startTime: Date | null
      endTime: Date | null
      duration: number | null
      pid: number | null
      isDeleted: boolean | null
    } | null,
    stopTime: Date = new Date()
  ) {
    const resourceLog = existingLog ?? await DatabaseService.getLatestActiveResourceLogByResourceId(resourceId)
    if (!resourceLog || !resourceLog.resourceId || resourceLog.endTime) {
      return false
    }

    const duration = resourceLog.startTime
      ? Math.max(0, Math.floor((stopTime.getTime() - new Date(resourceLog.startTime).getTime()) / 1000))
      : Number(resourceLog.duration ?? 0)

    await DatabaseService.closeActiveResourceLog(
      resourceLog.resourceId,
      {
        pid: resourceLog.pid ?? null,
        startTime: resourceLog.startTime ?? null,
        endTime: stopTime,
        duration,
      }
    )

    await DatabaseService.bumpResourceStatOnStop(resourceId, duration, stopTime)

    const resource = await DatabaseService.getResourceById(resourceId)
    if (resource) {
      NotificationQueueService.getInstance().pushResourceStateChanged({
        resourceId,
        categoryId: resource.categoryId,
        running: false,
        missingStatus: Boolean(resource.missingStatus),
        changedAt: Date.now(),
      })
    }

    return true
  }

  static async analyzeGamePath(basePath: string) {
    if (!basePath) {
      return null
    }

    const searchRoot = getGameSearchRoot(basePath)
    const name = path.basename(searchRoot)
    const matchedGameId = await findGameIdInDirectory(searchRoot, basePath)

    if (!matchedGameId) {
      return {
        name,
      }
    }

    const websiteLabel = getWebsiteLabelByGameId(matchedGameId)
    let websiteType = ''

    if (websiteLabel) {
      const websiteOptions = await DatabaseService.getSelectDictData(DictType.GAME_SITE_TYPE)
      const matchedWebsite = websiteOptions.find((option) => option.label === websiteLabel)
      websiteType = matchedWebsite?.value ?? ''
    }

    return {
      name,
      gameId: matchedGameId,
      websiteType,
    }
  }

  static async analyzeAudioFilePath(basePath: string) {
    const normalizedPath = path.normalize(String(basePath ?? '').trim())
    if (!normalizedPath) {
      return null
    }

    try {
      const pathInfo = await dealPath(normalizedPath)
      const filePath = getResolvedFilePath(pathInfo)
      if (!filePath) {
        return null
      }

        const audioInfo = await readSingleAudioFileInfo(filePath)
        return {
          name: getFileNameWithoutExtension(filePath),
          artist: audioInfo.artist,
          artists: audioInfo.artists,
          album: audioInfo.album,
          lyricsPath: await findMatchedLyricsPath(filePath),
          duration: audioInfo.duration,
          bitrate: audioInfo.bitrate,
          sampleRate: audioInfo.sampleRate,
          embeddedCoverPath: audioInfo.embeddedCoverPath,
        }
    } catch {
      return null
    }
  }

  static async analyzeNovelFilePath(basePath: string) {
    const normalizedBasePath = path.normalize(String(basePath ?? '').trim())
    if (!normalizedBasePath) {
      return {
        type: 'warning',
        message: '文件路径不能为空',
        data: {
          isbn: '',
          coverDataUrl: ''
        }
      }
    }

    try {
      const analysis = await analyzeNovelFile(normalizedBasePath)
      const hasResult = Boolean(String(analysis.isbn ?? '').trim() || String(analysis.coverDataUrl ?? '').trim())
      return {
        type: hasResult ? 'success' : 'warning',
        message: hasResult ? '已分析小说文件' : '未读取到可用的小说元数据',
        data: analysis
      }
    } catch (error) {
      ResourceService.logger.warn('analyzeNovelFilePath failed', {
        basePath: normalizedBasePath,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        type: 'warning',
        message: error instanceof Error ? error.message : '分析小说文件失败',
        data: {
          isbn: '',
          coverDataUrl: ''
        }
      }
    }
  }

  static async fetchAudioAlbumCover(input: {
    title?: string
    album?: string
    artist?: string
    artists?: string[]
    basePath?: string
  }) {
    const album = String(input?.album ?? '').trim()
    const title = String(input?.title ?? '').trim()
    const artist = resolvePreferredArtistName(input?.artist, input?.artists)

    ResourceService.logger.info('fetchAudioAlbumCover request', {
      title,
      album,
      artist,
      hasBasePath: Boolean(String(input?.basePath ?? '').trim())
    })

    if (!album && !title && !artist) {
      ResourceService.logger.warn('fetchAudioAlbumCover skipped: missing search params')
      return {
        type: 'warning',
        message: '请先填写音乐信息后再获取封面'
      }
    }

    try {
      const proxyConfig = await getAxiosProxyConfig()
      const fetchCoverCandidate = async (
        query: Record<string, string>,
        label: string
      ): Promise<{ label: string; coverPath: string; query: Record<string, string> } | null> => {
        ResourceService.logger.info('fetchAudioAlbumCover requesting remote cover', {
          title,
          album,
          artist,
          label,
          query
        })

        const response = await axios.get('https://api.lrc.cx/cover', {
          maxRedirects: 0,
          responseType: 'arraybuffer',
          timeout: 20000,
          validateStatus: (status) => status >= 200 && status < 400,
          ...proxyConfig,
          params: query
        })

        const contentType = String(response.headers['content-type'] ?? '').toLowerCase()
        const redirectedUrl = String(response.headers.location ?? '').trim()

        if (redirectedUrl) {
          const redirectedResponse = await axios.get<ArrayBuffer>(normalizeRemoteCoverPath(redirectedUrl), {
            responseType: 'arraybuffer',
            timeout: 20000,
            validateStatus: (status) => status >= 200 && status < 400,
            ...proxyConfig
          })

          const redirectedContentType = String(redirectedResponse.headers['content-type'] ?? '').toLowerCase()
          if (!redirectedContentType.startsWith('image/')) {
            ResourceService.logger.warn('fetchAudioAlbumCover redirect target returned non-image response', {
              title,
              album,
              artist,
              label,
              redirectedUrl,
              redirectedContentType
            })
            return null
          }

          const redirectedSuffix = getImageExtensionByContentType(redirectedContentType)
          const redirectedCachedFilePath = await writeFetchedAudioCoverToCache(Buffer.from(redirectedResponse.data), redirectedSuffix)

          ResourceService.logger.info('fetchAudioAlbumCover success by redirect download', {
            title,
            album,
            artist,
            label,
            redirectedUrl,
            redirectedContentType,
            redirectedCachedFilePath
          })

          return {
            label,
            coverPath: redirectedCachedFilePath,
            query
          }
        }

        if (!contentType.startsWith('image/')) {
          ResourceService.logger.warn('fetchAudioAlbumCover returned non-image response', {
            title,
            album,
            artist,
            label,
            contentType
          })
          return null
        }

        const suffix = getImageExtensionByContentType(contentType)
        const cachedFilePath = await writeFetchedAudioCoverToCache(Buffer.from(response.data), suffix)

        ResourceService.logger.info('fetchAudioAlbumCover success by file write', {
          title,
          album,
          artist,
          label,
          contentType,
          cachedFilePath
        })

        return {
          label,
          coverPath: cachedFilePath,
          query
        }
      }

      const rawQueryCandidates = [
        {
          label: '歌名 + 歌手',
          query: {
            ...(title ? { title } : {}),
            ...(artist ? { artist } : {})
          }
        },
        {
          label: '歌名 + 专辑',
          query: {
            ...(title ? { title } : {}),
            ...(album ? { album } : {})
          }
        },
        {
          label: '歌手 + 专辑',
          query: {
            ...(artist ? { artist } : {}),
            ...(album ? { album } : {})
          }
        }
      ].filter((item) => Object.keys(item.query).length >= 2)

      const seenQueryKeys = new Set<string>()
      const queryCandidates = rawQueryCandidates.filter((item) => {
        const queryKey = JSON.stringify(Object.entries(item.query).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)))
        if (seenQueryKeys.has(queryKey)) {
          return false
        }

        seenQueryKeys.add(queryKey)
        return true
      })

      const coverCandidates: Array<{ label: string; coverPath: string; query: Record<string, string> }> = []
      const seenCoverPaths = new Set<string>()

      for (const candidate of queryCandidates) {
        try {
          const result = await fetchCoverCandidate(candidate.query, candidate.label)
          if (!result) {
            continue
          }

          const normalizedCoverPath = String(result.coverPath ?? '').trim()
          if (!normalizedCoverPath || seenCoverPaths.has(normalizedCoverPath)) {
            continue
          }

          seenCoverPaths.add(normalizedCoverPath)
          coverCandidates.push(result)
        } catch (error) {
          ResourceService.logger.warn('fetchAudioAlbumCover candidate failed', {
            title,
            album,
            artist,
            label: candidate.label,
            query: candidate.query,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      if (!coverCandidates.length) {
        return {
          type: 'warning',
          message: '未找到可用的专辑封面'
        }
      }

      return {
        type: 'success',
        message: `已找到 ${coverCandidates.length} 张专辑封面`,
        data: {
          coverPath: coverCandidates[0].coverPath,
          coverCandidates
        }
      }
    } catch (error) {
      ResourceService.logger.error('fetchAudioAlbumCover failed', {
        title,
        album,
        artist,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '获取专辑封面失败'
      }
    }
  }

  static async fetchAudioLyrics(input: {
    title?: string
    album?: string
    artist?: string
    artists?: string[]
    basePath?: string
  }) {
    const basePath = String(input?.basePath ?? '').trim()
    const title = String(input?.title ?? '').trim()
    const album = String(input?.album ?? '').trim()
    const artist = resolvePreferredArtistName(input?.artist, input?.artists)

    ResourceService.logger.info('fetchAudioLyrics request', {
      basePath,
      title,
      album,
      artist
    })

    if (!basePath) {
      ResourceService.logger.warn('fetchAudioLyrics skipped: missing basePath')
      return {
        type: 'warning',
        message: '请先选择音乐文件'
      }
    }

    if (!title && !album && !artist) {
      ResourceService.logger.warn('fetchAudioLyrics skipped: missing search params', {
        basePath
      })
      return {
        type: 'warning',
        message: '请先填写音乐信息后再获取歌词'
      }
    }

    try {
      const pathInfo = await dealPath(basePath)
      const audioFilePath = getResolvedFilePath(pathInfo)
      if (!audioFilePath) {
        return {
          type: 'warning',
          message: '当前音乐路径无效'
        }
      }

      const searchParams = new URLSearchParams()
      if (title) {
        searchParams.set('title', title)
      }
      if (album) {
        searchParams.set('album', album)
      }
      if (artist) {
        searchParams.set('artist', artist)
      }

      const response = await axios.get<string>('https://api.lrc.cx/lyrics', {
        responseType: 'text',
        timeout: 20000,
        ...(await getAxiosProxyConfig()),
        params: Object.fromEntries(searchParams.entries())
      })

      const lyricsContent = String(response.data ?? '').trim()
      if (!lyricsContent) {
        ResourceService.logger.warn('fetchAudioLyrics returned empty content', {
          basePath,
          title,
          album,
          artist
        })
        return {
          type: 'warning',
          message: '未获取到歌词内容'
        }
      }

      const lyricsPath = buildAudioLyricsFilePath(audioFilePath)
      await fs.writeFile(lyricsPath, lyricsContent, 'utf8')

      ResourceService.logger.info('fetchAudioLyrics success', {
        basePath,
        audioFilePath,
        lyricsPath,
        title,
        album,
        artist,
        length: lyricsContent.length
      })

      return {
        type: 'success',
        message: '已获取歌词',
        data: {
          lyricsPath
        }
      }
    } catch (error) {
      ResourceService.logger.error('fetchAudioLyrics failed', {
        basePath,
        title,
        album,
        artist,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '获取歌词失败'
      }
    }
  }

  /**
   * 保存资源
   * - 将封面图转换为webp格式并保存在cache/thumbnails目录下
   * - 在资源目录下创建一个名为.nrm的隐藏文件，追加写入当前资源id
   * -
   * @param resourceForm 前端传入的表单数据
   */
  static async saveResource(resourceForm: ResourceForm) {
    try {
      const categoryInfo = await DatabaseService.getCategoryById(resourceForm.categoryId)
      const normalizedResourceForm = {
        ...resourceForm,
        tags: Array.from(new Set(
          (Array.isArray(resourceForm?.tags) ? resourceForm.tags : [])
            .map((item) => String(item ?? '').trim())
            .filter(Boolean)
        ))
      }

      ResourceService.logger.info('saveResource start', {
        categoryId: resourceForm.categoryId,
        name: String(resourceForm?.name ?? '').trim(),
        basePath: String(resourceForm?.basePath ?? '').trim(),
        coverPath: String(resourceForm?.coverPath ?? '').trim(),
        author: String(resourceForm?.author ?? '').trim(),
        authors: Array.isArray(resourceForm?.authors) ? resourceForm.authors : [],
        tags: normalizedResourceForm.tags,
        types: Array.isArray(resourceForm?.types) ? resourceForm.types : [],
        meta: resourceForm?.meta ?? {}
      })
      // 资源id
      const resourceId = generateId()
      const pathDealResult = await resolveResourcePathInfo(resourceForm, categoryInfo)
      const normalizedMeta = await normalizeResourceMeta(resourceForm.meta, categoryInfo, pathDealResult, resourceId)
      // 处理封面图
      const realCoverPath = await resolveResourceCoverPath(resourceForm.coverPath, resourceId, categoryInfo, pathDealResult)

      // 数据对象
      // 资源表resource
      const resource = {
        id: resourceId,
        title: resourceForm.name,
        categoryId: resourceForm.categoryId,
        coverPath: realCoverPath,
        description: resourceForm.description,
        basePath: pathDealResult.basePath,
        fileName: pathDealResult.fileName,
        size: normalizedMeta.resourceSize,
      }
      const authorPayload = await buildAuthorPayload(resourceId, normalizedResourceForm, categoryInfo)

      // 标签与关联表 newTags tagRefs
      const dbTagMap: Map<string, any> = new Map()
      const existingTags = await DatabaseService.getTagByCategoryIdWithName(
        normalizedResourceForm.categoryId,
        normalizedResourceForm.tags
      )
      const existingTagList = existingTags ?? []

      existingTagList.forEach((tag) => {
        dbTagMap.set(tag.name, tag)
      })

      const newTags: any[] = []
      const tagRefs: any[] = []

      normalizedResourceForm.tags.forEach((tagName) => {
        if (dbTagMap.has(tagName)) {
          tagRefs.push({
            resourceId: resourceId,
            tagId: dbTagMap.get(tagName).id
          })
        } else {
          newTags.push({
            id: generateId(),
            name: tagName,
            categoryId: resourceForm.categoryId
          })
          tagRefs.push({
            resourceId: resourceId,
            tagId: newTags[newTags.length - 1].id
          })
        }
      })

      // 类型与关联 newTypes typeRefs
      const dbTypeMap: Map<string, any> = new Map()
      const existingTypes = await DatabaseService.getTypeByCategoryIdWithName(
        normalizedResourceForm.categoryId,
        normalizedResourceForm.types
      )
      const existingTypeList = existingTypes ?? []

      existingTypeList.forEach((type) => {
        dbTypeMap.set(type.name, type)
      })
      const newTypes: any[] = []
      const typeRefs: any[] = []

      normalizedResourceForm.types.forEach((typeName) => {
        if (dbTypeMap.has(typeName)) {
          typeRefs.push({
            resourceId: resourceId,
            typeId: dbTypeMap.get(typeName).id
          })
        } else {
          newTypes.push({
            id: generateId(),
            name: typeName,
            categoryId: resourceForm.categoryId
          })
          typeRefs.push({
            resourceId: resourceId,
            typeId: newTypes[newTypes.length - 1].id
          })
        }
      })

      const actorPayload = buildActorPayload(resourceId, normalizedResourceForm)
      const storeWorks = buildStoreWorkPayloads(resourceId, normalizedResourceForm, categoryInfo)

      let returnMsg: {
        type: 'success' | 'warning'
        message: string
        data: {
          resourceId: string
        }
      } = {
        type: 'success',
        message: '保存成功',
        data: {
          resourceId
        }
      }

      db.transaction((tx) => {
        // 插入数据库
        DatabaseService.insertResource(resource, tx)
        if (authorPayload.authorRefs.length) {
          authorPayload.newAuthors.forEach((author) => {
            DatabaseService.insertAuthor(author, tx)
          })
          authorPayload.authorRefs.forEach((authorRef) => {
            DatabaseService.insertAuthorRef(authorRef, tx)
          })
        }
        DatabaseService.insertActors(actorPayload, tx)
        DatabaseService.insertTags(newTags, tx)
        DatabaseService.insertTypes(newTypes, tx)
        DatabaseService.insertTagRefs(tagRefs, tx)
        DatabaseService.insertTypeRefs(typeRefs, tx)
        if (storeWorks.length) {
          storeWorks.forEach((storeWork) => {
            DatabaseService.insertStoreWork(storeWork, tx)
          })
        }
        syncMeta(tx, categoryInfo, resourceId, withAudioArtistMeta(categoryInfo, normalizedMeta.meta, authorPayload.displayName))
      })

      if (ResourceService.isVirtualResourceCategory(categoryInfo)) {
        ResourceService.scheduleWebsiteCoverRefresh(resourceId)

        ResourceService.logger.info('saveResource success', {
          resourceId,
          categoryId: resourceForm.categoryId,
          basePath: resource.basePath,
          fileName: resource.fileName,
          returnMsg,
          deferredTasks: ['website-cover-refresh']
        })

        return returnMsg
      }

      const markerCreated = await writeResourceMarker({
        resourceId,
        basePath: resource.basePath,
        fileName: resource.fileName ?? null,
        markerEnabled: shouldCreateResourceMarker(categoryInfo, pathDealResult, normalizedMeta.meta)
      })
      if (!markerCreated) {
        returnMsg = {
          type: 'warning',
          message: '保存成功，但无法创建校验文件，部分功能将不可用',
          data: {
            resourceId
          }
        }
      }

      // 将新资源添加到资源目录的监听器
      if (!ResourceService.isVirtualResourceCategory(categoryInfo)) {
        ResourceWatcher.getInstance().trackResource({
          id: resourceId,
          categoryId: resourceForm.categoryId,
          basePath: resource.basePath,
          fileName: resource.fileName ?? null,
          missingStatus: false,
        })
      }

      this.scheduleAsmrDurationRefresh(categoryInfo, resourceId, resource.basePath)

      if (ResourceService.isVideoFolderCategory(categoryInfo)) {
        try {
          await ResourceService.syncVideoSubItems(resourceId)
        } catch (error) {
          ResourceService.logger.warn('saveResource syncVideoSubItems failed', {
            resourceId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      if (ResourceService.isVirtualResourceCategory(categoryInfo)) {
        ResourceService.scheduleWebsiteCoverRefresh(resourceId)
      }

      ResourceService.logger.info('saveResource success', {
        resourceId,
        categoryId: resourceForm.categoryId,
        basePath: resource.basePath,
        fileName: resource.fileName,
        returnMsg
      })

      return returnMsg
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      ResourceService.logger.error('saveResource failed', {
        categoryId: resourceForm.categoryId,
        name: String(resourceForm?.name ?? '').trim(),
        basePath: String(resourceForm?.basePath ?? '').trim(),
        coverPath: String(resourceForm?.coverPath ?? '').trim(),
        error: message,
        meta: resourceForm?.meta ?? {}
      })
      return {
        type: 'error',
        message: message
      }
    }
  }

  static async captureCoverScreenshot(basePath: string) {
    const normalizedBasePath = String(basePath ?? '').trim()

    if (!normalizedBasePath) {
      return {
        type: 'warning',
        message: '请先选择资源路径',
      }
    }

    try {
      const screenshot = await WindowScreenshotService.captureCoverScreenshotByBasePath(normalizedBasePath)
      return {
        type: 'success',
        message: '截图成功',
        data: screenshot,
      }
    } catch (error) {
      ResourceService.logger.error('captureCoverScreenshot', error)
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '截图失败',
      }
    }
  }

  static async updateVideoPlaybackProgress(resourceId: string, lastPlayFile: string, lastPlayTime: number) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    const normalizedLastPlayFile = String(lastPlayFile ?? '').trim()
    const normalizedLastPlayTime = Math.max(0, Math.floor(Number(lastPlayTime ?? 0)))

    if (!normalizedResourceId || !normalizedLastPlayFile) {
      return {
        type: 'warning',
        message: '播放进度参数无效'
      }
    }

    DatabaseService.updateVideoPlaybackProgress(
      normalizedResourceId,
      normalizedLastPlayFile,
      normalizedLastPlayTime
    )

    return {
      type: 'success',
      message: '播放进度已保存'
    }
  }

  static async extractVideoCoverFrames(basePath: string) {
    const normalizedBasePath = path.normalize(String(basePath ?? '').trim())

    if (!normalizedBasePath) {
      return {
        type: 'warning',
        message: '请先选择视频文件',
      }
    }

    try {
      const exists = await fs.pathExists(normalizedBasePath)
      if (!exists) {
        return {
          type: 'warning',
          message: '视频文件不存在',
        }
      }

      const stat = await fs.stat(normalizedBasePath)
      if (!stat.isFile()) {
        return {
          type: 'warning',
          message: '请选择视频文件',
        }
      }

      const coverCandidates = await extractVideoCoverFrameCandidates(normalizedBasePath)
      if (!coverCandidates.length) {
        return {
          type: 'warning',
          message: '未能从视频中生成封面候选',
        }
      }

      return {
        type: 'success',
        message: `已生成 ${coverCandidates.length} 张封面候选`,
        data: {
          coverCandidates,
        }
      }
    } catch (error) {
      ResourceService.logger.error('extractVideoCoverFrames', error)
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '生成随机帧失败',
      }
    }
  }

  static async deleteResource(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()

    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

      const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!existingResource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    const runningResourceIds = await DatabaseService.getRunningResourceIdsByResourceIds([normalizedResourceId])
    if (runningResourceIds.length) {
      return {
        type: 'warning',
        message: '资源正在运行，无法删除',
      }
    }

    await removeResourceMarker({
      id: normalizedResourceId,
      basePath: existingResource.basePath,
      fileName: existingResource.fileName ?? null
    })
    await DatabaseService.logicalDeleteResource(normalizedResourceId)
    await ResourceWatcher.getInstance().untrackResource(normalizedResourceId)

    NotificationQueueService.getInstance().pushResourceStateChanged({
      resourceId: normalizedResourceId,
      categoryId: existingResource.categoryId,
      running: false,
      missingStatus: Boolean(existingResource.missingStatus),
      changedAt: Date.now(),
    })

    return {
      type: 'success',
      message: '删除成功',
    }
  }

  static async deleteResourceWithFiles(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()

    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!existingResource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    const runningResourceIds = await DatabaseService.getRunningResourceIdsByResourceIds([normalizedResourceId])
    if (runningResourceIds.length) {
      return {
        type: 'warning',
        message: '资源正在运行，无法删除文件',
      }
    }

    const targetDirectory = resolveResourceDeletionDirectory(existingResource.basePath)
    if (!targetDirectory) {
      return {
        type: 'error',
        message: '未找到可删除的资源目录',
      }
    }

    if (!isSafeResourceDeletionDirectory(targetDirectory)) {
      return {
        type: 'error',
        message: `目标目录不安全，已阻止删除：${targetDirectory}`,
      }
    }

    const targetDirectoryExists = await fs.pathExists(targetDirectory)

    await ResourceWatcher.getInstance().untrackResource(normalizedResourceId)
    if (targetDirectoryExists) {
      await fs.remove(targetDirectory)
    }
    await DatabaseService.logicalDeleteResource(normalizedResourceId)

    NotificationQueueService.getInstance().pushResourceStateChanged({
      resourceId: normalizedResourceId,
      categoryId: existingResource.categoryId,
      running: false,
      missingStatus: false,
      changedAt: Date.now(),
    })

    return {
      type: targetDirectoryExists ? 'success' : 'warning',
      message: targetDirectoryExists
        ? '已删除数据库记录和本地目录'
        : '本地目录不存在，已删除数据库记录',
    }
  }

  static async deleteResources(resourceIds: string[]) {
    const normalizedIds = Array.from(new Set((resourceIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))
    if (!normalizedIds.length) {
      return {
        type: 'warning',
        message: '未选择需要删除的资源',
        data: {
          successIds: [],
          skippedRunningIds: [],
          missingIds: [],
          failedIds: []
        }
      }
    }

    const resources = await DatabaseService.getResourcesByIds(normalizedIds)
    const resourceMap = new Map(resources.map((item) => [String(item.id), item]))
    const runningIds = new Set(await DatabaseService.getRunningResourceIdsByResourceIds(normalizedIds))
    const successIds: string[] = []
    const skippedRunningIds: string[] = []
    const missingIds: string[] = []
    const failedIds: string[] = []
    const deletableResources: any[] = []

    for (const resourceId of normalizedIds) {
      const existingResource = resourceMap.get(resourceId)
      if (!existingResource) {
        missingIds.push(resourceId)
        continue
      }

      if (runningIds.has(resourceId)) {
        skippedRunningIds.push(resourceId)
        continue
      }

      deletableResources.push(existingResource)
      successIds.push(resourceId)
    }

    try {
      await Promise.all(
        deletableResources.map((existingResource) =>
          removeResourceMarker({
            id: String(existingResource.id),
            basePath: existingResource.basePath,
            fileName: existingResource.fileName ?? null
          })
        )
      )
    } catch (error) {
      ResourceService.logger.error('deleteResources removeResourceMarker', error)
    }

    const deletableIds = deletableResources.map((item) => String(item.id ?? '').trim()).filter(Boolean)

    try {
      await DatabaseService.logicalDeleteResources(deletableIds)
    } catch (error) {
      ResourceService.logger.error('deleteResources logicalDeleteResources', error)
      failedIds.push(...deletableIds)
      successIds.length = 0
    }

    if (successIds.length) {
      await Promise.all(
        deletableIds.map((resourceId) => ResourceWatcher.getInstance().untrackResource(resourceId))
      )

      for (const existingResource of deletableResources) {
        NotificationQueueService.getInstance().pushResourceStateChanged({
          resourceId: String(existingResource.id ?? ''),
          categoryId: existingResource.categoryId,
          running: false,
          missingStatus: Boolean(existingResource.missingStatus),
          changedAt: Date.now(),
        })
      }
    }

    const messageParts = [
      `已删除 ${successIds.length} 个`,
      skippedRunningIds.length ? `跳过运行中 ${skippedRunningIds.length} 个` : '',
      missingIds.length ? `不存在 ${missingIds.length} 个` : '',
      failedIds.length ? `失败 ${failedIds.length} 个` : ''
    ].filter(Boolean)

    return {
      type: failedIds.length > 0 && successIds.length === 0 ? 'error' : 'success',
      message: messageParts.join('，'),
      data: {
        successIds,
        skippedRunningIds,
        missingIds,
        failedIds
      }
    }
  }

  static async batchUpdateResourceLabels(
    resourceIds: string[],
    field: 'tags' | 'types',
    mode: 'add' | 'remove',
    values: string[]
  ) {
    const normalizedIds = Array.from(new Set((resourceIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))
    const normalizedValues = Array.from(new Set((values ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))

    if (!normalizedIds.length) {
      return {
        type: 'warning',
        message: '未选择需要批量修改的资源',
        data: {
          affectedIds: [],
          successIds: [],
          missingIds: [],
          failedIds: []
        }
      }
    }

    if (!normalizedValues.length) {
      return {
        type: 'warning',
        message: field === 'tags' ? '请先输入要处理的标签' : '请先输入要处理的分类',
        data: {
          affectedIds: [],
          successIds: [],
          missingIds: [],
          failedIds: []
        }
      }
    }

    const affectedIds: string[] = []
    const successIds: string[] = []
    const missingIds: string[] = []
    const failedIds: string[] = []

    for (const resourceId of normalizedIds) {
      try {
        const resourceDetail = await DatabaseService.getResourceDetailById(resourceId)
        if (!resourceDetail) {
          missingIds.push(resourceId)
          continue
        }

        const categoryId = String(resourceDetail.categoryId ?? '').trim()
        if (!categoryId) {
          failedIds.push(resourceId)
          continue
        }

        const currentValues = (
          field === 'tags'
            ? (resourceDetail.tags ?? []).map((item: any) => String(item?.name ?? '').trim())
            : (resourceDetail.types ?? []).map((item: any) => String(item?.name ?? '').trim())
        ).filter(Boolean)

        const nextValues = mode === 'add'
          ? Array.from(new Set([...currentValues, ...normalizedValues]))
          : currentValues.filter((item) => !normalizedValues.includes(item))

        if (!isSameStringArray(currentValues, nextValues)) {
          affectedIds.push(resourceId)
        }

        await replaceResourceLabels(resourceId, categoryId, field, nextValues)
        successIds.push(resourceId)
      } catch (error) {
        ResourceService.logger.error('batchUpdateResourceLabels', {
          resourceId,
          field,
          mode,
          values: normalizedValues,
          error
        })
        failedIds.push(resourceId)
      }
    }

    const fieldLabel = field === 'tags' ? '标签' : '分类'
    const actionLabel = mode === 'add' ? '添加' : '移除'
    const messageParts = [`已批量${actionLabel}${fieldLabel}，影响 ${affectedIds.length} 个`]
    if (missingIds.length) {
      messageParts.push(`缺失 ${missingIds.length} 个`)
    }
    if (failedIds.length) {
      messageParts.push(`失败 ${failedIds.length} 个`)
    }

    return {
      type: failedIds.length ? (successIds.length ? 'warning' : 'error') : 'success',
      message: messageParts.join('，'),
      data: {
        affectedIds,
        successIds,
        missingIds,
        failedIds
      }
    }
  }

  static async updateResourceRating(resourceId: string, rating: number) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    const normalizedRating = Number(rating)

    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    if (!Number.isFinite(normalizedRating) || normalizedRating < -1 || normalizedRating > 5) {
      return {
        type: 'warning',
        message: '评分无效',
      }
    }

    const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!existingResource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    await DatabaseService.updateResource({
      id: normalizedResourceId,
      rating: normalizedRating,
    })

    return {
      type: 'success',
      message: '评分更新成功',
    }
  }

  static async updateResourceFavorite(resourceId: string, favorite: boolean) {
    const normalizedResourceId = String(resourceId ?? '').trim()

    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!existingResource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    await DatabaseService.updateResource({
      id: normalizedResourceId,
      ifFavorite: favorite,
    })

    return {
      type: 'success',
      message: favorite ? '已加入收藏' : '已取消收藏',
    }
  }

  static async updateResourceCompleted(resourceId: string, completed: boolean) {
    const normalizedResourceId = String(resourceId ?? '').trim()

    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!existingResource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    await DatabaseService.updateResource({
      id: normalizedResourceId,
      isCompleted: completed,
    })

    const categoryInfo = await DatabaseService.getCategoryById(String(existingResource.categoryId ?? '').trim())
    const extendTableName = getExtendTableName(categoryInfo)
    const completedLabel = extendTableName === 'novel_meta'
      ? '读完'
      : extendTableName === 'video_meta'
        ? '播完'
        : '通关'

    return {
      type: 'success',
      message: completed
        ? `已标记为${completedLabel}`
        : `已取消${completedLabel}标记`,
    }
  }

  static async getResourceDetail(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()

    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    try {
      await ResourceService.syncVideoSubItems(normalizedResourceId)
    } catch (error) {
      ResourceService.logger.warn('getResourceDetail syncVideoSubItems failed', {
        resourceId: normalizedResourceId,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    const detail = await DatabaseService.getResourceDetailById(normalizedResourceId)
    if (!detail) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    return {
      type: 'success',
      message: '获取资源详情成功',
      data: detail,
    }
  }

  static async updateResource(
    resourceId: string,
    resourceForm: ResourceForm,
    options?: {
      silent?: boolean
    }
  ) {
    const normalizedResourceId = String(resourceId ?? '').trim()

    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效',
      }
    }

    const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!existingResource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除',
      }
    }

    try {
      const categoryInfo = await DatabaseService.getCategoryById(resourceForm.categoryId)
      const normalizedResourceForm = {
        ...resourceForm,
        tags: Array.from(new Set(
          (Array.isArray(resourceForm?.tags) ? resourceForm.tags : [])
            .map((item) => String(item ?? '').trim())
            .filter(Boolean)
        ))
      }
      const pathDealResult = await resolveResourcePathInfo(resourceForm, categoryInfo)
      const normalizedMeta = await normalizeResourceMeta(resourceForm.meta, categoryInfo, pathDealResult, normalizedResourceId)
      const currentCoverPath = String(resourceForm.coverPath ?? '').trim()
      const existingCoverPath = String(existingResource.coverPath ?? '').trim()
      const realCoverPath = isSameCoverPath(currentCoverPath, existingCoverPath)
        ? existingCoverPath
        : await resolveResourceCoverPath(currentCoverPath, normalizedResourceId, categoryInfo, pathDealResult)

      const resourceData = {
        id: normalizedResourceId,
        title: resourceForm.name,
        categoryId: resourceForm.categoryId,
        coverPath: realCoverPath,
        description: resourceForm.description,
        basePath: pathDealResult.basePath,
        fileName: pathDealResult.fileName,
        size: normalizedMeta.resourceSize,
        missingStatus: false,
      }

      const authorPayload = await buildAuthorPayload(normalizedResourceId, normalizedResourceForm, categoryInfo)
      const actorPayload = buildActorPayload(normalizedResourceId, normalizedResourceForm)
      const tagPayload = await buildTagPayload(normalizedResourceId, normalizedResourceForm)
      const typePayload = await buildTypePayload(normalizedResourceId, normalizedResourceForm)
      const storeWorks = buildStoreWorkPayloads(normalizedResourceId, normalizedResourceForm, categoryInfo)

      db.transaction((tx) => {
        DatabaseService.updateResource(resourceData, tx)
        DatabaseService.deleteAuthorRefsByResourceId(normalizedResourceId, tx)
        DatabaseService.deleteActorsByResourceId(normalizedResourceId, tx)
        DatabaseService.deleteTagRefsByResourceId(normalizedResourceId, tx)
        DatabaseService.deleteTypeRefsByResourceId(normalizedResourceId, tx)
        DatabaseService.deleteStoreWorkByResourceId(normalizedResourceId, tx)

        if (authorPayload.authorRefs.length) {
          authorPayload.newAuthors.forEach((author) => {
            DatabaseService.insertAuthor(author, tx)
          })
          authorPayload.authorRefs.forEach((authorRef) => {
            DatabaseService.insertAuthorRef(authorRef, tx)
          })
        }

        DatabaseService.insertActors(actorPayload, tx)
        DatabaseService.insertTags(tagPayload.newTags, tx)
        DatabaseService.insertTypes(typePayload.newTypes, tx)
        DatabaseService.insertTagRefs(tagPayload.tagRefs, tx)
        DatabaseService.insertTypeRefs(typePayload.typeRefs, tx)

        if (storeWorks.length) {
          storeWorks.forEach((storeWork) => {
            DatabaseService.insertStoreWork(storeWork, tx)
          })
        }

        syncMeta(tx, categoryInfo, normalizedResourceId, withAudioArtistMeta(categoryInfo, normalizedMeta.meta, authorPayload.displayName))
      })

      await syncResourceMarker(existingResource, {
        id: normalizedResourceId,
        basePath: resourceData.basePath,
        fileName: resourceData.fileName,
        markerEnabled: shouldCreateResourceMarker(categoryInfo, pathDealResult, normalizedMeta.meta)
      })

      await ResourceWatcher.getInstance().untrackResource(normalizedResourceId)
      if (!ResourceService.isVirtualResourceCategory(categoryInfo)) {
        ResourceWatcher.getInstance().trackResource({
          id: normalizedResourceId,
          categoryId: resourceForm.categoryId,
          basePath: resourceData.basePath,
          fileName: resourceData.fileName ?? null,
          missingStatus: false,
        })
      }

      if (!options?.silent) {
        NotificationQueueService.getInstance().pushResourceStateChanged({
          resourceId: normalizedResourceId,
          categoryId: resourceForm.categoryId,
          running: false,
          missingStatus: false,
          changedAt: Date.now(),
        })
      }

      this.scheduleAsmrDurationRefresh(categoryInfo, normalizedResourceId, resourceData.basePath)

      if (ResourceService.isVideoFolderCategory(categoryInfo)) {
        try {
          await ResourceService.syncVideoSubItems(normalizedResourceId)
        } catch (error) {
          ResourceService.logger.warn('updateResource syncVideoSubItems failed', {
            resourceId: normalizedResourceId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      if (ResourceService.isVirtualResourceCategory(categoryInfo)) {
        ResourceService.scheduleWebsiteCoverRefresh(normalizedResourceId)
      }

      return {
        type: 'success',
        message: '修改成功',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        type: 'error',
        message,
      }
    }
  }

  static async checkResourceExistsByPath(basePath: string) {
    const normalizedPath = String(basePath ?? '').trim()

    if (!normalizedPath) {
      return {
        type: 'warning',
        message: '路径不能为空',
        exists: false,
      }
    }

    try {
      const pathDealResult = await dealPath(normalizedPath)
      const existingResource = await DatabaseService.getResourceByStoragePath(
        pathDealResult.basePath,
        pathDealResult.fileName
      )

      return {
        type: 'success',
        message: existingResource ? '资源已存在' : '资源不存在',
        exists: Boolean(existingResource),
        data: existingResource ?? null,
      }
    } catch (error) {
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '校验资源路径失败',
        exists: false,
      }
    }
  }

  private static scheduleAsmrDurationRefresh(categoryInfo: any, resourceId: string, basePath: string) {
    if (getExtendTableName(categoryInfo) !== 'asmr_meta') {
      return
    }

    const normalizedResourceId = String(resourceId ?? '').trim()
    const normalizedBasePath = String(basePath ?? '').trim()
    if (!normalizedResourceId || !normalizedBasePath) {
      return
    }

    setImmediate(async () => {
      try {
        const duration = await getAudioDirectoryDuration(normalizedBasePath)
        DatabaseService.updateAsmrDuration(normalizedResourceId, duration)
      } catch (error) {
        ResourceService.logger.error('scheduleAsmrDurationRefresh', {
          resourceId: normalizedResourceId,
          basePath: normalizedBasePath,
          error: error instanceof Error ? error.message : String(error)
        })
        DatabaseService.updateAsmrDuration(normalizedResourceId, 0)
      }
    })
  }
}

function hasUsefulFetchedData(data: Partial<{
  name: string
  author: string
  description: string
  isbn: string
  publisher: string
  year: number | null
  cover: string
  website: string
  favicon: string
  tag: string[]
  type: string[]
}> | null | undefined) {
  if (!data) {
    return false
  }

  return Boolean(
    String(data.name ?? '').trim()
    || String(data.author ?? '').trim()
    || String(data.description ?? '').trim()
    || String(data.isbn ?? '').trim()
    || String(data.publisher ?? '').trim()
    || Number.isFinite(Number(data.year))
    || String(data.cover ?? '').trim()
    || String(data.website ?? '').trim()
    || String(data.favicon ?? '').trim()
    || (Array.isArray(data.tag) && data.tag.length)
    || (Array.isArray(data.type) && data.type.length)
  )
}

function normalizeWebsiteFetchUrl(input: string, defaultScheme: 'http' | 'https' = 'https') {
  const normalizedInput = String(input ?? '').trim()
  if (!normalizedInput) {
    return ''
  }

  const valueWithScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedInput)
    ? normalizedInput
    : `${defaultScheme}://${normalizedInput}`

  try {
    const parsedUrl = new URL(valueWithScheme)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return ''
    }

    return parsedUrl.toString()
  } catch {
    return ''
  }
}

function buildWebsiteFetchCandidates(input: string) {
  const normalizedInput = String(input ?? '').trim()
  if (!normalizedInput) {
    return []
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedInput)) {
    const normalizedUrl = normalizeWebsiteFetchUrl(normalizedInput)
    return normalizedUrl ? [normalizedUrl] : []
  }

  return Array.from(new Set([
    normalizeWebsiteFetchUrl(normalizedInput, 'https'),
    normalizeWebsiteFetchUrl(normalizedInput, 'http'),
  ].filter(Boolean)))
}

async function resolveWebsiteFetchUrl(
  input: string,
  options?: {
    probeTimeoutMs?: number
    allowGetFallback?: boolean
  }
) {
  const candidates = buildWebsiteFetchCandidates(input)
  if (!candidates.length) {
    return ''
  }

  if (candidates.length === 1) {
    return candidates[0]
  }

  const probeTimeoutMs = Number(options?.probeTimeoutMs) > 0 ? Number(options?.probeTimeoutMs) : 15000
  const allowGetFallback = options?.allowGetFallback !== false

  for (const candidate of candidates) {
    try {
      const headResponse = await probeWebsiteResponse(candidate, 'head', probeTimeoutMs)
      return getAxiosResponseUrl(headResponse, candidate)
    } catch {}

    if (allowGetFallback) {
      try {
        const getResponse = await probeWebsiteResponse(candidate, 'get', probeTimeoutMs)
        return getAxiosResponseUrl(getResponse, candidate)
      } catch {}
    }
  }

  return candidates[0]
}

function isLocalNetworkHostname(hostname: string) {
  const normalizedHostname = String(hostname ?? '').trim().toLowerCase()
  if (!normalizedHostname) {
    return false
  }

  if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.local')) {
    return true
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalizedHostname)) {
    const segments = normalizedHostname.split('.').map((item) => Number(item))
    if (segments.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
      return false
    }

    const [first, second] = segments
    return first === 10
      || first === 127
      || (first === 192 && second === 168)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 169 && second === 254)
  }

  return normalizedHostname === '::1'
    || normalizedHostname.startsWith('fc')
    || normalizedHostname.startsWith('fd')
    || normalizedHostname.startsWith('fe80:')
}

function shouldBypassProxyForUrl(targetUrl: string) {
  const normalizedUrl = String(targetUrl ?? '').trim()
  if (!normalizedUrl) {
    return false
  }

  try {
    const parsedUrl = new URL(normalizedUrl)
    return isLocalNetworkHostname(parsedUrl.hostname)
  } catch {
    return false
  }
}

function isHtmlContentType(contentType: string) {
  const normalizedContentType = String(contentType ?? '').toLowerCase()
  return normalizedContentType.includes('text/html') || normalizedContentType.includes('application/xhtml+xml')
}

function hasAttachmentContentDisposition(contentDisposition: string) {
  return /attachment/i.test(String(contentDisposition ?? ''))
}

function isLikelyDirectDownloadUrl(input: string) {
  const normalizedInput = String(input ?? '').trim()
  if (!normalizedInput) {
    return false
  }

  try {
    const parsedUrl = new URL(normalizedInput)
    const pathname = decodeURIComponent(parsedUrl.pathname || '').toLowerCase()
    const extension = path.extname(pathname)
    return WEBSITE_DIRECT_DOWNLOAD_EXTENSION_SET.has(extension)
  } catch {
    return false
  }
}

function isLikelyDownloadLinkByUrlMetadata(input: string) {
  const normalizedInput = String(input ?? '').trim()
  if (!normalizedInput) {
    return false
  }

  if (isLikelyDirectDownloadUrl(normalizedInput)) {
    return true
  }

  try {
    const parsedUrl = new URL(normalizedInput)
    const contentDisposition = decodeURIComponent(
      String(
        parsedUrl.searchParams.get('response-content-disposition')
        ?? parsedUrl.searchParams.get('content-disposition')
        ?? parsedUrl.searchParams.get('rscd')
        ?? ''
      )
    )
    const responseContentType = String(
      parsedUrl.searchParams.get('response-content-type')
      ?? parsedUrl.searchParams.get('rsct')
      ?? ''
    ).toLowerCase()

    if (hasAttachmentContentDisposition(contentDisposition) || isLikelyDirectDownloadUrl(contentDisposition)) {
      return true
    }

    if (responseContentType && !isHtmlContentType(responseContentType)) {
      return true
    }
  } catch {
    return false
  }

  return false
}

async function probeWebsiteResponse(url: string, method: 'head' | 'get', timeoutMs = 15000) {
  const requestConfig = {
    timeout: timeoutMs,
    maxRedirects: 5,
    validateStatus: (status: number) => status >= 200 && status < 400,
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
      'User-Agent': 'NeoResourceManager/1.0'
    },
    ...(await getAxiosProxyConfig(url)),
  }

  if (method === 'head') {
    return axios.head(url, requestConfig)
  }

  return axios.get<NodeJS.ReadableStream>(url, {
    ...requestConfig,
    responseType: 'stream',
    headers: {
      ...requestConfig.headers,
      Range: 'bytes=0-0',
    },
  })
}

async function readStreamTextUpTo(stream: NodeJS.ReadableStream, maxBytes: number) {
  const normalizedMaxBytes = Math.max(1, Number(maxBytes) || 0)

  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let settled = false

    const cleanup = () => {
      stream.removeListener('data', handleData)
      stream.removeListener('end', handleEnd)
      stream.removeListener('error', handleError)
    }

    const finish = () => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      if (typeof (stream as any).destroy === 'function') {
        ;(stream as any).destroy()
      }
      resolve(Buffer.concat(chunks, totalBytes).toString('utf8'))
    }

    const handleError = (error: unknown) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      if (typeof (stream as any).destroy === 'function') {
        ;(stream as any).destroy()
      }
      reject(error)
    }

    const handleEnd = () => {
      finish()
    }

    const handleData = (chunk: unknown) => {
      if (settled) {
        return
      }

      let buffer: Buffer
      if (Buffer.isBuffer(chunk)) {
        buffer = chunk
      } else if (ArrayBuffer.isView(chunk)) {
        buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      } else if (chunk instanceof ArrayBuffer) {
        buffer = Buffer.from(chunk)
      } else {
        buffer = Buffer.from(String(chunk ?? ''))
      }
      const remainingBytes = normalizedMaxBytes - totalBytes

      if (remainingBytes <= 0) {
        finish()
        return
      }

      if (buffer.length > remainingBytes) {
        chunks.push(buffer.subarray(0, remainingBytes))
        totalBytes += remainingBytes
        finish()
        return
      }

      chunks.push(buffer)
      totalBytes += buffer.length
      if (totalBytes >= normalizedMaxBytes) {
        finish()
      }
    }

    stream.on('data', handleData)
    stream.once('end', handleEnd)
    stream.once('error', handleError)
  })
}

async function fetchWebsiteHtmlPreview(url: string, maxBytes = 256 * 1024, timeoutMs = 20000) {
  const response = await axios.get<NodeJS.ReadableStream>(url, {
    timeout: timeoutMs,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
    responseType: 'stream',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
      'User-Agent': 'NeoResourceManager/1.0'
    },
    ...(await getAxiosProxyConfig(url)),
  })

  const finalUrl = getAxiosResponseUrl(response, url)
  const contentType = String(response.headers?.['content-type'] ?? '').toLowerCase()
  const contentDisposition = String(response.headers?.['content-disposition'] ?? '')
  const stream = response.data

  if (
    isLikelyDirectDownloadUrl(finalUrl)
    || hasAttachmentContentDisposition(contentDisposition)
    || !isHtmlContentType(contentType)
  ) {
    if (stream && typeof (stream as any).destroy === 'function') {
      ;(stream as any).destroy()
    }

    return {
      finalUrl,
      contentType,
      contentDisposition,
      htmlText: '',
    }
  }

  return {
    finalUrl,
    contentType,
    contentDisposition,
    htmlText: await readStreamTextUpTo(stream, maxBytes),
  }
}

async function inspectWebsiteScreenshotTarget(url: string) {
  const normalizedUrl = normalizeWebsiteFetchUrl(url)
  if (!normalizedUrl) {
    return {
      canCapture: false,
      url: '',
      reason: 'invalid-url'
    }
  }

  if (isLikelyDirectDownloadUrl(normalizedUrl)) {
    return {
      canCapture: false,
      url: normalizedUrl,
      reason: 'download-url'
    }
  }

  const methods: Array<'head' | 'get'> = ['head', 'get']
  for (const method of methods) {
    try {
      const response = await probeWebsiteResponse(normalizedUrl, method)
      const finalUrl = getAxiosResponseUrl(response, normalizedUrl)
      const contentType = String(response.headers?.['content-type'] ?? '').toLowerCase()
      const contentDisposition = String(response.headers?.['content-disposition'] ?? '')

      if (method === 'get' && response.data && typeof (response.data as any).destroy === 'function') {
        ;(response.data as any).destroy()
      }

      if (isLikelyDirectDownloadUrl(finalUrl) || hasAttachmentContentDisposition(contentDisposition)) {
        return {
          canCapture: false,
          url: finalUrl,
          reason: 'download-response'
        }
      }

      if (isHtmlContentType(contentType)) {
        return {
          canCapture: true,
          url: finalUrl,
          reason: 'html'
        }
      }
    } catch (error) {
      ResourceService.logger.debug('inspectWebsiteScreenshotTarget probe failed', {
        url: normalizedUrl,
        method,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return {
    canCapture: false,
    url: normalizedUrl,
    reason: 'non-html'
  }
}

function getAxiosResponseUrl(response: any, fallbackUrl: string) {
  return String(response?.request?.res?.responseUrl ?? response?.config?.url ?? fallbackUrl).trim() || fallbackUrl
}

function parseFileNameFromContentDisposition(contentDisposition: unknown) {
  const normalizedValue = String(contentDisposition ?? '').trim()
  if (!normalizedValue) {
    return ''
  }

  const utf8Match = normalizedValue.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim()
    } catch {
      return utf8Match[1].trim()
    }
  }

  const plainMatch = normalizedValue.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i)
  return String(plainMatch?.[1] ?? plainMatch?.[2] ?? '').trim().replace(/^["']|["']$/g, '')
}

function getFileNameFromUrl(targetUrl: string) {
  try {
    const parsedUrl = new URL(targetUrl)
    const pathName = String(parsedUrl.pathname ?? '').trim()
    if (!pathName) {
      return ''
    }

    const fileName = path.basename(decodeURIComponent(pathName))
    return fileName === '/' ? '' : fileName.trim()
  } catch {
    return ''
  }
}

function getHostnameLabel(targetUrl: string) {
  try {
    return String(new URL(targetUrl).hostname ?? '').trim()
  } catch {
    return ''
  }
}

function decodeHtmlEntities(input: string) {
  return String(input ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
}

function stripHtmlTags(input: string) {
  return decodeHtmlEntities(String(input ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function extractHtmlTitle(htmlText: string) {
  const match = String(htmlText ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return stripHtmlTags(match?.[1] ?? '')
}

function extractFaviconUrl(htmlText: string, pageUrl: string) {
  const normalizedHtml = String(htmlText ?? '')
  const linkPattern = /<link\b[^>]*rel=["'][^"']*(?:icon|shortcut icon|apple-touch-icon)[^"']*["'][^>]*>/gi
  const linkMatches = normalizedHtml.match(linkPattern) ?? []

  for (const linkTag of linkMatches) {
    const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i)
    const href = String(hrefMatch?.[1] ?? '').trim()
    if (!href) {
      continue
    }

    try {
      return new URL(href, pageUrl).toString()
    } catch {
      continue
    }
  }

  return ''
}

function buildFallbackFaviconUrl(pageUrl: string) {
  try {
    const parsedUrl = new URL(pageUrl)
    return new URL('/favicon.ico', parsedUrl.origin).toString()
  } catch {
    return ''
  }
}

type ResourcePathInfo = {
  basePath: string
  fileName: string | null
}

async function resolveResourcePathInfo(resourceForm: ResourceForm, categoryInfo: any): Promise<ResourcePathInfo> {
  if (getExtendTableName(categoryInfo) === 'website_meta') {
    const websiteUrl = normalizeWebsiteFetchUrl(String(resourceForm?.meta?.website ?? '').trim(), 'https')
    if (!websiteUrl) {
      throw new Error('网站地址无效')
    }

    return {
      basePath: websiteUrl,
      fileName: null,
    }
  }

  return dealPath(resourceForm.basePath)
}

function getGameSearchRoot(basePath: string) {
  return path.extname(basePath) ? path.dirname(basePath) : basePath
}

function getFileNameWithoutExtension(filePath: string) {
  return path.basename(String(filePath ?? '').trim(), path.extname(String(filePath ?? '').trim()))
}

function getWebsiteLabelByGameId(gameId: string) {
  if (/^RJ\d{6}(?:\d{2})?$/i.test(gameId) || /^BJ\d{6}(?:\d{2})?$/i.test(gameId) || /^VJ\d{6}(?:\d{2})?$/i.test(gameId)) {
    return 'DLsite'
  }

  if (/^d_\d+$/i.test(gameId)) {
    return 'FANZA'
  }

  if (/^RA\d+$/i.test(gameId)) {
    return '072 Project'
  }

  return ''
}

async function buildAuthorPayload(resourceId: string, resourceForm: ResourceForm, categoryInfo?: any) {
  const authorNames = normalizeAuthorNames(resourceForm, categoryInfo)
  const newAuthors: Array<{ id: string; name: string }> = []
  const authorRefs: Array<{ authorId: string; resourceId: string; categoryId: string }> = []

  for (const authorName of authorNames) {
    const existingAuthor = await DatabaseService.getAuthor(authorName)
    const authorId = existingAuthor?.id ?? generateId()

    if (!existingAuthor) {
      newAuthors.push({
        id: authorId,
        name: authorName,
      })
    }

    authorRefs.push({
      authorId,
      resourceId,
      categoryId: resourceForm.categoryId
    })
  }

  return {
    authorNames,
    displayName: joinArtistNames(authorNames),
    newAuthors,
    authorRefs,
  }
}

async function buildTagPayload(resourceId: string, resourceForm: ResourceForm) {
  const dbTagMap: Map<string, any> = new Map()
  const existingTags = await DatabaseService.getTagByCategoryIdWithName(
    resourceForm.categoryId,
    resourceForm.tags
  )
  const existingTagList = existingTags ?? []

  existingTagList.forEach((tag) => {
    dbTagMap.set(tag.name, tag)
  })

  const newTags: any[] = []
  const tagRefs: any[] = []

  resourceForm.tags.forEach((tagName) => {
    if (dbTagMap.has(tagName)) {
      tagRefs.push({
        resourceId,
        tagId: dbTagMap.get(tagName).id
      })
    } else {
      newTags.push({
        id: generateId(),
        name: tagName,
        categoryId: resourceForm.categoryId
      })
      tagRefs.push({
        resourceId,
        tagId: newTags[newTags.length - 1].id
      })
    }
  })

  return {
    newTags,
    tagRefs,
  }
}

function buildActorPayload(resourceId: string, resourceForm: ResourceForm) {
  const actorNames = Array.from(
    new Set((resourceForm.actors ?? []).map((item) => String(item ?? '').trim()).filter(Boolean))
  )

  return actorNames.map((name) => ({
    resourceId,
    name
  }))
}

async function buildTypePayload(resourceId: string, resourceForm: ResourceForm) {
  const dbTypeMap: Map<string, any> = new Map()
  const existingTypes = await DatabaseService.getTypeByCategoryIdWithName(
    resourceForm.categoryId,
    resourceForm.types
  )
  const existingTypeList = existingTypes ?? []

  existingTypeList.forEach((type) => {
    dbTypeMap.set(type.name, type)
  })

  const newTypes: any[] = []
  const typeRefs: any[] = []

  resourceForm.types.forEach((typeName) => {
    if (dbTypeMap.has(typeName)) {
      typeRefs.push({
        resourceId,
        typeId: dbTypeMap.get(typeName).id
      })
    } else {
      newTypes.push({
        id: generateId(),
        name: typeName,
        categoryId: resourceForm.categoryId
      })
      typeRefs.push({
        resourceId,
        typeId: newTypes[newTypes.length - 1].id
      })
    }
  })

  return {
    newTypes,
    typeRefs,
  }
}

async function replaceResourceLabels(
  resourceId: string,
  categoryId: string,
  field: 'tags' | 'types',
  values: string[]
) {
  const normalizedValues = Array.from(new Set((values ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))
  const resourceForm = {
    categoryId,
    tags: field === 'tags' ? normalizedValues : [],
    types: field === 'types' ? normalizedValues : []
  } as ResourceForm

  if (field === 'tags') {
    const tagPayload = await buildTagPayload(resourceId, resourceForm)
    db.transaction((tx) => {
      DatabaseService.deleteTagRefsByResourceId(resourceId, tx)
      DatabaseService.insertTags(tagPayload.newTags, tx)
      DatabaseService.insertTagRefs(tagPayload.tagRefs, tx)
    })
    return
  }

  const typePayload = await buildTypePayload(resourceId, resourceForm)
  db.transaction((tx) => {
    DatabaseService.deleteTypeRefsByResourceId(resourceId, tx)
    DatabaseService.insertTypes(typePayload.newTypes, tx)
    DatabaseService.insertTypeRefs(typePayload.typeRefs, tx)
  })
}

function isSameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  const leftSet = new Set(left)
  const rightSet = new Set(right)

  if (leftSet.size !== rightSet.size) {
    return false
  }

  for (const item of leftSet) {
    if (!rightSet.has(item)) {
      return false
    }
  }

  return true
}

async function resolveMtoolLaunchFile(targetPath: string) {
  if (!targetPath) {
    return null
  }

  if (!await fs.pathExists(targetPath)) {
    return null
  }

  const stats = await fs.stat(targetPath)
  if (stats.isDirectory()) {
    return detectGameLaunchFile(targetPath)
  }

  if (path.extname(targetPath).toLowerCase() === '.exe') {
    return targetPath
  }

  return detectGameLaunchFile(path.dirname(targetPath))
}

function buildStoreWorkPayloads(resourceId: string, resourceForm: ResourceForm, categoryInfo?: any) {
  if (getExtendTableName(categoryInfo) === 'multi_image_meta') {
    return []
  }

  const storeItems = [
    {
      websiteType: String(resourceForm.meta.websiteType ?? '').trim(),
      workId: String(resourceForm.meta.gameId ?? '').trim(),
      url: String(resourceForm.meta.website ?? '').trim()
    },
    ...((Array.isArray(resourceForm.meta.additionalStores) ? resourceForm.meta.additionalStores : []).map((item: any) => ({
      websiteType: String(item?.websiteType ?? '').trim(),
      workId: String(item?.workId ?? '').trim(),
      url: String(item?.website ?? '').trim()
    })))
  ]

  const seen = new Set<string>()

  return storeItems
    .filter((item) => item.websiteType && (item.workId || item.url))
    .filter((item) => {
      const uniqueKey = `${item.websiteType}::${item.workId}`
      if (seen.has(uniqueKey)) {
        return false
      }

      seen.add(uniqueKey)
      return true
    })
    .map((item) => ({
      resourceId,
      storeId: item.websiteType,
      workId: item.workId,
      url: item.url || ''
    }))
}

async function syncResourceMarker(
  previousResource: { basePath: string; fileName: string | null } | null | undefined,
  nextResource: { id: string; basePath: string; fileName: string | null; markerEnabled?: boolean }
) {
  if (previousResource?.basePath) {
    const previousMarkerCandidates = getMarkerFilePathCandidates(previousResource.basePath, nextResource.id)
    for (const markerPath of previousMarkerCandidates) {
      if (await fs.pathExists(markerPath)) {
        await fs.remove(markerPath)
      }
    }
  }

  if (nextResource.markerEnabled === false) {
    return
  }

  const markerCreated = await writeResourceMarker({
    resourceId: nextResource.id,
    basePath: nextResource.basePath,
    fileName: nextResource.fileName,
    markerEnabled: nextResource.markerEnabled
  })

  if (!markerCreated) {
    ResourceService.logger.warn('syncResourceMarker skipped because marker could not be written', {
      resourceId: nextResource.id,
      basePath: nextResource.basePath,
      fileName: nextResource.fileName,
    })
  }
}

async function writeResourceMarker(resource: { resourceId: string; basePath: string; fileName: string | null; markerEnabled?: boolean }) {
  if (resource.markerEnabled === false) {
    return true
  }

  const markerDir = getMarkerDirectory(resource.basePath)
  const markerFilePath = getMarkerFilePath(resource.basePath, resource.resourceId)
  const markerPayload = await buildResourceMarkerPayload(resource.resourceId, resource.basePath, resource.fileName ?? null)

  try {
    await fs.ensureDir(markerDir)
    await fs.writeJson(markerFilePath, markerPayload, { spaces: 2 })
    hidefile.hide(markerDir, () => undefined)
    hidefile.hide(markerFilePath, () => undefined)
    return true
  } catch (error) {
    ResourceService.logger.warn('failed to write resource marker', {
      resourceId: resource.resourceId,
      basePath: resource.basePath,
      fileName: resource.fileName,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

function shouldCreateResourceMarker(categoryInfo: any, pathInfo: ResourcePathInfo, meta: ResourceMeta) {
  if (getExtendTableName(categoryInfo) === 'website_meta') {
    return false
  }

  if (getExtendTableName(categoryInfo) !== 'software_meta') {
    return true
  }

  const targetPath = getResolvedFilePath(pathInfo)
  const commandLineArgs = String(meta?.commandLineArgs ?? '').trim()

  if (!targetPath || !commandLineArgs) {
    return true
  }

  return !isCommandShellExecutable(targetPath) && !isPowerShellExecutable(targetPath)
}

async function removeResourceMarker(resource: { id: string; basePath: string; fileName: string | null }) {
  const markerDir = getMarkerDirectory(resource.basePath)
  const markerCandidates = getMarkerFilePathCandidates(resource.basePath, resource.id)

  for (const markerPath of markerCandidates) {
    if (await fs.pathExists(markerPath)) {
      await fs.remove(markerPath)
    }
  }

  if (!await fs.pathExists(markerDir)) {
    return
  }

  const remainingEntries = await fs.readdir(markerDir)
  if (!remainingEntries.length) {
    await fs.remove(markerDir)
  }
}

function findGameIdInText(input: string) {
  const matchers = [
    /RJ\d{6}(?:\d{2})?/i,
    /BJ\d{6}(?:\d{2})?/i,
    /VJ\d{6}(?:\d{2})?/i,
    /d_\d+/i,
    /RA\d+/i,
  ]

  for (const matcher of matchers) {
    const matched = input.match(matcher)?.[0]
    if (matched) {
      if (/^d_/i.test(matched)) {
        return `d_${matched.slice(2)}`
      }

      return matched.toUpperCase()
    }
  }

  return ''
}

async function findGameIdInDirectory(searchRoot: string, basePath: string) {
  const directCandidates = buildDirectGameIdCandidates(searchRoot, basePath)
  for (const candidate of directCandidates) {
    const directMatch = findGameIdInText(candidate)
    if (directMatch) {
      return directMatch
    }
  }

  try {
    const entries = await fs.readdir(searchRoot)
    const prioritizedEntries = entries
      .filter((entry: string) => isHighConfidenceGameIdCandidate(entry))
      .slice(0, 200)

    for (const entry of prioritizedEntries) {
      const entryMatch = findGameIdInText(entry)
      if (entryMatch) {
        return entryMatch
      }
    }
  } catch {
    return ''
  }

  return ''
}

async function resolveWebsiteTypeByGameId(gameId: string, dictType: string) {
  const websiteLabel = getWebsiteLabelByGameId(String(gameId ?? '').trim())
  if (!websiteLabel) {
    return ''
  }

  const websiteOptions = await DatabaseService.getSelectDictData(dictType)
  const matchedWebsite = websiteOptions.find((option) => String(option?.label ?? '').trim() === websiteLabel)
  return String(matchedWebsite?.value ?? '').trim()
}

let cachedComicMetaWebsiteId: string | null = null

async function resolveComicMetaWebsiteId() {
  if (cachedComicMetaWebsiteId !== null) {
    return cachedComicMetaWebsiteId
  }

  const siteOptions = await DatabaseService.getSelectDictData(DictType.MANGA_SITE_TYPE)
  const matchedOption = siteOptions.find((item: any) => String(item?.label ?? '').trim().toLowerCase() === 'comicmeta')
  cachedComicMetaWebsiteId = String(matchedOption?.value ?? '').trim()
  return cachedComicMetaWebsiteId
}

function normalizeComicSearchKeyword(value: string) {
  return String(value ?? '')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildDirectGameIdCandidates(searchRoot: string, basePath: string) {
  const normalizedBasePath = path.normalize(basePath)
  const selectedName = path.basename(normalizedBasePath)
  const searchRootName = path.basename(searchRoot)
  const parentName = path.basename(path.dirname(searchRoot))

  return Array.from(new Set([
    normalizedBasePath,
    selectedName,
    searchRoot,
    searchRootName,
    parentName,
  ].filter(Boolean)))
}

function isHighConfidenceGameIdCandidate(entryName: string) {
  return /(?:^|[^A-Za-z0-9])(RJ\d{6}(?:\d{2})?|VJ\d{6}(?:\d{2})?|RA\d+|d_\d+)(?:$|[^A-Za-z0-9])/i.test(entryName)
}

/**
 * 处理封面图
 * 将封面图转换为webp格式并保存在cache/thumbnails目录下 文件名为resourceId.webp
 * 返回保存的webp图片路径
 * @param coverPath 前端传入的封面图片路径
 * @param resourceId 资源id
 */
async function isImageTooLargeForCover(input: string | Buffer) {
  try {
    const metadata = await sharp(input, { limitInputPixels: false, animated: false }).metadata()
    const width = Number(metadata.width ?? 0)
    const height = Number(metadata.height ?? 0)
    return width > 0 && height > 0 && width * height > MAX_COVER_PROCESS_PIXELS
  } catch {
    return false
  }
}

async function dealCover(coverPath: string, resourceId: string): Promise<string> {
  if (!coverPath) return ''

  const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)

  if (!cacheSetting) {
    throw new Error('未配置缓存目录')
  }

  const cachePath = path.join(cacheSetting.value, 'thumbnails')

  await fs.ensureDir(cachePath)

  const createTargetPath = () => path.join(cachePath, `${resourceId}-${Date.now()}-${generateId()}.webp`)
  const writeProcessedCover = async (input: string | Buffer) => {
    const targetPath = createTargetPath()
    const tempTargetPath = `${targetPath}.tmp`
    await sharp(input, { limitInputPixels: MAX_COVER_PROCESS_PIXELS, animated: false })
      .resize({width: 560, fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}})
      .webp()
      .toFile(tempTargetPath)

    await fs.move(tempTargetPath, targetPath, { overwrite: true })
    return targetPath
  }

  const normalizedCoverPath = normalizeRemoteCoverPath(coverPath)
  const dataUrlMatch = normalizedCoverPath.match(/^data:([^;,]+)?;base64,(.+)$/i)
  if (dataUrlMatch) {
    try {
      const imageBuffer = Buffer.from(dataUrlMatch[2], 'base64')
      if (await isImageTooLargeForCover(imageBuffer)) {
        return ''
      }

      return await writeProcessedCover(imageBuffer)
    } catch (error) {
      ResourceService.logger.warn('dealCover skipped invalid data url cover', {
        resourceId,
        error: error instanceof Error ? error.message : String(error)
      })
      return ''
    }
  }

  if (!isRemoteCoverPath(normalizedCoverPath)) {
    const normalizedInputPath = path.normalize(path.resolve(normalizedCoverPath))
    const fileName = path.basename(normalizedInputPath)
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (fileName.toLowerCase().startsWith(`${normalizedResourceId.toLowerCase()}-`) && fileName.toLowerCase().endsWith('.webp')) {
      return normalizedInputPath
    }
  }

  if (isRemoteCoverPath(normalizedCoverPath)) {
    const response = await axios.get<ArrayBuffer>(normalizedCoverPath, {
      responseType: 'arraybuffer',
      timeout: 20000,
      ...(await getAxiosProxyConfig()),
    })

    const imageBuffer = Buffer.from(response.data)
    if (await isImageTooLargeForCover(imageBuffer)) {
      return ''
    }

    return await writeProcessedCover(imageBuffer)
  }

  const normalizedInputPath = path.normalize(path.resolve(normalizedCoverPath))
  const fileName = path.basename(normalizedInputPath)
  const normalizedResourceId = String(resourceId ?? '').trim()
  if (fileName.toLowerCase().startsWith(`${normalizedResourceId.toLowerCase()}-`) && fileName.toLowerCase().endsWith('.webp')) {
    return normalizedInputPath
  }

  const exists = await fs.pathExists(normalizedInputPath)
  if (!exists) {
    throw new Error('封面图片不存在')
  }

  if (await isImageTooLargeForCover(normalizedInputPath)) {
    return ''
  }

  return await writeProcessedCover(normalizedInputPath)
}

async function cacheWebsiteFaviconToCache(faviconPath: string, resourceId: string) {
  const normalizedFaviconPath = String(faviconPath ?? '').trim()
  const normalizedResourceId = String(resourceId ?? '').trim()
  if (!normalizedFaviconPath) {
    return ''
  }

  if (!normalizedResourceId) {
    return normalizedFaviconPath
  }

  try {
    return await dealCover(normalizedFaviconPath, `${normalizedResourceId}-favicon`)
  } catch (error) {
    if (isRemoteCoverPath(normalizedFaviconPath)) {
      const fallbackCachedPath = await cacheRawRemoteFaviconAsset(normalizedFaviconPath, normalizedResourceId)
      if (fallbackCachedPath) {
        return fallbackCachedPath
      }
    }

    ResourceService.logger.warn('cacheWebsiteFaviconToCache skipped invalid favicon', {
      resourceId: normalizedResourceId,
      faviconPath: normalizedFaviconPath,
      error: error instanceof Error ? error.message : String(error)
    })
    return normalizedFaviconPath
  }
}

async function cacheRawRemoteFaviconAsset(faviconUrl: string, resourceId: string) {
  try {
    const cacheRoot = await getCacheRootDirectory()
    const faviconCacheDirectory = path.join(cacheRoot, 'website-favicons')
    await fs.ensureDir(faviconCacheDirectory)

    const parsedUrl = new URL(faviconUrl)
    const pathname = String(parsedUrl.pathname ?? '')
    const extension = path.extname(pathname).trim().toLowerCase()
    const safeExtension = extension && extension.length <= 8 ? extension : '.ico'
    const targetPath = path.join(faviconCacheDirectory, `${resourceId}-${Date.now()}-${generateId()}${safeExtension}`)

    const response = await axios.get<ArrayBuffer>(faviconUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
      ...(await getAxiosProxyConfig()),
    })

    await fs.writeFile(targetPath, Buffer.from(response.data))
    return targetPath
  } catch (error) {
    ResourceService.logger.warn('cacheRawRemoteFaviconAsset failed', {
      resourceId,
      faviconUrl,
      error: error instanceof Error ? error.message : String(error)
    })
    return ''
  }
}

async function getCacheRootDirectory() {
  const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)
  const cacheRoot = String(cacheSetting?.value ?? Settings.CACHE_PATH.default).trim()

  if (!cacheRoot || cacheRoot === '__CACHE_PATH__') {
    throw new Error('未配置缓存目录')
  }

  return cacheRoot
}

async function getManagedWebsiteCoverPath(resourceId: string) {
  const cacheRoot = await getCacheRootDirectory()
  return path.join(cacheRoot, 'website-covers', `${String(resourceId ?? '').trim()}.webp`)
}

function normalizeCoverStoragePath(value: string) {
  const normalizedValue = String(value ?? '').trim()
  if (!normalizedValue || /^https?:\/\//i.test(normalizedValue) || /^data:/i.test(normalizedValue)) {
    return normalizedValue
  }

  return path.normalize(path.resolve(normalizedValue)).toLowerCase()
}

function isSameManagedWebsiteCoverPath(currentCoverPath: string, managedCoverPath: string) {
  const normalizedCurrentCoverPath = normalizeCoverStoragePath(currentCoverPath)
  const normalizedManagedCoverPath = normalizeCoverStoragePath(managedCoverPath)
  return Boolean(normalizedCurrentCoverPath) && normalizedCurrentCoverPath === normalizedManagedCoverPath
}

async function removeManagedWebsiteCover(resourceId: string) {
  const managedCoverPath = await getManagedWebsiteCoverPath(resourceId)
  if (await fs.pathExists(managedCoverPath)) {
    await fs.remove(managedCoverPath)
  }
}

async function writeManagedWebsiteCover(resourceId: string, imageBuffer: Buffer) {
  const outputPath = await getManagedWebsiteCoverPath(resourceId)
  const outputDirectory = path.dirname(outputPath)
  const tempPath = `${outputPath}.tmp`
  await fs.ensureDir(outputDirectory)
  await sharp(imageBuffer, {
    limitInputPixels: MAX_COVER_PROCESS_PIXELS,
    animated: false,
  })
    .resize({
      width: 1280,
      height: 720,
      fit: 'cover',
      position: 'attention'
    })
    .webp({ quality: 84 })
    .toFile(tempPath)

  await fs.move(tempPath, outputPath, { overwrite: true })
  return outputPath
}

async function applyWebsiteScreenshotWindowProxy(window: BrowserWindow, targetUrl: string) {
  const proxyConfig = await getAxiosProxyConfig(targetUrl)
  const proxy = (proxyConfig as any)?.proxy
  if (!proxy?.host || !Number.isFinite(Number(proxy.port)) || Number(proxy.port) <= 0) {
    return
  }

  await window.webContents.session.setProxy({
    proxyRules: `${String(proxy.protocol ?? 'http')}://${proxy.host}:${proxy.port}`
  })
}

function waitForTimeout(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function captureWebsiteCoverBuffer(url: string, resourceId: string) {
  const partition = `website-cover-${String(resourceId ?? '').trim()}-${Date.now()}`
  const screenshotWindow = new BrowserWindow({
    show: false,
    width: WEBSITE_COVER_CAPTURE_WIDTH,
    height: WEBSITE_COVER_CAPTURE_HEIGHT,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    }
  })

  let downloadBlocked = false
  const downloadHandler = (event: Electron.Event) => {
    downloadBlocked = true
    event.preventDefault()
  }

  try {
    await applyWebsiteScreenshotWindowProxy(screenshotWindow, url)
    screenshotWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    screenshotWindow.webContents.session.on('will-download', downloadHandler)
    screenshotWindow.webContents.setAudioMuted(true)

    await Promise.race([
      screenshotWindow.loadURL(url, {
        userAgent: 'NeoResourceManager/1.0'
      }),
      waitForTimeout(WEBSITE_COVER_CAPTURE_TIMEOUT_MS).then(() => {
        throw new Error('网站封面截图超时')
      })
    ])

    if (downloadBlocked) {
      throw new Error('该链接指向下载内容，已跳过网页封面截图')
    }

    await screenshotWindow.webContents.insertCSS(`
html, body {
  background: #ffffff !important;
}
::-webkit-scrollbar {
  display: none !important;
}
[class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"], [aria-modal="true"] {
  opacity: 0 !important;
  pointer-events: none !important;
}
    `)

    await screenshotWindow.webContents.executeJavaScript(`
(() => {
  window.scrollTo(0, 0)
  const selectors = ['[class*="cookie"]', '[id*="cookie"]', '[class*="consent"]', '[id*="consent"]', '[aria-modal="true"]']
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement) {
        node.style.display = 'none'
      }
    })
  }
  return true
})()
    `)

    await waitForTimeout(WEBSITE_COVER_STABILIZE_DELAY_MS)
    const capturedImage = await screenshotWindow.webContents.capturePage()
    const screenshotBuffer = capturedImage.toPNG()

    if (!screenshotBuffer.length) {
      throw new Error('网站封面截图为空')
    }

    return screenshotBuffer
  } finally {
    screenshotWindow.webContents.session.removeListener('will-download', downloadHandler)
    if (!screenshotWindow.isDestroyed()) {
      screenshotWindow.destroy()
    }
  }
}

async function resolveResourceCoverPath(
  coverPath: string,
  resourceId: string,
  categoryInfo: any,
  pathInfo: ResourcePathInfo
) {
  const extendTableName = getExtendTableName(categoryInfo)

  if (extendTableName === 'single_image_meta') {
    return getResolvedFilePath(pathInfo)
  }

  if (extendTableName === 'multi_image_meta') {
    const resolvedDirectoryPath = String(pathInfo?.basePath ?? '').trim()
    if (resolvedDirectoryPath) {
      const imagePaths = await getDirectoryImageFiles(resolvedDirectoryPath)
      const autoCoverPath = pickMultiImageCoverPath(resolvedDirectoryPath, imagePaths)
      if (autoCoverPath) {
        return dealCover(autoCoverPath, resourceId)
      }
    }
  }

  if (extendTableName === 'video_meta' && !String(coverPath ?? '').trim()) {
    const resolvedVideoPath = getResolvedFilePath(pathInfo)
    if (resolvedVideoPath) {
      try {
        return await ensureVideoCoverPath(resourceId, resolvedVideoPath)
      } catch (error) {
        ResourceService.logger.warn('resolveResourceCoverPath skipped default video cover', {
          resourceId,
          videoPath: resolvedVideoPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  try {
    return await dealCover(coverPath, resourceId)
  } catch (error) {
    // Some embedded album art uses formats unsupported by sharp. For music,
    // skipping the cover is better than failing the whole import/save flow.
    if (extendTableName === 'audio_meta') {
      ResourceService.logger.warn('resolveResourceCoverPath skipped invalid audio cover', {
        resourceId,
        coverPath,
        error: error instanceof Error ? error.message : String(error)
      })
      return ''
    }

    throw error
  }
}

async function normalizeResourceMeta(
  meta: ResourceMeta,
  categoryInfo: any,
  pathInfo: ResourcePathInfo,
  resourceId?: string
) {
  const normalizedMeta: ResourceMeta = {
    ...meta,
  }

  let resourceSize: number | null = null

  if (getExtendTableName(categoryInfo) === 'single_image_meta') {
    const imagePath = getResolvedFilePath(pathInfo)
    if (imagePath) {
      const imageInfo = await readSingleImageFileInfo(imagePath)
      resourceSize = imageInfo.size

      if (imageInfo.resolution) {
        normalizedMeta.resolution = imageInfo.resolution
      }

      if (imageInfo.format && !String(normalizedMeta.format ?? '').trim()) {
        normalizedMeta.format = imageInfo.format
      }
    }
  }

  if (resourceSize == null) {
    resourceSize = await resolveResourceStorageSize(categoryInfo, pathInfo, normalizedMeta)
  }

  if (getExtendTableName(categoryInfo) === 'asmr_meta') {
    normalizedMeta.duration = -1
  }

  if (getExtendTableName(categoryInfo) === 'audio_meta') {
    const audioPath = getResolvedFilePath(pathInfo)
    if (audioPath) {
      const audioInfo = await readSingleAudioFileInfo(audioPath)

      if (audioInfo.duration > 0) {
        normalizedMeta.duration = audioInfo.duration
      }

      if (audioInfo.artist && !String(normalizedMeta.artist ?? '').trim()) {
        normalizedMeta.artist = audioInfo.artist
      }

      if (audioInfo.album && !String(normalizedMeta.album ?? '').trim()) {
        normalizedMeta.album = audioInfo.album
      }

      if (!String(normalizedMeta.lyricsPath ?? '').trim()) {
        normalizedMeta.lyricsPath = await findMatchedLyricsPath(audioPath)
      }
    }
  }

  if (getExtendTableName(categoryInfo) === 'website_meta') {
    normalizedMeta.website = String(pathInfo?.basePath ?? '').trim() || normalizeWebsiteFetchUrl(String(normalizedMeta.website ?? '').trim())
    const websiteTarget = String(normalizedMeta.website ?? '').trim()
    normalizedMeta.isDownloadLink = Boolean(normalizedMeta.isDownloadLink)
      || isLikelyDownloadLinkByUrlMetadata(websiteTarget)

    normalizedMeta.favicon = normalizedMeta.isDownloadLink
      ? ''
      : await cacheWebsiteFaviconToCache(
        String(normalizedMeta.favicon ?? '').trim(),
        String(resourceId ?? '').trim()
      )
  }

  return {
    meta: normalizedMeta,
    resourceSize,
  }
}

async function resolveResourceStorageSize(
  categoryInfo: any,
  pathInfo: ResourcePathInfo,
  meta: ResourceMeta
) {
  const extendTable = getExtendTableName(categoryInfo)

  if (['multi_image_meta', 'asmr_meta'].includes(extendTable)) {
    return getDirectorySize(pathInfo.basePath)
  }

  if (['game_meta', 'audio_meta'].includes(extendTable)) {
    const targetPath = getResolvedFilePath(pathInfo)
    return targetPath ? getFileSize(targetPath) : null
  }

  if (extendTable === 'software_meta') {
    const commandLineArgs = String(meta?.commandLineArgs ?? '').trim()
    if (commandLineArgs) {
      return null
    }

    const targetPath = getResolvedFilePath(pathInfo)
    return targetPath ? getFileSize(targetPath) : null
  }

  return null
}

async function getFileSize(targetPath: string) {
  try {
    const fileStat = await fs.stat(targetPath)
    return Number.isFinite(Number(fileStat.size)) ? Number(fileStat.size) : null
  } catch {
    return null
  }
}

async function getDirectorySize(directoryPath: string) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true })
    let totalSize = 0

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        totalSize += Number(await getDirectorySize(entryPath) ?? 0)
        continue
      }

      if (entry.isFile()) {
        totalSize += Number(await getFileSize(entryPath) ?? 0)
      }
    }

    return totalSize
  } catch {
    return null
  }
}

async function getAudioDirectoryDuration(directoryPath: string) {
  const audioFiles = await getDirectoryAudioFiles(directoryPath)
  if (!audioFiles.length) {
    return 0
  }

  let totalDurationSeconds = 0

  for (const filePath of audioFiles) {
    try {
      const metadata = await parseFile(filePath, {
        duration: true,
        skipPostHeaders: true
      })
      const durationSeconds = Number(metadata.format.duration ?? 0)
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        totalDurationSeconds += durationSeconds
      }
    } catch (error) {
      ResourceService.logger.warn('getAudioDirectoryDuration parseFile failed', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return Math.max(0, Math.round(totalDurationSeconds))
}

async function readSingleImageFileInfo(imagePath: string) {
  const fileStat = await fs.stat(imagePath)
  const metadata = await sharp(imagePath).metadata()
  const width = Number(metadata.width ?? 0)
  const height = Number(metadata.height ?? 0)
  const normalizedFormat = String(metadata.format ?? path.extname(imagePath).replace('.', '')).trim().toLowerCase()

  return {
    size: Number.isFinite(fileStat.size) ? fileStat.size : null,
    resolution: width > 0 && height > 0 ? `${width}x${height}` : '',
    format: normalizedFormat,
  }
}

async function readSingleAudioFileInfo(filePath: string) {
  try {
    const metadata = await parseFile(filePath, {
      duration: true,
      skipPostHeaders: true
    })
    const duration = Number(metadata.format.duration ?? 0)
    const bitrate = Number(metadata.format.bitrate ?? 0)
    const sampleRate = Number(metadata.format.sampleRate ?? 0)
    const artists = normalizeArtistNameList([
      ...(Array.isArray(metadata.common.artists) ? metadata.common.artists : []),
      String(metadata.common.artist ?? '').trim()
    ])
    const embeddedCoverPath = await extractEmbeddedAudioCoverToCache(metadata.common.picture?.[0])

    return {
      duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0,
      bitrate: Number.isFinite(bitrate) && bitrate > 0 ? Math.round(bitrate) : null,
      sampleRate: Number.isFinite(sampleRate) && sampleRate > 0 ? Math.round(sampleRate) : null,
      artists,
      artist: joinArtistNames(artists),
      album: normalizeAudioTagText(String(metadata.common.album ?? '').trim()),
      embeddedCoverPath,
    }
  } catch {
    return {
      duration: 0,
      bitrate: null,
      sampleRate: null,
      artists: [],
      artist: '',
      album: '',
      embeddedCoverPath: '',
    }
  }
}

function normalizeAuthorNames(resourceForm: ResourceForm, categoryInfo?: any) {
  const includeAuthorList = getExtendTableName(categoryInfo) === 'audio_meta'
  if (includeAuthorList) {
    return normalizeArtistNameList([
      ...(Array.isArray(resourceForm.authors) ? resourceForm.authors : []),
      String(resourceForm.author ?? '').trim()
    ])
  }

  return normalizeAuthorNameList([String(resourceForm.author ?? '').trim()])
}

function normalizeArtistNameList(values: string[]) {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values ?? []) {
    const rawText = String(value ?? '').trim()
    if (!rawText) {
      continue
    }

    const splitValues = splitArtistText(rawText)
    for (const splitValue of splitValues) {
      const normalizedValue = normalizeAudioTagText(splitValue).trim()
      const normalizedKey = normalizedValue.toLowerCase()
      if (!normalizedValue || seen.has(normalizedKey)) {
        continue
      }

      seen.add(normalizedKey)
      result.push(normalizedValue)
    }
  }

  return result
}

function normalizeAuthorNameList(values: string[]) {
  return normalizeNameList(values, splitAuthorText)
}

function normalizeNameList(values: string[], splitter: (value: string) => string[]) {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values ?? []) {
    const rawText = String(value ?? '').trim()
    if (!rawText) {
      continue
    }

    for (const splitValue of splitter(rawText)) {
      const normalizedValue = normalizeAudioTagText(splitValue).trim()
      const normalizedKey = normalizedValue.toLowerCase()
      if (!normalizedValue || seen.has(normalizedKey)) {
        continue
      }

      seen.add(normalizedKey)
      result.push(normalizedValue)
    }
  }

  return result
}

function splitAuthorText(input: string) {
  const normalizedInput = String(input ?? '').trim()
  if (!normalizedInput) {
    return []
  }

  const protectedParts: string[] = []
  const placeholderPrefix = '\uE000AUTHOR_PART_'
  const protectedInput = normalizedInput.replace(/(\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】)/g, (part) => {
    const placeholder = `${placeholderPrefix}${protectedParts.length}\uE001`
    protectedParts.push(part)
    return placeholder
  })

  return protectedInput
    .split(/\s*(?:，|、|；|;|\|)\s*/)
    .map((item) => item.replace(new RegExp(`${placeholderPrefix}(\\d+)\\uE001`, 'g'), (_match, index) => protectedParts[Number(index)] ?? ''))
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitArtistText(input: string) {
  const normalizedInput = String(input ?? '').trim()
  if (!normalizedInput) {
    return []
  }

  return normalizedInput
    .split(/\s*(?:\/|／|,|，|、|;|；|\||·| feat\. | ft\. | featuring | with | x | × | & | ＆ )\s*/i)
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinArtistNames(names: string[]) {
  return normalizeArtistNameList(names).join(' / ')
}

function withAudioArtistMeta(categoryInfo: any, meta: ResourceMeta, artistDisplayName: string) {
  if (getExtendTableName(categoryInfo) !== 'audio_meta') {
    return meta
  }

  return {
    ...meta,
    artist: artistDisplayName || String(meta.artist ?? '').trim()
  }
}

async function findMatchedLyricsPath(audioFilePath: string) {
  const normalizedAudioFilePath = path.normalize(String(audioFilePath ?? '').trim())
  if (!normalizedAudioFilePath) {
    return ''
  }

  const directoryPath = path.dirname(normalizedAudioFilePath)
  const fileStem = path.basename(normalizedAudioFilePath, path.extname(normalizedAudioFilePath))
  const lyricsExtensions = ['.lrc', '.srt', '.vtt']

  const exactCandidates = lyricsExtensions.map((extension) => path.join(directoryPath, `${fileStem}${extension}`))
  for (const candidatePath of exactCandidates) {
    if (await fs.pathExists(candidatePath)) {
      return candidatePath
    }
  }

  return ''
}

function resolvePreferredArtistName(artist?: string, artists?: string[]) {
  const normalizedArtists = normalizeArtistNameList([
    ...(Array.isArray(artists) ? artists : []),
    String(artist ?? '').trim()
  ])

  return String(normalizedArtists[0] ?? '').trim()
}

function buildAudioLyricsFilePath(audioFilePath: string) {
  const normalizedAudioFilePath = path.normalize(String(audioFilePath ?? '').trim())
  const directoryPath = path.dirname(normalizedAudioFilePath)
  const fileStem = path.basename(normalizedAudioFilePath, path.extname(normalizedAudioFilePath))
  return path.join(directoryPath, `${fileStem}.lrc`)
}

function getImageExtensionByContentType(contentType: string) {
  const normalizedContentType = String(contentType ?? '').toLowerCase()
  if (normalizedContentType.includes('png')) {
    return '.png'
  }
  if (normalizedContentType.includes('webp')) {
    return '.webp'
  }
  if (normalizedContentType.includes('gif')) {
    return '.gif'
  }
  if (normalizedContentType.includes('bmp')) {
    return '.bmp'
  }

  return '.jpg'
}

async function writeFetchedAudioCoverToCache(buffer: Buffer, extension: string) {
  const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)

  if (!cacheSetting) {
    throw new Error('未配置缓存目录')
  }

  const cachePath = path.join(cacheSetting.value, 'audio-covers')
  await fs.ensureDir(cachePath)
  const filePath = path.join(cachePath, `${generateId()}${extension}`)
  await fs.writeFile(filePath, buffer)
  return filePath
}

async function extractEmbeddedAudioCoverToCache(picture?: { data?: Uint8Array; format?: string } | null) {
  const imageData = picture?.data
  if (!imageData || !imageData.length) {
    return ''
  }

  const pictureFormat = String(picture?.format ?? '').trim().toLowerCase()
  const extension = getImageExtensionByContentType(pictureFormat || 'image/jpeg')
  return writeFetchedAudioCoverToCache(Buffer.from(imageData), extension)
}

function normalizeAudioTagText(input: string) {
  const normalizedInput = String(input ?? '').trim()
  if (!normalizedInput) {
    return ''
  }

  if (/[\u3400-\u9fff]/.test(normalizedInput)) {
    return normalizedInput
  }

  if (!/[À-ÿ]/.test(normalizedInput)) {
    return normalizedInput
  }

  const sourceBuffer = Buffer.from(normalizedInput, 'latin1')
  const decoderCandidates = ['gb18030', 'utf-8'] as const
  const decodedCandidates = decoderCandidates
    .map((encoding) => {
      try {
        return new TextDecoder(encoding).decode(sourceBuffer).trim()
      } catch {
        return ''
      }
    })
    .filter(Boolean)

  const scoredCandidates = [normalizedInput, ...decodedCandidates]
    .map((candidate) => ({
      value: candidate,
      score: scoreDecodedAudioTagText(candidate)
    }))
    .sort((left, right) => right.score - left.score)

  return scoredCandidates[0]?.value ?? normalizedInput
}

function scoreDecodedAudioTagText(input: string) {
  const normalizedInput = String(input ?? '').trim()
  if (!normalizedInput) {
    return -100
  }

  let score = 0

  if (/[\u3400-\u9fff]/.test(normalizedInput)) {
    score += 10
  }

  if (/[A-Za-z0-9]/.test(normalizedInput)) {
    score += 2
  }

  if (/[À-ÿ]/.test(normalizedInput)) {
    score -= 4
  }

  if (/[ÃÐÑØÖ×ÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/.test(normalizedInput)) {
    score -= 6
  }

  return score
}

function getResolvedFilePath(pathInfo: ResourcePathInfo) {
  if (!pathInfo?.fileName) {
    return ''
  }

  return path.join(pathInfo.basePath, pathInfo.fileName)
}

function getExtendTableName(categoryInfo: any) {
  return String(categoryInfo?.meta?.extra?.extendTable ?? '').trim()
}

function normalizeRemoteCoverPath(coverPath: string) {
  if (coverPath.startsWith('//')) {
    return `https:${coverPath}`
  }

  return coverPath
}

function isSameCoverPath(left: string, right: string) {
  const normalizedLeft = String(left ?? '').trim()
  const normalizedRight = String(right ?? '').trim()

  if (!normalizedLeft || !normalizedRight) {
    return normalizedLeft === normalizedRight
  }

  const normalizedLeftRemote = normalizeRemoteCoverPath(normalizedLeft)
  const normalizedRightRemote = normalizeRemoteCoverPath(normalizedRight)

  if (isRemoteCoverPath(normalizedLeftRemote) || isRemoteCoverPath(normalizedRightRemote)) {
    return normalizedLeftRemote === normalizedRightRemote
  }

  return path.normalize(path.resolve(normalizedLeftRemote)).toLowerCase()
    === path.normalize(path.resolve(normalizedRightRemote)).toLowerCase()
}

function isRemoteCoverPath(coverPath: string) {
  return /^https?:\/\//i.test(coverPath)
}

async function extractVideoCoverFrameCandidates(videoPath: string) {
  const resolvedFfmpegPath = String(ffmpegPath ?? '').trim()
  const resolvedFfprobePath = String(ffprobeStatic?.path ?? '').trim()

  if (!resolvedFfmpegPath || !(await fs.pathExists(resolvedFfmpegPath))) {
    throw new Error('未找到内置 ffmpeg，请重新安装依赖')
  }

  if (!resolvedFfprobePath || !(await fs.pathExists(resolvedFfprobePath))) {
    throw new Error('未找到内置 ffprobe，请重新安装依赖')
  }

  const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)
  if (!cacheSetting) {
    throw new Error('未配置缓存目录')
  }

  const duration = await readVideoDuration(resolvedFfprobePath, videoPath)
  const fixedFrameTimes = buildVideoFixedFrameTimes(duration)
  const randomFrameTimes = buildVideoFrameTimes(duration, VIDEO_COVER_FRAME_COUNT)
  const candidateDir = path.join(cacheSetting.value, 'video-cover-frames', generateId())
  await fs.ensureDir(candidateDir)

  const candidates: Array<{ label: string; coverPath: string; time: number; group: 'fixed' | 'random' }> = []

  for (let index = 0; index < fixedFrameTimes.length + randomFrameTimes.length; index += 1) {
    const isFixedFrame = index < fixedFrameTimes.length
    const frameIndex = isFixedFrame ? index : index - fixedFrameTimes.length
    const frame = isFixedFrame
      ? fixedFrameTimes[frameIndex]
      : { label: `随机帧 ${frameIndex + 1}`, time: randomFrameTimes[frameIndex], group: 'random' as const }
    const coverPath = path.join(candidateDir, `${frame.group}-frame-${String(frameIndex + 1).padStart(2, '0')}.jpg`)

    await execFileChecked(
      resolvedFfmpegPath,
      [
        '-y',
        '-ss',
        formatSecondsForFfmpeg(frame.time),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=960:-1:force_original_aspect_ratio=decrease',
        '-q:v',
        '3',
        coverPath
      ],
      45000
    )

    if (await fs.pathExists(coverPath)) {
      candidates.push({
        label: frame.label,
        coverPath,
        time: frame.time,
        group: frame.group,
      })
    }
  }

  return candidates
}

async function extractRandomVideoSubCoverFrameCandidates(videoPath: string, relativePath: string, count: number) {
  const resolvedFfmpegPath = String(ffmpegPath ?? '').trim()
  const resolvedFfprobePath = String(ffprobeStatic?.path ?? '').trim()

  if (!resolvedFfmpegPath || !(await fs.pathExists(resolvedFfmpegPath))) {
    throw new Error('未找到内置 ffmpeg，请重新安装依赖')
  }

  if (!resolvedFfprobePath || !(await fs.pathExists(resolvedFfprobePath))) {
    throw new Error('未找到内置 ffprobe，请重新安装依赖')
  }

  const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)
  if (!cacheSetting) {
    throw new Error('未配置缓存目录')
  }

  const duration = await readVideoDuration(resolvedFfprobePath, videoPath)
  const randomFrameTimes = buildVideoFrameTimes(duration, Math.max(1, Math.floor(Number(count ?? 0)) || 3))
  const relativePathHash = crypto.createHash('sha1').update(String(relativePath ?? '').trim() || videoPath).digest('hex')
  const candidateDir = path.join(cacheSetting.value, 'video-sub-cover-frames', relativePathHash, generateId())
  await fs.ensureDir(candidateDir)

  const candidates: Array<{ label: string; coverPath: string; time: number; group: 'random' }> = []

  for (let index = 0; index < randomFrameTimes.length; index += 1) {
    const time = randomFrameTimes[index]
    const coverPath = path.join(candidateDir, `random-frame-${String(index + 1).padStart(2, '0')}.jpg`)

    await execFileChecked(
      resolvedFfmpegPath,
      [
        '-y',
        '-ss',
        formatSecondsForFfmpeg(time),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=960:-1:force_original_aspect_ratio=decrease',
        '-q:v',
        '3',
        coverPath
      ],
      45000
    )

    if (await fs.pathExists(coverPath)) {
      candidates.push({
        label: `随机帧 ${index + 1}`,
        coverPath,
        time,
        group: 'random'
      })
    }
  }

  return candidates
}

async function ensureVideoSubCoverPath(
  resourceId: string,
  videoPath: string,
  relativePath: string,
  existingCoverPath = ''
) {
  const normalizedExistingCoverPath = String(existingCoverPath ?? '').trim()
  if (normalizedExistingCoverPath && await fs.pathExists(normalizedExistingCoverPath)) {
    return normalizedExistingCoverPath
  }

  const resolvedFfmpegPath = String(ffmpegPath ?? '').trim()
  if (!resolvedFfmpegPath || !(await fs.pathExists(resolvedFfmpegPath))) {
    throw new Error('未找到内置 ffmpeg，请重新安装依赖')
  }

  const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)
  if (!cacheSetting) {
    throw new Error('未配置缓存目录')
  }

  const normalizedResourceId = String(resourceId ?? '').trim() || 'video-sub'
  const normalizedRelativePath = String(relativePath ?? '').replace(/\\/g, '/').trim()
  const relativePathHash = crypto.createHash('sha1').update(normalizedRelativePath || videoPath).digest('hex')
  const coverDirectory = path.join(cacheSetting.value, 'video-sub-covers', normalizedResourceId)
  const coverPath = path.join(coverDirectory, `${relativePathHash}.jpg`)
  await fs.ensureDir(coverDirectory)

  if (await fs.pathExists(coverPath)) {
    return coverPath
  }

  await execFileChecked(
    resolvedFfmpegPath,
    [
      '-y',
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=640:-1:force_original_aspect_ratio=decrease',
      '-q:v',
      '3',
      coverPath
    ],
    45000
  )

  if (!(await fs.pathExists(coverPath))) {
    throw new Error('生成视频封面失败')
  }

  return coverPath
}

async function ensureVideoCoverPath(
  resourceId: string,
  videoPath: string,
  existingCoverPath = ''
) {
  const normalizedExistingCoverPath = String(existingCoverPath ?? '').trim()
  if (normalizedExistingCoverPath && await fs.pathExists(normalizedExistingCoverPath)) {
    return normalizedExistingCoverPath
  }

  const resolvedFfmpegPath = String(ffmpegPath ?? '').trim()
  if (!resolvedFfmpegPath || !(await fs.pathExists(resolvedFfmpegPath))) {
    throw new Error('未找到内置 ffmpeg，请重新安装依赖')
  }

  const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)
  if (!cacheSetting) {
    throw new Error('未配置缓存目录')
  }

  const normalizedResourceId = String(resourceId ?? '').trim() || 'video'
  const coverDirectory = path.join(cacheSetting.value, 'video-covers')
  const coverPath = path.join(coverDirectory, `${normalizedResourceId}.jpg`)
  await fs.ensureDir(coverDirectory)

  if (await fs.pathExists(coverPath)) {
    return coverPath
  }

  await execFileChecked(
    resolvedFfmpegPath,
    [
      '-y',
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=960:-1:force_original_aspect_ratio=decrease',
      '-q:v',
      '3',
      coverPath
    ],
    45000
  )

  if (!(await fs.pathExists(coverPath))) {
    throw new Error('生成视频封面失败')
  }

  return coverPath
}

async function readVideoDuration(ffprobePath: string, videoPath: string) {
  try {
    const output = await execFileChecked(
      ffprobePath,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
      15000
    )
    const duration = Number(String(output ?? '').trim())
    return Number.isFinite(duration) && duration > 0 ? duration : 0
  } catch {
    return 0
  }
}

function buildVideoFrameTimes(duration: number, count: number) {
  const normalizedCount = Math.max(1, Math.floor(count))
  if (!Number.isFinite(duration) || duration <= 0) {
    return Array.from({ length: normalizedCount }, (_item, index) => 2 + index * 5)
  }

  const safeStart = duration > 20 ? Math.min(5, duration * 0.08) : Math.max(0.2, duration * 0.08)
  const safeEnd = duration > 20 ? Math.max(safeStart + 1, duration - Math.min(5, duration * 0.08)) : Math.max(safeStart + 0.2, duration * 0.92)
  const range = Math.max(0.2, safeEnd - safeStart)
  const times = new Set<number>()

  while (times.size < normalizedCount) {
    const value = safeStart + Math.random() * range
    times.add(Number(value.toFixed(3)))
  }

  return Array.from(times).sort((left, right) => left - right)
}

function buildVideoFixedFrameTimes(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return []
  }

  return VIDEO_FIXED_COVER_FRAME_TIMES
    .filter((item) => item.time < duration - 1)
    .map((item) => ({
      ...item,
      group: 'fixed' as const,
    }))
}

function formatSecondsForFfmpeg(seconds: number) {
  return Math.max(0, Number(seconds ?? 0)).toFixed(3)
}

function execFileChecked(command: string, args: string[], timeout: number) {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, {
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024 * 8
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr ?? '').trim() || error.message
        reject(new Error(detail))
        return
      }

      resolve(String(stdout ?? ''))
    })
  })
}

async function getDirectoryImageFiles(directoryPath: string) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

  return entries
    .filter((entry: any) => entry?.isFile?.())
    .map((entry: any) => path.join(directoryPath, entry.name))
    .filter((filePath: string) => imageExtensions.has(path.extname(filePath).toLowerCase()))
    .sort((left: string, right: string) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
}

async function getDirectoryAudioFiles(directoryPath: string) {
  const audioExtensions = new Set([
    '.mp3',
    '.wav',
    '.flac',
    '.m4a',
    '.aac',
    '.ogg',
    '.opus',
    '.wma',
    '.mp4',
    '.ape'
  ])

  const collected: string[] = []

  async function walk(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
        continue
      }

      if (entry.isFile() && audioExtensions.has(path.extname(entry.name).toLowerCase())) {
        collected.push(entryPath)
      }
    }
  }

  try {
    await walk(directoryPath)
  } catch {
    return []
  }

  return collected.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
}

function pickMultiImageCoverPath(directoryPath: string, imagePaths: string[]) {
  const directoryName = path.basename(String(directoryPath ?? '')).trim().toLowerCase()

  const titlePriorityPath = imagePaths.find((filePath) => {
    const fileStem = path.basename(filePath, path.extname(filePath)).trim().toLowerCase()
    if (!fileStem) {
      return false
    }

    return (
      fileStem === 'title'
      || fileStem.startsWith('title_')
      || fileStem.startsWith('title-')
      || fileStem.startsWith('title ')
      || fileStem.includes(`${directoryName} title`)
      || fileStem.includes(`${directoryName}_title`)
      || fileStem.includes(`${directoryName}-title`)
    )
  })

  if (titlePriorityPath) {
    return titlePriorityPath
  }

  return imagePaths[0] ?? ''
}

async function getAxiosProxyConfig(targetUrl?: string) {
  if (shouldBypassProxyForUrl(String(targetUrl ?? '').trim())) {
    return {
      proxy: false as const
    }
  }

  const enableProxySetting = await DatabaseService.getSetting(Settings.ENABLE_PROXY)
  const isEnabled = ['1', 'true', 'yes', 'on'].includes(String(enableProxySetting?.value ?? '').trim().toLowerCase())

  if (!isEnabled) {
    return {
      proxy: false as const
    }
  }

  const hostSetting = await DatabaseService.getSetting(Settings.PROXY_HOST)
  const portSetting = await DatabaseService.getSetting(Settings.PROXY_PORT)
  const rawHost = String(hostSetting?.value ?? '').trim()
  const rawPort = String(portSetting?.value ?? '').trim()
  const proxy = normalizeProxyHost(rawHost, rawPort)

  if (!proxy.host || !Number.isFinite(proxy.port) || proxy.port <= 0) {
    throw new Error('代理已启用，但代理主机或端口配置无效')
  }

  return {
    proxy
  }
}

function normalizeProxyHost(rawHost: string, rawPort: string) {
  if (!rawHost) {
    return {
      protocol: 'http' as const,
      host: '',
      port: Number(rawPort)
    }
  }

  if (/^https?:\/\//i.test(rawHost)) {
    const parsedUrl = new URL(rawHost)
    return {
      protocol: parsedUrl.protocol.replace(':', '') as 'http' | 'https',
      host: parsedUrl.hostname,
      port: Number(rawPort || parsedUrl.port)
    }
  }

  return {
    protocol: 'http' as const,
    host: rawHost,
    port: Number(rawPort)
  }
}

function syncMeta(tx: any, categoryInfo: any, resourceId: string, meta: ResourceMeta) {
  const extendTable = categoryInfo?.meta?.extra?.extendTable

  if (!extendTable) {
    return
  }

  switch (extendTable) {
    case 'game_meta':
      DatabaseService.upsertGameMeta({
        resourceId,
        nameZh: meta.nameZh || null,
        nameEn: meta.nameEn || null,
        nameJp: meta.nameJp || null,
        nickname: meta.nickname || null,
        engine: meta.engine || null,
        version: meta.version || null,
        language: meta.language || null,
      }, tx)
      return
    case 'software_meta':
      DatabaseService.upsertSoftwareMeta({
        resourceId,
        version: meta.version || null,
        commandLineArgs: meta.commandLineArgs || null,
      }, tx)
      return
    case 'single_image_meta':
      DatabaseService.upsertSingleImageMeta({
        resourceId,
        resolution: meta.resolution || null,
        format: meta.format || null,
      }, tx)
      return
    case 'multi_image_meta':
      DatabaseService.upsertMultiImageMeta({
        resourceId,
        translator: meta.translator || null,
        lastReadPage: Number.isFinite(Number(meta.lastReadPage)) ? Math.max(0, Math.floor(Number(meta.lastReadPage))) : undefined,
      }, tx)
      return
    case 'video_meta':
      DatabaseService.upsertVideoMeta({
        resourceId,
        year: String(meta.year ?? '').trim() || null,
        lastPlayFile: String(meta.lastPlayFile ?? '').trim() || null,
        lastPlayTime: Number.isFinite(Number(meta.lastPlayTime)) ? Math.max(0, Math.floor(Number(meta.lastPlayTime))) : 0,
      }, tx)
      return
    case 'asmr_meta':
      DatabaseService.upsertAsmrMeta({
        duration: Number.isFinite(Number(meta.duration)) ? Math.round(Number(meta.duration)) : null,
        illust: meta.illust || null,
        resourceId,
        language: meta.language || null,
        scenario: meta.scenario || null,
      }, tx)
      return
    case 'audio_meta':
      DatabaseService.upsertAudioMeta({
        resourceId,
        artist: String(meta.artist ?? '').trim() || null,
        album: String(meta.album ?? '').trim() || null,
        lyricsPath: String(meta.lyricsPath ?? '').trim() || null,
        duration: Number.isFinite(Number(meta.duration)) ? Math.round(Number(meta.duration)) : null,
        lastPlayTime: Number.isFinite(Number(meta.lastPlayTime)) ? Math.max(0, Math.floor(Number(meta.lastPlayTime))) : 0,
      }, tx)
      return
    case 'novel_meta':
      DatabaseService.upsertNovelMeta({
        resourceId,
        translator: String(meta.translator ?? '').trim() || null,
        isbn: String(meta.isbn ?? '').trim() || null,
        publisher: String(meta.publisher ?? '').trim() || null,
        year: String(meta.year ?? '').trim() && Number.isFinite(Number(meta.year)) ? Math.floor(Number(meta.year)) : null,
      }, tx)
      return
    case 'website_meta':
      DatabaseService.upsertWebsiteMeta({
        resourceId,
        url: String(meta.website ?? '').trim() || null,
        favicon: String(meta.favicon ?? '').trim() || null,
        isDownloadLink: Boolean(meta.isDownloadLink),
      }, tx)
      return
    default:
      return
  }
}

/**
 * 校验文件是否存在 并返回文件目录名和文件名
 * @param basePath
 */
async function dealPath(basePath: string): Promise<ResourcePathInfo> {
  const normalizedPath = path.normalize(basePath)
  const isExist = await fs.pathExists(normalizedPath)

  if (!isExist) {
    throw new Error(`文件不存在或路径无效: ${normalizedPath}`)
  }

  const stats = await fs.stat(normalizedPath);

  if (stats.isDirectory()) {
    return {
      basePath: normalizedPath,
      fileName: null,
    }
  }

  return {
    basePath: path.dirname(normalizedPath),
    fileName: path.basename(normalizedPath),
  }
}

async function resolveResourceLaunchOptions(resourceId: string, basePath: string, fileName?: string | null) {
  const resourceDetail = await DatabaseService.getResourceDetailById(resourceId)
  const commandLineArgs = String(resourceDetail?.softwareMeta?.commandLineArgs ?? '').trim()

  if (!commandLineArgs) {
    return {}
  }

  const targetPath = fileName ? path.join(basePath, fileName) : basePath
  if (isCommandShellExecutable(targetPath)) {
    return {
      args: ['/d', '/c', commandLineArgs]
    }
  }

  if (isPowerShellExecutable(targetPath)) {
    return {
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandLineArgs]
    }
  }

  return {
    args: splitCommandLineArgs(commandLineArgs)
  }
}

function splitCommandLineArgs(commandLineArgs: string) {
  const tokens = String(commandLineArgs ?? '').match(/"([^"\\]*(?:\\.[^"\\]*)*)"|[^\s]+/g) ?? []
  return tokens.map((token) => {
    const trimmed = token.trim()
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/\\"/g, '"')
    }

    return trimmed
  }).filter(Boolean)
}

function isCommandShellExecutable(targetPath: string) {
  const normalizedPath = path.normalize(String(targetPath ?? '').trim()).toLowerCase()
  const fileName = path.basename(normalizedPath)
  return fileName === 'cmd.exe' || fileName === 'cmd'
}

function isPowerShellExecutable(targetPath: string) {
  const normalizedPath = path.normalize(String(targetPath ?? '').trim()).toLowerCase()
  const fileName = path.basename(normalizedPath)
  return fileName === 'powershell.exe' || fileName === 'powershell' || fileName === 'pwsh.exe' || fileName === 'pwsh'
}

function resolveResourceDeletionDirectory(basePath: string) {
  const normalizedPath = path.normalize(String(basePath ?? '').trim())
  if (!normalizedPath) {
    return ''
  }

  return normalizedPath
}

function isSafeResourceDeletionDirectory(targetDirectory: string) {
  const normalizedPath = path.normalize(String(targetDirectory ?? '').trim())
  if (!normalizedPath) {
    return false
  }

  const parsedPath = path.parse(normalizedPath)
  if (!parsedPath.root) {
    return false
  }

  const trimmedNormalized = normalizedPath.replace(/[\\\/]+$/, '')
  const trimmedRoot = parsedPath.root.replace(/[\\\/]+$/, '')

  if (!trimmedNormalized || trimmedNormalized.toLowerCase() === trimmedRoot.toLowerCase()) {
    return false
  }

  const relativeToRoot = path.relative(parsedPath.root, normalizedPath)
  if (!relativeToRoot || relativeToRoot === '.' || relativeToRoot.startsWith('..')) {
    return false
  }

  return true
}
