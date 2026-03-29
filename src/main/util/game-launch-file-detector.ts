import path from 'path'
import fs from 'fs-extra'

const MAX_SCAN_ENTRIES = 20000
const CONFIG_LIKE_NAME_PATTERN = /(config|setting|settings|setup|install|uninstall|unins|update|updater|patch|crash|report|vc_redist|dxsetup|redist|runtime|tool|tools)/i
const LOW_PRIORITY_DIR_PATTERN = /(redist|runtime|support|tool|tools|crash|patch|update|doc|docs|manual|readme|_commonredist)/i

type LaunchCandidate = {
  fullPath: string
  fileName: string
  extension: string
  depth: number
}

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const getExtensionPriority = (extension: string) => {
  switch (extension) {
    case '.exe':
      return 400
    case '.bat':
      return 300
    case '.swf':
      return 200
    case '.html':
    case '.htm':
      return 100
    default:
      return -1
  }
}

const isAllowedLaunchExtension = (extension: string) =>
  ['.exe', '.bat', '.swf', '.html', '.htm'].includes(extension)

const shouldExcludeExe = (fileName: string) =>
  CONFIG_LIKE_NAME_PATTERN.test(path.parse(fileName).name)

// Score candidates instead of stopping at the first hit so breadth-first search
// can still prefer the most "game-like" executable in large directories.
const scoreCandidate = (candidate: LaunchCandidate, rootDirName: string) => {
  const extensionPriority = getExtensionPriority(candidate.extension)
  if (extensionPriority < 0) {
    return Number.NEGATIVE_INFINITY
  }

  const normalizedRootDirName = normalizeName(rootDirName)
  const parsedName = path.parse(candidate.fileName).name
  const normalizedFileName = normalizeName(parsedName)
  const normalizedPath = candidate.fullPath.toLowerCase()
  let score = extensionPriority

  if (candidate.extension === '.exe' && shouldExcludeExe(candidate.fileName)) {
    return Number.NEGATIVE_INFINITY
  }

  score += Math.max(0, 8 - candidate.depth) * 24

  if (candidate.depth === 0) {
    score += 60
  }

  if (normalizedRootDirName && normalizedFileName === normalizedRootDirName) {
    score += 120
  } else if (normalizedRootDirName && normalizedFileName.startsWith(normalizedRootDirName)) {
    score += 80
  } else if (normalizedRootDirName && normalizedFileName.includes(normalizedRootDirName)) {
    score += 40
  }

  if (candidate.extension === '.html' || candidate.extension === '.htm') {
    if (normalizedFileName === 'index' || normalizedFileName === 'game') {
      score += 40
    }
  }

  if (candidate.extension === '.bat' && normalizedFileName.includes('start')) {
    score += 24
  }

  if (LOW_PRIORITY_DIR_PATTERN.test(normalizedPath)) {
    score -= 120
  }

  return score
}

// Breadth-first traversal keeps shallow launchers ahead of deeply nested tools,
// while still ensuring we can eventually find a starter file in complex layouts.
const collectLaunchCandidates = async (rootDir: string) => {
  const candidates: LaunchCandidate[] = []
  const queue: Array<{ dirPath: string; depth: number }> = [{ dirPath: rootDir, depth: 0 }]
  let visitedEntries = 0

  while (queue.length > 0 && visitedEntries < MAX_SCAN_ENTRIES) {
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
      visitedEntries += 1
      if (visitedEntries > MAX_SCAN_ENTRIES) {
        break
      }

      const fullPath = path.join(current.dirPath, entry.name)
      if (entry.isDirectory()) {
        queue.push({ dirPath: fullPath, depth: current.depth + 1 })
        continue
      }

      const extension = path.extname(entry.name).toLowerCase()
      if (!isAllowedLaunchExtension(extension)) {
        continue
      }

      candidates.push({
        fullPath,
        fileName: entry.name,
        extension,
        depth: current.depth
      })
    }
  }

  return candidates
}

export const detectGameLaunchFile = async (targetPath: string) => {
  const normalizedPath = path.normalize(String(targetPath ?? '').trim())
  if (!normalizedPath) {
    return null
  }

  if (!await fs.pathExists(normalizedPath)) {
    return null
  }

  const stats = await fs.stat(normalizedPath)
  if (!stats.isDirectory()) {
    return normalizedPath
  }

  const rootDirName = path.basename(normalizedPath)
  const candidates = await collectLaunchCandidates(normalizedPath)
  if (!candidates.length) {
    return null
  }

  const sortedCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, rootDirName)
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score)

  return sortedCandidates[0]?.fullPath ?? null
}
