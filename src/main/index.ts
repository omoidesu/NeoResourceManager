import { app, shell, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import type { MessageBoxOptions } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import registerIpcHandlers from "./service/ipcHandle";
import {migrateDb} from './db'
import {seedDatabase} from './db/seed';
import {ResourceWatcher} from "./watcher/resource.watcher";
import { NotificationQueueService } from './service/notification-queue.service';
import { createLogger } from './util/logger';
import { ResourceRuntimeMonitorService } from './service/resource-runtime-monitor.service';
import { FetchPluginService } from './service/fetch-plugin.service';
import { WindowScreenshotService } from './service/window-screenshot.service';
import { DatabaseService } from './service/database.service';

let isShuttingDown = false
let isQuitApproved = false
let isQuitCheckInProgress = false
const logger = createLogger('main')

function prepareChromiumStoragePaths() {
  const userDataPath = app.getPath('userData')
  const sessionDataPath = join(userDataPath, 'sessionData')
  const diskCachePath = join(sessionDataPath, 'Cache')
  const gpuCachePath = join(sessionDataPath, 'GPUCache')

  ;[userDataPath, sessionDataPath, diskCachePath, gpuCachePath].forEach((targetPath) => {
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true })
    }
  })

  app.setPath('sessionData', sessionDataPath)
  app.commandLine.appendSwitch('disk-cache-dir', diskCachePath)
}

prepareChromiumStoragePaths()

function logActiveRuntimeState(stage: string) {
  const runtimeProcess = process as NodeJS.Process & {
    _getActiveHandles?: () => unknown[]
    _getActiveRequests?: () => unknown[]
  }
  const activeHandles = (runtimeProcess._getActiveHandles?.() ?? [])
    .map((handle) => (handle as { constructor?: { name?: string } })?.constructor?.name ?? typeof handle)
  const activeRequests = (runtimeProcess._getActiveRequests?.() ?? [])
    .map((request) => (request as { constructor?: { name?: string } })?.constructor?.name ?? typeof request)
  const windows = BrowserWindow.getAllWindows().map((window) => ({
    id: window.id,
    destroyed: window.isDestroyed(),
    visible: window.isVisible(),
  }))

  logger.debug(`runtime state: ${stage}`, {
    activeHandles,
    activeRequests,
    windows,
  })
}

async function shutdownApp(reason: string) {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  logger.info(`shutting down: ${reason}`)

  try {
    await ResourceWatcher.getInstance().stop()
    logger.info('resource watcher stopped')
  } catch (error) {
    logger.error('failed to stop resource watcher', error)
  }

  try {
    NotificationQueueService.getInstance().dispose()
    logger.info('notification queue disposed')
  } catch (error) {
    logger.error('failed to dispose notification queue', error)
  }

  try {
    ResourceRuntimeMonitorService.getInstance().dispose()
    logger.info('resource runtime monitor disposed')
  } catch (error) {
    logger.error('failed to dispose resource runtime monitor', error)
  }

  try {
    FetchPluginService.getInstance().dispose()
    logger.info('fetch plugin service disposed')
  } catch (error) {
    logger.error('failed to dispose fetch plugin service', error)
  }

  try {
    WindowScreenshotService.dispose()
    logger.info('window screenshot service disposed')
  } catch (error) {
    logger.error('failed to dispose window screenshot service', error)
  }

  logActiveRuntimeState(`after cleanup (${reason})`)
}

async function requestAppQuit(reason: string, window?: BrowserWindow | null) {
  if (isQuitApproved || isShuttingDown || isQuitCheckInProgress) {
    return
  }

  isQuitCheckInProgress = true

  try {
    const runningSummary = await DatabaseService.getRunningResourceSummary()
    if (runningSummary.count > 0) {
      const titlesPreview = runningSummary.titles.slice(0, 5)
      const extraCount = Math.max(0, runningSummary.count - titlesPreview.length)
      const detailLines = titlesPreview.length
        ? [
            '仍在运行的资源：',
            ...titlesPreview.map((title) => `- ${title}`),
            ...(extraCount > 0 ? [`- 以及另外 ${extraCount} 个资源`] : [])
          ]
        : [`当前仍有 ${runningSummary.count} 个资源正在运行。`]

      const messageBoxOptions: MessageBoxOptions = {
        type: 'warning',
        title: '无法退出',
        message: '当前有正在运行的游戏或软件，请先关闭后再退出程序。',
        detail: detailLines.join('\n'),
        buttons: ['知道了'],
        defaultId: 0,
        noLink: true,
      }
      const targetWindow = window ?? BrowserWindow.getFocusedWindow() ?? null

      if (targetWindow) {
        await dialog.showMessageBox(targetWindow, messageBoxOptions)
      } else {
        await dialog.showMessageBox(messageBoxOptions)
      }
      return
    }

    isQuitApproved = true
    await shutdownApp(reason)
    app.quit()
  } catch (error) {
    logger.error('failed to check running resources before quit', error)
  } finally {
    isQuitCheckInProgress = false
  }
}

function destroyAllWindows() {
  const windows = BrowserWindow.getAllWindows()
  logger.info('destroying windows', { count: windows.length })

  windows.forEach((window) => {
    try {
      if (!window.isDestroyed()) {
        window.destroy()
      }
    } catch (error) {
      logger.error('failed to destroy window', error)
    }
  })
}

function ensureMainWindowVisible(window: BrowserWindow) {
  if (window.isDestroyed() || window.isFullScreen() || window.isMaximized()) {
    return
  }

  const targetWidth = 1280
  const targetHeight = 768
  const bounds = window.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const workArea = display.workArea

  const widthTooSmall = bounds.width < 1024 || bounds.height < 768
  const outsideHorizontal = bounds.x + bounds.width < workArea.x || bounds.x > workArea.x + workArea.width
  const outsideVertical = bounds.y + bounds.height < workArea.y || bounds.y > workArea.y + workArea.height

  if (!widthTooSmall && !outsideHorizontal && !outsideVertical) {
    return
  }

  const width = Math.min(targetWidth, workArea.width)
  const height = Math.min(targetHeight, workArea.height)
  const x = workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2))
  const y = workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2))

  logger.warn('main window bounds invalid, resetting window placement', {
    bounds,
    workArea,
    nextBounds: { x, y, width, height }
  })

  window.setBounds({ x, y, width, height })
}

function getWindowHandleValue(window: BrowserWindow) {
  const handleBuffer = window.getNativeWindowHandle()

  if (typeof handleBuffer.readBigUInt64LE === 'function' && handleBuffer.length >= 8) {
    return handleBuffer.readBigUInt64LE(0).toString()
  }

  return handleBuffer.readUInt32LE(0).toString()
}

function forceNativeWindowShow(window: BrowserWindow, reason: string) {
  if (process.platform !== 'win32' || window.isDestroyed()) {
    return
  }

  if (window.isFullScreen()) {
    logger.info('skip native window show while fullscreen', { reason })
    return
  }

  const handleValue = getWindowHandleValue(window)
  const showCommand = window.isMaximized() ? 3 : 5
  const command = [
    'Add-Type @\'',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class WindowShowApi {',
    '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);',
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
    '}',
    '\'@;',
    `$hWnd = [IntPtr]::new(${handleValue});`,
    `[WindowShowApi]::ShowWindow($hWnd, ${showCommand}) | Out-Null;`,
    '[WindowShowApi]::SetForegroundWindow($hWnd) | Out-Null;'
  ].join('\n')

  execFile(
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    ['-NoProfile', '-Command', command],
    (error) => {
      if (error) {
        logger.error('failed to force native window show', { reason, error: error.message })
        return
      }

      logger.info('forced native window show', { reason, handleValue, showCommand })
    }
  )
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    useContentSize: true,
    show: true,
    backgroundColor: '#1a1a1a',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const forceShowMainWindow = (reason: string) => {
    if (mainWindow.isDestroyed()) {
      return
    }

    ensureMainWindowVisible(mainWindow)
    logger.info('showing main window', {
      reason,
      visibleBefore: mainWindow.isVisible(),
      minimizedBefore: mainWindow.isMinimized(),
      focusedBefore: mainWindow.isFocused(),
      bounds: mainWindow.getBounds(),
    })

    mainWindow.setSkipTaskbar(false)
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
    forceNativeWindowShow(mainWindow, reason)
  }

  const scheduleForceShow = (reason: string, delay: number) => {
    setTimeout(() => {
      forceShowMainWindow(reason)
    }, delay)
  }

  mainWindow.once('ready-to-show', () => forceShowMainWindow('ready-to-show'))
  mainWindow.webContents.once('did-finish-load', () => forceShowMainWindow('did-finish-load'))
  setTimeout(() => {
    if (!mainWindow.isDestroyed()) {
      logger.warn('forcing main window show after timeout')
      forceShowMainWindow('timeout-2000ms')
    }
  }, 2000)
  scheduleForceShow('timeout-3500ms', 3500)
  scheduleForceShow('timeout-5000ms', 5000)

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('renderer process gone', details)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('renderer failed to load', {
      errorCode,
      errorDescription,
      validatedURL,
    })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (event) => {
    if (isShuttingDown || isQuitApproved) {
      return
    }

    event.preventDefault()
    void requestAppQuit('window-close', mainWindow)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      const key = String(input.key ?? '').toUpperCase()
      const isF12 = input.type === 'keyDown' && key === 'F12'
      const isCtrlShiftI = input.type === 'keyDown' && input.control && input.shift && key === 'I'
      const isReload = input.type === 'keyDown' && input.control && key === 'R'

      if (isF12) {
        event.preventDefault()
        return
      }

      if (is.dev && isCtrlShiftI) {
        if (window.webContents.isDevToolsOpened()) {
          window.webContents.closeDevTools()
        } else {
          window.webContents.openDevTools({ mode: 'detach' })
        }
        event.preventDefault()
        return
      }

      if (!is.dev && isReload) {
        event.preventDefault()
      }
    })
  })

  // IPC test
  ipcMain.on('ping', () => logger.debug('pong'))

  await migrateDb()
  await seedDatabase()
  const recoveredLogCount = await DatabaseService.markActiveResourceLogsAsUnknownEnded()
  if (recoveredLogCount > 0) {
    logger.warn('recovered dangling active resource logs on startup', { count: recoveredLogCount })
  }
  createWindow()

  void (async () => {
    try {
      await FetchPluginService.getInstance().initialize()
      await WindowScreenshotService.initialize()
      await ResourceWatcher.getInstance().start()
      ResourceRuntimeMonitorService.getInstance().start()
      logger.info('background services initialized')
    } catch (error) {
      logger.error('failed to initialize background services', error)
    }
  })()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (event) => {
  if (!isQuitApproved && !isShuttingDown) {
    event.preventDefault()
    void requestAppQuit('before-quit')
    return
  }

  void shutdownApp('before-quit')
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

process.on('SIGINT', () => {
  void shutdownApp('SIGINT').finally(() => {
    destroyAllWindows()
    app.exit(0)
  })
})

process.on('SIGTERM', () => {
  void shutdownApp('SIGTERM').finally(() => {
    destroyAllWindows()
    app.exit(0)
  })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

registerIpcHandlers()
