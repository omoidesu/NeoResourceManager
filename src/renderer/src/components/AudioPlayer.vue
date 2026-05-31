<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { ChevronBackOutline, ChevronForwardOutline, CloseOutline, Pause, Play, Repeat, Shuffle, Square, SwapHorizontal, VolumeHighOutline, VolumeMuteOutline } from '@vicons/ionicons5'
import { notify } from '../utils/notification'
import { createLogger } from '../../../main/util/logger'
import { resolveImagePreviewSource } from '../shared/preview/usePreviewAssetLoader'
import {
  clearAudioPlayerControls,
  registerAudioPlayerControls,
  setAudioPlayerPlaybackState,
  setAudioPlayerSession,
  setAudioPlayerVisible
} from '../utils/audio-player-store'
import { removeOngoingCenterItem, upsertOngoingCenterItem } from '../utils/notification-center'
import { useAudioPlaylistRuntime } from './audio-player/composables/useAudioPlaylistRuntime'
import { useAudioPlaybackSession } from './audio-player/composables/useAudioPlaybackSession'

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

type OsuVisibleTrackEntry = {
  track: AudioTrack
  index: number
  distance: number
  stackOrder: number
}

type PlayerLayoutMode = 'classic' | 'osu'
type AppScrollbarPublicInstance = ComponentPublicInstance & {
  containerRef?: HTMLElement | null
  scrollTo?: (options: ScrollToOptions) => void
}

const props = withDefaults(defineProps<{
  show: boolean
  resourceId?: string
  playlist: AudioTrack[]
  initialPath?: string
  initialTime?: number
  sessionVersion?: number
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
const AUDIO_PLAYER_LAYOUT_MODE_STORAGE_KEY = 'neo-resource:audio-player-layout-mode'
const AUDIO_PLAYER_OSU_UNLOCKED_STORAGE_KEY = 'neo-resource:audio-player-osu-unlocked'
const AUDIO_AUTOPLAY_RETRY_DELAY_MS = 180
const MAX_AUDIO_AUTOPLAY_ATTEMPTS = 4
const logger = createLogger('audio-player')

const getAudioElementDiagnostics = () => {
  const audioElement = audioRef.value
  const mediaError = audioElement?.error

  return {
    currentSrc: String(audioElement?.currentSrc ?? '').trim(),
    readyState: Number(audioElement?.readyState ?? 0),
    networkState: Number(audioElement?.networkState ?? 0),
    paused: Boolean(audioElement?.paused ?? true),
    ended: Boolean(audioElement?.ended ?? false),
    seeking: Boolean(audioElement?.seeking ?? false),
    localCurrentTime: Number(audioElement?.currentTime ?? 0),
    localDuration: Number(audioElement?.duration ?? 0),
    mediaErrorCode: Number(mediaError?.code ?? 0),
    mediaErrorMessage: String(mediaError?.message ?? '').trim(),
    pendingAutoplayAttempts
  }
}

const logAudioPlayback = (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
  window.api?.diagnostics?.logRenderer(level, `audio playback: ${message}`, {
    ...buildPlaybackLogContext(),
    ...getAudioElementDiagnostics(),
    ...(meta ?? {})
  })
}

const resolveAudioElementErrorMessage = (mediaErrorCode: number | null) => {
  switch (mediaErrorCode) {
    case 1:
      return '音频加载已中断'
    case 2:
      return '音频数据加载中断'
    case 3:
      return '播放器无法解码当前音频'
    case 4:
      return '当前音频格式不兼容'
    default:
      return '当前音频无法播放'
  }
}

const getAudioPlaybackFailureMessage = (fallback = '当前音频无法播放') => {
  const message = String(playbackError.value ?? '').trim()
  return message || fallback
}

const readStoredPlayerLayoutMode = (): PlayerLayoutMode => {
  if (typeof window === 'undefined') {
    return 'classic'
  }

  try {
    const storedMode = window.localStorage.getItem(AUDIO_PLAYER_LAYOUT_MODE_STORAGE_KEY)
    return storedMode === 'osu' ? 'osu' : 'classic'
  } catch (error) {
    logger.warn('读取音频播放器布局偏好失败', error)
    return 'classic'
  }
}

const readStoredOsuUnlockedState = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(AUDIO_PLAYER_OSU_UNLOCKED_STORAGE_KEY) === '1'
  } catch (error) {
    logger.warn('读取 osu 播放器彩蛋状态失败', error)
    return false
  }
}

const persistPlayerLayoutMode = (mode: PlayerLayoutMode): void => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(AUDIO_PLAYER_LAYOUT_MODE_STORAGE_KEY, mode)
  } catch (error) {
    logger.warn('保存音频播放器布局偏好失败', error)
  }
}

const persistOsuUnlockedState = (unlocked: boolean): void => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(AUDIO_PLAYER_OSU_UNLOCKED_STORAGE_KEY, unlocked ? '1' : '0')
  } catch (error) {
    logger.warn('保存 osu 播放器彩蛋状态失败', error)
  }
}

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(85)
const audioUrlMap = ref<Record<string, string>>({})
const audioObjectUrlMap = ref<Record<string, string>>({})
const trackDurationMap = ref<Record<string, number>>({})
const trackCoverPreviewSrcMap = ref<Record<string, string>>({})
const subtitleCueList = ref<SubtitleCue[]>([])
const subtitleLoadState = ref<'idle' | 'loading' | 'ready' | 'empty'>('idle')
const lyricLineRefs = ref<Array<HTMLElement | null>>([])
const classicPlaylistScrollRef = ref<AppScrollbarPublicInstance | null>(null)
const classicPlaylistTrackRefs = ref<Array<HTMLElement | null>>([])
const MAX_SUBTITLE_FILE_BYTES = 2 * 1024 * 1024
const currentCoverPreviewSrc = ref('')
const isLyricScrollPreviewing = ref(false)
const playerLayoutMode = ref<PlayerLayoutMode>(readStoredPlayerLayoutMode())
const osuEasterEggInput = ref('')
const osuEasterEggUnlocked = ref(readStoredOsuUnlockedState())
const osuPlaylistFocusIndex = ref(0)
const osuPlayedTrackPathSet = ref<Set<string>>(new Set())
const pendingAutoplay = ref(false)
const pendingSeekTime = ref(0)
const playbackError = ref('')
const stopPlaybackTask = ref<Promise<void> | null>(null)
let lyricScrollPreviewTimer: ReturnType<typeof setTimeout> | null = null
let osuPlaylistWheelTimer: ReturnType<typeof setTimeout> | null = null
let classicPlaylistCenterFrame: number | null = null
let classicPlaylistCenterTimers: Array<ReturnType<typeof setTimeout>> = []
let playlistDurationLoadToken = 0
let playlistCoverLoadToken = 0
let coverPreviewLoadToken = 0
let syncRequestId = 0
let pendingAutoplayAttempts = 0
let pendingAutoplayTimer: ReturnType<typeof setTimeout> | null = null

const {
  orderedPlaylist,
  currentIndex,
  playbackMode,
  draggingTrackIndex,
  dragOverTrackIndex,
  dragOverPosition,
  currentTrack,
  playlistBaseSegments,
  clampIndex,
  resolveNextTrackIndex,
  cyclePlaybackMode,
  syncOrderedPlaylist,
  consumeSuppressPlaylistReload,
  handleTrackDragStart,
  handleTrackDragOver,
  handleTrackDrop,
  handleTrackDragEnd
} = useAudioPlaylistRuntime({
  getInitialPath: () => String(props.initialPath ?? '').trim(),
  onPlaylistReordered: (playlist, initialPath) => {
    setAudioPlayerSession({
      playlist,
      initialPath
    })
  }
})
const currentAudioSrc = computed(() => audioUrlMap.value[currentTrack.value?.path ?? ''] ?? '')
const currentResourceId = computed(() => String(currentTrack.value?.resourceId ?? props.resourceId ?? '').trim())
const resourceTitleText = computed(() => String(currentTrack.value?.resourceTitle ?? '').trim() || String(props.title ?? '').trim() || String(currentTrack.value?.label ?? '').trim() || '音频播放器')
const artistText = computed(() => String(currentTrack.value?.artist ?? props.artist ?? '').trim())
const currentCoverSrc = computed(() => currentCoverPreviewSrc.value)
const isMusicDisplayMode = computed(() => props.displayMode === 'music')
const isOsuLayout = computed(() => isMusicDisplayMode.value && playerLayoutMode.value === 'osu')
const isOsuLayoutToggleVisible = computed(() => isMusicDisplayMode.value && (osuEasterEggUnlocked.value || isOsuLayout.value))
const toolbarTitleText = computed(() => String(currentTrack.value?.label ?? '').trim() || resourceTitleText.value)
const playerLayoutToggleText = computed(() => (isOsuLayout.value ? '经典' : 'osu!'))
const currentTrackOrdinal = computed(() => Math.max(0, currentIndex.value) + 1)
const osuVisibleTrackEntries = computed<OsuVisibleTrackEntry[]>(() => {
  const playlist = orderedPlaylist.value
  if (!playlist.length) {
    return []
  }

  const activeIndex = Math.max(0, Math.min(osuPlaylistFocusIndex.value, playlist.length - 1))
  const maxVisibleTracks = 9
  let startIndex = Math.max(0, activeIndex - 4)
  const endIndex = Math.min(playlist.length, startIndex + maxVisibleTracks)

  if (endIndex - startIndex < maxVisibleTracks) {
    startIndex = Math.max(0, endIndex - maxVisibleTracks)
  }

  return playlist.slice(startIndex, endIndex).map((track, offset) => {
    const index = startIndex + offset
    return {
      track,
      index,
      distance: Math.min(Math.abs(index - activeIndex), 6),
      stackOrder: offset
    }
  })
})
const osuBackdropStyle = computed(() => {
  if (!currentCoverSrc.value) {
    return {}
  }

  return {
    backgroundImage: `url("${currentCoverSrc.value.replace(/"/g, '\\"')}")`
  }
})
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
const togglePlayerLayoutMode = (): void => {
  playerLayoutMode.value = isOsuLayout.value ? 'classic' : 'osu'
}

const handleOsuEasterEggKey = (event: KeyboardEvent): void => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
    return
  }

  if (!isMusicDisplayMode.value || !isPlaying.value || !currentTrack.value) {
    osuEasterEggInput.value = ''
    return
  }

  const nextInput = `${osuEasterEggInput.value}${event.key.toLowerCase()}`.slice(-3)
  osuEasterEggInput.value = nextInput

  if (nextInput === 'osu') {
    osuEasterEggUnlocked.value = true
    playerLayoutMode.value = 'osu'
    osuEasterEggInput.value = ''
  }
}

const getOsuTrackStyle = (distance: number, isCurrentTrack: boolean, stackOrder: number): Record<string, string> => {
  return {
    '--osu-track-distance': String(distance),
    '--osu-track-max-width': isCurrentTrack ? '820px' : '760px',
    '--osu-track-width-reduction': isCurrentTrack ? '-24px' : `${distance * 18}px`,
    '--osu-track-z-index': String(20 + stackOrder)
  }
}
const getOsuTrackToneClass = (track: AudioTrack, index: number): string => {
  if (index === currentIndex.value) {
    return 'audio-player__osu-track--current'
  }

  if (osuPlayedTrackPathSet.value.has(String(track.path ?? '').trim())) {
    return 'audio-player__osu-track--played'
  }

  return 'audio-player__osu-track--pending'
}
const getOsuTrackCoverSrc = (track: AudioTrack): string => {
  const trackPath = String(track.path ?? '').trim()
  return String(track.coverSrc || trackCoverPreviewSrcMap.value[trackPath] || '').trim()
}
const currentSubtitleText = computed(() => {
  const activeCue = subtitleCueList.value.find((cue) => currentTime.value >= cue.start && currentTime.value <= cue.end)
  return activeCue?.text ?? ''
})
const activeSubtitleIndex = computed(() =>
  subtitleCueList.value.findIndex((cue) => currentTime.value >= cue.start && currentTime.value <= cue.end)
)
const {
  playbackSessionActive,
  getPlaybackSessionResourceId,
  getPlaybackSessionTrackPath,
  hasPlaybackSessionSnapshot,
  startPlaybackSession,
  finalizePlaybackSession
} = useAudioPlaybackSession({
  audioRef,
  currentTime,
  currentResourceId,
  getCurrentTrackPath: () => String(currentTrack.value?.path ?? '').trim()
})

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

const setClassicPlaylistTrackRef = (element: Element | ComponentPublicInstance | null, index: number) => {
  if (!element) {
    classicPlaylistTrackRefs.value[index] = null
    return
  }

  classicPlaylistTrackRefs.value[index] = ('$el' in element ? element.$el : element) as HTMLElement
}

const clearClassicPlaylistCenterTasks = () => {
  if (classicPlaylistCenterFrame !== null) {
    window.cancelAnimationFrame(classicPlaylistCenterFrame)
    classicPlaylistCenterFrame = null
  }

  classicPlaylistCenterTimers.forEach((timer) => clearTimeout(timer))
  classicPlaylistCenterTimers = []
}

const centerClassicPlaylistOnCurrentTrack = async (behavior: ScrollBehavior = 'smooth') => {
  if (!props.show || isOsuLayout.value || currentIndex.value < 0) {
    return
  }

  await nextTick()

  const activeElement = classicPlaylistTrackRefs.value[currentIndex.value]
    ?? (classicPlaylistScrollRef.value?.containerRef?.querySelector('.audio-player__track--active') as HTMLElement | null)
  const scrollContainer = classicPlaylistScrollRef.value?.containerRef ?? null

  if (!activeElement) {
    return
  }

  if (!scrollContainer) {
    activeElement.scrollIntoView({ block: 'center', inline: 'nearest', behavior })
    return
  }

  const activeRect = activeElement.getBoundingClientRect()
  const containerRect = scrollContainer.getBoundingClientRect()
  const targetTop = Math.max(
    0,
    Math.min(
      scrollContainer.scrollHeight - scrollContainer.clientHeight,
      scrollContainer.scrollTop
      + activeRect.top
      - containerRect.top
      - (containerRect.height - activeRect.height) / 2
    )
  )

  classicPlaylistScrollRef.value?.scrollTo?.({ top: targetTop, behavior })
  scrollContainer.scrollTop = targetTop
}

const scheduleClassicPlaylistCenter = (behavior: ScrollBehavior = 'smooth') => {
  if (!props.show || isOsuLayout.value || currentIndex.value < 0) {
    return
  }

  clearClassicPlaylistCenterTasks()

  classicPlaylistCenterFrame = window.requestAnimationFrame(() => {
    classicPlaylistCenterFrame = null
    void centerClassicPlaylistOnCurrentTrack(behavior)
  })

  classicPlaylistCenterTimers = [80, 220, 420].map((delay) =>
    setTimeout(() => {
      void centerClassicPlaylistOnCurrentTrack(behavior)
    }, delay)
  )
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

const normalizeTrackDuration = (value: unknown) => {
  const durationValue = Number(value ?? 0)
  return Number.isFinite(durationValue) && durationValue > 0 ? durationValue : 0
}

const buildPlaylistSignature = (playlist: AudioTrack[]) => {
  return (Array.isArray(playlist) ? playlist : [])
    .map((track) => [
      String(track?.path ?? '').trim(),
      String(track?.label ?? '').trim(),
      String(track?.subtitlePath ?? '').trim(),
      String(track?.coverPath ?? '').trim(),
      String(track?.coverSrc ?? '').trim(),
      String(track?.resourceId ?? '').trim()
    ].join(':'))
    .join('|')
}

const clearPendingAutoplayTimer = () => {
  if (pendingAutoplayTimer) {
    clearTimeout(pendingAutoplayTimer)
    pendingAutoplayTimer = null
  }
}

const cancelPendingAutoplay = () => {
  pendingAutoplay.value = false
  pendingAutoplayAttempts = 0
  clearPendingAutoplayTimer()
}

const rememberTrackDuration = (trackPath: string, nextDuration: unknown) => {
  const normalizedPath = String(trackPath ?? '').trim()
  const normalizedDuration = normalizeTrackDuration(nextDuration)
  if (!normalizedPath || !normalizedDuration) {
    return
  }

  trackDurationMap.value = {
    ...trackDurationMap.value,
    [normalizedPath]: normalizedDuration
  }
}

const getTrackDisplayDuration = (track: AudioTrack, index: number) => {
  const trackPath = String(track?.path ?? '').trim()
  const cachedDuration = normalizeTrackDuration(trackDurationMap.value[trackPath])
  if (cachedDuration) {
    return cachedDuration
  }

  if (index === currentIndex.value && duration.value > 0) {
    return duration.value
  }

  return normalizeTrackDuration(track?.duration)
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

const playCurrentAudio = async () => {
  const audioElement = audioRef.value
  if (!audioElement || !currentTrack.value) {
    logger.error('playCurrentAudio aborted because audio element or current track is missing', buildPlaybackLogContext())
    logAudioPlayback('error', 'play-attempt-aborted', {
      reason: !audioElement ? 'missing-audio-element' : 'missing-current-track'
    })
    return false
  }

  try {
    logAudioPlayback('info', 'play-attempt', {
      paused: Boolean(audioElement.paused),
      readyState: Number(audioElement.readyState ?? 0),
      networkState: Number(audioElement.networkState ?? 0)
    })
    logger.info('attempting audio playback', {
      ...buildPlaybackLogContext(),
      paused: Boolean(audioElement.paused),
      readyState: Number(audioElement.readyState ?? 0),
      networkState: Number(audioElement.networkState ?? 0)
    })
    await audioElement.play()
    isPlaying.value = true
    cancelPendingAutoplay()
    playbackError.value = ''
    logger.info('audio playback started', buildPlaybackLogContext())
    logAudioPlayback('info', 'play-attempt-resolved')

    await startPlaybackSession(currentResourceId.value, String(currentTrack.value?.path ?? '').trim())

    return true
  } catch (error) {
    isPlaying.value = false
    playbackError.value = '当前音频暂时无法自动播放，请重试'
    logAudioPlayback('warn', 'play-attempt-rejected', {
      error: error instanceof Error
        ? {
            message: error.message,
            stack: error.stack ?? ''
          }
        : String(error)
    })
    logger.error('audio playback rejected by browser', {
      ...buildPlaybackLogContext(),
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

const requestPendingAutoplay = () => {
  if (!pendingAutoplay.value || pendingAutoplayAttempts >= MAX_AUDIO_AUTOPLAY_ATTEMPTS) {
    logAudioPlayback('debug', 'pending-autoplay-skipped', {
      reason: !pendingAutoplay.value ? 'pending-autoplay-disabled' : 'max-attempts-reached'
    })
    return
  }

  const requestId = syncRequestId
  const requestedTrackPath = String(currentTrack.value?.path ?? '').trim()
  clearPendingAutoplayTimer()
  pendingAutoplayAttempts += 1
  logger.info('audio pending autoplay attempt', {
    ...buildPlaybackLogContext(),
    requestId,
    pendingAutoplayAttempts
  })
  logAudioPlayback('debug', 'pending-autoplay-attempt', {
    requestId,
    requestedTrackPath
  })

  void playCurrentAudio().then((played) => {
    if (
      played
      || requestId !== syncRequestId
      || requestedTrackPath !== String(currentTrack.value?.path ?? '').trim()
      || !pendingAutoplay.value
      || pendingAutoplayAttempts >= MAX_AUDIO_AUTOPLAY_ATTEMPTS
    ) {
      logAudioPlayback('debug', 'pending-autoplay-attempt-finished', {
        requestId,
        requestedTrackPath,
        played,
        staleRequest: requestId !== syncRequestId,
        trackChanged: requestedTrackPath !== String(currentTrack.value?.path ?? '').trim(),
        pendingAutoplay: Boolean(pendingAutoplay.value)
      })
      return
    }

    if (pendingAutoplayAttempts >= MAX_AUDIO_AUTOPLAY_ATTEMPTS) {
      logAudioPlayback('warn', 'pending-autoplay-exhausted', {
        requestId,
        requestedTrackPath
      })
      notify('warning', '播放音频', getAudioPlaybackFailureMessage('当前音频暂时无法自动播放，请手动重试'))
      return
    }

    logAudioPlayback('debug', 'pending-autoplay-retry-scheduled', {
      requestId,
      requestedTrackPath,
      retryDelayMs: AUDIO_AUTOPLAY_RETRY_DELAY_MS
    })
    pendingAutoplayTimer = setTimeout(() => {
      pendingAutoplayTimer = null
      requestPendingAutoplay()
    }, AUDIO_AUTOPLAY_RETRY_DELAY_MS)
  })
}

const stopPlayback = async () => {
  if (stopPlaybackTask.value) {
    await stopPlaybackTask.value
    return
  }

  stopPlaybackTask.value = (async () => {
    const stoppingTrackPath = String(currentTrack.value?.path ?? '').trim()
    if (stoppingTrackPath) {
      osuPlayedTrackPathSet.value = new Set([...osuPlayedTrackPathSet.value, stoppingTrackPath])
    }

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
      logAudioPlayback('debug', 'sync-track-audio-url-reused', {
        filePath: normalizedPath
      })
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
  logAudioPlayback('info', 'sync-track-audio-url-requested', {
    filePath: normalizedPath
  })

  const playbackUrl = await window.api.dialog.getAudioPlaybackUrl(normalizedPath)
  if (playbackUrl?.url) {
    logAudioPlayback('info', 'sync-track-audio-url-resolved', {
      filePath: normalizedPath,
      playbackPath: playbackUrl.playbackPath,
      transcoded: playbackUrl.transcoded
    })
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
  logAudioPlayback('warn', 'sync-track-audio-url-fallback-binary', {
    filePath: normalizedPath
  })
  const binaryData = await window.api.dialog.readBinaryFile(normalizedPath)
  if (!binaryData || !binaryData.length) {
    logAudioPlayback('error', 'sync-track-audio-url-fallback-failed', {
      filePath: normalizedPath,
      byteLength: Number(binaryData?.length ?? 0)
    })
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
  logAudioPlayback('info', 'sync-track-audio-object-url-created', {
    filePath: normalizedPath,
    mimeType: getAudioMimeType(normalizedPath),
    byteLength: audioBytes.byteLength
  })
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

const preloadMissingPlaylistDurations = async () => {
  const loadToken = ++playlistDurationLoadToken
  const tracks = orderedPlaylist.value
    .filter((track) => {
      const trackPath = String(track?.path ?? '').trim()
      return trackPath && !normalizeTrackDuration(track.duration) && !normalizeTrackDuration(trackDurationMap.value[trackPath])
    })
    .slice(0, 120)

  if (!tracks.length) {
    return
  }

  logger.info('preloading missing audio playlist durations', {
    ...buildPlaybackLogContext(),
    trackCount: tracks.length
  })

  for (const track of tracks) {
    if (loadToken !== playlistDurationLoadToken || !props.show) {
      return
    }

    const trackPath = String(track?.path ?? '').trim()
    if (!trackPath) {
      continue
    }

    try {
      const metadata = await window.api.dialog.getMediaMetadata(trackPath)
      rememberTrackDuration(trackPath, metadata?.duration)
    } catch (error) {
      logger.warn('failed to preload audio playlist duration', {
        filePath: trackPath,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

const preloadPlaylistCoverPreviews = async () => {
  const loadToken = ++playlistCoverLoadToken
  const tracks = orderedPlaylist.value
    .map((track) => ({
      trackPath: String(track?.path ?? '').trim(),
      coverPath: String(track?.coverPath ?? '').trim(),
      coverSrc: String(track?.coverSrc ?? '').trim()
    }))
    .filter((track) => track.trackPath && track.coverPath && !track.coverSrc)
    .slice(0, 80)

  if (!tracks.length) {
    return
  }

  for (const track of tracks) {
    if (loadToken !== playlistCoverLoadToken || !props.show) {
      return
    }

    if (trackCoverPreviewSrcMap.value[track.trackPath]) {
      continue
    }

    const previewSrc = await resolveCoverPreviewSource(track.coverPath)
    if (!previewSrc) {
      continue
    }

    trackCoverPreviewSrcMap.value = {
      ...trackCoverPreviewSrcMap.value,
      [track.trackPath]: previewSrc
    }
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
  const requestId = ++syncRequestId
  const nextIndex = clampIndex(index)
  const previousTrackPath = String(currentTrack.value?.path ?? '').trim()
  const previousResourceId = String(getPlaybackSessionResourceId() || currentResourceId.value).trim()
  const nextTrackPath = String(orderedPlaylist.value[nextIndex]?.path ?? '').trim()

  if (previousTrackPath && previousTrackPath !== nextTrackPath) {
    osuPlayedTrackPathSet.value = new Set([...osuPlayedTrackPathSet.value, previousTrackPath])
    await finalizePlaybackSession(previousResourceId, previousTrackPath)
  }

  logger.info('syncTrack invoked', {
    ...buildPlaybackLogContext(),
    nextIndex,
    autoplay,
    startTime
  })
  logAudioPlayback('info', 'sync-track-start', {
    requestId,
    requestedIndex: index,
    nextIndex,
    previousTrackPath,
    nextTrackPath,
    autoplay,
    startTime
  })
  currentIndex.value = nextIndex
  currentTime.value = 0
  duration.value = Number(currentTrack.value?.duration ?? 0) || 0
  pendingAutoplay.value = autoplay
  pendingAutoplayAttempts = 0
  clearPendingAutoplayTimer()
  pendingSeekTime.value = Math.max(0, Number(startTime ?? 0))
  playbackError.value = ''

  const trackPath = currentTrack.value?.path ?? ''
  if (!trackPath) {
    logAudioPlayback('error', 'sync-track-aborted-empty-track-path', {
      requestId
    })
    logger.error('syncTrack aborted because resolved track path is empty', buildPlaybackLogContext())
    return
  }

  await Promise.all([
    ensureAudioUrl(trackPath),
    loadSubtitleForTrack(trackPath, String(currentTrack.value?.subtitlePath ?? ''))
  ])

  if (requestId !== syncRequestId) {
    logAudioPlayback('warn', 'sync-track-stale-after-asset-load', {
      requestId,
      latestRequestId: syncRequestId
    })
    logger.warn('syncTrack aborted because a newer audio sync request arrived', {
      ...buildPlaybackLogContext(),
      requestId
    })
    return
  }

  await nextTick()

  if (requestId !== syncRequestId) {
    logAudioPlayback('warn', 'sync-track-stale-after-next-tick', {
      requestId,
      latestRequestId: syncRequestId
    })
    logger.warn('syncTrack aborted after nextTick because a newer audio sync request arrived', {
      ...buildPlaybackLogContext(),
      requestId
    })
    return
  }

  const audioElement = audioRef.value
  if (!audioElement) {
    logAudioPlayback('error', 'sync-track-missing-audio-element', {
      requestId
    })
    logger.error('syncTrack aborted because audio element is missing after nextTick', buildPlaybackLogContext())
    return
  }

  const expectedSource = String(currentAudioSrc.value ?? '').trim()
  const currentElementSource = String(audioElement.currentSrc ?? '').trim()
  const sourceAlreadyLoadingOrReady = Boolean(
    expectedSource
    && currentElementSource === expectedSource
    && (
      Number(audioElement.readyState ?? 0) > HTMLMediaElement.HAVE_NOTHING
      || Number(audioElement.networkState ?? 0) !== HTMLMediaElement.NETWORK_EMPTY
    )
  )

  if (sourceAlreadyLoadingOrReady) {
    logAudioPlayback('info', 'sync-track-audio-load-skipped', {
      requestId,
      expectedSource,
      currentElementSource,
      reason: 'source-already-loading-or-ready'
    })
    if (!audioElement.paused) {
      handleAudioPlay()
      return
    }

    requestPendingAutoplay()
    return
  }

  audioElement.pause()
  audioElement.autoplay = pendingAutoplay.value
  audioElement.currentTime = 0
  audioElement.load()
  isPlaying.value = false
  logAudioPlayback('info', 'sync-track-audio-load-requested', {
    requestId,
    trackPath
  })
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
      notify('warning', '播放音频', getAudioPlaybackFailureMessage())
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

const handleOsuPlaylistWheel = (event: WheelEvent) => {
  if (!isOsuLayout.value || orderedPlaylist.value.length <= 1) {
    return
  }

  event.preventDefault()

  if (osuPlaylistWheelTimer) {
    return
  }

  const wheelDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (Math.abs(wheelDelta) < 1) {
    return
  }

  const direction = wheelDelta > 0 ? 1 : -1
  osuPlaylistFocusIndex.value = clampIndex(osuPlaylistFocusIndex.value + direction)

  osuPlaylistWheelTimer = setTimeout(() => {
    osuPlaylistWheelTimer = null
  }, 150)
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
  logAudioPlayback('info', 'event-loadedmetadata')
  rememberTrackDuration(String(currentTrack.value?.path ?? '').trim(), duration.value)
  requestPendingAutoplay()
}

const handleCanPlay = () => {
  const audioElement = audioRef.value
  logAudioPlayback('info', 'event-canplay')
  logger.info('audio canplay event received', {
    ...buildPlaybackLogContext(),
    readyState: Number(audioElement?.readyState ?? 0),
    networkState: Number(audioElement?.networkState ?? 0)
  })

  if (!pendingAutoplay.value) {
    return
  }

  requestPendingAutoplay()
}

const handleTimeUpdate = () => {
  currentTime.value = Number(audioRef.value?.currentTime ?? 0)
}

const handleLoadStart = () => {
  logAudioPlayback('info', 'event-loadstart')
}

const handleLoadedData = () => {
  logAudioPlayback('info', 'event-loadeddata')
}

const handleDurationChange = () => {
  logAudioPlayback('debug', 'event-durationchange')
}

const handleWaiting = () => {
  logAudioPlayback('warn', 'event-waiting')
}

const handleStalled = () => {
  logAudioPlayback('warn', 'event-stalled')
}

const handleSuspend = () => {
  logAudioPlayback('debug', 'event-suspend')
}

const handleAbort = () => {
  logAudioPlayback('warn', 'event-abort')
}

const handleEmptied = () => {
  logAudioPlayback('warn', 'event-emptied')
}

const handleSeekingEvent = () => {
  logAudioPlayback('debug', 'event-seeking')
}

const handleAudioError = () => {
  const audioElement = audioRef.value
  const mediaError = audioElement?.error
  const resolvedPlaybackError = resolveAudioElementErrorMessage(Number(mediaError?.code ?? 0) || null)
  isPlaying.value = false
  cancelPendingAutoplay()
  playbackError.value = resolvedPlaybackError
  logAudioPlayback('error', 'event-error', {
    resolvedPlaybackError
  })
  logger.error('audio element emitted error event', {
    ...buildPlaybackLogContext(),
    mediaErrorCode: Number(mediaError?.code ?? 0),
    mediaErrorMessage: mediaError?.message ?? '',
    readyState: Number(audioElement?.readyState ?? 0),
    networkState: Number(audioElement?.networkState ?? 0)
  })
  notify('error', '播放音频', `${currentTrack.value?.label || '当前文件'}：${resolvedPlaybackError}`)
}

const handleAudioPlay = () => {
  isPlaying.value = true
  cancelPendingAutoplay()
  logAudioPlayback('info', 'event-play')
}

const handleAudioPause = () => {
  isPlaying.value = false
  logAudioPlayback('info', 'event-pause')
}

const handleAudioPlaying = () => {
  logAudioPlayback('info', 'event-playing')
}

const handleAudioEnded = () => {
  logAudioPlayback('info', 'event-ended')
  const nextIndex = resolveNextTrackIndex('ended')
  if (nextIndex < 0) {
    void stopPlayback()
    return
  }

  void syncTrack(nextIndex, true, 0)
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
  try {
    return await resolveImagePreviewSource(coverPath, {
      maxWidth: 720,
      maxHeight: 720,
      fit: 'cover',
      quality: 84
    })
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

  handleOsuEasterEggKey(event)

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
  logAudioPlayback('info', 'watch-show', {
    visible
  })
  setAudioPlayerVisible(visible)

  if (!visible) {
    playlistDurationLoadToken += 1
    osuEasterEggInput.value = ''
    return
  }

  if (canReuseCurrentPlayback()) {
    scheduleClassicPlaylistCenter('auto')
    return
  }

  const initialIndex = orderedPlaylist.value.findIndex((track) => track.path === props.initialPath)
  await syncTrack(initialIndex >= 0 ? initialIndex : 0, true, props.initialTime)
  scheduleClassicPlaylistCenter('auto')
})

watch(() => props.initialPath, async (filePath) => {
  logAudioPlayback('info', 'watch-initial-path', {
    filePath
  })
  if (!props.show) {
    return
  }

  const nextIndex = orderedPlaylist.value.findIndex((track) => track.path === filePath)
  if (nextIndex >= 0 && nextIndex !== currentIndex.value) {
    await syncTrack(nextIndex, true, props.initialTime)
  }
})

watch(() => props.sessionVersion, async (nextVersion, previousVersion) => {
  logAudioPlayback('info', 'watch-session-version', {
    nextVersion: Number(nextVersion ?? 0),
    previousVersion: Number(previousVersion ?? 0)
  })
  if (!props.show || !orderedPlaylist.value.length) {
    return
  }

  if (Number(nextVersion ?? 0) === Number(previousVersion ?? 0)) {
    return
  }

  const nextIndex = orderedPlaylist.value.findIndex((track) => track.path === props.initialPath)
  await syncTrack(nextIndex >= 0 ? nextIndex : currentIndex.value, true, props.initialTime)
})

watch(() => props.playlist, async (playlist, previousPlaylist) => {
  logAudioPlayback('info', 'watch-playlist', {
    nextPlaylistSize: Array.isArray(playlist) ? playlist.length : 0,
    previousPlaylistSize: Array.isArray(previousPlaylist) ? previousPlaylist.length : 0
  })
  syncOrderedPlaylist(playlist, props.initialPath)

  if (consumeSuppressPlaylistReload()) {
    return
  }

  if (buildPlaylistSignature(playlist) === buildPlaylistSignature(previousPlaylist ?? [])) {
    return
  }

  if (!props.show || !orderedPlaylist.value.length) {
    return
  }

  const nextIndex = orderedPlaylist.value.findIndex((track) => track.path === props.initialPath)
  await syncTrack(nextIndex >= 0 ? nextIndex : 0, true, props.initialTime)
}, { deep: true, immediate: true })

watch(
  () => [
    props.show,
    orderedPlaylist.value.map((track) => `${String(track?.path ?? '').trim()}:${String(track?.duration ?? '')}`).join('|')
  ] as const,
  ([visible]) => {
    if (!visible) {
      return
    }

    void preloadMissingPlaylistDurations()
  },
  { immediate: true }
)

watch(
  () => [
    props.show,
    orderedPlaylist.value.map((track) => `${String(track?.path ?? '').trim()}:${String(track?.coverSrc ?? '').trim()}:${String(track?.coverPath ?? '').trim()}`).join('|')
  ] as const,
  ([visible]) => {
    if (!visible) {
      playlistCoverLoadToken += 1
      return
    }

    void preloadPlaylistCoverPreviews()
  },
  { immediate: true }
)

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

  if (!hasPlaybackSessionSnapshot()) {
    return
  }

  await finalizePlaybackSession(
    getPlaybackSessionResourceId() || normalizedPreviousResourceId,
    getPlaybackSessionTrackPath() || String(currentTrack.value?.path ?? '')
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
  void preloadPlaylistCoverPreviews()
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

watch(isMusicDisplayMode, (musicMode) => {
  if (musicMode) {
    return
  }

  osuEasterEggInput.value = ''
})

watch(playerLayoutMode, (mode) => {
  persistPlayerLayoutMode(mode)
})

watch(osuEasterEggUnlocked, (unlocked) => {
  persistOsuUnlockedState(unlocked)
})

watch(isPlaying, (playing) => {
  if (!playing) {
    osuEasterEggInput.value = ''
  }
})

watch(currentIndex, (index) => {
  if (index >= 0) {
    osuPlaylistFocusIndex.value = index
  }
}, { immediate: true })

watch(
  () => [props.show, isOsuLayout.value, currentIndex.value, orderedPlaylist.value.length] as const,
  ([visible, osuLayout], previousState) => {
    if (!visible || osuLayout) {
      clearClassicPlaylistCenterTasks()
      return
    }

    const wasVisible = Boolean(previousState?.[0])
    scheduleClassicPlaylistCenter(wasVisible ? 'smooth' : 'auto')
  },
  { flush: 'post', immediate: true }
)

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
  const requestToken = ++coverPreviewLoadToken
  const hasActiveTrack = Boolean(String(currentTrack.value?.path ?? '').trim())
  const nextCoverSource = String(trackCoverSrc ?? '').trim()
    || String(trackCoverPath ?? '').trim()
    || (!hasActiveTrack ? String(fallbackCoverSrc ?? '').trim() : '')

  if (!nextCoverSource) {
    currentCoverPreviewSrc.value = ''
    logAudioPlayback('debug', 'cover-preview-cleared', {
      requestToken,
      hasActiveTrack
    })
    return
  }

  const resolvedCoverPreviewSrc = await resolveCoverPreviewSource(nextCoverSource)
  if (requestToken !== coverPreviewLoadToken) {
    logAudioPlayback('debug', 'cover-preview-stale', {
      requestToken,
      latestRequestToken: coverPreviewLoadToken,
      nextCoverSource
    })
    return
  }

  currentCoverPreviewSrc.value = resolvedCoverPreviewSrc
  logAudioPlayback('debug', 'cover-preview-updated', {
    requestToken,
    nextCoverSource,
    hasCover: Boolean(resolvedCoverPreviewSrc)
  })
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

watch(() => [isOsuLayout.value, props.show] as const, ([osuLayout, visible]) => {
  if (!visible || !osuLayout) {
    return
  }

  void preloadPlaylistCoverPreviews()
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
  void finalizePlaybackSession()
  audioRef.value?.pause()
  cancelPendingAutoplay()
  clearAudioPlayerControls()
  removeOngoingCenterItem(AUDIO_PLAYER_ONGOING_ID)
  revokeAllAudioObjectUrls()
  if (lyricScrollPreviewTimer) {
    clearTimeout(lyricScrollPreviewTimer)
    lyricScrollPreviewTimer = null
  }
  if (osuPlaylistWheelTimer) {
    clearTimeout(osuPlaylistWheelTimer)
    osuPlaylistWheelTimer = null
  }
  clearClassicPlaylistCenterTasks()
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :class="['audio-player', { 'audio-player--osu': isOsuLayout }]"
    :show-icon="false"
    :bordered="false"
    :closable="false"
    :mask-closable="true"
    role="dialog"
    @update:show="emit('update:show', $event)"
  >
    <div class="audio-player__shell">
      <div class="audio-player__toolbar" @click.stop>
        <div class="audio-player__toolbar-title">{{ toolbarTitleText }}</div>
        <div class="audio-player__toolbar-actions">
          <n-button
            v-if="isOsuLayoutToggleVisible"
            tertiary
            size="small"
            class="audio-player__skin-toggle"
            @click="togglePlayerLayoutMode"
          >
            <template #icon>
              <n-icon :component="SwapHorizontal" />
            </template>
            {{ playerLayoutToggleText }}
          </n-button>
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

      <div v-if="!isOsuLayout" class="audio-player__layout">
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
          <AppScrollbar ref="classicPlaylistScrollRef" class="audio-player__playlist-scroll">
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
                :ref="(element) => setClassicPlaylistTrackRef(element, index)"
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
                <div class="audio-player__track-duration">{{ formatTime(getTrackDisplayDuration(track, index)) }}</div>
              </button>
            </div>
          </AppScrollbar>
        </div>
      </div>

      <div v-else class="audio-player__osu">
        <div v-if="currentCoverSrc" class="audio-player__osu-backdrop" :style="osuBackdropStyle"></div>
        <div class="audio-player__osu-shade"></div>

        <div class="audio-player__osu-topline">
          <div class="audio-player__osu-song-info">
            <div class="audio-player__osu-kicker">{{ artistText || 'Unknown Artist' }}</div>
            <div class="audio-player__osu-title">{{ fullPlayerPrimaryText }}</div>
            <div class="audio-player__osu-subtitle">{{ fullPlayerSecondaryText }}</div>
          </div>
          <div class="audio-player__osu-stats">
            <div>
              <span>长度</span>
              <strong>{{ formatTime(duration || currentTrack?.duration) }}</strong>
            </div>
            <div>
              <span>曲目</span>
              <strong>{{ currentTrackOrdinal }} / {{ orderedPlaylist.length || 1 }}</strong>
            </div>
            <div>
              <span>模式</span>
              <strong>{{ playbackModeLabel }}</strong>
            </div>
          </div>
        </div>

        <div class="audio-player__osu-stage">
          <section class="audio-player__osu-now">
            <div class="audio-player__osu-record">
              <div class="audio-player__osu-record-mark">#{{ currentTrackOrdinal }}</div>
              <div class="audio-player__osu-record-text">
                <strong>{{ currentSubtitleText || (isPlaying ? 'Now playing' : 'Ready') }}</strong>
                <span>{{ getTrackDirectoryLabel(currentTrack?.path ?? '') || resourceTitleText }}</span>
              </div>
            </div>
            <div class="audio-player__osu-lyrics" @wheel.passive="previewLyricsWhileScrolling">
              <template v-if="subtitleCueList.length">
                <button
                  v-for="(cue, index) in subtitleCueList.slice(Math.max(activeSubtitleIndex - 2, 0), Math.max(activeSubtitleIndex - 2, 0) + 5)"
                  :key="`${cue.start}-${index}`"
                  type="button"
                  class="audio-player__osu-lyric"
                  :class="{ 'audio-player__osu-lyric--active': cue.text === currentSubtitleText }"
                  @click="handleLyricJump(cue)"
                >
                  {{ cue.text }}
                </button>
              </template>
              <div v-else class="audio-player__osu-empty">{{ subtitleLoadState === 'loading' ? '正在读取歌词' : '暂无歌词' }}</div>
            </div>
          </section>

          <aside class="audio-player__osu-list" @wheel="handleOsuPlaylistWheel">
            <div class="audio-player__osu-scroll">
              <TransitionGroup name="audio-player__osu-track-motion" tag="div" class="audio-player__osu-track-list">
                <button
                  v-for="entry in osuVisibleTrackEntries"
                  :key="entry.track.path"
                  type="button"
                  class="audio-player__osu-track"
                  :class="{
                    'audio-player__osu-track--active': entry.index === currentIndex,
                    [getOsuTrackToneClass(entry.track, entry.index)]: true,
                    'audio-player__osu-track--dragging': entry.index === draggingTrackIndex,
                    'audio-player__osu-track--drop-before': entry.index === dragOverTrackIndex && dragOverPosition === 'before' && entry.index !== draggingTrackIndex,
                    'audio-player__osu-track--drop-after': entry.index === dragOverTrackIndex && dragOverPosition === 'after' && entry.index !== draggingTrackIndex
                  }"
                  :style="getOsuTrackStyle(entry.distance, entry.index === currentIndex, entry.stackOrder)"
                  draggable="true"
                  @click="syncTrack(entry.index, true)"
                  @dragstart="handleTrackDragStart(entry.index, $event)"
                  @dragover="handleTrackDragOver(entry.index, $event)"
                  @drop="handleTrackDrop(entry.index, $event)"
                  @dragend="handleTrackDragEnd"
                >
                  <span class="audio-player__osu-track-index">
                    <img
                      v-if="getOsuTrackCoverSrc(entry.track)"
                      :src="getOsuTrackCoverSrc(entry.track)"
                      alt=""
                    />
                    <span class="audio-player__osu-track-number">{{ String(entry.index + 1).padStart(2, '0') }}</span>
                  </span>
                  <span class="audio-player__osu-track-main">
                    <strong>{{ entry.track.label }}</strong>
                    <span>{{ getTrackDirectoryLabel(entry.track.path) || entry.track.artist || resourceTitleText }}</span>
                  </span>
                  <span class="audio-player__osu-track-duration">{{ formatTime(getTrackDisplayDuration(entry.track, entry.index)) }}</span>
                </button>
              </TransitionGroup>
            </div>
          </aside>
        </div>

        <div class="audio-player__osu-bottom">
          <button type="button" class="audio-player__osu-back" @click="closePlayer">返回</button>
          <div class="audio-player__osu-timeline">
            <span>{{ formatTime(currentTime) }}</span>
            <n-slider
              :value="currentTime"
              :max="Math.max(duration, Number(currentTrack?.duration ?? 0), 1)"
              :step="0.1"
              :format-tooltip="(value: number) => formatTime(value)"
              @update:value="handleSeek"
            />
            <span>{{ formatTime(duration || currentTrack?.duration) }}</span>
          </div>
          <div class="audio-player__osu-controls">
            <n-tooltip trigger="hover">
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
            <n-button circle type="primary" class="audio-player__osu-play" @click="togglePlayback">
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
          <div class="audio-player__osu-volume">
            <n-icon :component="volume <= 0 ? VolumeMuteOutline : VolumeHighOutline" />
            <n-slider :value="volume" :max="100" @update:value="handleVolumeChange" />
          </div>
        </div>
      </div>
    </div>
  </n-modal>

  <audio
    v-if="currentAudioSrc"
    ref="audioRef"
    :src="currentAudioSrc"
    preload="metadata"
    @loadstart="handleLoadStart"
    @loadeddata="handleLoadedData"
    @ended="handleAudioEnded"
    @loadedmetadata="handleLoadedMetadata"
    @canplay="handleCanPlay"
    @durationchange="handleDurationChange"
    @waiting="handleWaiting"
    @stalled="handleStalled"
    @suspend="handleSuspend"
    @abort="handleAbort"
    @emptied="handleEmptied"
    @seeking="handleSeekingEvent"
    @timeupdate="handleTimeUpdate"
    @error="handleAudioError"
    @play="handleAudioPlay"
    @pause="handleAudioPause"
    @playing="handleAudioPlaying"
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

.audio-player__skin-toggle {
  min-width: 82px;
  font-weight: 700;
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
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: rgba(99, 226, 183, 0.46) rgba(255, 255, 255, 0.06);
  scrollbar-width: thin;
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

.audio-player__osu {
  position: relative;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  background: #05070d;
  isolation: isolate;
}

.audio-player__osu-backdrop,
.audio-player__osu-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.audio-player__osu-backdrop {
  z-index: -3;
  background-position: center;
  background-size: cover;
  filter: saturate(1.24) contrast(1.04);
  transform: scale(1.03);
}

.audio-player__osu-shade {
  z-index: -2;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.62) 0%, rgba(0, 0, 0, 0.34) 42%, rgba(0, 0, 0, 0.78) 100%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.86) 0%, rgba(0, 0, 0, 0.16) 35%, rgba(0, 0, 0, 0.84) 100%);
}

.audio-player__osu-topline {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: start;
  padding: 2px 28px 8px;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.72);
}

.audio-player__osu-song-info {
  min-width: 0;
}

.audio-player__osu-kicker {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.68);
}

.audio-player__osu-title {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 29px;
  font-weight: 800;
  line-height: 1.18;
}

.audio-player__osu-subtitle {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.78);
}

.audio-player__osu-stats {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 16px;
  padding-top: 4px;
}

.audio-player__osu-stats > div {
  display: grid;
  gap: 2px;
  text-align: right;
}

.audio-player__osu-stats span {
  font-size: 12px;
  color: rgba(178, 224, 255, 0.72);
}

.audio-player__osu-stats strong {
  font-size: 18px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.audio-player__osu-stage {
  position: relative;
  z-index: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(300px, 0.82fr) minmax(420px, 0.98fr);
  gap: 28px;
  align-items: stretch;
  padding: 0 22px 10px 28px;
}

.audio-player__osu-now {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(160px, 1fr);
  gap: 16px;
  align-items: center;
  padding: 40px 0 0;
}

.audio-player__osu-record {
  justify-self: start;
  width: min(480px, 100%);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border: 2px solid rgba(255, 255, 255, 0.92);
  background: rgba(0, 0, 0, 0.78);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.44);
}

.audio-player__osu-record-mark {
  display: grid;
  place-items: center;
  min-width: 44px;
  height: 34px;
  color: #fff;
  font-size: 18px;
  font-weight: 900;
}

.audio-player__osu-record-text {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.audio-player__osu-record-text strong,
.audio-player__osu-record-text span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-player__osu-record-text strong {
  color: #21e7ff;
  font-size: 20px;
  font-weight: 500;
}

.audio-player__osu-record-text span {
  color: rgba(255, 255, 255, 0.64);
  font-size: 12px;
}

.audio-player__osu-lyrics {
  align-self: stretch;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  overflow: hidden;
  padding: 8px 0 16px;
}

.audio-player__osu-lyric {
  border: none;
  border-radius: 0;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.36);
  color: rgba(255, 255, 255, 0.58);
  font-size: 15px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, color 0.18s ease, background-color 0.18s ease;
}

.audio-player__osu-lyric:hover,
.audio-player__osu-lyric--active {
  transform: translateX(8px);
  background: rgba(0, 167, 236, 0.72);
  color: rgba(255, 255, 255, 0.96);
}

.audio-player__osu-empty {
  color: rgba(255, 255, 255, 0.54);
  font-size: 14px;
}

.audio-player__osu-list {
  min-width: 0;
  min-height: 0;
  padding: 8px 0 8px;
  overflow: hidden;
}

.audio-player__osu-scroll {
  height: 100%;
  overflow-y: hidden;
  overflow-x: hidden;
}

.audio-player__osu-track-list {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  align-items: flex-end;
  padding: 10px 36px 14px 48px;
}

.audio-player__osu-track {
  position: relative;
  z-index: var(--osu-track-z-index);
  width: clamp(330px, calc(100% - var(--osu-track-width-reduction)), var(--osu-track-max-width, 760px));
  min-height: 74px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  margin-right: 0;
  padding: 9px 18px 9px 116px;
  border: 1px solid rgba(0, 0, 0, 0.38);
  border-radius: 4px;
  overflow: visible;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--osu-track-accent) 88%, rgba(0, 0, 0, 0.18)), color-mix(in srgb, var(--osu-track-accent) 58%, rgba(0, 0, 0, 0.3))),
    rgba(0, 0, 0, 0.66);
  color: #fff;
  cursor: pointer;
  text-align: left;
  transform-origin: right center;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.16);
  transition:
    width 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.24s ease,
    box-shadow 0.24s ease,
    filter 0.24s ease,
    opacity 0.24s ease;
}

.audio-player__osu-track + .audio-player__osu-track {
  margin-top: -8px;
}

.audio-player__osu-track--pending {
  --osu-track-accent: #ef2c91;
}

.audio-player__osu-track--played {
  --osu-track-accent: #df7100;
}

.audio-player__osu-track--current {
  --osu-track-accent: #0799cb;
}

.audio-player__osu-track:hover,
.audio-player__osu-track--active {
  transform: translateX(0) scaleX(1.01);
  filter: saturate(1.16) brightness(1.08);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.88), inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.audio-player__osu-track--dragging {
  opacity: 0.5;
}

.audio-player__osu-track--drop-before,
.audio-player__osu-track--drop-after {
  outline: 2px solid rgba(255, 255, 255, 0.88);
  outline-offset: 3px;
}

.audio-player__osu-track-index {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 104px;
  height: 66px;
  border-radius: 3px;
  overflow: hidden;
  background: color-mix(in srgb, var(--osu-track-accent) 72%, rgba(0, 0, 0, 0.28));
  font-size: 18px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--osu-track-accent) 65%, rgba(255, 255, 255, 0.18)), 0 10px 22px rgba(0, 0, 0, 0.38);
}

.audio-player__osu-track-index img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(1.08) brightness(0.88);
}

.audio-player__osu-track-index::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.58));
}

.audio-player__osu-track-number {
  position: relative;
  z-index: 1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.72);
}

.audio-player__osu-track-main {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.audio-player__osu-track-main strong,
.audio-player__osu-track-main span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-player__osu-track-main strong {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.15;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.48);
}

.audio-player__osu-track-main span {
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
}

.audio-player__osu-track-duration {
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.82);
}

.audio-player__osu-track-motion-move,
.audio-player__osu-track-motion-enter-active,
.audio-player__osu-track-motion-leave-active {
  transition:
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.24s ease;
}

.audio-player__osu-track-motion-enter-from,
.audio-player__osu-track-motion-leave-to {
  opacity: 0;
  transform: translateY(20px) translateX(40px);
}

.audio-player__osu-track-motion-leave-active {
  position: absolute;
}

.audio-player__osu-bottom {
  position: relative;
  z-index: 3;
  min-height: 112px;
  display: grid;
  grid-template-columns: 150px minmax(200px, 1fr) auto minmax(150px, 220px);
  gap: 18px;
  align-items: center;
  padding: 12px 24px 18px;
  background: rgba(0, 0, 0, 0.88);
  border-top: 4px solid;
  border-image: linear-gradient(90deg, #f5338c, #8647ff, #00a7ec, #90d900, #ffcc00) 1;
}

.audio-player__osu-back {
  height: 48px;
  border: none;
  border-radius: 4px;
  background: linear-gradient(180deg, #ff4eb4, #df1683);
  color: #fff;
  font-size: 20px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.32);
}

.audio-player__osu-timeline {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.audio-player__osu-controls {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.audio-player__osu-play {
  transform: scale(1.18);
}

.audio-player__osu-volume {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  color: rgba(255, 255, 255, 0.72);
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

  .audio-player__osu {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .audio-player__osu-topline {
    grid-template-columns: 1fr;
    padding: 2px 18px 8px;
  }

  .audio-player__osu-title {
    white-space: normal;
    font-size: 22px;
  }

  .audio-player__osu-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .audio-player__osu-stats > div {
    text-align: left;
  }

  .audio-player__osu-stage {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 0 14px 8px;
    overflow: hidden;
  }

  .audio-player__osu-now {
    grid-template-rows: auto;
    gap: 12px;
  }

  .audio-player__osu-lyrics {
    display: none;
  }

  .audio-player__osu-list {
    min-height: 230px;
  }

  .audio-player__osu-track-list {
    padding: 24vh 6px 24vh 28px;
  }

  .audio-player__osu-track {
    width: 100%;
    min-height: 66px;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 10px;
    margin-right: 0;
    padding: 8px 12px 8px 48px;
  }

  .audio-player__osu-track:hover,
  .audio-player__osu-track--active {
    transform: none;
  }

  .audio-player__osu-track-index {
    width: 34px;
    height: 34px;
    font-size: 13px;
  }

  .audio-player__osu-track-main strong {
    font-size: 15px;
  }

  .audio-player__osu-bottom {
    grid-template-columns: 1fr;
    min-height: auto;
    gap: 12px;
    padding: 12px 16px 16px;
  }

  .audio-player__osu-back {
    height: 42px;
    font-size: 16px;
  }

  .audio-player__osu-controls {
    justify-content: center;
  }
}
</style>
