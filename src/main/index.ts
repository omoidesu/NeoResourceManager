import { app, shell, BrowserWindow, dialog, ipcMain, screen, protocol } from 'electron'
import type { MessageBoxOptions } from 'electron'
import { join, normalize } from 'path'
import fs from 'fs'
import { execFile, spawn } from 'child_process'
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.jpg?asset'
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

type WindowState = {
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  isMaximized: boolean
}

let isShuttingDown = false
let isQuitApproved = false
let isQuitCheckInProgress = false
const logger = createLogger('main')
const LOCAL_FILE_PROTOCOL = 'neo-resource-file'
const AUDIO_TRANSCODE_PROTOCOL = 'neo-resource-audio'
const VIDEO_TRANSCODE_PROTOCOL = 'neo-resource-video'
const ffmpegPath = require('ffmpeg-static') as string | null
const DEFAULT_MAIN_WINDOW_BOUNDS = {
  width: 1024,
  height: 768
}
const MAIN_WINDOW_MIN_BOUNDS = {
  width: 1024,
  height: 768
}

function getWindowStateFilePath() {
  return join(app.getPath('userData'), 'main-window-state.json')
}

function readWindowState(): WindowState | null {
  try {
    const filePath = getWindowStateFilePath()

    if (!fs.existsSync(filePath)) {
      return null
    }

    const state = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<WindowState>
    const bounds = state?.bounds

    if (
      !bounds
      || !Number.isFinite(bounds.x)
      || !Number.isFinite(bounds.y)
      || !Number.isFinite(bounds.width)
      || !Number.isFinite(bounds.height)
    ) {
      logger.warn('window state file is invalid, ignoring saved state', { filePath, state })
      return null
    }

    return {
      bounds: {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.max(MAIN_WINDOW_MIN_BOUNDS.width, Math.round(bounds.width)),
        height: Math.max(MAIN_WINDOW_MIN_BOUNDS.height, Math.round(bounds.height))
      },
      isMaximized: Boolean(state.isMaximized)
    }
  } catch (error) {
    logger.error('failed to read saved window state', error)
    return null
  }
}

function writeWindowState(state: WindowState) {
  try {
    fs.writeFileSync(getWindowStateFilePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    logger.error('failed to persist window state', error)
  }
}

function getCurrentWindowState(window: BrowserWindow): WindowState {
  const bounds = window.getNormalBounds()

  return {
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    },
    isMaximized: window.isMaximized()
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_FILE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    }
  },
  {
    scheme: AUDIO_TRANSCODE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    }
  },
  {
    scheme: VIDEO_TRANSCODE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    }
  }
])

function decodeBase64Url(input: string) {
  const normalized = String(input ?? '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64').toString('utf8')
}

function registerLocalFileProtocol() {
  const registered = protocol.registerFileProtocol(LOCAL_FILE_PROTOCOL, (request, callback) => {
    try {
      const requestUrl = new URL(request.url)
      const encodedPath = requestUrl.pathname.replace(/^\/+/, '')
      const filePath = normalize(decodeBase64Url(encodedPath))

      if (!filePath || !fs.existsSync(filePath)) {
        callback({ error: -6 })
        return
      }

      callback({ path: filePath })
    } catch (error) {
      logger.error('failed to resolve local file protocol request', error)
      callback({ error: -2 })
    }
  })

  if (!registered) {
    logger.error('failed to register local file protocol')
  }
}

function registerAudioTranscodeProtocol() {
  const registered = protocol.registerStreamProtocol(AUDIO_TRANSCODE_PROTOCOL, (request, callback) => {
    try {
      const requestUrl = new URL(request.url)
      const encodedPath = requestUrl.pathname.replace(/^\/+/, '')
      const filePath = normalize(decodeBase64Url(encodedPath))
      const resolvedFfmpegPath = String(ffmpegPath ?? '').trim()

      if (!filePath || !fs.existsSync(filePath) || !resolvedFfmpegPath || !fs.existsSync(resolvedFfmpegPath)) {
        callback({ error: -6 })
        return
      }

      const child = spawn(
        resolvedFfmpegPath,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          filePath,
          '-vn',
          '-map_metadata',
          '0',
          '-acodec',
          'pcm_s16le',
          '-ar',
          '44100',
          '-ac',
          '2',
          '-f',
          'wav',
          'pipe:1'
        ],
        {
          detached: false,
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true
        }
      )

      child.stdout.on('close', () => {
        if (!child.killed) {
          child.kill('SIGTERM')
        }
      })

      child.on('error', (error) => {
        logger.error('failed to start audio transcode stream', error)
      })

      callback({
        statusCode: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Cache-Control': 'no-store'
        },
        data: child.stdout
      })
    } catch (error) {
      logger.error('failed to resolve audio transcode protocol request', error)
      callback({ error: -2 })
    }
  })

  if (!registered) {
    logger.error('failed to register audio transcode protocol')
  }
}

function registerVideoTranscodeProtocol() {
  const registered = protocol.registerStreamProtocol(VIDEO_TRANSCODE_PROTOCOL, (request, callback) => {
    try {
      const requestUrl = new URL(request.url)
      const encodedPath = requestUrl.pathname.replace(/^\/+/, '')
      const filePath = normalize(decodeBase64Url(encodedPath))
      const resolvedFfmpegPath = String(ffmpegPath ?? '').trim()
      const requestedStartTime = Math.max(0, Number(requestUrl.searchParams.get('start') ?? 0) || 0)

      if (!filePath || !fs.existsSync(filePath) || !resolvedFfmpegPath || !fs.existsSync(resolvedFfmpegPath)) {
        callback({ error: -6 })
        return
      }

      const ffmpegArgs = [
        '-hide_banner',
        '-loglevel',
        'error',
      ]

      if (requestedStartTime > 0) {
        ffmpegArgs.push('-ss', String(requestedStartTime))
      }

      ffmpegArgs.push(
        '-i',
        filePath,
        '-map_metadata',
        '0',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        '-f',
        'mp4',
        'pipe:1'
      )

      const child = spawn(
        resolvedFfmpegPath,
        ffmpegArgs,
        {
          detached: false,
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true
        }
      )

      child.stdout.on('close', () => {
        if (!child.killed) {
          child.kill('SIGTERM')
        }
      })

      child.on('error', (error) => {
        logger.error('failed to start video transcode stream', error)
      })

      callback({
        statusCode: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Cache-Control': 'no-store'
        },
        data: child.stdout
      })
    } catch (error) {
      logger.error('failed to resolve video transcode protocol request', error)
      callback({ error: -2 })
    }
  })

  if (!registered) {
    logger.error('failed to register video transcode protocol')
  }
}

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

  const bounds = window.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const workArea = display.workArea

  const outsideHorizontal = bounds.x + 80 < workArea.x || bounds.x > workArea.x + workArea.width - 80
  const outsideVertical = bounds.y + 80 < workArea.y || bounds.y > workArea.y + workArea.height - 80

  if (!outsideHorizontal && !outsideVertical) {
    return
  }

  const width = Math.min(Math.max(bounds.width, MAIN_WINDOW_MIN_BOUNDS.width), workArea.width)
  const height = Math.min(Math.max(bounds.height, MAIN_WINDOW_MIN_BOUNDS.height), workArea.height)
  const x = Math.min(Math.max(bounds.x, workArea.x), workArea.x + Math.max(0, workArea.width - 80))
  const y = Math.min(Math.max(bounds.y, workArea.y), workArea.y + Math.max(0, workArea.height - 80))

  logger.warn('main window bounds outside visible area, correcting placement', {
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

function buildMainWindowOptions(savedState: WindowState | null) {
  return {
    ...(savedState ? { x: savedState.bounds.x, y: savedState.bounds.y } : {}),
    width: savedState?.bounds.width ?? DEFAULT_MAIN_WINDOW_BOUNDS.width,
    height: savedState?.bounds.height ?? DEFAULT_MAIN_WINDOW_BOUNDS.height,
    minWidth: MAIN_WINDOW_MIN_BOUNDS.width,
    minHeight: MAIN_WINDOW_MIN_BOUNDS.height,
    useContentSize: true,
    show: true,
    backgroundColor: '#1a1a1a',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  }
}

function createWindow(): void {
  const savedWindowState = readWindowState()

  // Create the browser window.
  const mainWindow = new BrowserWindow(buildMainWindowOptions(savedWindowState))

  logger.info('main window created', {
    bounds: mainWindow.getBounds(),
    savedWindowState,
    backgroundColor: '#1a1a1a',
    isDev: is.dev,
    rendererUrl: process.env['ELECTRON_RENDERER_URL'] ?? '',
    preloadPath: join(__dirname, '../preload/index.js')
  })

  let persistWindowStateTimer: NodeJS.Timeout | null = null

  const schedulePersistWindowState = () => {
    if (mainWindow.isDestroyed()) {
      return
    }

    if (persistWindowStateTimer) {
      clearTimeout(persistWindowStateTimer)
    }

    persistWindowStateTimer = setTimeout(() => {
      persistWindowStateTimer = null
      writeWindowState(getCurrentWindowState(mainWindow))
    }, 200)
  }

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
  mainWindow.on('move', schedulePersistWindowState)
  mainWindow.on('resize', schedulePersistWindowState)
  mainWindow.on('maximize', schedulePersistWindowState)
  mainWindow.on('unmaximize', schedulePersistWindowState)
  mainWindow.on('close', () => {
    if (persistWindowStateTimer) {
      clearTimeout(persistWindowStateTimer)
      persistWindowStateTimer = null
    }

    if (!mainWindow.isDestroyed()) {
      writeWindowState(getCurrentWindowState(mainWindow))
    }
  })
  mainWindow.on('show', () => {
    logger.info('main window show event', {
      visible: mainWindow.isVisible(),
      focused: mainWindow.isFocused(),
      bounds: mainWindow.getBounds()
    })
  })
  mainWindow.on('unresponsive', () => {
    logger.error('main window unresponsive', {
      url: mainWindow.webContents.getURL(),
      isLoading: mainWindow.webContents.isLoading(),
      readyState: mainWindow.webContents.isLoadingMainFrame()
    })
  })
  mainWindow.on('responsive', () => {
    logger.info('main window responsive again', {
      url: mainWindow.webContents.getURL()
    })
  })
  mainWindow.webContents.on('did-start-loading', () => {
    logger.info('renderer did-start-loading', {
      url: mainWindow.webContents.getURL()
    })
  })
  mainWindow.webContents.on('dom-ready', () => {
    logger.info('renderer dom-ready', {
      url: mainWindow.webContents.getURL(),
      title: mainWindow.webContents.getTitle()
    })
  })
  mainWindow.webContents.on('did-stop-loading', () => {
    logger.info('renderer did-stop-loading', {
      url: mainWindow.webContents.getURL(),
      title: mainWindow.webContents.getTitle()
    })
  })
  mainWindow.webContents.on('did-frame-finish-load', (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    logger.info('renderer did-frame-finish-load', {
      isMainFrame,
      frameProcessId,
      frameRoutingId,
      url: mainWindow.webContents.getURL()
    })
  })
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const payload = {
      level,
      message,
      line,
      sourceId,
      url: mainWindow.webContents.getURL()
    }

    if (level >= 2) {
      logger.error('renderer console-message', payload)
      return
    }

    if (level === 1) {
      logger.warn('renderer console-message', payload)
      return
    }

    logger.info('renderer console-message', payload)
  })
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger.error('renderer preload-error', {
      preloadPath,
      error: error?.message ?? String(error),
      stack: error?.stack ?? ''
    })
  })
  setTimeout(() => {
    if (!mainWindow.isDestroyed()) {
      logger.warn('forcing main window show after timeout')
      forceShowMainWindow('timeout-2000ms')
    }
  }, 2000)
  scheduleForceShow('timeout-3500ms', 3500)
  scheduleForceShow('timeout-5000ms', 5000)

  if (savedWindowState?.isMaximized) {
    mainWindow.maximize()
  }

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
    logger.info('loading renderer url', { target: process.env['ELECTRON_RENDERER_URL'] })
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    logger.info('loading renderer file', { target: join(__dirname, '../renderer/index.html') })
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  registerLocalFileProtocol()
  registerAudioTranscodeProtocol()
  registerVideoTranscodeProtocol()

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
  ipcMain.on('renderer:log', (_event, payload) => {
    const level = String((payload as any)?.level ?? 'info').trim()
    const message = String((payload as any)?.message ?? 'renderer log').trim() || 'renderer log'
    const meta = (payload as any)?.meta

    switch (level) {
      case 'error':
        logger.error(message, meta)
        return
      case 'warn':
        logger.warn(message, meta)
        return
      case 'debug':
        logger.debug(message, meta)
        return
      default:
        logger.info(message, meta)
    }
  })
  app.on('child-process-gone', (_event, details) => {
    logger.error('electron child-process-gone', details)
  })

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

process.on('uncaughtException', (error) => {
  logger.error('main process uncaughtException', {
    message: error?.message ?? String(error),
    stack: error?.stack ?? ''
  })
})

process.on('unhandledRejection', (reason) => {
  logger.error('main process unhandledRejection', {
    reason: reason instanceof Error
      ? {
          message: reason.message,
          stack: reason.stack ?? ''
        }
      : String(reason)
  })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

registerIpcHandlers()
