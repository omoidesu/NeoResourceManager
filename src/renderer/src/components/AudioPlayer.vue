<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { ChevronBackOutline, ChevronForwardOutline, CloseOutline, Pause, Play, Repeat, Shuffle, Square, SwapHorizontal, VolumeHighOutline, VolumeMuteOutline } from '@vicons/ionicons5'
import { notify } from '../utils/notification'
import { createLogger } from '../../../main/util/logger'
import {
  clearAudioPlayerControls,
  registerAudioPlayerControls,
  type AudioPlaybackMode,
  setAudioPlayerPlaybackState,
  setAudioPlayerSession,
  setAudioPlayerVisible
} from '../utils/audio-player-store'
import { removeOngoingCenterItem, upsertOngoingCenterItem } from '../utils/notification-center'

type AudioTrack = {
  path: string
  label: string
  duration?: number | null
  resourceId?: string
  resourceTitle?: string
  artist?: string
  coverSrc?: string
  coverPath?: string
  hasSubtitle?: boolean
  subtitlePath?: string
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
  resumeRestartThreshold?: number
  coverSrc?: string
  title?: string
  artist?: string
  displayMode?: 'default' | 'music'
}>(), {
  resourceId: '',
  initialPath: '',
  initialTime: 0,
  resumeRestartThreshold: 95,
  coverSrc: '',
  title: '音频播放器',
  artist: '',
  displayMode: 'default'
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
const orderedPlaylist = ref<AudioTrack[]>([])
const audioUrlMap = ref<Record<string, string>>({})
const audioObjectUrlMap = ref<Record<string, string>>({})
const subtitleCueList = ref<SubtitleCue[]>([])
const subtitleLoadState = ref<'idle' | 'loading' | 'ready' | 'empty'>('idle')
const lyricLineRefs = ref<Array<HTMLElement | null>>([])
const MAX_SUBTITLE_FILE_BYTES = 2 * 1024 * 1024
const currentCoverPreviewSrc = ref('')
const isLyricScrollPreviewing = ref(false)
const pendingAutoplay = ref(false)
const pendingSeekTime = ref(0)
const playbackError = ref('')
const playbackSessionActive = ref(false)
const stopPlaybackTask = ref<Promise<void> | null>(null)
const playbackMode = ref<AudioPlaybackMode>('order')
let lyricScrollPreviewTimer: ReturnType<typeof setTimeout> | null = null
const draggingTrackIndex = ref<number | null>(null)
const dragOverTrackIndex = ref<number | null>(null)
const dragOverPosition = ref<'before' | 'after' | null>(null)
let suppressPlaylistReload = false
let playbackSessionResourceId = ''
let playbackSessionTrackPath = ''

const currentTrack = computed(() => orderedPlaylist.value[currentIndex.value] ?? null)
const currentAudioSrc = computed(() => audioUrlMap.value[currentTrack.value?.path ?? ''] ?? '')
const currentResourceId = computed(() => String(currentTrack.value?.resourceId ?? props.resourceId ?? '').trim())
const resourceTitleText = computed(() => String(currentTrack.value?.resourceTitle ?? '').trim() || String(props.title ?? '').trim() || String(currentTrack.value?.label ?? '').trim() || '音频播放器')
const artistText = computed(() => String(currentTrack.value?.artist ?? props.artist ?? '').trim())
const currentCoverSrc = computed(() => currentCoverPreviewSrc.value)
const isMusicDisplayMode = computed(() => props.displayMode === 'music')
const fullPlayerPrimaryText = computed(() => {
  if (isMusicDisplayMode.value) {
    return resourceTitleText.value
  }

  return String(currentTrack.value?.label ?? '').trim() || resourceTitleText.value
})
const fullPlayerSecondaryText = computed(() => {
  if (isMusicDisplayMode.value) {
    return artistText.value || String(currentTrack.value?.label ?? '').trim() || resourceTitleText.value
  }

  return resourceTitleText.value
})
const miniPlayerPrimaryText = computed(() => {
  if (isMusicDisplayMode.value) {
    return artistText.value || String(currentTrack.value?.label ?? '').trim() || resourceTitleText.value
  }

  return String(currentTrack.value?.label ?? '').trim() || resourceTitleText.value
})
const miniPlayerSecondaryText = computed(() => {
  if (isMusicDisplayMode.value) {
    return resourceTitleText.value
  }

  return resourceTitleText.value !== miniPlayerPrimaryText.value ? resourceTitleText.value : ''
})
const playbackModeIcon = computed(() => {
  if (playbackMode.value === 'loop' || playbackMode.value === 'repeat-one') {
    return Repeat
  }

  if (playbackMode.value === 'shuffle') {
    return Shuffle
  }

  return SwapHorizontal
})
const playbackModeLabel = computed(() => {
  if (playbackMode.value === 'loop') {
    return '列表循环'
  }

  if (playbackMode.value === 'shuffle') {
    return '随机播放'
  }

  if (playbackMode.value === 'repeat-one') {
    return '单曲循环'
  }

  return '顺序播放'
})
const playlistBaseSegments = computed(() => {
  const directorySegments = orderedPlaylist.value
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
const activeSubtitleIndex = computed(() =>
  subtitleCueList.value.findIndex((cue) => currentTime.value >= cue.start && currentTime.value <= cue.end)
)

const getLyricLineStyle = (index: number) => {
  if (isLyricScrollPreviewing.value) {
    const isActive = index === activeSubtitleIndex.value
    return {
      opacity: isActive ? 1 : 0.9,
      filter: 'none',
      transform: isActive ? 'scale(1.02)' : 'scale(1)',
      color: isActive ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.76)'
    }
  }

  const activeIndex = activeSubtitleIndex.value
  if (activeIndex < 0) {
    return {
      opacity: 0.56,
      filter: 'blur(0.8px)',
      transform: 'scale(0.992)',
      color: 'rgba(255, 255, 255, 0.52)'
    }
  }

  const distance = Math.abs(index - activeIndex)
  const blur = Math.min(distance * 0.8, 6)
  const opacity = Math.max(1 - distance * 0.14, 0.08)
  const scale = Math.max(1 - distance * 0.018, 0.9)
  const colorAlpha = Math.max(0.96 - distance * 0.14, 0.14)

  return {
    opacity,
    filter: `blur(${blur}px)`,
    transform: index === activeIndex ? 'scale(1.035)' : `scale(${scale})`,
    color: `rgba(255, 255, 255, ${colorAlpha})`
  }
}

const setLyricLineRef = (element: Element | ComponentPublicInstance | null, index: number) => {
  if (!element) {
    lyricLineRefs.value[index] = null
    return
  }

  lyricLineRefs.value[index] = ('$el' in element ? element.$el : element) as HTMLElement
}

const scrollToActiveLyric = (behavior: ScrollBehavior = 'smooth') => {
  if (!isMusicDisplayMode.value) {
    return
  }

  const activeIndex = activeSubtitleIndex.value
  if (activeIndex < 0) {
    return
  }

  const activeElement = lyricLineRefs.value[activeIndex]
  if (!activeElement) {
    return
  }

  activeElement.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior
  })
}

const clampIndex = (index: number) => {
  if (!orderedPlaylist.value.length) {
    return 0
  }

  if (index < 0) {
    return orderedPlaylist.value.length - 1
  }

  if (index >= orderedPlaylist.value.length) {
    return 0
  }

  return index
}

const resolveNextTrackIndex = (direction: 'previous' | 'next' | 'ended') => {
  if (!orderedPlaylist.value.length) {
    return currentIndex.value
  }

  if (playbackMode.value === 'repeat-one' && direction === 'ended') {
    return currentIndex.value
  }

  if (direction === 'previous') {
    return clampIndex(currentIndex.value - 1)
  }

  if (playbackMode.value === 'shuffle' && orderedPlaylist.value.length > 1) {
    let nextIndex = currentIndex.value
    while (nextIndex === currentIndex.value) {
      nextIndex = Math.floor(Math.random() * orderedPlaylist.value.length)
    }
    return nextIndex
  }

  const nextIndex = currentIndex.value + 1
  if (nextIndex >= orderedPlaylist.value.length) {
    if (playbackMode.value === 'loop') {
      return 0
    }

    if (direction === 'ended') {
      return -1
    }
  }

  return clampIndex(nextIndex)
}

const cyclePlaybackMode = () => {
  const nextModeMap: Record<AudioPlaybackMode, AudioPlaybackMode> = {
    order: 'loop',
    loop: 'shuffle',
    shuffle: 'repeat-one',
    'repeat-one': 'order'
  }

  playbackMode.value = nextModeMap[playbackMode.value]
}

const canReuseCurrentPlayback = () => {
  const activeTrackPath = String(currentTrack.value?.path ?? '').trim()
  if (!activeTrackPath) {
    return false
  }

  if (!playbackSessionActive.value) {
    return false
  }

  if (!orderedPlaylist.value.some((track) => String(track?.path ?? '').trim() === activeTrackPath)) {
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

const normalizeResumeTime = (resumeTime: number, mediaDuration: number) => {
  const normalizedResumeTime = Math.max(0, Number(resumeTime ?? 0))
  const normalizedDuration = Math.max(0, Number(mediaDuration ?? 0))
  const thresholdPercent = Math.max(0, Math.min(100, Number(props.resumeRestartThreshold ?? 95)))
  if (!normalizedDuration) {
    return normalizedResumeTime
  }

  return normalizedResumeTime / normalizedDuration >= thresholdPercent / 100 ? 0 : normalizedResumeTime
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
  if (normalizedPath.endsWith('.m4a')) return 'audio/mp4'
  if (normalizedPath.endsWith('.aac')) return 'audio/aac'
  if (normalizedPath.endsWith('.ogg')) return 'audio/ogg'
  if (normalizedPath.endsWith('.opus')) return 'audio/opus'
  if (normalizedPath.endsWith('.wma')) return 'audio/x-ms-wma'
  if (normalizedPath.endsWith('.ape')) return 'audio/ape'
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
  resourceId: currentResourceId.value,
  title: resourceTitleText.value,
  artist: artistText.value,
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
  playlistSize: orderedPlaylist.value.length
})

const syncOrderedPlaylist = (playlist: AudioTrack[]) => {
  const nextPlaylist = Array.isArray(playlist)
    ? playlist
      .map((track) => ({ ...track }))
      .filter((track) => String(track?.path ?? '').trim())
    : []

  const activeTrackPath = String(currentTrack.value?.path ?? '').trim()
  orderedPlaylist.value = nextPlaylist

  if (!nextPlaylist.length) {
    currentIndex.value = 0
    return
  }

  const preservedIndex = activeTrackPath
    ? nextPlaylist.findIndex((track) => String(track?.path ?? '').trim() === activeTrackPath)
    : -1

  if (preservedIndex >= 0) {
    currentIndex.value = preservedIndex
    return
  }

  const initialIndex = nextPlaylist.findIndex((track) => String(track?.path ?? '').trim() === String(props.initialPath ?? '').trim())
  currentIndex.value = initialIndex >= 0 ? initialIndex : 0
}

const clearDragState = () => {
  draggingTrackIndex.value = null
  dragOverTrackIndex.value = null
  dragOverPosition.value = null
}

const resolveDragPosition = (event: DragEvent) => {
  const currentTarget = event.currentTarget
  if (!(currentTarget instanceof HTMLElement)) {
    return 'after' as const
  }

  const rect = currentTarget.getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? 'before' as const : 'after' as const
}

const reorderPlaylist = (fromIndex: number, targetIndex: number, position: 'before' | 'after') => {
  if (fromIndex < 0 || targetIndex < 0 || fromIndex >= orderedPlaylist.value.length || targetIndex >= orderedPlaylist.value.length) {
    clearDragState()
    return
  }

  let insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  if (fromIndex < insertIndex) {
    insertIndex -= 1
  }

  if (insertIndex === fromIndex) {
    clearDragState()
    return
  }

  const nextPlaylist = [...orderedPlaylist.value]
  const [movedTrack] = nextPlaylist.splice(fromIndex, 1)
  nextPlaylist.splice(insertIndex, 0, movedTrack)
  const activeTrackPath = String(currentTrack.value?.path ?? '').trim()

  orderedPlaylist.value = nextPlaylist

  if (activeTrackPath) {
    const nextCurrentIndex = nextPlaylist.findIndex((track) => String(track?.path ?? '').trim() === activeTrackPath)
    currentIndex.value = nextCurrentIndex >= 0 ? nextCurrentIndex : Math.max(0, Math.min(insertIndex, nextPlaylist.length - 1))
  } else {
    currentIndex.value = Math.max(0, Math.min(insertIndex, nextPlaylist.length - 1))
  }

  setAudioPlayerSession({
    playlist: nextPlaylist,
    initialPath: activeTrackPath || String(nextPlaylist[currentIndex.value]?.path ?? '')
  })
  suppressPlaylistReload = true

  clearDragState()
}

const handleTrackDragStart = (index: number, event: DragEvent) => {
  draggingTrackIndex.value = index
  dragOverTrackIndex.value = index
  dragOverPosition.value = 'after'
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

const handleTrackDragOver = (index: number, event: DragEvent) => {
  if (draggingTrackIndex.value === null) {
    return
  }

  event.preventDefault()
  dragOverTrackIndex.value = index
  dragOverPosition.value = resolveDragPosition(event)
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

const handleTrackDrop = (index: number, event: DragEvent) => {
  if (draggingTrackIndex.value === null) {
    return
  }

  event.preventDefault()
  reorderPlaylist(draggingTrackIndex.value, index, resolveDragPosition(event))
}

const handleTrackDragEnd = () => {
  clearDragState()
}

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

    if (!playbackSessionActive.value && currentResourceId.value) {
      try {
        await window.api.service.startAsmrPlayback(currentResourceId.value)
        playbackSessionActive.value = true
        playbackSessionResourceId = currentResourceId.value
        playbackSessionTrackPath = String(currentTrack.value?.path ?? '').trim()
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
    playbackSessionResourceId || currentResourceId.value,
    playbackSessionTrackPath || String(currentTrack.value?.path ?? ''),
    playbackTimeOverride
  )
}

const finalizePlaybackSession = async (resourceIdOverride?: string, filePathOverride?: string, playbackTimeOverride?: number) => {
  const resourceId = String(resourceIdOverride ?? playbackSessionResourceId ?? currentResourceId.value ?? '').trim()
  const filePath = String(filePathOverride ?? playbackSessionTrackPath ?? currentTrack.value?.path ?? '').trim()
  const playbackTime = Math.max(0, Math.floor(Number(playbackTimeOverride ?? getResolvedPlaybackTime())))

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
  playbackSessionResourceId = ''
  playbackSessionTrackPath = ''
}

const stopPlayback = async () => {
  if (stopPlaybackTask.value) {
    await stopPlaybackTask.value
    return
  }

  stopPlaybackTask.value = (async () => {
    audioRef.value?.pause()

    await finalizePlaybackSession(currentResourceId.value, String(currentTrack.value?.path ?? ''))

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
      isPlaying: false,
      playbackMode: playbackMode.value,
      coverSrc: ''
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
      logger.info('reusing cached audio url', {
        ...buildPlaybackLogContext(),
        filePath: normalizedPath
      })
    }
    return
  }

  logger.info('resolving audio playback url', {
    ...buildPlaybackLogContext(),
    filePath: normalizedPath
  })

  const playbackUrl = await window.api.dialog.getAudioPlaybackUrl(normalizedPath)
  if (playbackUrl?.url) {
    logger.info('resolved audio playback url', {
      ...buildPlaybackLogContext(),
      filePath: normalizedPath,
      playbackPath: playbackUrl.playbackPath,
      transcoded: playbackUrl.transcoded
    })
    audioUrlMap.value = {
      ...audioUrlMap.value,
      [normalizedPath]: playbackUrl.url
    }
    return
  }

  logger.info('falling back to audio binary file', {
    ...buildPlaybackLogContext(),
    filePath: normalizedPath
  })
  const binaryData = await window.api.dialog.readBinaryFile(normalizedPath)
  if (!binaryData || !binaryData.length) {
    logger.error('failed to resolve audio playback url or read binary file', {
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

const loadSubtitleForTrack = async (trackPath: string, explicitSubtitlePath?: string) => {
  subtitleCueList.value = []
  subtitleLoadState.value = 'loading'

  const normalizedPath = String(trackPath ?? '').trim()
  if (!normalizedPath) {
    subtitleLoadState.value = 'empty'
    return
  }

  const subtitleCandidates = [
    String(explicitSubtitlePath ?? '').trim(),
    ...['.lrc', '.srt', '.vtt'].map((extension) =>
    [
      normalizedPath.replace(/\.[^./\\]+$/, extension),
      `${normalizedPath}${extension}`
    ]
  ).flat()
  ].filter(Boolean)

  for (const subtitlePath of subtitleCandidates) {
    const info = await window.api.dialog.getTextFileInfo(subtitlePath)
    if (!info || info.size > MAX_SUBTITLE_FILE_BYTES) {
      continue
    }

    const content = await window.api.dialog.readTextFile(subtitlePath, info.encoding)
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
  const nextIndex = clampIndex(index)
  const previousTrackPath = String(currentTrack.value?.path ?? '').trim()
  const previousResourceId = String(playbackSessionResourceId || currentResourceId.value).trim()
  const nextTrackPath = String(orderedPlaylist.value[nextIndex]?.path ?? '').trim()

  if (previousTrackPath && previousTrackPath !== nextTrackPath) {
    await finalizePlaybackSession(previousResourceId, previousTrackPath)
  }

  logger.info('syncTrack invoked', {
    ...buildPlaybackLogContext(),
    nextIndex,
    autoplay,
    startTime
  })
  currentIndex.value = nextIndex
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
    loadSubtitleForTrack(trackPath, String(currentTrack.value?.subtitlePath ?? ''))
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
  const previousIndex = resolveNextTrackIndex('previous')
  void syncTrack(previousIndex, true)
}

const goNext = () => {
  const nextIndex = resolveNextTrackIndex('next')
  void syncTrack(nextIndex, true)
}

const handleAudioEnded = () => {
  const nextIndex = resolveNextTrackIndex('ended')
  if (nextIndex < 0) {
    void stopPlayback()
    return
  }

  void syncTrack(nextIndex, true, 0)
}

const handleLoadedMetadata = () => {
  const audioElement = audioRef.value
  if (!audioElement) {
    return
  }

  duration.value = Number.isFinite(audioElement.duration) ? audioElement.duration : (Number(currentTrack.value?.duration ?? 0) || 0)

  if (pendingSeekTime.value > 0) {
    const nextTime = normalizeResumeTime(
      pendingSeekTime.value,
      duration.value || pendingSeekTime.value
    )
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

const handleLyricJump = (cue: SubtitleCue) => {
  handleSeek(Math.max(0, Number(cue.start ?? 0)))
}

const previewLyricsWhileScrolling = () => {
  isLyricScrollPreviewing.value = true

  if (lyricScrollPreviewTimer) {
    clearTimeout(lyricScrollPreviewTimer)
  }

  lyricScrollPreviewTimer = setTimeout(() => {
    isLyricScrollPreviewing.value = false
    lyricScrollPreviewTimer = null
  }, 900)
}

const resolveCoverPreviewSource = async (coverPath: string) => {
  const normalizedCoverPath = String(coverPath ?? '').trim()
  if (!normalizedCoverPath) {
    return ''
  }

  if (/^https?:\/\//i.test(normalizedCoverPath) || /^data:/i.test(normalizedCoverPath)) {
    return normalizedCoverPath
  }

  try {
    return (await window.api.dialog.getImagePreviewUrl(normalizedCoverPath, {
      maxWidth: 720,
      maxHeight: 720,
      fit: 'cover',
      quality: 84
    })) ?? ''
  } catch {
    return ''
  }
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

  const initialIndex = orderedPlaylist.value.findIndex((track) => track.path === props.initialPath)
  await syncTrack(initialIndex >= 0 ? initialIndex : 0, true, props.initialTime)
})

watch(() => props.initialPath, async (filePath) => {
  if (!props.show) {
    return
  }

  const nextIndex = orderedPlaylist.value.findIndex((track) => track.path === filePath)
  if (nextIndex >= 0 && nextIndex !== currentIndex.value) {
    await syncTrack(nextIndex, true, props.initialTime)
  }
})

watch(() => props.playlist, async (playlist) => {
  syncOrderedPlaylist(playlist)

  if (suppressPlaylistReload) {
    suppressPlaylistReload = false
    return
  }

  if (!props.show || !orderedPlaylist.value.length) {
    return
  }

  const nextIndex = orderedPlaylist.value.findIndex((track) => track.path === props.initialPath)
  await syncTrack(nextIndex >= 0 ? nextIndex : 0, true, props.initialTime)
}, { deep: true, immediate: true })

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
    audioElement.currentTime = normalizeResumeTime(normalizedTime, duration.value)
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

  if (!playbackSessionActive.value && !playbackSessionResourceId && !playbackSessionTrackPath) {
    return
  }

  await finalizePlaybackSession(
    playbackSessionResourceId || normalizedPreviousResourceId,
    playbackSessionTrackPath || String(currentTrack.value?.path ?? '')
  )
})

watch(() => [props.title, props.artist, props.displayMode, props.coverSrc, props.playlist] as const, ([nextTitle, nextArtist, nextDisplayMode, nextCoverSrc, nextPlaylist]) => {
  setAudioPlayerSession({
    title: nextTitle,
    artist: nextArtist,
    displayMode: nextDisplayMode,
    coverSrc: nextCoverSrc,
    playlist: nextPlaylist
  })
}, { deep: true, immediate: true })

watch(() => [currentTrack.value, currentTime.value, duration.value, isPlaying.value] as const, ([track, time, totalDuration, playing]) => {
  setAudioPlayerPlaybackState({
    currentTrack: track,
    currentTime: time,
    duration: totalDuration,
    isPlaying: playing,
    playbackMode: playbackMode.value
  })

  if (!track?.path) {
    removeOngoingCenterItem(AUDIO_PLAYER_ONGOING_ID)
    return
  }

  upsertOngoingCenterItem({
    id: AUDIO_PLAYER_ONGOING_ID,
    title: '正在播放',
    content: [miniPlayerPrimaryText.value, miniPlayerSecondaryText.value].filter(Boolean).join('\n'),
    kind: 'audio-player',
    meta: {
      title: resourceTitleText.value,
      artist: artistText.value,
      coverSrc: currentCoverSrc.value,
      trackLabel: track.label,
      primaryText: miniPlayerPrimaryText.value,
      secondaryText: miniPlayerSecondaryText.value,
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

watch(playbackMode, (mode) => {
  setAudioPlayerPlaybackState({
    playbackMode: mode
  })
})

watch(volume, (nextVolume) => {
  if (audioRef.value) {
    audioRef.value.volume = Math.max(0, Math.min(1, nextVolume / 100))
  }
})

watch(currentTrack, (track) => {
  if (!track) {
    subtitleCueList.value = []
  }
  lyricLineRefs.value = []
})

watch(() => [currentTrack.value?.coverSrc, currentTrack.value?.coverPath, props.coverSrc] as const, async ([trackCoverSrc, trackCoverPath, fallbackCoverSrc]) => {
  currentCoverPreviewSrc.value = await resolveCoverPreviewSource(
    String(trackCoverSrc ?? '').trim()
    || String(trackCoverPath ?? '').trim()
    || String(fallbackCoverSrc ?? '').trim()
  )
}, { immediate: true })

watch(currentCoverPreviewSrc, (nextCoverSrc) => {
  setAudioPlayerPlaybackState({
    coverSrc: nextCoverSrc
  })
}, { immediate: true })

watch(activeSubtitleIndex, async (nextIndex, previousIndex) => {
  if (!isMusicDisplayMode.value || nextIndex < 0 || nextIndex === previousIndex) {
    return
  }

  await nextTick()
  scrollToActiveLyric(isPlaying.value ? 'smooth' : 'auto')
})

watch(() => subtitleCueList.value.length, async (length) => {
  if (!isMusicDisplayMode.value || length <= 0) {
    return
  }

  await nextTick()
  scrollToActiveLyric('auto')
})

watch(() => props.show, async (visible) => {
  if (!visible || !isMusicDisplayMode.value) {
    return
  }

  await nextTick()
  scrollToActiveLyric('auto')
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  registerAudioPlayerControls({
    playPause: () => togglePlayback(),
    previous: goPrevious,
    next: goNext,
    cyclePlaybackMode,
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
  if (playbackSessionActive.value && playbackSessionResourceId) {
    void window.api.service.stopAsmrPlayback(playbackSessionResourceId)
  }
  clearAudioPlayerControls()
  removeOngoingCenterItem(AUDIO_PLAYER_ONGOING_ID)
  revokeAllAudioObjectUrls()
  if (lyricScrollPreviewTimer) {
    clearTimeout(lyricScrollPreviewTimer)
    lyricScrollPreviewTimer = null
  }
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
          <div
            class="audio-player__hero"
            :class="{ 'audio-player__hero--music': isMusicDisplayMode }"
          >
            <div class="audio-player__cover-panel" :class="{ 'audio-player__cover-panel--music': isMusicDisplayMode }">
              <div class="audio-player__cover-shell">
                <img v-if="currentCoverSrc" :src="currentCoverSrc" alt="专辑封面" class="audio-player__cover-image" />
                <div v-else class="audio-player__cover-placeholder">NO COVER</div>
              </div>
              <div class="audio-player__title">{{ fullPlayerPrimaryText }}</div>
              <div class="audio-player__meta">{{ fullPlayerSecondaryText }}</div>
            </div>

            <div
              v-if="isMusicDisplayMode"
              class="audio-player__lyrics-panel"
              :class="{ 'audio-player__lyrics-panel--previewing': isLyricScrollPreviewing }"
            >
              <div class="audio-player__lyrics-backdrop"></div>
              <div class="audio-player__lyrics-header">歌词</div>
              <div class="audio-player__lyrics-scroll" @wheel.passive="previewLyricsWhileScrolling">
                <div v-if="subtitleCueList.length" class="audio-player__lyrics-list">
                  <div
                    v-for="(cue, index) in subtitleCueList"
                    :key="`${cue.start}-${index}`"
                    class="audio-player__lyric-line"
                    :class="{ 'audio-player__lyric-line--active': index === activeSubtitleIndex }"
                    :ref="(element) => setLyricLineRef(element, index)"
                    :style="getLyricLineStyle(index)"
                    @click="handleLyricJump(cue)"
                  >
                    {{ cue.text }}
                  </div>
                </div>
                <div
                  v-else-if="subtitleLoadState === 'loading'"
                  class="audio-player__lyrics-empty"
                >
                  正在读取歌词
                </div>
                <div v-else class="audio-player__lyrics-empty">
                  暂无歌词
                </div>
              </div>
            </div>

            <div v-else class="audio-player__subtitle-stage">
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
                <n-tooltip v-if="isMusicDisplayMode" trigger="hover">
                  <template #trigger>
                    <n-button circle secondary @click="cyclePlaybackMode">
                      <template #icon>
                        <n-icon :component="playbackModeIcon" />
                      </template>
                    </n-button>
                  </template>
                  {{ playbackModeLabel }}
                </n-tooltip>
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
                v-for="(track, index) in orderedPlaylist"
                :key="track.path"
                type="button"
                class="audio-player__track"
                :class="{
                  'audio-player__track--active': index === currentIndex,
                  'audio-player__track--dragging': index === draggingTrackIndex,
                  'audio-player__track--drop-before': index === dragOverTrackIndex && dragOverPosition === 'before' && index !== draggingTrackIndex,
                  'audio-player__track--drop-after': index === dragOverTrackIndex && dragOverPosition === 'after' && index !== draggingTrackIndex
                }"
                draggable="true"
                @click="syncTrack(index, true)"
                @dragstart="handleTrackDragStart(index, $event)"
                @dragover="handleTrackDragOver(index, $event)"
                @drop="handleTrackDrop(index, $event)"
                @dragend="handleTrackDragEnd"
              >
                <div class="audio-player__track-text">
                  <div class="audio-player__track-name">{{ track.label }}</div>
                  <div class="audio-player__track-meta">
                    <div class="audio-player__track-directory">{{ getTrackDirectoryLabel(track.path) }}</div>
                    <span v-if="track.hasSubtitle" class="audio-player__subtitle-badge">{{ isMusicDisplayMode ? '歌词' : '字幕' }}</span>
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
  width: 94vw !important;
  max-width: 1440px;
  border-radius: 18px;
}

.audio-player :deep(.n-card) {
  background: rgba(18, 18, 18, 0.95);
  backdrop-filter: blur(14px);
}

.audio-player :deep(.n-card__content) {
  width: 100%;
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

.audio-player__hero {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.audio-player__hero--music {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.1fr);
  gap: 32px;
  align-items: stretch;
  padding: 4px 0 20px;
}

.audio-player__cover-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

.audio-player__cover-panel--music {
  justify-content: center;
  min-width: 0;
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

.audio-player__lyrics-panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 30px 0 26px 40px;
  overflow: hidden;
}

.audio-player__lyrics-backdrop {
  position: absolute;
  inset: 0 0 0 18px;
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(19, 22, 28, 0.94) 0%, rgba(19, 22, 28, 0.7) 14%, rgba(19, 22, 28, 0.14) 44%, rgba(19, 22, 28, 0.08) 56%, rgba(19, 22, 28, 0.7) 86%, rgba(19, 22, 28, 0.94) 100%),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.015));
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.32s ease;
}

.audio-player__lyrics-panel--previewing .audio-player__lyrics-backdrop {
  opacity: 0.01;
}

.audio-player__lyrics-header {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.3);
}

.audio-player__lyrics-scroll {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 18vh 26px 18vh 14px;
  scrollbar-width: none;
  scroll-behavior: smooth;
}

.audio-player__lyrics-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.audio-player__lyrics-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 14px 0 8px;
}

.audio-player__lyric-line {
  transform-origin: center center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: pointer;
  transition:
    color 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.52s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    text-shadow 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  opacity: 0.86;
  filter: blur(0.15px);
}

.audio-player__lyric-line:hover {
  text-shadow: 0 8px 18px rgba(0, 0, 0, 0.2);
}

.audio-player__lyric-line--active {
  color: rgba(255, 255, 255, 0.98);
  opacity: 1;
  transform: scale(1.035);
  filter: none;
  text-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
}

.audio-player__lyrics-empty {
  position: relative;
  z-index: 1;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: rgba(255, 255, 255, 0.44);
  font-size: 15px;
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
  position: relative;
  transition: background-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.audio-player__track:hover {
  background: rgba(255, 255, 255, 0.06);
}

.audio-player__track--active {
  background: rgba(99, 226, 183, 0.16);
  box-shadow: inset 0 0 0 1px rgba(99, 226, 183, 0.26);
}

.audio-player__track--dragging {
  opacity: 0.48;
}

.audio-player__track--drop-before::before,
.audio-player__track--drop-after::after {
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  height: 2px;
  border-radius: 999px;
  background: rgb(99, 226, 183);
  box-shadow: 0 0 0 1px rgba(99, 226, 183, 0.24);
}

.audio-player__track--drop-before::before {
  top: -2px;
}

.audio-player__track--drop-after::after {
  bottom: -2px;
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
    width: 94vw !important;
    max-width: 94vw;
  }

  .audio-player :deep(.n-card__content) {
    width: 100%;
  }

  .audio-player__shell {
    height: min(92vh, 980px);
  }

  .audio-player__layout {
    grid-template-columns: 1fr;
  }

  .audio-player__hero--music {
    grid-template-columns: 1fr;
    gap: 20px;
    padding-bottom: 12px;
  }

  .audio-player__lyrics-panel {
    padding: 18px 0 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .audio-player__lyrics-backdrop {
    inset: 12px 0 0;
  }

  .audio-player__lyrics-scroll {
    padding: 11vh 14px 11vh 10px;
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

  .audio-player__lyric-line {
    font-size: 16px;
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
