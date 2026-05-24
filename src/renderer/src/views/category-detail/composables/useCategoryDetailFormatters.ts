import {ResourceLaunchMode, ResourceLogSpecialTime} from '../../../../../common/constants'

export const useCategoryDetailFormatters = () => {
  const formatVideoFrameTime = (seconds: number) => {
    const normalizedSeconds = Math.max(0, Math.floor(Number(seconds ?? 0)))
    const minutes = Math.floor(normalizedSeconds / 60)
    const restSeconds = normalizedSeconds % 60
    return `${minutes}:${String(restSeconds).padStart(2, '0')}`
  }

  const formatDateTime = (value: string | number | Date | null | undefined) => {
    if (!value) {
      return '暂无'
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return String(value)
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
  }

  const formatDuration = (seconds: number | null | undefined) => {
    const totalSeconds = Math.max(0, Number(seconds ?? 0))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const remainSeconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours}小时 ${minutes}分钟 ${remainSeconds}秒`
    }

    if (minutes > 0) {
      return `${minutes}分钟 ${remainSeconds}秒`
    }

    return `${remainSeconds}秒`
  }

  const formatAsmrDuration = (seconds: number | null | undefined) => {
    const normalizedSeconds = Number(seconds ?? 0)
    if (normalizedSeconds === -1) {
      return '计算中'
    }

    return formatDuration(normalizedSeconds)
  }

  const isUnknownEndTime = (value: string | number | Date | null | undefined) => {
    if (!value) {
      return false
    }

    const date = new Date(value)
    return !Number.isNaN(date.getTime()) && date.getTime() === new Date(ResourceLogSpecialTime.UNKNOWN_END_TIME).getTime()
  }

  const formatLogEndTime = (value: string | number | Date | null | undefined) => {
    if (isUnknownEndTime(value)) {
      return '未检测到结束时间'
    }

    return formatDateTime(value)
  }

  const formatLogDuration = (logItem: { endTime?: string | number | Date | null; duration?: number | null }) => {
    if (isUnknownEndTime(logItem?.endTime)) {
      return '未知'
    }

    return formatDuration(logItem?.duration)
  }

  const formatLaunchMode = (launchMode: string | null | undefined, usePlayTerms = false) => {
    switch (String(launchMode ?? '').trim()) {
      case ResourceLaunchMode.ADMIN:
        return '管理员启动'
      case ResourceLaunchMode.MTOOL:
        return 'MTool 启动'
      case ResourceLaunchMode.LOCALE_EMULATOR:
        return 'LE 转区启动'
      case ResourceLaunchMode.NORMAL:
      default:
        return usePlayTerms ? '普通播放' : '普通启动'
    }
  }

  const getRatingEmoji = (rating: number | null | undefined) => {
    const normalizedRating = Number(rating ?? 0)

    if (normalizedRating >= 4.9) return '🔥🔥'
    if (normalizedRating >= 4.5) return '🔥'
    if (normalizedRating > 4) return '👑'
    if (normalizedRating > 3) return '😎'
    if (normalizedRating > 2) return '🙂'
    if (normalizedRating >= 1.1) return '😮‍💨'
    if (normalizedRating > 0) return '🫠'
    if (normalizedRating === 0) return '👎'
    return ''
  }

  const getRatingComment = (rating: number | null | undefined) => {
    const normalizedRating = Number(rating ?? -1)

    if (normalizedRating < 0) return ''
    if (normalizedRating >= 4.6) return '夯爆了'
    if (normalizedRating >= 4.1) return '夯'
    if (normalizedRating >= 3.1) return '顶级'
    if (normalizedRating >= 2.1) return '人上人'
    if (normalizedRating >= 1.1) return 'NPC'
    if (normalizedRating >= 0.6) return '拉完了'
    return '区'
  }

  const formatAudioBitrate = (bitrate: number | null | undefined) => {
    const normalized = Number(bitrate ?? 0)
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return '未知'
    }

    return `${Math.round(normalized / 1000)} kbps`
  }

  const formatAudioSampleRate = (sampleRate: number | null | undefined) => {
    const normalized = Number(sampleRate ?? 0)
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return '未知'
    }

    return `${normalized} Hz`
  }

  const formatFrameRate = (frameRate: number | null | undefined) => {
    const normalized = Number(frameRate ?? 0)
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return '未知'
    }

    return `${normalized.toFixed(normalized >= 10 ? 0 : 2)} fps`
  }

  const formatImageResolution = (width: number | null | undefined, height: number | null | undefined) => {
    const normalizedWidth = Number(width ?? 0)
    const normalizedHeight = Number(height ?? 0)
    if (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0 || !Number.isFinite(normalizedHeight) || normalizedHeight <= 0) {
      return '未知'
    }

    return `${normalizedWidth} × ${normalizedHeight}`
  }

  return {
    formatVideoFrameTime,
    formatDateTime,
    formatDuration,
    formatAsmrDuration,
    isUnknownEndTime,
    formatLogEndTime,
    formatLogDuration,
    formatLaunchMode,
    getRatingEmoji,
    getRatingComment,
    formatAudioBitrate,
    formatAudioSampleRate,
    formatFrameRate,
    formatImageResolution
  }
}
