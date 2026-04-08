import { computed, ref } from 'vue'

export type SharedAudioTrack = {
  path: string
  label: string
  duration?: number | null
}

type AudioPlayerControls = {
  playPause?: () => void | Promise<void>
  previous?: () => void | Promise<void>
  next?: () => void | Promise<void>
  stop?: () => void | Promise<void>
  reopen?: () => void | Promise<void>
  seek?: (value: number) => void | Promise<void>
}

const isVisible = ref(false)
const title = ref('音频播放器')
const coverSrc = ref('')
const playlist = ref<SharedAudioTrack[]>([])
const currentTrack = ref<SharedAudioTrack | null>(null)
const currentTime = ref(0)
const duration = ref(0)
const isPlaying = ref(false)
const controls = ref<AudioPlayerControls>({})

export const useAudioPlayerStore = () => ({
  isVisible,
  title,
  coverSrc,
  playlist,
  currentTrack,
  currentTime,
  duration,
  isPlaying,
  hasActiveTrack: computed(() => Boolean(currentTrack.value?.path)),
  controls
})

export const setAudioPlayerSession = (payload: {
  title?: string
  coverSrc?: string
  playlist?: SharedAudioTrack[]
}) => {
  if (typeof payload.title === 'string') {
    title.value = payload.title
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
