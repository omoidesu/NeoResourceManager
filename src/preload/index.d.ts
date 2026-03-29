import { ElectronAPI } from '@electron-toolkit/preload'
import {SettingDetail} from "../common/constants";
import {settings, category} from "../main/db/schema";
import { ResourceForm } from '../main/model/models'
import type { AppNotificationMessage, ResourceStateChangedMessage } from '../main/service/notification-queue.service'

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
        selectGameLaunchFile: (directoryPath: string) => Promise<string | null>,
        readImageAsDataUrl: (filePath: string) => Promise<string | null>,
        getFileIconAsDataUrl: (filePath: string, fileName?: string) => Promise<string | null>,
        openPath: (filePath: string, fileName?: string) => Promise<string>,
        openExternalUrl: (url: string) => Promise<string>,
        copyImageToClipboard: (filePath: string) => Promise<string>,
        openScreenshotFolder: (resourceId: string) => Promise<string>,
        getScreenshotImages: (resourceId: string) => Promise<string[]>,
        selectScreenshotImage: (resourceId: string) => Promise<string | null>,
        deleteImage: (filePath: string) => Promise<string>,
      },

      service: {
        saveResource: (resourceForm: ResourceForm) => Promise<any>,
        getResourceDetail: (resourceId: string) => Promise<any>,
        updateResource: (resourceId: string, resourceForm: ResourceForm) => Promise<any>,
        checkResourceExistsByPath: (basePath: string) => Promise<any>,
        analyzeGamePath: (basePath: string) => Promise<any>,
        detectGameEngine: (basePath: string) => Promise<any>,
        detectGameLaunchFile: (basePath: string) => Promise<any>,
        analyzeGameDirectory: (directoryPath: string, launchFilePath?: string | null) => Promise<any>,
        importBatchGameDirectories: (categoryId: string, items: any[]) => Promise<any>,
        fetchResourceInfo: (websiteId: string, resourceId: string) => Promise<any>,
        captureCoverScreenshot: (basePath: string) => Promise<any>,
        launchResource: (resourceId: string, basePath: string, fileName?: string | null) => Promise<any>,
        stopResource: (resourceId: string) => Promise<any>,
        deleteResource: (resourceId: string) => Promise<any>,
        updateResourceRating: (resourceId: string, rating: number) => Promise<any>,
        updateResourceFavorite: (resourceId: string, favorite: boolean) => Promise<any>,
        updateResourceCompleted: (resourceId: string, completed: boolean) => Promise<any>,
        startNotificationPush: () => Promise<boolean>,
        onNotificationPush: (listener: (message: AppNotificationMessage) => void) => () => void,
        onResourceStateChanged: (listener: (message: ResourceStateChangedMessage) => void) => () => void,
      }
    }
  }
}
