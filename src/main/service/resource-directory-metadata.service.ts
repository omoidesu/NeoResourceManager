import path from 'path'
import { db } from '../db'
import { DatabaseService } from './database.service'
import { DialogService } from './dialog.service'
import { createLogger } from '../util/logger'
import { generateId } from '../util/id-generator'

export type DirectoryMetadataKind = 'video' | 'asmr'

type FlattenedMediaNode = {
  fileName: string
  relativePath: string
  kind: 'image' | 'audio' | 'video'
  hasSubtitle: boolean
  duration: number | null
  bitrate: number | null
  sampleRate: number | null
  frameRate: number | null
  audioBitrate: number | null
  audioSampleRate: number | null
  width: number | null
  height: number | null
}

const logger = createLogger('resource-directory-metadata')
const DEFAULT_DEBOUNCE_MS = 1200

export class ResourceDirectoryMetadataService {
  private static readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private static readonly runningTasks = new Map<string, Promise<void>>()

  static getDirectoryMetadataKindFromCategory(categoryInfo: any): DirectoryMetadataKind | null {
    const extendTable = String(categoryInfo?.meta?.extra?.extendTable ?? '').trim()
    const resourcePathType = String(categoryInfo?.meta?.extra?.resourcePathType ?? '').trim()

    if (resourcePathType !== 'folder') {
      return null
    }

    if (extendTable === 'video_meta') {
      return 'video'
    }

    if (extendTable === 'asmr_meta') {
      return 'asmr'
    }

    return null
  }

  static scheduleResourceSync(
    resourceId: string,
    options?: {
      kind?: DirectoryMetadataKind | null
      debounceMs?: number
    }
  ) {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return
    }

    const pendingTimer = this.pendingTimers.get(normalizedResourceId)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      this.pendingTimers.delete(normalizedResourceId)
    }

    const timer = setTimeout(() => {
      this.pendingTimers.delete(normalizedResourceId)
      void this.runResourceSync(normalizedResourceId, options?.kind ?? null)
    }, Math.max(0, Number(options?.debounceMs ?? DEFAULT_DEBOUNCE_MS)))

    this.pendingTimers.set(normalizedResourceId, timer)
  }

  private static async runResourceSync(resourceId: string, kindOverride: DirectoryMetadataKind | null) {
    const existingTask = this.runningTasks.get(resourceId)
    if (existingTask) {
      return existingTask
    }

    const task = (async () => {
      const existingResource = await DatabaseService.getResourceById(resourceId)
      if (!existingResource) {
        return
      }

      const categoryInfo = await DatabaseService.getCategoryById(String(existingResource.categoryId ?? '').trim())
      const kind = kindOverride ?? this.getDirectoryMetadataKindFromCategory(categoryInfo)
      if (!kind) {
        return
      }

      const basePath = String(existingResource.basePath ?? '').trim()
      if (!basePath) {
        return
      }

      if (kind === 'video') {
        await this.syncVideoDirectoryMetadata(resourceId, basePath)
        return
      }

      await this.syncAsmrDirectoryMetadata(resourceId, basePath)
    })()
      .catch((error) => {
        logger.error('runResourceSync', {
          resourceId,
          error: error instanceof Error ? error.message : String(error)
        })
      })
      .finally(() => {
        this.runningTasks.delete(resourceId)
      })

    this.runningTasks.set(resourceId, task)
    return task
  }

  private static async syncVideoDirectoryMetadata(resourceId: string, basePath: string) {
    const { ResourceService } = await import('./resource.service')
    const syncResult = await ResourceService.syncVideoSubItems(resourceId, { force: true })
    if (syncResult.type === 'warning') {
      return
    }

    const mediaTree = await DialogService.getDirectoryAudioTree(basePath, { includeMetadata: true })
    const scannedItems = flattenMediaTree(mediaTree, basePath)
      .filter((item) => item.kind === 'video')
    const scannedMap = new Map(
      scannedItems.map((item) => [normalizeRelativePath(item.relativePath).toLowerCase(), item] as const)
    )
    const existingItems = await DatabaseService.getMediaSubsByResourceId(resourceId)
    const nextItems = existingItems
      .filter((item) => String(item?.kind ?? '') === 'video')
      .map((item) => {
        const scannedItem = scannedMap.get(normalizeRelativePath(String(item?.relativePath ?? '')).toLowerCase())
        return buildMergedMediaSubItem(item, scannedItem, 'video')
      })

    db.transaction((tx) => {
      DatabaseService.replaceMediaSubs(resourceId, nextItems, tx)
    })
  }

  private static async syncAsmrDirectoryMetadata(resourceId: string, basePath: string) {
    const mediaTree = await DialogService.getDirectoryAudioTree(basePath, { includeMetadata: true })
    const scannedItems = flattenMediaTree(mediaTree, basePath)
    const existingItems = await DatabaseService.getMediaSubsByResourceId(resourceId)
    const existingItemMap = new Map(
      existingItems.map((item) => [normalizeRelativePath(String(item?.relativePath ?? '')).toLowerCase(), item] as const)
    )
    const timestamp = new Date()
    const nextItems = scannedItems.map((item, index) => ({
      id: String(existingItemMap.get(normalizeRelativePath(item.relativePath).toLowerCase())?.id ?? generateId()),
      resourceId,
      fileName: item.fileName,
      relativePath: item.relativePath,
      kind: item.kind,
      coverPath: null,
      sortOrder: index,
      isVisible: true,
      hasSubtitle: item.hasSubtitle,
      duration: item.duration,
      bitrate: item.bitrate,
      sampleRate: item.sampleRate,
      frameRate: item.frameRate,
      audioBitrate: item.audioBitrate,
      audioSampleRate: item.audioSampleRate,
      width: item.width,
      height: item.height,
      metadataUpdatedAt: timestamp
    }))

    db.transaction((tx) => {
      DatabaseService.replaceMediaSubs(resourceId, nextItems, tx)
    })
  }
}

function buildMergedMediaSubItem(currentItem: any, scannedItem: FlattenedMediaNode | undefined, fallbackKind: 'video' | 'audio' | 'image') {
  return {
    ...currentItem,
    kind: String(currentItem?.kind ?? fallbackKind) as 'video' | 'audio' | 'image',
    hasSubtitle: scannedItem?.hasSubtitle ?? Boolean(currentItem?.hasSubtitle),
    duration: normalizeNullableNumber(scannedItem?.duration),
    bitrate: normalizeNullableNumber(scannedItem?.bitrate),
    sampleRate: normalizeNullableNumber(scannedItem?.sampleRate),
    frameRate: normalizeNullableNumber(scannedItem?.frameRate),
    audioBitrate: normalizeNullableNumber(scannedItem?.audioBitrate),
    audioSampleRate: normalizeNullableNumber(scannedItem?.audioSampleRate),
    width: normalizeNullableNumber(scannedItem?.width),
    height: normalizeNullableNumber(scannedItem?.height),
    metadataUpdatedAt: new Date()
  }
}

function flattenMediaTree(nodes: any[], basePath: string) {
  const items: FlattenedMediaNode[] = []

  const visit = (entries: any[]) => {
    for (const entry of entries) {
      if (!entry) {
        continue
      }

      if (entry.isDirectory && Array.isArray(entry.children)) {
        visit(entry.children)
        continue
      }

      if (!entry.path || !entry.kind) {
        continue
      }

      const relativePath = getRelativeMediaPath(basePath, String(entry.path))
      if (!relativePath) {
        continue
      }

      items.push({
        fileName: String(entry.label ?? path.basename(String(entry.path))),
        relativePath,
        kind: String(entry.kind) as 'image' | 'audio' | 'video',
        hasSubtitle: Boolean(entry.hasSubtitle),
        duration: normalizeNullableNumber(entry.duration),
        bitrate: normalizeNullableNumber(entry.bitrate),
        sampleRate: normalizeNullableNumber(entry.sampleRate),
        frameRate: normalizeNullableNumber(entry.frameRate),
        audioBitrate: normalizeNullableNumber(entry.audioBitrate),
        audioSampleRate: normalizeNullableNumber(entry.audioSampleRate),
        width: normalizeNullableNumber(entry.width),
        height: normalizeNullableNumber(entry.height)
      })
    }
  }

  visit(Array.isArray(nodes) ? nodes : [])
  return items
}

function getRelativeMediaPath(basePath: string, filePath: string) {
  const normalizedBasePath = normalizeRelativePath(basePath).replace(/\/+$/, '')
  const normalizedFilePath = normalizeRelativePath(filePath)

  if (!normalizedBasePath || !normalizedFilePath) {
    return normalizedFilePath
  }

  const normalizedBasePathLower = normalizedBasePath.toLowerCase()
  const normalizedFilePathLower = normalizedFilePath.toLowerCase()
  if (normalizedFilePathLower === normalizedBasePathLower) {
    return ''
  }

  if (!normalizedFilePathLower.startsWith(`${normalizedBasePathLower}/`)) {
    return normalizedFilePath
  }

  return normalizedFilePath.slice(normalizedBasePath.length + 1)
}

function normalizeRelativePath(targetPath: string) {
  return String(targetPath ?? '').replace(/\\/g, '/').trim()
}

function normalizeNullableNumber(value: unknown) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) {
    return null
  }

  return normalized
}
