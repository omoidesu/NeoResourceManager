import { BrowserWindow, globalShortcut } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
import { DatabaseService } from './database.service'
import { Settings } from '../../common/constants'
import { DialogService } from './dialog.service'
import { createLogger } from '../util/logger'
import { NotificationQueueService } from './notification-queue.service'

type ScreenshotResult = {
  filePath: string
  dataUrl: string | null
}

type CaptureOptions = {
  outputPath?: string
}

export class WindowScreenshotService {
  private static readonly logger = createLogger('window-screenshot')
  private static registeredShortcut: string | null = null

  // Capture a specific process window into a file path and optionally feed the
  // result back to the caller, which is useful for "use screenshot as cover".
  static async captureWindowScreenshot(
    pid: number,
    callback?: (result: ScreenshotResult) => Promise<void> | void,
    options: CaptureOptions = {}
  ) {
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new Error('截图失败：无效的进程ID')
    }

    const outputPath = options.outputPath ?? await this.createTempScreenshotPath(pid)
    await fs.ensureDir(path.dirname(outputPath))
    await this.captureWindowToFile(pid, outputPath)

    const result = {
      filePath: outputPath,
      dataUrl: await DialogService.readImageAsDataUrl(outputPath)
    }

    if (callback) {
      await callback(result)
    }

    return result
  }

  static async captureScreenshotForResource(resourceId: string, pid: number) {
    const screenshotFolder = await this.ensureScreenshotFolder(resourceId)
    const outputPath = path.join(screenshotFolder, `${this.buildTimestamp()}.png`)
    return this.captureWindowScreenshot(pid, undefined, { outputPath })
  }

  static async initialize() {
    if (process.platform !== 'win32') {
      this.logger.info('skip screenshot shortcut registration on non-windows platform')
      return
    }

    const shortcutSetting = await DatabaseService.getSetting(Settings.SHORTCUT_PRINT_SCREEN)
    const accelerator = String(shortcutSetting?.value ?? Settings.SHORTCUT_PRINT_SCREEN.default).trim()

    if (!accelerator) {
      this.logger.warn('screenshot shortcut is empty, skip registration')
      return
    }

    this.dispose()

    const registered = globalShortcut.register(accelerator, () => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow && !focusedWindow.isDestroyed()) {
        focusedWindow.webContents.send('service:video-frame-capture-shortcut')
        return
      }

      void this.captureFocusedResourceWindowToFolder().catch((error) => {
        this.logger.error('failed to capture focused resource screenshot', error)
        NotificationQueueService.getInstance().enqueue(
          'error',
          '窗口截图',
          error instanceof Error ? error.message : '窗口截图失败'
        )
      })
    })

    if (!registered) {
      this.logger.warn('failed to register screenshot shortcut', { accelerator })
      return
    }

    this.registeredShortcut = accelerator
    this.logger.info('registered screenshot shortcut', {
      accelerator,
      isRegistered: globalShortcut.isRegistered(accelerator),
    })
  }

  static dispose() {
    if (!this.registeredShortcut) {
      return
    }

    globalShortcut.unregister(this.registeredShortcut)
    this.logger.info('unregistered screenshot shortcut', {
      accelerator: this.registeredShortcut
    })
    this.registeredShortcut = null
  }

  // Global shortcut entry: resolve the current foreground window back to a
  // running resource, then save the screenshot into that resource's folder.
  static async captureFocusedResourceWindowToFolder() {
    const foregroundPid = await this.getForegroundWindowPid()
    if (!foregroundPid) {
      NotificationQueueService.getInstance().enqueue('warning', '窗口截图', '未检测到当前聚焦窗口')
      return null
    }

    const activeLog = await this.resolveActiveResourceLogByForegroundPid(foregroundPid)
    if (!activeLog?.resourceId) {
      this.logger.warn('foreground window does not map to active resource', { foregroundPid })
      NotificationQueueService.getInstance().enqueue('warning', '窗口截图', '当前聚焦窗口不属于运行中的资源')
      return null
    }

    const resource = await DatabaseService.getResourceById(activeLog.resourceId)
    const categoryInfo = resource?.categoryId
      ? await DatabaseService.getCategoryById(resource.categoryId)
      : null

    if (categoryInfo?.meta?.extra?.extendTable !== 'game_meta') {
      NotificationQueueService.getInstance().enqueue('warning', '窗口截图', '当前前台窗口不是游戏资源')
      return null
    }

    const screenshot = await this.captureScreenshotForResource(activeLog.resourceId, foregroundPid)

    NotificationQueueService.getInstance().enqueue(
      'success',
      '窗口截图',
      `已保存“${resource?.title ?? activeLog.resourceId}”截图`
    )

    this.logger.info('captured focused resource screenshot', {
      resourceId: activeLog.resourceId,
      pid: foregroundPid,
      filePath: screenshot.filePath
    })

    return {
      resourceId: activeLog.resourceId,
      pid: foregroundPid,
      ...screenshot
    }
  }

  // Cover capture reuses an already-running game when possible; otherwise it
  // launches the executable temporarily, waits for the window to appear, takes
  // a screenshot and then closes the process again.
  static async captureCoverScreenshotByBasePath(basePath: string) {
    const normalizedBasePath = path.normalize(String(basePath ?? '').trim())
    if (!normalizedBasePath) {
      throw new Error('请先选择资源路径')
    }

    let pid = await this.findRunningPidByExecutablePath(normalizedBasePath)
    let startedForScreenshot = false

    if (!pid) {
      const launchResult = path.extname(normalizedBasePath)
        ? await DialogService.launchPath(path.dirname(normalizedBasePath), path.basename(normalizedBasePath))
        : await DialogService.launchPath(normalizedBasePath)
      if (launchResult.message) {
        throw new Error(launchResult.message)
      }

      pid = launchResult.pid ?? null
      if (!pid) {
        throw new Error('启动成功，但无法获取进程信息，暂不支持自动截图')
      }
      startedForScreenshot = true

      this.logger.info('launched process for cover screenshot', {
        basePath: normalizedBasePath,
        pid,
      })
    } else {
      this.logger.info('reuse running process for cover screenshot', {
        basePath: normalizedBasePath,
        pid,
      })
    }

    await this.waitForWindowReady(5000)
    try {
      return await this.captureWindowScreenshot(pid)
    } finally {
      if (startedForScreenshot) {
        const stopResult = await DialogService.stopProcess(pid)
        if (stopResult.message) {
          this.logger.warn('failed to stop process after cover screenshot', {
            pid,
            message: stopResult.message,
          })
        } else {
          this.logger.info('stopped process after cover screenshot', { pid })
        }
      }
    }
  }

  static async getForegroundWindowPid() {
    const windowInfo = await this.getForegroundWindowInfo()
    if (!windowInfo?.pid) {
      this.logger.warn('foreground window not detected', { windowInfo })
      return null
    }

    this.logger.debug('foreground window detected', windowInfo)
    return windowInfo.pid
  }

  // Foreground window detection goes through PowerShell because it gives us a
  // compact way to bridge Win32 APIs without shipping a native addon.
  private static async getForegroundWindowInfo() {
    const stdout = await this.runPowerShell(`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$signature = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Win32Foreground {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
Add-Type -TypeDefinition $signature
$handle = [Win32Foreground]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) {
  Write-Output ""
  exit 0
}
[uint32]$windowPid = 0
[Win32Foreground]::GetWindowThreadProcessId($handle, [ref]$windowPid) | Out-Null
$length = [Win32Foreground]::GetWindowTextLength($handle)
$builder = New-Object System.Text.StringBuilder ($length + 1)
[Win32Foreground]::GetWindowText($handle, $builder, $builder.Capacity) | Out-Null
Write-Output ([string]([int64]$handle.ToInt64()))
Write-Output ([string]([int64]$windowPid))
Write-Output $builder.ToString()
`)

    const raw = String(stdout).trim()
    if (!raw) {
      return null
    }

    const [handleLine = '', pidLine = '', ...titleLines] = raw.split(/\r?\n/)
    const handle = Number(String(handleLine).trim())
    const pid = Number(String(pidLine).trim())
    const title = titleLines.join('\n').trim()

    if (!Number.isFinite(handle) || handle <= 0) {
      this.logger.warn('failed to parse foreground window handle', { raw })
      return null
    }

    if (!Number.isFinite(pid) || pid <= 0) {
      this.logger.warn('failed to parse foreground window pid', { raw, handle, title })
    }

    return {
      handle,
      pid: Number.isFinite(pid) && pid > 0 ? pid : null,
      title
    }
  }

  static async findRunningPidByExecutablePath(executablePath: string) {
    const normalizedPath = path.normalize(executablePath).replace(/\\/g, '\\\\').replace(/'/g, "''")
    const foregroundPid = await this.getForegroundWindowPid()
    const stdout = await this.runPowerShell(`
$targetPath = '${normalizedPath}'
$items = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -ieq $targetPath } | Select-Object -ExpandProperty ProcessId
$items | ForEach-Object { Write-Output $_ }
`)

    const pids = String(stdout)
      .split(/\r?\n/)
      .map((item) => Number(item.trim()))
      .filter((pid) => Number.isFinite(pid) && pid > 0)

    if (!pids.length) {
      return null
    }

    if (foregroundPid && pids.includes(foregroundPid)) {
      return foregroundPid
    }

    return pids[0] ?? null
  }

  private static async resolveActiveResourceLogByForegroundPid(foregroundPid: number) {
    const exactMatch = await DatabaseService.getLatestActiveResourceLogByPid(foregroundPid)
    if (exactMatch) {
      this.logger.info('matched active resource log by exact foreground pid', {
        foregroundPid,
        resourceId: exactMatch.resourceId
      })
      return exactMatch
    }

    const lineagePids = await this.getProcessLineagePids(foregroundPid)
    const activeLogs = await DatabaseService.getActiveResourceLogsWithPid()
    const activeLogByPid = new Map(
      activeLogs
        .filter((logItem) => typeof logItem.pid === 'number')
        .map((logItem) => [Number(logItem.pid), logItem])
    )

    for (const pid of lineagePids) {
      const matchedLog = activeLogByPid.get(pid)
      if (matchedLog) {
        this.logger.info('matched active resource log by process lineage', {
          foregroundPid,
          matchedPid: pid,
          lineagePids,
          resourceId: matchedLog.resourceId
        })
        return matchedLog
      }
    }

    this.logger.warn('no active resource log matched process lineage', {
      foregroundPid,
      lineagePids
    })
    return null
  }

  private static async getProcessLineagePids(pid: number, maxDepth: number = 8) {
    const lineage: number[] = []
    const visited = new Set<number>()
    let currentPid: number | null = pid
    let depth = 0

    while (currentPid && currentPid > 0 && !visited.has(currentPid) && depth < maxDepth) {
      lineage.push(currentPid)
      visited.add(currentPid)
      const processInfo = await this.getProcessInfo(currentPid)
      currentPid = processInfo?.parentPid ?? null
      depth += 1
    }

    return lineage
  }

  private static async getProcessInfo(pid: number) {
    const stdout = await this.runPowerShell(`
$item = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object ProcessId, ParentProcessId, ExecutablePath
if (-not $item) {
  Write-Output "{}"
  exit 0
}
$item | ConvertTo-Json -Compress
`)

    const raw = String(stdout).trim()
    if (!raw || raw === '{}') {
      return null
    }

    try {
      const parsed = JSON.parse(raw)
      return {
        pid: Number(parsed.ProcessId),
        parentPid: Number(parsed.ParentProcessId),
        executablePath: String(parsed.ExecutablePath ?? '')
      }
    } catch (error) {
      this.logger.warn('failed to parse process info', { pid, raw, error })
      return null
    }
  }

  private static async captureWindowToFile(pid: number, outputPath: string) {
    if (process.platform !== 'win32') {
      throw new Error('当前平台暂不支持窗口截图')
    }

    const normalizedOutputPath = outputPath.replace(/\\/g, '\\\\').replace(/'/g, "''")

    await this.runPowerShell(`
$signature = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class Win32Capture {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public const int SW_RESTORE = 9;
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, int nFlags);
}
"@
Add-Type -TypeDefinition $signature -ReferencedAssemblies 'System.Drawing','System.Runtime.InteropServices'
[uint32]$targetPid = ${pid}
$matchedWindow = [IntPtr]::Zero
function Find-VisibleWindowHandle {
  param(
    [uint32]$Pid
  )

  $script:matchedWindow = [IntPtr]::Zero
  [Win32Capture]::EnumWindows({
    param($hWnd, $lParam)
    if (-not [Win32Capture]::IsWindowVisible($hWnd)) {
      return $true
    }
    [uint32]$windowPid = 0
    [Win32Capture]::GetWindowThreadProcessId($hWnd, [ref]$windowPid) | Out-Null
    if ($windowPid -ne $Pid) {
      return $true
    }
    $length = [Win32Capture]::GetWindowTextLength($hWnd)
    if ($length -le 0) {
      return $true
    }
    $builder = New-Object System.Text.StringBuilder ($length + 1)
    [Win32Capture]::GetWindowText($hWnd, $builder, $builder.Capacity) | Out-Null
    if ([string]::IsNullOrWhiteSpace($builder.ToString())) {
      return $true
    }
    $script:matchedWindow = $hWnd
    return $false
  }, [IntPtr]::Zero) | Out-Null

  return $script:matchedWindow
}

for ($attempt = 0; $attempt -lt 24; $attempt++) {
  $matchedWindow = Find-VisibleWindowHandle -Pid $targetPid
  if ($matchedWindow -ne [IntPtr]::Zero) {
    break
  }

  Start-Sleep -Milliseconds 500
}

if ($matchedWindow -eq [IntPtr]::Zero) {
  throw '未找到对应的可见窗口'
}
$rect = New-Object Win32Capture+RECT
[Win32Capture]::GetWindowRect($matchedWindow, [ref]$rect) | Out-Null
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) {
  throw '窗口尺寸无效'
}

if ([Win32Capture]::IsIconic($matchedWindow)) {
  [Win32Capture]::ShowWindow($matchedWindow, [Win32Capture]::SW_RESTORE) | Out-Null
}
[Win32Capture]::SetForegroundWindow($matchedWindow) | Out-Null
Start-Sleep -Milliseconds 250

$captureFlags = [System.Drawing.CopyPixelOperation]::SourceCopy -bor [System.Drawing.CopyPixelOperation]::CaptureBlt

function Test-BitmapLooksBlank {
  param(
    [System.Drawing.Bitmap]$Bitmap
  )

  if (-not $Bitmap) {
    return $true
  }

  $sampleColumns = [Math]::Min(24, [Math]::Max(6, [int]($Bitmap.Width / 40)))
  $sampleRows = [Math]::Min(24, [Math]::Max(6, [int]($Bitmap.Height / 40)))
  $darkSamples = 0
  $sampleCount = 0

  for ($x = 0; $x -lt $sampleColumns; $x++) {
    for ($y = 0; $y -lt $sampleRows; $y++) {
      $sampleX = [Math]::Min($Bitmap.Width - 1, [int](($x + 0.5) * $Bitmap.Width / $sampleColumns))
      $sampleY = [Math]::Min($Bitmap.Height - 1, [int](($y + 0.5) * $Bitmap.Height / $sampleRows))
      $pixel = $Bitmap.GetPixel($sampleX, $sampleY)
      $sampleCount++
      if (($pixel.R + $pixel.G + $pixel.B) -lt 24) {
        $darkSamples++
      }
    }
  }

  if ($sampleCount -eq 0) {
    return $true
  }

  return ($darkSamples / $sampleCount) -ge 0.96
}

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
try {
  $printed = [Win32Capture]::PrintWindow($matchedWindow, $hdc, 2)
} finally {
  $graphics.ReleaseHdc($hdc)
}
$useScreenFallback = (-not $printed) -or (Test-BitmapLooksBlank -Bitmap $bitmap)
if ($useScreenFallback) {
  $graphics.Clear([System.Drawing.Color]::Black)
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size, $captureFlags)
}
$bitmap.Save('${normalizedOutputPath}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`)

    if (!await fs.pathExists(outputPath)) {
      throw new Error('截图失败：输出文件未生成')
    }
  }

  private static async ensureScreenshotFolder(resourceId: string) {
    const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)
    const cacheRoot = String(cacheSetting?.value ?? Settings.CACHE_PATH.default).trim()

    if (!cacheRoot || cacheRoot === '__CACHE_PATH__') {
      throw new Error('未配置截图缓存目录')
    }

    const screenshotFolder = path.join(cacheRoot, 'screenshot', resourceId)
    await fs.ensureDir(screenshotFolder)
    return screenshotFolder
  }

  private static async createTempScreenshotPath(pid: number) {
    const cacheSetting = await DatabaseService.getSetting(Settings.CACHE_PATH)
    const cacheRoot = String(cacheSetting?.value ?? Settings.CACHE_PATH.default).trim()

    if (!cacheRoot || cacheRoot === '__CACHE_PATH__') {
      throw new Error('未配置截图缓存目录')
    }

    const tempDir = path.join(cacheRoot, 'screenshot', '_temp')
    await fs.ensureDir(tempDir)
    return path.join(tempDir, `cover-${pid}-${Date.now()}.png`)
  }

  private static buildTimestamp() {
    const now = new Date()
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  }

  private static async waitForWindowReady(delayMs: number) {
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs)
    })
  }

  private static runPowerShell(script: string) {
    return new Promise<string>((resolve, reject) => {
      const wrappedScript = `
$ProgressPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
${script}
`
      const encodedCommand = Buffer.from(wrappedScript, 'utf16le').toString('base64')
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', encodedCommand
      ], {
        windowsHide: true
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []

      child.stdout.on('data', (chunk) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })

      child.stderr.on('data', (chunk) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })

      child.once('error', (error) => {
        this.logger.error('powershell spawn failed', error)
        reject(error)
      })

      child.once('close', (code) => {
        const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
        const stderr = this.normalizePowerShellMessage(Buffer.concat(stderrChunks).toString('utf8'))
        if (code === 0) {
          resolve(stdout.trim())
          return
        }

        const message = stderr.trim() || stdout.trim() || `PowerShell 执行失败，退出码 ${code}`
        reject(new Error(message))
      })
    })
  }

  private static normalizePowerShellMessage(raw: string) {
    const normalizedRaw = String(raw ?? '').trim()
    if (!normalizedRaw) {
      return ''
    }

    if (!normalizedRaw.startsWith('#< CLIXML')) {
      return normalizedRaw
    }

    const textMatches = Array.from(normalizedRaw.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g))
      .map((match) => String(match[1] ?? '').trim())
      .filter(Boolean)

    if (!textMatches.length) {
      return normalizedRaw
    }

    return textMatches
      .map((item) => item.replace(/_x000D__x000A_/g, '\n').replace(/_x([0-9A-Fa-f]{4})_/g, (_all, hex) => String.fromCharCode(parseInt(hex, 16))))
      .join('\n')
      .trim()
  }
}
