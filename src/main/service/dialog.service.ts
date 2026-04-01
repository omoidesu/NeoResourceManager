import { app, clipboard, dialog, nativeImage, shell } from 'electron'
import {readFile} from 'fs/promises'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { DatabaseService } from './database.service'
import { Settings } from '../../common/constants'

export class DialogService {
  private static readonly IMAGE_FILE_MACHINE_AMD64 = 0x8664

  static async selectFolder() {
    const result = await dialog.showOpenDialog({
      title: '请选择目录',
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  }

  static async selectFolders() {
    const result = await dialog.showOpenDialog({
      title: '请选择目录',
      properties: ['openDirectory', 'multiSelections']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return []
    }

    return result.filePaths
  }

  static async selectFile(extensions: string[] = []) {
    const result = await dialog.showOpenDialog({
      title: '请选择文件',
      filters: extensions ? [{ name: '文件', extensions }] : [],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  }

  static async selectGameLaunchFile(directoryPath: string) {
    const result = await dialog.showOpenDialog({
      title: '请选择启动文件',
      defaultPath: directoryPath,
      filters: [
        { name: '启动文件', extensions: ['exe', 'bat', 'swf', 'html', 'htm'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  }

  static async readImageAsDataUrl(filePath: string) {
    const extension = path.extname(filePath).toLowerCase()
    const mimeTypeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml'
    }

    const mimeType = mimeTypeMap[extension]
    if (!mimeType) {
      return null
    }

    const buffer = await readFile(filePath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  }

  static async getFileIconAsDataUrl(filePath: string, fileName?: string) {
    const targetPath = fileName ? path.join(filePath, fileName) : filePath

    if (!targetPath) {
      return null
    }

    try {
      const icon = await app.getFileIcon(targetPath, { size: 'normal' })
      if (icon.isEmpty()) {
        return null
      }

      return icon.toDataURL()
    } catch {
      return null
    }
  }

  static async openPath(filePath: string, fileName?: string) {
    const targetPath = fileName ? path.join(filePath, fileName) : filePath

    if (!targetPath) {
      return '路径不能为空'
    }

    return shell.openPath(targetPath)
  }

  static async openExternalUrl(url: string) {
    const targetUrl = String(url ?? '').trim()
    if (!targetUrl) {
      return '网址不能为空'
    }

    await shell.openExternal(targetUrl)
    return ''
  }

  static async copyImageToClipboard(filePath: string) {
    const targetPath = String(filePath ?? '').trim()
    if (!targetPath) {
      return '图片路径不能为空'
    }

    if (!fs.existsSync(targetPath)) {
      return `图片不存在: ${targetPath}`
    }

    const image = nativeImage.createFromPath(targetPath)
    if (image.isEmpty()) {
      return '无法读取图片'
    }

    clipboard.writeImage(image)
    return ''
  }

  static async openScreenshotFolder(resourceId: string) {
    const screenshotFolder = await this.ensureScreenshotFolder(resourceId)
    if (!screenshotFolder) {
      return '未配置截图缓存目录'
    }

    return shell.openPath(screenshotFolder)
  }

  static async getScreenshotImages(resourceId: string) {
    const screenshotFolder = await this.ensureScreenshotFolder(resourceId)
    if (!screenshotFolder) {
      return []
    }

    const entries = fs.readdirSync(screenshotFolder, { withFileTypes: true })
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(screenshotFolder, entry.name))
      .filter((filePath) => imageExtensions.has(path.extname(filePath).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }

  static async selectScreenshotImage(resourceId: string) {
    const screenshotFolder = await this.ensureScreenshotFolder(resourceId)
    if (!screenshotFolder) {
      return null
    }

    const result = await dialog.showOpenDialog({
      title: '请选择截图作为封面',
      defaultPath: screenshotFolder,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  }

  static async deleteImage(filePath: string) {
    const targetPath = String(filePath ?? '').trim()
    if (!targetPath) {
      return '图片路径不能为空'
    }

    if (!fs.existsSync(targetPath)) {
      return '图片不存在'
    }

    fs.unlinkSync(targetPath)
    return ''
  }

  static async launchPath(filePath: string, fileName?: string) {
    const targetPath = fileName ? path.join(filePath, fileName) : filePath

    if (!targetPath) {
      return {
        message: '路径不能为空',
        pid: null,
      }
    }

    if (!fs.existsSync(targetPath)) {
      return {
        message: `路径不存在: ${targetPath}`,
        pid: null,
      }
    }

    const stat = fs.statSync(targetPath)
    if (stat.isDirectory()) {
      const message = await shell.openPath(targetPath)
      return {
        message,
        pid: null,
      }
    }

    const extension = path.extname(targetPath).toLowerCase()

    // 可直接拉起独立进程的类型优先用 spawn，便于记录 pid。
    if (['.exe', '.com'].includes(extension)) {
      const child = spawn(targetPath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.unref()

      return {
        message: '',
        pid: child.pid ?? null,
      }
    }

    if (['.bat', '.cmd'].includes(extension)) {
      const child = spawn('cmd.exe', ['/c', 'start', '""', targetPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.unref()

      return {
        message: '',
        pid: child.pid ?? null,
      }
    }

    const message = await shell.openPath(targetPath)
    return {
      message,
      pid: null,
    }
  }

  static async launchPathWithMtool(gameExePath: string, mtoolPath: string, hookFiles: string[]) {
    const normalizedGameExePath = path.normalize(String(gameExePath ?? '').trim())
    const normalizedMtoolPath = path.normalize(String(mtoolPath ?? '').trim())

    if (!normalizedGameExePath) {
      return {
        message: '游戏启动文件不能为空',
        pid: null,
      }
    }

    if (!normalizedMtoolPath) {
      return {
        message: '请先在设置中配置 MTool 路径',
        pid: null,
      }
    }

    if (!fs.existsSync(normalizedGameExePath)) {
      return {
        message: `游戏启动文件不存在: ${normalizedGameExePath}`,
        pid: null,
      }
    }

    const resolvedMtool = this.resolveMtoolExecutable(normalizedMtoolPath)
    if (!resolvedMtool) {
      return {
        message: '未找到可用的 MTool 主程序，请确认配置的是 MTool.exe、nw.exe，或 MTool 根目录',
        pid: null,
      }
    }

    const selectedHookPath = this.resolveMtoolHookPath(
      resolvedMtool.loadersDir,
      hookFiles,
      normalizedGameExePath
    )

    if (!selectedHookPath) {
      return {
        message: `未找到可用的 MTool Hook 文件: ${hookFiles.join(', ') || '未知'}`,
        pid: null,
      }
    }

    const hookExtension = path.extname(selectedHookPath).toLowerCase()

    if (hookExtension === '.dll') {
      const injectExePath = path.join(resolvedMtool.loadersDir, 'inject.exe')
      if (!fs.existsSync(injectExePath)) {
        return {
          message: `未找到 MTool 注入器: ${injectExePath}`,
          pid: null,
        }
      }

      const injectProcess = spawn(injectExePath, [normalizedGameExePath, selectedHookPath], {
        cwd: path.dirname(normalizedGameExePath),
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      })
      injectProcess.unref()
    } else if (hookExtension === '.exe') {
      const launcherProcess = spawn(selectedHookPath, [normalizedGameExePath], {
        cwd: path.dirname(normalizedGameExePath),
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      })
      launcherProcess.unref()
    } else {
      return {
        message: `不支持的 MTool Hook 类型: ${selectedHookPath}`,
        pid: null,
      }
    }

    const mtoolProcess = spawn(resolvedMtool.executablePath, [resolvedMtool.toolDir], {
      cwd: resolvedMtool.toolDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    mtoolProcess.unref()

    return {
      message: '',
      pid: null,
    }
  }

  static async launchPathWithLocaleEmulator(gameExePath: string, localeEmulatorPath: string) {
    const normalizedGameExePath = path.normalize(String(gameExePath ?? '').trim())
    const normalizedLocaleEmulatorPath = path.normalize(String(localeEmulatorPath ?? '').trim())

    if (!normalizedGameExePath) {
      return {
        message: '游戏启动文件不能为空',
        pid: null,
      }
    }

    if (!normalizedLocaleEmulatorPath) {
      return {
        message: '请先在设置中配置 LE 转区工具路径',
        pid: null,
      }
    }

    if (!fs.existsSync(normalizedGameExePath)) {
      return {
        message: `游戏启动文件不存在: ${normalizedGameExePath}`,
        pid: null,
      }
    }

    const resolvedLocaleEmulator = this.resolveLocaleEmulatorExecutable(normalizedLocaleEmulatorPath)
    if (!resolvedLocaleEmulator) {
      return {
        message: '未找到可用的 LE 主程序，请确认配置的是 LEProc.exe 或 Locale Emulator 根目录',
        pid: null,
      }
    }

    const child = spawn(resolvedLocaleEmulator, [normalizedGameExePath], {
      cwd: path.dirname(normalizedGameExePath),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.unref()

    return {
      message: '',
      pid: child.pid ?? null,
    }
  }

  static async stopProcess(pid: number | null | undefined) {
    if (!pid || !Number.isFinite(pid)) {
      return {
        message: '未找到可停止的进程',
      }
    }

    if (process.platform === 'win32') {
      return new Promise<{ message: string }>((resolve) => {
        const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        })

        child.once('error', (error) => {
          resolve({
            message: error.message || '停止进程失败',
          })
        })

        child.once('exit', (code) => {
          resolve({
            message: code === 0 ? '' : `停止进程失败，退出码 ${code}`,
          })
        })
      })
    }

    try {
      process.kill(pid)
      return {
        message: '',
      }
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : '停止进程失败',
      }
    }
  }

  private static async ensureScreenshotFolder(resourceId: string) {
    if (!resourceId) {
      return ''
    }

    const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)
    const cacheRoot = String(cacheSetting?.value ?? Settings.CACHE_PATH.default).trim()

    if (!cacheRoot || cacheRoot === '__CACHE_PATH__') {
      return ''
    }

    const screenshotFolder = path.join(cacheRoot, 'screenshot', resourceId)
    fs.mkdirSync(screenshotFolder, { recursive: true })
    return screenshotFolder
  }

  private static resolveMtoolExecutable(inputPath: string) {
    const normalizedPath = path.normalize(String(inputPath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    const stat = fs.statSync(normalizedPath)
    const candidatePaths = stat.isDirectory()
      ? [
          path.join(normalizedPath, 'Tool', 'MTool.exe'),
          path.join(normalizedPath, 'Tool', 'nw.exe'),
          path.join(normalizedPath, 'MTool.exe'),
          path.join(normalizedPath, 'nw.exe')
        ]
      : [
          normalizedPath,
          path.join(path.dirname(normalizedPath), 'Tool', 'MTool.exe'),
          path.join(path.dirname(normalizedPath), 'Tool', 'nw.exe')
        ]

    const executablePath = candidatePaths.find((candidatePath) => {
      if (!candidatePath || !fs.existsSync(candidatePath)) {
        return false
      }

      const extension = path.extname(candidatePath).toLowerCase()
      return extension === '.exe'
    })

    if (!executablePath) {
      return null
    }

    const executableDir = path.dirname(executablePath)
    const toolDir = path.basename(executableDir).toLowerCase() === 'tool'
      ? executableDir
      : path.join(executableDir, 'Tool')
    const loadersDir = path.join(toolDir, 'loaders')

    if (!fs.existsSync(toolDir) || !fs.existsSync(loadersDir)) {
      return null
    }

    return {
      executablePath,
      toolDir,
      loadersDir
    }
  }

  private static resolveLocaleEmulatorExecutable(inputPath: string) {
    const normalizedPath = path.normalize(String(inputPath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    const stat = fs.statSync(normalizedPath)
    const candidatePaths = stat.isDirectory()
      ? [
          path.join(normalizedPath, 'LEProc.exe'),
          path.join(normalizedPath, 'Locale Emulator', 'LEProc.exe')
        ]
      : [normalizedPath]

    const executablePath = candidatePaths.find((candidatePath) => {
      if (!candidatePath || !fs.existsSync(candidatePath)) {
        return false
      }

      return path.extname(candidatePath).toLowerCase() === '.exe'
    })

    return executablePath ?? null
  }

  private static resolveMtoolHookPath(loadersDir: string, hookFiles: string[], gameExePath: string) {
    const normalizedHookFiles = (hookFiles ?? [])
      .map((hookFile) => String(hookFile ?? '').trim())
      .filter(Boolean)

    if (!normalizedHookFiles.length) {
      return null
    }

    const is64BitGame = this.isExecutable64Bit(gameExePath)
    const existingHookPaths = normalizedHookFiles
      .map((hookFile) => path.join(loadersDir, hookFile))
      .filter((hookPath) => fs.existsSync(hookPath))

    if (!existingHookPaths.length) {
      return null
    }

    const preferredHookPath = existingHookPaths.find((hookPath) => {
      const hookName = path.basename(hookPath).toLowerCase()
      if (is64BitGame) {
        return hookName.includes('64') || (!hookName.includes('32') && !hookName.includes('x86'))
      }

      return hookName.includes('32') || hookName.includes('x86') || !hookName.includes('64')
    })

    return preferredHookPath ?? existingHookPaths[0]
  }

  private static isExecutable64Bit(filePath: string) {
    try {
      const fileBuffer = fs.readFileSync(filePath)
      if (fileBuffer.length < 0x3c + 6) {
        return false
      }

      const peHeaderOffset = fileBuffer.readUInt32LE(0x3c)
      if (!Number.isFinite(peHeaderOffset) || peHeaderOffset <= 0 || peHeaderOffset + 6 > fileBuffer.length) {
        return false
      }

      if (fileBuffer.toString('ascii', peHeaderOffset, peHeaderOffset + 4) !== 'PE\u0000\u0000') {
        return false
      }

      const machine = fileBuffer.readUInt16LE(peHeaderOffset + 4)
      return machine === this.IMAGE_FILE_MACHINE_AMD64
    } catch {
      return false
    }
  }
}
