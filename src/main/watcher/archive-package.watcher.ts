import chokidar, { type FSWatcher } from 'chokidar'
import { DatabaseService } from '../service/database.service'
import { NotificationQueueService } from '../service/notification-queue.service'
import { createLogger } from '../util/logger'
import path from 'path'
import fs from 'fs'

type WatchableArchivePackage = {
  id: string
  archivePath: string
  missingStatus: boolean | null
}

const logger = createLogger('archive-package-watcher')
const ARCHIVE_PACKAGE_RECONCILE_INTERVAL_MS = 5000

export class ArchivePackageWatcher {
  private watcher: FSWatcher | null = null
  private watchedPaths = new Set<string>()
  private packagesById = new Map<string, WatchableArchivePackage>()
  private packageIdByWatchPath = new Map<string, string>()
  private initialScanTimer: NodeJS.Timeout | null = null
  private reconcileTimer: NodeJS.Timeout | null = null
  private lifecycleVersion = 0

  private static instance: ArchivePackageWatcher | null = null

  private constructor() {}

  public static getInstance() {
    ArchivePackageWatcher.instance ??= new ArchivePackageWatcher()
    return ArchivePackageWatcher.instance
  }

  public static isTargetPathMissing(targetPath: string) {
    const normalizedPath = normalizeArchivePath(targetPath)
    if (!normalizedPath) {
      return true
    }

    return !fs.existsSync(normalizedPath)
  }

  async start() {
    if (this.watcher) {
      logArchiveWatcher('start skipped: watcher already started')
      return
    }

    this.lifecycleVersion += 1

    const packages = await DatabaseService.getArchiveWatcherPackages()
    const watchPaths: string[] = []

    for (const archivePackage of packages) {
      const normalizedPackage = normalizeArchivePackage(archivePackage)
      const watchPath = normalizedPackage.archivePath
      this.storeArchivePackage(normalizedPackage)
      if (!watchPath) {
        continue
      }
      watchPaths.push(watchPath)
      this.watchedPaths.add(watchPath)
    }

    logArchiveWatcher('starting watcher', {
      packageCount: packages.length,
      watchPathCount: watchPaths.length,
      watchPathSample: watchPaths.slice(0, 5),
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
        logArchiveWatcher('fs event: add', { path: newPath })
        void this.handleAdd(newPath)
      })
      .on('unlink', (oldPath) => {
        logArchiveWatcher('fs event: unlink', { path: oldPath })
        void this.handleUnlink(oldPath)
      })
      .on('error', (error) => {
        logger.error('watcher error', error)
      })

    this.scheduleInitialScan()
    this.schedulePeriodicReconcile()
  }

  public trackArchivePackage(archivePackage: WatchableArchivePackage) {
    const normalizedPackage = normalizeArchivePackage(archivePackage)
    const watchPath = normalizedPackage.archivePath
    this.storeArchivePackage(normalizedPackage)

    logArchiveWatcher('track archive package', {
      archiveId: normalizedPackage.id,
      watchPath,
      missingStatus: normalizedPackage.missingStatus,
    })

    if (!watchPath || !this.watcher || this.watchedPaths.has(watchPath)) {
      return
    }

    this.watcher.add(watchPath)
    this.watchedPaths.add(watchPath)
    logArchiveWatcher('watch path added', {
      archiveId: normalizedPackage.id,
      watchPath,
    })
  }

  public async untrackArchivePackage(archiveId: string) {
    const normalizedArchiveId = String(archiveId ?? '').trim()
    const archivePackage = this.packagesById.get(normalizedArchiveId)
    if (!archivePackage) {
      return
    }

    const watchPath = archivePackage.archivePath
    this.packagesById.delete(normalizedArchiveId)
    if (watchPath) {
      this.packageIdByWatchPath.delete(watchPath)
    }

    if (this.watcher && watchPath && this.watchedPaths.has(watchPath)) {
      await this.watcher.unwatch(watchPath)
      this.watchedPaths.delete(watchPath)
      logArchiveWatcher('watch path removed by untrack', {
        archiveId: normalizedArchiveId,
        watchPath,
      })
    }
  }

  public async stop() {
    this.clearInitialScanTimer()
    this.clearPeriodicReconcileTimer()
    this.lifecycleVersion += 1

    if (!this.watcher) {
      this.watchedPaths.clear()
      this.packagesById.clear()
      this.packageIdByWatchPath.clear()
      return
    }

    const watcher = this.watcher
    this.watcher = null
    await watcher.close()

    this.watchedPaths.clear()
    this.packagesById.clear()
    this.packageIdByWatchPath.clear()
  }

  private async handleAdd(addedPath: string) {
    const normalizedPath = normalizeArchivePath(addedPath)
    const archiveId = this.packageIdByWatchPath.get(normalizedPath)
    if (!archiveId) {
      return
    }

    await this.persistMissingStatus(archiveId, false)
  }

  private async handleUnlink(removedPath: string) {
    const normalizedPath = normalizeArchivePath(removedPath)
    const archiveId = this.packageIdByWatchPath.get(normalizedPath)
    if (!archiveId) {
      return
    }

    await this.persistMissingStatus(archiveId, true)
  }

  private storeArchivePackage(archivePackage: WatchableArchivePackage) {
    this.packagesById.set(archivePackage.id, archivePackage)
    if (archivePackage.archivePath) {
      this.packageIdByWatchPath.set(archivePackage.archivePath, archivePackage.id)
    }
  }

  private async persistMissingStatus(archiveId: string, missingStatus: boolean) {
    const archivePackage = this.packagesById.get(archiveId)
    if (!archivePackage || Boolean(archivePackage.missingStatus) === missingStatus) {
      return
    }

    this.packagesById.set(archiveId, {
      ...archivePackage,
      missingStatus,
    })

    await DatabaseService.updateArchivePackageMissingStatus(archiveId, missingStatus)
    NotificationQueueService.getInstance().pushArchivePackageStateChanged({
      archiveId,
      archivePath: archivePackage.archivePath,
      missingStatus,
      changedAt: Date.now(),
    })

    logArchiveWatcher('archive package missing status updated', {
      archiveId,
      archivePath: archivePackage.archivePath,
      missingStatus,
    })
  }

  private scheduleInitialScan() {
    this.clearInitialScanTimer()
    const lifecycleVersion = this.lifecycleVersion
    this.initialScanTimer = setTimeout(() => {
      this.initialScanTimer = null
      void this.runInitialScan(lifecycleVersion)
        .catch((error) => {
          logger.error('initial archive scan failed', error)
        })
    }, 800)
  }

  private schedulePeriodicReconcile() {
    this.clearPeriodicReconcileTimer()
    const lifecycleVersion = this.lifecycleVersion
    this.reconcileTimer = setInterval(() => {
      if (lifecycleVersion !== this.lifecycleVersion || !this.watcher) {
        return
      }

      void this.runReconcileScan(lifecycleVersion).catch((error) => {
        logger.error('periodic archive reconcile failed', error)
      })
    }, ARCHIVE_PACKAGE_RECONCILE_INTERVAL_MS)
  }

  private clearInitialScanTimer() {
    if (this.initialScanTimer) {
      clearTimeout(this.initialScanTimer)
      this.initialScanTimer = null
    }
  }

  private clearPeriodicReconcileTimer() {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer)
      this.reconcileTimer = null
    }
  }

  private async runInitialScan(lifecycleVersion: number) {
    const packages = Array.from(this.packagesById.values())
    let scannedCount = 0
    let missingCount = 0

    for (const archivePackage of packages) {
      if (lifecycleVersion !== this.lifecycleVersion || !this.watcher) {
        return
      }

      scannedCount += 1
      const missingStatus = ArchivePackageWatcher.isTargetPathMissing(archivePackage.archivePath)
      if (missingStatus) {
        missingCount += 1
      }
      await this.persistMissingStatus(archivePackage.id, missingStatus)
    }

    logArchiveWatcher('initial archive scan finished', {
      scannedCount,
      missingCount,
      lifecycleVersion,
    })
  }

  private async runReconcileScan(lifecycleVersion: number) {
    const packages = Array.from(this.packagesById.values())
    let correctedCount = 0

    for (const archivePackage of packages) {
      if (lifecycleVersion !== this.lifecycleVersion || !this.watcher) {
        return
      }

      const missingStatus = ArchivePackageWatcher.isTargetPathMissing(archivePackage.archivePath)
      if (Boolean(archivePackage.missingStatus) !== missingStatus) {
        correctedCount += 1
      }
      await this.persistMissingStatus(archivePackage.id, missingStatus)
    }

    if (correctedCount > 0) {
      logArchiveWatcher('periodic archive reconcile corrected states', {
        correctedCount,
        lifecycleVersion,
      })
    }
  }
}

function normalizeArchivePackage(archivePackage: WatchableArchivePackage): WatchableArchivePackage {
  return {
    id: String(archivePackage.id ?? '').trim(),
    archivePath: normalizeArchivePath(archivePackage.archivePath),
    missingStatus: Boolean(archivePackage.missingStatus),
  }
}

function normalizeArchivePath(targetPath: string) {
  return path.normalize(String(targetPath ?? '').trim())
}

function logArchiveWatcher(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    logger.debug(message, payload)
    return
  }

  logger.debug(message)
}
