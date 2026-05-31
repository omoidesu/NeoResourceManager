import { execFileSync } from 'child_process'
import { createLogger } from '../util/logger'

export type VideoH264Encoder = 'h264_nvenc' | 'h264_amf' | 'h264_qsv' | 'libx264'
export type VideoH264EncoderOptions = {
  allowHardware?: boolean
  allowCpu?: boolean
}

const logger = createLogger('video-transcode-capability')
const encoderCache = new Map<string, VideoH264Encoder | null>()

export function buildVideoH264EncoderArgs(encoder: VideoH264Encoder, options: { lowLatency?: boolean } = {}) {
  if (encoder === 'h264_nvenc') {
    const args = ['-c:v', encoder, '-preset', 'p4', '-cq', '23']
    if (options.lowLatency) {
      args.push('-bf', '0', '-g', '30', '-rc-lookahead', '0', '-zerolatency', '1')
    }
    args.push('-pix_fmt', 'yuv420p')
    return args
  }

  if (encoder === 'h264_amf') {
    return ['-c:v', encoder, '-quality', 'speed', '-rc', 'cqp', '-qp_i', '23', '-qp_p', '23', '-pix_fmt', 'yuv420p']
  }

  if (encoder === 'h264_qsv') {
    return ['-c:v', encoder, '-preset', 'veryfast', '-global_quality', '23', '-pix_fmt', 'yuv420p']
  }

  return ['-c:v', encoder, '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p']
}

function canStartVideoH264Encoder(ffmpegExecutablePath: string, encoder: VideoH264Encoder) {
  try {
    execFileSync(
      ffmpegExecutablePath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=256x256:d=0.1',
        '-frames:v',
        '1',
        ...buildVideoH264EncoderArgs(encoder),
        '-f',
        'null',
        '-'
      ],
      {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5000
      }
    )
    return true
  } catch {
    return false
  }
}

export function resolveVideoH264Encoder(
  ffmpegExecutablePath: string,
  options: VideoH264EncoderOptions = {}
): VideoH264Encoder | null {
  const cacheKey = String(ffmpegExecutablePath ?? '').trim()
  const allowHardware = options.allowHardware !== false
  const allowCpu = options.allowCpu !== false
  const cacheKeyWithOptions = `${cacheKey}|hardware=${allowHardware ? '1' : '0'}|cpu=${allowCpu ? '1' : '0'}`
  if (encoderCache.has(cacheKeyWithOptions)) {
    return encoderCache.get(cacheKeyWithOptions) ?? null
  }

  const encoderCandidates: VideoH264Encoder[] = [
    ...(allowHardware ? ['h264_nvenc', 'h264_amf', 'h264_qsv'] as VideoH264Encoder[] : []),
    ...(allowCpu ? ['libx264'] as VideoH264Encoder[] : [])
  ]
  const encoder = encoderCandidates.find((candidate) =>
    canStartVideoH264Encoder(cacheKey, candidate)
  ) ?? null

  encoderCache.set(cacheKeyWithOptions, encoder)
  logger.info('resolved video h264 encoder', { encoder })

  return encoder
}
