import { app, clipboard, dialog, nativeImage, shell } from 'electron'
import { readFile } from 'fs/promises'
import path from 'path'
import fs from 'fs'
import { execFile, spawn } from 'child_process'
import { createHash } from 'crypto'
import { pathToFileURL } from 'url'
import sharp from 'sharp'
import { parseFile } from 'music-metadata'
import { DatabaseService } from './database.service'
import { Settings } from '../../common/constants'
const ffprobeStatic = require('ffprobe-static') as { path?: string }

const LOCAL_FILE_PROTOCOL = 'neo-resource-file'
const AUDIO_TRANSCODE_PROTOCOL = 'neo-resource-audio'
const VIDEO_TRANSCODE_PROTOCOL = 'neo-resource-video'
const TEXT_ENCODING_SAMPLE_BYTES = 256 * 1024
const TEXT_FILE_CHUNK_BYTES = 512 * 1024
const MAX_IMAGE_DATA_URL_BYTES = 64 * 1024 * 1024
const MAX_IMAGE_PREVIEW_PIXELS = 100_000_000
const MAX_IMAGE_THUMBNAIL_PIXELS = 2_000_000_000

function encodeBase64Url(input: string) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function toLocalFileProtocolUrl(filePath: string) {
  return `${LOCAL_FILE_PROTOCOL}://local/${encodeBase64Url(filePath)}`
}

function toAudioTranscodeProtocolUrl(filePath: string) {
  return `${AUDIO_TRANSCODE_PROTOCOL}://transcode/${encodeBase64Url(filePath)}`
}

function toVideoTranscodeProtocolUrl(filePath: string, startTime = 0) {
  const normalizedStartTime = Math.max(0, Number(startTime ?? 0) || 0)
  return `${VIDEO_TRANSCODE_PROTOCOL}://transcode/${encodeBase64Url(filePath)}?start=${encodeURIComponent(normalizedStartTime)}`
}

async function readImageProbe(filePath: string) {
  const [fileStat, metadata] = await Promise.all([
    fs.promises.stat(filePath),
    sharp(filePath, { limitInputPixels: false, animated: false }).metadata()
  ])
  const width = Number(metadata.width ?? 0)
  const height = Number(metadata.height ?? 0)
  const pixels = width > 0 && height > 0 ? width * height : 0

  return {
    fileSize: Number.isFinite(fileStat.size) ? fileStat.size : 0,
    width,
    height,
    pixels,
    format: String(metadata.format ?? path.extname(filePath).replace('.', '')).trim().toLowerCase(),
    pages: Number(metadata.pages ?? 1)
  }
}

function execFileText(filePath: string, args: string[], timeoutMs = 15000) {
  return new Promise<string>((resolve, reject) => {
    execFile(filePath, args, { encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }

      resolve(String(stdout ?? ''))
    })
  })
}

async function readVideoDurationWithFfprobe(filePath: string) {
  const ffprobePath = String(ffprobeStatic?.path ?? '').trim()
  if (!ffprobePath || !fs.existsSync(ffprobePath)) {
    return 0
  }

  try {
    const output = await execFileText(
      ffprobePath,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]
    )
    const duration = Number(output.trim())
    return Number.isFinite(duration) && duration > 0 ? duration : 0
  } catch {
    return 0
  }
}

function isHugeImageProbe(probe: Awaited<ReturnType<typeof readImageProbe>>) {
  return probe.pixels > MAX_IMAGE_PREVIEW_PIXELS
}

function canAttemptHugeImageThumbnail(probe: Awaited<ReturnType<typeof readImageProbe>>) {
  return probe.pixels > 0 && probe.pixels <= MAX_IMAGE_THUMBNAIL_PIXELS
}

function scoreDecodedTextCandidate(input: string) {
  const normalizedInput = String(input ?? '').replace(/^\uFEFF/, '').trim()
  if (!normalizedInput) {
    return -100
  }

  let score = 0
  const cjkCount = normalizedInput.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const kanaCount = normalizedInput.match(/[\u3040-\u30ff]/g)?.length ?? 0
  const hangulCount = normalizedInput.match(/[\uac00-\ud7af]/g)?.length ?? 0
  const latinCount = normalizedInput.match(/[A-Za-z0-9]/g)?.length ?? 0
  const replacementCount = normalizedInput.match(/\uFFFD/g)?.length ?? 0

  if (cjkCount > 0) {
    score += 12
    score += Math.min(cjkCount, 80) * 0.2
  }

  if (latinCount > 0) {
    score += 2
    score += Math.min(latinCount, 40) * 0.05
  }

  if (kanaCount > 0) {
    score += 18
    score += Math.min(kanaCount, 120) * 1.2
  }

  if (hangulCount > 0) {
    score += 18
    score += Math.min(hangulCount, 120) * 1.2
  }

  if (replacementCount > 0) {
    score -= 12
    score -= Math.min(replacementCount, 120) * 1.5
  }

  if (/[À-ÿ]/.test(normalizedInput)) {
    score -= 4
  }

  if (/[ÃÐÑØÖ×ÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/.test(normalizedInput)) {
    score -= 6
  }

  if (/�|□|■|¤/.test(normalizedInput)) {
    score -= 8
  }

  return score
}

function isValidUtf8Buffer(buffer: Buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return true
  } catch {
    return false
  }
}

type TextEncoding =
  | 'utf-8'
  | 'utf-16le'
  | 'gb18030'
  | 'big5'
  | 'shift_jis'
  | 'euc-kr'
  | 'windows-1252'
  | 'windows-1250'
type TextFileInfo = {
  size: number
  encoding: TextEncoding
  recommendedChunkSize: number
}
type TextFileChunkOptions = {
  offset?: number
  length?: number
  encoding?: string
}
type TextFileChunkResult = {
  text: string
  offset: number
  nextOffset: number
  fileSize: number
  encoding: string
  hasPrevious: boolean
  hasNext: boolean
}
type AudioPlaybackUrlResult = {
  url: string
  transcoded: boolean
  sourcePath: string
  playbackPath: string
}
type VideoPlaybackUrlResult = {
  url: string
  transcoded: boolean
  sourcePath: string
  playbackPath: string
  duration: number
}

function detectTextBufferEncoding(buffer: Buffer): TextEncoding {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf-16le'
  }

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8'
  }

  if (isValidUtf8Buffer(buffer)) {
    return 'utf-8'
  }

  const sampleLength = Math.min(buffer.length, TEXT_ENCODING_SAMPLE_BYTES)
  let zeroByteCount = 0
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      zeroByteCount += 1
    }
  }

  const shouldTryUtf16 = sampleLength > 0 && zeroByteCount / sampleLength > 0.05
  const decoderCandidates = shouldTryUtf16
    ? ([
        'utf-8',
        'utf-16le',
        'gb18030',
        'big5',
        'shift_jis',
        'euc-kr',
        'windows-1252',
        'windows-1250'
      ] as const)
    : ([
        'utf-8',
        'gb18030',
        'big5',
        'shift_jis',
        'euc-kr',
        'windows-1252',
        'windows-1250'
      ] as const)
  const decodedCandidates = decoderCandidates
    .map((encoding) => {
      try {
        return {
          encoding,
          value: new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/, '').trim()
        }
      } catch {
        return null
      }
    })
    .filter((item): item is { encoding: TextEncoding; value: string } => Boolean(item?.value))

  const bestCandidate = decodedCandidates
    .map((candidate) => ({
      encoding: candidate.encoding,
      score: scoreDecodedTextCandidate(candidate.value)
    }))
    .sort((left, right) => right.score - left.score)[0]

  return bestCandidate?.encoding ?? 'utf-8'
}

function decodeTextBuffer(buffer: Buffer, encoding?: string): string {
  const detectedEncoding = encoding || detectTextBufferEncoding(
    buffer.length > TEXT_ENCODING_SAMPLE_BYTES ? buffer.subarray(0, TEXT_ENCODING_SAMPLE_BYTES) : buffer
  )

  try {
    return new TextDecoder(detectedEncoding).decode(buffer).replace(/^\uFEFF/, '').trim()
  } catch {
    return buffer.toString('utf8').replace(/^\uFEFF/, '').trim()
  }
}

export class DialogService {
  private static readonly IMAGE_FILE_MACHINE_AMD64 = 0x8664
  private static readonly IMAGE_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.bmp'
  ])
  private static readonly AUDIO_EXTENSIONS = new Set([
    '.mp3',
    '.wav',
    '.flac',
    '.m4a',
    '.aac',
    '.ogg',
    '.opus',
    '.wma',
    '.ape'
  ])
  private static readonly AUDIO_TRANSCODE_EXTENSIONS = new Set([
    '.ape',
    '.wma'
  ])
  private static readonly VIDEO_EXTENSIONS = new Set([
    '.mp4',
    '.m4v',
    '.mkv',
    '.webm',
    '.avi',
    '.mov',
    '.wmv',
    '.flv',
    '.ts'
  ])
  private static readonly VIDEO_TRANSCODE_EXTENSIONS = new Set([
    '.avi',
    '.mkv',
    '.mov',
    '.wmv',
    '.flv'
  ])

  static async getAvailableScriptRuntimes() {
    const runtimeMap = new Map<string, {
      label: string
      value: string
      shellType: 'powershell' | 'cmd'
    }>()

    const addRuntime = (runtimePath: string, label: string, shellType: 'powershell' | 'cmd') => {
      const normalizedPath = path.normalize(String(runtimePath ?? '').trim())
      if (!normalizedPath || !fs.existsSync(normalizedPath)) {
        return
      }

      const dedupeKey = normalizedPath.toLowerCase()
      if (runtimeMap.has(dedupeKey)) {
        return
      }

      runtimeMap.set(dedupeKey, {
        label,
        value: normalizedPath,
        shellType,
      })
    }

    addRuntime('C:\\Windows\\System32\\cmd.exe', 'CMD', 'cmd')
    addRuntime('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'Windows PowerShell 5.1', 'powershell')

    try {
      const whereResult = await new Promise<string[]>((resolve) => {
        const child = spawn('where.exe', ['pwsh'], {
          detached: false,
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true,
        })

        const chunks: Buffer[] = []
        child.stdout?.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        child.on('error', () => resolve([]))
        child.on('close', () => {
          const output = Buffer.concat(chunks).toString('utf8')
          resolve(output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))
        })
      })

      whereResult.forEach((runtimePath, index) => {
        addRuntime(runtimePath, index === 0 ? 'PowerShell 7+' : `PowerShell 7+ (${path.basename(runtimePath)})`, 'powershell')
      })
    } catch {
      // ignore runtime detection failures
    }

    return Array.from(runtimeMap.values())
  }

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

  static async selectFiles(extensions: string[] = []) {
    const result = await dialog.showOpenDialog({
      title: '请选择文件',
      filters: extensions ? [{ name: '文件', extensions }] : [],
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return []
    }

    return result.filePaths
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
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    const probe = await readImageProbe(normalizedPath)
    if (probe.fileSize > MAX_IMAGE_DATA_URL_BYTES || isHugeImageProbe(probe)) {
      return null
    }

    const extension = path.extname(normalizedPath).toLowerCase()
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

    const buffer = await readFile(normalizedPath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  }

  static async getImageFileUrl(filePath: string) {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    return pathToFileURL(normalizedPath).href
  }

  static async getFileUrl(filePath: string) {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    return toLocalFileProtocolUrl(normalizedPath)
  }

  static async readTextFile(filePath: string, encoding?: string) {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    try {
      const buffer = await readFile(normalizedPath)
      return decodeTextBuffer(buffer, encoding)
    } catch {
      return null
    }
  }

  static async getTextFileInfo(filePath: string): Promise<TextFileInfo | null> {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    try {
      const stat = await fs.promises.stat(normalizedPath)
      const sampleLength = Math.min(TEXT_ENCODING_SAMPLE_BYTES, stat.size)
      const fileHandle = await fs.promises.open(normalizedPath, 'r')

      try {
        const sampleBuffer = Buffer.alloc(sampleLength)
        const { bytesRead } = await fileHandle.read(sampleBuffer, 0, sampleLength, 0)
        return {
          size: stat.size,
          encoding: detectTextBufferEncoding(sampleBuffer.subarray(0, bytesRead)),
          recommendedChunkSize: TEXT_FILE_CHUNK_BYTES
        }
      } finally {
        await fileHandle.close()
      }
    } catch {
      return null
    }
  }

  static async readTextFileChunk(
    filePath: string,
    options?: TextFileChunkOptions
  ): Promise<TextFileChunkResult | null> {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    try {
      const stat = await fs.promises.stat(normalizedPath)
      const fileSize = stat.size
      const offset = Math.max(0, Math.min(fileSize, Math.floor(Number(options?.offset ?? 0) || 0)))
      const length = Math.max(1, Math.min(2 * 1024 * 1024, Math.floor(Number(options?.length ?? TEXT_FILE_CHUNK_BYTES) || TEXT_FILE_CHUNK_BYTES)))
      const readLength = Math.min(length, Math.max(0, fileSize - offset))
      const fileHandle = await fs.promises.open(normalizedPath, 'r')

      try {
        const buffer = Buffer.alloc(readLength)
        const { bytesRead } = await fileHandle.read(buffer, 0, readLength, offset)
        const chunkBuffer = buffer.subarray(0, bytesRead)
        const encoding = options?.encoding || detectTextBufferEncoding(chunkBuffer)

        return {
          text: decodeTextBuffer(chunkBuffer, encoding),
          offset,
          nextOffset: Math.min(fileSize, offset + bytesRead),
          fileSize,
          encoding,
          hasPrevious: offset > 0,
          hasNext: offset + bytesRead < fileSize
        }
      } finally {
        await fileHandle.close()
      }
    } catch {
      return null
    }
  }

  static async readBinaryFile(filePath: string) {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    try {
      const buffer = await readFile(normalizedPath)
      return Uint8Array.from(buffer)
    } catch {
      return null
    }
  }

  static async getAudioPlaybackUrl(filePath: string): Promise<AudioPlaybackUrlResult | null> {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    const extension = path.extname(normalizedPath).toLowerCase()
    if (!this.AUDIO_TRANSCODE_EXTENSIONS.has(extension)) {
      return {
        url: toLocalFileProtocolUrl(normalizedPath),
        transcoded: false,
        sourcePath: normalizedPath,
        playbackPath: normalizedPath
      }
    }

    const cachedPlaybackPath = await this.getAudioTranscodeCachePath(normalizedPath)
    if (cachedPlaybackPath && fs.existsSync(cachedPlaybackPath)) {
      return {
        url: toLocalFileProtocolUrl(cachedPlaybackPath),
        transcoded: true,
        sourcePath: normalizedPath,
        playbackPath: cachedPlaybackPath
      }
    }

    return {
      url: toAudioTranscodeProtocolUrl(normalizedPath),
      transcoded: true,
      sourcePath: normalizedPath,
      playbackPath: normalizedPath
    }
  }

  static async getVideoPlaybackUrl(filePath: string, startTime = 0): Promise<VideoPlaybackUrlResult | null> {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    const extension = path.extname(normalizedPath).toLowerCase()
    const mediaMeta = await this.readMediaMetadata(normalizedPath, true)
    const sourceDuration = await readVideoDurationWithFfprobe(normalizedPath)
      || Math.max(0, Number(mediaMeta.duration ?? 0))
    if (!this.VIDEO_TRANSCODE_EXTENSIONS.has(extension)) {
      return {
        url: toLocalFileProtocolUrl(normalizedPath),
        transcoded: false,
        sourcePath: normalizedPath,
        playbackPath: normalizedPath,
        duration: sourceDuration
      }
    }

    return {
      url: toVideoTranscodeProtocolUrl(normalizedPath, startTime),
      transcoded: true,
      sourcePath: normalizedPath,
      playbackPath: normalizedPath,
      duration: sourceDuration
    }
  }

  static async getImagePreviewUrl(
    filePath: string,
    options?: {
      maxWidth?: number
      maxHeight?: number
      fit?: 'inside' | 'cover'
      quality?: number
    }
  ) {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return null
    }

    const maxWidth = Math.max(1, Number(options?.maxWidth ?? 0) || 320)
    const maxHeight = Math.max(1, Number(options?.maxHeight ?? 0) || 320)
    const fit = options?.fit === 'cover' ? 'cover' : 'inside'
    const quality = Math.min(100, Math.max(40, Number(options?.quality ?? 82) || 82))
    const imageProbe = await readImageProbe(normalizedPath)
    if (isHugeImageProbe(imageProbe) && !canAttemptHugeImageThumbnail(imageProbe)) {
      return null
    }

    const cacheFilePath = await this.ensureImagePreviewCache(normalizedPath, {
      maxWidth,
      maxHeight,
      fit,
      quality,
    })

    if (!cacheFilePath) {
      return null
    }

    const buffer = await readFile(cacheFilePath)
    return `data:image/webp;base64,${buffer.toString('base64')}`
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

  static async copyTextToClipboard(text: string) {
    const normalizedText = String(text ?? '')
    if (!normalizedText.trim()) {
      return '复制内容不能为空'
    }

    clipboard.writeText(normalizedText)
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

    return this.listImageFiles(screenshotFolder)
  }

  static async saveVideoFrameScreenshot(resourceId: string, dataUrl: string, currentTime?: number) {
    const screenshotFolder = await this.ensureScreenshotFolder(String(resourceId ?? '').trim())
    if (!screenshotFolder) {
      return {
        type: 'warning',
        message: '未配置截图缓存目录',
      }
    }

    const matched = String(dataUrl ?? '').match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i)
    if (!matched) {
      return {
        type: 'warning',
        message: '截图数据无效',
      }
    }

    const extension = matched[1].toLowerCase() === 'jpeg' ? 'jpg' : matched[1].toLowerCase()
    const buffer = Buffer.from(matched[2], 'base64')
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '')
    const secondText = Number.isFinite(Number(currentTime))
      ? `_${Math.max(0, Math.floor(Number(currentTime)))}s`
      : ''
    const outputPath = path.join(screenshotFolder, `video-frame_${timestamp}${secondText}.${extension}`)

    fs.writeFileSync(outputPath, buffer)

    return {
      type: 'success',
      message: '截图已保存',
      data: {
        filePath: outputPath,
      },
    }
  }

  static async getDirectoryImages(directoryPath: string) {
    const normalizedPath = path.normalize(String(directoryPath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return []
    }

    const stats = fs.statSync(normalizedPath)
    if (!stats.isDirectory()) {
      return []
    }

    return this.listImageFiles(normalizedPath)
  }

  static async getDirectoryAudioTree(directoryPath: string) {
    const normalizedPath = path.normalize(String(directoryPath ?? '').trim())
    if (!normalizedPath || !fs.existsSync(normalizedPath)) {
      return []
    }

    const stats = fs.statSync(normalizedPath)
    if (!stats.isDirectory()) {
      return []
    }

    return this.listAudioTree(normalizedPath)
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

  private static async ensureImagePreviewCache(
    filePath: string,
    options: {
      maxWidth: number
      maxHeight: number
      fit: 'inside' | 'cover'
      quality: number
    }
  ) {
    const fileStat = await fs.promises.stat(filePath)
    const cacheRoot = await this.getPreviewCacheRoot()
    await fs.promises.mkdir(cacheRoot, { recursive: true })

    const cacheKey = createHash('sha1')
      .update(JSON.stringify({
        filePath: path.normalize(filePath).toLowerCase(),
        size: fileStat.size,
        mtimeMs: Math.trunc(fileStat.mtimeMs),
        ...options,
      }))
      .digest('hex')

    const targetPath = path.join(cacheRoot, `${cacheKey}.webp`)
    if (!fs.existsSync(targetPath)) {
      const resizeOptions =
        options.fit === 'cover'
          ? {
              width: options.maxWidth,
              height: options.maxHeight,
              fit: 'cover' as const,
              position: 'centre' as const,
            }
          : {
              width: options.maxWidth,
              height: options.maxHeight,
              fit: 'inside' as const,
              withoutEnlargement: true,
            }

      await sharp(filePath, {
        limitInputPixels: MAX_IMAGE_THUMBNAIL_PIXELS,
        animated: false,
        pages: 1,
        sequentialRead: true,
        failOn: 'none'
      })
        .rotate()
        .resize(resizeOptions)
        .webp({ quality: options.quality })
        .toFile(targetPath)
    }

    return targetPath
  }

  private static async getAudioTranscodeCachePath(filePath: string): Promise<string | null> {
    const fileStat = await fs.promises.stat(filePath)
    const cacheRoot = await this.getAudioTranscodeCacheRoot()

    const cacheKey = createHash('sha1')
      .update(JSON.stringify({
        filePath: path.normalize(filePath).toLowerCase(),
        size: fileStat.size,
        mtimeMs: Math.trunc(fileStat.mtimeMs),
        format: 'wav-pcm_s16le-44100-2ch'
      }))
      .digest('hex')
    return path.join(cacheRoot, `${cacheKey}.wav`)
  }

  private static listImageFiles(directoryPath: string) {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(directoryPath, entry.name))
      .filter((filePath) => imageExtensions.has(path.extname(filePath).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }

  private static async listAudioTree(directoryPath: string) {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1
        }

        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
      })

    const nodes: Array<{
      key: string
      label: string
      path: string
      isDirectory: boolean
      kind?: 'image' | 'audio' | 'video'
      hasSubtitle?: boolean
      duration?: number | null
      bitrate?: number | null
      sampleRate?: number | null
      frameRate?: number | null
      audioBitrate?: number | null
      audioSampleRate?: number | null
      width?: number | null
      height?: number | null
      children?: any[]
    }> = []
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name)

      if (entry.isDirectory()) {
        const children = await this.listAudioTree(entryPath)
        if (!children.length) {
          continue
        }

        nodes.push({
          key: entryPath,
          label: entry.name,
          path: entryPath,
          isDirectory: true,
          children
        })
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const extension = path.extname(entry.name).toLowerCase()
      const isAudio = this.AUDIO_EXTENSIONS.has(extension)
      const isImage = this.IMAGE_EXTENSIONS.has(extension)
      const isVideo = this.VIDEO_EXTENSIONS.has(extension)

      if (!isAudio && !isImage && !isVideo) {
        continue
      }

      nodes.push({
        key: entryPath,
        label: entry.name,
        path: entryPath,
        isDirectory: false,
        kind: isImage ? 'image' : (isVideo ? 'video' : 'audio'),
        hasSubtitle: isAudio ? this.hasSiblingSubtitleFile(entryPath) : false,
        ...((isAudio || isVideo)
          ? await this.readMediaMetadata(entryPath, isVideo)
          : await this.readImageMetadata(entryPath))
      })
    }

    return nodes
  }

  private static async readMediaMetadata(filePath: string, isVideo: boolean) {
    try {
      const metadata = await parseFile(filePath, { duration: true })
      const duration = Number(metadata.format.duration ?? 0)
      const bitrate = Number(metadata.format.bitrate ?? 0)
      const sampleRate = Number(metadata.format.sampleRate ?? 0)
      const trackInfo = Array.isArray(metadata.format.trackInfo) ? metadata.format.trackInfo : []
      const videoTrack = trackInfo.find((track) => track?.video)
      const audioTrack = trackInfo.find((track) => track?.audio)

      const width = Number(videoTrack?.video?.pixelWidth ?? 0)
      const height = Number(videoTrack?.video?.pixelHeight ?? 0)
      const audioSampleRate = Number(audioTrack?.audio?.samplingFrequency ?? sampleRate ?? 0)

      return {
        duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
        bitrate: Number.isFinite(bitrate) && bitrate > 0 ? Math.round(bitrate) : null,
        sampleRate: !isVideo && Number.isFinite(sampleRate) && sampleRate > 0 ? Math.round(sampleRate) : null,
        frameRate: null,
        audioBitrate: isVideo && Number.isFinite(bitrate) && bitrate > 0 ? Math.round(bitrate) : null,
        audioSampleRate: isVideo && Number.isFinite(audioSampleRate) && audioSampleRate > 0 ? Math.round(audioSampleRate) : null,
        width: isVideo && Number.isFinite(width) && width > 0 ? Math.round(width) : null,
        height: isVideo && Number.isFinite(height) && height > 0 ? Math.round(height) : null
      }
    } catch {
      return {
        duration: null,
        bitrate: null,
        sampleRate: null,
        frameRate: null,
        audioBitrate: null,
        audioSampleRate: null,
        width: null,
        height: null
      }
    }
  }

  private static hasSiblingSubtitleFile(filePath: string) {
    const normalizedPath = path.normalize(String(filePath ?? '').trim())
    if (!normalizedPath) {
      return false
    }

    const subtitleExtensions = ['.lrc', '.srt', '.vtt']
    const extension = path.extname(normalizedPath)
    const fileBasePath = extension ? normalizedPath.slice(0, -extension.length) : normalizedPath

    return subtitleExtensions.some((subtitleExtension) =>
      fs.existsSync(`${fileBasePath}${subtitleExtension}`) || fs.existsSync(`${normalizedPath}${subtitleExtension}`)
    )
  }

  private static async readImageMetadata(filePath: string) {
    try {
      const metadata = await sharp(filePath).metadata()
      const width = Number(metadata.width ?? 0)
      const height = Number(metadata.height ?? 0)

      return {
        width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
        height: Number.isFinite(height) && height > 0 ? Math.round(height) : null
      }
    } catch {
      return {
        width: null,
        height: null
      }
    }
  }

  private static async getPreviewCacheRoot() {
    return path.join(await this.getCacheRoot(), 'image-previews')
  }

  private static async getAudioTranscodeCacheRoot() {
    return path.join(await this.getCacheRoot(), 'audio-transcodes')
  }

  private static async getCacheRoot() {
    const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)
    const configuredRoot = String(cacheSetting?.value ?? '').trim()
    return configuredRoot
      ? path.resolve(configuredRoot)
      : path.resolve(app.getPath('userData'), 'cache')
  }

  static async launchPath(filePath: string, fileName?: string, options?: { args?: string[] }) {
    const targetPath = fileName ? path.join(filePath, fileName) : filePath
    const launchArgs = Array.isArray(options?.args) ? options.args : []

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

    if ((this.isCommandShellExecutable(targetPath) || this.isPowerShellExecutable(targetPath)) && launchArgs.length) {
      const child = spawn('cmd.exe', ['/c', 'start', '""', targetPath, ...launchArgs], {
        cwd: path.dirname(targetPath),
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

    // 可直接拉起独立进程的类型优先用 spawn，便于记录 pid。
    if (['.exe', '.com'].includes(extension)) {
      const child = spawn(targetPath, launchArgs, {
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
      const child = spawn('cmd.exe', ['/c', 'start', '""', targetPath, ...launchArgs], {
        cwd: path.dirname(targetPath),
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

  static async launchPathAsAdmin(filePath: string, fileName?: string, options?: { args?: string[] }) {
    const targetPath = fileName ? path.join(filePath, fileName) : filePath
    const launchArgs = Array.isArray(options?.args) ? options.args : []

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

    if (process.platform !== 'win32') {
      return {
        message: '仅支持在 Windows 下以管理员身份运行',
        pid: null,
      }
    }

    const stat = fs.statSync(targetPath)
    if (stat.isDirectory()) {
      return {
        message: '目录不支持以管理员身份运行',
        pid: null,
      }
    }

    const escapedTargetPath = targetPath.replace(/'/g, "''")
    const extension = path.extname(targetPath).toLowerCase()
    const escapedWorkingDirectory = path.dirname(targetPath).replace(/'/g, "''")
    const psArgumentList = this.toPowerShellArgumentList(launchArgs)
    let command = ''

    if (['.bat', '.cmd'].includes(extension)) {
      const batArgs = [`""${escapedTargetPath}""`, ...launchArgs]
      command = `Start-Process -FilePath 'cmd.exe' -WorkingDirectory '${escapedWorkingDirectory}' -ArgumentList ${this.toPowerShellArgumentList(['/c', ...batArgs])} -Verb RunAs`
    } else {
      command = launchArgs.length
        ? `Start-Process -FilePath '${escapedTargetPath}' -ArgumentList ${psArgumentList} -Verb RunAs`
        : `Start-Process -FilePath '${escapedTargetPath}' -Verb RunAs`
    }

    return new Promise<{ message: string; pid: number | null }>((resolve) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        detached: false,
        stdio: 'ignore',
        windowsHide: false,
      })

      child.on('error', (error) => {
        resolve({
          message: error instanceof Error ? error.message : '以管理员身份运行失败',
          pid: null,
        })
      })

      child.on('spawn', () => {
        resolve({
          message: '',
          pid: null,
        })
      })
    })
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

  private static toPowerShellArgumentList(args: string[]) {
    if (!args.length) {
      return '@()'
    }

    return `@(${args.map((item) => `'${String(item ?? '').replace(/'/g, "''")}'`).join(', ')})`
  }

  private static isCommandShellExecutable(targetPath: string) {
    const normalizedPath = path.normalize(String(targetPath ?? '').trim()).toLowerCase()
    const fileName = path.basename(normalizedPath)
    return fileName === 'cmd.exe' || fileName === 'cmd'
  }

  private static isPowerShellExecutable(targetPath: string) {
    const normalizedPath = path.normalize(String(targetPath ?? '').trim()).toLowerCase()
    const fileName = path.basename(normalizedPath)
    return fileName === 'powershell.exe' || fileName === 'powershell' || fileName === 'pwsh.exe' || fileName === 'pwsh'
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
