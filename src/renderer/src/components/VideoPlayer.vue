<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  CameraOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  CloseOutline,
  ExpandOutline,
  ListOutline,
  Pause,
  Play,
  PlayBackOutline,
  PlayForwardOutline,
  ReloadOutline,
  VolumeHighOutline,
  VolumeMuteOutline
} from '@vicons/ionicons5'
import { Settings } from '../../../common/constants'
import {
  setAudioPlayerPlaybackState,
  setAudioPlayerSession,
  setAudioPlayerVisible,
  useAudioPlayerStore
} from '../utils/audio-player-store'
import { useVideoPlaybackSession } from './video-player/composables/useVideoPlaybackSession'
import { useVideoPlaylistPresentation } from './video-player/composables/useVideoPlaylistPresentation'
import { useVideoPlaylistRuntime, type VideoTrack } from './video-player/composables/useVideoPlaylistRuntime'
import { useVideoSubtitleRuntime } from './video-player/composables/useVideoSubtitleRuntime'

const props = withDefaults(defineProps<{
  show: boolean
  playlist: VideoTrack[]
  initialPath?: string
  initialTime?: number
  resumeRestartThreshold?: number
  title?: string
}>(), {
  initialPath: '',
  initialTime: 0,
  resumeRestartThreshold: 95,
  title: ''
})

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'update:playlist', value: VideoTrack[]): void
  (event: 'progress-persisted', value: { resourceId: string; filePath: string; playbackTime: number }): void
}>()

const audioPlayerStore = useAudioPlayerStore()
const videoRef = ref<HTMLVideoElement | null>(null)
const shellRef = ref<HTMLDivElement | null>(null)
const sourceUrl = ref('')
const errorMessage = ref('')
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(80)
const isMuted = ref(false)
const isPlaying = ref(false)
const isLoading = ref(false)
const isFullscreen = ref(false)
const isCurrentSourceTranscoded = ref(false)
const playbackMode = ref<'direct' | 'remux-cache' | 'stream-transcode' | 'full-transcode-cache' | ''>('')
const playbackIsLossless = ref(true)
const playbackModeReason = ref('')
const currentTranscodeSessionId = ref('')
const playbackTimeOffset = ref(0)
const seekPreviewTime = ref<number | null>(null)
const showPlaylist = ref(true)
const showPlaybackRateMenu = ref(false)
const fullscreenControlsVisible = ref(true)
const playbackRate = ref(1)
const screenshotShortcut = ref(String(Settings.SHORTCUT_PRINT_SCREEN.default ?? 'f11'))
const captureToast = ref('')
const trackResumeTimes = ref<Record<string, number>>({})
const VIDEO_ERROR_DELAY_MS = 8000
const TRANSCODED_VIDEO_ERROR_DELAY_MS = 120000
const STREAM_TRANSCODE_EARLY_END_TOLERANCE_SECONDS = 3
const MAX_AUTOPLAY_ATTEMPTS = 12
const AUTOPLAY_RETRY_DELAY_MS = 300
let loadRequestId = 0
let pendingStartTime = 0
let pendingAutoplay = false
let pendingAutoplayAttempts = 0
let pendingAutoplayTimer: number | null = null
let userRequestedPause = false
let fullscreenControlsTimer: number | null = null
let captureToastTimer: number | null = null
let seekPreviewTimer: number | null = null
let playbackProgressTimer: number | null = null
let videoErrorTimer: number | null = null
let transcodedStartupTimer: number | null = null
let removeVideoFrameCaptureShortcutListener: (() => void) | null = null
let removeVideoTranscodeFailedListener: (() => void) | null = null
let lastVideoTranscodeFailure: {
  sessionId: string
  filePath: string
  message: string
  code?: number | null
  signal?: string | null
  stderr?: string
} | null = null

const logVideoPlayback = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  meta: Record<string, unknown> = {}
) => {
  window.api?.diagnostics?.logRenderer(level, `video playback: ${message}`, {
    requestId: loadRequestId,
    currentIndex: currentIndex.value,
    currentPath: String(currentTrack.value?.path ?? '').trim(),
    sourceUrl: sourceUrl.value,
    playbackMode: playbackMode.value,
    playbackModeReason: playbackModeReason.value,
    currentTranscodeSessionId: currentTranscodeSessionId.value,
    isLoading: isLoading.value,
    isPlaying: isPlaying.value,
    currentTime: currentTime.value,
    duration: duration.value,
    ...meta
  })
}

const getVideoElementDiagnostics = () => {
  const video = videoRef.value
  if (!video) {
    return {
      hasVideoElement: false
    }
  }

  return {
    hasVideoElement: true,
    currentSrc: video.currentSrc,
    readyState: video.readyState,
    networkState: video.networkState,
    paused: video.paused,
    ended: video.ended,
    seeking: video.seeking,
    muted: video.muted,
    playbackRate: video.playbackRate,
    localCurrentTime: Number(video.currentTime ?? 0),
    localDuration: Number(video.duration ?? 0),
    errorCode: Number(video.error?.code ?? 0) || null
  }
}

const resolveVideoTranscodeFailureMessage = (failure: typeof lastVideoTranscodeFailure) => {
  const message = String(failure?.message ?? '').trim().toLowerCase()
  const stderr = String(failure?.stderr ?? '').trim().toLowerCase()

  if (message.includes('input or ffmpeg executable is unavailable')) {
    return '视频文件不存在或无法读取'
  }

  if (message.includes('encoder is disabled or unavailable')) {
    return '当前设备没有可用的视频转码器'
  }

  if (message.includes('failed to start video transcode stream')) {
    return '视频转码启动失败'
  }

  if (
    stderr.includes('permission denied')
    || stderr.includes('no such file')
    || stderr.includes('system cannot find the file')
  ) {
    return '视频文件不存在或无法读取'
  }

  if (
    stderr.includes('invalid data found')
    || stderr.includes('could not find codec parameters')
    || stderr.includes('error while decoding')
    || stderr.includes('moov atom not found')
    || stderr.includes('malformed')
  ) {
    return '视频文件格式异常或已损坏'
  }

  if (message.includes('exited abnormally')) {
    return '视频转码中断'
  }

  return '视频转码失败'
}

const resolveVideoElementErrorMessage = (mediaErrorCode: number | null, transcoded: boolean) => {
  switch (mediaErrorCode) {
    case 1:
      return '视频加载已中断'
    case 2:
      return transcoded ? '转码视频数据加载中断' : '视频数据加载中断'
    case 3:
      return transcoded ? '播放器无法解码转码后的视频' : '播放器无法解码当前视频'
    case 4:
      return transcoded ? '转码后的视频格式仍不受支持' : '当前视频格式不兼容'
    default:
      return transcoded ? '转码视频加载失败' : '视频加载失败'
  }
}

const resetAudioPlayerStoreState = () => {
  setAudioPlayerPlaybackState({
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    coverSrc: ''
  })
  setAudioPlayerSession({
    resourceId: '',
    initialPath: '',
    initialTime: 0,
    playlist: []
  })
  setAudioPlayerVisible(false)
}

const stopActiveAudioPlaybackBeforeVideo = async () => {
  const audioResourceId = String(
    audioPlayerStore.resourceId.value
    || audioPlayerStore.currentTrack.value?.resourceId
    || ''
  ).trim()
  const hasAudioSession = Boolean(audioResourceId || audioPlayerStore.currentTrack.value?.path)

  if (!hasAudioSession) {
    return
  }

  const stopControl = audioPlayerStore.controls.value.stop
  if (stopControl) {
    await Promise.resolve(stopControl())
    return
  }

  if (audioResourceId) {
    try {
      await window.api.service.stopAsmrPlayback(audioResourceId)
    } catch {
      // ignore playback stop errors
    }
  }

  resetAudioPlayerStoreState()
}

const playbackRateOptions = [
  { label: '2x', value: 2 },
  { label: '1.75x', value: 1.75 },
  { label: '1.5x', value: 1.5 },
  { label: '1.25x', value: 1.25 },
  { label: '1x', value: 1 },
  { label: '0.75x', value: 0.75 },
  { label: '0.5x', value: 0.5 }
]

const getFileName = (filePath?: string) => String(filePath ?? '').replace(/\\/g, '/').split('/').pop() || '视频'
const {
  normalizedPlaylist,
  currentIndex,
  currentTrack,
  canPrevious,
  canNext,
  draggingTrackIndex,
  dragOverTrackIndex,
  dragOverPosition,
  syncOrderedPlaylist,
  consumeSuppressPlaylistReload,
  handleTrackDragStart,
  handleTrackDragOver,
  handleTrackDrop,
  handleTrackDragEnd
} = useVideoPlaylistRuntime({
  getInitialPath: () => String(props.initialPath ?? '').trim(),
  getFileName,
  onPlaylistReordered: (playlist) => emit('update:playlist', playlist)
})
const displayCurrentTime = computed(() => seekPreviewTime.value ?? currentTime.value)
const fallbackTitle = computed(() => String(props.title ?? ''))
const {
  displayTitle,
  getTrackFileName,
  getTrackCoverSrc
} = useVideoPlaylistPresentation({
  currentTrack,
  fallbackTitle,
  getFileName
})
const {
  subtitleLoadState,
  currentSubtitleText,
  loadSubtitleForTrack,
  chooseSubtitleForCurrentTrack
} = useVideoSubtitleRuntime({
  displayCurrentTime,
  getLoadRequestId: () => loadRequestId,
  getCurrentTrack: () => currentTrack.value
})
const shouldHideFullscreenControls = computed(() =>
  isFullscreen.value && !showPlaylist.value && !fullscreenControlsVisible.value
)
const {
  getPlaybackSessionResourceId,
  persistCurrentProgress,
  stopPlaybackSession,
  startCurrentPlaybackSession,
  finalizePlaybackSession
} = useVideoPlaybackSession({
  videoRef,
  currentTrack,
  currentTime,
  isCurrentSourceTranscoded,
  onProgressPersisted: (value) => {
    const normalizedPath = String(value.filePath ?? '').trim()
    if (normalizedPath) {
      trackResumeTimes.value = {
        ...trackResumeTimes.value,
        [normalizedPath]: Math.max(0, Number(value.playbackTime ?? 0))
      }
    }
    emit('progress-persisted', value)
  }
})

const clearPlaybackProgressTimer = () => {
  if (playbackProgressTimer) {
    window.clearInterval(playbackProgressTimer)
    playbackProgressTimer = null
  }
}

const clearVideoErrorTimer = () => {
  if (videoErrorTimer) {
    window.clearTimeout(videoErrorTimer)
    videoErrorTimer = null
  }
}

const clearTranscodedStartupTimer = () => {
  if (transcodedStartupTimer) {
    window.clearTimeout(transcodedStartupTimer)
    transcodedStartupTimer = null
  }
}

const clearPendingAutoplayTimer = () => {
  if (pendingAutoplayTimer) {
    window.clearTimeout(pendingAutoplayTimer)
    pendingAutoplayTimer = null
  }
}

const cancelPendingAutoplay = () => {
  pendingAutoplay = false
  pendingAutoplayAttempts = 0
  clearPendingAutoplayTimer()
}

const startTranscodedStartupTimer = (requestId: number, source: string) => {
  clearTranscodedStartupTimer()
  transcodedStartupTimer = window.setTimeout(() => {
    transcodedStartupTimer = null
    if (
      requestId !== loadRequestId ||
      sourceUrl.value !== source ||
      hasUsableVideoState() ||
      !isLoading.value
    ) {
      return
    }

    isLoading.value = false
    isPlaying.value = false
    errorMessage.value = '视频转码启动超时'
  }, TRANSCODED_VIDEO_ERROR_DELAY_MS)
}

const createTranscodeSessionId = (requestId: number) => {
  return [
    'video',
    Date.now(),
    requestId,
    Math.random().toString(36).slice(2, 10)
  ].join('-')
}

const hasUsableVideoState = () => {
  const video = videoRef.value
  if (!video) {
    return false
  }

  return video.readyState > HTMLMediaElement.HAVE_NOTHING
    || Number.isFinite(video.duration) && video.duration > 0
    || duration.value > 0
    || currentTime.value > playbackTimeOffset.value + 1
    || isPlaying.value
}

const startPlaybackProgressTimer = () => {
  clearPlaybackProgressTimer()
  playbackProgressTimer = window.setInterval(() => {
    if (!props.show || !isPlaying.value || isLoading.value) {
      return
    }

    void persistCurrentProgress()
  }, 5000)
}

const releaseVideoElementSource = () => {
  const video = videoRef.value
  if (!video) {
    return
  }

  video.pause()
  video.removeAttribute('src')
  try {
    video.load()
  } catch {
    // ignore media release failures
  }
}

const formatTime = (value?: number | null) => {
  const seconds = Math.max(0, Math.floor(Number(value ?? 0)))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainSeconds = seconds % 60
  const paddedMinutes = String(minutes).padStart(2, '0')
  const paddedSeconds = String(remainSeconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${minutes}:${paddedSeconds}`
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

const getCurrentAbsoluteTime = () => {
  const video = videoRef.value
  const localTime = Math.max(0, Number(video?.currentTime ?? currentTime.value ?? 0))
  return isCurrentSourceTranscoded.value ? Math.max(currentTime.value, playbackTimeOffset.value + localTime) : localTime
}

const rememberTrackProgress = (filePath: string, playbackTime = getCurrentAbsoluteTime()) => {
  const normalizedPath = String(filePath ?? '').trim()
  const normalizedTime = Math.max(0, Math.floor(Number(playbackTime ?? 0)))
  if (!normalizedPath || normalizedTime <= 0) {
    return
  }

  trackResumeTimes.value = {
    ...trackResumeTimes.value,
    [normalizedPath]: normalizedTime
  }
}

const resolveTrackStartTime = (filePath: string, explicitStartTime?: number) => {
  if (typeof explicitStartTime === 'number' && Number.isFinite(explicitStartTime)) {
    return Math.max(0, Number(explicitStartTime ?? 0))
  }

  return Math.max(0, Number(trackResumeTimes.value[String(filePath ?? '').trim()] ?? 0))
}

const syncTrack = async (index: number, autoplay = false, startTime?: number, fastSeek = false) => {
  const playlist = normalizedPlaylist.value
  if (!playlist.length) {
    return
  }

  const nextIndex = Math.max(0, Math.min(index, playlist.length - 1))
  const previousPath = String(currentTrack.value?.path ?? '').trim()
  const previousResourceId = getPlaybackSessionResourceId()
  const nextPath = String(playlist[nextIndex]?.path ?? '').trim()
  const nextResourceId = String(playlist[nextIndex]?.resourceId ?? '').trim()
  if (previousPath) {
    rememberTrackProgress(previousPath)
  }
  if (previousPath && (previousPath !== nextPath || previousResourceId !== nextResourceId)) {
    await persistCurrentProgress()
  }
  if (previousResourceId && previousResourceId !== nextResourceId) {
    await stopPlaybackSession(previousResourceId)
  }

  const requestId = ++loadRequestId
  clearPlaybackProgressTimer()
  clearVideoErrorTimer()
  clearTranscodedStartupTimer()
  clearPendingAutoplayTimer()
  releaseVideoElementSource()
  currentIndex.value = nextIndex
  sourceUrl.value = ''
  errorMessage.value = ''
  currentTime.value = 0
  seekPreviewTime.value = null
  duration.value = 0
  isLoading.value = true
  isPlaying.value = false
  isCurrentSourceTranscoded.value = false
  playbackMode.value = ''
  playbackIsLossless.value = true
  playbackModeReason.value = ''
  currentTranscodeSessionId.value = ''
  playbackTimeOffset.value = 0
  lastVideoTranscodeFailure = null
  pendingStartTime = resolveTrackStartTime(nextPath, startTime)
  pendingAutoplay = autoplay
  pendingAutoplayAttempts = 0
  userRequestedPause = false

  const requestedStartTime = resolveTrackStartTime(nextPath, startTime)
  const transcodeSessionId = createTranscodeSessionId(requestId)
  logVideoPlayback('info', 'sync-track-start', {
    nextIndex,
    nextPath,
    previousPath,
    requestedStartTime,
    autoplay,
    fastSeek,
    transcodeSessionId,
    ...getVideoElementDiagnostics()
  })
  let playbackUrl = await window.api.dialog.getVideoPlaybackUrl(nextPath, requestedStartTime, fastSeek, transcodeSessionId)
  if (requestId !== loadRequestId) {
    logVideoPlayback('warn', 'sync-track-stale-after-playback-url', {
      nextPath,
      transcodeSessionId
    })
    return
  }

  if (!playbackUrl?.url) {
    errorMessage.value = playbackUrl?.errorMessage || '视频文件不存在或无法读取'
    isLoading.value = false
    logVideoPlayback('warn', 'sync-track-empty-playback-url', {
      nextPath,
      requestedStartTime,
      transcodeSessionId,
      playbackUrl,
      ...getVideoElementDiagnostics()
    })
    await loadSubtitleForTrack(playlist[nextIndex], requestId)
    return
  }

  logVideoPlayback('info', 'sync-track-playback-url', {
    nextPath,
    requestedStartTime,
    transcodeSessionId,
    playbackUrl,
    ...getVideoElementDiagnostics()
  })

  const normalizedStartTime = normalizeResumeTime(
    requestedStartTime,
    Math.max(0, Number(playbackUrl.duration ?? 0))
  )
  if (playbackUrl.transcoded && normalizedStartTime !== requestedStartTime) {
    logVideoPlayback('info', 'sync-track-normalized-start-time-reload', {
      nextPath,
      requestedStartTime,
      normalizedStartTime,
      transcodeSessionId
    })
    playbackUrl = await window.api.dialog.getVideoPlaybackUrl(nextPath, normalizedStartTime, fastSeek, transcodeSessionId)
    if (requestId !== loadRequestId) {
      logVideoPlayback('warn', 'sync-track-stale-after-normalized-reload', {
        nextPath,
        normalizedStartTime,
        transcodeSessionId
      })
      return
    }
    if (!playbackUrl?.url) {
      errorMessage.value = playbackUrl?.errorMessage || '视频文件不存在或无法读取'
      isLoading.value = false
      logVideoPlayback('warn', 'sync-track-empty-playback-url-after-normalized-reload', {
        nextPath,
        normalizedStartTime,
        transcodeSessionId,
        playbackUrl,
        ...getVideoElementDiagnostics()
      })
      await loadSubtitleForTrack(playlist[nextIndex], requestId)
      return
    }
  }

  isCurrentSourceTranscoded.value = Boolean(playbackUrl.transcoded)
  playbackMode.value = playbackUrl.mode ?? ''
  playbackIsLossless.value = Boolean(playbackUrl.isLossless)
  playbackModeReason.value = String(playbackUrl.reason ?? '')
  currentTranscodeSessionId.value = playbackUrl.transcoded ? String(playbackUrl.sessionId || transcodeSessionId) : ''
  playbackTimeOffset.value = playbackUrl.transcoded ? normalizedStartTime : 0
  duration.value = Math.max(0, Number(playbackUrl.duration ?? 0))
  if (playbackUrl.transcoded) {
    currentTime.value = playbackTimeOffset.value
    pendingStartTime = 0
  } else {
    pendingStartTime = normalizedStartTime
  }
  const nextSourceUrl = playbackUrl.url
  await loadSubtitleForTrack(playlist[nextIndex], requestId)
  await nextTick()

  const video = videoRef.value
  if (!video) {
    isLoading.value = false
    logVideoPlayback('warn', 'sync-track-missing-video-element', {
      nextPath,
      nextSourceUrl,
      ...getVideoElementDiagnostics()
    })
    return
  }

  video.volume = Math.max(0, Math.min(1, volume.value / 100))
  video.muted = isMuted.value
  video.autoplay = pendingAutoplay
  video.playbackRate = playbackRate.value
  sourceUrl.value = nextSourceUrl
  if (playbackUrl.transcoded) {
    startTranscodedStartupTimer(requestId, nextSourceUrl)
  }
  await nextTick()
  logVideoPlayback('info', 'sync-track-video-load', {
    nextPath,
    nextSourceUrl,
    playbackUrl,
    ...getVideoElementDiagnostics()
  })
  video.load()
}

const playCurrentVideo = async (fromAutoplay = false) => {
  const video = videoRef.value
  if (!video) {
    return false
  }

  try {
    await video.play()
    const played = fromAutoplay ? !video.paused : true
    logVideoPlayback('info', 'play-attempt-resolved', {
      fromAutoplay,
      played,
      ...getVideoElementDiagnostics()
    })
    return played
  } catch (error) {
    logVideoPlayback('warn', 'play-attempt-rejected', {
      fromAutoplay,
      error: error instanceof Error
        ? {
            message: error.message,
            stack: error.stack ?? ''
          }
        : String(error ?? ''),
      ...getVideoElementDiagnostics()
    })
    return false
  }
}

const requestPendingAutoplay = () => {
  if (!pendingAutoplay || pendingAutoplayAttempts >= MAX_AUTOPLAY_ATTEMPTS) {
    return
  }

  clearPendingAutoplayTimer()
  const requestId = loadRequestId
  const requestedSourceUrl = sourceUrl.value
  pendingAutoplayAttempts += 1
  logVideoPlayback('debug', 'pending-autoplay-request', {
    requestedSourceUrl,
    pendingAutoplayAttempts,
    ...getVideoElementDiagnostics()
  })
  void playCurrentVideo(true).then((played) => {
    if (
      requestId !== loadRequestId ||
      requestedSourceUrl !== sourceUrl.value ||
      !pendingAutoplay ||
      pendingAutoplayAttempts >= MAX_AUTOPLAY_ATTEMPTS
    ) {
      return
    }

    if (played && !videoRef.value?.paused) {
      return
    }

    logVideoPlayback('debug', 'pending-autoplay-retry-scheduled', {
      requestedSourceUrl,
      pendingAutoplayAttempts,
      played,
      ...getVideoElementDiagnostics()
    })
    pendingAutoplayTimer = window.setTimeout(() => {
      pendingAutoplayTimer = null
      requestPendingAutoplay()
    }, AUTOPLAY_RETRY_DELAY_MS)
  })
}

const applyPendingStartTime = () => {
  const video = videoRef.value
  if (!video) {
    return
  }

  if (isCurrentSourceTranscoded.value) {
    currentTime.value = playbackTimeOffset.value
    pendingStartTime = 0
    return
  }

  const mediaDuration = Math.max(0, Number(video.duration ?? duration.value ?? 0))
  const nextStartTime = normalizeResumeTime(pendingStartTime, mediaDuration)

  if (nextStartTime > 0) {
    try {
      video.currentTime = nextStartTime
      currentTime.value = nextStartTime
    } catch {
      currentTime.value = 0
    }
  } else {
    currentTime.value = 0
  }

  pendingStartTime = 0
}

const initializePlayer = async () => {
  const playlist = normalizedPlaylist.value
  if (!playlist.length) {
    errorMessage.value = '当前没有可播放的视频'
    return
  }

  const normalizedInitialPath = String(props.initialPath ?? '').trim().replace(/\\/g, '/')
  const initialIndex = normalizedInitialPath
    ? playlist.findIndex((track) => track.path.replace(/\\/g, '/') === normalizedInitialPath)
    : 0
  await syncTrack(initialIndex >= 0 ? initialIndex : 0, true, Math.max(0, Number(props.initialTime ?? 0)))
}

const closePlayer = async () => {
  clearPlaybackProgressTimer()
  clearTranscodedStartupTimer()
  cancelPendingAutoplay()
  await finalizePlaybackSession()
  releaseVideoElementSource()
  emit('update:show', false)
}

const togglePlayback = async () => {
  const video = videoRef.value
  if (!video || !sourceUrl.value) {
    return
  }

  if (video.paused) {
    await video.play()
  } else {
    userRequestedPause = true
    cancelPendingAutoplay()
    video.pause()
  }
}

const seekTo = (value: number) => {
  const video = videoRef.value
  const absoluteDuration = duration.value || video?.duration || 0
  const nextTime = Math.max(0, Math.min(Number(value ?? 0), Math.max(absoluteDuration, 0)))
  seekPreviewTime.value = nextTime

  if (!video) {
    return
  }

  if (!isCurrentSourceTranscoded.value) {
    const localTargetTime = Math.max(0, nextTime - playbackTimeOffset.value)
    video.currentTime = localTargetTime
    currentTime.value = nextTime
    return
  }

  if (seekPreviewTimer) {
    window.clearTimeout(seekPreviewTimer)
  }

  seekPreviewTimer = window.setTimeout(() => {
    seekPreviewTimer = null
    void commitSeek(nextTime, true)
  }, 180)
}

const commitSeek = async (value: number, keepPreviewTime = false) => {
  const video = videoRef.value
  if (seekPreviewTimer) {
    window.clearTimeout(seekPreviewTimer)
    seekPreviewTimer = null
  }

  if (!video) {
    seekPreviewTime.value = null
    return
  }

  const absoluteDuration = duration.value || video.duration || 0
  const nextTime = Math.max(0, Math.min(Number(value ?? 0), absoluteDuration))
  seekPreviewTime.value = nextTime

  if (isCurrentSourceTranscoded.value) {
    const shouldAutoplay = isPlaying.value
    await syncTrack(currentIndex.value, shouldAutoplay, nextTime, true)
    await persistCurrentProgress()
    if (!keepPreviewTime) {
      seekPreviewTime.value = null
    }
    return
  }

  const localTargetTime = Math.max(0, nextTime - playbackTimeOffset.value)
  video.currentTime = localTargetTime
  currentTime.value = nextTime
  await persistCurrentProgress()
  if (!keepPreviewTime) {
    seekPreviewTime.value = null
  }
}

const seekBy = async (delta: number) => {
  await commitSeek(displayCurrentTime.value + delta)
}

const goPrevious = async () => {
  if (!canPrevious.value) {
    await commitSeek(0)
    return
  }
  await syncTrack(currentIndex.value - 1, true, 0)
}

const goNext = async () => {
  if (!canNext.value) {
    videoRef.value?.pause()
    return
  }
  await syncTrack(currentIndex.value + 1, true, 0)
}

const retryCurrentTrack = async () => {
  errorMessage.value = ''
  await syncTrack(currentIndex.value, true)
}

const handleVolumeChange = (value: number) => {
  volume.value = Math.max(0, Math.min(100, Number(value ?? 0)))
  const video = videoRef.value
  if (video) {
    video.volume = volume.value / 100
  }
  if (volume.value > 0 && isMuted.value) {
    isMuted.value = false
    if (video) {
      video.muted = false
    }
  }
}

const handlePlaybackRateChange = (value: number) => {
  const nextRate = Number(value ?? 1)
  playbackRate.value = playbackRateOptions.some((item) => item.value === nextRate) ? nextRate : 1
  if (videoRef.value) {
    videoRef.value.playbackRate = playbackRate.value
  }
  showPlaybackRateMenu.value = false
}

const togglePlaybackRateMenu = () => {
  showPlaybackRateMenu.value = !showPlaybackRateMenu.value
}

const toggleMute = () => {
  isMuted.value = !isMuted.value
  if (videoRef.value) {
    videoRef.value.muted = isMuted.value
  }
}

const toggleFullscreen = async () => {
  const shell = shellRef.value
  if (!shell) {
    return
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen()
  } else {
    await shell.requestFullscreen()
  }
}

const clearFullscreenControlsTimer = () => {
  if (fullscreenControlsTimer) {
    window.clearTimeout(fullscreenControlsTimer)
    fullscreenControlsTimer = null
  }
}

const shouldAutoHideFullscreenControls = () => isFullscreen.value && !showPlaylist.value

const scheduleFullscreenControlsHide = () => {
  clearFullscreenControlsTimer()
  fullscreenControlsVisible.value = true

  if (!shouldAutoHideFullscreenControls()) {
    return
  }

  fullscreenControlsTimer = window.setTimeout(() => {
    if (shouldAutoHideFullscreenControls()) {
      fullscreenControlsVisible.value = false
    }
  }, 5000)
}

const handlePlayerMouseMove = () => {
  if (!shouldAutoHideFullscreenControls()) {
    return
  }

  scheduleFullscreenControlsHide()
}

const togglePlaylist = () => {
  showPlaylist.value = !showPlaylist.value
  scheduleFullscreenControlsHide()
}

const showCaptureToast = (message: string) => {
  captureToast.value = message
  if (captureToastTimer) {
    window.clearTimeout(captureToastTimer)
  }
  captureToastTimer = window.setTimeout(() => {
    captureToast.value = ''
    captureToastTimer = null
  }, 2200)
}

const captureCurrentFrame = async () => {
  const video = videoRef.value
  const resourceId = String(currentTrack.value?.resourceId ?? '').trim()
  if (!video || !resourceId || !sourceUrl.value || video.videoWidth <= 0 || video.videoHeight <= 0) {
    showCaptureToast('当前帧不可截图')
    return
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      showCaptureToast('当前帧不可截图')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/png')
    const result = await window.api.dialog.saveVideoFrameScreenshot(resourceId, dataUrl, video.currentTime)
    showCaptureToast(result?.message ?? '截图已保存')
  } catch (error) {
    showCaptureToast(error instanceof Error ? error.message : '截图失败')
  }
}

const loadScreenshotShortcut = async () => {
  try {
    const setting = await window.api.db.getSetting(Settings.SHORTCUT_PRINT_SCREEN)
    screenshotShortcut.value = String(setting?.value ?? Settings.SHORTCUT_PRINT_SCREEN.default ?? 'f11').trim() || 'f11'
  } catch {
    screenshotShortcut.value = String(Settings.SHORTCUT_PRINT_SCREEN.default ?? 'f11')
  }
}

const normalizeShortcutKey = (value: string) => {
  const key = String(value ?? '').trim().toLowerCase()
  if (key === ' ') return 'space'
  if (key === 'esc') return 'escape'
  if (key === 'return') return 'enter'
  return key
}

const isShortcutMatched = (event: KeyboardEvent, shortcut: string) => {
  const parts = String(shortcut ?? '')
    .toLowerCase()
    .split(/[+\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (!parts.length) {
    return false
  }

  const wantsCtrl = parts.includes('ctrl') || parts.includes('control')
  const wantsShift = parts.includes('shift')
  const wantsAlt = parts.includes('alt') || parts.includes('option')
  const wantsMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command')
  const targetKey = parts.find((part) => !['ctrl', 'control', 'shift', 'alt', 'option', 'meta', 'cmd', 'command'].includes(part))
  if (!targetKey) {
    return false
  }

  return event.ctrlKey === wantsCtrl
    && event.shiftKey === wantsShift
    && event.altKey === wantsAlt
    && event.metaKey === wantsMeta
    && normalizeShortcutKey(event.key) === normalizeShortcutKey(targetKey)
}

const shouldIgnorePlayerShortcut = (event: KeyboardEvent) => {
  if (event.defaultPrevented) {
    return true
  }

  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return ['input', 'textarea', 'select', 'button'].includes(tagName)
}

const handleLoadedMetadata = () => {
  clearVideoErrorTimer()
  clearTranscodedStartupTimer()
  const video = videoRef.value
  const mediaDuration = Math.max(0, Number(video?.duration ?? 0))
  if (!(duration.value > 0)) {
    duration.value = isCurrentSourceTranscoded.value
      ? Math.max(playbackTimeOffset.value, mediaDuration + playbackTimeOffset.value)
      : mediaDuration
  }
  applyPendingStartTime()
  isLoading.value = false
  errorMessage.value = ''
  seekPreviewTime.value = null
  logVideoPlayback('info', 'event-loadedmetadata', {
    mediaDuration,
    localCurrentTime: Number(video?.currentTime ?? 0),
    ...getVideoElementDiagnostics()
  })

  requestPendingAutoplay()
}

const handleCanPlay = () => {
  clearVideoErrorTimer()
  clearTranscodedStartupTimer()
  logVideoPlayback('info', 'event-canplay', getVideoElementDiagnostics())
  requestPendingAutoplay()
}

const handleLoadedData = () => {
  logVideoPlayback('info', 'event-loadeddata', getVideoElementDiagnostics())
  requestPendingAutoplay()
}

const handlePlaying = () => {
  logVideoPlayback('info', 'event-playing', getVideoElementDiagnostics())
  cancelPendingAutoplay()
  handlePlay()
}

const handleLoadStart = () => {
  logVideoPlayback('info', 'event-loadstart', getVideoElementDiagnostics())
}

const handleDurationChange = () => {
  logVideoPlayback('debug', 'event-durationchange', getVideoElementDiagnostics())
}

const handleWaiting = () => {
  logVideoPlayback('warn', 'event-waiting', getVideoElementDiagnostics())
}

const handleStalled = () => {
  logVideoPlayback('warn', 'event-stalled', getVideoElementDiagnostics())
}

const handleSuspend = () => {
  logVideoPlayback('debug', 'event-suspend', getVideoElementDiagnostics())
}

const handleAbort = () => {
  logVideoPlayback('warn', 'event-abort', getVideoElementDiagnostics())
}

const handleEmptied = () => {
  logVideoPlayback('warn', 'event-emptied', getVideoElementDiagnostics())
}

const handleSeeking = () => {
  logVideoPlayback('debug', 'event-seeking', {
    absoluteTime: getCurrentAbsoluteTime(),
    ...getVideoElementDiagnostics()
  })
}

const handleTimeUpdate = () => {
  clearVideoErrorTimer()
  clearTranscodedStartupTimer()
  if (seekPreviewTime.value !== null) {
    return
  }

  const localTime = Math.max(0, Number(videoRef.value?.currentTime ?? 0))
  currentTime.value = isCurrentSourceTranscoded.value ? playbackTimeOffset.value + localTime : localTime
}

const handleSeeked = () => {
  if (isCurrentSourceTranscoded.value) {
    return
  }

  const localTime = Math.max(0, Number(videoRef.value?.currentTime ?? 0))
  currentTime.value = localTime
  seekPreviewTime.value = null
}

const handlePlay = () => {
  clearVideoErrorTimer()
  clearTranscodedStartupTimer()
  userRequestedPause = false
  isPlaying.value = true
  errorMessage.value = ''
  startPlaybackProgressTimer()
  logVideoPlayback('info', 'event-play')
  void startCurrentPlaybackSession()
}

const handlePause = () => {
  if (userRequestedPause) {
    userRequestedPause = false
    cancelPendingAutoplay()
  } else if (pendingAutoplay) {
    isPlaying.value = false
    clearPlaybackProgressTimer()
    return
  }
  isPlaying.value = false
  clearPlaybackProgressTimer()
  logVideoPlayback('info', 'event-pause', getVideoElementDiagnostics())
  if (!isLoading.value) {
    void persistCurrentProgress()
  }
}

const failCurrentTranscodePlayback = (nextErrorMessage?: string) => {
  const resolvedErrorMessage = String(nextErrorMessage ?? '').trim() || resolveVideoTranscodeFailureMessage(lastVideoTranscodeFailure)
  logVideoPlayback('error', 'transcode-playback-failed', {
    errorMessage: resolvedErrorMessage,
    ...getVideoElementDiagnostics()
  })
  currentTranscodeSessionId.value = ''
  isLoading.value = false
  isPlaying.value = false
  clearPlaybackProgressTimer()
  clearVideoErrorTimer()
  clearTranscodedStartupTimer()
  cancelPendingAutoplay()
  errorMessage.value = resolvedErrorMessage
}

const handleEnded = () => {
  clearPlaybackProgressTimer()
  logVideoPlayback('info', 'event-ended', {
    absoluteTime: getCurrentAbsoluteTime(),
    ...getVideoElementDiagnostics()
  })
  if (isCurrentSourceTranscoded.value && currentTranscodeSessionId.value) {
    const endedTime = getCurrentAbsoluteTime()
    const sourceDuration = Math.max(0, Number(duration.value ?? 0))
    if (!sourceDuration || endedTime + STREAM_TRANSCODE_EARLY_END_TOLERANCE_SECONDS < sourceDuration) {
      currentTime.value = endedTime
      failCurrentTranscodePlayback('视频转码中断')
      return
    }
  }

  const completedTime = Math.max(duration.value, currentTime.value, Number(videoRef.value?.duration ?? 0))
  currentTime.value = completedTime
  void persistCurrentProgress({ allowZero: true, playbackTime: completedTime }).then(() => {
    void goNext()
  })
}

const handleVideoError = () => {
  clearPlaybackProgressTimer()
  clearVideoErrorTimer()
  logVideoPlayback('warn', 'event-error', {
    mediaErrorCode: Number(videoRef.value?.error?.code ?? 0) || null,
    ...getVideoElementDiagnostics()
  })
  if (isCurrentSourceTranscoded.value && isLoading.value) {
    return
  }
  const requestId = loadRequestId
  const erroredVideo = videoRef.value
  const erroredSourceUrl = sourceUrl.value
  const errorDelay = isCurrentSourceTranscoded.value ? TRANSCODED_VIDEO_ERROR_DELAY_MS : VIDEO_ERROR_DELAY_MS
  videoErrorTimer = window.setTimeout(() => {
    videoErrorTimer = null
    const video = videoRef.value
    if (
      requestId !== loadRequestId ||
      video !== erroredVideo ||
      sourceUrl.value !== erroredSourceUrl ||
      hasUsableVideoState() ||
      !video?.error
    ) {
      return
    }

    isLoading.value = false
    isPlaying.value = false
    cancelPendingAutoplay()
    errorMessage.value = resolveVideoElementErrorMessage(
      Number(video?.error?.code ?? 0) || null,
      isCurrentSourceTranscoded.value
    )
    logVideoPlayback('error', 'event-error-finalized', {
      mediaErrorCode: Number(video?.error?.code ?? 0) || null,
      ...getVideoElementDiagnostics()
    })
  }, errorDelay)
}

const handleFullscreenChange = () => {
  isFullscreen.value = Boolean(document.fullscreenElement)
  scheduleFullscreenControlsHide()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.show) {
    return
  }

  if (shouldIgnorePlayerShortcut(event)) {
    return
  }

  if (isShortcutMatched(event, screenshotShortcut.value)) {
    event.preventDefault()
    void captureCurrentFrame()
  } else if (event.key === ' ') {
    event.preventDefault()
    void togglePlayback()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    seekBy(-10)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    seekBy(10)
  } else if (event.key === 'Escape') {
    void closePlayer()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void toggleFullscreen()
  }
}

const handleVideoFrameCaptureShortcut = () => {
  if (!props.show) {
    return
  }

  void captureCurrentFrame()
}

const handleVideoTranscodeFailed = (message: {
  sessionId: string
  filePath: string
  message: string
  code?: number | null
  signal?: string | null
  stderr?: string
}) => {
  const sessionId = String(message?.sessionId ?? '').trim()
  if (!props.show || !sessionId || sessionId !== currentTranscodeSessionId.value) {
    logVideoPlayback('warn', 'transcode-failed-ignored', {
      incomingSessionId: sessionId,
      message,
      ...getVideoElementDiagnostics()
    })
    return
  }

  lastVideoTranscodeFailure = message
  logVideoPlayback('error', 'transcode-failed-received', {
    incomingSessionId: sessionId,
    message,
    ...getVideoElementDiagnostics()
  })
  failCurrentTranscodePlayback(resolveVideoTranscodeFailureMessage(message))
}

watch(() => props.show, (visible) => {
  if (visible) {
    void (async () => {
      await stopActiveAudioPlaybackBeforeVideo()
      await loadScreenshotShortcut()
      await initializePlayer()
    })()
    window.addEventListener('keydown', handleKeydown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    removeVideoFrameCaptureShortcutListener?.()
    removeVideoFrameCaptureShortcutListener = window.api.service.onVideoFrameCaptureShortcut(handleVideoFrameCaptureShortcut)
    removeVideoTranscodeFailedListener?.()
    removeVideoTranscodeFailedListener = window.api.service.onVideoTranscodeFailed(handleVideoTranscodeFailed)
  } else {
    clearPlaybackProgressTimer()
    cancelPendingAutoplay()
    void finalizePlaybackSession()
    releaseVideoElementSource()
    clearFullscreenControlsTimer()
    clearVideoErrorTimer()
    clearTranscodedStartupTimer()
    currentTranscodeSessionId.value = ''
    window.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    removeVideoFrameCaptureShortcutListener?.()
    removeVideoFrameCaptureShortcutListener = null
    removeVideoTranscodeFailedListener?.()
    removeVideoTranscodeFailedListener = null
  }
})

watch(() => props.playlist, (playlist) => {
  syncOrderedPlaylist(playlist, props.initialPath)
  if (consumeSuppressPlaylistReload()) {
    return
  }
  if (props.show) {
    void initializePlayer()
  }
}, { deep: true, immediate: true })

onBeforeUnmount(() => {
  void finalizePlaybackSession()
  clearPlaybackProgressTimer()
  clearVideoErrorTimer()
  clearTranscodedStartupTimer()
  currentTranscodeSessionId.value = ''
  cancelPendingAutoplay()
  releaseVideoElementSource()
  clearFullscreenControlsTimer()
  removeVideoFrameCaptureShortcutListener?.()
  removeVideoFrameCaptureShortcutListener = null
  removeVideoTranscodeFailedListener?.()
  removeVideoTranscodeFailedListener = null
  if (seekPreviewTimer) {
    window.clearTimeout(seekPreviewTimer)
    seekPreviewTimer = null
  }
  if (captureToastTimer) {
    window.clearTimeout(captureToastTimer)
    captureToastTimer = null
  }
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})
</script>

<template>
  <n-modal
    :show="show"
    transform-origin="center"
    :mask-closable="false"
    class="video-player-modal"
    @update:show="(value: boolean) => !value && closePlayer()"
  >
    <div
      ref="shellRef"
      class="video-player"
      :class="{
        'video-player--controls-hidden': shouldHideFullscreenControls,
        'video-player--playlist-hidden': !showPlaylist
      }"
      @mousemove="handlePlayerMouseMove"
    >
      <div class="video-player__header">
        <div class="video-player__title">
          <span>{{ displayTitle }}</span>
          <span class="video-player__time">{{ formatTime(displayCurrentTime) }} / {{ formatTime(duration) }}</span>
        </div>
        <div class="video-player__header-actions">
          <n-button quaternary circle @click="closePlayer">
            <template #icon><n-icon :component="CloseOutline" /></template>
          </n-button>
        </div>
      </div>

      <div class="video-player__body" :class="{ 'video-player__body--playlist-hidden': !showPlaylist }">
        <div class="video-player__stage">
          <video
            ref="videoRef"
            class="video-player__video"
            :src="sourceUrl"
            @loadstart="handleLoadStart"
            @loadedmetadata="handleLoadedMetadata"
            @loadeddata="handleLoadedData"
            @durationchange="handleDurationChange"
            @canplay="handleCanPlay"
            @waiting="handleWaiting"
            @stalled="handleStalled"
            @suspend="handleSuspend"
            @abort="handleAbort"
            @emptied="handleEmptied"
            @seeking="handleSeeking"
            @playing="handlePlaying"
            @timeupdate="handleTimeUpdate"
            @seeked="handleSeeked"
            @play="handlePlay"
            @pause="handlePause"
            @ended="handleEnded"
            @error="handleVideoError"
          />
          <div v-if="isLoading" class="video-player__state">加载中</div>
          <div v-if="errorMessage" class="video-player__state video-player__state--error">
            <span>{{ errorMessage }}</span>
            <n-button size="small" type="error" ghost @click="retryCurrentTrack">
              <template #icon><n-icon :component="ReloadOutline" /></template>
              重试
            </n-button>
          </div>
          <div v-if="currentSubtitleText" class="video-player__subtitle">
            <span>{{ currentSubtitleText }}</span>
          </div>
          <div v-if="captureToast" class="video-player__toast">{{ captureToast }}</div>
          <div v-else-if="subtitleLoadState === 'loading'" class="video-player__subtitle video-player__subtitle--muted">
            正在读取字幕
          </div>
          <div v-else-if="subtitleLoadState === 'error'" class="video-player__subtitle video-player__subtitle--muted">
            字幕读取失败
          </div>
        </div>

        <aside v-if="showPlaylist" class="video-player__playlist">
          <div class="video-player__playlist-title">播放列表</div>
          <AppScrollbar class="video-player__playlist-scroll">
            <button
              v-for="(track, index) in normalizedPlaylist"
              :key="track.path"
              type="button"
              class="video-player__track"
              :class="{
                'video-player__track--active': index === currentIndex,
                'video-player__track--dragging': index === draggingTrackIndex,
                'video-player__track--drop-before': index === dragOverTrackIndex && dragOverPosition === 'before' && index !== draggingTrackIndex,
                'video-player__track--drop-after': index === dragOverTrackIndex && dragOverPosition === 'after' && index !== draggingTrackIndex
              }"
              draggable="true"
              @click="syncTrack(index, true)"
              @dragstart="handleTrackDragStart(index, $event)"
              @dragover="handleTrackDragOver(index, $event)"
              @drop="handleTrackDrop(index, $event)"
              @dragend="handleTrackDragEnd"
            >
              <img v-if="getTrackCoverSrc(track)" :src="getTrackCoverSrc(track)" alt="" class="video-player__track-cover" draggable="false" />
              <div v-else class="video-player__track-cover video-player__track-cover--empty">VIDEO</div>
              <div class="video-player__track-text">
                <div class="video-player__track-title">{{ track.label }}</div>
                <div class="video-player__track-path">{{ getTrackFileName(track) }}</div>
              </div>
            </button>
          </AppScrollbar>
        </aside>
      </div>

      <div class="video-player__footer">
        <n-slider
          :value="displayCurrentTime"
          :max="Math.max(duration, 1)"
          :step="0.1"
          :format-tooltip="(value: number) => formatTime(value)"
          @update:value="seekTo"
          @change="commitSeek"
        />
        <div class="video-player__controls">
          <div class="video-player__control-group">
            <n-button quaternary circle :disabled="!canPrevious" @click="goPrevious">
              <template #icon><n-icon :component="ChevronBackOutline" /></template>
            </n-button>
            <n-button quaternary circle @click="seekBy(-10)">
              <template #icon><n-icon :component="PlayBackOutline" /></template>
            </n-button>
            <n-button circle type="primary" class="video-player__play-button" @click="togglePlayback">
              <template #icon><n-icon :component="isPlaying ? Pause : Play" /></template>
            </n-button>
            <n-button quaternary circle @click="seekBy(10)">
              <template #icon><n-icon :component="PlayForwardOutline" /></template>
            </n-button>
            <n-button quaternary circle :disabled="!canNext" @click="goNext">
              <template #icon><n-icon :component="ChevronForwardOutline" /></template>
            </n-button>
          </div>
          <div class="video-player__right-controls">
            <div class="video-player__rate">
              <button
                type="button"
                class="video-player__rate-button"
                @click="togglePlaybackRateMenu"
              >
                <span>{{ playbackRate }}x</span>
                <span class="video-player__rate-caret">⌃</span>
              </button>
              <div v-if="showPlaybackRateMenu" class="video-player__rate-menu">
                <button
                  v-for="option in playbackRateOptions"
                  :key="option.value"
                  type="button"
                  class="video-player__rate-option"
                  :class="{ 'video-player__rate-option--active': option.value === playbackRate }"
                  @click="handlePlaybackRateChange(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <n-button quaternary circle @click="captureCurrentFrame">
              <template #icon><n-icon :component="CameraOutline" /></template>
            </n-button>
            <n-button quaternary @click="chooseSubtitleForCurrentTrack">字幕</n-button>
            <div class="video-player__volume">
              <n-button quaternary circle @click="toggleMute">
                <template #icon><n-icon :component="isMuted || volume <= 0 ? VolumeMuteOutline : VolumeHighOutline" /></template>
              </n-button>
              <n-slider :value="volume" :max="100" @update:value="handleVolumeChange" />
            </div>
            <n-button quaternary circle @click="toggleFullscreen">
              <template #icon><n-icon :component="ExpandOutline" /></template>
            </n-button>
            <n-button quaternary circle @click="togglePlaylist">
              <template #icon><n-icon :component="ListOutline" /></template>
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.video-player {
  width: min(88vw, 1440px);
  height: min(84vh, 900px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border-radius: 8px;
  background: rgb(24, 25, 28);
  color: #d8dde5;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
}

.video-player:fullscreen {
  width: 100vw;
  height: 100vh;
  border-radius: 0;
}

.video-player:fullscreen .video-player__header,
.video-player:fullscreen .video-player__footer {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 5;
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.video-player:fullscreen .video-player__header {
  top: 0;
}

.video-player:fullscreen .video-player__footer {
  bottom: 0;
}

.video-player:fullscreen .video-player__body {
  height: 100vh;
  grid-template-columns: minmax(0, 1fr) 300px;
}

.video-player:fullscreen.video-player--playlist-hidden .video-player__body {
  grid-template-columns: minmax(0, 1fr);
}

.video-player:fullscreen.video-player--controls-hidden {
  cursor: none;
}

.video-player:fullscreen.video-player--controls-hidden .video-player__header {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-100%);
}

.video-player:fullscreen.video-player--controls-hidden .video-player__footer {
  opacity: 0;
  pointer-events: none;
  transform: translateY(100%);
}

.video-player:fullscreen .video-player__stage {
  width: 100%;
  height: 100%;
}

.video-player:fullscreen .video-player__video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.video-player:fullscreen .video-player__playlist {
  z-index: 4;
  padding-top: 58px;
  padding-bottom: 96px;
}

.video-player__header,
.video-player__footer {
  background: rgba(18, 19, 22, 0.96);
  border-color: rgba(255, 255, 255, 0.08);
}

.video-player__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.video-player__title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
}

.video-player__title > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-player__time {
  flex: none;
  color: rgba(216, 221, 229, 0.62);
  font-size: 12px;
  font-weight: 400;
}

.video-player__header-actions,
.video-player__controls,
.video-player__control-group,
.video-player__right-controls,
.video-player__volume {
  display: flex;
  align-items: center;
  gap: 10px;
}

.video-player__body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  background: #0d0e10;
}

.video-player__body--playlist-hidden {
  grid-template-columns: minmax(0, 1fr);
}

.video-player__stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #050506;
}

.video-player__video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #050506;
}

.video-player__state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  color: rgba(216, 221, 229, 0.78);
  pointer-events: none;
}

.video-player__state--error {
  color: #f08a8a;
  pointer-events: auto;
}

.video-player__subtitle {
  position: absolute;
  left: 7%;
  right: 7%;
  bottom: 32px;
  display: flex;
  justify-content: center;
  pointer-events: none;
  text-align: center;
  white-space: pre-line;
}

.video-player__subtitle span,
.video-player__subtitle--muted {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.58);
  color: #f3f6fa;
  font-size: 18px;
  line-height: 1.45;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.video-player__subtitle--muted {
  color: rgba(216, 221, 229, 0.58);
  font-size: 13px;
}

.video-player__toast {
  position: absolute;
  left: 50%;
  top: 24px;
  transform: translateX(-50%);
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.62);
  color: #f3f6fa;
  font-size: 13px;
  pointer-events: none;
}

.video-player__playlist {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: rgb(24, 25, 28);
}

.video-player__playlist-title {
  padding: 14px 14px 8px;
  color: rgba(216, 221, 229, 0.72);
  font-size: 13px;
}

.video-player__playlist-scroll {
  min-height: 0;
}

.video-player__track {
  width: calc(100% - 20px);
  margin: 0 10px 10px;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition: background-color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
}

.video-player__track:hover,
.video-player__track--active {
  border-color: rgba(94, 234, 212, 0.45);
  background: rgba(94, 234, 212, 0.08);
}

.video-player__track--dragging {
  opacity: 0.48;
}

.video-player__track--drop-before::before,
.video-player__track--drop-after::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  height: 2px;
  border-radius: 999px;
  background: rgb(94, 234, 212);
  box-shadow: 0 0 0 1px rgba(94, 234, 212, 0.18);
}

.video-player__track--drop-before::before {
  top: -2px;
}

.video-player__track--drop-after::after {
  bottom: -2px;
}

.video-player__track-cover {
  width: 72px;
  height: 44px;
  object-fit: cover;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
}

.video-player__track-cover--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(216, 221, 229, 0.42);
  font-size: 10px;
}

.video-player__track-text {
  min-width: 0;
}

.video-player__track-title,
.video-player__track-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-player__track-title {
  font-size: 13px;
  font-weight: 600;
}

.video-player__track-path {
  margin-top: 4px;
  color: rgba(216, 221, 229, 0.5);
  font-size: 12px;
}

.video-player__footer {
  padding: 12px 18px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.video-player__controls {
  justify-content: space-between;
  margin-top: 10px;
}

.video-player__play-button {
  width: 42px;
  height: 42px;
}

.video-player__volume {
  width: 220px;
}

.video-player__rate {
  position: relative;
  width: 88px;
}

.video-player__rate-button {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid rgba(94, 234, 212, 0.62);
  border-radius: 4px;
  background: rgba(94, 234, 212, 0.06);
  color: #d8dde5;
  cursor: pointer;
}

.video-player__rate-caret {
  font-size: 12px;
  opacity: 0.65;
}

.video-player__rate-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  width: 100%;
  z-index: 8;
  display: grid;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: rgb(24, 25, 28);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
}

.video-player__rate-option {
  height: 30px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #d8dde5;
  text-align: left;
  padding: 0 8px;
  cursor: pointer;
}

.video-player__rate-option:hover,
.video-player__rate-option--active {
  background: rgba(94, 234, 212, 0.14);
}

.video-player__right-controls {
  justify-content: flex-end;
}

.video-player :deep(.n-button) {
  color: #d8dde5;
}

@media (max-width: 900px) {
  .video-player {
    width: 96vw;
    height: 88vh;
  }

  .video-player__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .video-player__playlist {
    display: none;
  }

  .video-player__volume {
    width: 150px;
  }

  .video-player__rate {
    width: 76px;
  }

  .video-player__right-controls {
    gap: 6px;
  }
}
</style>
