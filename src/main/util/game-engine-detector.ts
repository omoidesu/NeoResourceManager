import path from 'path'
import fs from 'fs-extra'
import { execFile } from 'child_process'
import { promisify } from 'util'

type DetectionContext = {
  gamePath: string
  gameDir: string
  gameFileName: string
  gameExtension: string
  rootNames: Set<string>
  shallowPaths: Set<string>
}

type EngineDetector = (context: DetectionContext) => Promise<string | null> | string | null

type VersionInfo = Partial<{
  ProductName: string
  FileDescription: string
  InternalName: string
  OriginalFilename: string
  ProductVersion: string
  FileVersion: string
  CompanyName: string
}>

export type GameEngineProfile = {
  engineName: string | null
  mtoolSupported: boolean
  mtoolHookFiles: string[]
  requiresLocaleEmulator: boolean
  localeEmulatorReason: string | null
}

const execFileAsync = promisify(execFile)
const SHALLOW_SCAN_DEPTH = 2
const SHALLOW_SCAN_LIMIT = 4000
const PE_MACHINE_OFFSET = 0x3c
const IMAGE_FILE_MACHINE_AMD64 = 0x8664

const normalizeName = (value: string) => String(value ?? '').trim().toLowerCase()

const normalizeRelativePath = (value: string) =>
  normalizeName(value)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')

const pathExistsSafe = async (targetPath: string) => {
  try {
    return await fs.pathExists(targetPath)
  } catch {
    return false
  }
}

const readDirNames = async (dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath)
    return entries.map((entry) => normalizeName(entry))
  } catch {
    return []
  }
}

const collectShallowPaths = async (rootDir: string, maxDepth = SHALLOW_SCAN_DEPTH, maxEntries = SHALLOW_SCAN_LIMIT) => {
  const results = new Set<string>()
  const queue: Array<{ dirPath: string; relativeDir: string; depth: number }> = [
    { dirPath: rootDir, relativeDir: '', depth: 0 }
  ]

  while (queue.length > 0 && results.size < maxEntries) {
    const current = queue.shift()
    if (!current) {
      break
    }

    let entries: fs.Dirent[]
    try {
      entries = await fs.readdir(current.dirPath, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryName = normalizeName(entry.name)
      if (!entryName) {
        continue
      }

      const relativePath = normalizeRelativePath(
        current.relativeDir ? `${current.relativeDir}/${entryName}` : entryName
      )
      results.add(relativePath)

      if (results.size >= maxEntries) {
        break
      }

      if (entry.isDirectory() && current.depth < maxDepth) {
        queue.push({
          dirPath: path.join(current.dirPath, entry.name),
          relativeDir: relativePath,
          depth: current.depth + 1
        })
      }
    }
  }

  return results
}

const hasRootName = (context: DetectionContext, name: string) => context.rootNames.has(normalizeName(name))

const hasPath = (context: DetectionContext, relativePath: string) =>
  context.shallowPaths.has(normalizeRelativePath(relativePath))

const hasAnyPath = (context: DetectionContext, relativePaths: string[]) =>
  relativePaths.some((relativePath) => hasPath(context, relativePath))

const hasFileWithExtension = (context: DetectionContext, extension: string) => {
  const normalizedExtension = normalizeName(extension)
  for (const relativePath of context.shallowPaths) {
    if (relativePath.endsWith(normalizedExtension)) {
      return true
    }
  }

  return false
}

const hasRootFileWithExtension = (context: DetectionContext, extension: string) => {
  const normalizedExtension = normalizeName(extension)
  for (const rootName of context.rootNames) {
    if (rootName.endsWith(normalizedExtension)) {
      return true
    }
  }

  return false
}

const getAsciiView = (buffer: Buffer) => buffer.toString('latin1').toLowerCase()
const getUtf16View = (buffer: Buffer) => buffer.toString('utf16le').toLowerCase()

const bufferIncludesText = (buffer: Buffer | null, ...needles: string[]) => {
  if (!buffer || !needles.length) {
    return false
  }

  const asciiView = getAsciiView(buffer)
  const utf16View = getUtf16View(buffer)
  return needles.some((needle) => {
    const normalizedNeedle = normalizeName(needle)
    return normalizedNeedle && (asciiView.includes(normalizedNeedle) || utf16View.includes(normalizedNeedle))
  })
}

const parseVersionNumber = (value: string | null | undefined) => {
  const rawValue = String(value ?? '').trim()
  const matched = rawValue.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/) 
  if (!matched) {
    return null
  }

  const major = Number(matched[1] ?? '0')
  const minor = Number(matched[2] ?? '0')
  const patch = Number(matched[3] ?? '0')

  if (![major, minor, patch].every((item) => Number.isFinite(item))) {
    return null
  }

  return {
    major,
    minor,
    patch,
    value: major * 10000 + minor * 100 + patch
  }
}

const parsePeMachine = (buffer: Buffer | null) => {
  if (!buffer || buffer.length < PE_MACHINE_OFFSET + 6) {
    return null
  }

  const peHeaderOffset = buffer.readUInt32LE(PE_MACHINE_OFFSET)
  if (!Number.isFinite(peHeaderOffset) || peHeaderOffset <= 0 || peHeaderOffset + 6 > buffer.length) {
    return null
  }

  if (buffer.toString('ascii', peHeaderOffset, peHeaderOffset + 4) !== 'PE\u0000\u0000') {
    return null
  }

  return buffer.readUInt16LE(peHeaderOffset + 4)
}

const isExecutable64Bit = (buffer: Buffer | null) => parsePeMachine(buffer) === IMAGE_FILE_MACHINE_AMD64

const readExecutableBuffer = async (gamePath: string, gameDir: string) => {
  const executablePath = await findExecutablePath(gamePath, gameDir)
  if (!executablePath) {
    return null
  }

  try {
    return await fs.readFile(executablePath)
  } catch {
    return null
  }
}

const getVersionInfo = async (filePath: string | null): Promise<VersionInfo> => {
  if (!filePath) {
    return {}
  }

  try {
    const script = "$path = $args[0]; $info = (Get-Item -LiteralPath $path).VersionInfo; $info | Select-Object ProductName, FileDescription, InternalName, OriginalFilename, ProductVersion, FileVersion, CompanyName | ConvertTo-Json -Compress"
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script, filePath], {
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })

    return JSON.parse(String(stdout ?? '{}').trim() || '{}') as VersionInfo
  } catch {
    return {}
  }
}

const findExecutablePath = async (gamePath: string, gameDir: string) => {
  const normalizedGamePath = String(gamePath ?? '').trim()
  if (normalizeName(path.extname(normalizedGamePath)) === '.exe' && await pathExistsSafe(normalizedGamePath)) {
    return normalizedGamePath
  }

  try {
    const entries = await fs.readdir(gameDir)
    const executables = entries.filter((entry) => normalizeName(path.extname(entry)) === '.exe')
    const prioritized = executables.sort((left, right) => {
      const leftScore = /^(game|gamepro|config|start|launcher|setup)\.exe$/i.test(left) ? 0 : 1
      const rightScore = /^(game|gamepro|config|start|launcher|setup)\.exe$/i.test(right) ? 0 : 1
      return leftScore - rightScore || left.localeCompare(right)
    })

    return prioritized.length ? path.join(gameDir, prioritized[0]) : null
  } catch {
    return null
  }
}

const classifyWolfVersion = (versionInfo: VersionInfo, buffer: Buffer | null) => {
  const versionCandidates = [
    versionInfo.ProductVersion,
    versionInfo.FileVersion,
    versionInfo.FileDescription,
    versionInfo.ProductName
  ]

  for (const candidate of versionCandidates) {
    const parsed = parseVersionNumber(candidate)
    if (!parsed) {
      continue
    }

    if (parsed.major <= 2) {
      if (parsed.major < 2 || parsed.minor <= 24) {
        return 'Wolf RPG Ver 1.00 - 2.24'
      }

      return 'Wolf RPG Ver 2.25 - 2.99'
    }

    if (parsed.major === 3) {
      const versionCode = parsed.minor * 1000 + parsed.patch
      if (versionCode <= 3220) {
        return 'Wolf RPG Ver 3.00 - 3.322'
      }

      if (versionCode <= 3960) {
        return 'Wolf RPG Ver 3.323 - 3.396'
      }

      if (versionCode <= 6110) {
        return 'Wolf RPG Ver 3.500 - 3.611'
      }

      if (versionCode <= 6840) {
        return 'Wolf RPG Ver 3.612 - 3.684'
      }
    }
  }

  if (bufferIncludesText(buffer, 'wolf3611+', '3.612', '3.684')) {
    return 'Wolf RPG Ver 3.612 - 3.684'
  }

  if (bufferIncludesText(buffer, 'wolf350+', '3.500', '3.611')) {
    return 'Wolf RPG Ver 3.500 - 3.611'
  }

  if (bufferIncludesText(buffer, 'wolf3322+', '3.323', '3.396')) {
    return 'Wolf RPG Ver 3.323 - 3.396'
  }

  if (bufferIncludesText(buffer, 'wolf300+', '3.000', '3.322')) {
    return 'Wolf RPG Ver 3.00 - 3.322'
  }

  if (bufferIncludesText(buffer, 'wolf225+', '2.25')) {
    return 'Wolf RPG Ver 2.25 - 2.99'
  }

  if (bufferIncludesText(buffer, 'wolf224', '2.24')) {
    return 'Wolf RPG Ver 1.00 - 2.24'
  }

  return 'Wolf RPG Editor'
}

const detectFlash: EngineDetector = (context) => {
  return context.gameExtension === '.swf' ? 'Flash' : null
}

const detectWebGame: EngineDetector = (context) => {
  return ['.html', '.htm'].includes(context.gameExtension) ? '网页游戏' : null
}

const detectBakin: EngineDetector = (context) => {
  if (hasAnyPath(context, ['data/bakinplayer.exe', 'data/bakinplayer.exe.config'])) {
    return 'RPG Developer Bakin'
  }

  if (hasAnyPath(context, ['data/managed/assembly-csharp.dll', 'data/managed/assembly-csharp-firstpass.dll'])) {
    return 'RPG Developer Bakin'
  }

  return null
}

const detectSrpgStudio: EngineDetector = (context) => {
  return hasAnyPath(context, ['data.dts', 'environment.evs', 'runtime.rts'])
    && hasAnyPath(context, ['map', 'script', 'singleton'])
    ? 'SRPG Studio'
    : null
}

const detectWolfRpg: EngineDetector = async (context) => {
  const looksLikeWolf = hasPath(context, 'data.wolf')
    || (hasPath(context, 'data') && (await readDirNames(path.join(context.gameDir, 'data'))).some((file) => file.endsWith('.wolf')))
    || (hasRootName(context, 'config.exe') && hasAnyPath(context, ['game.exe', 'gamepro.exe', 'data', 'save']))

  if (!looksLikeWolf) {
    return null
  }

  const executablePath = await findExecutablePath(context.gamePath, context.gameDir)
  const [buffer, versionInfo] = await Promise.all([
    readExecutableBuffer(context.gamePath, context.gameDir),
    getVersionInfo(executablePath)
  ])

  const versionFingerprint = [
    versionInfo.ProductName,
    versionInfo.FileDescription,
    versionInfo.InternalName,
    versionInfo.OriginalFilename,
    versionInfo.CompanyName
  ].map((item) => normalizeName(item ?? '')).join(' ')

  if (!versionFingerprint.includes('wolf') && !versionFingerprint.includes('smokingwolf') && !bufferIncludesText(buffer, 'smokingwolf', 'wolf rpg editor')) {
    return 'Wolf RPG Editor'
  }

  return classifyWolfVersion(versionInfo, buffer)
}

const detectRenpy: EngineDetector = async (context) => {
  const looksLikeRenpy = (hasRootName(context, 'renpy') && hasRootName(context, 'game'))
    || hasAnyPath(context, [
      'renpy.exe',
      'renpy.py',
      'renpy.sh',
      'game/options.rpy',
      'game/script.rpyc',
      'game/gui.rpy',
      'lib/python2.7',
      'lib/python3.9',
      'lib/python3.12'
    ])

  if (!looksLikeRenpy) {
    return null
  }

  const buffer = await readExecutableBuffer(context.gamePath, context.gameDir)
  return isExecutable64Bit(buffer) ? "Ren'Py x64" : "Ren'Py"
}

const detectKirikiri: EngineDetector = async (context) => {
  const looksLikeKirikiri = hasFileWithExtension(context, '.xp3')
    || hasAnyPath(context, ['data.xp3', 'startup.tjs', 'config.tjs'])

  if (!looksLikeKirikiri) {
    return null
  }

  const executablePath = await findExecutablePath(context.gamePath, context.gameDir)
  const [buffer, versionInfo] = await Promise.all([
    readExecutableBuffer(context.gamePath, context.gameDir),
    getVersionInfo(executablePath)
  ])

  const fingerprint = [
    versionInfo.ProductName,
    versionInfo.FileDescription,
    versionInfo.InternalName,
    versionInfo.OriginalFilename
  ].map((item) => normalizeName(item ?? '')).join(' ')

  if (isExecutable64Bit(buffer) || fingerprint.includes('64')) {
    return 'Kirikiri Z 64Bit'
  }

  if (fingerprint.includes('kirikiri z') || fingerprint.includes('krkrz') || bufferIncludesText(buffer, 'tvp(kirikiri) z core', 'krkrz', 'kirikiri z')) {
    return 'Kirikiri Z'
  }

  if (fingerprint.includes('kirikiri 2') || fingerprint.includes('krkr2') || bufferIncludesText(buffer, 'tvp(kirikiri) 2 core', 'krkr2', 'oldkrkr')) {
    return 'Kirikiri 2'
  }

  return 'KIRIKIRI'
}

const detectTyrano: EngineDetector = (context) => {
  if (hasAnyPath(context, [
    'tyrano',
    'tyrano/libs',
    'tyrano_data',
    'data/scenario.ks',
    'data/system/config.tjs'
  ])) {
    return 'Tyrano'
  }

  return null
}

const detectRPGMakerOldVersions: EngineDetector = (context) => {
  if (hasRootFileWithExtension(context, '.rxproj') || hasPath(context, 'game.rgssad') || hasFileWithExtension(context, '.rgssad')) {
    return 'RPG Maker XP'
  }

  if (hasRootFileWithExtension(context, '.rvproj') || hasPath(context, 'game.rgss2a') || hasFileWithExtension(context, '.rgss2a')) {
    return 'RPG Maker VX'
  }

  if (hasRootFileWithExtension(context, '.rvproj2') || hasPath(context, 'game.rgss3a') || hasFileWithExtension(context, '.rgss3a')) {
    return 'RPG Maker VX Ace'
  }

  if (
    hasAnyPath(context, ['rpg_rt.ldb', 'rpg_rt.lmt'])
    || (
      hasAnyPath(context, ['rpg_rt.ini', 'rpg_rt.exe', 'rpg_rt.ldb', 'rpg_rt.lmt'])
      && hasFileWithExtension(context, '.ldb')
      && hasFileWithExtension(context, '.lmt')
    )
  ) {
    return 'RPG Maker 2000/2003'
  }

  return null
}

const detectMkxp: EngineDetector = async (context) => {
  const looksLikeMkxp = hasAnyPath(context, ['mkxp.conf', 'mkxp.json', 'mkxp-z.dll'])
    || hasRootName(context, 'mkxp.conf')
    || hasRootName(context, 'mkxp-z.exe')

  if (!looksLikeMkxp) {
    return null
  }

  const buffer = await readExecutableBuffer(context.gamePath, context.gameDir)
  return isExecutable64Bit(buffer) ? 'RPG Maker MKXP (Z) 64Bit' : 'RPG Maker MKXP (Z)'
}

const detectRPGMakerNodeWeb: EngineDetector = (context) => {
  if (hasRootFileWithExtension(context, '.rmmzproject')) {
    return 'RPG Maker MZ'
  }

  if (hasRootFileWithExtension(context, '.rpgproject')) {
    return 'RPG Maker MV'
  }

  if (
    hasAnyPath(context, [
      'www/js/rpg_core.js',
      'www/js/rpg_managers.js',
      'www/data/system.json',
      'www/index.html'
    ])
  ) {
    return 'RPG Maker MV'
  }

  if (
    hasAnyPath(context, [
      'js/rmmz_core.js',
      'js/rmmz_managers.js',
      'data/system.json',
      'index.html'
    ])
  ) {
    return 'RPG Maker MZ'
  }

  if (hasRootName(context, 'package.json') && hasAnyPath(context, ['www', 'js', 'www/index.html', 'index.html'])) {
    if (hasAnyPath(context, ['www/js/plugins.js', 'www/js/main.js', 'www/js/rpg_core.js'])) {
      return 'RPG Maker MV'
    }

    if (hasAnyPath(context, ['js/plugins.js', 'js/main.js', 'js/rmmz_core.js'])) {
      return 'RPG Maker MZ'
    }
  }

  return null
}

const detectPixelGameMakerMv: EngineDetector = (context) => {
  if (
    hasAnyPath(context, ['js/plugins/agtk.js', 'fonts/mplus-1m-regular.ttf'])
    || hasAnyPath(context, ['data/resources.json', 'data/tilesets'])
  ) {
    return 'Pixel Game Maker MV'
  }

  return null
}

const detectSmileGameBuilder: EngineDetector = async (context) => {
  const looksLikeSmileGameBuilder = hasAnyPath(context, [
    'data/managed/sharpkmybase.dll',
    'data/managed/sharpkmygfx.dll',
    'data.sgbpack',
    'common.dll',
    'kmycore.dll',
    'sharpkmycore.dll',
    'sgbplog.txt',
    'en/sgb_rpgplayer.resources.dll',
    'smilegamebuilder_dat',
    'bgm',
    'fonts'
  ])

  if (!looksLikeSmileGameBuilder) {
    const executablePath = await findExecutablePath(context.gamePath, context.gameDir)
    const versionInfo = await getVersionInfo(executablePath)
    const fingerprint = [
      versionInfo.ProductName,
      versionInfo.FileDescription,
      versionInfo.InternalName,
      versionInfo.OriginalFilename
    ].map((item) => normalizeName(item ?? '')).join(' ')

    if (
      !fingerprint.includes('smile game builder')
      && !fingerprint.includes('sgb rpg player')
      && !fingerprint.includes('sgb_rpgplayer')
    ) {
      return null
    }
  }

  const buffer = await readExecutableBuffer(context.gamePath, context.gameDir)
  const is64Bit = isExecutable64Bit(buffer)
  const hasUnityBridge = hasAnyPath(context, ['unityplayer.dll', 'gameassembly.dll', 'data/managed/assembly-csharp.dll'])

  if (hasUnityBridge) {
    return is64Bit ? 'SMILE GAME BUILDER +Unity x64' : 'SMILE GAME BUILDER +Unity x86'
  }

  return 'SMILE GAME BUILDER x86'
}

const detectUnity: EngineDetector = (context) => {
  const expectedDataDir = context.gameFileName ? `${normalizeName(context.gameFileName)}_data` : ''
  if (
    hasRootName(context, 'unityplayer.dll')
    || (expectedDataDir && hasRootName(context, expectedDataDir))
    || hasAnyPath(context, ['gameassembly.dll', 'mono/mono.dll', 'globalgamemanagers'])
  ) {
    return 'Unity'
  }

  return null
}

const detectUnrealEngine: EngineDetector = (context) => {
  if (
    hasRootName(context, 'engine')
    || hasFileWithExtension(context, '.uproject')
    || hasAnyPath(context, ['engine/binaries', 'engine/content', `${context.gameFileName.toLowerCase()}.uproject`])
  ) {
    return 'Unreal Engine'
  }

  return null
}

const detectGodot: EngineDetector = (context) => {
  if (hasFileWithExtension(context, '.pck') || hasRootName(context, 'godotsteam.dll') || hasRootName(context, 'godot.windows.opt.tools.64.exe')) {
    return 'Godot'
  }

  return null
}

const detectJava: EngineDetector = (context) => {
  return hasFileWithExtension(context, '.jar') ? 'Java' : null
}

const engineDetectors: EngineDetector[] = [
  detectFlash,
  detectWebGame,
  detectBakin,
  detectSrpgStudio,
  detectWolfRpg,
  detectRenpy,
  detectKirikiri,
  detectTyrano,
  detectRPGMakerOldVersions,
  detectMkxp,
  detectRPGMakerNodeWeb,
  detectPixelGameMakerMv,
  detectSmileGameBuilder,
  detectUnity,
  detectUnrealEngine,
  detectGodot,
  detectJava
]

const buildDetectionContext = async (gamePath: string): Promise<DetectionContext | null> => {
  const normalizedGamePath = String(gamePath ?? '').trim()
  if (!normalizedGamePath) {
    return null
  }

  if (!await pathExistsSafe(normalizedGamePath)) {
    return null
  }

  let stat: fs.Stats
  try {
    stat = await fs.stat(normalizedGamePath)
  } catch {
    return null
  }

  const gameDir = stat.isDirectory() ? normalizedGamePath : path.dirname(normalizedGamePath)
  if (!gameDir || !await pathExistsSafe(gameDir)) {
    return null
  }

  const gameFileName = stat.isDirectory()
    ? ''
    : normalizeName(path.parse(normalizedGamePath).name)
  const gameExtension = stat.isDirectory()
    ? ''
    : normalizeName(path.extname(normalizedGamePath))

  const rootNames = new Set(await readDirNames(gameDir))
  const shallowPaths = await collectShallowPaths(gameDir)

  return {
    gamePath: normalizedGamePath,
    gameDir,
    gameFileName,
    gameExtension,
    rootNames,
    shallowPaths
  }
}

const buildMtoolMetadata = (engineName: string | null) => {
  switch (engineName) {
    case 'RPG Maker MV':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['mzHook32.dll']
      }
    case 'RPG Maker MZ':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['mzHook.dll', 'mzHook32.dll']
      }
    case 'Tyrano':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['mzHook.dll', 'mzHook32.dll']
      }
    case 'RPG Maker XP':
    case 'RPG Maker VX':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['RGSSHook.dll']
      }
    case 'RPG Maker VX Ace':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['RGSSHook.dll', 'RGSSHook64.dll']
      }
    case 'RPG Maker MKXP (Z)':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['RGSSHook.dll']
      }
    case 'RPG Maker MKXP (Z) 64Bit':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['RGSSHook64.dll']
      }
    case 'Kirikiri 2':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['krkr2Hook.dll']
      }
    case 'Kirikiri Z':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['krkrzHook32.dll']
      }
    case 'Kirikiri Z 64Bit':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['krkrzHook64.dll']
      }
    case 'KIRIKIRI':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['krkr2Hook.dll', 'krkrzHook32.dll', 'krkrzHook64.dll']
      }
    case 'Wolf RPG Ver 1.00 - 2.24':
    case 'Wolf RPG Ver 2.25 - 2.99':
    case 'Wolf RPG Ver 3.00 - 3.322':
    case 'Wolf RPG Ver 3.323 - 3.396':
    case 'Wolf RPG Editor':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['wolfHook.dll']
      }
    case 'Wolf RPG Ver 3.500 - 3.611':
    case 'Wolf RPG Ver 3.612 - 3.684':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['wolfHook3.dll']
      }
    case 'SRPG Studio':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['SRPGHook.dll']
      }
    case 'Pixel Game Maker MV':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['AgtkHook.dll']
      }
    case 'SMILE GAME BUILDER x86':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['kmyHook.exe']
      }
    case 'SMILE GAME BUILDER +Unity x86':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['kmyHook.exe', 'kmyHookUnity.dll']
      }
    case 'SMILE GAME BUILDER +Unity x64':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['kmyHookUnity.dll']
      }
    case 'RPG Developer Bakin':
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['BakinLauncher.exe']
      }
    case "Ren'Py":
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['PythonHook.dll']
      }
    case "Ren'Py x64":
      return {
        mtoolSupported: true,
        mtoolHookFiles: ['PythonHook64.dll']
      }
    default:
      return {
        mtoolSupported: false,
        mtoolHookFiles: []
      }
  }
}

export const detectGameEngineProfile = async (gamePath: string): Promise<GameEngineProfile> => {
  const context = await buildDetectionContext(gamePath)
  if (!context) {
    return {
      engineName: null,
      mtoolSupported: false,
      mtoolHookFiles: [],
      requiresLocaleEmulator: false,
      localeEmulatorReason: null
    }
  }

  for (const detector of engineDetectors) {
    const matchedEngine = await detector(context)
    if (!matchedEngine) {
      continue
    }

    const mtoolMetadata = buildMtoolMetadata(matchedEngine)
    const requiresLocaleEmulator = ['KIRIKIRI', 'Kirikiri 2', 'Kirikiri Z', 'Kirikiri Z 64Bit'].includes(matchedEngine)

    return {
      engineName: matchedEngine,
      mtoolSupported: mtoolMetadata.mtoolSupported,
      mtoolHookFiles: mtoolMetadata.mtoolHookFiles,
      requiresLocaleEmulator,
      localeEmulatorReason: requiresLocaleEmulator
        ? 'MTool marks Kirikiri-family games as requiring LocaleEmulator support.'
        : null
    }
  }

  return {
    engineName: null,
    mtoolSupported: false,
    mtoolHookFiles: [],
    requiresLocaleEmulator: false,
    localeEmulatorReason: null
  }
}

export const detectGameEngine = async (gamePath: string) => {
  const profile = await detectGameEngineProfile(gamePath)
  return profile.engineName
}


