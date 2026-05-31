import type { Ref } from 'vue'
import type { VideoTrack } from './useVideoPlaylistRuntime'

type UseVideoPlaybackSessionOptions = {
  videoRef: Ref<HTMLVideoElement | null>
  currentTrack: Ref<VideoTrack | null>
  currentTime: Ref<number>
  isCurrentSourceTranscoded: Ref<boolean>
  onProgressPersisted: (value: { resourceId: string; filePath: string; playbackTime: number }) => void
}

type PersistProgressOptions = {
  allowZero?: boolean
  playbackTime?: number
}

export const useVideoPlaybackSession = ({
  videoRef,
  currentTrack,
  currentTime,
  isCurrentSourceTranscoded,
  onProgressPersisted
}: UseVideoPlaybackSessionOptions) => {
  let playbackSessionResourceId = ''
  let lastPersistedFilePath = ''
  let lastPersistedPlaybackTime = -1

  const getPlaybackSessionResourceId = () => playbackSessionResourceId

  const resolvePlaybackTime = (overrideTime?: number) => {
    if (typeof overrideTime === 'number' && Number.isFinite(overrideTime)) {
      return Math.max(0, Math.floor(overrideTime))
    }

    const video = videoRef.value
    const rawTime = isCurrentSourceTranscoded.value
      ? currentTime.value
      : (video?.currentTime ?? currentTime.value ?? 0)
    return Math.max(0, Math.floor(Number(rawTime ?? 0)))
  }

  const persistCurrentProgress = async (options: PersistProgressOptions = {}) => {
    const track = currentTrack.value
    const resourceId = String(track?.resourceId ?? '').trim()
    const filePath = String(track?.path ?? '').trim()
    if (!resourceId || !filePath) {
      return
    }

    const playbackTime = resolvePlaybackTime(options.playbackTime)
    if (playbackTime <= 0 && !options.allowZero) {
      return
    }

    if (filePath === lastPersistedFilePath && playbackTime === lastPersistedPlaybackTime) {
      return
    }

    await window.api.service.updateVideoPlaybackProgress(resourceId, filePath, playbackTime)
    lastPersistedFilePath = filePath
    lastPersistedPlaybackTime = playbackTime
    onProgressPersisted({
      resourceId,
      filePath,
      playbackTime
    })
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

  return {
    getPlaybackSessionResourceId,
    persistCurrentProgress,
    stopPlaybackSession,
    startCurrentPlaybackSession,
    finalizePlaybackSession
  }
}
