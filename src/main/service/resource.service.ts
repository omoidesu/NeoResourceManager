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
import { ResourceDirectoryMetadataService } from './resource-directory-metadata.service'
import axios from 'axios'
import { WindowScreenshotService } from './window-screenshot.service'
import { detectGameEngineProfile } from '../util/game-engine-detector'
import { detectGameLaunchFile } from '../util/game-launch-file-detector'
import { analyzeNovelFile } from '../util/novel-file-analyzer'
import { parseFile } from 'music-metadata'
import { execFile, spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import crypto from 'crypto'

const fs = require('fs-extra')
const originalFs = require('original-fs')
const hidefile = require('hidefile')
const ffmpegPath = require('ffmpeg-static') as string | null
const ffprobeStatic = require('ffprobe-static') as { path?: string }
const VIDEO_COVER_FRAME_COUNT = 5
const MAX_COVER_PROCESS_PIXELS = 36_000_000
const MAX_COVER_SOURCE_BYTES = 100 * 1024 * 1024
const COVER_PROCESS_TIMEOUT_MS = 20_000
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
const WEBSITE_COVER_BACKFILL_CONCURRENCY = 5
const WEBSITE_INFO_BACKFILL_TIMEOUT_MS = 45000
const WEBSITE_COVER_BACKFILL_TIMEOUT_MS = 45000
const WEBSITE_COVER_CAPTURE_OPERATION_TIMEOUT_MS = 10000
const WEBSITE_COVER_WRITE_TIMEOUT_MS = 15000
const COVER_THUMBNAIL_MAX_WIDTH = 360
const COVER_THUMBNAIL_WEBP_QUALITY = 76
const WEBSITE_DIRECT_DOWNLOAD_EXTENSION_SET = new Set(WEBSITE_DIRECT_DOWNLOAD_EXTENSIONS)
const VIDEO_SUB_SYNC_TTL_MS = 30 * 1000
const STORE_URL_DICT_TYPES = [
  DictType.GAME_SITE_TYPE,
  DictType.ASMR_SITE_TYPE,
  DictType.MANGA_SITE_TYPE,
  DictType.IMAGE_SITE_TYPE,
  DictType.NOVEL_SITE_TYPE,
]
let cachedStoreOptionMap: Map<string, any> | null = null

type ArchiveQueueItemStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

type ArchiveQueueItem = {
  id: string
  operation: 'archive' | 'restore'
  archiveId: string
  resourceId: string
  resourceIds: string[]
  title: string
  coverPath: string
  sourcePath: string
  sourcePaths: string[]
  archivePath: string
  archiveFormat: string
  status: ArchiveQueueItemStatus
  progress: number
  currentIndex: number
  totalCount: number
  message: string
  errorMessage: string
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

type BrowserBookmarkSource = {
  id: string
  browserName: string
  profileName: string
  filePath: string
}

type WebsiteBookmarkItem = {
  title: string
  url: string
  favicon?: string
  folder?: string
  source?: string
  exists?: boolean
  existingResourceTitle?: string
  errorMessage?: string
  checked?: boolean
  fetchInfoEnabled?: boolean
}

type WebsiteCoverBackfillTask = {
  resourceId: string
  categoryId: string
  title: string
  url: string
  favicon?: string
}

type ArchiveSourceMode = 'file' | 'directory' | 'none'

function formatDebugPayload(payload: Record<string, any>) {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export class ResourceService {
  static readonly logger = createLogger('ResourceService')
  private static readonly videoSubSyncTaskMap = new Map<string, Promise<any>>()
  private static readonly videoSubSyncCompletedAtMap = new Map<string, number>()
  private static readonly archiveQueueItems: ArchiveQueueItem[] = []
  private static archiveQueueProcessorRunning = false
  private static archiveQueueProcessorScheduled = false
  private static archiveCancellationRequested = false
  private static archiveActiveProcess: ChildProcess | null = null
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
    return ResourceDirectoryMetadataService.getDirectoryMetadataKindFromCategory(categoryInfo) === 'video'
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
    const tree = await DialogService.getDirectoryAudioTree(basePath, { includeMetadata: false })
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
      kind: 'video'
      coverPath: string | null
      sortOrder: number
      isVisible: boolean
      hasSubtitle: boolean
      duration: number | null
      bitrate: number | null
      sampleRate: number | null
      frameRate: number | null
      audioBitrate: number | null
      audioSampleRate: number | null
      width: number | null
      height: number | null
      metadataUpdatedAt: Date | null
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
        kind: 'video',
        coverPath: await ensureVideoSubCoverPath(
          resourceId,
          absoluteFilePath,
          scannedItem.relativePath,
          String(existingItem?.coverPath ?? '').trim()
        ),
        sortOrder: payload.length,
        isVisible: existingItem?.isVisible !== false,
        hasSubtitle: false,
        duration: null,
        bitrate: null,
        sampleRate: null,
        frameRate: null,
        audioBitrate: null,
        audioSampleRate: null,
        width: null,
        height: null,
        metadataUpdatedAt: null
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
        kind: 'video',
        coverPath: await ensureVideoSubCoverPath(resourceId, absoluteFilePath, scannedItem.relativePath),
        sortOrder: payload.length,
        isVisible: true,
        hasSubtitle: false,
        duration: null,
        bitrate: null,
        sampleRate: null,
        frameRate: null,
        audioBitrate: null,
        audioSampleRate: null,
        width: null,
        height: null,
        metadataUpdatedAt: null
      })
    }

    return payload
  }

  static async syncVideoSubItems(resourceId: string, options?: { force?: boolean }) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning' as const,
        message: '资源ID无效'
      }
    }

    const existingTask = ResourceService.videoSubSyncTaskMap.get(normalizedResourceId)
    if (existingTask) {
      return await existingTask
    }

    const lastCompletedAt = ResourceService.videoSubSyncCompletedAtMap.get(normalizedResourceId) ?? 0
    if (!options?.force && lastCompletedAt > 0 && (Date.now() - lastCompletedAt) < VIDEO_SUB_SYNC_TTL_MS) {
      return {
        type: 'success' as const,
        message: '番剧目录已使用近期缓存',
        data: await DatabaseService.getVideoSubsByResourceId(normalizedResourceId)
      }
    }

    const syncTask = (async () => {
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

      ResourceService.videoSubSyncCompletedAtMap.set(normalizedResourceId, Date.now())
      return {
        type: 'success' as const,
        message: '番剧目录同步成功',
        data: nextItems
      }
    })()

    ResourceService.videoSubSyncTaskMap.set(normalizedResourceId, syncTask)
    try {
      return await syncTask
    } finally {
      ResourceService.videoSubSyncTaskMap.delete(normalizedResourceId)
    }
  }

  static async updateVideoSubItems(resourceId: string, items: any[]) {
    const syncResult = await ResourceService.syncVideoSubItems(resourceId, { force: true })
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

        const directoryTree = await DialogService.getDirectoryAudioTree(normalizedBasePath, { includeMetadata: false })
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

      ResourceService.logger.info('importBatchMultiImageDirectories save result', formatDebugPayload({
        categoryId,
        directoryPath,
        saveType: String(saveResult?.type ?? ''),
        saveMessage: String(saveResult?.message ?? ''),
        resourceId: String((saveResult as any)?.data?.resourceId ?? '').trim()
      }))

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
        ResourceService.logger.info('importBatchMultiImageDirectories fetchResourceInfo', formatDebugPayload({
          directoryPath,
          websiteType,
          gameId,
          type: fetchResult?.type ?? '',
          message: fetchResult?.message ?? ''
        }))

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

    const postImportQuery = await DatabaseService.getResourceByCategoryId(categoryId, {
      page: 1,
      pageSize: 10,
      sortBy: 'createTime-desc'
    })
    ResourceService.logger.info('importBatchMultiImageDirectories post import query', formatDebugPayload({
      categoryId,
      total: Number(postImportQuery?.total ?? 0),
      itemCount: Array.isArray(postImportQuery?.items) ? postImportQuery.items.length : 0,
      basePaths: Array.isArray(postImportQuery?.items)
        ? postImportQuery.items.slice(0, 10).map((item: any) => String(item?.basePath ?? '').trim())
        : [],
      resultSample: results.slice(0, 10)
    }))

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

      try {
        const htmlPreview = await fetchWebsiteHtmlPreview(normalizedInputUrl, 256 * 1024, 10000)
        finalUrl = htmlPreview.finalUrl
        contentType = htmlPreview.contentType
        contentDisposition = htmlPreview.contentDisposition
        htmlText = htmlPreview.htmlText
      } catch (error) {
        const fallbackTitle = getHostnameLabel(finalUrl) || getHostnameLabel(normalizedInputUrl) || normalizedInputUrl
        data.website = finalUrl
        data.name = fallbackTitle
        data.isDownloadLink = false
        data.favicon = await resolveWebsiteFaviconToCache('', finalUrl, buildWebsiteFetchCacheKey(finalUrl, 'fallback'))

        ResourceService.logger.warn('fetchWebsiteInfo html preview failed, fallback to basic website info', {
          url: normalizedInputUrl,
          finalUrl,
          error: error instanceof Error ? error.message : String(error)
        })

        return {
          type: 'warning',
          message: '网站限制了页面信息抓取，已回填基础信息',
          data,
        }
      }

      const fileNameFromHeader = parseFileNameFromContentDisposition(contentDisposition)
      const fileNameFromUrl = getFileNameFromUrl(finalUrl)
      const fallbackTitle = fileNameFromHeader || fileNameFromUrl || getHostnameLabel(finalUrl)

      data.website = finalUrl

      if (isHtmlContentType(contentType) || /<html[\s>]/i.test(htmlText)) {
        data.name = extractHtmlTitle(htmlText) || fallbackTitle
        data.favicon = await resolveWebsiteFaviconToCache(htmlText, finalUrl, buildWebsiteFetchCacheKey(finalUrl, htmlText))
        data.isDownloadLink = false
      } else {
        data.name = fallbackTitle
        data.favicon = ''
        data.isDownloadLink = true
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

  static async fetchWebsiteCover(url: string) {
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
      const probeResult = await inspectWebsiteScreenshotTarget(normalizedInputUrl)
      const normalizedFinalUrl = preserveOriginalUrlHash(
        String(probeResult.url || normalizedInputUrl).trim() || normalizedInputUrl,
        normalizedInputUrl
      )
      const isDownloadLink = probeResult.reason === 'download-url' || probeResult.reason === 'download-response'

      if (!probeResult.canCapture || isDownloadLink) {
        ResourceService.logger.warn('fetchWebsiteCover skipped target', {
          url: normalizedInputUrl,
          finalUrl: normalizedFinalUrl,
          reason: probeResult.reason,
          isDownloadLink
        })
        return {
          type: 'warning',
          message: isDownloadLink ? '当前链接更像下载地址，无法自动获取页面图片' : '当前网站暂不支持自动获取页面图片',
          data: {
            website: normalizedFinalUrl,
            coverPath: '',
            isDownloadLink
          }
        }
      }

      const previewResourceId = `website-cover-preview-${generateId()}`
      const screenshotBuffer = await captureWebsiteCoverBuffer(normalizedFinalUrl, previewResourceId)
      const coverPath = await writeManagedWebsiteCover(previewResourceId, screenshotBuffer)
      ResourceService.logger.info('fetchWebsiteCover success', {
        url: normalizedInputUrl,
        finalUrl: normalizedFinalUrl,
        coverPath
      })

      return {
        type: 'success',
        message: '已获取页面图片',
        data: {
          website: normalizedFinalUrl,
          coverPath,
          isDownloadLink: false
        }
      }
    } catch (error) {
      ResourceService.logger.error('fetchWebsiteCover failed', {
        url: normalizedInputUrl,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '获取页面图片失败',
      }
    }
  }

  static async listBrowserBookmarkSources() {
    try {
      const sources = await discoverBrowserBookmarkSources()
      return {
        type: sources.length ? 'success' : 'warning',
        message: sources.length ? '已找到浏览器书签文件' : '未找到可直接导入的浏览器书签文件',
        data: sources
      }
    } catch (error) {
      ResourceService.logger.error('listBrowserBookmarkSources failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '检测浏览器书签失败',
        data: []
      }
    }
  }

  static async analyzeWebsiteBookmarkFile(filePath: string) {
    const normalizedFilePath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedFilePath || !await fs.pathExists(normalizedFilePath)) {
      return {
        type: 'warning',
        message: '书签文件不存在',
        data: {
          sourceLabel: '',
          items: []
        }
      }
    }

    try {
      const items = await readWebsiteBookmarksFromFile(normalizedFilePath)
      const analyzedItems = await analyzeWebsiteBookmarkItems(items, path.basename(normalizedFilePath))
      return {
        type: analyzedItems.length ? 'success' : 'warning',
        message: analyzedItems.length ? `已解析 ${analyzedItems.length} 个网站书签` : '未在文件中找到可导入的网站书签',
        data: {
          sourceLabel: path.basename(normalizedFilePath),
          items: analyzedItems
        }
      }
    } catch (error) {
      ResourceService.logger.error('analyzeWebsiteBookmarkFile failed', {
        filePath: normalizedFilePath,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '解析书签文件失败',
        data: {
          sourceLabel: path.basename(normalizedFilePath),
          items: []
        }
      }
    }
  }

  static async analyzeWebsiteBookmarksFromBrowser(sourceId: string) {
    try {
      const sources = await discoverBrowserBookmarkSources()
      const source = sources.find((item) => item.id === sourceId)
      if (!source) {
        return {
          type: 'warning',
          message: '未找到所选浏览器书签',
          data: {
            sourceLabel: '',
            items: []
          }
        }
      }

      const items = await readWebsiteBookmarksFromFile(source.filePath)
      const sourceLabel = `${source.browserName} / ${source.profileName}`
      const analyzedItems = await analyzeWebsiteBookmarkItems(items, sourceLabel)
      return {
        type: analyzedItems.length ? 'success' : 'warning',
        message: analyzedItems.length ? `已解析 ${analyzedItems.length} 个网站书签` : '未在浏览器书签中找到可导入的网站',
        data: {
          sourceLabel,
          items: analyzedItems
        }
      }
    } catch (error) {
      ResourceService.logger.error('analyzeWebsiteBookmarksFromBrowser failed', {
        sourceId,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        type: 'error',
        message: error instanceof Error ? error.message : '读取浏览器书签失败',
        data: {
          sourceLabel: '',
          items: []
        }
      }
    }
  }

  static async importBatchWebsiteBookmarks(categoryId: string, items: WebsiteBookmarkItem[]) {
    const results: Array<{ url: string; type: string; message: string }> = []
    const coverBackfillTasks: WebsiteCoverBackfillTask[] = []
    const total = Array.isArray(items) ? items.length : 0
    let completed = 0

    const pushImportProgress = (message: string, done = false) => {
      NotificationQueueService.getInstance().pushBatchImportProgress({
        categoryId,
        stage: 'import',
        current: completed,
        total,
        message,
        done
      })
    }

    for (const item of items ?? []) {
      const normalizedUrl = normalizeWebsiteFetchUrl(String(item?.url ?? '').trim(), 'https')
      const title = String(item?.title ?? '').trim()
      const favicon = String(item?.favicon ?? '').trim()
      const bookmarkTypeName = getBookmarkFolderTypeName(String(item?.folder ?? '').trim())
      const coverBackfillEnabled = item?.fetchInfoEnabled !== false

      if (!normalizedUrl) {
        results.push({
          url: String(item?.url ?? '').trim(),
          type: 'warning',
          message: '网站地址无效'
        })
        completed += 1
        pushImportProgress(title || String(item?.url ?? '').trim())
        continue
      }

      const existingResource = await DatabaseService.getResourceByStoragePath(normalizedUrl, null)
      if (existingResource) {
        results.push({
          url: normalizedUrl,
          type: 'info',
          message: existingResource.title ? `已存在：${existingResource.title}` : '该网站已存在'
        })
        completed += 1
        pushImportProgress(title || normalizedUrl)
        continue
      }

      const saveResult = await ResourceService.saveResource({
        author: '',
        actors: [],
        basePath: normalizedUrl,
        categoryId,
        coverPath: '',
        description: '',
        name: title || getHostnameLabel(normalizedUrl) || normalizedUrl,
        tags: [],
        types: bookmarkTypeName ? [bookmarkTypeName] : [],
        meta: {
          additionalStores: [],
          commandLineArgs: '',
          engine: '',
          gameId: '',
          illust: '',
          language: '',
          lastReadPage: 0,
          nameEn: '',
          nameJp: '',
          nameZh: '',
          nickname: '',
          pixivId: '',
          resolution: '',
          format: '',
          scenario: '',
          translator: '',
          version: '',
          website: normalizedUrl,
          websiteType: '',
          favicon: '',
          isDownloadLink: false
        } as ResourceMeta
      } as ResourceForm)

      const savedResourceId = String((saveResult as any)?.data?.resourceId ?? '').trim()
      const saveResultType = String(saveResult?.type ?? 'info')
      if (coverBackfillEnabled && savedResourceId && saveResultType !== 'error') {
        coverBackfillTasks.push({
          resourceId: savedResourceId,
          categoryId,
          title: title || getHostnameLabel(normalizedUrl) || normalizedUrl,
          url: normalizedUrl,
          favicon
        })
      }

      results.push({
        url: normalizedUrl,
        type: saveResultType,
        message: String(saveResult?.message ?? '处理完成')
      })
      completed += 1
      pushImportProgress(title || normalizedUrl)
    }

    const successCount = results.filter((item) => item.type === 'success').length
    const skippedCount = results.filter((item) => item.type === 'info').length
    const failedCount = results.filter((item) => item.type === 'error').length
    pushImportProgress('', true)

    if (coverBackfillTasks.length) {
      void ResourceService.runWebsiteCoverBackfill(coverBackfillTasks)
    }

    return {
      type: failedCount > 0 && successCount === 0 ? 'error' : 'success',
      message: coverBackfillTasks.length
        ? `批量导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}。网站图标和封面正在后台获取。`
        : `批量导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`,
      data: results
    }
  }

  private static async runWebsiteCoverBackfill(tasks: WebsiteCoverBackfillTask[]) {
    const normalizedTasks = (tasks ?? [])
      .map((task) => ({
        resourceId: String(task?.resourceId ?? '').trim(),
        categoryId: String(task?.categoryId ?? '').trim(),
        title: String(task?.title ?? '').trim(),
        url: String(task?.url ?? '').trim(),
        favicon: String(task?.favicon ?? '').trim()
      }))
      .filter((task) => task.resourceId && task.categoryId && task.url)

    if (!normalizedTasks.length) {
      return
    }

    const taskId = `website-cover-${Date.now()}-${generateId()}`
    const total = normalizedTasks.length
    let successCount = 0
    let failedCount = 0
    let skippedCount = 0
    let completedCount = 0

    const pushProgress = (params: {
      current: number
      title?: string
      url?: string
      favicon?: string
      message: string
      done?: boolean
      success?: boolean
    }) => {
      const current = Math.max(0, Math.min(total, Number(params.current ?? 0)))
      const progress = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0
      NotificationQueueService.getInstance().pushWebsiteCoverProgress({
        taskId,
        categoryId: normalizedTasks[0]?.categoryId ?? '',
        current,
        total,
        progress,
        title: String(params.title ?? '').trim(),
        url: String(params.url ?? '').trim(),
        favicon: String(params.favicon ?? '').trim(),
        message: params.message,
        done: params.done,
        success: params.success,
        successCount,
        failedCount,
        skippedCount
      })
    }

    pushProgress({
      current: 0,
      message: '正在准备获取网站图标和封面'
    })

    const processTask = async (task: typeof normalizedTasks[number]) => {
      pushProgress({
        current: completedCount,
        title: task.title,
        url: task.url,
        message: '正在获取网站图标和封面'
      })

      let taskFaviconPath = ''
      try {
        let taskUpdated = false
        let taskFailed = false

        try {
          const websiteInfoResult = await withTimeout(
            ResourceService.fetchWebsiteInfo(task.url),
            WEBSITE_INFO_BACKFILL_TIMEOUT_MS,
            '网站图标获取超时'
          )
          const websiteInfoData = (websiteInfoResult as any)?.data ?? null
          const fetchedWebsiteUrl = normalizeWebsiteFetchUrl(String(websiteInfoData?.website ?? '').trim(), 'https') || task.url
          const fetchedFavicon = String(websiteInfoData?.favicon ?? '').trim()
          const fetchedIsDownloadLink = Boolean(websiteInfoData?.isDownloadLink)

          if (fetchedFavicon && !fetchedIsDownloadLink) {
            const cachedFavicon = await withTimeout(
              cacheWebsiteFaviconToCache(
                fetchedFavicon,
                task.resourceId,
                fetchedWebsiteUrl,
                { returnInputOnFailure: false }
              ),
              WEBSITE_INFO_BACKFILL_TIMEOUT_MS,
              '网站图标缓存超时'
            )
            if (cachedFavicon && !/^data:/i.test(cachedFavicon)) {
              taskFaviconPath = cachedFavicon
              DatabaseService.upsertWebsiteMeta({
                resourceId: task.resourceId,
                url: fetchedWebsiteUrl,
                favicon: cachedFavicon,
                isDownloadLink: false
              })
              taskUpdated = true
            }
          }
        } catch (error) {
          ResourceService.logger.warn('website favicon fetch from page failed', {
            resourceId: task.resourceId,
            url: task.url,
            error: error instanceof Error ? error.message : String(error)
          })
        }

        if (!taskFaviconPath && task.favicon) {
          try {
            const cachedFavicon = await withTimeout(
              cacheWebsiteFaviconToCache(
                task.favicon,
                task.resourceId,
                task.url,
                { returnInputOnFailure: false }
              ),
              WEBSITE_INFO_BACKFILL_TIMEOUT_MS,
              '导入图标缓存超时'
            )
            if (cachedFavicon && !/^data:/i.test(cachedFavicon)) {
              taskFaviconPath = cachedFavicon
              DatabaseService.upsertWebsiteMeta({
                resourceId: task.resourceId,
                url: task.url,
                favicon: cachedFavicon,
                isDownloadLink: false
              })
              taskUpdated = true
            }
          } catch (error) {
            ResourceService.logger.warn('website favicon backfill failed', {
              resourceId: task.resourceId,
              url: task.url,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }

        const coverResult = await withTimeout(
          ResourceService.fetchWebsiteCover(task.url),
          WEBSITE_COVER_BACKFILL_TIMEOUT_MS,
          '网站封面获取超时'
        )
        const coverPath = String(coverResult?.data?.coverPath ?? '').trim()
        if (coverResult?.type === 'success' && coverPath) {
          await DatabaseService.updateResource({
            id: task.resourceId,
            coverPath
          })
          taskUpdated = true
        } else if (coverResult?.type === 'error') {
          taskFailed = true
        }

        if (taskUpdated) {
          NotificationQueueService.getInstance().pushResourceStateChanged({
            resourceId: task.resourceId,
            categoryId: task.categoryId,
            running: false,
            changedAt: Date.now()
          })
          successCount += 1
        } else if (taskFailed) {
          failedCount += 1
        } else {
          skippedCount += 1
        }
      } catch (error) {
        failedCount += 1
        ResourceService.logger.warn('website cover/favicon backfill failed', {
          resourceId: task.resourceId,
          url: task.url,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      completedCount += 1
      pushProgress({
        current: completedCount,
        title: task.title,
        url: task.url,
        favicon: taskFaviconPath,
        message: '网站图标和封面处理完成'
      })
    }

    let nextTaskIndex = 0
    const workerCount = Math.min(WEBSITE_COVER_BACKFILL_CONCURRENCY, normalizedTasks.length)
    const worker = async () => {
      while (nextTaskIndex < normalizedTasks.length) {
        const task = normalizedTasks[nextTaskIndex]
        nextTaskIndex += 1
        if (!task) {
          continue
        }

        await processTask(task)
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    pushProgress({
      current: total,
      message: '网站图标和封面后台处理完成',
      done: true,
      success: failedCount === 0
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
      const storeWorks = await buildStoreWorkPayloads(resourceId, normalizedResourceForm, categoryInfo)

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

      await DatabaseService.refreshResourceSearchText(resourceId)

      if (ResourceService.isVirtualResourceCategory(categoryInfo)) {
        ResourceService.logger.info('saveResource success', {
          resourceId,
          categoryId: resourceForm.categoryId,
          basePath: resource.basePath,
          fileName: resource.fileName,
          returnMsg
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
          directoryMetadataKind: ResourceDirectoryMetadataService.getDirectoryMetadataKindFromCategory(categoryInfo),
        })
      }

      this.scheduleAsmrDurationRefresh(categoryInfo, resourceId, resource.basePath)
      const directoryMetadataKind = ResourceDirectoryMetadataService.getDirectoryMetadataKindFromCategory(categoryInfo)
      if (directoryMetadataKind) {
        ResourceDirectoryMetadataService.scheduleResourceSync(resourceId, {
          kind: directoryMetadataKind,
          debounceMs: 0
        })
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

    const targetDirectory = resolveResourceDeletionDirectory(existingResource.basePath, existingResource.fileName ?? null)
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

  static async archiveResource(resourceId: string) {
    const result = await ResourceService.enqueueArchiveResource(resourceId)
    if (result.type === 'success') {
      ResourceService.archiveCancellationRequested = false
      ResourceService.scheduleArchiveQueueProcessor()
    }
    return result
  }

  static async archiveResources(resourceIds: string[]) {
    const normalizedResourceIds = Array.from(new Set((resourceIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))
    if (!normalizedResourceIds.length) {
      return {
        type: 'warning',
        message: '未选择需要归档的资源',
        data: {
          successCount: 0,
          failedCount: 0,
          results: []
        }
      }
    }

    const results: Array<{
      resourceId: string
      type: 'success' | 'warning'
      message: string
      data?: {
        taskId: string
        queueItemId: string
      }
    }> = []
    for (const resourceId of normalizedResourceIds) {
      const result = await ResourceService.enqueueArchiveResource(resourceId)
      results.push({
        resourceId,
        ...result
      })
    }

    const successCount = results.filter((item) => item.type === 'success').length
    if (successCount > 0) {
      ResourceService.archiveCancellationRequested = false
      ResourceService.scheduleArchiveQueueProcessor()
    }

    return {
      type: successCount > 0 ? 'success' : 'warning',
      message: successCount > 0
        ? `已加入 ${successCount} 项资源的归档队列`
        : '没有资源成功加入归档队列',
      data: {
        successCount,
        failedCount: results.length - successCount,
        results
      }
    }
  }

  static async archiveResourcesAsPackage(resourceIds: string[], packageTitle?: string) {
    const normalizedResourceIds = Array.from(new Set((resourceIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))
    if (normalizedResourceIds.length < 2) {
      return {
        type: 'warning',
        message: '请至少选择 2 个资源再执行合包归档'
      }
    }

    const result = await ResourceService.enqueueArchiveResourcesAsPackage(normalizedResourceIds, packageTitle)
    if (result.type === 'success') {
      ResourceService.archiveCancellationRequested = false
      ResourceService.scheduleArchiveQueueProcessor()
    }
    return result
  }

  static async restoreArchivedPackage(archiveId: string) {
    const result = await ResourceService.enqueueRestoreArchive(archiveId)
    if (result.type === 'success') {
      ResourceService.archiveCancellationRequested = false
      ResourceService.scheduleArchiveQueueProcessor()
    }
    return result
  }

  static async restoreArchivedPackages(archiveIds: string[]) {
    const normalizedArchiveIds = Array.from(new Set((archiveIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))
    if (!normalizedArchiveIds.length) {
      return {
        type: 'warning',
        message: '未选择需要还原的归档包',
        data: {
          successCount: 0,
          failedCount: 0,
          results: []
        }
      }
    }

    const results: Array<{
      archiveId: string
      type: 'success' | 'warning'
      message: string
      data?: {
        taskId: string
        queueItemId: string
      }
    }> = []
    for (const archiveId of normalizedArchiveIds) {
      const result = await ResourceService.enqueueRestoreArchive(archiveId)
      results.push({
        archiveId,
        ...result
      })
    }

    const successCount = results.filter((item) => item.type === 'success').length
    if (successCount > 0) {
      ResourceService.archiveCancellationRequested = false
      ResourceService.scheduleArchiveQueueProcessor()
    }

    return {
      type: successCount > 0 ? 'success' : 'warning',
      message: successCount > 0
        ? `已加入 ${successCount} 项归档包的还原队列`
        : '没有归档包成功加入还原队列',
      data: {
        successCount,
        failedCount: results.length - successCount,
        results
      }
    }
  }

  static async listArchivedPackages() {
    const items = await DatabaseService.listArchivedPackages()
    return {
      type: 'success',
      message: '获取归档包列表成功',
      data: items.map((item) => ({
        id: String(item.id ?? '').trim(),
        resourceId: String(item.resourceId ?? '').trim(),
        title: String(item.title ?? '').trim() || '未命名资源',
        categoryId: String(item.categoryId ?? '').trim(),
        categoryName: String(item.categoryName ?? '').trim() || '未分类',
        categoryEmoji: String(item.categoryEmoji ?? '').trim(),
        categoryColor: String(item.categoryColor ?? '').trim() || '#737373',
        archivePath: String(item.archivePath ?? '').trim(),
        archiveFormat: String(item.archiveFormat ?? '').trim(),
        archiveLevel: Number(item.archiveLevel ?? 0),
        passwordEnabled: Boolean(item.passwordEnabled),
        archivePassword: String(item.archivePassword ?? ''),
        sourcePath: String(item.sourcePath ?? '').trim(),
        sourceSize: Number(item.sourceSize ?? 0),
        archiveSize: Number(item.archiveSize ?? 0),
        resourceCount: Math.max(1, Number(item.resourceCount ?? 1)),
        status: String(item.status ?? '').trim() || 'active',
        archivedAt: item.archivedAt instanceof Date ? item.archivedAt.getTime() : null,
        items: Array.isArray(item.items)
          ? item.items.map((entry) => ({
              resourceId: String(entry.resourceId ?? '').trim(),
              title: String(entry.title ?? '').trim() || '未命名资源',
              coverPath: String(entry.coverPath ?? '').trim(),
              sourcePath: String(entry.sourcePath ?? '').trim(),
              categoryId: String(entry.categoryId ?? '').trim(),
              categoryName: String(entry.categoryName ?? '').trim() || '未分类',
              categoryEmoji: String(entry.categoryEmoji ?? '').trim(),
              categoryColor: String(entry.categoryColor ?? '').trim() || '#737373',
            }))
          : [],
      }))
    }
  }

  static async deleteArchivedPackages(archiveIds: string[]) {
    const normalizedArchiveIds = Array.from(new Set((archiveIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))
    if (!normalizedArchiveIds.length) {
      return {
        type: 'warning',
        message: '未选择需要删除的归档包',
        data: {
          successCount: 0,
          failedCount: 0,
          results: []
        }
      }
    }

    const results: Array<{
      archiveId: string
      type: string
      message: string
      data?: unknown
    }> = []
    for (const archiveId of normalizedArchiveIds) {
      results.push({
        archiveId,
        ...await ResourceService.deleteArchivedPackage(archiveId)
      })
    }

    const successCount = results.filter((item) => item.type === 'success').length
    const failedCount = results.length - successCount
    return {
      type: successCount > 0 ? (failedCount > 0 ? 'warning' : 'success') : 'error',
      message: failedCount > 0
        ? `已删除 ${successCount} 个归档包，${failedCount} 个删除失败`
        : `已删除 ${successCount} 个归档包`,
      data: {
        successCount,
        failedCount,
        results
      }
    }
  }

  static async deleteArchivedPackage(archiveId: string) {
    const normalizedArchiveId = String(archiveId ?? '').trim()
    if (!normalizedArchiveId) {
      return {
        type: 'warning',
        message: '归档记录ID无效',
      }
    }

    const archive = await DatabaseService.getResourceArchiveById(normalizedArchiveId)
    if (!archive) {
      return {
        type: 'warning',
        message: '未找到对应的归档记录',
      }
    }

    const activeQueueItem = ResourceService.archiveQueueItems.find((item) =>
      item.archiveId === normalizedArchiveId
      && (item.status === 'queued' || item.status === 'running')
    )
    if (activeQueueItem) {
      return {
        type: 'warning',
        message: activeQueueItem.operation === 'restore'
          ? '当前归档包正在还原队列中，无法删除'
          : '当前归档包正在队列中，无法删除',
      }
    }

    const archivePath = String(archive.archivePath ?? '').trim()
    if (archivePath && await fs.pathExists(archivePath)) {
      await removeArchiveOutputs(archivePath)
    }

    await DatabaseService.logicalDeleteResourceArchive(normalizedArchiveId)

    return {
      type: 'success',
      message: archivePath ? '归档包已删除' : '归档记录已移除',
    }
  }

  static async listArchiveQueueItems() {
    const items = ResourceService.getArchiveQueueItemsSnapshot()
    return {
      type: 'success',
      message: '获取归档队列成功',
      data: items.map((item) => ({
        id: String(item.id ?? '').trim(),
        resourceId: String(item.resourceId ?? '').trim(),
        resourceIds: ResourceService.getQueueItemResourceIds(item),
        title: String(item.title ?? '').trim(),
        coverPath: String(item.coverPath ?? '').trim(),
        sourcePath: String(item.sourcePath ?? '').trim(),
        sourcePaths: Array.isArray(item.sourcePaths) ? item.sourcePaths.map((entry) => String(entry ?? '').trim()).filter(Boolean) : [],
        archivePath: String(item.archivePath ?? '').trim(),
        archiveFormat: String(item.archiveFormat ?? '').trim(),
        status: String(item.status ?? '').trim(),
        progress: Number(item.progress ?? 0),
        currentIndex: Number(item.currentIndex ?? 0),
        totalCount: Number(item.totalCount ?? 0),
        message: String(item.message ?? '').trim(),
        errorMessage: String(item.errorMessage ?? '').trim(),
        createdAt: Number(item.createdAt ?? 0) || null,
        startedAt: Number(item.startedAt ?? 0) || null,
        finishedAt: Number(item.finishedAt ?? 0) || null,
      }))
    }
  }

  static async deleteArchiveQueueItem(queueItemId: string) {
    const normalizedQueueItemId = String(queueItemId ?? '').trim()
    if (!normalizedQueueItemId) {
      return {
        type: 'warning',
        message: '队列项ID无效',
      }
    }

    const queueItem = ResourceService.findArchiveQueueItem(normalizedQueueItemId)
    if (!queueItem) {
      return {
        type: 'warning',
        message: '未找到对应的归档队列项',
      }
    }

    if (String(queueItem.status ?? '').trim() === 'running') {
      return {
        type: 'warning',
        message: '当前队列项正在归档中，暂不支持移除',
      }
    }

    ResourceService.removeArchiveQueueItem(normalizedQueueItemId)

    return {
      type: 'success',
      message: '已移除归档队列项',
    }
  }

  static async stopArchiveQueue() {
    const runningItem = ResourceService.archiveQueueItems.find((item) => item.status === 'running') ?? null
    const queuedItems = ResourceService.archiveQueueItems.filter((item) => item.status === 'queued')

    if (!runningItem && !queuedItems.length) {
      return {
        type: 'warning',
        message: '当前没有正在执行的归档任务',
      }
    }

    ResourceService.archiveCancellationRequested = true

    for (const item of queuedItems) {
      ResourceService.removeArchiveQueueItem(item.id)
    }

    if (runningItem) {
      runningItem.message = '正在停止归档任务'
    }

    if (ResourceService.archiveActiveProcess && !ResourceService.archiveActiveProcess.killed) {
      try {
        ResourceService.archiveActiveProcess.kill('SIGTERM')
      } catch (error) {
        ResourceService.logger.warn('failed to stop archive process', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return {
      type: 'success',
      message: `已停止归档队列，取消 ${queuedItems.length + (runningItem ? 1 : 0)} 项任务`,
    }
  }

  static async dispose() {
    ResourceService.archiveCancellationRequested = true

    if (ResourceService.archiveActiveProcess && !ResourceService.archiveActiveProcess.killed) {
      try {
        ResourceService.archiveActiveProcess.kill('SIGTERM')
      } catch (error) {
        ResourceService.logger.warn('failed to stop archive process on dispose', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    for (const item of ResourceService.archiveQueueItems) {
      if (item.status === 'queued' || item.status === 'running') {
        const previousStatus = item.status
        item.status = 'cancelled'
        item.message = '应用关闭，已取消归档任务'
        item.errorMessage = previousStatus === 'running' ? '应用关闭，归档任务已中断' : ''
        item.finishedAt = Date.now()
      }
    }

    ResourceService.archiveQueueItems.length = 0
    ResourceService.archiveActiveProcess = null
    ResourceService.archiveQueueProcessorRunning = false
    ResourceService.archiveQueueProcessorScheduled = false
  }

  private static getArchiveQueueItemsSnapshot() {
    return [...ResourceService.archiveQueueItems].sort((left, right) => {
      const statusOrder = (status: ArchiveQueueItemStatus) => {
        if (status === 'running') return 0
        if (status === 'queued') return 1
        if (status === 'failed') return 2
        if (status === 'completed') return 3
        return 4
      }

      return statusOrder(left.status) - statusOrder(right.status)
        || left.createdAt - right.createdAt
        || left.id.localeCompare(right.id)
    })
  }

  private static findArchiveQueueItem(queueItemId: string) {
    return ResourceService.archiveQueueItems.find((item) => item.id === queueItemId) ?? null
  }

  private static removeArchiveQueueItem(queueItemId: string) {
    const queueItemIndex = ResourceService.archiveQueueItems.findIndex((item) => item.id === queueItemId)
    if (queueItemIndex >= 0) {
      ResourceService.archiveQueueItems.splice(queueItemIndex, 1)
    }
  }

  private static getActiveArchiveQueueItems() {
    return ResourceService.archiveQueueItems
      .filter((item) => item.status === 'queued' || item.status === 'running')
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
  }

  private static getNextArchiveQueueItem() {
    return ResourceService.getActiveArchiveQueueItems().find((item) => item.status === 'queued') ?? null
  }

  private static getQueueItemResourceIds(item: ArchiveQueueItem | null | undefined) {
    if (!item) {
      return []
    }
    const explicitIds = Array.isArray(item.resourceIds) ? item.resourceIds : []
    const normalizedIds = explicitIds.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    if (normalizedIds.length) {
      return normalizedIds
    }
    const fallbackId = String(item.resourceId ?? '').trim()
    return fallbackId ? [fallbackId] : []
  }

  private static async enqueueArchiveResource(resourceId: string) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning' as const,
        message: '资源ID无效',
      }
    }

    const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!existingResource) {
      return {
        type: 'warning' as const,
        message: '资源不存在或已被删除',
      }
    }

    const activeQueueItem = ResourceService.archiveQueueItems.find((item) =>
      (item.status === 'queued' || item.status === 'running')
      && ResourceService.getQueueItemResourceIds(item).includes(normalizedResourceId)
    )
    if (activeQueueItem) {
      return {
        type: 'warning' as const,
        message: activeQueueItem.status === 'running'
          ? '当前资源正在归档中，请稍候'
          : '当前资源已在归档队列中，请勿重复提交',
      }
    }

    const existingArchive = await DatabaseService.getResourceArchiveByResourceId(normalizedResourceId)
    if (existingArchive) {
      return {
        type: 'warning' as const,
        message: '该资源已存在归档记录',
      }
    }

    const queueItemId = generateId()
    ResourceService.archiveQueueItems.push({
      id: queueItemId,
      operation: 'archive',
      archiveId: '',
      resourceId: normalizedResourceId,
      resourceIds: [normalizedResourceId],
      title: String(existingResource.title ?? '资源归档').trim() || '资源归档',
      coverPath: String(existingResource.coverPath ?? '').trim(),
      sourcePath: resolveResourceDeletionDirectory(existingResource.basePath, existingResource.fileName ?? null) || '',
      sourcePaths: [],
      archivePath: '',
      archiveFormat: '',
      status: 'queued',
      progress: 0,
      message: '等待归档',
      errorMessage: '',
      currentIndex: 0,
      totalCount: 0,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    })

    return {
      type: 'success' as const,
      message: '已加入归档队列',
      data: {
        taskId: queueItemId,
        queueItemId
      }
    }
  }

  private static async enqueueArchiveResourcesAsPackage(resourceIds: string[], packageTitleInput?: string) {
    const normalizedResourceIds = Array.from(new Set((resourceIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)))
    if (normalizedResourceIds.length < 2) {
      return {
        type: 'warning' as const,
        message: '请至少选择 2 个资源再执行合包归档'
      }
    }

    const resources = await DatabaseService.getResourcesByIds(normalizedResourceIds)
    if (resources.length !== normalizedResourceIds.length) {
      return {
        type: 'warning' as const,
        message: '部分资源不存在或已被删除，请刷新后重试'
      }
    }

    const resourcesById = new Map(resources.map((item) => [String(item.id ?? '').trim(), item]))
    const orderedResources = normalizedResourceIds.map((id) => resourcesById.get(id)).filter(Boolean)
    const categoryIds = Array.from(new Set(orderedResources.map((item) => String(item?.categoryId ?? '').trim()).filter(Boolean)))
    if (categoryIds.length !== 1) {
      return {
        type: 'warning' as const,
        message: '仅支持同一分类的资源合并归档'
      }
    }

    const categoryInfo = await DatabaseService.getCategoryById(categoryIds[0])
    const archiveSourceMode = resolveArchiveSourceMode(categoryInfo)
    if (archiveSourceMode === 'none') {
      return {
        type: 'warning' as const,
        message: '当前资源类型不支持归档'
      }
    }

    for (const resource of orderedResources) {
      const resourceId = String(resource?.id ?? '').trim()
      const activeQueueItem = ResourceService.archiveQueueItems.find((item) =>
        (item.status === 'queued' || item.status === 'running')
        && ResourceService.getQueueItemResourceIds(item).includes(resourceId)
      )
      if (activeQueueItem) {
        return {
          type: 'warning' as const,
          message: `资源“${String(resource?.title ?? '').trim() || resourceId}”已在归档队列中，请勿重复提交`
        }
      }

      const existingArchive = await DatabaseService.getResourceArchiveByResourceId(resourceId)
      if (existingArchive) {
        return {
          type: 'warning' as const,
          message: `资源“${String(resource?.title ?? '').trim() || resourceId}”已存在归档记录`
        }
      }
    }

    const queueItemId = generateId()
    const primaryResource = orderedResources[0]
    const categoryName = String(categoryInfo?.name ?? primaryResource?.categoryId ?? '资源').trim() || '资源'
    const packageTitle = String(packageTitleInput ?? '').trim() || `${categoryName}（${orderedResources.length} 项）`
    ResourceService.archiveQueueItems.push({
      id: queueItemId,
      operation: 'archive',
      archiveId: '',
      resourceId: String(primaryResource?.id ?? '').trim(),
      resourceIds: orderedResources.map((item) => String(item?.id ?? '').trim()).filter(Boolean),
      title: packageTitle,
      coverPath: String(primaryResource?.coverPath ?? '').trim(),
      sourcePath: '',
      sourcePaths: [],
      archivePath: '',
      archiveFormat: '',
      status: 'queued',
      progress: 0,
      message: '等待合包归档',
      errorMessage: '',
      currentIndex: 0,
      totalCount: 0,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    })

    return {
      type: 'success' as const,
      message: '已加入合包归档队列',
      data: {
        taskId: queueItemId,
        queueItemId
      }
    }
  }

  private static async enqueueRestoreArchive(archiveId: string) {
    const normalizedArchiveId = String(archiveId ?? '').trim()
    if (!normalizedArchiveId) {
      return {
        type: 'warning' as const,
        message: '归档记录ID无效',
      }
    }

    const archive = await DatabaseService.getResourceArchiveById(normalizedArchiveId)
    if (!archive) {
      return {
        type: 'warning' as const,
        message: '未找到对应的归档记录',
      }
    }
    const archiveItems = await DatabaseService.listResourceArchiveItemsByArchiveId(normalizedArchiveId)
    if (!archiveItems.length) {
      return {
        type: 'warning' as const,
        message: '归档包内没有可还原的资源项',
      }
    }

    const activeQueueItem = ResourceService.archiveQueueItems.find((item) =>
      item.archiveId === normalizedArchiveId
      && item.operation === 'restore'
      && (item.status === 'queued' || item.status === 'running')
    )
    if (activeQueueItem) {
      return {
        type: 'warning' as const,
        message: activeQueueItem.status === 'running'
          ? '当前归档包正在还原中，请稍候'
          : '当前归档包已在还原队列中，请勿重复提交',
      }
    }

    const primaryArchiveItem = archiveItems[0]
    const resourceId = String(primaryArchiveItem?.resourceId ?? '').trim()
    const existingResource = resourceId
      ? await DatabaseService.getResourceArchiveSourceResourceById(resourceId)
      : null
    const queueItemId = generateId()
    ResourceService.archiveQueueItems.push({
      id: queueItemId,
      operation: 'restore',
      archiveId: normalizedArchiveId,
      resourceId,
      resourceIds: resourceId ? [resourceId] : [],
      title: String(archive.packageTitle ?? existingResource?.title ?? path.basename(String(archive.archivePath ?? '')) ?? '归档包还原').trim() || '归档包还原',
      coverPath: String(existingResource?.coverPath ?? '').trim(),
      sourcePath: String(primaryArchiveItem?.sourcePath ?? '').trim(),
      sourcePaths: [],
      archivePath: String(archive.archivePath ?? '').trim(),
      archiveFormat: String(archive.archiveFormat ?? '').trim(),
      status: 'queued',
      progress: 0,
      message: '等待还原',
      errorMessage: '',
      currentIndex: 0,
      totalCount: 0,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    })

    return {
      type: 'success' as const,
      message: '已加入还原队列',
      data: {
        taskId: queueItemId,
        queueItemId
      }
    }
  }

  private static scheduleArchiveQueueProcessor() {
    if (ResourceService.archiveQueueProcessorRunning || ResourceService.archiveQueueProcessorScheduled) {
      return
    }

    ResourceService.archiveQueueProcessorScheduled = true
    setImmediate(() => {
      ResourceService.archiveQueueProcessorScheduled = false
      void ResourceService.processArchiveQueue()
    })
  }

  private static async processArchiveQueue() {
    if (ResourceService.archiveQueueProcessorRunning) {
      return
    }

    ResourceService.archiveQueueProcessorRunning = true
    try {
      while (true) {
        const nextQueueItem = ResourceService.getNextArchiveQueueItem()
        if (!nextQueueItem) {
          break
        }

        if (nextQueueItem.operation === 'restore') {
          await ResourceService.runRestoreArchiveTask(nextQueueItem.id, nextQueueItem.archiveId)
        } else {
          const queueResourceIds = ResourceService.getQueueItemResourceIds(nextQueueItem)
          if (queueResourceIds.length > 1) {
            await ResourceService.runArchiveResourcePackageTask(nextQueueItem.id, queueResourceIds)
          } else {
            await ResourceService.runArchiveResourceTask(nextQueueItem.id, nextQueueItem.resourceId)
          }
        }
      }
    } finally {
      ResourceService.archiveQueueProcessorRunning = false
      const hasRemainingQueueItem = ResourceService.getNextArchiveQueueItem()
      if (hasRemainingQueueItem) {
        ResourceService.scheduleArchiveQueueProcessor()
      }
    }
  }

  private static async runArchiveResourceTask(queueItemId: string, resourceId: string) {
    const notificationQueue = NotificationQueueService.getInstance()
    const resourceTitleRef = { value: '资源归档' }
    const categoryIdRef = { value: '' }
    const resourceCoverPathRef = { value: '' }
    const queueSnapshot = ResourceService.getActiveArchiveQueueItems()
    const queuePositionIndex = Math.max(0, queueSnapshot.findIndex((item) => String(item.id ?? '').trim() === queueItemId))
    const queueCurrent = queuePositionIndex + 1
    const queueTotal = Math.max(queueSnapshot.length, queueCurrent, 1)
    let generatedArchivePath = ''
    let insertedArchivePackageId = ''
    let cleanupPaths: string[] = []
    const queueItem = ResourceService.findArchiveQueueItem(queueItemId)
    if (!queueItem) {
      return
    }

    if (ResourceService.archiveCancellationRequested) {
      queueItem.status = 'cancelled'
      queueItem.message = '应用关闭，已取消归档任务'
      queueItem.finishedAt = Date.now()
      return
    }

    queueItem.status = 'running'
    queueItem.progress = 0
    queueItem.currentIndex = queueCurrent
    queueItem.totalCount = queueTotal
    queueItem.message = '正在准备归档资源'
    queueItem.errorMessage = ''
    queueItem.startedAt = Date.now()

    const pushProgress = async (patch: Partial<{
      title: string
      current: number
      total: number
      progress: number
      message: string
      done: boolean
      success: boolean
      archivePath: string
      categoryId: string
      persist: boolean
      status: ArchiveQueueItemStatus
    }>) => {
      const current = Math.max(1, Number(patch.current ?? queueCurrent))
      const total = Math.max(1, Number(patch.total ?? queueTotal))
      const progress = Math.max(0, Math.min(100, Number(patch.progress ?? 0)))
      const message = String(patch.message ?? '正在准备归档资源')
      const done = Boolean(patch.done)
      const success = patch.success === undefined ? undefined : Boolean(patch.success)
      const archivePath = patch.archivePath
      notificationQueue.pushResourceArchiveProgress({
        taskId: queueItemId,
        operation: 'archive',
        archiveId: '',
        resourceId,
        categoryId: String(patch.categoryId ?? categoryIdRef.value),
        title: String(patch.title ?? resourceTitleRef.value),
        coverPath: resourceCoverPathRef.value,
        current,
        total,
        progress,
        message,
        done,
        success,
        archivePath
      })

      if (patch.persist === false) {
        return
      }

      const currentQueueItem = ResourceService.findArchiveQueueItem(queueItemId)
      if (!currentQueueItem) {
        return
      }

      currentQueueItem.progress = progress
      currentQueueItem.currentIndex = current
      currentQueueItem.totalCount = total
      currentQueueItem.message = message
      currentQueueItem.archivePath = archivePath ?? generatedArchivePath ?? ''

      if (done) {
        currentQueueItem.status = patch.status ?? (success ? 'completed' : 'failed')
        currentQueueItem.finishedAt = Date.now()
        currentQueueItem.errorMessage = success ? '' : message
        if (currentQueueItem.status === 'cancelled') {
          ResourceService.removeArchiveQueueItem(currentQueueItem.id)
        }
      }
    }

    try {
      const existingResource = await DatabaseService.getResourceById(resourceId)
      if (!existingResource) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '资源不存在或已被删除',
          done: true,
          success: false
        })
        return
      }

      resourceTitleRef.value = String(existingResource.title ?? '资源归档').trim() || '资源归档'
      categoryIdRef.value = String(existingResource.categoryId ?? '').trim()
      resourceCoverPathRef.value = String(existingResource.coverPath ?? '').trim()
      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 3,
        message: `正在准备归档 ${resourceTitleRef.value}`
      })

      const runningResourceIds = await DatabaseService.getRunningResourceIdsByResourceIds([resourceId])
      if (runningResourceIds.length) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '资源正在运行，无法归档',
          done: true,
          success: false
        })
        return
      }

      const categoryInfo = await DatabaseService.getCategoryById(String(existingResource.categoryId ?? '').trim())
      const archiveSourceMode = resolveArchiveSourceMode(categoryInfo)
      if (archiveSourceMode === 'none') {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '当前资源类型不支持归档',
          done: true,
          success: false
        })
        return
      }

      const existingArchive = await DatabaseService.getResourceArchiveByResourceId(resourceId)
      if (existingArchive) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '该资源已存在归档记录',
          done: true,
          success: false,
          archivePath: String(existingArchive.archivePath ?? '')
        })
        return
      }

      const sourcePath = resolveArchiveSourcePath(categoryInfo, existingResource.basePath, existingResource.fileName ?? null)
      if (!sourcePath) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '未找到可归档的资源路径',
          done: true,
          success: false
        })
        return
      }

      if (!isSafeResourceDeletionDirectory(sourcePath)) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: `资源路径不安全，已阻止归档：${sourcePath}`,
          done: true,
          success: false
        })
        return
      }

      const sourceExists = await pathExistsPhysical(sourcePath)
      if (!sourceExists) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '资源路径不存在，无法执行归档',
          done: true,
          success: false
        })
        return
      }

      const [
        archivePathSetting,
        archiveFormatSetting,
        archiveLevelSetting,
        archivePasswordSetting,
        archiveSplitSetting,
        archiveSplitCustomSetting,
        archiveMultithreadSetting,
        archiveThreadCountSetting
      ] = await Promise.all([
        DatabaseService.getSetting(Settings.ARCHIVE_PATH),
        DatabaseService.getSetting(Settings.ARCHIVE_FORMAT),
        DatabaseService.getSetting(Settings.ARCHIVE_LEVEL),
        DatabaseService.getSetting(Settings.ARCHIVE_PASSWORD),
        DatabaseService.getSetting(Settings.ARCHIVE_SPLIT_SIZE),
        DatabaseService.getSetting(Settings.ARCHIVE_SPLIT_SIZE_CUSTOM_MB),
        DatabaseService.getSetting(Settings.ARCHIVE_ENABLE_MULTITHREAD),
        DatabaseService.getSetting(Settings.ARCHIVE_THREAD_COUNT)
      ])

      const archiveRoot = String(archivePathSetting?.value ?? Settings.ARCHIVE_PATH.default).trim()
      if (!archiveRoot) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '请先在设置中配置资源归档路径',
          done: true,
          success: false
        })
        return
      }

      const archiveFormat = normalizeArchiveFormat(String(archiveFormatSetting?.value ?? Settings.ARCHIVE_FORMAT.default).trim())
      const archiveLevel = clampArchiveLevel(Number.parseInt(String(archiveLevelSetting?.value ?? Settings.ARCHIVE_LEVEL.default), 10))
      const archivePassword = String(archivePasswordSetting?.value ?? Settings.ARCHIVE_PASSWORD.default).trim()
      const splitSizeMb = resolveArchiveSplitSizeMb(
        String(archiveSplitSetting?.value ?? Settings.ARCHIVE_SPLIT_SIZE.default).trim(),
        String(archiveSplitCustomSetting?.value ?? Settings.ARCHIVE_SPLIT_SIZE_CUSTOM_MB.default).trim()
      )
      const multithreadEnabled = parseBooleanSetting(
        archiveMultithreadSetting?.value,
        String(Settings.ARCHIVE_ENABLE_MULTITHREAD.default) === '1'
      )
      const threadCount = Math.max(
        1,
        Number.parseInt(String(archiveThreadCountSetting?.value ?? Settings.ARCHIVE_THREAD_COUNT.default), 10) || 16
      )

      if (archivePassword && !supportsArchivePassword(archiveFormat)) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: `${archiveFormat.toUpperCase()} 格式暂不支持设置压缩密码`,
          done: true,
          success: false
        })
        return
      }

      const sevenZipPath = await resolveSevenZipExecutablePath()
      if (!sevenZipPath) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '未找到 7z.exe，无法执行归档',
          done: true,
          success: false
        })
        return
      }

      const categoryName = sanitizeArchiveName(String(categoryInfo?.name ?? '未分类').trim() || '未分类')
      const archiveDir = path.join(archiveRoot, categoryName)
      await fs.ensureDir(archiveDir)

      const archiveBaseName = sanitizeArchiveName(`${resourceTitleRef.value}-${resourceId}`)
      const plannedArchivePath = await allocateArchiveTargetPath(archiveDir, archiveBaseName, archiveFormat)
      const sourceSize = await calculateDirectorySize(sourcePath)
      const archivePlan = buildArchiveExecutionPlan({
        sevenZipPath,
        archiveFormat,
        archivePath: plannedArchivePath,
        sourcePaths: [sourcePath],
        password: archivePassword,
        splitSizeMb,
        multithreadEnabled,
        threadCount,
        archiveLevel
      })

      cleanupPaths = archivePlan.cleanupPaths
      queueItem.sourcePath = sourcePath
      queueItem.archivePath = plannedArchivePath
      queueItem.archiveFormat = archiveFormat
      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 8,
        message: `正在打包 ${resourceTitleRef.value}`
      })

      for (const step of archivePlan.steps) {
        await run7ZipArchiveStep(
          step,
          (progress) => {
            void pushProgress({
              current: queueCurrent,
              total: queueTotal,
              progress,
              message: `正在打包 ${resourceTitleRef.value}`,
              persist: false
            })
          },
          {
            onSpawn: (archiveProcess) => {
              ResourceService.archiveActiveProcess = archiveProcess
            },
            isCancelled: () => ResourceService.archiveCancellationRequested
          }
        )
      }

      generatedArchivePath = await resolveArchiveOutputPath(archivePlan.outputPath)
      const archiveSize = await calculateArchiveOutputSize(generatedArchivePath)

      const archivePackageId = generateId()
      await DatabaseService.insertResourceArchive({
        packageData: {
          id: archivePackageId,
          packageTitle: resourceTitleRef.value,
          archivePath: generatedArchivePath,
          archiveFormat,
          archiveLevel,
          passwordEnabled: Boolean(archivePassword),
          archivePassword,
          splitSizeMb,
          multithreadEnabled,
          threadCount: multithreadEnabled ? threadCount : null,
          sourceTotalSize: sourceSize,
          archiveSize,
          resourceCount: 1,
          status: 'active',
          archivedAt: new Date(),
          isDeleted: false
        },
        itemDataList: [{
          id: generateId(),
          packageId: archivePackageId,
          resourceId,
          archiveEntryPath: resolveArchiveItemEntryPath(sourcePath),
          sourcePath,
          sourceSize,
          sortOrder: 0,
          isDeleted: false
        }]
      })
      insertedArchivePackageId = archivePackageId

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 94,
        message: `正在清理 ${resourceTitleRef.value} 的源文件`
      })

      await ResourceWatcher.getInstance().untrackResource(resourceId)
      await removeResourceMarker({
        id: resourceId,
        basePath: existingResource.basePath,
        fileName: existingResource.fileName ?? null
      })
      await removePhysicalPath(sourcePath)
      await DatabaseService.logicalDeleteResource(resourceId)

      notificationQueue.pushResourceStateChanged({
        resourceId,
        categoryId: categoryIdRef.value,
        running: false,
        missingStatus: Boolean(existingResource.missingStatus),
        changedAt: Date.now()
      })

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 100,
        message: `${resourceTitleRef.value} 已归档完成`,
        done: true,
        success: true,
        archivePath: generatedArchivePath
      })
    } catch (error) {
      if (insertedArchivePackageId) {
        try {
          await DatabaseService.logicalDeleteResourceArchive(insertedArchivePackageId)
        } catch (cleanupError) {
          ResourceService.logger.warn('archiveResource cleanup archive record failed', {
            resourceId,
            archivePackageId: insertedArchivePackageId,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          })
        }
      }

      if (generatedArchivePath) {
        try {
          await removeArchiveOutputs(generatedArchivePath)
        } catch (cleanupError) {
          ResourceService.logger.warn('archiveResource cleanup generated archive failed', {
            resourceId,
            archivePath: generatedArchivePath,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          })
        }
      }

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 100,
        message: ResourceService.archiveCancellationRequested
          ? '归档任务已取消'
          : (error instanceof Error ? error.message : '归档失败，请稍后重试'),
        done: true,
        success: false,
        archivePath: generatedArchivePath || undefined,
        status: ResourceService.archiveCancellationRequested ? 'cancelled' : 'failed'
      })
    } finally {
      ResourceService.archiveActiveProcess = null
      for (const cleanupPath of cleanupPaths) {
        try {
          if (cleanupPath) {
            await fs.remove(cleanupPath)
          }
        } catch (cleanupError) {
          ResourceService.logger.warn('archiveResource cleanup temp file failed', {
            resourceId,
            cleanupPath,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          })
        }
      }
    }
  }

  private static async runArchiveResourcePackageTask(queueItemId: string, resourceIds: string[]) {
    const notificationQueue = NotificationQueueService.getInstance()
    const queueSnapshot = ResourceService.getActiveArchiveQueueItems()
    const queuePositionIndex = Math.max(0, queueSnapshot.findIndex((item) => String(item.id ?? '').trim() === queueItemId))
    const queueCurrent = queuePositionIndex + 1
    const queueTotal = Math.max(queueSnapshot.length, queueCurrent, 1)
    const queueItem = ResourceService.findArchiveQueueItem(queueItemId)
    let generatedArchivePath = ''
    let insertedArchivePackageId = ''
    let cleanupPaths: string[] = []
    if (!queueItem) {
      return
    }

    if (ResourceService.archiveCancellationRequested) {
      queueItem.status = 'cancelled'
      queueItem.message = '应用关闭，已取消归档任务'
      queueItem.finishedAt = Date.now()
      return
    }

    queueItem.status = 'running'
    queueItem.progress = 0
    queueItem.currentIndex = queueCurrent
    queueItem.totalCount = queueTotal
    queueItem.message = '正在准备合包归档'
    queueItem.errorMessage = ''
    queueItem.startedAt = Date.now()

    const pushProgress = async (patch: Partial<{
      title: string
      current: number
      total: number
      progress: number
      message: string
      done: boolean
      success: boolean
      archivePath: string
      categoryId: string
      persist: boolean
      status: ArchiveQueueItemStatus
    }>) => {
      const current = Math.max(1, Number(patch.current ?? queueCurrent))
      const total = Math.max(1, Number(patch.total ?? queueTotal))
      const progress = Math.max(0, Math.min(100, Number(patch.progress ?? 0)))
      const message = String(patch.message ?? '正在准备合包归档')
      const done = Boolean(patch.done)
      const success = patch.success === undefined ? undefined : Boolean(patch.success)
      const archivePath = patch.archivePath
      notificationQueue.pushResourceArchiveProgress({
        taskId: queueItemId,
        operation: 'archive',
        archiveId: '',
        resourceId: String(resourceIds[0] ?? ''),
        categoryId: String(patch.categoryId ?? ''),
        title: String(patch.title ?? queueItem.title ?? '资源归档').trim() || '资源归档',
        coverPath: String(queueItem.coverPath ?? '').trim(),
        current,
        total,
        progress,
        message,
        done,
        success,
        archivePath
      })

      if (patch.persist === false) {
        return
      }

      const currentQueueItem = ResourceService.findArchiveQueueItem(queueItemId)
      if (!currentQueueItem) {
        return
      }

      currentQueueItem.progress = progress
      currentQueueItem.currentIndex = current
      currentQueueItem.totalCount = total
      currentQueueItem.message = message
      currentQueueItem.archivePath = archivePath ?? generatedArchivePath ?? ''

      if (done) {
        currentQueueItem.status = patch.status ?? (success ? 'completed' : 'failed')
        currentQueueItem.finishedAt = Date.now()
        currentQueueItem.errorMessage = success ? '' : message
        if (currentQueueItem.status === 'cancelled') {
          ResourceService.removeArchiveQueueItem(currentQueueItem.id)
        }
      }
    }

    try {
      const normalizedResourceIds = Array.from(new Set(resourceIds.map((item) => String(item ?? '').trim()).filter(Boolean)))
      const resources = await DatabaseService.getResourcesByIds(normalizedResourceIds)
      if (resources.length !== normalizedResourceIds.length) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '部分资源不存在或已被删除',
          done: true,
          success: false
        })
        return
      }

      const resourceMap = new Map(resources.map((item) => [String(item.id ?? '').trim(), item]))
      const orderedResources = normalizedResourceIds.map((id) => resourceMap.get(id)).filter(Boolean)
      const primaryResource = orderedResources[0]
      const categoryId = String(primaryResource?.categoryId ?? '').trim()
      const categoryInfo = await DatabaseService.getCategoryById(categoryId)
      const archiveSourceMode = resolveArchiveSourceMode(categoryInfo)
      if (archiveSourceMode === 'none') {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '当前资源类型不支持归档',
          done: true,
          success: false,
          categoryId
        })
        return
      }

      const runningResourceIds = await DatabaseService.getRunningResourceIdsByResourceIds(normalizedResourceIds)
      if (runningResourceIds.length) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '选中的资源中存在正在运行项，无法归档',
          done: true,
          success: false,
          categoryId
        })
        return
      }

      const targets: Array<{
        resourceId: string
        title: string
        basePath: string
        fileName: string | null
        coverPath: string
        sourcePath: string
        sourceSize: number
      }> = []

      for (const resource of orderedResources) {
        const resourceId = String(resource?.id ?? '').trim()
        const title = String(resource?.title ?? resourceId).trim() || resourceId
        const existingArchive = await DatabaseService.getResourceArchiveByResourceId(resourceId)
        if (existingArchive) {
          await pushProgress({
            current: queueCurrent,
            total: queueTotal,
            progress: 100,
            message: `资源“${title}”已存在归档记录`,
            done: true,
            success: false,
            categoryId
          })
          return
        }

        const sourcePath = resolveArchiveSourcePath(categoryInfo, String(resource?.basePath ?? '').trim(), resource?.fileName ?? null)
        if (!sourcePath) {
          await pushProgress({
            current: queueCurrent,
            total: queueTotal,
            progress: 100,
            message: `资源“${title}”缺少可归档路径`,
            done: true,
            success: false,
            categoryId
          })
          return
        }
        if (!isSafeResourceDeletionDirectory(sourcePath)) {
          await pushProgress({
            current: queueCurrent,
            total: queueTotal,
            progress: 100,
            message: `资源路径不安全，已阻止归档：${sourcePath}`,
            done: true,
            success: false,
            categoryId
          })
          return
        }
        if (!await pathExistsPhysical(sourcePath)) {
          await pushProgress({
            current: queueCurrent,
            total: queueTotal,
            progress: 100,
            message: `资源“${title}”路径不存在，无法执行归档`,
            done: true,
            success: false,
            categoryId
          })
          return
        }

        targets.push({
          resourceId,
          title,
          basePath: String(resource?.basePath ?? '').trim(),
          fileName: resource?.fileName ?? null,
          coverPath: String(resource?.coverPath ?? '').trim(),
          sourcePath,
          sourceSize: Number(await calculateDirectorySize(sourcePath) ?? 0)
        })
      }

      const [
        archivePathSetting,
        archiveFormatSetting,
        archiveLevelSetting,
        archivePasswordSetting,
        archiveSplitSetting,
        archiveSplitCustomSetting,
        archiveMultithreadSetting,
        archiveThreadCountSetting
      ] = await Promise.all([
        DatabaseService.getSetting(Settings.ARCHIVE_PATH),
        DatabaseService.getSetting(Settings.ARCHIVE_FORMAT),
        DatabaseService.getSetting(Settings.ARCHIVE_LEVEL),
        DatabaseService.getSetting(Settings.ARCHIVE_PASSWORD),
        DatabaseService.getSetting(Settings.ARCHIVE_SPLIT_SIZE),
        DatabaseService.getSetting(Settings.ARCHIVE_SPLIT_SIZE_CUSTOM_MB),
        DatabaseService.getSetting(Settings.ARCHIVE_ENABLE_MULTITHREAD),
        DatabaseService.getSetting(Settings.ARCHIVE_THREAD_COUNT)
      ])

      const archiveRoot = String(archivePathSetting?.value ?? Settings.ARCHIVE_PATH.default).trim()
      if (!archiveRoot) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '请先在设置中配置资源归档路径',
          done: true,
          success: false,
          categoryId
        })
        return
      }

      const archiveFormat = normalizeArchiveFormat(String(archiveFormatSetting?.value ?? Settings.ARCHIVE_FORMAT.default).trim())
      const archiveLevel = clampArchiveLevel(Number.parseInt(String(archiveLevelSetting?.value ?? Settings.ARCHIVE_LEVEL.default), 10))
      const archivePassword = String(archivePasswordSetting?.value ?? Settings.ARCHIVE_PASSWORD.default).trim()
      const splitSizeMb = resolveArchiveSplitSizeMb(
        String(archiveSplitSetting?.value ?? Settings.ARCHIVE_SPLIT_SIZE.default).trim(),
        String(archiveSplitCustomSetting?.value ?? Settings.ARCHIVE_SPLIT_SIZE_CUSTOM_MB.default).trim()
      )
      const multithreadEnabled = parseBooleanSetting(
        archiveMultithreadSetting?.value,
        String(Settings.ARCHIVE_ENABLE_MULTITHREAD.default) === '1'
      )
      const threadCount = Math.max(
        1,
        Number.parseInt(String(archiveThreadCountSetting?.value ?? Settings.ARCHIVE_THREAD_COUNT.default), 10) || 16
      )

      if (archivePassword && !supportsArchivePassword(archiveFormat)) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: `${archiveFormat.toUpperCase()} 格式暂不支持设置压缩密码`,
          done: true,
          success: false,
          categoryId
        })
        return
      }

      const sevenZipPath = await resolveSevenZipExecutablePath()
      if (!sevenZipPath) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '未找到 7z.exe，无法执行归档',
          done: true,
          success: false,
          categoryId
        })
        return
      }

      const categoryName = sanitizeArchiveName(String(categoryInfo?.name ?? '未分类').trim() || '未分类')
      const archiveDir = path.join(archiveRoot, categoryName)
      await fs.ensureDir(archiveDir)

      const packageTitle = String(queueItem.title ?? '').trim() || `${categoryName}（${targets.length} 项）`
      const archiveBaseName = sanitizeArchiveName(`${packageTitle}-${Date.now()}`)
      const plannedArchivePath = await allocateArchiveTargetPath(archiveDir, archiveBaseName, archiveFormat)
      const sourcePaths = targets.map((item) => item.sourcePath)
      const sourceTotalSize = targets.reduce((sum, item) => sum + Math.max(0, Number(item.sourceSize ?? 0)), 0)
      const archivePlan = buildArchiveExecutionPlan({
        sevenZipPath,
        archiveFormat,
        archivePath: plannedArchivePath,
        sourcePaths,
        password: archivePassword,
        splitSizeMb,
        multithreadEnabled,
        threadCount,
        archiveLevel
      })

      cleanupPaths = archivePlan.cleanupPaths
      queueItem.sourcePath = sourcePaths[0] ?? ''
      queueItem.sourcePaths = sourcePaths
      queueItem.archivePath = plannedArchivePath
      queueItem.archiveFormat = archiveFormat

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 8,
        message: `正在打包 ${packageTitle}`,
        categoryId
      })

      for (const step of archivePlan.steps) {
        await run7ZipArchiveStep(
          step,
          (progress) => {
            void pushProgress({
              current: queueCurrent,
              total: queueTotal,
              progress,
              message: `正在打包 ${packageTitle}`,
              categoryId,
              persist: false
            })
          },
          {
            onSpawn: (archiveProcess) => {
              ResourceService.archiveActiveProcess = archiveProcess
            },
            isCancelled: () => ResourceService.archiveCancellationRequested
          }
        )
      }

      generatedArchivePath = await resolveArchiveOutputPath(archivePlan.outputPath)
      const archiveSize = await calculateArchiveOutputSize(generatedArchivePath)

      const archivePackageId = generateId()
      await DatabaseService.insertResourceArchive({
        packageData: {
          id: archivePackageId,
          packageTitle,
          archivePath: generatedArchivePath,
          archiveFormat,
          archiveLevel,
          passwordEnabled: Boolean(archivePassword),
          archivePassword,
          splitSizeMb,
          multithreadEnabled,
          threadCount: multithreadEnabled ? threadCount : null,
          sourceTotalSize,
          archiveSize,
          resourceCount: targets.length,
          status: 'active',
          archivedAt: new Date(),
          isDeleted: false
        },
        itemDataList: targets.map((target, index) => ({
          id: generateId(),
          packageId: archivePackageId,
          resourceId: target.resourceId,
          archiveEntryPath: resolveArchiveItemEntryPath(target.sourcePath),
          sourcePath: target.sourcePath,
          sourceSize: target.sourceSize,
          sortOrder: index,
          isDeleted: false
        }))
      })
      insertedArchivePackageId = archivePackageId

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 94,
        message: `正在清理 ${packageTitle} 的源文件`,
        categoryId
      })

      for (const target of targets) {
        await ResourceWatcher.getInstance().untrackResource(target.resourceId)
        await removeResourceMarker({
          id: target.resourceId,
          basePath: target.basePath,
          fileName: target.fileName ?? null
        })
        await removePhysicalPath(target.sourcePath)
      }
      await DatabaseService.logicalDeleteResources(targets.map((item) => item.resourceId))

      for (const target of targets) {
        notificationQueue.pushResourceStateChanged({
          resourceId: target.resourceId,
          categoryId,
          running: false,
          missingStatus: false,
          changedAt: Date.now()
        })
      }

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 100,
        message: `${packageTitle} 已归档完成`,
        done: true,
        success: true,
        archivePath: generatedArchivePath,
        categoryId
      })
    } catch (error) {
      if (insertedArchivePackageId) {
        try {
          await DatabaseService.logicalDeleteResourceArchive(insertedArchivePackageId)
        } catch (cleanupError) {
          ResourceService.logger.warn('archiveResourcesAsPackage cleanup archive record failed', {
            resourceIds,
            archivePackageId: insertedArchivePackageId,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          })
        }
      }

      if (generatedArchivePath) {
        try {
          await removeArchiveOutputs(generatedArchivePath)
        } catch (cleanupError) {
          ResourceService.logger.warn('archiveResourcesAsPackage cleanup generated archive failed', {
            resourceIds,
            archivePath: generatedArchivePath,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          })
        }
      }

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 100,
        message: ResourceService.archiveCancellationRequested
          ? '归档任务已取消'
          : (error instanceof Error ? error.message : '归档失败，请稍后重试'),
        done: true,
        success: false,
        archivePath: generatedArchivePath || undefined,
        status: ResourceService.archiveCancellationRequested ? 'cancelled' : 'failed'
      })
    } finally {
      ResourceService.archiveActiveProcess = null
      for (const cleanupPath of cleanupPaths) {
        try {
          if (cleanupPath) {
            await fs.remove(cleanupPath)
          }
        } catch (cleanupError) {
          ResourceService.logger.warn('archiveResourcesAsPackage cleanup temp file failed', {
            resourceIds,
            cleanupPath,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          })
        }
      }
    }
  }

  private static async runRestoreArchiveTask(queueItemId: string, archiveId: string) {
    const notificationQueue = NotificationQueueService.getInstance()
    const resourceTitleRef = { value: '归档包还原' }
    const categoryIdRef = { value: '' }
    const resourceCoverPathRef = { value: '' }
    const queueSnapshot = ResourceService.getActiveArchiveQueueItems()
    const queuePositionIndex = Math.max(0, queueSnapshot.findIndex((item) => String(item.id ?? '').trim() === queueItemId))
    const queueCurrent = queuePositionIndex + 1
    const queueTotal = Math.max(queueSnapshot.length, queueCurrent, 1)
    const queueItem = ResourceService.findArchiveQueueItem(queueItemId)
    let archivePath = ''
    let sourcePath = ''
    let resourceId = ''
    if (!queueItem) {
      return
    }

    if (ResourceService.archiveCancellationRequested) {
      queueItem.status = 'cancelled'
      queueItem.message = '应用关闭，已取消还原任务'
      queueItem.finishedAt = Date.now()
      return
    }

    queueItem.status = 'running'
    queueItem.progress = 0
    queueItem.currentIndex = queueCurrent
    queueItem.totalCount = queueTotal
    queueItem.message = '正在准备还原归档包'
    queueItem.errorMessage = ''
    queueItem.startedAt = Date.now()

    const pushProgress = async (patch: Partial<{
      title: string
      current: number
      total: number
      progress: number
      message: string
      done: boolean
      success: boolean
      archivePath: string
      categoryId: string
      persist: boolean
      status: ArchiveQueueItemStatus
    }>) => {
      const current = Math.max(1, Number(patch.current ?? queueCurrent))
      const total = Math.max(1, Number(patch.total ?? queueTotal))
      const progress = Math.max(0, Math.min(100, Number(patch.progress ?? 0)))
      const message = String(patch.message ?? '正在准备还原归档包')
      const done = Boolean(patch.done)
      const success = patch.success === undefined ? undefined : Boolean(patch.success)
      const nextArchivePath = patch.archivePath
      notificationQueue.pushResourceArchiveProgress({
        taskId: queueItemId,
        operation: 'restore',
        archiveId,
        resourceId,
        categoryId: String(patch.categoryId ?? categoryIdRef.value),
        title: String(patch.title ?? resourceTitleRef.value),
        coverPath: resourceCoverPathRef.value,
        current,
        total,
        progress,
        message,
        done,
        success,
        archivePath: nextArchivePath
      })

      if (patch.persist === false) {
        return
      }

      const currentQueueItem = ResourceService.findArchiveQueueItem(queueItemId)
      if (!currentQueueItem) {
        return
      }

      currentQueueItem.progress = progress
      currentQueueItem.currentIndex = current
      currentQueueItem.totalCount = total
      currentQueueItem.message = message
      currentQueueItem.archivePath = nextArchivePath ?? archivePath ?? ''

      if (done) {
        currentQueueItem.status = patch.status ?? (success ? 'completed' : 'failed')
        currentQueueItem.finishedAt = Date.now()
        currentQueueItem.errorMessage = success ? '' : message
        if (currentQueueItem.status === 'cancelled') {
          ResourceService.removeArchiveQueueItem(currentQueueItem.id)
        }
      }
    }

    try {
      const archive = await DatabaseService.getResourceArchiveById(archiveId)
      if (!archive) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '未找到对应的归档记录',
          done: true,
          success: false
        })
        return
      }

      const archiveItems = await DatabaseService.listResourceArchiveItemsByArchiveId(archiveId)
      if (!archiveItems.length) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '归档包中没有可还原的资源项',
          done: true,
          success: false,
          archivePath: String(archive.archivePath ?? '').trim() || undefined
        })
        return
      }

      archivePath = String(archive.archivePath ?? '').trim()
      const resourceDetails = await Promise.all(
        archiveItems.map((item) => DatabaseService.getResourceArchiveSourceResourceById(String(item.resourceId ?? '').trim()))
      )
      const primaryArchiveItem = archiveItems[0]
      const primaryResource = resourceDetails[0]
      resourceId = String(primaryArchiveItem?.resourceId ?? '').trim()
      sourcePath = path.normalize(String(primaryArchiveItem?.sourcePath ?? '').trim())
      resourceTitleRef.value = String(archive.packageTitle ?? primaryResource?.title ?? '归档包还原').trim() || '归档包还原'
      categoryIdRef.value = String(primaryResource?.categoryId ?? '').trim()
      resourceCoverPathRef.value = String(primaryResource?.coverPath ?? '').trim()
      queueItem.resourceId = resourceId
      queueItem.title = resourceTitleRef.value
      queueItem.coverPath = resourceCoverPathRef.value
      queueItem.archivePath = archivePath
      queueItem.sourcePath = sourcePath
      queueItem.archiveFormat = String(archive.archiveFormat ?? '').trim()

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 3,
        message: `正在准备还原 ${resourceTitleRef.value}`,
        archivePath
      })

      if (!archivePath) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '归档记录缺少还原所需路径',
          done: true,
          success: false,
          archivePath
        })
        return
      }

      if (!await fs.pathExists(archivePath)) {
        await pushProgress({
          current: queueCurrent,
          total: queueTotal,
          progress: 100,
          message: '归档包文件不存在，无法还原',
          done: true,
          success: false,
          archivePath
        })
        return
      }

      const restoreTargets = archiveItems.map((item, index) => {
        const targetSourcePath = path.normalize(String(item.sourcePath ?? '').trim())
        const targetResourceId = String(item.resourceId ?? '').trim()
        const targetResource = resourceDetails[index]
        return {
          item,
          targetSourcePath,
          targetResourceId,
          targetResource,
        }
      })

      for (const target of restoreTargets) {
        if (!target.targetSourcePath || !target.targetResourceId || !target.targetResource) {
          await pushProgress({
            current: queueCurrent,
            total: queueTotal,
            progress: 100,
            message: '归档资源项缺少还原所需记录',
            done: true,
            success: false,
            archivePath
          })
          return
        }

        if (!isSafeResourceDeletionDirectory(target.targetSourcePath)) {
          await pushProgress({
            current: queueCurrent,
            total: queueTotal,
            progress: 100,
            message: `归档原始目录不安全，已阻止还原：${target.targetSourcePath}`,
            done: true,
            success: false,
            archivePath
          })
          return
        }

        if (await pathExistsPhysical(target.targetSourcePath)) {
          await pushProgress({
            current: queueCurrent,
            total: queueTotal,
            progress: 100,
            message: '原始资源目录已存在，已取消还原以避免覆盖文件',
            done: true,
            success: false,
            archivePath
          })
          return
        }
      }

      let archivePassword = String(archive.archivePassword ?? '').trim()
      if (!archivePassword && Boolean(archive.passwordEnabled)) {
        const archivePasswordSetting = await DatabaseService.getSetting(Settings.ARCHIVE_PASSWORD)
        archivePassword = String(archivePasswordSetting?.value ?? Settings.ARCHIVE_PASSWORD.default).trim()
      }

      const restoreTempDirectory = path.join(path.dirname(archivePath), `.nrm-restore-${generateId()}`)
      await extractArchivedPackageToDirectory({
        archivePath,
        archiveFormat: normalizeArchiveFormat(String(archive.archiveFormat ?? '').trim()),
        outputDirectory: restoreTempDirectory,
        password: archivePassword,
        onProgress: (progress) => {
          void pushProgress({
            current: queueCurrent,
            total: queueTotal,
            progress: Math.max(8, Math.min(88, progress)),
            message: `正在还原 ${resourceTitleRef.value}`,
            archivePath,
            persist: false
          })
        },
        onSpawn: (archiveProcess) => {
          ResourceService.archiveActiveProcess = archiveProcess
        },
        isCancelled: () => ResourceService.archiveCancellationRequested
      })

      try {
        for (const target of restoreTargets) {
          const extractedSourcePath = resolveArchiveExtractedItemPath(restoreTempDirectory, String(target.item.archiveEntryPath ?? ''), target.targetSourcePath)
          if (!await pathExistsPhysical(extractedSourcePath)) {
            await pushProgress({
              current: queueCurrent,
              total: queueTotal,
              progress: 100,
              message: `归档包已解压，但未找到资源项：${path.basename(target.targetSourcePath)}`,
              done: true,
              success: false,
              archivePath
            })
            return
          }

          await fs.ensureDir(path.dirname(target.targetSourcePath))
          await movePhysicalPath(extractedSourcePath, target.targetSourcePath)
        }
      } finally {
        await removePhysicalPath(restoreTempDirectory)
      }

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 92,
        message: `正在恢复 ${resourceTitleRef.value} 的资源记录`,
        archivePath
      })

      await DatabaseService.restoreResourceArchive(archiveId, restoreTargets.map((item) => item.targetResourceId))

      for (const target of restoreTargets) {
        const targetCategoryInfo = await DatabaseService.getCategoryById(String(target.targetResource?.categoryId ?? '').trim())
        if (!targetCategoryInfo || ResourceService.isVirtualResourceCategory(targetCategoryInfo)) {
          continue
        }

        await writeResourceMarker({
          resourceId: target.targetResourceId,
          basePath: String(target.targetResource?.basePath ?? '').trim(),
          fileName: target.targetResource?.fileName ?? null,
          markerEnabled: shouldCreateResourceMarker(
            targetCategoryInfo,
            {
              basePath: String(target.targetResource?.basePath ?? '').trim(),
              fileName: target.targetResource?.fileName ?? null
            },
            {} as ResourceMeta
          )
        })
        ResourceWatcher.getInstance().trackResource({
          id: target.targetResourceId,
          categoryId: String(target.targetResource?.categoryId ?? '').trim(),
          basePath: String(target.targetResource?.basePath ?? '').trim(),
          fileName: target.targetResource?.fileName ?? null,
          missingStatus: false,
          directoryMetadataKind: ResourceDirectoryMetadataService.getDirectoryMetadataKindFromCategory(targetCategoryInfo),
        })
      }

      let archiveRemoved = true
      try {
        await removeArchiveOutputs(archivePath)
      } catch (error) {
        archiveRemoved = false
        ResourceService.logger.warn('restoreArchivedPackage remove archive outputs failed', {
          archiveId,
          archivePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      notificationQueue.pushResourceStateChanged({
        resourceId,
        categoryId: String(primaryResource?.categoryId ?? '').trim(),
        running: false,
        missingStatus: false,
        changedAt: Date.now()
      })

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 100,
        message: archiveRemoved ? `${resourceTitleRef.value} 已还原完成` : `${resourceTitleRef.value} 已还原，但归档包文件删除失败`,
        done: true,
        success: true,
        archivePath
      })
    } catch (error) {
      if (sourcePath && await pathExistsPhysical(sourcePath)) {
        try {
          await removePhysicalPath(sourcePath)
        } catch (cleanupError) {
          ResourceService.logger.warn('restoreArchivedPackage cleanup partial restore failed', {
            archiveId,
            sourcePath,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          })
        }
      }

      await pushProgress({
        current: queueCurrent,
        total: queueTotal,
        progress: 100,
        message: ResourceService.archiveCancellationRequested
          ? '还原任务已取消'
          : (error instanceof Error ? error.message : '还原失败，请稍后重试'),
        done: true,
        success: false,
        archivePath: archivePath || undefined,
        status: ResourceService.archiveCancellationRequested ? 'cancelled' : 'failed'
      })
    } finally {
      ResourceService.archiveActiveProcess = null
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

  static async setGovernanceIssueIgnored(
    resourceId: string,
    issueType: 'brokenPath' | 'missingCover' | 'longUnvisited' | 'duplicateResource',
    ignored: boolean
  ) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return {
        type: 'warning',
        message: '资源ID无效'
      }
    }

    const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
    if (!existingResource) {
      return {
        type: 'warning',
        message: '资源不存在或已被删除'
      }
    }

    await DatabaseService.setGovernanceIssueIgnored(normalizedResourceId, issueType, ignored)

    return {
      type: 'success',
      message: ignored ? '问题已忽略' : '已恢复为待处理'
    }
  }

  static async batchSetGovernanceIssueIgnored(
    items: Array<{ resourceId: string; issueType: 'brokenPath' | 'missingCover' | 'longUnvisited' | 'duplicateResource' }>,
    ignored: boolean
  ) {
    const normalizedItems = Array.isArray(items)
      ? items
        .map((item) => ({
          resourceId: String(item?.resourceId ?? '').trim(),
          issueType: item?.issueType
        }))
        .filter((item) => item.resourceId && ['brokenPath', 'missingCover', 'longUnvisited', 'duplicateResource'].includes(String(item.issueType)))
      : []

    if (!normalizedItems.length) {
      return {
        type: 'warning',
        message: '未选择有效的问题资源'
      }
    }

    await DatabaseService.transaction(async (tx) => {
      for (const item of normalizedItems) {
        await DatabaseService.setGovernanceIssueIgnored(
          item.resourceId,
          item.issueType as 'brokenPath' | 'missingCover' | 'longUnvisited' | 'duplicateResource',
          ignored,
          tx
        )
      }
    })

    return {
      type: 'success',
      message: ignored ? `已忽略 ${normalizedItems.length} 项问题资源` : `已恢复 ${normalizedItems.length} 项问题资源`
    }
  }

  static async rescanMissingResources(resourceIds: string[]) {
    const normalizedResourceIds = Array.isArray(resourceIds)
      ? Array.from(new Set(resourceIds.map((resourceId) => String(resourceId ?? '').trim()).filter(Boolean)))
      : []

    if (!normalizedResourceIds.length) {
      return {
        type: 'warning',
        message: '未选择有效的资源'
      }
    }

    const watcher = ResourceWatcher.getInstance()
    return watcher.relocateMissingResourcesNow(normalizedResourceIds)
  }

  static async syncEverythingClientFromSettings() {
    await ResourceWatcher.getInstance().syncEverythingClientFromSettings()
    return {
      type: 'success',
      message: 'Everything 客户端缓存已刷新'
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

  static async updateResourceTop(resourceId: string, top: boolean) {
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
      ifTop: top,
    })

    return {
      type: 'success',
      message: top ? '已置顶，列表中会优先展示' : '已取消置顶',
    }
  }

  static async updateResourceHomePin(resourceId: string, pinned: boolean) {
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

    if (pinned) {
      const currentHomePin = await DatabaseService.getHomePinByResourceId(normalizedResourceId)
      if (!currentHomePin) {
        const pinnedResources = await DatabaseService.getHomePinnedResources(12)
        if (pinnedResources.length >= 12) {
          return {
            type: 'warning',
            message: '快速启动最多支持 12 个资源，请先移除部分资源',
          }
        }
      }

      await DatabaseService.pinResourceToHome(normalizedResourceId, new Date())
    } else {
      await DatabaseService.unpinResourceFromHome(normalizedResourceId)
    }

    return {
      type: 'success',
      message: pinned ? '已添加至快速启动' : '已取消快速启动',
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
      const existingResource = await DatabaseService.getResourceById(normalizedResourceId)
      const categoryInfo = existingResource
        ? await DatabaseService.getCategoryById(String(existingResource.categoryId ?? '').trim())
        : null
      const directoryMetadataKind = ResourceDirectoryMetadataService.getDirectoryMetadataKindFromCategory(categoryInfo)
      if (directoryMetadataKind) {
        ResourceDirectoryMetadataService.scheduleResourceSync(normalizedResourceId, {
          kind: directoryMetadataKind,
          debounceMs: 0
        })
      }
    } catch (error) {
      ResourceService.logger.warn('getResourceDetail scheduleResourceSync failed', {
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
      const extendTableName = getExtendTableName(categoryInfo)
      const isAutoResolvedCoverExplicitlyCleared =
        ['video_meta', 'multi_image_meta'].includes(extendTableName)
        && !currentCoverPath
        && Boolean(existingCoverPath)
      const realCoverPath = isSameCoverPath(currentCoverPath, existingCoverPath)
        ? existingCoverPath
        : isAutoResolvedCoverExplicitlyCleared
          ? ''
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
      const storeWorks = await buildStoreWorkPayloads(normalizedResourceId, normalizedResourceForm, categoryInfo)

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

      await DatabaseService.refreshResourceSearchText(normalizedResourceId)

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
          directoryMetadataKind: ResourceDirectoryMetadataService.getDirectoryMetadataKindFromCategory(categoryInfo),
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
      const directoryMetadataKind = ResourceDirectoryMetadataService.getDirectoryMetadataKindFromCategory(categoryInfo)
      if (directoryMetadataKind) {
        ResourceDirectoryMetadataService.scheduleResourceSync(normalizedResourceId, {
          kind: directoryMetadataKind,
          debounceMs: 0
        })
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

function decodeHtmlEntityText(input: string) {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"'
  }

  return String(input ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    const normalizedEntity = String(entity ?? '').trim().toLowerCase()
    if (!normalizedEntity) {
      return ''
    }

    if (normalizedEntity.startsWith('#x')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16)
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ''
    }

    if (normalizedEntity.startsWith('#')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10)
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ''
    }

    return namedEntities[normalizedEntity] ?? `&${entity};`
  })
}

function stripBookmarkHtmlTags(input: string) {
  return decodeHtmlEntityText(String(input ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

function parseHtmlAttributes(input: string) {
  const attrs: Record<string, string> = {}
  const attrRegex = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  let match: RegExpExecArray | null

  while ((match = attrRegex.exec(input)) !== null) {
    const key = String(match[1] ?? '').trim().toLowerCase()
    if (!key) {
      continue
    }

    attrs[key] = decodeHtmlEntityText(String(match[2] ?? match[3] ?? match[4] ?? '').trim())
  }

  return attrs
}

function parseBookmarkHtml(content: string): WebsiteBookmarkItem[] {
  const items: WebsiteBookmarkItem[] = []
  const folderStack: string[] = []
  let pendingFolderName = ''
  const tokenRegex = /<h3\b[^>]*>[\s\S]*?<\/h3>|<dl\b[^>]*>|<\/dl>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(content)) !== null) {
    const token = String(match[0] ?? '')
    if (/^<h3\b/i.test(token)) {
      pendingFolderName = stripBookmarkHtmlTags(token)
      continue
    }

    if (/^<dl\b/i.test(token)) {
      if (pendingFolderName) {
        folderStack.push(pendingFolderName)
        pendingFolderName = ''
      }
      continue
    }

    if (/^<\/dl/i.test(token)) {
      pendingFolderName = ''
      if (folderStack.length) {
        folderStack.pop()
      }
      continue
    }

    const attrs = parseHtmlAttributes(String(match[1] ?? ''))
    const url = normalizeWebsiteFetchUrl(String(attrs.href ?? '').trim(), 'https')
    if (!url) {
      continue
    }

    items.push({
      title: stripBookmarkHtmlTags(String(match[2] ?? '')) || getHostnameLabel(url) || url,
      url,
      favicon: String(attrs.icon_uri ?? attrs.icon ?? '').trim(),
      folder: folderStack.join(' / '),
      source: 'Chrome 导出文件'
    })
  }

  return items
}

function getBookmarkFolderTypeName(folder: string) {
  const rootFolderNames = new Set([
    'bookmarks bar',
    'bookmark bar',
    'other bookmarks',
    'mobile bookmarks',
    'favorites bar',
    '书签栏',
    '书签列',
    '其他书签',
    '移动设备书签',
    '收藏夹栏',
    '收藏夹'
  ])
  const parts = String(folder ?? '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !rootFolderNames.has(item.toLowerCase()))

  return parts[parts.length - 1] ?? ''
}

function collectBookmarkJsonItems(node: any, folderParts: string[] = [], items: WebsiteBookmarkItem[] = []) {
  if (!node || typeof node !== 'object') {
    return items
  }

  const type = String(node.type ?? '').trim().toLowerCase()
  if (type === 'url') {
    const url = normalizeWebsiteFetchUrl(String(node.url ?? '').trim(), 'https')
    if (url) {
      items.push({
        title: String(node.name ?? '').trim() || getHostnameLabel(url) || url,
        url,
        folder: folderParts.join(' / '),
        source: '浏览器书签'
      })
    }
    return items
  }

  const nextFolderParts = type === 'folder' && String(node.name ?? '').trim()
    ? [...folderParts, String(node.name).trim()]
    : folderParts
  const children = Array.isArray(node.children) ? node.children : []
  children.forEach((child) => collectBookmarkJsonItems(child, nextFolderParts, items))
  return items
}

function parseBookmarkJson(content: string): WebsiteBookmarkItem[] {
  const parsed = JSON.parse(content)
  const roots = parsed?.roots && typeof parsed.roots === 'object' ? parsed.roots : parsed
  const items: WebsiteBookmarkItem[] = []

  Object.values(roots ?? {}).forEach((root: any) => {
    const rootName = String(root?.name ?? '').trim()
    collectBookmarkJsonItems(root, rootName ? [rootName] : [], items)
  })

  return items
}

async function readWebsiteBookmarksFromFile(filePath: string) {
  const content = await fs.readFile(filePath, 'utf8')
  const trimmedContent = String(content ?? '').trim()
  if (!trimmedContent) {
    return []
  }

  if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
    return parseBookmarkJson(trimmedContent)
  }

  return parseBookmarkHtml(trimmedContent)
}

async function analyzeWebsiteBookmarkItems(items: WebsiteBookmarkItem[], sourceLabel: string) {
  const itemMap = new Map<string, WebsiteBookmarkItem>()

  for (const item of items ?? []) {
    const normalizedUrl = normalizeWebsiteFetchUrl(String(item?.url ?? '').trim(), 'https')
    if (!normalizedUrl || itemMap.has(normalizedUrl)) {
      continue
    }

    itemMap.set(normalizedUrl, {
      ...item,
      url: normalizedUrl,
      source: item.source || sourceLabel
    })
  }

  const normalizedItems = Array.from(itemMap.values())
  return await Promise.all(normalizedItems.map(async (item) => {
    try {
      const existingResource = await DatabaseService.getResourceByStoragePath(item.url, null)
      return {
        ...item,
        exists: Boolean(existingResource),
        existingResourceTitle: String(existingResource?.title ?? ''),
        checked: !existingResource,
        errorMessage: ''
      }
    } catch (error) {
      return {
        ...item,
        exists: false,
        checked: false,
        errorMessage: error instanceof Error ? error.message : '分析失败'
      }
    }
  }))
}

function getBrowserBookmarkRoots() {
  const localAppData = String(process.env.LOCALAPPDATA ?? '').trim()
  const appData = String(process.env.APPDATA ?? '').trim()
  return [
    { browserName: 'Chrome', rootPath: localAppData ? path.join(localAppData, 'Google', 'Chrome', 'User Data') : '' },
    { browserName: 'Edge', rootPath: localAppData ? path.join(localAppData, 'Microsoft', 'Edge', 'User Data') : '' },
    { browserName: 'Brave', rootPath: localAppData ? path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') : '' },
    { browserName: 'Chromium', rootPath: localAppData ? path.join(localAppData, 'Chromium', 'User Data') : '' },
    { browserName: 'Vivaldi', rootPath: localAppData ? path.join(localAppData, 'Vivaldi', 'User Data') : '' },
    { browserName: 'Opera', rootPath: appData ? path.join(appData, 'Opera Software', 'Opera Stable') : '' },
    { browserName: 'Opera GX', rootPath: appData ? path.join(appData, 'Opera Software', 'Opera GX Stable') : '' }
  ].filter((item) => item.rootPath)
}

async function discoverBrowserBookmarkSources(): Promise<BrowserBookmarkSource[]> {
  const sources: BrowserBookmarkSource[] = []

  for (const browser of getBrowserBookmarkRoots()) {
    if (!await fs.pathExists(browser.rootPath)) {
      continue
    }

    const entries = await fs.readdir(browser.rootPath, { withFileTypes: true }) as Array<{ isDirectory: () => boolean; name: string }>
    const profileNames: string[] = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => String(entry.name ?? ''))
      .filter((name) => name === 'Default' || /^Profile \d+$/i.test(name))

    if (await fs.pathExists(path.join(browser.rootPath, 'Bookmarks'))) {
      profileNames.unshift('')
    }

    for (const profileNameRaw of Array.from(new Set(profileNames))) {
      const profileName = String(profileNameRaw ?? '').trim()
      const bookmarkPath = profileName
        ? path.join(browser.rootPath, profileName, 'Bookmarks')
        : path.join(browser.rootPath, 'Bookmarks')
      if (!await fs.pathExists(bookmarkPath)) {
        continue
      }

      sources.push({
        id: crypto
          .createHash('sha1')
          .update(`${browser.browserName}::${profileName || 'Default'}::${bookmarkPath}`)
          .digest('hex'),
        browserName: browser.browserName,
        profileName: profileName || 'Default',
        filePath: bookmarkPath
      })
    }
  }

  return sources
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

function isAcceptableWebsitePageStatus(status: number) {
  return status >= 200 && status < 500
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
  const requestHeaders = buildWebsitePageRequestHeaders()
  const requestConfig = {
    timeout: timeoutMs,
    maxRedirects: 5,
    validateStatus: isAcceptableWebsitePageStatus,
    headers: requestHeaders,
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
    validateStatus: isAcceptableWebsitePageStatus,
    responseType: 'stream',
    headers: buildWebsitePageRequestHeaders(),
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

function preserveOriginalUrlHash(targetUrl: string, originalUrl: string) {
  const normalizedTargetUrl = String(targetUrl ?? '').trim()
  const normalizedOriginalUrl = String(originalUrl ?? '').trim()
  if (!normalizedTargetUrl || !normalizedOriginalUrl) {
    return normalizedTargetUrl
  }

  try {
    const target = new URL(normalizedTargetUrl)
    const original = new URL(normalizedOriginalUrl)
    if (target.hash || !original.hash) {
      return target.toString()
    }

    if (target.origin === original.origin && target.pathname === original.pathname && target.search === original.search) {
      target.hash = original.hash
      return target.toString()
    }
  } catch {
    return normalizedTargetUrl
  }

  return normalizedTargetUrl
}

const WEBSITE_FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

function buildWebsitePageRequestHeaders(refererUrl?: string) {
  const normalizedReferer = String(refererUrl ?? '').trim()

  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': WEBSITE_FETCH_USER_AGENT,
    ...(normalizedReferer ? { Referer: normalizedReferer } : {}),
  }
}

function buildWebsiteFaviconRequestHeaders(faviconUrl: string, pageUrl?: string) {
  const normalizedPageUrl = String(pageUrl ?? '').trim()
  let referer = normalizedPageUrl

  if (!referer) {
    try {
      const parsedUrl = new URL(faviconUrl)
      referer = `${parsedUrl.origin}/`
    } catch {
      referer = ''
    }
  }

  return {
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'User-Agent': WEBSITE_FETCH_USER_AGENT,
    ...(referer ? { Referer: referer } : {}),
  }
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

type WebsiteFaviconCandidate = {
  url: string
  priority: number
  source: string
}

function buildWebsiteFetchCacheKey(pageUrl: string, salt: string) {
  return `website-fetch-${crypto
    .createHash('sha1')
    .update(`${String(pageUrl ?? '').trim()}::${String(salt ?? '').slice(0, 4096)}`)
    .digest('hex')
    .slice(0, 16)}`
}

function getHtmlTagAttributes(htmlText: string, tagName: string) {
  const normalizedTagName = String(tagName ?? '').trim()
  if (!normalizedTagName) {
    return []
  }

  const tagRegex = new RegExp(`<${normalizedTagName}\\b[^>]*>`, 'gi')
  return (String(htmlText ?? '').match(tagRegex) ?? []).map((tag) => parseHtmlAttributes(tag))
}

function normalizeFaviconCandidateUrl(rawUrl: string, baseUrl: string) {
  const normalizedRawUrl = String(rawUrl ?? '').trim()
  if (!normalizedRawUrl) {
    return ''
  }

  if (/^data:image\//i.test(normalizedRawUrl)) {
    return normalizedRawUrl
  }

  try {
    const candidateUrl = new URL(normalizedRawUrl, baseUrl)
    return ['http:', 'https:'].includes(candidateUrl.protocol) ? candidateUrl.toString() : ''
  } catch {
    return ''
  }
}

function getLargestIconSizeScore(sizes: string) {
  const values = String(sizes ?? '').toLowerCase().match(/(\d{1,4})x(\d{1,4})/g) ?? []
  let largest = 0
  for (const value of values) {
    const [width, height] = value.split('x').map((item) => Number.parseInt(item, 10))
    if (Number.isFinite(width) && Number.isFinite(height)) {
      largest = Math.max(largest, Math.min(width, height))
    }
  }

  return Math.min(24, largest / 16)
}

function addFaviconCandidate(
  candidates: WebsiteFaviconCandidate[],
  rawUrl: string,
  baseUrl: string,
  priority: number,
  source: string
) {
  const url = normalizeFaviconCandidateUrl(rawUrl, baseUrl)
  if (!url) {
    return
  }

  const existing = candidates.find((candidate) => candidate.url === url)
  if (existing) {
    if (priority > existing.priority) {
      existing.priority = priority
      existing.source = source
    }
    return
  }

  candidates.push({
    url,
    priority,
    source
  })
}

function collectHtmlFaviconCandidates(htmlText: string, pageUrl: string) {
  const candidates: WebsiteFaviconCandidate[] = []
  const links = getHtmlTagAttributes(htmlText, 'link')

  for (const attrs of links) {
    const href = String(attrs.href ?? '').trim()
    const relTokens = String(attrs.rel ?? '')
      .toLowerCase()
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (!href || !relTokens.length) {
      continue
    }

    const hasIconRel = relTokens.includes('icon') || relTokens.includes('shortcut')
    const hasAppleTouchIconRel = relTokens.includes('apple-touch-icon') || relTokens.includes('apple-touch-icon-precomposed')
    const hasMaskIconRel = relTokens.includes('mask-icon')
    const hasFluidIconRel = relTokens.includes('fluid-icon')
    if (!hasIconRel && !hasAppleTouchIconRel && !hasMaskIconRel && !hasFluidIconRel) {
      continue
    }

    const sizes = String(attrs.sizes ?? '').toLowerCase()
    const type = String(attrs.type ?? '').toLowerCase()
    const priority = (hasIconRel ? 120 : hasAppleTouchIconRel ? 95 : hasFluidIconRel ? 82 : 72)
      + (sizes === 'any' ? 10 : 0)
      + getLargestIconSizeScore(sizes)
      + (type.includes('svg') ? 8 : 0)
      + (type.includes('png') || type.includes('webp') ? 4 : 0)
    addFaviconCandidate(candidates, href, pageUrl, priority, 'html-link')
  }

  const metaIconNames = new Set([
    'msapplication-tileimage',
    'msapplication-square70x70logo',
    'msapplication-square150x150logo',
    'msapplication-wide310x150logo',
    'msapplication-square310x310logo',
    'thumbnail'
  ])
  for (const attrs of getHtmlTagAttributes(htmlText, 'meta')) {
    const name = String(attrs.name ?? attrs.property ?? '').trim().toLowerCase()
    const content = String(attrs.content ?? '').trim()
    if (!content || !metaIconNames.has(name)) {
      continue
    }
    addFaviconCandidate(candidates, content, pageUrl, 68, 'html-meta')
  }

  for (const candidate of collectInlineSiteIconCandidates(htmlText, pageUrl)) {
    addFaviconCandidate(candidates, candidate.url, pageUrl, candidate.priority, candidate.source)
  }

  return candidates
}

function collectManifestUrls(htmlText: string, pageUrl: string) {
  const manifestUrls: string[] = []
  for (const attrs of getHtmlTagAttributes(htmlText, 'link')) {
    const relTokens = String(attrs.rel ?? '')
      .toLowerCase()
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (!relTokens.includes('manifest')) {
      continue
    }

    const manifestUrl = normalizeFaviconCandidateUrl(String(attrs.href ?? '').trim(), pageUrl)
    if (manifestUrl && !manifestUrls.includes(manifestUrl)) {
      manifestUrls.push(manifestUrl)
    }
  }

  return manifestUrls
}

async function collectManifestFaviconCandidates(htmlText: string, pageUrl: string) {
  const candidates: WebsiteFaviconCandidate[] = []
  for (const manifestUrl of collectManifestUrls(htmlText, pageUrl).slice(0, 3)) {
    try {
      const response = await axios.get(manifestUrl, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: isAcceptableWebsitePageStatus,
        headers: buildWebsitePageRequestHeaders(pageUrl),
        ...(await getAxiosProxyConfig(manifestUrl)),
      })
      if (Number(response.status) >= 400) {
        continue
      }

      const manifest = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
      const icons = Array.isArray(manifest?.icons) ? manifest.icons : []
      for (const icon of icons) {
        const src = String(icon?.src ?? '').trim()
        if (!src) {
          continue
        }

        const purpose = String(icon?.purpose ?? '').toLowerCase()
        const priority = 78
          + getLargestIconSizeScore(String(icon?.sizes ?? ''))
          + (String(icon?.type ?? '').toLowerCase().includes('svg') ? 6 : 0)
          - (purpose.includes('monochrome') ? 20 : 0)
        addFaviconCandidate(candidates, src, manifestUrl, priority, 'manifest')
      }
    } catch (error) {
      ResourceService.logger.debug('collectManifestFaviconCandidates failed', {
        pageUrl,
        manifestUrl,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return candidates
}

function collectBrowserConfigUrls(htmlText: string, pageUrl: string) {
  const configUrls: string[] = []
  for (const attrs of getHtmlTagAttributes(htmlText, 'meta')) {
    const name = String(attrs.name ?? '').trim().toLowerCase()
    const content = String(attrs.content ?? '').trim()
    if (name !== 'msapplication-config' || !content) {
      continue
    }

    const configUrl = normalizeFaviconCandidateUrl(content, pageUrl)
    if (configUrl && !configUrls.includes(configUrl)) {
      configUrls.push(configUrl)
    }
  }

  return configUrls
}

async function collectBrowserConfigFaviconCandidates(htmlText: string, pageUrl: string) {
  const candidates: WebsiteFaviconCandidate[] = []
  for (const configUrl of collectBrowserConfigUrls(htmlText, pageUrl).slice(0, 3)) {
    try {
      const response = await axios.get(configUrl, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: isAcceptableWebsitePageStatus,
        headers: buildWebsitePageRequestHeaders(pageUrl),
        ...(await getAxiosProxyConfig(configUrl)),
      })
      if (Number(response.status) >= 400) {
        continue
      }

      const xmlText = String(response.data ?? '')
      const tileMatches = xmlText.match(/<(?:square\d+x\d+logo|wide\d+x\d+logo|tileimage)\b[^>]*>/gi) ?? []
      for (const tileTag of tileMatches) {
        const attrs = parseHtmlAttributes(tileTag)
        addFaviconCandidate(candidates, String(attrs.src ?? '').trim(), configUrl, 62, 'browserconfig')
      }
    } catch (error) {
      ResourceService.logger.debug('collectBrowserConfigFaviconCandidates failed', {
        pageUrl,
        configUrl,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return candidates
}

function collectFallbackFaviconCandidates(pageUrl: string) {
  const candidates: WebsiteFaviconCandidate[] = []
  for (const item of [
    { path: '/favicon.ico', priority: 30 },
    { path: '/favicon.png', priority: 24 },
    { path: '/favicon.svg', priority: 22 },
    { path: '/apple-touch-icon.png', priority: 20 },
    { path: '/apple-touch-icon-precomposed.png', priority: 18 }
  ]) {
    try {
      const page = new URL(pageUrl)
      addFaviconCandidate(candidates, item.path, page.origin, item.priority, 'fallback')
    } catch {
      continue
    }
  }

  return candidates
}

async function collectWebsiteFaviconCandidates(htmlText: string, pageUrl: string) {
  const candidates = [
    ...collectHtmlFaviconCandidates(htmlText, pageUrl),
    ...await collectManifestFaviconCandidates(htmlText, pageUrl),
    ...await collectBrowserConfigFaviconCandidates(htmlText, pageUrl),
    ...collectFallbackFaviconCandidates(pageUrl)
  ]
  const dedupedCandidates: WebsiteFaviconCandidate[] = []
  for (const candidate of candidates) {
    addFaviconCandidate(dedupedCandidates, candidate.url, pageUrl, candidate.priority, candidate.source)
  }

  return dedupedCandidates.sort((left, right) => right.priority - left.priority)
}

async function resolveWebsiteFaviconToCache(htmlText: string, pageUrl: string, resourceId: string) {
  const candidates = await collectWebsiteFaviconCandidates(htmlText, pageUrl)
  for (const candidate of candidates) {
    const cachedFavicon = await cacheWebsiteFaviconToCache(
      candidate.url,
      resourceId,
      pageUrl,
      { returnInputOnFailure: false }
    )
    if (cachedFavicon) {
      ResourceService.logger.debug('resolveWebsiteFaviconToCache success', {
        pageUrl,
        faviconUrl: candidate.url,
        source: candidate.source
      })
      return cachedFavicon
    }
  }

  ResourceService.logger.debug('resolveWebsiteFaviconToCache found no usable favicon', {
    pageUrl,
    candidateCount: candidates.length
  })
  return ''
}

function collectInlineSiteIconCandidates(htmlText: string, pageUrl: string) {
  const candidates: WebsiteFaviconCandidate[] = []
  const imgMatches = String(htmlText ?? '').match(/<img\b[^>]*>/gi) ?? []

  for (const imgTag of imgMatches) {
    const attrs = parseHtmlAttributes(imgTag)
    const src = String(attrs.src ?? '').trim()
    if (!src) {
      continue
    }

    const descriptor = [
      attrs.class,
      attrs.id,
      attrs.alt,
      attrs.title,
      attrs.role
    ].map((value) => String(value ?? '').toLowerCase()).join(' ')

    const isSiteIcon = /(?:^|[\s_-])(?:atwiki-)?site-icon(?:$|[\s_-])/.test(descriptor)
      || /(?:^|[\s_-])(?:app|wiki|site)[\s_-]*icon(?:$|[\s_-])/.test(descriptor)
      || /(?:^|[\s_-])favicon(?:$|[\s_-])/.test(descriptor)
    if (!isSiteIcon) {
      continue
    }

    try {
      addFaviconCandidate(candidates, src, pageUrl, 42, 'inline-site-icon')
    } catch {
      continue
    }
  }

  return candidates
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
    await DatabaseService.refreshResourceSearchText(resourceId)
    return
  }

  const typePayload = await buildTypePayload(resourceId, resourceForm)
  db.transaction((tx) => {
    DatabaseService.deleteTypeRefsByResourceId(resourceId, tx)
    DatabaseService.insertTypes(typePayload.newTypes, tx)
    DatabaseService.insertTypeRefs(typePayload.typeRefs, tx)
  })
  await DatabaseService.refreshResourceSearchText(resourceId)
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

async function getStoreOptionMap() {
  if (cachedStoreOptionMap) {
    return cachedStoreOptionMap
  }

  const optionGroups = await Promise.all(STORE_URL_DICT_TYPES.map((dictTypeName) => DatabaseService.getSelectDictData(dictTypeName)))
  const nextMap = new Map<string, any>()

  for (const options of optionGroups) {
    for (const option of options ?? []) {
      const optionId = String(option?.value ?? '').trim()
      if (optionId) {
        nextMap.set(optionId, option)
      }
    }
  }

  cachedStoreOptionMap = nextMap
  return nextMap
}

function buildStoreUrlFromOption(option: any, workId: string) {
  const normalizedWorkId = String(workId ?? '').trim()
  if (!normalizedWorkId) {
    return ''
  }

  const rawTemplate = String(
    option?.extra?.url?.games
    ?? option?.extra?.url?.manga
    ?? option?.extra?.url?.image
    ?? option?.extra?.url?.novel
    ?? option?.extra?.url?.video
    ?? ''
  ).trim()

  if (!rawTemplate) {
    return ''
  }

  let resolvedTemplate = rawTemplate
  const startsWithRules = option?.extra?.rule?.startsWith
  if (resolvedTemplate.includes('{rule}') && startsWithRules && typeof startsWithRules === 'object') {
    const matchedRule = Object.entries(startsWithRules).find(([, prefix]) =>
      normalizedWorkId.toUpperCase().startsWith(String(prefix ?? '').trim().toUpperCase())
    )?.[0]

    resolvedTemplate = resolvedTemplate.replace('{rule}', String(matchedRule ?? 'maniax'))
  }

  return resolvedTemplate.replace('{}', normalizedWorkId)
}

async function resolveStoreUrlByDictId(storeId: string, workId: string) {
  const normalizedStoreId = String(storeId ?? '').trim()
  const normalizedWorkId = String(workId ?? '').trim()
  if (!normalizedStoreId || !normalizedWorkId) {
    return ''
  }

  const optionMap = await getStoreOptionMap()
  const option = optionMap.get(normalizedStoreId)
  return buildStoreUrlFromOption(option, normalizedWorkId)
}

async function buildStoreWorkPayloads(resourceId: string, resourceForm: ResourceForm, categoryInfo?: any) {
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

  const uniqueItems = storeItems
    .filter((item) => item.websiteType && (item.workId || item.url))
    .filter((item) => {
      const uniqueKey = `${item.websiteType}::${item.workId}`
      if (seen.has(uniqueKey)) {
        return false
      }

      seen.add(uniqueKey)
      return true
    })

  return await Promise.all(uniqueItems.map(async (item) => ({
    resourceId,
    storeId: item.websiteType,
    workId: item.workId,
    url: item.url || await resolveStoreUrlByDictId(item.websiteType, item.workId)
  })))
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
  const nonMarkerSystemEntries = new Set(['desktop.ini', 'thumbs.db'])
  const effectiveEntries = remainingEntries.filter((entry) => !nonMarkerSystemEntries.has(String(entry ?? '').trim().toLowerCase()))

  if (!effectiveEntries.length) {
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

async function isLocalCoverFileTooLarge(filePath: string) {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() && Number(stat.size ?? 0) > MAX_COVER_SOURCE_BYTES
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
    await withTimeout(
      sharp(input, { limitInputPixels: MAX_COVER_PROCESS_PIXELS, animated: false })
        .resize({
          width: COVER_THUMBNAIL_MAX_WIDTH,
          height: COVER_THUMBNAIL_MAX_WIDTH,
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({
          quality: COVER_THUMBNAIL_WEBP_QUALITY,
          effort: 4
        })
        .toFile(tempTargetPath),
      COVER_PROCESS_TIMEOUT_MS,
      '封面压缩超时'
    )

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
    if (imageBuffer.byteLength > MAX_COVER_SOURCE_BYTES) {
      return ''
    }
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

  if (await isLocalCoverFileTooLarge(normalizedInputPath)) {
    return ''
  }

  if (await isImageTooLargeForCover(normalizedInputPath)) {
    return ''
  }

  return await writeProcessedCover(normalizedInputPath)
}

async function cacheWebsiteFaviconToCache(
  faviconPath: string,
  resourceId: string,
  pageUrl?: string,
  options?: {
    returnInputOnFailure?: boolean
  }
) {
  const normalizedFaviconPath = String(faviconPath ?? '').trim()
  const normalizedResourceId = String(resourceId ?? '').trim()
  const returnInputOnFailure = options?.returnInputOnFailure !== false
  if (!normalizedFaviconPath) {
    return ''
  }

  if (!normalizedResourceId) {
    return normalizedFaviconPath
  }

  try {
    const processedFavicon = await dealCover(normalizedFaviconPath, `${normalizedResourceId}-favicon`)
    if (processedFavicon) {
      return processedFavicon
    }

    const rawDataUrlFavicon = await cacheRawDataUrlFaviconAsset(normalizedFaviconPath, normalizedResourceId)
    if (rawDataUrlFavicon) {
      return rawDataUrlFavicon
    }

    return returnInputOnFailure ? normalizedFaviconPath : ''
  } catch (error) {
    const rawDataUrlFavicon = await cacheRawDataUrlFaviconAsset(normalizedFaviconPath, normalizedResourceId)
    if (rawDataUrlFavicon) {
      return rawDataUrlFavicon
    }

    if (isRemoteCoverPath(normalizedFaviconPath)) {
      const fallbackCachedPath = await cacheRawRemoteFaviconAsset(normalizedFaviconPath, normalizedResourceId, pageUrl)
      if (fallbackCachedPath) {
        return fallbackCachedPath
      }
    }

    ResourceService.logger.warn('cacheWebsiteFaviconToCache skipped invalid favicon', {
      resourceId: normalizedResourceId,
      faviconPath: normalizedFaviconPath,
      error: error instanceof Error ? error.message : String(error)
    })
    return returnInputOnFailure ? normalizedFaviconPath : ''
  }
}

async function cacheRawDataUrlFaviconAsset(faviconDataUrl: string, resourceId: string) {
  try {
    const normalizedFaviconDataUrl = String(faviconDataUrl ?? '').trim()
    const dataUrlMatch = normalizedFaviconDataUrl.match(/^data:([^;,]+)?;base64,(.+)$/i)
    if (!dataUrlMatch) {
      return ''
    }

    const mimeType = String(dataUrlMatch[1] ?? '').trim().toLowerCase()
    const extensionMap: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/bmp': '.bmp',
      'image/x-icon': '.ico',
      'image/vnd.microsoft.icon': '.ico',
      'image/svg+xml': '.svg'
    }
    const safeExtension = extensionMap[mimeType] ?? '.ico'
    const imageBuffer = Buffer.from(dataUrlMatch[2], 'base64')
    if (!imageBuffer.length || imageBuffer.length > 5 * 1024 * 1024) {
      return ''
    }

    const cacheRoot = await getCacheRootDirectory()
    const faviconCacheDirectory = path.join(cacheRoot, 'website-favicons')
    await fs.ensureDir(faviconCacheDirectory)

    const targetPath = path.join(faviconCacheDirectory, `${resourceId}-${Date.now()}-${generateId()}${safeExtension}`)
    await fs.writeFile(targetPath, imageBuffer)
    return targetPath
  } catch (error) {
    ResourceService.logger.warn('cacheRawDataUrlFaviconAsset failed', {
      resourceId,
      error: error instanceof Error ? error.message : String(error)
    })
    return ''
  }
}

async function cacheRawRemoteFaviconAsset(faviconUrl: string, resourceId: string, pageUrl?: string) {
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
      headers: buildWebsiteFaviconRequestHeaders(faviconUrl, pageUrl),
      ...(await getAxiosProxyConfig(faviconUrl)),
    })
    const contentType = String(response.headers?.['content-type'] ?? '').toLowerCase()
    if (contentType && !contentType.includes('image/') && !contentType.includes('octet-stream')) {
      return ''
    }

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

async function writeManagedWebsiteCover(resourceId: string, imageBuffer: Buffer) {
  const outputPath = await getManagedWebsiteCoverPath(resourceId)
  const outputDirectory = path.dirname(outputPath)
  const tempPath = `${outputPath}.tmp`
  await fs.ensureDir(outputDirectory)
  await withTimeout(
    sharp(imageBuffer, {
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
      .toFile(tempPath),
    WEBSITE_COVER_WRITE_TIMEOUT_MS,
    '网站封面图片写入超时'
  )

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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void
) {
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null

  return new Promise<T>((resolve, reject) => {
    timeoutTimer = setTimeout(() => {
      timeoutTimer = null
      try {
        onTimeout?.()
      } catch {}
      reject(new Error(message))
    }, timeoutMs)

    promise.then((value) => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      resolve(value)
    }).catch((error) => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      reject(error)
    })
  })
}

function waitForWebsiteScreenshotPageReady(window: BrowserWindow, url: string) {
  return new Promise<void>((resolve, reject) => {
    const webContents = window.webContents
    let settled = false
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let domReadyTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      if (domReadyTimer) {
        clearTimeout(domReadyTimer)
        domReadyTimer = null
      }
      webContents.removeListener('did-finish-load', handleFinishLoad)
      webContents.removeListener('dom-ready', handleDomReady)
      webContents.removeListener('did-fail-load', handleFailLoad)
    }

    const resolveReady = (reason: string) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      ResourceService.logger.debug('website screenshot page ready', {
        url,
        reason,
        currentUrl: webContents.isDestroyed() ? '' : webContents.getURL()
      })
      resolve()
    }

    const rejectLoad = (error: Error) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      reject(error)
    }

    const handleFinishLoad = () => resolveReady('did-finish-load')
    const handleDomReady = () => {
      domReadyTimer = setTimeout(() => resolveReady('dom-ready'), 1200)
    }
    const handleFailLoad = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedUrl: string,
      isMainFrame: boolean
    ) => {
      if (!isMainFrame) {
        return
      }

      rejectLoad(new Error(`网站封面页面加载失败：${errorDescription || errorCode} ${validatedUrl || url}`))
    }

    webContents.once('did-finish-load', handleFinishLoad)
    webContents.once('dom-ready', handleDomReady)
    webContents.on('did-fail-load', handleFailLoad)

    webContents.loadURL(url, {
      userAgent: WEBSITE_FETCH_USER_AGENT
    }).then(() => {
      resolveReady('loadURL')
    }).catch((error) => {
      if (!settled) {
        rejectLoad(error instanceof Error ? error : new Error(String(error)))
      }
    })

    timeoutTimer = setTimeout(() => {
      if (settled) {
        return
      }

      const currentUrl = webContents.isDestroyed() ? '' : webContents.getURL()
      if (currentUrl && currentUrl !== 'about:blank') {
        resolveReady('timeout-with-document')
        return
      }

      rejectLoad(new Error('网站封面截图超时'))
    }, WEBSITE_COVER_CAPTURE_TIMEOUT_MS)
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

    await waitForWebsiteScreenshotPageReady(screenshotWindow, url)

    if (downloadBlocked) {
      throw new Error('该链接指向下载内容，已跳过网页封面截图')
    }

    await withTimeout(screenshotWindow.webContents.insertCSS(`
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
    `), WEBSITE_COVER_CAPTURE_OPERATION_TIMEOUT_MS, '网站封面样式注入超时', () => {
      if (!screenshotWindow.isDestroyed()) {
        screenshotWindow.destroy()
      }
    })

    await withTimeout(screenshotWindow.webContents.executeJavaScript(`
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
    `), WEBSITE_COVER_CAPTURE_OPERATION_TIMEOUT_MS, '网站封面页面脚本执行超时', () => {
      if (!screenshotWindow.isDestroyed()) {
        screenshotWindow.destroy()
      }
    })

    await waitForTimeout(WEBSITE_COVER_STABILIZE_DELAY_MS)
    const capturedImage = await withTimeout(
      screenshotWindow.webContents.capturePage(),
      WEBSITE_COVER_CAPTURE_OPERATION_TIMEOUT_MS,
      '网站封面截图超时',
      () => {
        if (!screenshotWindow.isDestroyed()) {
          screenshotWindow.destroy()
        }
      }
    )
    const screenshotBuffer = capturedImage.toPNG()

    if (!screenshotBuffer.length) {
      throw new Error('网站封面截图为空')
    }

    return screenshotBuffer
  } finally {
    if (!screenshotWindow.isDestroyed()) {
      screenshotWindow.webContents.session.removeListener('will-download', downloadHandler)
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
    const resolvedImagePath = getResolvedFilePath(pathInfo)
    return resolvedImagePath ? await dealCover(resolvedImagePath, resourceId) : ''
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
    if (['audio_meta', 'single_image_meta', 'multi_image_meta'].includes(extendTableName)) {
      ResourceService.logger.warn('resolveResourceCoverPath skipped invalid cover for tolerant category', {
        resourceId,
        extendTableName,
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
        String(resourceId ?? '').trim(),
        websiteTarget,
        { returnInputOnFailure: false }
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

type ArchiveFormat = '7z' | 'zip' | 'tar' | 'xz' | 'tar.xz' | 'exe'

type ArchiveExecutionPlan = {
  outputPath: string
  cleanupPaths: string[]
  steps: Array<{
    command: string
    args: string[]
    progressStart: number
    progressEnd: number
  }>
}

function normalizeArchiveFormat(value: string): ArchiveFormat {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'zip' || normalized === 'tar' || normalized === 'xz' || normalized === 'tar.xz' || normalized === 'exe') {
    return normalized
  }

  return '7z'
}

function supportsArchivePassword(format: ArchiveFormat) {
  return format === '7z' || format === 'zip' || format === 'exe'
}

function clampArchiveLevel(value: number) {
  if (!Number.isFinite(value)) {
    return 9
  }

  return Math.min(9, Math.max(0, Math.trunc(value)))
}

function parseBooleanSetting(value: unknown, fallback = false) {
  const normalizedValue = String(value ?? '').trim().toLowerCase()
  if (!normalizedValue) {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(normalizedValue)
}

function resolveArchiveSplitSizeMb(rawSplitValue: string, rawCustomValue: string) {
  const normalizedSplitValue = String(rawSplitValue ?? '').trim().toLowerCase()
  if (!normalizedSplitValue || normalizedSplitValue === 'none') {
    return null
  }

  if (normalizedSplitValue === 'custom') {
    const customValue = Number.parseInt(String(rawCustomValue ?? '').trim(), 10)
    return Number.isFinite(customValue) && customValue > 0 ? customValue : null
  }

  const parsedValue = Number.parseInt(normalizedSplitValue, 10)
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
}

function sanitizeArchiveName(value: string) {
  const normalized = String(value ?? '').trim()
  const sanitized = normalized
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()

  return sanitized || 'archive'
}

function getArchiveFileExtension(format: ArchiveFormat) {
  switch (format) {
    case 'tar.xz':
      return '.tar.xz'
    case 'exe':
      return '.exe'
    default:
      return `.${format}`
  }
}

async function allocateArchiveTargetPath(directoryPath: string, baseName: string, format: ArchiveFormat) {
  const extension = getArchiveFileExtension(format)
  let index = 0

  while (true) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidatePath = path.join(directoryPath, `${baseName}${suffix}${extension}`)
    const candidateExists = await fs.pathExists(candidatePath)
    const splitExists = await fs.pathExists(`${candidatePath}.001`)
    if (!candidateExists && !splitExists) {
      return candidatePath
    }
    index += 1
  }
}

function resolveArchiveItemEntryPath(sourcePath: string) {
  const normalizedSourcePath = path.normalize(String(sourcePath ?? '').trim())
  return path.basename(normalizedSourcePath) || normalizedSourcePath
}

function resolveArchiveExtractedItemPath(outputDirectory: string, archiveEntryPath: string, fallbackSourcePath: string) {
  const normalizedEntryPath = String(archiveEntryPath ?? '').trim()
  const fallbackEntryPath = resolveArchiveItemEntryPath(fallbackSourcePath)
  const looksAbsolutePath = /^[a-zA-Z]:[\\/]/.test(normalizedEntryPath) || normalizedEntryPath.startsWith('\\\\')
  const relativeEntryPath = looksAbsolutePath || !normalizedEntryPath
    ? fallbackEntryPath
    : normalizedEntryPath.replace(/^[/\\]+/, '')

  return path.join(outputDirectory, relativeEntryPath)
}

async function extractArchivedPackageToDirectory(options: {
  archivePath: string
  archiveFormat: ArchiveFormat
  outputDirectory: string
  password: string
  onProgress?: (progress: number) => void
  onSpawn?: (process: ChildProcess) => void
  isCancelled?: () => boolean
}) {
  const sevenZipPath = await resolveSevenZipExecutablePath()
  if (!sevenZipPath) {
    throw new Error('未找到 7z.exe，无法还原归档包')
  }

  const archivePath = path.normalize(String(options.archivePath ?? '').trim())
  const outputDirectory = path.normalize(String(options.outputDirectory ?? '').trim())
  await fs.ensureDir(outputDirectory)

  const buildExtractArgs = (targetArchivePath: string, outputDirectory: string) => {
    const args = [
      'x',
      targetArchivePath,
      `-o${outputDirectory}`,
      '-y',
      '-bsp1',
      '-bse1'
    ]
    if (options.password) {
      args.push(`-p${options.password}`)
    }
    return args
  }

  if (options.archiveFormat !== 'tar.xz') {
    await run7ZipArchiveStep(
      {
        command: sevenZipPath,
        args: buildExtractArgs(archivePath, outputDirectory),
        progressStart: 0,
        progressEnd: 100
      },
      (progress) => options.onProgress?.(progress),
      {
        onSpawn: options.onSpawn,
        isCancelled: options.isCancelled
      }
    )
    return
  }

    const tempDirectory = path.join(path.dirname(archivePath), `.nrm-restore-stage-${generateId()}`)
  try {
    await fs.ensureDir(tempDirectory)
    await run7ZipArchiveStep(
      {
        command: sevenZipPath,
        args: buildExtractArgs(archivePath, tempDirectory),
        progressStart: 0,
        progressEnd: 45
      },
      (progress) => options.onProgress?.(progress),
      {
        onSpawn: options.onSpawn,
        isCancelled: options.isCancelled
      }
    )

    const extractedEntries = await originalFs.promises.readdir(tempDirectory)
    const tarFileName = extractedEntries.find((entry) => entry.toLowerCase().endsWith('.tar')) ?? extractedEntries[0]
    if (!tarFileName) {
      throw new Error('解压 tar.xz 后未找到 tar 文件')
    }

    await run7ZipArchiveStep(
      {
        command: sevenZipPath,
        args: buildExtractArgs(path.join(tempDirectory, tarFileName), outputDirectory),
        progressStart: 45,
        progressEnd: 100
      },
      (progress) => options.onProgress?.(progress),
      {
        onSpawn: options.onSpawn,
        isCancelled: options.isCancelled
      }
    )
  } finally {
    await removePhysicalPath(tempDirectory)
  }
}

async function resolveSevenZipExecutablePath() {
  const candidatePaths = [
    path.resolve(process.cwd(), 'resources', 'bin', '7z.exe'),
    path.resolve(process.cwd(), 'resources', 'bin', '7za.exe'),
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin', '7z.exe') : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'bin', '7z.exe') : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'bin', '7z.exe') : ''
  ].filter(Boolean)

  for (const candidatePath of candidatePaths) {
    if (await fs.pathExists(candidatePath)) {
      return candidatePath
    }
  }

  return ''
}

function buildArchiveExecutionPlan(options: {
  sevenZipPath: string
  archiveFormat: ArchiveFormat
  archivePath: string
  sourcePaths: string[]
  password: string
  splitSizeMb: number | null
  multithreadEnabled: boolean
  threadCount: number
  archiveLevel: number
}): ArchiveExecutionPlan {
  const commonArgs = ['-y', '-bsp1', '-bse1', `-mx=${clampArchiveLevel(options.archiveLevel)}`]
  if (options.password) {
    commonArgs.push(`-p${options.password}`)
  }
  if (options.splitSizeMb && options.splitSizeMb > 0) {
    commonArgs.push(`-v${options.splitSizeMb}m`)
  }
  commonArgs.push(options.multithreadEnabled ? `-mmt=${options.threadCount}` : '-mmt=off')

  if (options.archiveFormat === 'tar.xz') {
    const tempTarPath = options.archivePath.replace(/\.tar\.xz$/i, '.tar')
    return {
      outputPath: options.archivePath,
      cleanupPaths: [tempTarPath],
      steps: [
        {
          command: options.sevenZipPath,
          args: ['a', '-ttar', tempTarPath, ...options.sourcePaths, ...commonArgs],
          progressStart: 8,
          progressEnd: 58
        },
        {
          command: options.sevenZipPath,
          args: ['a', '-txz', options.archivePath, tempTarPath, ...commonArgs],
          progressStart: 60,
          progressEnd: 92
        }
      ]
    }
  }

  const formatSwitch = options.archiveFormat === 'exe'
    ? '-t7z'
    : `-t${options.archiveFormat}`
  const extraArgs = options.archiveFormat === 'exe' ? ['-sfx'] : []

  return {
    outputPath: options.archivePath,
    cleanupPaths: [],
    steps: [
      {
        command: options.sevenZipPath,
        args: ['a', formatSwitch, options.archivePath, ...options.sourcePaths, ...extraArgs, ...commonArgs],
        progressStart: 8,
        progressEnd: 92
      }
    ]
  }
}

function run7ZipArchiveStep(
  step: { command: string; args: string[]; progressStart: number; progressEnd: number },
  onProgress: (progress: number) => void,
  options?: {
    onSpawn?: (process: ChildProcess) => void
    isCancelled?: () => boolean
  }
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let stderrBuffer = ''
    let stdoutBuffer = ''
    let lastProgress = step.progressStart
    const archiveProcess = spawn(step.command, step.args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    options?.onSpawn?.(archiveProcess)

    if (options?.isCancelled?.()) {
      settled = true
      try {
        archiveProcess.kill('SIGTERM')
      } catch {}
      reject(new Error('归档任务已取消'))
      return
    }

    const updateProgressFromChunk = (chunk: Buffer | string) => {
      if (options?.isCancelled?.()) {
        if (!settled) {
          settled = true
          try {
            archiveProcess.kill('SIGTERM')
          } catch {}
          reject(new Error('归档任务已取消'))
        }
        return
      }

      const text = String(chunk ?? '')
      const matches = text.match(/(\d{1,3})%/g) ?? []
      for (const match of matches) {
        const value = Number.parseInt(match.replace('%', ''), 10)
        if (!Number.isFinite(value)) {
          continue
        }
        const normalized = Math.round(
          step.progressStart + ((step.progressEnd - step.progressStart) * Math.min(100, Math.max(0, value)) / 100)
        )
        if (normalized > lastProgress) {
          lastProgress = normalized
          onProgress(normalized)
        }
      }
    }

    archiveProcess.stdout.on('data', (chunk) => {
      stdoutBuffer += String(chunk)
      updateProgressFromChunk(chunk)
    })
    archiveProcess.stderr.on('data', (chunk) => {
      stderrBuffer += String(chunk)
      updateProgressFromChunk(chunk)
    })
    archiveProcess.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    })
    archiveProcess.on('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      if (code === 0) {
        onProgress(step.progressEnd)
        resolve()
        return
      }

      const errorText = [stderrBuffer.trim(), stdoutBuffer.trim()].filter(Boolean).join('\n')
      reject(new Error(errorText || `7z 进程退出失败，退出码：${String(code ?? 'unknown')}`))
    })
  })
}

async function resolveArchiveOutputPath(outputPath: string) {
  const candidatePaths = [outputPath, `${outputPath}.001`]
  for (const candidatePath of candidatePaths) {
    if (await fs.pathExists(candidatePath)) {
      return candidatePath
    }
  }

  throw new Error('压缩完成后未找到归档包')
}

async function pathExistsPhysical(targetPath: string) {
  if (!targetPath) {
    return false
  }

  try {
    await originalFs.promises.access(targetPath, originalFs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function removePhysicalPath(targetPath: string) {
  if (!targetPath || !await pathExistsPhysical(targetPath)) {
    return
  }

  await originalFs.promises.rm(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  })
}

async function movePhysicalPath(sourcePath: string, targetPath: string) {
  if (!sourcePath || !targetPath || !await pathExistsPhysical(sourcePath)) {
    return
  }

  if (await pathExistsPhysical(targetPath)) {
    throw new Error(`目标路径已存在，无法还原：${targetPath}`)
  }

  try {
    await originalFs.promises.rename(sourcePath, targetPath)
    return
  } catch (error) {
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code ?? '')
      : ''
    if (errorCode !== 'EXDEV') {
      throw error
    }
  }

  await originalFs.promises.cp(sourcePath, targetPath, {
    recursive: true,
    errorOnExist: true,
    force: false
  })
  await removePhysicalPath(sourcePath)
}

async function calculateDirectorySize(targetPath: string): Promise<number | null> {
  if (!targetPath || !await pathExistsPhysical(targetPath)) {
    return null
  }

  const stat = await originalFs.promises.stat(targetPath)
  if (!stat.isDirectory()) {
    return stat.size
  }

  const entries = await originalFs.promises.readdir(targetPath)
  let totalSize = 0
  for (const entry of entries) {
    const childPath = path.join(targetPath, entry)
    totalSize += Number(await calculateDirectorySize(childPath) ?? 0)
  }

  return totalSize
}

async function calculateArchiveOutputSize(outputPath: string): Promise<number | null> {
  if (!outputPath || !await fs.pathExists(outputPath)) {
    return null
  }

  const stat = await fs.stat(outputPath)
  if (!stat.isFile()) {
    return null
  }

  if (!outputPath.endsWith('.001')) {
    return stat.size
  }

  const directoryPath = path.dirname(outputPath)
  const prefix = path.basename(outputPath).replace(/\.001$/i, '')
  const entries = await fs.readdir(directoryPath)
  let totalSize = 0

  for (const entry of entries) {
    if (!entry.startsWith(prefix)) {
      continue
    }
    const entryPath = path.join(directoryPath, entry)
    const entryStat = await fs.stat(entryPath)
    if (entryStat.isFile()) {
      totalSize += entryStat.size
    }
  }

  return totalSize || stat.size
}

async function removeArchiveOutputs(outputPath: string) {
  if (!outputPath) {
    return
  }

  if (await fs.pathExists(outputPath)) {
    const stat = await fs.stat(outputPath)
    if (stat.isFile()) {
      await fs.remove(outputPath)
    }
  }

  if (!outputPath.endsWith('.001')) {
    return
  }

  const directoryPath = path.dirname(outputPath)
  const prefix = path.basename(outputPath).replace(/\.001$/i, '')
  const entries = await fs.readdir(directoryPath)
  await Promise.all(entries
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => fs.remove(path.join(directoryPath, entry))))
}

function resolveResourceDeletionDirectory(basePath: string, fileName?: string | null) {
  const normalizedPath = path.normalize(String(basePath ?? '').trim())
  if (!normalizedPath) {
    return ''
  }

  const normalizedFileName = String(fileName ?? '').trim()
  if (normalizedFileName) {
    return path.join(normalizedPath, normalizedFileName)
  }

  return normalizedPath
}

function resolveArchiveSourceMode(categoryInfo: any): ArchiveSourceMode {
  const archiveEnabled = categoryInfo?.meta?.extra?.archiveEnabled
  const archiveMode = String(categoryInfo?.meta?.extra?.archiveMode ?? '').trim()

  if (archiveEnabled === false) {
    return 'none'
  }

  if (archiveMode === 'file' || archiveMode === 'directory' || archiveMode === 'none') {
    return archiveMode
  }

  return 'none'
}

function resolveArchiveSourcePath(categoryInfo: any, basePath: string, fileName?: string | null) {
  const mode = resolveArchiveSourceMode(categoryInfo)
  if (mode === 'none') {
    return ''
  }

  if (mode === 'directory') {
    return path.normalize(String(basePath ?? '').trim())
  }

  return resolveResourceDeletionDirectory(basePath, fileName)
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
