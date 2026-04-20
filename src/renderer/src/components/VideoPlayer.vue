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
  VolumeHighOutline,
  VolumeMuteOutline
} from '@vicons/ionicons5'
import { Settings } from '../../../common/constants'

type VideoTrack = {
  path: string
  label: string
  resourceId?: string
  resourceTitle?: string
  coverSrc?: string
  subtitlePath?: string
}

type SubtitleCue = {
  start: number
  end: number
  text: string
}

const props = withDefaults(defineProps<{
  show: boolean
  playlist: VideoTrack[]
  initialPath?: string
  initialTime?: number
  title?: string
}>(), {
  initialPath: '',
  initialTime: 0,
  title: ''
})

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const shellRef = ref<HTMLDivElement | null>(null)
const sourceUrl = ref('')
const errorMessage = ref('')
const subtitleCueList = ref<SubtitleCue[]>([])
const subtitleLoadState = ref<'idle' | 'loading' | 'ready' | 'empty'>('idle')
const currentIndex = ref(0)
const MAX_SUBTITLE_FILE_BYTES = 2 * 1024 * 1024
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(80)
const isMuted = ref(false)
const isPlaying = ref(false)
const isLoading = ref(false)
const isFullscreen = ref(false)
const showPlaylist = ref(true)
const showPlaybackRateMenu = ref(false)
const fullscreenControlsVisible = ref(true)
const playbackRate = ref(1)
const screenshotShortcut = ref(String(Settings.SHORTCUT_PRINT_SCREEN.default ?? 'f11'))
const captureToast = ref('')
const manualSubtitlePaths = ref<Record<string, string>>({})
let loadRequestId = 0
let pendingStartTime = 0
let pendingAutoplay = false
let fullscreenControlsTimer: number | null = null
let captureToastTimer: number | null = null
let playbackSessionResourceId = ''
let removeVideoFrameCaptureShortcutListener: (() => void) | null = null

const playbackRateOptions = [
  { label: '2x', value: 2 },
  { label: '1.75x', value: 1.75 },
  { label: '1.5x', value: 1.5 },
  { label: '1.25x', value: 1.25 },
  { label: '1x', value: 1 },
  { label: '0.75x', value: 0.75 },
  { label: '0.5x', value: 0.5 }
]

const normalizedPlaylist = computed(() =>
  props.playlist
    .map((track) => ({
      ...track,
      path: String(track.path ?? '').trim(),
      label: String(track.label ?? '').trim() || getFileName(track.path)
    }))
    .filter((track) => track.path)
)
const currentTrack = computed(() => normalizedPlaylist.value[currentIndex.value] ?? null)
const displayTitle = computed(() =>
  String(currentTrack.value?.resourceTitle ?? currentTrack.value?.label ?? props.title ?? '').trim() || '视频播放'
)
const currentSubtitleText = computed(() => {
  const time = currentTime.value
  const cue = subtitleCueList.value.find((item) => time >= item.start && time <= item.end)
  return cue?.text ?? ''
})
const canPrevious = computed(() => currentIndex.value > 0)
const canNext = computed(() => currentIndex.value < normalizedPlaylist.value.length - 1)
const shouldHideFullscreenControls = computed(() =>
  isFullscreen.value && !showPlaylist.value && !fullscreenControlsVisible.value
)

const getFileName = (filePath?: string) => String(filePath ?? '').replace(/\\/g, '/').split('/').pop() || '视频'

const formatTime = (value?: number | null) => {
  const seconds = Math.max(0, Math.floor(Number(value ?? 0)))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainSeconds = seconds % 60
  const paddedMinutes = String(minutes).padStart(2, '0')
  const paddedSeconds = String(remainSeconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${minutes}:${paddedSeconds}`
}

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
    ...['.srt', '.vtt', '.lrc'].map((extension) => [
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
    if (requestId !== loadRequestId) {
      return
    }
    if (!content) {
      continue
    }

    const cues = subtitlePath.toLowerCase().endsWith('.lrc') ? parseLrc(content) : parseSrtOrVtt(content)
    subtitleCueList.value = cues
    subtitleLoadState.value = cues.length ? 'ready' : 'empty'
    return
  }

  subtitleLoadState.value = 'empty'
}

const persistCurrentProgress = async () => {
  const track = currentTrack.value
  const resourceId = String(track?.resourceId ?? '').trim()
  const filePath = String(track?.path ?? '').trim()
  if (!resourceId || !filePath) {
    return
  }

  const playbackTime = Math.max(0, Math.floor(videoRef.value?.currentTime ?? currentTime.value ?? 0))
  await window.api.service.updateVideoPlaybackProgress(resourceId, filePath, playbackTime)
}

const stopPlaybackSession = async (resourceId = playbackSessionResourceId) => {
  const normalizedResourceId = String(resourceId ?? '').trim()
  if (!normalizedResourceId) {
    return
  }

  try {
    await window.api.service.stopVideoPlayback(normalizedResourceId)
  } catch {
    // ignore playback log errors
  }

  if (playbackSessionResourceId === normalizedResourceId) {
    playbackSessionResourceId = ''
  }
}

const startCurrentPlaybackSession = async () => {
  const resourceId = String(currentTrack.value?.resourceId ?? '').trim()
  if (!resourceId || playbackSessionResourceId === resourceId) {
    return
  }

  if (playbackSessionResourceId && playbackSessionResourceId !== resourceId) {
    await stopPlaybackSession(playbackSessionResourceId)
  }

  try {
    await window.api.service.startVideoPlayback(resourceId)
    playbackSessionResourceId = resourceId
  } catch {
    // ignore playback log errors
  }
}

const finalizePlaybackSession = async () => {
  await persistCurrentProgress()
  await stopPlaybackSession()
}

const syncTrack = async (index: number, autoplay = false, startTime = 0) => {
  const playlist = normalizedPlaylist.value
  if (!playlist.length) {
    return
  }

  const nextIndex = Math.max(0, Math.min(index, playlist.length - 1))
  const previousPath = String(currentTrack.value?.path ?? '').trim()
  const previousResourceId = playbackSessionResourceId
  const nextPath = String(playlist[nextIndex]?.path ?? '').trim()
  const nextResourceId = String(playlist[nextIndex]?.resourceId ?? '').trim()
  if (previousPath && previousPath !== nextPath) {
    await persistCurrentProgress()
  }
  if (previousResourceId && previousResourceId !== nextResourceId) {
    await stopPlaybackSession(previousResourceId)
  }

  const requestId = ++loadRequestId
  currentIndex.value = nextIndex
  sourceUrl.value = ''
  errorMessage.value = ''
  currentTime.value = 0
  duration.value = 0
  isLoading.value = true
  isPlaying.value = false
  pendingStartTime = Math.max(0, Number(startTime ?? 0))
  pendingAutoplay = autoplay

  const fileUrl = await window.api.dialog.getFileUrl(nextPath)
  if (requestId !== loadRequestId) {
    return
  }

  if (!fileUrl) {
    errorMessage.value = '视频文件不存在或无法读取'
    isLoading.value = false
    await loadSubtitleForTrack(playlist[nextIndex], requestId)
    return
  }

  sourceUrl.value = fileUrl
  await loadSubtitleForTrack(playlist[nextIndex], requestId)
  await nextTick()

  const video = videoRef.value
  if (!video) {
    isLoading.value = false
    return
  }

  video.volume = Math.max(0, Math.min(1, volume.value / 100))
  video.muted = isMuted.value
  video.playbackRate = playbackRate.value
  video.load()
}

const playCurrentVideo = async () => {
  const video = videoRef.value
  if (!video) {
    return
  }

  try {
    await video.play()
  } catch {
    // 浏览器可能会阻止自动播放，用户点播放即可继续。
  }
}

const applyPendingStartTime = () => {
  const video = videoRef.value
  if (!video) {
    return
  }

  const mediaDuration = Math.max(0, Number(video.duration ?? duration.value ?? 0))
  const nextStartTime = pendingStartTime > 0 && (!mediaDuration || pendingStartTime < mediaDuration - 1)
    ? pendingStartTime
    : 0

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
  await finalizePlaybackSession()
  videoRef.value?.pause()
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
    video.pause()
  }
}

const seekTo = (value: number) => {
  const video = videoRef.value
  if (!video) {
    return
  }

  const nextTime = Math.max(0, Math.min(Number(value ?? 0), duration.value || video.duration || 0))
  video.currentTime = nextTime
  currentTime.value = nextTime
}

const seekBy = (delta: number) => {
  seekTo((videoRef.value?.currentTime ?? currentTime.value) + delta)
}

const goPrevious = async () => {
  if (!canPrevious.value) {
    seekTo(0)
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

const handleChooseSubtitle = async () => {
  const trackPath = String(currentTrack.value?.path ?? '').trim()
  if (!trackPath) {
    return
  }

  const subtitlePath = await window.api.dialog.selectFile(['srt', 'vtt', 'lrc'])
  const normalizedSubtitlePath = String(subtitlePath ?? '').trim()
  if (!normalizedSubtitlePath) {
    return
  }

  manualSubtitlePaths.value = {
    ...manualSubtitlePaths.value,
    [trackPath]: normalizedSubtitlePath
  }
  await loadSubtitleForTrack(currentTrack.value, loadRequestId)
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

const handleLoadedMetadata = () => {
  const video = videoRef.value
  duration.value = Math.max(0, Number(video?.duration ?? 0))
  applyPendingStartTime()
  isLoading.value = false

  if (pendingAutoplay) {
    pendingAutoplay = false
    void playCurrentVideo()
  }
}

const handleTimeUpdate = () => {
  currentTime.value = Math.max(0, Number(videoRef.value?.currentTime ?? 0))
}

const handlePlay = () => {
  isPlaying.value = true
  void startCurrentPlaybackSession()
}

const handlePause = () => {
  isPlaying.value = false
}

const handleEnded = () => {
  void goNext()
}

const handleVideoError = () => {
  isLoading.value = false
  errorMessage.value = '视频加载失败'
}

const handleFullscreenChange = () => {
  isFullscreen.value = Boolean(document.fullscreenElement)
  scheduleFullscreenControlsHide()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.show) {
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

watch(() => props.show, (visible) => {
  if (visible) {
    void loadScreenshotShortcut()
    void initializePlayer()
    window.addEventListener('keydown', handleKeydown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    removeVideoFrameCaptureShortcutListener?.()
    removeVideoFrameCaptureShortcutListener = window.api.service.onVideoFrameCaptureShortcut(handleVideoFrameCaptureShortcut)
  } else {
    void finalizePlaybackSession()
    videoRef.value?.pause()
    clearFullscreenControlsTimer()
    window.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    removeVideoFrameCaptureShortcutListener?.()
    removeVideoFrameCaptureShortcutListener = null
  }
})

watch(() => props.playlist, () => {
  if (props.show) {
    void initializePlayer()
  }
})

onBeforeUnmount(() => {
  void finalizePlaybackSession()
  clearFullscreenControlsTimer()
  removeVideoFrameCaptureShortcutListener?.()
  removeVideoFrameCaptureShortcutListener = null
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
          <span class="video-player__time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
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
            @loadedmetadata="handleLoadedMetadata"
            @timeupdate="handleTimeUpdate"
            @play="handlePlay"
            @pause="handlePause"
            @ended="handleEnded"
            @error="handleVideoError"
          />
          <div v-if="isLoading" class="video-player__state">加载中</div>
          <div v-if="errorMessage" class="video-player__state video-player__state--error">{{ errorMessage }}</div>
          <div v-if="currentSubtitleText" class="video-player__subtitle">
            <span>{{ currentSubtitleText }}</span>
          </div>
          <div v-if="captureToast" class="video-player__toast">{{ captureToast }}</div>
          <div v-else-if="subtitleLoadState === 'loading'" class="video-player__subtitle video-player__subtitle--muted">
            正在读取字幕
          </div>
        </div>

        <aside v-if="showPlaylist" class="video-player__playlist">
          <div class="video-player__playlist-title">播放列表</div>
          <n-scrollbar class="video-player__playlist-scroll">
            <button
              v-for="(track, index) in normalizedPlaylist"
              :key="track.path"
              type="button"
              class="video-player__track"
              :class="{ 'video-player__track--active': index === currentIndex }"
              @click="syncTrack(index, true)"
            >
              <img v-if="track.coverSrc" :src="track.coverSrc" alt="" class="video-player__track-cover" draggable="false" />
              <div v-else class="video-player__track-cover video-player__track-cover--empty">VIDEO</div>
              <div class="video-player__track-text">
                <div class="video-player__track-title">{{ track.label }}</div>
                <div class="video-player__track-path">{{ getFileName(track.path) }}</div>
              </div>
            </button>
          </n-scrollbar>
        </aside>
      </div>

      <div class="video-player__footer">
        <n-slider
          :value="currentTime"
          :max="Math.max(duration, 1)"
          :step="0.1"
          :format-tooltip="(value: number) => formatTime(value)"
          @update:value="seekTo"
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
            <n-button quaternary @click="handleChooseSubtitle">字幕</n-button>
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
  color: rgba(216, 221, 229, 0.78);
  pointer-events: none;
}

.video-player__state--error {
  color: #f08a8a;
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
}

.video-player__track:hover,
.video-player__track--active {
  border-color: rgba(94, 234, 212, 0.45);
  background: rgba(94, 234, 212, 0.08);
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
