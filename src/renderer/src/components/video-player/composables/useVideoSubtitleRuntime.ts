import { computed, ref, type Ref } from 'vue'
import type { VideoTrack } from './useVideoPlaylistRuntime'

export type SubtitleCue = {
  start: number
  end: number
  text: string
}

type UseVideoSubtitleRuntimeOptions = {
  displayCurrentTime: Readonly<Ref<number>>
  getLoadRequestId: () => number
  getCurrentTrack: () => VideoTrack | null
}

const MAX_SUBTITLE_FILE_BYTES = 2 * 1024 * 1024

const timestampToSeconds = (value: string): number | null => {
  const normalized = String(value ?? '').trim().replace(',', '.')
  const parts = normalized.split(':').map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part))) {
    return null
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }

  return null
}

const parseLrc = (content: string) => {
  const cues: SubtitleCue[] = []
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const matches = [...line.matchAll(/\[(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\]/g)]
    const text = line.replace(/\[(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\]/g, '').trim()
    if (!matches.length || !text) {
      continue
    }

    for (const match of matches) {
      const start = timestampToSeconds(match[1].replace('.', ':').replace(/:(\d{1,3})$/, '.$1'))
      if (start !== null) {
        cues.push({ start, end: start + 4, text })
      }
    }
  }

  cues.sort((left, right) => left.start - right.start)
  for (let index = 0; index < cues.length; index += 1) {
    const nextCue = cues[index + 1]
    if (nextCue) {
      cues[index].end = Math.max(cues[index].start + 1.5, nextCue.start - 0.08)
    }
  }

  return cues
}

const parseSrtOrVtt = (content: string) => {
  const normalizedContent = content.replace(/^\uFEFF/, '').replace(/^WEBVTT\s*/i, '').trim()
  const blocks = normalizedContent.split(/\r?\n\r?\n/)
  const cues: SubtitleCue[] = []

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const timeLine = lines.find((line) => line.includes('-->'))
    if (!timeLine) {
      continue
    }

    const [startRaw, endRaw] = timeLine.split('-->').map((part) => part.trim().split(/\s+/)[0])
    const start = timestampToSeconds(startRaw)
    const end = timestampToSeconds(endRaw)
    if (start === null || end === null) {
      continue
    }

    const text = lines.slice(lines.indexOf(timeLine) + 1).join('\n').trim()
    if (text) {
      cues.push({ start, end, text })
    }
  }

  return cues
}

const parseAssTime = (value: string) => {
  const normalized = String(value ?? '').trim()
  const match = normalized.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.](\d{1,2}))?$/)
  if (!match) {
    return null
  }

  const [, hoursRaw, minutesRaw, secondsRaw, centisecondsRaw = '0'] = match
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  const seconds = Number(secondsRaw)
  const centiseconds = Number(centisecondsRaw.padEnd(2, '0').slice(0, 2))
  if ([hours, minutes, seconds, centiseconds].some((item) => Number.isNaN(item))) {
    return null
  }

  return hours * 3600 + minutes * 60 + seconds + centiseconds / 100
}

const parseAss = (content: string) => {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  const cues: SubtitleCue[] = []
  let inEvents = false
  let formatFields: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    if (/^\[events\]$/i.test(line)) {
      inEvents = true
      continue
    }

    if (/^\[.+\]$/.test(line)) {
      inEvents = false
      continue
    }

    if (!inEvents) {
      continue
    }

    if (/^format\s*:/i.test(line)) {
      formatFields = line
        .replace(/^format\s*:/i, '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
      continue
    }

    if (!/^dialogue\s*:/i.test(line)) {
      continue
    }

    const payload = line.replace(/^dialogue\s*:/i, '')
    const textIndex = Math.max(0, formatFields.indexOf('text'))
    const maxSplits = textIndex > 0 ? textIndex : 9
    const parts = payload.split(',', maxSplits)
    const text = payload.split(',').slice(maxSplits).join(',')
    const startIndex = formatFields.indexOf('start')
    const endIndex = formatFields.indexOf('end')
    const start = parseAssTime(parts[startIndex >= 0 ? startIndex : 1])
    const end = parseAssTime(parts[endIndex >= 0 ? endIndex : 2])
    const cleanedText = text
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[Nn]/g, '\n')
      .replace(/\\h/g, ' ')
      .trim()

    if (start !== null && end !== null && cleanedText) {
      cues.push({ start, end, text: cleanedText })
    }
  }

  return cues
}

export const useVideoSubtitleRuntime = ({
  displayCurrentTime,
  getLoadRequestId,
  getCurrentTrack
}: UseVideoSubtitleRuntimeOptions) => {
  const subtitleCueList = ref<SubtitleCue[]>([])
  const subtitleLoadState = ref<'idle' | 'loading' | 'ready' | 'empty'>('idle')
  const manualSubtitlePaths = ref<Record<string, string>>({})

  const currentSubtitleText = computed(() => {
    const time = displayCurrentTime.value
    const cue = subtitleCueList.value.find((item) => time >= item.start && time <= item.end)
    return cue?.text ?? ''
  })

  const loadSubtitleForTrack = async (track: VideoTrack | null, requestId: number) => {
    subtitleCueList.value = []
    subtitleLoadState.value = 'loading'
    const trackPath = String(track?.path ?? '').trim()
    if (!trackPath) {
      subtitleLoadState.value = 'empty'
      return
    }

    const subtitleCandidates = [
      String(manualSubtitlePaths.value[trackPath] ?? '').trim(),
      String(track?.subtitlePath ?? '').trim(),
      ...['.srt', '.ass', '.vtt', '.lrc'].map((extension) => [
        trackPath.replace(/\.[^./\\]+$/, extension),
        `${trackPath}${extension}`
      ]).flat()
    ].filter(Boolean)

    for (const subtitlePath of subtitleCandidates) {
      const info = await window.api.dialog.getTextFileInfo(subtitlePath)
      if (!info || info.size > MAX_SUBTITLE_FILE_BYTES) {
        continue
      }

      const content = await window.api.dialog.readTextFile(subtitlePath, info.encoding)
      if (requestId !== getLoadRequestId()) {
        return
      }
      if (!content) {
        continue
      }

      const normalizedSubtitlePath = subtitlePath.toLowerCase()
      const cues = normalizedSubtitlePath.endsWith('.ass')
        ? parseAss(content)
        : normalizedSubtitlePath.endsWith('.lrc')
          ? parseLrc(content)
          : parseSrtOrVtt(content)
      subtitleCueList.value = cues
      subtitleLoadState.value = cues.length ? 'ready' : 'empty'
      return
    }

    subtitleLoadState.value = 'empty'
  }

  const chooseSubtitleForCurrentTrack = async () => {
    const initialTrackPath = String(getCurrentTrack()?.path ?? '').trim()
    if (!initialTrackPath) {
      return
    }

    const subtitlePath = await window.api.dialog.selectFile(['srt', 'ass', 'vtt', 'lrc'])
    const normalizedSubtitlePath = String(subtitlePath ?? '').trim()
    if (!normalizedSubtitlePath) {
      return
    }

    const currentTrack = getCurrentTrack()
    const trackPath = String(currentTrack?.path ?? '').trim()
    if (!trackPath) {
      return
    }

    if (trackPath !== initialTrackPath) {
      await loadSubtitleForTrack(currentTrack, getLoadRequestId())
      return
    }

    manualSubtitlePaths.value = {
      ...manualSubtitlePaths.value,
      [trackPath]: normalizedSubtitlePath
    }
    await loadSubtitleForTrack(currentTrack, getLoadRequestId())
  }

  return {
    subtitleCueList,
    subtitleLoadState,
    currentSubtitleText,
    loadSubtitleForTrack,
    chooseSubtitleForCurrentTrack
  }
}
