import { computed, ref } from 'vue'

export type AudioPlaybackMode = 'order' | 'loop' | 'shuffle' | 'repeat-one'

export type SharedAudioTrack = {
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

type AudioPlayerControls = {
  playPause?: () => void | Promise<void>
  previous?: () => void | Promise<void>
  next?: () => void | Promise<void>
  stop?: () => void | Promise<void>
  reopen?: () => void | Promise<void>
  seek?: (value: number) => void | Promise<void>
  cyclePlaybackMode?: () => void | Promise<void>
}

const isVisible = ref(false)
const resourceId = ref('')
const initialPath = ref('')
const initialTime = ref(0)
const title = ref('音频播放器')
const artist = ref('')
const displayMode = ref<'default' | 'music'>('default')
const coverSrc = ref('')
const playlist = ref<SharedAudioTrack[]>([])
const currentTrack = ref<SharedAudioTrack | null>(null)
const currentTime = ref(0)
const duration = ref(0)
const isPlaying = ref(false)
const playbackMode = ref<AudioPlaybackMode>('order')
const controls = ref<AudioPlayerControls>({})

export const useAudioPlayerStore = () => ({
  isVisible,
  resourceId,
  initialPath,
  initialTime,
  title,
  artist,
  displayMode,
  coverSrc,
  playlist,
  currentTrack,
  currentTime,
  duration,
  isPlaying,
  playbackMode,
  hasActiveTrack: computed(() => Boolean(currentTrack.value?.path)),
  controls
})

export const setAudioPlayerSession = (payload: {
  resourceId?: string
  initialPath?: string
  initialTime?: number
  title?: string
  artist?: string
  displayMode?: 'default' | 'music'
  coverSrc?: string
  playlist?: SharedAudioTrack[]
}) => {
  if (typeof payload.resourceId === 'string') {
    resourceId.value = payload.resourceId
  }

  if (typeof payload.initialPath === 'string') {
    initialPath.value = payload.initialPath
  }

  if (typeof payload.initialTime === 'number') {
    initialTime.value = payload.initialTime
  }

  if (typeof payload.title === 'string') {
    title.value = payload.title
  }

  if (typeof payload.artist === 'string') {
    artist.value = payload.artist
  }

  if (payload.displayMode === 'default' || payload.displayMode === 'music') {
    displayMode.value = payload.displayMode
  }

  if (typeof payload.coverSrc === 'string') {
    coverSrc.value = payload.coverSrc
  }

  if (Array.isArray(payload.playlist)) {
    playlist.value = payload.playlist
  }
}

export const setAudioPlayerPlaybackState = (payload: {
  currentTrack?: SharedAudioTrack | null
  currentTime?: number
  duration?: number
  isPlaying?: boolean
  playbackMode?: AudioPlaybackMode
  coverSrc?: string
}) => {
  if ('currentTrack' in payload) {
    currentTrack.value = payload.currentTrack ?? null
  }

  if (typeof payload.currentTime === 'number') {
    currentTime.value = payload.currentTime
  }

  if (typeof payload.duration === 'number') {
    duration.value = payload.duration
  }

  if (typeof payload.isPlaying === 'boolean') {
    isPlaying.value = payload.isPlaying
  }

  if (payload.playbackMode === 'order' || payload.playbackMode === 'loop' || payload.playbackMode === 'shuffle' || payload.playbackMode === 'repeat-one') {
    playbackMode.value = payload.playbackMode
  }

  if (typeof payload.coverSrc === 'string') {
    coverSrc.value = payload.coverSrc
  }
}

export const setAudioPlayerVisible = (visible: boolean) => {
  isVisible.value = visible
}

export const registerAudioPlayerControls = (nextControls: AudioPlayerControls) => {
  controls.value = nextControls
}

export const clearAudioPlayerControls = () => {
  controls.value = {}
}
