import {ipcMain} from "electron"
import {DatabaseService} from "./database.service";
import {DialogService} from "./dialog.service";
import {SettingDetail} from "../../common/constants";
import {ResourceForm} from "../model/models";
import {ResourceService} from "./resource.service";
import { NotificationQueueService } from './notification-queue.service'
import { createLogger } from '../util/logger'

const ipcLogger = createLogger('ipc-handle')

export default function registerIpcHandlers() {
  // 直接操作数据库
  registerCategory();
  registerSettings();
  registerResource();
  registerTag();
  registerType();
  registerDict();

  // 弹窗
  registerDialog();

  // 服务
  registerService()
}

function registerCategory() {
  ipcMain.handle('db:get-category', async () => {
    return await DatabaseService.getCategory();
  })

  ipcMain.handle('db:get-category-by-id', async (_event, id: string) => {
    return await DatabaseService.getCategoryById(id)
  })

  ipcMain.handle('db:get-category-by-name', async (_event, name: string) => {
    return await DatabaseService.getCategoryByName(name)
  })
}

function registerSettings() {
  ipcMain.handle('db:get-setting', async (_event, setting: SettingDetail) => {
    return await DatabaseService.getSetting(setting)
  })

  ipcMain.handle('db:set-setting', async (_event, setting: SettingDetail, value: string) => {
    return await DatabaseService.setSetting(setting, value)
  })
}

function registerResource() {
  ipcMain.handle('db:get-resource-by-category-id', async (_event, categoryId: string, query?: any) => {
    return await DatabaseService.getResourceByCategoryId(categoryId, query)
  })

  ipcMain.handle('db:get-recently-added-resources', async (_event, days?: number, limit?: number) => {
    return await DatabaseService.getRecentlyAddedResources(days, limit)
  })

  ipcMain.handle('db:get-random-resource', async () => {
    return await DatabaseService.getRandomResource()
  })

  ipcMain.handle('db:get-favorite-resources', async (_event, limit?: number) => {
    return await DatabaseService.getFavoriteResources(limit)
  })

  ipcMain.handle('db:get-dashboard-stats', async () => {
    return await DatabaseService.getDashboardStats()
  })

  ipcMain.handle('db:get-activity-heatmap', async (_event, days?: number) => {
    return await DatabaseService.getActivityHeatmap(days)
  })

  ipcMain.handle('db:get-home-next-play-resources', async (_event, limit?: number) => {
    return await DatabaseService.getHomeNextPlayResources(limit)
  })

  ipcMain.handle('db:get-home-favorite-overview', async () => {
    return await DatabaseService.getHomeFavoriteOverview()
  })

  ipcMain.handle('db:get-home-cover-wall-data', async (_event, limit?: number) => {
    return await DatabaseService.getHomeCoverWallData(limit)
  })

  ipcMain.handle('db:get-recent-resource-logs', async (_event, page?: number, pageSize?: number) => {
    return await DatabaseService.getRecentResourceLogs(page, pageSize)
  })

  ipcMain.handle('db:get-author-by-category-id', async (_event, categoryId: string) => {
    return await DatabaseService.getAuthorByCategoryId(categoryId)
  })

  ipcMain.handle('db:get-actor-by-category-id', async (_event, categoryId: string) => {
    return await DatabaseService.getActorByCategoryId(categoryId)
  })

  ipcMain.handle('db:get-album-by-category-id', async (_event, categoryId: string) => {
    return await DatabaseService.getAlbumByCategoryId(categoryId)
  })

  ipcMain.handle('db:get-engine-by-category-id', async (_event, categoryId: string) => {
    return await DatabaseService.getEngineByCategoryId(categoryId)
  })

  ipcMain.handle('db:get-missing-resource-count-by-category-id', async (_event, categoryId: string) => {
    return await DatabaseService.getMissingResourceCountByCategoryId(categoryId)
  })

  ipcMain.handle('db:get-favorite-resource-count-by-category-id', async (_event, categoryId: string) => {
    return await DatabaseService.getFavoriteResourceCountByCategoryId(categoryId)
  })

  ipcMain.handle('db:get-completed-resource-count-by-category-id', async (_event, categoryId: string) => {
    return await DatabaseService.getCompletedResourceCountByCategoryId(categoryId)
  })

  ipcMain.handle('db:get-running-resource-count-by-category-id', async (_event, categoryId: string) => {
    return await DatabaseService.getRunningResourceCountByCategoryId(categoryId)
  })
}

function registerTag() {
  ipcMain.handle(('db:get-tag-by-category-id'), async (_event, categoryId: string) => {
    return await DatabaseService.getTagByCategoryId(categoryId)
  })
}

function registerType() {
  ipcMain.handle('db:get-type-by-category-id', async (_event, categoryId: string) => {
    return await DatabaseService.getTypeByCategoryId(categoryId)
  })
}

function registerDict() {
  ipcMain.handle('db:get-select-dict-data', async (_event, dictType: string) => {
    return await DatabaseService.getSelectDictData(dictType)
  })
}

function registerDialog() {
  ipcMain.handle('dialog:select-folder', async () => {
    return DialogService.selectFolder();
  })

  ipcMain.handle('dialog:select-folders', async () => {
    return DialogService.selectFolders();
  })

  ipcMain.handle('dialog:select-file', async (_event, extensions: string[]) => {
    return DialogService.selectFile(extensions);
  })

  ipcMain.handle('dialog:select-files', async (_event, extensions: string[]) => {
    return DialogService.selectFiles(extensions);
  })

  ipcMain.handle('dialog:select-game-launch-file', async (_event, directoryPath: string) => {
    return DialogService.selectGameLaunchFile(directoryPath);
  })

  ipcMain.handle('dialog:read-image-as-data-url', async (_event, filePath: string) => {
    return DialogService.readImageAsDataUrl(filePath);
  })

  ipcMain.handle(
    'dialog:get-image-preview-url',
    async (
      _event,
      filePath: string,
      options?: { maxWidth?: number; maxHeight?: number; fit?: 'inside' | 'cover'; quality?: number }
    ) => {
      return DialogService.getImagePreviewUrl(filePath, options);
    }
  )

  ipcMain.handle('dialog:get-image-file-url', async (_event, filePath: string) => {
    return DialogService.getImageFileUrl(filePath);
  })

  ipcMain.handle('dialog:get-file-url', async (_event, filePath: string) => {
    return DialogService.getFileUrl(filePath);
  })

  ipcMain.handle('dialog:get-audio-playback-url', async (_event, filePath: string) => {
    return DialogService.getAudioPlaybackUrl(filePath);
  })

  ipcMain.handle('dialog:get-video-playback-url', async (_event, filePath: string, startTime?: number) => {
    return DialogService.getVideoPlaybackUrl(filePath, startTime);
  })

  ipcMain.handle('dialog:read-text-file', async (_event, filePath: string, encoding?: string) => {
    return DialogService.readTextFile(filePath, encoding);
  })

  ipcMain.handle('dialog:get-text-file-info', async (_event, filePath: string) => {
    return DialogService.getTextFileInfo(filePath);
  })

  ipcMain.handle('dialog:read-text-file-chunk', async (_event, filePath: string, options?: any) => {
    return DialogService.readTextFileChunk(filePath, options);
  })

  ipcMain.handle('dialog:read-binary-file', async (_event, filePath: string) => {
    return DialogService.readBinaryFile(filePath);
  })

  ipcMain.handle('dialog:get-file-icon-as-data-url', async (_event, filePath: string, fileName?: string) => {
    return DialogService.getFileIconAsDataUrl(filePath, fileName);
  })

  ipcMain.handle('dialog:get-available-script-runtimes', async () => {
    return DialogService.getAvailableScriptRuntimes();
  })

  ipcMain.handle('dialog:open-path', async (_event, filePath: string, fileName?: string) => {
    return DialogService.openPath(filePath, fileName);
  })

  ipcMain.handle('dialog:open-external-url', async (_event, url: string) => {
    return DialogService.openExternalUrl(url);
  })

  ipcMain.handle('dialog:copy-image-to-clipboard', async (_event, filePath: string) => {
    return DialogService.copyImageToClipboard(filePath);
  })

  ipcMain.handle('dialog:copy-text-to-clipboard', async (_event, text: string) => {
    return DialogService.copyTextToClipboard(text);
  })

  ipcMain.handle('dialog:open-screenshot-folder', async (_event, resourceId: string) => {
    return DialogService.openScreenshotFolder(resourceId);
  })

  ipcMain.handle('dialog:get-screenshot-images', async (_event, resourceId: string) => {
    return DialogService.getScreenshotImages(resourceId);
  })

  ipcMain.handle('dialog:save-video-frame-screenshot', async (_event, resourceId: string, dataUrl: string, currentTime?: number) => {
    return DialogService.saveVideoFrameScreenshot(resourceId, dataUrl, currentTime);
  })

  ipcMain.handle('dialog:get-directory-images', async (_event, directoryPath: string) => {
    return DialogService.getDirectoryImages(directoryPath);
  })

  ipcMain.handle('dialog:get-directory-audio-tree', async (_event, directoryPath: string) => {
    return DialogService.getDirectoryAudioTree(directoryPath);
  })

  ipcMain.handle('dialog:select-screenshot-image', async (_event, resourceId: string) => {
    return DialogService.selectScreenshotImage(resourceId);
  })

  ipcMain.handle('dialog:delete-image', async (_event, filePath: string) => {
    return DialogService.deleteImage(filePath);
  })
}

function registerService() {
  ipcMain.handle('service:save-resource', async (_event, resourceForm: ResourceForm) => {
    return ResourceService.saveResource(resourceForm)
  })

  ipcMain.handle('service:get-resource-detail', async (_event, resourceId: string) => {
    return ResourceService.getResourceDetail(resourceId)
  })

  ipcMain.handle('service:update-resource', async (_event, resourceId: string, resourceForm: ResourceForm, options?: { silent?: boolean }) => {
    return ResourceService.updateResource(resourceId, resourceForm, options)
  })

  ipcMain.handle('service:check-resource-exists-by-path', async (_event, basePath: string) => {
    return ResourceService.checkResourceExistsByPath(basePath)
  })

  ipcMain.handle('service:analyze-game-path', async (_event, basePath: string) => {
    return ResourceService.analyzeGamePath(basePath)
  })

  ipcMain.handle('service:analyze-audio-file-path', async (_event, basePath: string) => {
    return ResourceService.analyzeAudioFilePath(basePath)
  })

  ipcMain.handle('service:analyze-novel-file-path', async (_event, basePath: string) => {
    return ResourceService.analyzeNovelFilePath(basePath)
  })

  ipcMain.handle('service:fetch-audio-album-cover', async (_event, payload: any) => {
    ipcLogger.info('service:fetch-audio-album-cover', {
      title: String(payload?.title ?? '').trim(),
      album: String(payload?.album ?? '').trim(),
      artist: String(payload?.artist ?? '').trim(),
      hasBasePath: Boolean(String(payload?.basePath ?? '').trim())
    })
    return ResourceService.fetchAudioAlbumCover(payload)
  })

  ipcMain.handle('service:fetch-audio-lyrics', async (_event, payload: any) => {
    ipcLogger.info('service:fetch-audio-lyrics', {
      title: String(payload?.title ?? '').trim(),
      album: String(payload?.album ?? '').trim(),
      artist: String(payload?.artist ?? '').trim(),
      hasBasePath: Boolean(String(payload?.basePath ?? '').trim())
    })
    return ResourceService.fetchAudioLyrics(payload)
  })

  ipcMain.handle('service:detect-game-engine', async (_event, basePath: string, resourceId?: string | null) => {
    return ResourceService.detectGameEngine(basePath, resourceId)
  })

  ipcMain.handle('service:detect-game-launch-file', async (_event, basePath: string) => {
    return ResourceService.detectGameLaunchFile(basePath)
  })

  ipcMain.handle('service:analyze-game-directory', async (_event, directoryPath: string, launchFilePath?: string | null) => {
    return ResourceService.analyzeGameDirectory(directoryPath, launchFilePath ?? undefined)
  })

  ipcMain.handle('service:analyze-multi-image-directory', async (_event, directoryPath: string) => {
    return ResourceService.analyzeMultiImageDirectory(directoryPath)
  })

  ipcMain.handle('service:analyze-asmr-directory', async (_event, directoryPath: string) => {
    return ResourceService.analyzeAsmrDirectory(directoryPath)
  })

  ipcMain.handle('service:import-batch-game-directories', async (_event, categoryId: string, items: any[]) => {
    return ResourceService.importBatchGameDirectories(categoryId, items)
  })

  ipcMain.handle('service:import-batch-multi-image-directories', async (_event, categoryId: string, items: any[]) => {
    return ResourceService.importBatchMultiImageDirectories(categoryId, items)
  })

  ipcMain.handle('service:import-batch-asmr-directories', async (_event, categoryId: string, items: any[]) => {
    return ResourceService.importBatchAsmrDirectories(categoryId, items)
  })

  ipcMain.handle('service:fetch-resource-info', async (_event, websiteId: string, resourceId: string) => {
    return ResourceService.fetchResourceInfo(websiteId, resourceId)
  })

  ipcMain.handle('service:fetch-website-info', async (_event, url: string) => {
    return ResourceService.fetchWebsiteInfo(url)
  })

  ipcMain.handle('service:capture-cover-screenshot', async (_event, basePath: string) => {
    return ResourceService.captureCoverScreenshot(basePath)
  })

  ipcMain.handle('service:extract-video-cover-frames', async (_event, basePath: string) => {
      return ResourceService.extractVideoCoverFrames(basePath)
    })

    ipcMain.handle('service:extract-video-sub-cover-frames', async (_event, basePath: string) => {
      return ResourceService.extractVideoSubCoverFrames(basePath)
    })

  ipcMain.handle('service:launch-resource', async (_event, resourceId: string, basePath: string, fileName?: string | null) => {
    return ResourceService.launchResource(resourceId, basePath, fileName)
  })

  ipcMain.handle('service:start-reading-resource', async (_event, resourceId: string) => {
    return ResourceService.startReadingResource(resourceId)
  })

  ipcMain.handle('service:record-resource-access', async (_event, resourceId: string, launchMode?: string) => {
    return ResourceService.recordResourceAccess(resourceId, launchMode as any)
  })

  ipcMain.handle('service:get-multi-image-reading-progress', async (_event, resourceId: string) => {
    return ResourceService.getMultiImageReadingProgress(resourceId)
  })

  ipcMain.handle('service:update-multi-image-reading-progress', async (_event, resourceId: string, lastReadPage: number) => {
    return ResourceService.updateMultiImageReadingProgress(resourceId, lastReadPage)
  })

  ipcMain.handle('service:get-novel-reading-progress', async (_event, resourceId: string) => {
    return ResourceService.getNovelReadingProgress(resourceId)
  })

  ipcMain.handle('service:update-novel-reading-progress', async (_event, resourceId: string, lastReadPercent: number) => {
    return ResourceService.updateNovelReadingProgress(resourceId, lastReadPercent)
  })

  ipcMain.handle('service:update-asmr-playback-progress', async (_event, resourceId: string, lastPlayFile: string, lastPlayTime: number) => {
    return ResourceService.updateAsmrPlaybackProgress(resourceId, lastPlayFile, lastPlayTime)
  })

  ipcMain.handle('service:update-video-playback-progress', async (_event, resourceId: string, lastPlayFile: string, lastPlayTime: number) => {
    return ResourceService.updateVideoPlaybackProgress(resourceId, lastPlayFile, lastPlayTime)
  })

  ipcMain.handle('service:update-video-sub-items', async (_event, resourceId: string, items: any[]) => {
      return ResourceService.updateVideoSubItems(resourceId, items)
    })

  ipcMain.handle('service:start-asmr-playback', async (_event, resourceId: string) => {
    return ResourceService.startAsmrPlayback(resourceId)
  })

  ipcMain.handle('service:stop-asmr-playback', async (_event, resourceId: string) => {
    return ResourceService.stopAsmrPlayback(resourceId)
  })

  ipcMain.handle('service:start-video-playback', async (_event, resourceId: string) => {
    return ResourceService.startVideoPlayback(resourceId)
  })

  ipcMain.handle('service:stop-video-playback', async (_event, resourceId: string) => {
    return ResourceService.stopVideoPlayback(resourceId)
  })

  ipcMain.handle('service:launch-resource-as-admin', async (_event, resourceId: string, basePath: string, fileName?: string | null) => {
    return ResourceService.launchResourceAsAdmin(resourceId, basePath, fileName)
  })

  ipcMain.handle('service:launch-resource-with-mtool', async (_event, resourceId: string, basePath: string, fileName?: string | null) => {
    return ResourceService.launchResourceWithMtool(resourceId, basePath, fileName)
  })

  ipcMain.handle('service:launch-resource-with-locale-emulator', async (_event, resourceId: string, basePath: string, fileName?: string | null) => {
    return ResourceService.launchResourceWithLocaleEmulator(resourceId, basePath, fileName)
  })

  ipcMain.handle('service:stop-resource', async (_event, resourceId: string) => {
    return ResourceService.stopResource(resourceId)
  })

  ipcMain.handle('service:delete-resource', async (_event, resourceId: string) => {
    return ResourceService.deleteResource(resourceId)
  })

  ipcMain.handle('service:delete-resource-with-files', async (_event, resourceId: string) => {
    return ResourceService.deleteResourceWithFiles(resourceId)
  })

  ipcMain.handle('service:delete-resources', async (_event, resourceIds: string[]) => {
    return ResourceService.deleteResources(resourceIds)
  })

  ipcMain.handle(
    'service:batch-update-resource-labels',
    async (_event, resourceIds: string[], field: 'tags' | 'types', mode: 'add' | 'remove', values: string[]) => {
      return ResourceService.batchUpdateResourceLabels(resourceIds, field, mode, values)
    }
  )

  ipcMain.handle('service:update-resource-rating', async (_event, resourceId: string, rating: number) => {
    return ResourceService.updateResourceRating(resourceId, rating)
  })

  ipcMain.handle('service:update-resource-favorite', async (_event, resourceId: string, favorite: boolean) => {
    return ResourceService.updateResourceFavorite(resourceId, favorite)
  })

  ipcMain.handle('service:update-resource-completed', async (_event, resourceId: string, completed: boolean) => {
    return ResourceService.updateResourceCompleted(resourceId, completed)
  })

  ipcMain.handle('service:start-notification-push', async (event) => {
    NotificationQueueService.getInstance().registerRenderer(event.sender)
    return true
  })
}
