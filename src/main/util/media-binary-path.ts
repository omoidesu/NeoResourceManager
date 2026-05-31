import fs from 'fs'
import path from 'path'

const ffmpegStatic = require('ffmpeg-static') as string | null
const ffprobeStatic = require('ffprobe-static') as { path?: string }

function buildAsarUnpackedCandidatePaths(inputPath: string) {
  const normalizedInputPath = path.normalize(String(inputPath ?? '').trim())
  if (!normalizedInputPath) {
    return []
  }

  const candidates: string[] = []
  const asarSegment = `${path.sep}app.asar${path.sep}`
  if (normalizedInputPath.includes(asarSegment)) {
    candidates.push(normalizedInputPath.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`))
  }

  const asarSuffixSegment = `${path.sep}app.asar`
  if (normalizedInputPath.endsWith(asarSuffixSegment)) {
    candidates.push(normalizedInputPath.slice(0, -asarSuffixSegment.length) + `${path.sep}app.asar.unpacked`)
  }

  candidates.push(normalizedInputPath)

  return Array.from(new Set(candidates))
}

function resolveBundledExecutablePath(inputPath: string) {
  const candidates = buildAsarUnpackedCandidatePaths(inputPath)
  for (const candidatePath of candidates) {
    if (candidatePath && fs.existsSync(candidatePath)) {
      return candidatePath
    }
  }

  return ''
}

export function getBundledFfmpegPath() {
  return resolveBundledExecutablePath(String(ffmpegStatic ?? '').trim())
}

export function getBundledFfprobePath() {
  return resolveBundledExecutablePath(String(ffprobeStatic?.path ?? '').trim())
}
