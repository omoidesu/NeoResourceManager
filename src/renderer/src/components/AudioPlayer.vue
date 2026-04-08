<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronBackOutline, ChevronForwardOutline, CloseOutline, Pause, Play, Square, VolumeHighOutline, VolumeMuteOutline } from '@vicons/ionicons5'
import { notify } from '../utils/notification'
import { createLogger } from '../../../main/util/logger'
import {
  clearAudioPlayerControls,
  registerAudioPlayerControls,
  setAudioPlayerPlaybackState,
  setAudioPlayerSession,
  setAudioPlayerVisible
} from '../utils/audio-player-store'
import { removeOngoingCenterItem, upsertOngoingCenterItem } from '../utils/notification-center'

type AudioTrack = {
  path: string
  label: string
  duration?: number | null
  hasSubtitle?: boolean
}

type SubtitleCue = {
  start: number
  end: number
  text: string
}

const props = withDefaults(defineProps<{
  show: boolean
  resourceId?: string
  playlist: AudioTrack[]
  initialPath?: string
  initialTime?: number
  coverSrc?: string
  title?: string
}>(), {
  resourceId: '',
  initialPath: '',
  initialTime: 0,
  coverSrc: '',
  title: '音频播放器'
})

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
}>()
const AUDIO_PLAYER_ONGOING_ID = 'audio-player:ongoing'
const logger = createLogger('audio-player')

const audioRef = ref<HTMLAudioElement | null>(null)
const currentIndex = ref(0)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(85)
const audioUrlMap = ref<Record<string, string>>({})
const audioObjectUrlMap = ref<Record<string, string>>({})
const subtitleCueList = ref<SubtitleCue[]>([])
const subtitleLoadState = ref<'idle' | 'loading' | 'ready' | 'empty'>('idle')
const pendingAutoplay = ref(false)
const pendingSeekTime = ref(0)
const playbackError = ref('')
const playbackSessionActive = ref(false)
const stopPlaybackTask = ref<Promise<void> | null>(null)

const currentTrack = computed(() => props.playlist[currentIndex.value] ?? null)
const currentAudioSrc = computed(() => audioUrlMap.value[currentTrack.value?.path ?? ''] ?? '')
const playlistBaseSegments = computed(() => {
  const directorySegments = props.playlist
    .map((track) => String(track?.path ?? '').replace(/\\/g, '/').trim())
    .filter(Boolean)
    .map((trackPath) => {
      const segments = trackPath.split('/').filter(Boolean)
      return segments.slice(0, -1)
    })
    .filter((segments) => segments.length > 0)

  if (!directorySegments.length) {
    return [] as string[]
  }

  const [firstSegments, ...restSegments] = directorySegments
  const commonSegments: string[] = []

  for (let index = 0; index < firstSegments.length; index += 1) {
    const currentSegment = firstSegments[index]
    if (!restSegments.every((segments) => segments[index] === currentSegment)) {
      break
    }

    commonSegments.push(currentSegment)
  }

  return commonSegments
})
const currentSubtitleText = computed(() => {
  const activeCue = subtitleCueList.value.find((cue) => currentTime.value >= cue.start && currentTime.value <= cue.end)
  return activeCue?.text ?? ''
})

const clampIndex = (index: number) => {
  if (!props.playlist.length) {
    return 0
  }

  if (index < 0) {
    return props.playlist.length - 1
  }

  if (index >= props.playlist.length) {
    return 0
  }

  return index
}

const canReuseCurrentPlayback = () => {
  const activeTrackPath = String(currentTrack.value?.path ?? '').trim()
  if (!activeTrackPath) {
    return false
  }

  if (!playbackSessionActive.value) {
    return false
  }

  if (!props.playlist.some((track) => String(track?.path ?? '').trim() === activeTrackPath)) {
    return false
  }

  return Boolean(currentAudioSrc.value && audioRef.value)
}

const formatTime = (seconds: number | null | undefined) => {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds ?? 0)))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`
}

const getTrackDirectoryLabel = (filePath: string) => {
  const normalizedPath = String(filePath ?? '').replace(/\\/g, '/').trim()
  if (!normalizedPath) {
    return ''
  }

  const segments = normalizedPath.split('/').filter(Boolean)
  if (segments.length <= 1) {
    return ''
  }

  const directorySegments = segments.slice(0, -1)
  const relativeSegments = directorySegments.slice(playlistBaseSegments.value.length)

  if (!relativeSegments.length) {
    return directorySegments.slice(-2).join(' / ')
  }

  return relativeSegments.join(' / ')
}

const closePlayer = () => {
  setAudioPlayerVisible(false)
  emit('update:show', false)
}

const getAudioMimeType = (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim().toLowerCase()
  if (normalizedPath.endsWith('.mp3')) return 'audio/mpeg'
  if (normalizedPath.endsWith('.wav')) return 'audio/wav'
  if (normalizedPath.endsWith('.flac')) return 'audio/flac'
  if (normalizedPath.endsWith('.m4a') || normalizedPath.endsWith('.m4b')) return 'audio/mp4'
  if (normalizedPath.endsWith('.aac')) return 'audio/aac'
  if (normalizedPath.endsWith('.ogg')) return 'audio/ogg'
  if (normalizedPath.endsWith('.opus')) return 'audio/opus'
  if (normalizedPath.endsWith('.wma')) return 'audio/x-ms-wma'
  if (normalizedPath.endsWith('.ape')) return 'audio/ape'
  if (normalizedPath.endsWith('.wv')) return 'audio/wavpack'
  return 'audio/mpeg'
}

const revokeAudioObjectUrl = (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim()
  const objectUrl = audioObjectUrlMap.value[normalizedPath]
  if (!objectUrl) {
    return
  }

  URL.revokeObjectURL(objectUrl)

  const nextObjectUrlMap = { ...audioObjectUrlMap.value }
  delete nextObjectUrlMap[normalizedPath]
  audioObjectUrlMap.value = nextObjectUrlMap
}

const revokeAllAudioObjectUrls = () => {
  Object.values(audioObjectUrlMap.value).forEach((objectUrl) => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
    }
  })
  audioObjectUrlMap.value = {}
}

const buildPlaybackLogContext = () => ({
  resourceId: String(props.resourceId ?? '').trim(),
  title: String(props.title ?? '').trim(),
  initialPath: String(props.initialPath ?? '').trim(),
  initialTime: Number(props.initialTime ?? 0),
  currentIndex: currentIndex.value,
  currentTrackPath: String(currentTrack.value?.path ?? '').trim(),
  currentTrackLabel: String(currentTrack.value?.label ?? '').trim(),
  currentAudioSrc: String(currentAudioSrc.value ?? '').trim(),
  currentTime: Number(currentTime.value ?? 0),
  duration: Number(duration.value ?? 0),
  pendingAutoplay: Boolean(pendingAutoplay.value),
  pendingSeekTime: Number(pendingSeekTime.value ?? 0),
  playbackSessionActive: Boolean(playbackSessionActive.value),
  playlistSize: Array.isArray(props.playlist) ? props.playlist.length : 0
})

const playCurrentAudio = async () => {
  const audioElement = audioRef.value
  if (!audioElement || !currentTrack.value) {
    logger.error('playCurrentAudio aborted because audio element or current track is missing', buildPlaybackLogContext())
    return false
  }

  try {
    logger.info('attempting audio playback', {
      ...buildPlaybackLogContext(),
      paused: Boolean(audioElement.paused),
      readyState: Number(audioElement.readyState ?? 0),
      networkState: Number(audioElement.networkState ?? 0)
    })
    await audioElement.play()
    isPlaying.value = true
    pendingAutoplay.value = false
    playbackError.value = ''
    logger.info('audio playback started', buildPlaybackLogContext())

    if (!playbackSessionActive.value && String(props.resourceId ?? '').trim()) {
      try {
        await window.api.service.startAsmrPlayback(String(props.resourceId ?? ''))
        playbackSessionActive.value = true
      } catch {
        // ignore playback log errors
      }
    }

    return true
  } catch (error) {
    isPlaying.value = false
    playbackError.value = '当前音频无法播放'
    logger.error('audio playback rejected by browser', {
      ...buildPlaybackLogContext(),
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

const getResolvedPlaybackTime = () => {
  const elementTime = Number(audioRef.value?.currentTime ?? 0)
  const stateTime = Number(currentTime.value ?? 0)
  return Math.max(0, Math.floor(Math.max(elementTime, stateTime)))
}

const persistPlaybackProgressFor = async (
  resourceId: string,
  filePath: string,
  playbackTimeOverride?: number
) => {
  const normalizedResourceId = String(resourceId ?? '').trim()
  const normalizedFilePath = String(filePath ?? '').trim()
  const playbackTime = Math.max(0, Math.floor(Number(playbackTimeOverride ?? getResolvedPlaybackTime())))

  if (!normalizedResourceId || !normalizedFilePath) {
    return
  }

  try {
    await window.api.service.updateAsmrPlaybackProgress(normalizedResourceId, normalizedFilePath, playbackTime)
  } catch {
    // ignore persistence errors
  }
}

const persistPlaybackProgress = async (playbackTimeOverride?: number) => {
  await persistPlaybackProgressFor(
    String(props.resourceId ?? ''),
    String(currentTrack.value?.path ?? ''),
    playbackTimeOverride
  )
}

const finalizePlaybackSession = async (resourceIdOverride?: string) => {
  const resourceId = String(resourceIdOverride ?? props.resourceId ?? '').trim()
  const filePath = String(currentTrack.value?.path ?? '').trim()
  const playbackTime = getResolvedPlaybackTime()

  if (filePath) {
    await persistPlaybackProgressFor(resourceId, filePath, playbackTime)
  }

  if (playbackSessionActive.value && resourceId) {
    try {
      await window.api.service.stopAsmrPlayback(resourceId)
    } catch {
      // ignore playback log errors
    }
  }

  playbackSessionActive.value = false
}

const stopPlayback = async () => {
  if (stopPlaybackTask.value) {
    await stopPlaybackTask.value
    return
  }

  stopPlaybackTask.value = (async () => {
    audioRef.value?.pause()

    await finalizePlaybackSession(String(props.resourceId ?? ''))

    if (audioRef.value) {
      audioRef.value.currentTime = 0
    }
    currentIndex.value = -1
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
    subtitleCueList.value = []
    subtitleLoadState.value = 'idle'
    setAudioPlayerPlaybackState({
      currentTrack: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false
    })
    setAudioPlayerVisible(false)
    emit('update:show', false)
    removeOngoingCenterItem(AUDIO_PLAYER_ONGOING_ID)
    playbackError.value = ''
  })()

  try {
    await stopPlaybackTask.value
  } finally {
    stopPlaybackTask.value = null
  }
}

const ensureAudioUrl = async (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim()
  if (!normalizedPath || audioUrlMap.value[normalizedPath]) {
    if (normalizedPath) {
      logger.info('reusing cached audio object url', {
        ...buildPlaybackLogContext(),
        filePath: normalizedPath
      })
    }
    return
  }

  logger.info('reading audio binary file', {
    ...buildPlaybackLogContext(),
    filePath: normalizedPath
  })
  const binaryData = await window.api.dialog.readBinaryFile(normalizedPath)
  if (!binaryData || !binaryData.length) {
    logger.error('failed to read audio binary file', {
      ...buildPlaybackLogContext(),
      filePath: normalizedPath,
      byteLength: Number(binaryData?.length ?? 0)
    })
    return
  }

  revokeAudioObjectUrl(normalizedPath)
  const audioBytes = new Uint8Array(binaryData.byteLength)
  audioBytes.set(binaryData)
  const audioBlob = new Blob([audioBytes], { type: getAudioMimeType(normalizedPath) })
  const fileUrl = URL.createObjectURL(audioBlob)
  logger.info('created audio object url', {
    ...buildPlaybackLogContext(),
    filePath: normalizedPath,
    mimeType: getAudioMimeType(normalizedPath),
    byteLength: audioBytes.byteLength,
    objectUrl: fileUrl
  })
  audioObjectUrlMap.value = {
    ...audioObjectUrlMap.value,
    [normalizedPath]: fileUrl
  }

  audioUrlMap.value = {
    ...audioUrlMap.value,
    [normalizedPath]: fileUrl
  }
}

const timestampToSeconds = (timestamp: string) => {
  const parts = timestamp.replace(',', '.').split(':').map((part) => Number(part.trim()))
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

    const starts = matches
      .map((match) => timestampToSeconds(match[1].replace('.', ':').replace(/:(\d{1,3})$/, '.$1')))
      .filter((value): value is number => value !== null)

    for (const start of starts) {
      cues.push({
        start,
        end: start + 4,
        text
      })
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
    if (!lines.length) {
      continue
    }

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

    const textLines = lines.slice(lines.indexOf(timeLine) + 1)
    const text = textLines.join('\n').trim()
    if (!text) {
      continue
    }

    cues.push({
      start,
      end,
      text
    })
  }

  return cues
}

const loadSubtitleForTrack = async (trackPath: string) => {
  subtitleCueList.value = []
  subtitleLoadState.value = 'loading'

  const normalizedPath = String(trackPath ?? '').trim()
  if (!normalizedPath) {
    subtitleLoadState.value = 'empty'
    return
  }

  const subtitleCandidates = ['.lrc', '.srt', '.vtt'].map((extension) =>
    [
      normalizedPath.replace(/\.[^./\\]+$/, extension),
      `${normalizedPath}${extension}`
    ]
  ).flat()

  for (const subtitlePath of subtitleCandidates) {
    const content = await window.api.dialog.readTextFile(subtitlePath)
    if (!content) {
      continue
    }

    const cues = subtitlePath.endsWith('.lrc')
      ? parseLrc(content)
      : parseSrtOrVtt(content)

    subtitleCueList.value = cues
    subtitleLoadState.value = cues.length ? 'ready' : 'empty'
    return
  }

  subtitleLoadState.value = 'empty'
}

const syncTrack = async (index: number, autoplay = false, startTime = 0) => {
  logger.info('syncTrack invoked', {
    ...buildPlaybackLogContext(),
    nextIndex: index,
    autoplay,
    startTime
  })
  currentIndex.value = clampIndex(index)
  currentTime.value = 0
  duration.value = Number(currentTrack.value?.duration ?? 0) || 0
  pendingAutoplay.value = autoplay
  pendingSeekTime.value = Math.max(0, Number(startTime ?? 0))
  playbackError.value = ''

  const trackPath = currentTrack.value?.path ?? ''
  if (!trackPath) {
    logger.error('syncTrack aborted because resolved track path is empty', buildPlaybackLogContext())
    return
  }

  await Promise.all([
    ensureAudioUrl(trackPath),
    loadSubtitleForTrack(trackPath)
  ])

  await nextTick()

  const audioElement = audioRef.value
  if (!audioElement) {
    logger.error('syncTrack aborted because audio element is missing after nextTick', buildPlaybackLogContext())
    return
  }

  audioElement.pause()
  audioElement.currentTime = 0
  audioElement.load()
  isPlaying.value = false
  logger.info('audio element load requested', {
    ...buildPlaybackLogContext(),
    readyState: Number(audioElement.readyState ?? 0),
    networkState: Number(audioElement.networkState ?? 0)
  })
}

const togglePlayback = async () => {
  const audioElement = audioRef.value
  if (!audioElement || !currentTrack.value) {
    return
  }

  if (audioElement.paused) {
    const played = await playCurrentAudio()
    if (!played) {
      notify('warning', '播放音频', playbackError.value || '当前音频无法播放')
    }
    return
  }

  audioElement.pause()
  isPlaying.value = false
}

const goPrevious = () => {
  void syncTrack(currentIndex.value - 1, true)
}

const goNext = () => {
  void syncTrack(currentIndex.value + 1, true)
}

const handleAudioEnded = () => {
  goNext()
}

const handleLoadedMetadata = () => {
  const audioElement = audioRef.value
  if (!audioElement) {
    return
  }

  duration.value = Number.isFinite(audioElement.duration) ? audioElement.duration : (Number(currentTrack.value?.duration ?? 0) || 0)

  if (pendingSeekTime.value > 0) {
    const nextTime = Math.min(duration.value || pendingSeekTime.value, pendingSeekTime.value)
    audioElement.currentTime = Math.max(0, nextTime)
    currentTime.value = audioElement.currentTime
    pendingSeekTime.value = 0
  }
  logger.info('audio loadedmetadata event received', {
    ...buildPlaybackLogContext(),
    mediaDuration: Number(audioElement.duration ?? 0),
    readyState: Number(audioElement.readyState ?? 0),
    networkState: Number(audioElement.networkState ?? 0)
  })
}

const handleCanPlay = () => {
  const audioElement = audioRef.value
  logger.info('audio canplay event received', {
    ...buildPlaybackLogContext(),
    readyState: Number(audioElement?.readyState ?? 0),
    networkState: Number(audioElement?.networkState ?? 0)
  })

  if (!pendingAutoplay.value) {
    return
  }

  void playCurrentAudio().then((played) => {
    if (!played) {
      notify('warning', '播放音频', playbackError.value || '当前音频无法播放')
    }
  })
}

const handleTimeUpdate = () => {
  currentTime.value = Number(audioRef.value?.currentTime ?? 0)
}

const handleAudioError = () => {
  const audioElement = audioRef.value
  const mediaError = audioElement?.error
  isPlaying.value = false
  pendingAutoplay.value = false
  playbackError.value = '当前音频无法播放'
  logger.error('audio element emitted error event', {
    ...buildPlaybackLogContext(),
    mediaErrorCode: Number(mediaError?.code ?? 0),
    mediaErrorMessage: mediaError?.message ?? '',
    readyState: Number(audioElement?.readyState ?? 0),
    networkState: Number(audioElement?.networkState ?? 0)
  })
  notify('error', '播放音频', `${currentTrack.value?.label || '当前文件'} 播放失败`)
}

const handleSeek = (value: number) => {
  const audioElement = audioRef.value
  if (!audioElement) {
    return
  }

  audioElement.currentTime = Math.max(0, Number(value ?? 0))
  currentTime.value = audioElement.currentTime
}

const handleVolumeChange = (value: number) => {
  volume.value = Math.max(0, Math.min(100, Number(value ?? 0)))
  if (audioRef.value) {
    audioRef.value.volume = volume.value / 100
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.show) {
    return
  }

  if (event.key === 'Escape') {
    closePlayer()
    return
  }

  if (event.key === ' ') {
    event.preventDefault()
    void togglePlayback()
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    goNext()
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goPrevious()
  }
}

watch(() => props.show, async (visible) => {
  setAudioPlayerVisible(visible)

  if (!visible) {
    return
  }

  if (canReuseCurrentPlayback()) {
    return
  }

  const initialIndex = props.playlist.findIndex((track) => track.path === props.initialPath)
  await syncTrack(initialIndex >= 0 ? initialIndex : 0, true, props.initialTime)
})

watch(() => props.initialPath, async (filePath) => {
  if (!props.show) {
    return
  }

  const nextIndex = props.playlist.findIndex((track) => track.path === filePath)
  if (nextIndex >= 0 && nextIndex !== currentIndex.value) {
    await syncTrack(nextIndex, true, props.initialTime)
  }
})

watch(() => props.playlist, async (playlist) => {
  if (!props.show || !playlist.length) {
    return
  }

  const nextIndex = playlist.findIndex((track) => track.path === props.initialPath)
  await syncTrack(nextIndex >= 0 ? nextIndex : 0, true, props.initialTime)
}, { deep: true })

watch(() => props.initialTime, (nextTime) => {
  if (!props.show) {
    return
  }

  const normalizedTime = Math.max(0, Number(nextTime ?? 0))
  const audioElement = audioRef.value
  if (!audioElement || !currentTrack.value || currentTrack.value.path !== props.initialPath) {
    pendingSeekTime.value = normalizedTime
    return
  }

  if (duration.value > 0) {
    audioElement.currentTime = Math.min(duration.value, normalizedTime)
    currentTime.value = audioElement.currentTime
    pendingSeekTime.value = 0
    return
  }

  pendingSeekTime.value = normalizedTime
})

watch(() => props.resourceId, async (nextResourceId, previousResourceId) => {
  const normalizedNextResourceId = String(nextResourceId ?? '').trim()
  const normalizedPreviousResourceId = String(previousResourceId ?? '').trim()

  if (!normalizedPreviousResourceId || normalizedNextResourceId === normalizedPreviousResourceId) {
    return
  }

  await finalizePlaybackSession(normalizedPreviousResourceId)
})

watch(() => [props.title, props.coverSrc, props.playlist] as const, ([nextTitle, nextCoverSrc, nextPlaylist]) => {
  setAudioPlayerSession({
    title: nextTitle,
    coverSrc: nextCoverSrc,
    playlist: nextPlaylist
  })
}, { deep: true, immediate: true })

watch(() => [currentTrack.value, currentTime.value, duration.value, isPlaying.value] as const, ([track, time, totalDuration, playing]) => {
  setAudioPlayerPlaybackState({
    currentTrack: track,
    currentTime: time,
    duration: totalDuration,
    isPlaying: playing
  })

  if (!track?.path) {
    removeOngoingCenterItem(AUDIO_PLAYER_ONGOING_ID)
    return
  }

  upsertOngoingCenterItem({
    id: AUDIO_PLAYER_ONGOING_ID,
    title: '正在播放',
    content: `${track.label}\n${props.title}`,
    kind: 'audio-player',
    meta: {
      title: props.title,
      coverSrc: props.coverSrc,
      trackLabel: track.label,
      currentTime: time,
      duration: totalDuration,
      isPlaying: playing
    },
    onClick: () => {
      setAudioPlayerVisible(true)
      emit('update:show', true)
    }
  })
}, { immediate: true })

watch(volume, (nextVolume) => {
  if (audioRef.value) {
    audioRef.value.volume = Math.max(0, Math.min(1, nextVolume / 100))
  }
})

watch(currentTrack, (track) => {
  if (!track) {
    subtitleCueList.value = []
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  registerAudioPlayerControls({
    playPause: () => togglePlayback(),
    previous: goPrevious,
    next: goNext,
    stop: stopPlayback,
    seek: handleSeek,
    reopen: () => {
      setAudioPlayerVisible(true)
      emit('update:show', true)
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  void persistPlaybackProgress()
  audioRef.value?.pause()
  if (playbackSessionActive.value && String(props.resourceId ?? '').trim()) {
    void window.api.service.stopAsmrPlayback(String(props.resourceId ?? ''))
  }
  clearAudioPlayerControls()
  removeOngoingCenterItem(AUDIO_PLAYER_ONGOING_ID)
  revokeAllAudioObjectUrls()
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="audio-player"
    :show-icon="false"
    :bordered="false"
    :closable="false"
    :mask-closable="true"
    role="dialog"
    @update:show="emit('update:show', $event)"
  >
    <div class="audio-player__shell">
      <div class="audio-player__toolbar" @click.stop>
        <div class="audio-player__toolbar-title">{{ title }}</div>
        <div class="audio-player__toolbar-actions">
          <n-button quaternary circle @click="stopPlayback">
            <template #icon>
              <n-icon :component="Square" />
            </template>
          </n-button>
          <n-button quaternary circle @click="closePlayer">
            <template #icon>
              <n-icon :component="CloseOutline" />
            </template>
          </n-button>
        </div>
      </div>

      <div class="audio-player__layout">
        <div class="audio-player__main">
          <div class="audio-player__cover-panel">
            <div class="audio-player__cover-shell">
              <img v-if="coverSrc" :src="coverSrc" alt="专辑封面" class="audio-player__cover-image" />
              <div v-else class="audio-player__cover-placeholder">NO COVER</div>
            </div>
            <div class="audio-player__title">{{ currentTrack?.label || title }}</div>
            <div class="audio-player__meta">{{ title }}</div>
          </div>

          <div class="audio-player__subtitle-stage">
            <div v-if="currentSubtitleText" class="audio-player__subtitle">
              <span>{{ currentSubtitleText }}</span>
            </div>
            <div v-else-if="subtitleLoadState === 'loading'" class="audio-player__subtitle audio-player__subtitle--muted">
              正在读取字幕
            </div>
            <div v-else class="audio-player__subtitle audio-player__subtitle--muted">
              暂无字幕
            </div>
          </div>

          <div class="audio-player__controls">
            <div class="audio-player__timeline">
              <span class="audio-player__time">{{ formatTime(currentTime) }}</span>
              <n-slider
                :value="currentTime"
                :max="Math.max(duration, Number(currentTrack?.duration ?? 0), 1)"
                :step="0.1"
                :format-tooltip="(value: number) => formatTime(value)"
                @update:value="handleSeek"
              />
              <span class="audio-player__time">{{ formatTime(duration || currentTrack?.duration) }}</span>
            </div>

            <div class="audio-player__control-row">
              <div class="audio-player__control-group">
                <n-button circle secondary @click="goPrevious">
                  <template #icon>
                    <n-icon :component="ChevronBackOutline" />
                  </template>
                </n-button>
                <n-button circle type="primary" class="audio-player__play-button" @click="togglePlayback">
                  <template #icon>
                    <n-icon :component="isPlaying ? Pause : Play" />
                  </template>
                </n-button>
                <n-button circle secondary @click="stopPlayback">
                  <template #icon>
                    <n-icon :component="Square" />
                  </template>
                </n-button>
                <n-button circle secondary @click="goNext">
                  <template #icon>
                    <n-icon :component="ChevronForwardOutline" />
                  </template>
                </n-button>
              </div>

              <div class="audio-player__volume">
                <n-icon :component="volume <= 0 ? VolumeMuteOutline : VolumeHighOutline" />
                <n-slider :value="volume" :max="100" @update:value="handleVolumeChange" />
              </div>
            </div>
          </div>
        </div>

        <div class="audio-player__playlist">
          <div class="audio-player__playlist-title">播放列表</div>
          <n-scrollbar class="audio-player__playlist-scroll">
            <div class="audio-player__playlist-list">
              <button
                v-for="(track, index) in playlist"
                :key="track.path"
                type="button"
                class="audio-player__track"
                :class="{ 'audio-player__track--active': index === currentIndex }"
                @click="syncTrack(index, true)"
              >
                <div class="audio-player__track-text">
                  <div class="audio-player__track-name">{{ track.label }}</div>
                  <div class="audio-player__track-meta">
                    <div class="audio-player__track-directory">{{ getTrackDirectoryLabel(track.path) }}</div>
                    <span v-if="track.hasSubtitle" class="audio-player__subtitle-badge">字幕</span>
                  </div>
                </div>
                <div class="audio-player__track-duration">{{ formatTime(track.duration) }}</div>
              </button>
            </div>
          </n-scrollbar>
        </div>
      </div>
    </div>
  </n-modal>

  <audio
    v-if="currentAudioSrc"
    ref="audioRef"
    :src="currentAudioSrc"
    preload="metadata"
    @ended="handleAudioEnded"
    @loadedmetadata="handleLoadedMetadata"
    @canplay="handleCanPlay"
    @timeupdate="handleTimeUpdate"
    @error="handleAudioError"
    @play="isPlaying = true"
    @pause="isPlaying = false"
  />
</template>

<style scoped>
:global(.n-card.n-modal.audio-player) {
  width: 84vw !important;
  max-width: 84vw;
  border-radius: 18px;
}

.audio-player :deep(.n-card) {
  background: rgba(18, 18, 18, 0.95);
  backdrop-filter: blur(14px);
}

.audio-player :deep(.n-card__content) {
  width: 84vw;
  padding: 0;
  color: rgba(255, 255, 255, 0.92);
}

.audio-player__shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  height: min(88vh, 900px);
  min-height: 0;
}

.audio-player__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 0;
}

.audio-player__toolbar-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.66);
}

.audio-player__toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.audio-player__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 360px);
  gap: 0;
  min-height: 0;
  height: 100%;
}

.audio-player__main {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 16px 28px 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(99, 226, 183, 0.22), transparent 32%),
    radial-gradient(circle at bottom right, rgba(70, 130, 180, 0.16), transparent 28%),
    rgb(20, 22, 26);
}

.audio-player__cover-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

.audio-player__cover-shell {
  width: min(320px, 48vw);
  aspect-ratio: 1;
  border-radius: 28px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
}

.audio-player__cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.audio-player__cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.18em;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.42);
}

.audio-player__title {
  max-width: 100%;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
}

.audio-player__meta {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.58);
}

.audio-player__subtitle-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 22px 0 18px;
  overflow: hidden;
}

.audio-player__subtitle {
  max-width: min(720px, 100%);
  padding: 18px 22px;
  border-radius: 18px;
  background: rgba(9, 12, 16, 0.66);
  text-align: center;
  font-size: 24px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.24);
}

.audio-player__subtitle--muted {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
}

.audio-player__controls {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.audio-player__timeline {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
}

.audio-player__time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.56);
  font-variant-numeric: tabular-nums;
}

.audio-player__control-row {
  display: flex;
  align-items: center;
  gap: 18px;
}

.audio-player__control-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.audio-player__play-button {
  transform: scale(1.12);
}

.audio-player__volume {
  margin-left: auto;
  width: min(240px, 34vw);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.audio-player__playlist {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 24px 18px;
}

.audio-player__playlist-title {
  flex: 0 0 auto;
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.76);
}

.audio-player__playlist-scroll {
  flex: 1 1 auto;
  min-height: 0;
}

.audio-player__playlist-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 4px;
}

.audio-player__track {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.audio-player__track:hover {
  background: rgba(255, 255, 255, 0.06);
}

.audio-player__track--active {
  background: rgba(99, 226, 183, 0.16);
  box-shadow: inset 0 0 0 1px rgba(99, 226, 183, 0.26);
}

.audio-player__track-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.audio-player__track-name {
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.audio-player__track-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.audio-player__subtitle-badge {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(99, 226, 183, 0.16);
  color: rgb(125, 232, 196);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

.audio-player__track-directory {
  min-width: 0;
  flex: 1;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.4);
  word-break: break-word;
}

.audio-player__track-duration {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 960px) {
  :global(.n-card.n-modal.audio-player) {
    width: calc(100vw - 20px) !important;
    max-width: calc(100vw - 20px);
  }

  .audio-player :deep(.n-card__content) {
    width: calc(100vw - 20px);
  }

  .audio-player__shell {
    height: min(92vh, 980px);
  }

  .audio-player__layout {
    grid-template-columns: 1fr;
  }

  .audio-player__playlist {
    border-left: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    max-height: 280px;
  }

  .audio-player__cover-shell {
    width: min(280px, 70vw);
  }

  .audio-player__subtitle {
    font-size: 18px;
  }

  .audio-player__control-row {
    flex-direction: column;
    align-items: stretch;
  }

  .audio-player__volume {
    margin-left: 0;
    width: 100%;
  }
}
</style>
