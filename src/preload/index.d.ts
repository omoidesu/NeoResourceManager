import { ElectronAPI } from '@electron-toolkit/preload'
import {SettingDetail} from "../common/constants";
import {settings, category} from "../main/db/schema";
import { ResourceForm } from '../main/model/models'
import type { AppNotificationMessage, BatchImportProgressMessage, ResourceStateChangedMessage } from '../main/service/notification-queue.service'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: {
        getCategory: () => Promise<category[]>,
        getCategoryById: (id: string) => Promise<category>,
        getSetting: (setting: SettingDetail) => Promise<settings>,
        setSetting: (settingOption: SettingDetail, value: string) => Promise<any>,
        getResourceByCategoryId: (categoryId: string, query?: any) => Promise<any>,
        getAuthorByCategoryId: (categoryId: string) => Promise<any>,
        getAlbumByCategoryId: (categoryId: string) => Promise<any>,
        getEngineByCategoryId: (categoryId: string) => Promise<any>,
        getMissingResourceCountByCategoryId: (categoryId: string) => Promise<number>,
        getFavoriteResourceCountByCategoryId: (categoryId: string) => Promise<number>,
        getCompletedResourceCountByCategoryId: (categoryId: string) => Promise<number>,
        getRunningResourceCountByCategoryId: (categoryId: string) => Promise<number>,
        getTypeByCategoryId: (categoryId: string) => Promise<any>,
        getTagByCategoryId: (categoryId: string) => Promise<any>,
        getSelectDictData: (dictType: string) => Promise<any>,
      },

      dialog: {
        selectFolder: () => Promise<any>,
        selectFolders: () => Promise<string[]>,
        selectFile: (extensions: string[]) => Promise<any>,
        selectFiles: (extensions: string[]) => Promise<string[]>,
        selectGameLaunchFile: (directoryPath: string) => Promise<string | null>,
        readImageAsDataUrl: (filePath: string) => Promise<string | null>,
        getImagePreviewUrl: (
          filePath: string,
          options?: { maxWidth?: number; maxHeight?: number; fit?: 'inside' | 'cover'; quality?: number }
        ) => Promise<string | null>,
        getImageFileUrl: (filePath: string) => Promise<string | null>,
        getFileUrl: (filePath: string) => Promise<string | null>,
        readTextFile: (filePath: string) => Promise<string | null>,
        readBinaryFile: (filePath: string) => Promise<Uint8Array | null>,
        getFileIconAsDataUrl: (filePath: string, fileName?: string) => Promise<string | null>,
        getAvailableScriptRuntimes: () => Promise<Array<{ label: string; value: string; shellType: 'powershell' | 'cmd' }>>,
        openPath: (filePath: string, fileName?: string) => Promise<string>,
        openExternalUrl: (url: string) => Promise<string>,
        copyImageToClipboard: (filePath: string) => Promise<string>,
        openScreenshotFolder: (resourceId: string) => Promise<string>,
        getScreenshotImages: (resourceId: string) => Promise<string[]>,
        getDirectoryImages: (directoryPath: string) => Promise<string[]>,
        getDirectoryAudioTree: (directoryPath: string) => Promise<any[]>,
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
        fetchResourceInfo: (websiteId: string, resourceId: string) => Promise<any>,
        captureCoverScreenshot: (basePath: string) => Promise<any>,
        launchResource: (resourceId: string, basePath: string, fileName?: string | null) => Promise<any>,
        startReadingResource: (resourceId: string) => Promise<any>,
        getMultiImageReadingProgress: (resourceId: string) => Promise<any>,
        updateMultiImageReadingProgress: (resourceId: string, lastReadPage: number) => Promise<any>,
        getNovelReadingProgress: (resourceId: string) => Promise<any>,
        updateNovelReadingProgress: (resourceId: string, lastReadPercent: number) => Promise<any>,
        updateAsmrPlaybackProgress: (resourceId: string, lastPlayFile: string, lastPlayTime: number) => Promise<any>,
        startAsmrPlayback: (resourceId: string) => Promise<any>,
        stopAsmrPlayback: (resourceId: string) => Promise<any>,
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
        startNotificationPush: () => Promise<boolean>,
        onNotificationPush: (listener: (message: AppNotificationMessage) => void) => () => void,
        onResourceStateChanged: (listener: (message: ResourceStateChangedMessage) => void) => () => void,
        onBatchImportProgress: (listener: (message: BatchImportProgressMessage) => void) => () => void,
      }
    }
  }
}
