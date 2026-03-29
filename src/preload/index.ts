import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {SettingDetail} from "../common/constants";
import {ResourceForm} from "../main/model/models";
import type { AppNotificationMessage, ResourceStateChangedMessage } from '../main/service/notification-queue.service'

// Custom APIs for renderer
const api = {
  db: {
    getCategory: () => ipcRenderer.invoke('db:get-category'),
    getCategoryById: (id: string) => ipcRenderer.invoke('db:get-category-by-id', id),
    getCategoryByName: (name: string) => ipcRenderer.invoke('db:get-category-by-name', name),

    // setting
    getSetting: (setting: SettingDetail) => ipcRenderer.invoke('db:get-setting', setting),
    setSetting: (setting: SettingDetail, value: string) => ipcRenderer.invoke('db:set-setting', setting, value),

    // resource
    getResourceByCategoryId: (categoryId: string, query?: any) => ipcRenderer.invoke('db:get-resource-by-category-id', categoryId, query),
    getAuthorByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-author-by-category-id', categoryId),
    getEngineByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-engine-by-category-id', categoryId),
    getMissingResourceCountByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-missing-resource-count-by-category-id', categoryId),
    getFavoriteResourceCountByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-favorite-resource-count-by-category-id', categoryId),
    getCompletedResourceCountByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-completed-resource-count-by-category-id', categoryId),
    getRunningResourceCountByCategoryId: (categoryId: string) => ipcRenderer.invoke('db:get-running-resource-count-by-category-id', categoryId),

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
    selectGameLaunchFile: (directoryPath: string) => ipcRenderer.invoke('dialog:select-game-launch-file', directoryPath),
    readImageAsDataUrl: (filePath: string) => ipcRenderer.invoke('dialog:read-image-as-data-url', filePath),
    getFileIconAsDataUrl: (filePath: string, fileName?: string) => ipcRenderer.invoke('dialog:get-file-icon-as-data-url', filePath, fileName),
    openPath: (filePath: string, fileName?: string) => ipcRenderer.invoke('dialog:open-path', filePath, fileName),
    openExternalUrl: (url: string) => ipcRenderer.invoke('dialog:open-external-url', url),
    copyImageToClipboard: (filePath: string) => ipcRenderer.invoke('dialog:copy-image-to-clipboard', filePath),
    openScreenshotFolder: (resourceId: string) => ipcRenderer.invoke('dialog:open-screenshot-folder', resourceId),
    getScreenshotImages: (resourceId: string) => ipcRenderer.invoke('dialog:get-screenshot-images', resourceId),
    selectScreenshotImage: (resourceId: string) => ipcRenderer.invoke('dialog:select-screenshot-image', resourceId),
    deleteImage: (filePath: string) => ipcRenderer.invoke('dialog:delete-image', filePath),
  },

  service: {
    saveResource: (resourceForm: ResourceForm) => ipcRenderer.invoke('service:save-resource', resourceForm),
    getResourceDetail: (resourceId: string) => ipcRenderer.invoke('service:get-resource-detail', resourceId),
    updateResource: (resourceId: string, resourceForm: ResourceForm) =>
      ipcRenderer.invoke('service:update-resource', resourceId, resourceForm),
    checkResourceExistsByPath: (basePath: string) => ipcRenderer.invoke('service:check-resource-exists-by-path', basePath),
    analyzeGamePath: (basePath: string) => ipcRenderer.invoke('service:analyze-game-path', basePath),
    detectGameEngine: (basePath: string) => ipcRenderer.invoke('service:detect-game-engine', basePath),
    detectGameLaunchFile: (basePath: string) => ipcRenderer.invoke('service:detect-game-launch-file', basePath),
    analyzeGameDirectory: (directoryPath: string, launchFilePath?: string | null) =>
      ipcRenderer.invoke('service:analyze-game-directory', directoryPath, launchFilePath),
    importBatchGameDirectories: (categoryId: string, items: any[]) =>
      ipcRenderer.invoke('service:import-batch-game-directories', categoryId, items),
    fetchResourceInfo: (websiteId: string, resourceId: string) =>
      ipcRenderer.invoke('service:fetch-resource-info', websiteId, resourceId),
    captureCoverScreenshot: (basePath: string) =>
      ipcRenderer.invoke('service:capture-cover-screenshot', basePath),
    launchResource: (resourceId: string, basePath: string, fileName?: string | null) =>
      ipcRenderer.invoke('service:launch-resource', resourceId, basePath, fileName),
    stopResource: (resourceId: string) => ipcRenderer.invoke('service:stop-resource', resourceId),
    deleteResource: (resourceId: string) => ipcRenderer.invoke('service:delete-resource', resourceId),
    updateResourceRating: (resourceId: string, rating: number) =>
      ipcRenderer.invoke('service:update-resource-rating', resourceId, rating),
    updateResourceFavorite: (resourceId: string, favorite: boolean) =>
      ipcRenderer.invoke('service:update-resource-favorite', resourceId, favorite),
    updateResourceCompleted: (resourceId: string, completed: boolean) =>
      ipcRenderer.invoke('service:update-resource-completed', resourceId, completed),
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
