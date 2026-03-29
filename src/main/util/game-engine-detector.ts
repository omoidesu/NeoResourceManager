import path from 'path'
import fs from 'fs-extra'

type DetectionContext = {
  gamePath: string
  gameDir: string
  gameFileName: string
  fileNames: string[]
  filePaths: string[]
}

type EngineDetector = (context: DetectionContext) => Promise<string | null> | string | null

const listDirNames = async (dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath)
    return entries.map((entry) => String(entry).toLowerCase())
  } catch {
    return []
  }
}

const detectFlash: EngineDetector = (context) => {
  if (context.gamePath.toLowerCase().endsWith('.swf')) {
    return 'Flash'
  }
  return null
}

const detectUnity: EngineDetector = (context) => {
  const hasUnityPlayer = context.fileNames.includes('unityplayer.dll')
  const hasUnityData = context.fileNames.includes(`${context.gameFileName.toLowerCase()}_data`)
  return hasUnityPlayer || hasUnityData ? 'Unity' : null
}

const detectUnrealEngine: EngineDetector = (context) => {
  if (context.fileNames.some((file) => file === 'engine' || file.endsWith('.uproject'))) {
    return 'Unreal Engine'
  }
  return null
}

const detectGodot: EngineDetector = (context) => {
  if (context.fileNames.some((file) => file.endsWith('.pck') || file.includes('godot'))) {
    return 'Godot'
  }
  return null
}

const detectRPGMakerOldVersions: EngineDetector = (context) => {
  if (context.fileNames.some((file) => file.endsWith('.rxproj') || file.endsWith('.rgssad'))) {
    return 'RPG Maker XP'
  }

  if (context.fileNames.some((file) => file.endsWith('.rvproj') || file.endsWith('.rgss2a'))) {
    return 'RPG Maker VX'
  }

  if (context.fileNames.some((file) => file.endsWith('.rvproj2') || file.endsWith('.rgss3a'))) {
    return 'RPG Maker VX Ace'
  }

  const hasIni = context.fileNames.some((file) => file.endsWith('.ini'))
  const hasLdb = context.fileNames.some((file) => file.endsWith('.ldb'))
  const hasLmt = context.fileNames.some((file) => file.endsWith('.lmt'))
  return hasIni && hasLdb && hasLmt ? 'RPG Maker 2000/2003' : null
}

const detectRPGMaker: EngineDetector = async (context) => {
  if (context.fileNames.some((file) => file.endsWith('.rmmzproject'))) {
    return 'RPG Maker MZ'
  }

  if (context.fileNames.some((file) => file.endsWith('.rpgproject'))) {
    return 'RPG Maker MV'
  }

  const hasPackageJson = context.fileNames.includes('package.json')
  const hasWwwFolder = context.fileNames.includes('www')
  const hasJsFolder = context.fileNames.includes('js')

  if (!hasPackageJson) {
    return null
  }

  if (hasWwwFolder) {
    const wwwJsFiles = await listDirNames(path.join(context.gameDir, 'www', 'js'))
    if (wwwJsFiles.some((file) => file.includes('rpg_core.js'))) {
      return 'RPG Maker MV'
    }
  }

  if (hasJsFolder) {
    const jsFiles = await listDirNames(path.join(context.gameDir, 'js'))
    if (jsFiles.some((file) => file.includes('rmmz_core.js'))) {
      return 'RPG Maker MZ'
    }
  }

  return null
}

const detectWolfRpg: EngineDetector = async (context) => {
  const hasConfigExe = context.fileNames.includes('config.exe')
  if (!hasConfigExe) {
    return null
  }

  if (context.fileNames.includes('data.wolf')) {
    return 'Wolf RPG Editor'
  }

  if (context.fileNames.includes('data')) {
    const dataFiles = await listDirNames(path.join(context.gameDir, 'data'))
    if (dataFiles.some((file) => file.endsWith('.wolf'))) {
      return 'Wolf RPG Editor'
    }
  }

  return null
}

const detectSrpgStudio: EngineDetector = (context) => {
  const requiredFiles = ['data.dts', 'environment.evs', 'runtime.rts']
  return requiredFiles.every((file) => context.fileNames.includes(file)) ? 'SRPG Studio' : null
}

const detectBakin: EngineDetector = async (context) => {
  if (!context.fileNames.includes('data')) {
    return null
  }

  const dataFiles = await listDirNames(path.join(context.gameDir, 'data'))
  const hasPlayer = dataFiles.includes('bakinplayer.exe')
  const hasConfig = dataFiles.includes('bakinplayer.exe.config')
  return hasPlayer && hasConfig ? 'RPG Developer Bakin' : null
}

const detectTyranoBuilder: EngineDetector = (context) => {
  return context.fileNames.some((file) => file.includes('tyrano_data') || file.includes('tyranodata'))
    ? 'TyranoBuilder'
    : null
}

const detectRenpy: EngineDetector = (context) => {
  const hasRenpy = context.fileNames.includes('renpy')
  const hasGame = context.fileNames.includes('game')
  return hasRenpy && hasGame ? "Ren'Py" : null
}

const detectJava: EngineDetector = (context) => {
  return context.fileNames.some((file) => file.endsWith('.jar')) ? 'Java' : null
}

const detectKirikiri: EngineDetector = (context) => {
  return context.fileNames.some((file) => file.endsWith('.xp3') || file === 'data.xp3')
    ? 'KIRIKIRI'
    : null
}

const detectElectron: EngineDetector = async (context) => {
  if (!context.fileNames.includes('resources')) {
    return null
  }

  const resourcesFiles = await listDirNames(path.join(context.gameDir, 'resources'))
  return resourcesFiles.some((file) => file.endsWith('.asar')) ? 'JavaScript' : null
}

const detectWebGame: EngineDetector = (context) => {
  return context.gamePath.toLowerCase().endsWith('.html') ? '网页游戏' : null
}

const engineDetectors: EngineDetector[] = [
  detectFlash,
  detectUnity,
  detectUnrealEngine,
  detectGodot,
  detectRPGMaker,
  detectRPGMakerOldVersions,
  detectWolfRpg,
  detectSrpgStudio,
  detectBakin,
  detectTyranoBuilder,
  detectRenpy,
  detectJava,
  detectKirikiri,
  detectElectron,
  detectWebGame
]

export const detectGameEngine = async (gamePath: string) => {
  const normalizedGamePath = String(gamePath ?? '').trim()
  if (!normalizedGamePath) {
    return null
  }

  const parsedPath = path.parse(normalizedGamePath)
  const gameDir = parsedPath.dir
  const gameFileName = parsedPath.name

  if (!gameDir || !await fs.pathExists(gameDir)) {
    return null
  }

  const files = await listDirNames(gameDir)
  const filePaths = files.map((file) => path.join(gameDir, file).toLowerCase())
  const context: DetectionContext = {
    gamePath: normalizedGamePath,
    gameDir,
    gameFileName,
    fileNames: files,
    filePaths
  }

  for (const detector of engineDetectors) {
    const matchedEngine = await detector(context)
    if (matchedEngine) {
      return matchedEngine
    }
  }

  return null
}
