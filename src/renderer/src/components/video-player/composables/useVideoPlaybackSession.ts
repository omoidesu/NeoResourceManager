import type { Ref } from 'vue'
import type { VideoTrack } from './useVideoPlaylistRuntime'

type UseVideoPlaybackSessionOptions = {
  videoRef: Ref<HTMLVideoElement | null>
  currentTrack: Ref<VideoTrack | null>
  currentTime: Ref<number>
  isCurrentSourceTranscoded: Ref<boolean>
  onProgressPersisted: (value: { resourceId: string; filePath: string; playbackTime: number }) => void
}

export const useVideoPlaybackSession = ({
  videoRef,
  currentTrack,
  currentTime,
  isCurrentSourceTranscoded,
  onProgressPersisted
}: UseVideoPlaybackSessionOptions) => {
  let playbackSessionResourceId = ''

  const getPlaybackSessionResourceId = () => playbackSessionResourceId

  const persistCurrentProgress = async () => {
    const track = currentTrack.value
    const resourceId = String(track?.resourceId ?? '').trim()
    const filePath = String(track?.path ?? '').trim()
    if (!resourceId || !filePath) {
      return
    }

    const playbackTime = Math.max(
      0,
      Math.floor(isCurrentSourceTranscoded.value ? currentTime.value : (videoRef.value?.currentTime ?? currentTime.value ?? 0))
    )
    await window.api.service.updateVideoPlaybackProgress(resourceId, filePath, playbackTime)
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
