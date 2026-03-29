import { app, clipboard, dialog, nativeImage, shell } from 'electron'
import {readFile} from 'fs/promises'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { DatabaseService } from './database.service'
import { Settings } from '../../common/constants'

export class DialogService {
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
}
