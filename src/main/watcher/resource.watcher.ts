import chokidar, { type FSWatcher } from 'chokidar'
import { Settings } from '../../common/constants'
import { DatabaseService } from '../service/database.service'
import { NotificationQueueService } from '../service/notification-queue.service'
import { EverythingService, type EverythingClientInfo } from '../service/everything.service'
import { createFileFingerprint, readResourceMarkerPayload } from '../util/resource-marker'
import { createLogger } from '../util/logger'
import path from 'path'
import fs from 'fs'

type WatchableResource = {
  id: string
  categoryId: string
  basePath: string
  fileName: string | null
  missingStatus: boolean | null
}

const logger = createLogger('resource-watcher')

export class ResourceWatcher {
  private watcher: FSWatcher | null = null
  private watchedPaths = new Set<string>()
  private resourcesById = new Map<string, WatchableResource>()
  private resourceIdByWatchPath = new Map<string, string>()
  private pendingRelocations = new Map<string, Promise<void>>()
  private everythingClient: EverythingClientInfo

  private static instance: ResourceWatcher | null = null

  private constructor() {
    this.everythingClient = {
      available: false,
      mode: '',
      cliPath: '',
      baseUrl: '',
      username: '',
      password: '',
    }
  }

  public static getInstance(): ResourceWatcher {
    ResourceWatcher.instance ??= new ResourceWatcher();

    return ResourceWatcher.instance
  }

  /**
   * 启动资源监听器。
   * - 读取数据库中的所有资源路径并建立监听
   * - 为已丢失的资源补上 missingStatus
   * - 对已丢失资源异步触发重定位搜索
   */
  async start() {
    if (this.watcher) {
      logWatcher('start skipped: watcher already started')
      return
    }

    const everythingEnabled = await this.isEverythingEnabled()

    if (process.platform === 'win32') {
      this.everythingClient = await EverythingService.detectClient()

      if (!this.everythingClient.available && everythingEnabled) {
        NotificationQueueService.getInstance().enqueue(
          'warning',
          'Everything 未检测到',
          '未检测到可用的 Everything HTTP 或 CLI，资源失效后将无法自动重定位。'
        )
        logWatcher('everything not found, auto relocation disabled')
      } else if (!this.everythingClient.available) {
        logWatcher('everything unavailable but disabled in settings, skip notification')
      } else {
        logWatcher('everything detected', {
          mode: this.everythingClient.mode,
          cliPath: this.everythingClient.cliPath,
          baseUrl: this.everythingClient.baseUrl,
        })
      }
    } else {
      this.everythingClient = {
        available: false,
        mode: '',
        cliPath: '',
        baseUrl: '',
        username: '',
        password: '',
      }
      logWatcher('non-windows platform, skip everything detection', {
        platform: process.platform,
      })
    }

    await DatabaseService.setSettingLocked(Settings.USE_EVERYTHING_HTTP, false)
    await DatabaseService.setSettingLocked(Settings.USE_EVERYTHING_CLI, false)
    logWatcher('sync everything setting lock', {
      httpLocked: false,
      cliLocked: false,
      everythingAvailable: this.everythingClient.available,
      mode: this.everythingClient.mode,
    })

    const resources = await DatabaseService.getWatcherResources()
    const watchPaths: string[] = []

    for (const resource of resources) {
      const normalizedResource = normalizeResource(resource)
      const watchPath = resolveWatchPath(normalizedResource)
      this.storeResource(normalizedResource)
      watchPaths.push(watchPath)
      this.watchedPaths.add(watchPath)
      logWatcher('register existing resource', {
        resourceId: normalizedResource.id,
        watchPath,
        basePath: normalizedResource.basePath,
        fileName: normalizedResource.fileName,
      })
    }

    logWatcher('starting watcher', {
      resourceCount: resources.length,
      watchPaths,
    })

    const watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1200,
        pollInterval: 150,
      },
      ignorePermissionErrors: true,
      usePolling: true,
      interval: 1000,
    })

    this.watcher = watcher

    watcher
      .on('add', (newPath) => {
        logWatcher('fs event: add', { path: newPath })
        void this.handleAdd(newPath)
      })
      .on('addDir', (newPath) => {
        logWatcher('fs event: addDir', { path: newPath })
        void this.handleAdd(newPath)
      })
      .on('unlink', (oldPath) => {
        logWatcher('fs event: unlink', { path: oldPath })
        void this.handleUnlink(oldPath)
      })
      .on('unlinkDir', (oldPath) => {
        logWatcher('fs event: unlinkDir', { path: oldPath })
        void this.handleUnlink(oldPath)
      })
      .on('error', (error) => {
        logger.error('watcher error', error)
      })

    for (const resource of this.resourcesById.values()) {
      const watchPath = resolveWatchPath(resource)
      if (!fs.existsSync(watchPath)) {
        logWatcher('missing on startup', {
          resourceId: resource.id,
          watchPath,
        })
        await this.markMissing(resource.id)
        void this.scheduleRelocation(resource.id)
      }
    }
  }

  /**
   * 为新保存的资源追加监听。
   * 这个方法会在资源创建成功后调用，避免必须重启应用才能被 watcher 感知。
   */
  public trackResource(resource: WatchableResource) {
    const normalizedResource = normalizeResource(resource)
    const watchPath = resolveWatchPath(normalizedResource)
    this.storeResource(normalizedResource)

    logWatcher('track resource', {
      resourceId: normalizedResource.id,
      watchPath,
      basePath: normalizedResource.basePath,
      fileName: normalizedResource.fileName,
    })

    if (!this.watcher || this.watchedPaths.has(watchPath)) {
      logWatcher('track skipped', {
        resourceId: normalizedResource.id,
        watcherStarted: Boolean(this.watcher),
        alreadyWatched: this.watchedPaths.has(watchPath),
      })
      return
    }

    this.watcher.add(watchPath)
    this.watchedPaths.add(watchPath)
    logWatcher('watch path added', {
      resourceId: normalizedResource.id,
      watchPath,
    })
  }

  public async untrackResource(resourceId: string) {
    const resource = this.resourcesById.get(resourceId)
    if (!resource) {
      logWatcher('untrack skipped: resource not found', { resourceId })
      return
    }

    const watchPath = resolveWatchPath(resource)
    this.resourcesById.delete(resourceId)
    this.resourceIdByWatchPath.delete(watchPath)
    this.pendingRelocations.delete(resourceId)

    if (this.watcher && this.watchedPaths.has(watchPath)) {
      await this.watcher.unwatch(watchPath)
      this.watchedPaths.delete(watchPath)
      logWatcher('watch path removed by untrack', {
        resourceId,
        watchPath,
      })
    }

    logWatcher('resource untracked', {
      resourceId,
      watchPath,
    })
  }

  public async stop() {
    if (!this.watcher) {
      this.watchedPaths.clear()
      this.resourcesById.clear()
      this.resourceIdByWatchPath.clear()
      this.pendingRelocations.clear()
      return
    }

    logWatcher('stopping watcher', {
      watchedPathCount: this.watchedPaths.size,
      resourceCount: this.resourcesById.size,
      pendingRelocationCount: this.pendingRelocations.size,
    })

    const watcher = this.watcher
    this.watcher = null

    await watcher.close()

    this.watchedPaths.clear()
    this.resourcesById.clear()
    this.resourceIdByWatchPath.clear()
    this.pendingRelocations.clear()

    this.everythingClient = {
      available: false,
      mode: '',
      cliPath: '',
      baseUrl: '',
      username: '',
      password: '',
    }
  }

  /**
   * 处理 add / addDir 事件。
   * 这里只有命中已登记 watchPath 的资源时才会继续处理，
   * 主要用于“资源重新出现但路径未变化”的快速恢复场景。
   */
  private async handleAdd(addedPath: string) {
    const normalizedPath = normalizeFsPath(addedPath)
    const matchedResourceId = this.resourceIdByWatchPath.get(normalizedPath)

    logWatcher('handle add', {
      path: normalizedPath,
      matchedResourceId: matchedResourceId ?? null,
    })

    if (!matchedResourceId) {
      return
    }

    const resource = this.resourcesById.get(matchedResourceId)
    if (!resource || !resource.missingStatus) {
      logWatcher('handle add skipped', {
        resourceId: matchedResourceId,
        resourceFound: Boolean(resource),
        missingStatus: resource?.missingStatus ?? null,
      })
      return
    }

    logWatcher('resource restored by direct add event', {
      resourceId: resource.id,
      path: normalizedPath,
    })
    await this.persistResource({
      ...resource,
      missingStatus: false,
    })
  }

  /**
   * 处理 unlink / unlinkDir 事件。
   * 收到事件后会先把资源标记为缺失，再异步尝试通过 marker 重新定位。
   */
  private async handleUnlink(removedPath: string) {
    const normalizedPath = normalizeFsPath(removedPath)
    const matchedResourceId = this.resourceIdByWatchPath.get(normalizedPath)

    logWatcher('handle unlink', {
      path: normalizedPath,
      matchedResourceId: matchedResourceId ?? null,
    })

    if (!matchedResourceId) {
      return
    }

    await this.markMissing(matchedResourceId)
    void this.scheduleRelocation(matchedResourceId)
  }

  /**
   * 将资源标记为缺失。
   * 如果资源已经是缺失状态，则直接跳过，避免重复写库。
   */
  private async markMissing(resourceId: string) {
    const resource = this.resourcesById.get(resourceId)
    if (!resource || resource.missingStatus) {
      logWatcher('mark missing skipped', {
        resourceId,
        resourceFound: Boolean(resource),
        missingStatus: resource?.missingStatus ?? null,
      })
      return
    }

    logWatcher('mark missing', {
      resourceId,
      watchPath: resolveWatchPath(resource),
    })
    await this.persistResource({
      ...resource,
      missingStatus: true,
    })

    NotificationQueueService.getInstance().enqueue(
      'warning',
      '检测到资源失效',
      `资源“${resource.fileName || path.basename(resource.basePath)}”已失效，正在尝试重新定位。`
    )
  }

  /**
   * 为资源安排一次重定位任务。
   * 同一资源同一时间只允许存在一个重定位任务，避免重复扫描。
   */
  private scheduleRelocation(resourceId: string) {
    if (this.pendingRelocations.has(resourceId)) {
      logWatcher('relocation already pending', { resourceId })
      return this.pendingRelocations.get(resourceId)
    }

    logWatcher('schedule relocation', { resourceId })
    const task = this.relocateResource(resourceId)
      .catch((error) => {
        logger.error(`relocate failed for ${resourceId}`, error)
      })
      .finally(() => {
        this.pendingRelocations.delete(resourceId)
      })

    this.pendingRelocations.set(resourceId, task)
    return task
  }

  /**
   * 执行资源重定位。
   * - 仅在 Everything 可用时尝试通过 marker 自动重定位
   * - Everything 不可用或查询失败时，只提示用户，不再执行本地扫盘
   */
  private async relocateResource(resourceId: string) {
    logWatcher('relocation waiting before scan', { resourceId, delayMs: 1500 })
    await delay(1500)

    const resource = this.resourcesById.get(resourceId)
    if (!resource || !resource.missingStatus) {
      logWatcher('relocation skipped after delay', {
        resourceId,
        resourceFound: Boolean(resource),
        missingStatus: resource?.missingStatus ?? null,
      })
      return
    }

    if (!this.everythingClient.available) {
      if (!await this.isEverythingEnabled()) {
        logWatcher('relocation skipped: everything disabled in settings', {
          resourceId,
          fileName: resource.fileName,
        })
        return
      }

      NotificationQueueService.getInstance().enqueue(
        'warning',
        '无法自动重定位',
        `资源“${resource.fileName || path.basename(resource.basePath)}”已失效，当前未检测到可用的 Everything。`
      )
      logWatcher('relocation skipped: everything unavailable', {
        resourceId,
        fileName: resource.fileName,
      })
      return
    }

    logWatcher('relocation using everything', {
      resourceId,
      fileName: resource.fileName,
    })
    const relocatedBasePath = await this.findResourceWithEverything(resourceId, resource.fileName, resource.basePath)

    if (!relocatedBasePath) {
      NotificationQueueService.getInstance().enqueue(
        'warning',
        '无法自动重定位',
        `资源“${resource.fileName || path.basename(resource.basePath)}”失效后未找到新位置，请手动处理。`
      )
      logWatcher('relocation target not found', {
        resourceId,
        fileName: resource.fileName,
      })
      return
    }

    logWatcher('relocation target found', {
      resourceId,
      newBasePath: relocatedBasePath,
    })
    await this.persistResource({
      ...resource,
      basePath: relocatedBasePath,
      missingStatus: false,
    })
  }

  /**
   * 使用 Everything 搜索 marker 文件。
   * 如果 Everything 调用失败，只提示用户，不再回退到本地扫盘。
   */
  private async findResourceWithEverything(resourceId: string, fileName: string | null, basePath: string) {
    try {
      const markerPaths = await EverythingService.searchMarkerPaths(this.everythingClient, resourceId)

      logWatcher('everything search result', {
        resourceId,
        markerCount: markerPaths.length,
        markerPaths,
      })

      for (const markerPath of markerPaths) {
        const basePath = path.dirname(path.dirname(markerPath))
        if (await validateMarkerCandidate(markerPath, resourceId, fileName, basePath)) {
          return basePath
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (this.everythingClient.mode === 'http') {
        const previousBaseUrl = this.everythingClient.baseUrl
        const cliClient = EverythingService.detectCliClient()
        if (cliClient.available) {
          this.everythingClient = cliClient
          logWatcher('everything http failed, switched to cli', {
            resourceId,
            previousBaseUrl,
            cliPath: cliClient.cliPath,
            error: message,
          })

          try {
            const cliMarkerPaths = await EverythingService.searchMarkerPaths(this.everythingClient, resourceId)
            for (const markerPath of cliMarkerPaths) {
              const basePath = path.dirname(path.dirname(markerPath))
              if (await validateMarkerCandidate(markerPath, resourceId, fileName, basePath)) {
                return basePath
              }
            }
          } catch (cliError) {
            const cliMessage = cliError instanceof Error ? cliError.message : String(cliError)
            logWatcher('everything cli search failed after http fallback', {
              resourceId,
              cliPath: cliClient.cliPath,
              error: cliMessage,
            })
          }
        }
      }

      NotificationQueueService.getInstance().enqueue(
        'warning',
        'Everything 查询失败',
        `资源“${fileName || path.basename(basePath)}”失效后，Everything 查询失败，无法自动重定位。`
      )
      logWatcher('everything search failed', {
        resourceId,
        error: message,
      })
    }

    return ''
  }

  /**
   * 将资源状态持久化到数据库，并同步更新内存缓存与 chokidar 的监听路径。
   */
  private async persistResource(nextResource: WatchableResource) {
    const normalizedResource = normalizeResource(nextResource)
    const previousResource = this.resourcesById.get(normalizedResource.id) ?? null
    const previousWatchPath = previousResource ? resolveWatchPath(previousResource) : ''
    const nextWatchPath = resolveWatchPath(normalizedResource)

    logWatcher('persist resource', {
      resourceId: normalizedResource.id,
      previousWatchPath: previousWatchPath || null,
      nextWatchPath,
      basePath: normalizedResource.basePath,
      fileName: normalizedResource.fileName,
      missingStatus: normalizedResource.missingStatus,
    })

    await DatabaseService.updateResource({
      id: normalizedResource.id,
      basePath: normalizedResource.basePath,
      fileName: normalizedResource.fileName,
      missingStatus: normalizedResource.missingStatus ?? false,
    })

    this.storeResource(normalizedResource)

    NotificationQueueService.getInstance().pushResourceStateChanged({
      resourceId: normalizedResource.id,
      categoryId: normalizedResource.categoryId,
      running: false,
      missingStatus: normalizedResource.missingStatus ?? false,
      changedAt: Date.now(),
    })

    if (!this.watcher) {
      return
    }

    if (previousWatchPath && previousWatchPath !== nextWatchPath && this.watchedPaths.has(previousWatchPath)) {
      await this.watcher.unwatch(previousWatchPath)
      this.watchedPaths.delete(previousWatchPath)
      this.resourceIdByWatchPath.delete(previousWatchPath)
      logWatcher('watch path removed', {
        resourceId: normalizedResource.id,
        watchPath: previousWatchPath,
      })
    }

    if (!this.watchedPaths.has(nextWatchPath)) {
      this.watcher.add(nextWatchPath)
      this.watchedPaths.add(nextWatchPath)
      logWatcher('watch path added after persist', {
        resourceId: normalizedResource.id,
        watchPath: nextWatchPath,
      })
    }
  }

  /**
   * 更新内存中的资源索引。
   * 这份索引用于把文件系统事件快速映射到具体 resourceId。
   */
  private storeResource(resource: WatchableResource) {
    const normalizedResource = normalizeResource(resource)
    const previousResource = this.resourcesById.get(normalizedResource.id)

    if (previousResource) {
      this.resourceIdByWatchPath.delete(resolveWatchPath(previousResource))
    }

    this.resourcesById.set(normalizedResource.id, normalizedResource)
    this.resourceIdByWatchPath.set(resolveWatchPath(normalizedResource), normalizedResource.id)
    logWatcher('resource cache updated', {
      resourceId: normalizedResource.id,
      previousWatchPath: previousResource ? resolveWatchPath(previousResource) : null,
      nextWatchPath: resolveWatchPath(normalizedResource),
      missingStatus: normalizedResource.missingStatus,
    })
  }

  private async isEverythingEnabled() {
    const [httpSetting, cliSetting] = await Promise.all([
      DatabaseService.getSetting(Settings.USE_EVERYTHING_HTTP),
      DatabaseService.getSetting(Settings.USE_EVERYTHING_CLI),
    ])

    const httpEnabled = String(httpSetting?.value ?? Settings.USE_EVERYTHING_HTTP.default) === '1'
    const cliEnabled = String(cliSetting?.value ?? Settings.USE_EVERYTHING_CLI.default) === '1'

    return httpEnabled || cliEnabled
  }
}

function logWatcher(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    logger.debug(message, payload)
    return
  }

  logger.debug(message)
}

/**
 * 统一资源路径对象的格式：
 * - 规范化路径分隔符
 * - 把空字符串 fileName 收敛成 null
 * - 把 missingStatus 收敛成布尔值
 */
function normalizeResource(resource: WatchableResource): WatchableResource {
  return {
    id: resource.id,
    categoryId: resource.categoryId,
    basePath: normalizeFsPath(resource.basePath),
    fileName: normalizeFileName(resource.fileName),
    missingStatus: Boolean(resource.missingStatus),
  }
}

/**
 * 解析资源真正需要监听的路径。
 * 文件资源监听“父目录 + fileName”，目录资源直接监听目录自身。
 */
function resolveWatchPath(resource: Pick<WatchableResource, 'basePath' | 'fileName'>) {
  return normalizeFsPath(
    resource.fileName
      ? path.join(resource.basePath, resource.fileName)
      : resource.basePath
  )
}

/**
 * 规范化文件系统路径，避免因为分隔符或首尾空白导致匹配失败。
 */
function normalizeFsPath(targetPath: string) {
  return path.normalize(String(targetPath ?? '').trim())
}

/**
 * 将 fileName 归一化为 “字符串或 null”。
 */
function normalizeFileName(fileName: string | null) {
  const normalized = String(fileName ?? '').trim()
  return normalized || null
}


/**
 * 校验 marker 文件是否确实对应当前资源。
 * - marker 内容中的 resourceId 必须匹配
 * - 如果资源是文件资源，还要求目标文件存在
 * - 如果 marker 内含指纹，则进一步校验指纹
 */
async function validateMarkerCandidate(
  markerPath: string,
  resourceId: string,
  fileName: string | null,
  basePath: string
) {
  const markerPayload = await readResourceMarkerPayload(markerPath)
  if (!markerPayload || markerPayload.resourceId !== resourceId) {
    logWatcher('marker payload validation failed', {
      resourceId,
      markerPath,
      payloadResourceId: markerPayload?.resourceId ?? null,
    })
    return false
  }

  logWatcher('marker matched resource id', {
    resourceId,
    markerPath,
    currentPath: basePath,
    fileName,
  })

  if (!fileName) {
    return true
  }

  const markerFileEntry = markerPayload.files.find((entry) => entry.name === fileName) ?? null
  const targetFilePath = path.join(basePath, fileName)

  if (!fs.existsSync(targetFilePath)) {
    logWatcher('marker matched but target file missing', {
      resourceId,
      expectedFilePath: targetFilePath,
    })
    return false
  }

  if (!markerFileEntry?.fingerprint) {
    return true
  }

  const targetFingerprint = await createFileFingerprint(targetFilePath)
  const matched = targetFingerprint === markerFileEntry.fingerprint

  logWatcher('marker fingerprint validation', {
    resourceId,
    fileName,
    matched,
  })

  return matched
}

/**
 * 简单延迟工具，用于等待移动操作落盘稳定后再做重定位搜索。
 */
function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
