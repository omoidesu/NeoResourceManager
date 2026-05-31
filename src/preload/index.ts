import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {SettingDetail} from "../common/constants";
import {ResourceForm} from "../main/model/models";
import type { AppNotificationMessage, BatchImportProgressMessage, ResourceArchiveProgressMessage, ResourceStateChangedMessage } from '../main/service/notification-queue.service'
import type { WebsiteCoverProgressMessage } from '../main/service/notification-queue.service'

type VideoTranscodeFailedMessage = {
  sessionId: string
  filePath: string
  message: string
  code?: number | null
  signal?: string | null
  stderr?: string
}

const sendRendererLog = (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
  try {
    ipcRenderer.send('renderer:log', {
      level,
      message,
      meta
    })
  } catch {
    // noop
  }
}

sendRendererLog('info', 'preload initialized', {
  contextIsolated: process.contextIsolated,
  pid: process.pid
})

window.addEventListener('error', (event) => {
  sendRendererLog('error', 'renderer window error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error instanceof Error
      ? {
          message: event.error.message,
          stack: event.error.stack ?? ''
        }
      : String(event.error ?? '')
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  sendRendererLog('error', 'renderer unhandledrejection', {
    reason: reason instanceof Error
      ? {
          message: reason.message,
          stack: reason.stack ?? ''
        }
      : String(reason)
  })
})

// Custom APIs for renderer
const api = {
  diagnostics: {
    logRenderer: (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
      sendRendererLog(level, message, meta)
    }
  },
  db: {
    getCategory: () => ipcRenderer.invoke('db:get-category'),
    getCategoryById: (id: string) => ipcRenderer.invoke('db:get-category-by-id', id),
    getCategoryByName: (name: string) => ipcRenderer.invoke('db:get-category-by-name', name),

    // setting
    getSetting: (setting: SettingDetail) => ipcRenderer.invoke('db:get-setting', setting),
    setSetting: (setting: SettingDetail, value: string) => ipcRenderer.invoke('db:set-setting', setting, value),

    // resource
    getResourceByCategoryId: (categoryId: string, query?: any) => ipcRenderer.invoke('db:get-resource-by-category-id', categoryId, query),
    getRecentlyAddedResources: (days?: number, limit?: number) => ipcRenderer.invoke('db:get-recently-added-resources', days, limit),
    getRandomResource: () => ipcRenderer.invoke('db:get-random-resource'),
    getFavoriteResources: (page?: number, pageSize?: number) => ipcRenderer.invoke('db:get-favorite-resources', page, pageSize),
    getDashboardStats: () => ipcRenderer.invoke('db:get-dashboard-stats'),
    getActivityHeatmap: (days?: number) => ipcRenderer.invoke('db:get-activity-heatmap', days),
    getDashboardUsageDistribution: (days?: number) => ipcRenderer.invoke('db:get-dashboard-usage-distribution', days),
    getDashboardLongUnvisitedBuckets: () => ipcRenderer.invoke('db:get-dashboard-long-unvisited-buckets'),
    getDashboardAddedTrend: (days?: number) => ipcRenderer.invoke('db:get-dashboard-added-trend', days),
    getHomeNextPlayResources: (limit?: number) => ipcRenderer.invoke('db:get-home-next-play-resources', limit),
    getHomeFavoriteOverview: () => ipcRenderer.invoke('db:get-home-favorite-overview'),
    getHomePinnedResources: (limit?: number) => ipcRenderer.invoke('db:get-home-pinned-resources', limit),
    getHomeCoverWallData: (query?: number | { filter?: string; limit?: number; offset?: number; keyword?: string }) => ipcRenderer.invoke('db:get-home-cover-wall-data', query),
    getRecentResourceLogs: (page?: number, pageSize?: number) => ipcRenderer.invoke('db:get-recent-resource-logs', page, pageSize),
    getAuthorByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-author-by-category-id', categoryId),
    getActorByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-actor-by-category-id', categoryId),
    getAlbumByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-album-by-category-id', categoryId),
    getEngineByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-engine-by-category-id', categoryId),
    getMissingResourceCountByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-missing-resource-count-by-category-id', categoryId),
    getFavoriteResourceCountByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-favorite-resource-count-by-category-id', categoryId),
    getCompletedResourceCountByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-completed-resource-count-by-category-id', categoryId),
    getRunningResourceCountByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-running-resource-count-by-category-id', categoryId),
    getGovernanceIssueWorkbench: (query?: any) => ipcRenderer.invoke('db:get-governance-issue-workbench', query),
    getGovernanceTagWorkbench: () => ipcRenderer.invoke('db:get-governance-tag-workbench'),
    renameGovernanceTagEntity: (kind: 'tag' | 'type', id: string, name: string) => ipcRenderer.invoke('db:rename-governance-tag-entity', kind, id, name),
    deleteGovernanceTagEntity: (kind: 'tag' | 'type', id: string) => ipcRenderer.invoke('db:delete-governance-tag-entity', kind, id),
    deleteGovernanceTagEntities: (kind: 'tag' | 'type', ids: string[]) => ipcRenderer.invoke('db:delete-governance-tag-entities', kind, ids),

    // type
    getTypeByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-type-by-category-id', categoryId),

    // tag
    getTagByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-tag-by-category-id', categoryId),

    // dict
    getSelectDictData: (dictType: string) => ipcRenderer.invoke('db:get-select-dict-data', dictType),
  },

  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
    selectFolders: () => ipcRenderer.invoke('dialog:select-folders'),
    selectFile: (extensions: string[]) => ipcRenderer.invoke('dialog:select-file', extensions),
    selectFiles: (extensions: string[]) => ipcRenderer.invoke('dialog:select-files', extensions),
    selectBookmarkFile: () => ipcRenderer.invoke('dialog:select-bookmark-file'),
    exportBookmarkHtmlFile: (items: Array<{ title?: string; url?: string; folder?: string; favicon?: string }>) =>
      ipcRenderer.invoke('dialog:export-bookmark-html-file', items),
    selectGameLaunchFile: (directoryPath: string) => ipcRenderer.invoke('dialog:select-game-launch-file', directoryPath),
    readImageAsDataUrl: (filePath: string) => ipcRenderer.invoke('dialog:read-image-as-data-url', filePath),
    getImagePreviewUrl: (
      filePath: string,
      options?: { maxWidth?: number; maxHeight?: number; fit?: 'inside' | 'cover'; quality?: number }
    ) => ipcRenderer.invoke('dialog:get-image-preview-url', filePath, options),
    getImageFileUrl: (filePath: string) => ipcRenderer.invoke('dialog:get-image-file-url', filePath),
    getFileUrl: (filePath: string) => ipcRenderer.invoke('dialog:get-file-url', filePath),
    getAudioPlaybackUrl: (filePath: string) => ipcRenderer.invoke('dialog:get-audio-playback-url', filePath),
    getVideoPlaybackUrl: (filePath: string, startTime?: number, fastSeek?: boolean, sessionId?: string) =>
      ipcRenderer.invoke('dialog:get-video-playback-url', filePath, startTime, fastSeek, sessionId),
    readTextFile: (filePath: string, encoding?: string) => ipcRenderer.invoke('dialog:read-text-file', filePath, encoding),
    getTextFileInfo: (filePath: string) => ipcRenderer.invoke('dialog:get-text-file-info', filePath),
    readTextFileChunk: (filePath: string, options?: { offset?: number; length?: number; encoding?: string }) =>
      ipcRenderer.invoke('dialog:read-text-file-chunk', filePath, options),
    readBinaryFile: (filePath: string) => ipcRenderer.invoke('dialog:read-binary-file', filePath),
    getFileIconAsDataUrl: (filePath: string, fileName?: string) => ipcRenderer.invoke('dialog:get-file-icon-as-data-url', filePath, fileName),
    getAvailableScriptRuntimes: () => ipcRenderer.invoke('dialog:get-available-script-runtimes'),
    openPath: (filePath: string, fileName?: string) => ipcRenderer.invoke('dialog:open-path', filePath, fileName),
    openExternalUrl: (url: string) => ipcRenderer.invoke('dialog:open-external-url', url),
    copyImageToClipboard: (filePath: string) => ipcRenderer.invoke('dialog:copy-image-to-clipboard', filePath),
    copyTextToClipboard: (text: string) => ipcRenderer.invoke('dialog:copy-text-to-clipboard', text),
    openScreenshotFolder: (resourceId: string) => ipcRenderer.invoke('dialog:open-screenshot-folder', resourceId),
    getScreenshotImages: (resourceId: string) => ipcRenderer.invoke('dialog:get-screenshot-images', resourceId),
    saveVideoFrameScreenshot: (resourceId: string, dataUrl: string, currentTime?: number) =>
      ipcRenderer.invoke('dialog:save-video-frame-screenshot', resourceId, dataUrl, currentTime),
    getDirectoryImages: (directoryPath: string) => ipcRenderer.invoke('dialog:get-directory-images', directoryPath),
    getDirectoryAudioTree: (directoryPath: string, options?: { includeMetadata?: boolean }) =>
      ipcRenderer.invoke('dialog:get-directory-audio-tree', directoryPath, options),
    getMediaMetadata: (filePath: string) => ipcRenderer.invoke('dialog:get-media-metadata', filePath),
    selectScreenshotImage: (resourceId: string) => ipcRenderer.invoke('dialog:select-screenshot-image', resourceId),
    deleteImage: (filePath: string) => ipcRenderer.invoke('dialog:delete-image', filePath),
  },

  service: {
    saveResource: (resourceForm: ResourceForm) => ipcRenderer.invoke('service:save-resource', resourceForm),
    getResourceDetail: (resourceId: string) => ipcRenderer.invoke('service:get-resource-detail', resourceId),
    updateResource: (resourceId: string, resourceForm: ResourceForm, options?: { silent?: boolean }) =>
      ipcRenderer.invoke('service:update-resource', resourceId, resourceForm, options),
    checkResourceExistsByPath: (basePath: string) => ipcRenderer.invoke('service:check-resource-exists-by-path', basePath),
    analyzeGamePath: (basePath: string) => ipcRenderer.invoke('service:analyze-game-path', basePath),
    analyzeAudioFilePath: (basePath: string) => ipcRenderer.invoke('service:analyze-audio-file-path', basePath),
    analyzeNovelFilePath: (basePath: string) => ipcRenderer.invoke('service:analyze-novel-file-path', basePath),
    fetchAudioAlbumCover: (payload: any) => ipcRenderer.invoke('service:fetch-audio-album-cover', payload),
    fetchAudioLyrics: (payload: any) => ipcRenderer.invoke('service:fetch-audio-lyrics', payload),
    detectGameEngine: (basePath: string, resourceId?: string | null) => ipcRenderer.invoke('service:detect-game-engine', basePath, resourceId),
    detectGameLaunchFile: (basePath: string) => ipcRenderer.invoke('service:detect-game-launch-file', basePath),
    analyzeGameDirectory: (directoryPath: string, launchFilePath?: string | null) =>
      ipcRenderer.invoke('service:analyze-game-directory', directoryPath, launchFilePath),
    analyzeMultiImageDirectory: (directoryPath: string) =>
      ipcRenderer.invoke('service:analyze-multi-image-directory', directoryPath),
    analyzeAsmrDirectory: (directoryPath: string) =>
      ipcRenderer.invoke('service:analyze-asmr-directory', directoryPath),
    importBatchGameDirectories: (categoryId: string, items: any[]) =>
      ipcRenderer.invoke('service:import-batch-game-directories', categoryId, items),
    importBatchMultiImageDirectories: (categoryId: string, items: any[]) =>
      ipcRenderer.invoke('service:import-batch-multi-image-directories', categoryId, items),
    importBatchAsmrDirectories: (categoryId: string, items: any[]) =>
      ipcRenderer.invoke('service:import-batch-asmr-directories', categoryId, items),
    listBrowserBookmarkSources: () =>
      ipcRenderer.invoke('service:list-browser-bookmark-sources'),
    analyzeWebsiteBookmarkFile: (filePath: string) =>
      ipcRenderer.invoke('service:analyze-website-bookmark-file', filePath),
    analyzeWebsiteBookmarksFromBrowser: (sourceId: string) =>
      ipcRenderer.invoke('service:analyze-website-bookmarks-from-browser', sourceId),
    importBatchWebsiteBookmarks: (categoryId: string, items: any[]) =>
      ipcRenderer.invoke('service:import-batch-website-bookmarks', categoryId, items),
    fetchResourceInfo: (websiteId: string, resourceId: string) =>
      ipcRenderer.invoke('service:fetch-resource-info', websiteId, resourceId),
    fetchWebsiteInfo: (url: string) =>
      ipcRenderer.invoke('service:fetch-website-info', url),
    fetchWebsiteCover: (url: string) =>
      ipcRenderer.invoke('service:fetch-website-cover', url),
      captureCoverScreenshot: (basePath: string) =>
        ipcRenderer.invoke('service:capture-cover-screenshot', basePath),
      extractVideoCoverFrames: (basePath: string) =>
        ipcRenderer.invoke('service:extract-video-cover-frames', basePath),
      extractVideoSubCoverFrames: (basePath: string) =>
        ipcRenderer.invoke('service:extract-video-sub-cover-frames', basePath),
      launchResource: (resourceId: string, basePath: string, fileName?: string | null) =>
        ipcRenderer.invoke('service:launch-resource', resourceId, basePath, fileName),
    recordResourceAccess: (resourceId: string, launchMode?: string) =>
      ipcRenderer.invoke('service:record-resource-access', resourceId, launchMode),
    startReadingResource: (resourceId: string) =>
      ipcRenderer.invoke('service:start-reading-resource', resourceId),
    getMultiImageReadingProgress: (resourceId: string) =>
      ipcRenderer.invoke('service:get-multi-image-reading-progress', resourceId),
    updateMultiImageReadingProgress: (resourceId: string, lastReadPage: number) =>
      ipcRenderer.invoke('service:update-multi-image-reading-progress', resourceId, lastReadPage),
    getNovelReadingProgress: (resourceId: string) =>
      ipcRenderer.invoke('service:get-novel-reading-progress', resourceId),
    updateNovelReadingProgress: (resourceId: string, lastReadPercent: number) =>
      ipcRenderer.invoke('service:update-novel-reading-progress', resourceId, lastReadPercent),
      updateAsmrPlaybackProgress: (resourceId: string, lastPlayFile: string, lastPlayTime: number) =>
        ipcRenderer.invoke('service:update-asmr-playback-progress', resourceId, lastPlayFile, lastPlayTime),
      updateVideoPlaybackProgress: (resourceId: string, lastPlayFile: string, lastPlayTime: number) =>
        ipcRenderer.invoke('service:update-video-playback-progress', resourceId, lastPlayFile, lastPlayTime),
      updateVideoSubItems: (resourceId: string, items: any[]) =>
        ipcRenderer.invoke('service:update-video-sub-items', resourceId, items),
      startAsmrPlayback: (resourceId: string) =>
        ipcRenderer.invoke('service:start-asmr-playback', resourceId),
      stopAsmrPlayback: (resourceId: string) =>
        ipcRenderer.invoke('service:stop-asmr-playback', resourceId),
      startVideoPlayback: (resourceId: string) =>
        ipcRenderer.invoke('service:start-video-playback', resourceId),
      stopVideoPlayback: (resourceId: string) =>
        ipcRenderer.invoke('service:stop-video-playback', resourceId),
      launchResourceAsAdmin: (resourceId: string, basePath: string, fileName?: string | null) =>
        ipcRenderer.invoke('service:launch-resource-as-admin', resourceId, basePath, fileName),
    launchResourceWithMtool: (resourceId: string, basePath: string, fileName?: string | null) =>
      ipcRenderer.invoke('service:launch-resource-with-mtool', resourceId, basePath, fileName),
    launchResourceWithLocaleEmulator: (resourceId: string, basePath: string, fileName?: string | null) =>
      ipcRenderer.invoke('service:launch-resource-with-locale-emulator', resourceId, basePath, fileName),
    stopResource: (resourceId: string) => ipcRenderer.invoke('service:stop-resource', resourceId),
    deleteResource: (resourceId: string) => ipcRenderer.invoke('service:delete-resource', resourceId),
    deleteResourceWithFiles: (resourceId: string) => ipcRenderer.invoke('service:delete-resource-with-files', resourceId),
    deleteResources: (resourceIds: string[]) => ipcRenderer.invoke('service:delete-resources', resourceIds),
    batchUpdateResourceLabels: (resourceIds: string[], field: 'tags' | 'types', mode: 'add' | 'remove', values: string[]) =>
      ipcRenderer.invoke('service:batch-update-resource-labels', resourceIds, field, mode, values),
    updateResourceRating: (resourceId: string, rating: number) =>
      ipcRenderer.invoke('service:update-resource-rating', resourceId, rating),
    updateResourceFavorite: (resourceId: string, favorite: boolean) =>
      ipcRenderer.invoke('service:update-resource-favorite', resourceId, favorite),
    updateResourceCompleted: (resourceId: string, completed: boolean) =>
      ipcRenderer.invoke('service:update-resource-completed', resourceId, completed),
    updateResourceTop: (resourceId: string, top: boolean) =>
      ipcRenderer.invoke('service:update-resource-top', resourceId, top),
    updateResourceHomePin: (resourceId: string, pinned: boolean) =>
      ipcRenderer.invoke('service:update-resource-home-pin', resourceId, pinned),
    setGovernanceIssueIgnored: (resourceId: string, issueType: 'brokenPath' | 'missingCover' | 'longUnvisited' | 'duplicateResource', ignored: boolean) =>
      ipcRenderer.invoke('service:set-governance-issue-ignored', resourceId, issueType, ignored),
    batchSetGovernanceIssueIgnored: (
      items: Array<{ resourceId: string; issueType: 'brokenPath' | 'missingCover' | 'longUnvisited' | 'duplicateResource' }>,
      ignored: boolean
    ) => ipcRenderer.invoke('service:batch-set-governance-issue-ignored', items, ignored),
    archiveResource: (resourceId: string) =>
      ipcRenderer.invoke('service:archive-resource', resourceId),
    archiveResources: (resourceIds: string[]) =>
      ipcRenderer.invoke('service:archive-resources', resourceIds),
    archiveResourcesAsPackage: (resourceIds: string[], packageTitle?: string) =>
      ipcRenderer.invoke('service:archive-resources-as-package', resourceIds, packageTitle),
    listArchivedPackages: () =>
      ipcRenderer.invoke('service:list-archived-packages'),
    restoreArchivedPackage: (archiveId: string, options?: { restoreDirectory?: string }) =>
      ipcRenderer.invoke('service:restore-archived-package', archiveId, options),
    restoreArchivedPackages: (archiveIds: string[], options?: { restoreDirectory?: string }) =>
      ipcRenderer.invoke('service:restore-archived-packages', archiveIds, options),
    deleteArchivedPackage: (archiveId: string) =>
      ipcRenderer.invoke('service:delete-archived-package', archiveId),
    deleteArchivedPackages: (archiveIds: string[]) =>
      ipcRenderer.invoke('service:delete-archived-packages', archiveIds),
    listArchiveQueueItems: () =>
      ipcRenderer.invoke('service:list-archive-queue-items'),
    deleteArchiveQueueItem: (queueItemId: string) =>
      ipcRenderer.invoke('service:delete-archive-queue-item', queueItemId),
    stopArchiveQueue: () =>
      ipcRenderer.invoke('service:stop-archive-queue'),
    rescanMissingResources: (resourceIds: string[]) =>
      ipcRenderer.invoke('service:rescan-missing-resources', resourceIds),
    syncEverythingClientFromSettings: () =>
      ipcRenderer.invoke('service:sync-everything-client-from-settings'),
    restartApiServer: () =>
      ipcRenderer.invoke('service:restart-api-server'),
    testEverythingHttpServer: (payload?: { host?: string; port?: string; username?: string; password?: string }) =>
      ipcRenderer.invoke('service:test-everything-http-server', payload),
    startBackgroundServices: (reason?: string, delayMs?: number) =>
      ipcRenderer.invoke('service:start-background-services', reason, delayMs),
    startNotificationPush: () => ipcRenderer.invoke('service:start-notification-push'),
    onNotificationPush: (listener: (message: AppNotificationMessage) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, message: AppNotificationMessage) => {
        listener(message)
      }

      ipcRenderer.on('service:notification-push', wrappedListener)

      return () => {
        ipcRenderer.removeListener('service:notification-push', wrappedListener)
      }
    },
    onResourceStateChanged: (listener: (message: ResourceStateChangedMessage) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, message: ResourceStateChangedMessage) => {
        listener(message)
      }

      ipcRenderer.on('service:resource-state-changed', wrappedListener)

      return () => {
        ipcRenderer.removeListener('service:resource-state-changed', wrappedListener)
      }
    },
    onArchivePackageStateChanged: (listener: (message: import('../main/service/notification-queue.service').ArchivePackageStateChangedMessage) => void) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        message: import('../main/service/notification-queue.service').ArchivePackageStateChangedMessage
      ) => {
        listener(message)
      }

      ipcRenderer.on('service:archive-package-state-changed', wrappedListener)

      return () => {
        ipcRenderer.removeListener('service:archive-package-state-changed', wrappedListener)
      }
    },
    onVideoFrameCaptureShortcut: (listener: () => void) => {
      const wrappedListener = () => {
        listener()
      }

      ipcRenderer.on('service:video-frame-capture-shortcut', wrappedListener)

      return () => {
        ipcRenderer.removeListener('service:video-frame-capture-shortcut', wrappedListener)
      }
    },
    onVideoTranscodeFailed: (listener: (message: VideoTranscodeFailedMessage) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, message: VideoTranscodeFailedMessage) => {
        listener(message)
      }

      ipcRenderer.on('video-transcode:failed', wrappedListener)

      return () => {
        ipcRenderer.removeListener('video-transcode:failed', wrappedListener)
      }
    },
    onBatchImportProgress: (listener: (message: BatchImportProgressMessage) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, message: BatchImportProgressMessage) => {
        listener(message)
      }

      ipcRenderer.on('service:batch-import-progress', wrappedListener)

      return () => {
        ipcRenderer.removeListener('service:batch-import-progress', wrappedListener)
      }
    },
    onResourceArchiveProgress: (listener: (message: ResourceArchiveProgressMessage) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, message: ResourceArchiveProgressMessage) => {
        listener(message)
      }

      ipcRenderer.on('service:resource-archive-progress', wrappedListener)

      return () => {
        ipcRenderer.removeListener('service:resource-archive-progress', wrappedListener)
      }
    },
    onWebsiteCoverProgress: (listener: (message: WebsiteCoverProgressMessage) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, message: WebsiteCoverProgressMessage) => {
        listener(message)
      }

      ipcRenderer.on('service:website-cover-progress', wrappedListener)

      return () => {
        ipcRenderer.removeListener('service:website-cover-progress', wrappedListener)
      }
    },
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
