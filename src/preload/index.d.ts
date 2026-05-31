import { ElectronAPI } from '@electron-toolkit/preload'
import {SettingDetail} from "../common/constants";
import {settings, category} from "../main/db/schema";
import { ResourceForm } from '../main/model/models'
import type {
  AppNotificationMessage,
  ArchivePackageStateChangedMessage,
  BatchImportProgressMessage,
  ResourceArchiveProgressMessage,
  ResourceStateChangedMessage,
  WebsiteCoverProgressMessage
} from '../main/service/notification-queue.service'

type HomePinnedResource = {
  id: string
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string | null
  categoryPillColor: string | null
  coverPath: string | null
  basePath: string | null
  fileName: string | null
  pinnedAt: string | number | Date | null
  createTime: string | number | Date | null
  accessCount: number
  lastAccessTime: string | number | Date | null
}

type HomeNextPlayResource = {
  id: string
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string | null
  categoryPillColor: string | null
  coverPath: string | null
  basePath: string | null
  fileName: string | null
  ifFavorite: boolean | null
  rating: number | null
  createTime: string | number | Date | null
  accessCount: number
  reason: string
  order: number
}

type DashboardUsageDistributionItem = {
  categoryName: string
  categoryEmoji: string | null
  categoryPillColor: string | null
  launchCount: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      diagnostics: {
        logRenderer: (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void,
      },
      db: {
        getCategory: () => Promise<category[]>,
        getCategoryById: (id: string) => Promise<category>,
        getSetting: (setting: SettingDetail) => Promise<settings>,
        setSetting: (settingOption: SettingDetail, value: string) => Promise<any>,
        getResourceByCategoryId: (categoryId: string, query?: any) => Promise<any>,
        getRecentlyAddedResources: (days?: number, limit?: number) => Promise<any[]>,
        getRandomResource: () => Promise<any | null>,
        getFavoriteResources: (page?: number, pageSize?: number) => Promise<any>,
        getDashboardStats: () => Promise<any>,
        getActivityHeatmap: (days?: number) => Promise<any>,
        getDashboardUsageDistribution: (days?: number) => Promise<DashboardUsageDistributionItem[]>,
        getDashboardLongUnvisitedBuckets: () => Promise<Array<{ label: string; value: number }>>,
        getDashboardAddedTrend: (days?: number) => Promise<Array<{ date: string; count: number }>>,
        getHomeNextPlayResources: (limit?: number) => Promise<HomeNextPlayResource[]>,
        getHomeFavoriteOverview: () => Promise<any[]>,
        getHomePinnedResources: (limit?: number) => Promise<HomePinnedResource[]>,
        getHomeCoverWallData: (query?: number | { filter?: string; limit?: number; offset?: number; keyword?: string; categoryId?: string }) => Promise<any>,
        getRecentResourceLogs: (page?: number, pageSize?: number) => Promise<any>,
        getAuthorByCategoryId: (categoryId: string) => Promise<any>,
        getActorByCategoryId: (categoryId: string) => Promise<any>,
        getAlbumByCategoryId: (categoryId: string) => Promise<any>,
        getEngineByCategoryId: (categoryId: string) => Promise<any>,
        getMissingResourceCountByCategoryId: (categoryId: string) => Promise<number>,
        getFavoriteResourceCountByCategoryId: (categoryId: string) => Promise<number>,
        getCompletedResourceCountByCategoryId: (categoryId: string) => Promise<number>,
        getRunningResourceCountByCategoryId: (categoryId: string) => Promise<number>,
        getGovernanceIssueWorkbench: (query?: any) => Promise<any>,
        getGovernanceTagWorkbench: () => Promise<any>,
        renameGovernanceTagEntity: (kind: 'tag' | 'type', id: string, name: string) => Promise<any>,
        deleteGovernanceTagEntity: (kind: 'tag' | 'type', id: string) => Promise<any>,
        deleteGovernanceTagEntities: (kind: 'tag' | 'type', ids: string[]) => Promise<any>,
        getTypeByCategoryId: (categoryId: string) => Promise<any>,
        getTagByCategoryId: (categoryId: string) => Promise<any>,
        getSelectDictData: (dictType: string) => Promise<any>,
      },

      dialog: {
        selectFolder: () => Promise<any>,
        selectFolders: () => Promise<string[]>,
        selectFile: (extensions: string[]) => Promise<any>,
        selectFiles: (extensions: string[]) => Promise<string[]>,
        selectBookmarkFile: () => Promise<string | null>,
        exportBookmarkHtmlFile: (items: Array<{ title?: string; url?: string; folder?: string; favicon?: string }>) => Promise<any>,
        selectGameLaunchFile: (directoryPath: string) => Promise<string | null>,
        readImageAsDataUrl: (filePath: string) => Promise<string | null>,
        getImagePreviewUrl: (
          filePath: string,
          options?: { maxWidth?: number; maxHeight?: number; fit?: 'inside' | 'cover'; quality?: number }
        ) => Promise<string | null>,
        getImageFileUrl: (filePath: string) => Promise<string | null>,
        getFileUrl: (filePath: string) => Promise<string | null>,
        getAudioPlaybackUrl: (filePath: string) => Promise<{
          url: string
          transcoded: boolean
          sourcePath: string
          playbackPath: string
        } | null>,
        getVideoPlaybackUrl: (filePath: string, startTime?: number, fastSeek?: boolean, sessionId?: string) => Promise<{
          url: string
          transcoded: boolean
          sourcePath: string
          playbackPath: string
          duration: number
          mode: 'direct' | 'remux-cache' | 'stream-transcode' | 'full-transcode-cache'
          isLossless: boolean
          sessionId?: string
          reason?: string
          errorMessage?: string
        } | null>,
        readTextFile: (filePath: string, encoding?: string) => Promise<string | null>,
        getTextFileInfo: (filePath: string) => Promise<{
          size: number
          encoding: string
          recommendedChunkSize: number
        } | null>,
        readTextFileChunk: (
          filePath: string,
          options?: { offset?: number; length?: number; encoding?: string }
        ) => Promise<{
          text: string
          offset: number
          nextOffset: number
          fileSize: number
          encoding: string
          hasPrevious: boolean
          hasNext: boolean
        } | null>,
        readBinaryFile: (filePath: string) => Promise<Uint8Array | null>,
        getFileIconAsDataUrl: (filePath: string, fileName?: string) => Promise<string | null>,
        getAvailableScriptRuntimes: () => Promise<Array<{ label: string; value: string; shellType: 'powershell' | 'cmd' }>>,
        openPath: (filePath: string, fileName?: string) => Promise<string>,
        openExternalUrl: (url: string) => Promise<string>,
        copyImageToClipboard: (filePath: string) => Promise<string>,
        copyTextToClipboard: (text: string) => Promise<string>,
        openScreenshotFolder: (resourceId: string) => Promise<string>,
        getScreenshotImages: (resourceId: string) => Promise<string[]>,
        saveVideoFrameScreenshot: (resourceId: string, dataUrl: string, currentTime?: number) => Promise<any>,
        getDirectoryImages: (directoryPath: string) => Promise<string[]>,
        getDirectoryAudioTree: (directoryPath: string, options?: { includeMetadata?: boolean }) => Promise<any[]>,
        getMediaMetadata: (filePath: string) => Promise<any | null>,
        selectScreenshotImage: (resourceId: string) => Promise<string | null>,
        deleteImage: (filePath: string) => Promise<string>,
      },

      service: {
        saveResource: (resourceForm: ResourceForm) => Promise<any>,
        getResourceDetail: (resourceId: string) => Promise<any>,
        updateResource: (resourceId: string, resourceForm: ResourceForm, options?: { silent?: boolean }) => Promise<any>,
        checkResourceExistsByPath: (basePath: string) => Promise<any>,
        analyzeGamePath: (basePath: string) => Promise<any>,
        analyzeAudioFilePath: (basePath: string) => Promise<any>,
        analyzeNovelFilePath: (basePath: string) => Promise<any>,
        fetchAudioAlbumCover: (payload: any) => Promise<any>,
        fetchAudioLyrics: (payload: any) => Promise<any>,
        detectGameEngine: (basePath: string, resourceId?: string | null) => Promise<any>,
        detectGameLaunchFile: (basePath: string) => Promise<any>,
        analyzeGameDirectory: (directoryPath: string, launchFilePath?: string | null) => Promise<any>,
        analyzeMultiImageDirectory: (directoryPath: string) => Promise<any>,
        analyzeAsmrDirectory: (directoryPath: string) => Promise<any>,
        importBatchGameDirectories: (categoryId: string, items: any[]) => Promise<any>,
        importBatchMultiImageDirectories: (categoryId: string, items: any[]) => Promise<any>,
        importBatchAsmrDirectories: (categoryId: string, items: any[]) => Promise<any>,
        listBrowserBookmarkSources: () => Promise<any>,
        analyzeWebsiteBookmarkFile: (filePath: string) => Promise<any>,
        analyzeWebsiteBookmarksFromBrowser: (sourceId: string) => Promise<any>,
        importBatchWebsiteBookmarks: (categoryId: string, items: any[]) => Promise<any>,
        fetchResourceInfo: (websiteId: string, resourceId: string) => Promise<any>,
        fetchWebsiteInfo: (url: string) => Promise<any>,
        fetchWebsiteCover: (url: string) => Promise<any>,
        captureCoverScreenshot: (basePath: string) => Promise<any>,
        extractVideoCoverFrames: (basePath: string) => Promise<any>,
        extractVideoSubCoverFrames: (basePath: string) => Promise<any>,
        launchResource: (resourceId: string, basePath: string, fileName?: string | null) => Promise<any>,
        recordResourceAccess: (resourceId: string, launchMode?: string) => Promise<any>,
        startReadingResource: (resourceId: string) => Promise<any>,
        getMultiImageReadingProgress: (resourceId: string) => Promise<any>,
        updateMultiImageReadingProgress: (resourceId: string, lastReadPage: number) => Promise<any>,
        getNovelReadingProgress: (resourceId: string) => Promise<any>,
        updateNovelReadingProgress: (resourceId: string, lastReadPercent: number) => Promise<any>,
        updateAsmrPlaybackProgress: (resourceId: string, lastPlayFile: string, lastPlayTime: number) => Promise<any>,
        updateVideoPlaybackProgress: (resourceId: string, lastPlayFile: string, lastPlayTime: number) => Promise<any>,
        updateVideoSubItems: (resourceId: string, items: any[]) => Promise<any>,
        startAsmrPlayback: (resourceId: string) => Promise<any>,
        stopAsmrPlayback: (resourceId: string) => Promise<any>,
        startVideoPlayback: (resourceId: string) => Promise<any>,
        stopVideoPlayback: (resourceId: string) => Promise<any>,
        launchResourceAsAdmin: (resourceId: string, basePath: string, fileName?: string | null) => Promise<any>,
        launchResourceWithMtool: (resourceId: string, basePath: string, fileName?: string | null) => Promise<any>,
        launchResourceWithLocaleEmulator: (resourceId: string, basePath: string, fileName?: string | null) => Promise<any>,
        stopResource: (resourceId: string) => Promise<any>,
        deleteResource: (resourceId: string) => Promise<any>,
        deleteResourceWithFiles: (resourceId: string) => Promise<any>,
        deleteResources: (resourceIds: string[]) => Promise<any>,
        batchUpdateResourceLabels: (resourceIds: string[], field: 'tags' | 'types', mode: 'add' | 'remove', values: string[]) => Promise<any>,
        updateResourceRating: (resourceId: string, rating: number) => Promise<any>,
        updateResourceFavorite: (resourceId: string, favorite: boolean) => Promise<any>,
        updateResourceCompleted: (resourceId: string, completed: boolean) => Promise<any>,
        updateResourceTop: (resourceId: string, top: boolean) => Promise<any>,
        updateResourceHomePin: (resourceId: string, pinned: boolean) => Promise<any>,
        setGovernanceIssueIgnored: (resourceId: string, issueType: 'brokenPath' | 'missingCover' | 'longUnvisited' | 'duplicateResource', ignored: boolean) => Promise<any>,
        batchSetGovernanceIssueIgnored: (
          items: Array<{ resourceId: string; issueType: 'brokenPath' | 'missingCover' | 'longUnvisited' | 'duplicateResource' }>,
          ignored: boolean
        ) => Promise<any>,
        archiveResource: (resourceId: string) => Promise<any>,
        archiveResources: (resourceIds: string[]) => Promise<any>,
        archiveResourcesAsPackage: (resourceIds: string[], packageTitle?: string) => Promise<any>,
        listArchivedPackages: () => Promise<any>,
        restoreArchivedPackage: (archiveId: string, options?: { restoreDirectory?: string }) => Promise<any>,
        restoreArchivedPackages: (archiveIds: string[], options?: { restoreDirectory?: string }) => Promise<any>,
        deleteArchivedPackage: (archiveId: string) => Promise<any>,
        deleteArchivedPackages: (archiveIds: string[]) => Promise<any>,
        listArchiveQueueItems: () => Promise<any>,
        deleteArchiveQueueItem: (queueItemId: string) => Promise<any>,
        stopArchiveQueue: () => Promise<any>,
        rescanMissingResources: (resourceIds: string[]) => Promise<any>,
        syncEverythingClientFromSettings: () => Promise<any>,
        restartApiServer: () => Promise<{ host: string; port: number; restarted: boolean }>,
        testEverythingHttpServer: (payload?: { host?: string; port?: string; username?: string; password?: string }) => Promise<any>,
        startBackgroundServices: (reason?: string, delayMs?: number) => Promise<boolean>,
        startNotificationPush: () => Promise<boolean>,
        onNotificationPush: (listener: (message: AppNotificationMessage) => void) => () => void,
        onResourceStateChanged: (listener: (message: ResourceStateChangedMessage) => void) => () => void,
        onArchivePackageStateChanged: (listener: (message: ArchivePackageStateChangedMessage) => void) => () => void,
        onVideoFrameCaptureShortcut: (listener: () => void) => () => void,
        onVideoTranscodeFailed: (listener: (message: {
          sessionId: string
          filePath: string
          message: string
          code?: number | null
          signal?: string | null
          stderr?: string
        }) => void) => () => void,
        onBatchImportProgress: (listener: (message: BatchImportProgressMessage) => void) => () => void,
        onResourceArchiveProgress: (listener: (message: ResourceArchiveProgressMessage) => void) => () => void,
        onWebsiteCoverProgress: (listener: (message: WebsiteCoverProgressMessage) => void) => () => void,
      }
    }
  }
}
