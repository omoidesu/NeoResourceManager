import {DatabaseService} from './database.service'
import {ResourceForm, ResourceMeta} from "../model/models";
import {generateId} from "../util/id-generator"
import {DictType, ResourceLaunchMode, Settings} from '../../common/constants'
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

const fs = require('fs-extra')
const hidefile = require('hidefile')

export class ResourceService {
  static readonly logger = createLogger('ResourceService')
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
          language: '',
          lastReadPage: 0,
          nameEn: '',
          nameJp: String(fetchedData?.name ?? ''),
          nameZh: '',
          nickname: '',
          pixivId: '',
          resolution: '',
          format: '',
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
          language: '',
          lastReadPage: 0,
          nameEn: '',
          nameJp: String(fetchedData?.name ?? ''),
          nameZh: '',
          nickname: '',
          pixivId: '',
          resolution: '',
          format: '',
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

  /**
   * 保存资源
   * - 将封面图转换为webp格式并保存在cache/thumbnails目录下
   * - 在资源目录下创建一个名为.nrm的隐藏文件，追加写入当前资源id
   * -
   * @param resourceForm 前端传入的表单数据
   */
  static async saveResource(resourceForm: ResourceForm) {
    try {
      const pathDealResult = await dealPath(resourceForm.basePath)

      // 获取分类信息
      const categoryInfo = await DatabaseService.getCategoryById(resourceForm.categoryId)
      const normalizedMeta = await normalizeResourceMeta(resourceForm.meta, categoryInfo, pathDealResult)
      // 资源id
      const resourceId = generateId()
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

      // 作者与关联表 author authorRef
      let author = {
        id: generateId(),
        name: resourceForm.author,
      }
      let authorRef: any = null
      let dbAuthor: any = null
      // 作者
      if (resourceForm.author) {
        dbAuthor = await DatabaseService.getAuthor(resourceForm.author)
        if (dbAuthor) {
          authorRef = {
            authorId: dbAuthor.id,
            resourceId: resourceId,
            categoryId: resourceForm.categoryId
          }
        } else {
          authorRef = {
            authorId: author.id,
            resourceId: resourceId,
            categoryId: resourceForm.categoryId
          }
        }
      }

      // 标签与关联表 newTags tagRefs
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

      const storeWorks = buildStoreWorkPayloads(resourceId, resourceForm, categoryInfo)

      let returnMsg = {
        type: 'success',
        message: '保存成功',
      }

      db.transaction((tx) => {
        // 插入数据库
        DatabaseService.insertResource(resource, tx)
        if (authorRef) {
          if (!dbAuthor) DatabaseService.insertAuthor(author, tx)
          DatabaseService.insertAuthorRef(authorRef, tx)
        }
        DatabaseService.insertTags(newTags, tx)
        DatabaseService.insertTypes(newTypes, tx)
        DatabaseService.insertTagRefs(tagRefs, tx)
        DatabaseService.insertTypeRefs(typeRefs, tx)
        if (storeWorks.length) {
          storeWorks.forEach((storeWork) => {
            DatabaseService.insertStoreWork(storeWork, tx)
          })
        }
        syncMeta(tx, categoryInfo, resourceId, normalizedMeta.meta)
      })

      const markerCreated = await writeResourceMarker({
        resourceId,
        basePath: resource.basePath,
        fileName: resource.fileName ?? null,
        markerEnabled: shouldCreateResourceMarker(categoryInfo, pathDealResult, normalizedMeta.meta)
      })
      if (!markerCreated) {
        returnMsg = {
          type: 'warning',
          message: '保存成功，但无法创建校验文件，部分功能将不可用'
        }
      }

      // 将新资源添加到资源目录的监听器
      ResourceWatcher.getInstance().trackResource({
        id: resourceId,
        categoryId: resourceForm.categoryId,
        basePath: resource.basePath,
        fileName: resource.fileName ?? null,
        missingStatus: false,
      })

      return returnMsg
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
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

    return {
      type: 'success',
      message: completed ? '已标记为通关' : '已取消通关标记',
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

  static async updateResource(resourceId: string, resourceForm: ResourceForm) {
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
      const pathDealResult = await dealPath(resourceForm.basePath)
      const categoryInfo = await DatabaseService.getCategoryById(resourceForm.categoryId)
      const normalizedMeta = await normalizeResourceMeta(resourceForm.meta, categoryInfo, pathDealResult)
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
      }

      const authorPayload = await buildAuthorPayload(normalizedResourceId, resourceForm)
      const tagPayload = await buildTagPayload(normalizedResourceId, resourceForm)
      const typePayload = await buildTypePayload(normalizedResourceId, resourceForm)
      const storeWorks = buildStoreWorkPayloads(normalizedResourceId, resourceForm, categoryInfo)

      db.transaction((tx) => {
        DatabaseService.updateResource(resourceData, tx)
        DatabaseService.deleteAuthorRefsByResourceId(normalizedResourceId, tx)
        DatabaseService.deleteTagRefsByResourceId(normalizedResourceId, tx)
        DatabaseService.deleteTypeRefsByResourceId(normalizedResourceId, tx)
        DatabaseService.deleteStoreWorkByResourceId(normalizedResourceId, tx)

        if (authorPayload.authorRef) {
          if (!authorPayload.existingAuthor && authorPayload.author) {
            DatabaseService.insertAuthor(authorPayload.author, tx)
          }
          DatabaseService.insertAuthorRef(authorPayload.authorRef, tx)
        }

        DatabaseService.insertTags(tagPayload.newTags, tx)
        DatabaseService.insertTypes(typePayload.newTypes, tx)
        DatabaseService.insertTagRefs(tagPayload.tagRefs, tx)
        DatabaseService.insertTypeRefs(typePayload.typeRefs, tx)

        if (storeWorks.length) {
          storeWorks.forEach((storeWork) => {
            DatabaseService.insertStoreWork(storeWork, tx)
          })
        }

        syncMeta(tx, categoryInfo, normalizedResourceId, normalizedMeta.meta)
      })

      await syncResourceMarker(existingResource, {
        id: normalizedResourceId,
        basePath: resourceData.basePath,
        fileName: resourceData.fileName,
        markerEnabled: shouldCreateResourceMarker(categoryInfo, pathDealResult, normalizedMeta.meta)
      })

      await ResourceWatcher.getInstance().untrackResource(normalizedResourceId)
      ResourceWatcher.getInstance().trackResource({
        id: normalizedResourceId,
        categoryId: resourceForm.categoryId,
        basePath: resourceData.basePath,
        fileName: resourceData.fileName ?? null,
        missingStatus: false,
      })

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
}

function hasUsefulFetchedData(data: Partial<{
  name: string
  author: string
  cover: string
  tag: string[]
  type: string[]
}> | null | undefined) {
  if (!data) {
    return false
  }

  return Boolean(
    String(data.name ?? '').trim()
    || String(data.author ?? '').trim()
    || String(data.cover ?? '').trim()
    || (Array.isArray(data.tag) && data.tag.length)
    || (Array.isArray(data.type) && data.type.length)
  )
}

type ResourcePathInfo = {
  basePath: string
  fileName: string | null
}

function getGameSearchRoot(basePath: string) {
  return path.extname(basePath) ? path.dirname(basePath) : basePath
}

function getWebsiteLabelByGameId(gameId: string) {
  if (/^RJ\d{6}(?:\d{2})?$/i.test(gameId) || /^VJ\d{6}(?:\d{2})?$/i.test(gameId)) {
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

async function buildAuthorPayload(resourceId: string, resourceForm: ResourceForm) {
  let author = {
    id: generateId(),
    name: resourceForm.author,
  }
  let authorRef: any = null
  let existingAuthor: any = null

  if (resourceForm.author) {
    existingAuthor = await DatabaseService.getAuthor(resourceForm.author)
    authorRef = {
      authorId: existingAuthor?.id ?? author.id,
      resourceId,
      categoryId: resourceForm.categoryId
    }
  }

  return {
    author,
    authorRef,
    existingAuthor,
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
async function dealCover(coverPath: string, resourceId: string): Promise<string> {
  if (!coverPath) return ''

  const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)

  if (!cacheSetting) {
    throw new Error('未配置缓存目录')
  }

  const cachePath = path.join(cacheSetting.value, 'thumbnails')

  await fs.ensureDir(cachePath)

  const targetPath = path.join(cachePath, `${resourceId}.webp`)
  const normalizedTargetPath = path.normalize(path.resolve(targetPath))

  const normalizedCoverPath = normalizeRemoteCoverPath(coverPath)
  if (!isRemoteCoverPath(normalizedCoverPath)) {
    const normalizedInputPath = path.normalize(path.resolve(normalizedCoverPath))
    if (normalizedInputPath.toLowerCase() === normalizedTargetPath.toLowerCase()) {
      return targetPath
    }
  }

  if (isRemoteCoverPath(normalizedCoverPath)) {
    const response = await axios.get<ArrayBuffer>(normalizedCoverPath, {
      responseType: 'arraybuffer',
      timeout: 20000,
      ...(await getAxiosProxyConfig()),
    })

    await sharp(Buffer.from(response.data))
      .resize({width: 560, fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}})
      .webp()
      .toFile(targetPath)

    return targetPath
  }

  const exists = await fs.pathExists(normalizedCoverPath)
  if (!exists) {
    throw new Error('封面图片不存在')
  }

  await sharp(normalizedCoverPath)
    .resize({width: 560, fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}})
    .webp()
    .toFile(targetPath)

  return targetPath
}

async function resolveResourceCoverPath(
  coverPath: string,
  resourceId: string,
  categoryInfo: any,
  pathInfo: ResourcePathInfo
) {
  if (getExtendTableName(categoryInfo) === 'single_image_meta') {
    return getResolvedFilePath(pathInfo)
  }

  if (getExtendTableName(categoryInfo) === 'multi_image_meta') {
    const resolvedDirectoryPath = String(pathInfo?.basePath ?? '').trim()
    if (resolvedDirectoryPath) {
      const imagePaths = await getDirectoryImageFiles(resolvedDirectoryPath)
      const autoCoverPath = pickMultiImageCoverPath(resolvedDirectoryPath, imagePaths)
      if (autoCoverPath) {
        return dealCover(autoCoverPath, resourceId)
      }
    }
  }

  return dealCover(coverPath, resourceId)
}

async function normalizeResourceMeta(
  meta: ResourceMeta,
  categoryInfo: any,
  pathInfo: ResourcePathInfo
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

  return {
    meta: normalizedMeta,
    resourceSize,
  }
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

async function getDirectoryImageFiles(directoryPath: string) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

  return entries
    .filter((entry: any) => entry?.isFile?.())
    .map((entry: any) => path.join(directoryPath, entry.name))
    .filter((filePath: string) => imageExtensions.has(path.extname(filePath).toLowerCase()))
    .sort((left: string, right: string) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
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

async function getAxiosProxyConfig() {
  const enableProxySetting = await DatabaseService.getSetting(Settings.ENABLE_PROXY)
  const isEnabled = ['1', 'true', 'yes', 'on'].includes(String(enableProxySetting?.value ?? '').trim().toLowerCase())

  if (!isEnabled) {
    return {}
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
      }, tx)
      return
    case 'asmr_meta':
      DatabaseService.upsertAsmrMeta({
        resourceId,
        language: meta.language || null,
      }, tx)
      return
    case 'novel_meta':
      DatabaseService.upsertNovelMeta({
        resourceId,
      }, tx)
      return
    case 'website_meta':
      DatabaseService.upsertWebsiteMeta({
        resourceId,
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
