const fs = require('fs')
const path = require('path')
const { Arch } = require('builder-util')

async function pathExists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function removeIfExists(targetPath) {
  if (!(await pathExists(targetPath))) {
    return
  }

  await fs.promises.rm(targetPath, { recursive: true, force: true })
}

async function listSubdirectories(targetPath) {
  if (!(await pathExists(targetPath))) {
    return []
  }

  const entries = await fs.promises.readdir(targetPath, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

function resolveTargetArchName(arch) {
  if (typeof arch === 'string') {
    return arch
  }

  if (typeof arch === 'number') {
    return Arch[arch] || 'x64'
  }

  return 'x64'
}

function resolveTargetPlatformName(context) {
  return String(
    context.electronPlatformName
      || context.platform?.nodeName
      || process.platform
  ).trim()
}

async function pruneFfprobeStatic(nodeModulesDir, platformName, archName) {
  const ffprobeBinDir = path.join(nodeModulesDir, 'ffprobe-static', 'bin')
  if (!(await pathExists(ffprobeBinDir))) {
    return
  }

  const keepRelativeDir = path.join(platformName, archName)
  const platformDirs = await listSubdirectories(ffprobeBinDir)

  for (const platformDirName of platformDirs) {
    const platformDirPath = path.join(ffprobeBinDir, platformDirName)
    const archDirs = await listSubdirectories(platformDirPath)

    for (const archDirName of archDirs) {
      const relativeDir = path.join(platformDirName, archDirName)
      if (relativeDir !== keepRelativeDir) {
        await removeIfExists(path.join(platformDirPath, archDirName))
      }
    }

    const remainingArchDirs = await listSubdirectories(platformDirPath)
    if (!remainingArchDirs.length) {
      await removeIfExists(platformDirPath)
    }
  }

  console.log(`[afterPack] kept ffprobe-static binary: ${keepRelativeDir.replace(/\\/g, '/')}`)
}

async function pruneFfmpegStatic(nodeModulesDir, platformName) {
  const ffmpegDir = path.join(nodeModulesDir, 'ffmpeg-static')
  if (!(await pathExists(ffmpegDir))) {
    return
  }

  const binaryNames = platformName === 'win32'
    ? new Set(['ffmpeg.exe'])
    : new Set(['ffmpeg'])

  const metadataNames = new Set([
    'index.js',
    'package.json',
    'install.js',
    'example.js',
    'license',
    'ffmpeg.exe.license',
    'ffmpeg.exe.readme',
    'ffmpeg.license',
    'ffmpeg.readme'
  ])

  const entries = await fs.promises.readdir(ffmpegDir, { withFileTypes: true })
  for (const entry of entries) {
    const entryName = entry.name
    const entryNameLower = entryName.toLowerCase()
    const shouldKeep = binaryNames.has(entryNameLower) || metadataNames.has(entryNameLower)

    if (!shouldKeep) {
      await removeIfExists(path.join(ffmpegDir, entryName))
    }
  }

  console.log(`[afterPack] pruned ffmpeg-static for platform: ${platformName}`)
}

exports.default = async function afterPack(context) {
  const appOutDir = String(context.appOutDir || '').trim()
  if (!appOutDir) {
    return
  }

  const platformName = resolveTargetPlatformName(context)
  const archName = resolveTargetArchName(context.arch)
  const nodeModulesDir = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules')

  if (!(await pathExists(nodeModulesDir))) {
    return
  }

  await pruneFfprobeStatic(nodeModulesDir, platformName, archName)
  await pruneFfmpegStatic(nodeModulesDir, platformName)
}
