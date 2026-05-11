import { ref, type ComputedRef, type Ref } from 'vue'

type UseAudioPlaybackSessionOptions = {
  audioRef: Ref<HTMLAudioElement | null>
  currentTime: Ref<number>
  currentResourceId: ComputedRef<string>
  getCurrentTrackPath: () => string
}

export const useAudioPlaybackSession = ({
  audioRef,
  currentTime,
  currentResourceId,
  getCurrentTrackPath
}: UseAudioPlaybackSessionOptions) => {
  const playbackSessionActive = ref(false)
  let playbackSessionResourceId = ''
  let playbackSessionTrackPath = ''

  const getPlaybackSessionResourceId = () => playbackSessionResourceId
  const getPlaybackSessionTrackPath = () => playbackSessionTrackPath
  const hasPlaybackSessionSnapshot = () =>
    Boolean(playbackSessionActive.value || playbackSessionResourceId || playbackSessionTrackPath)
  const firstNonEmpty = (...values: unknown[]) => {
    for (const value of values) {
      const normalizedValue = String(value ?? '').trim()
      if (normalizedValue) {
        return normalizedValue
      }
    }

    return ''
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
      // keep audio teardown resilient; progress is best-effort
    }
  }

  const startPlaybackSession = async (resourceId: string, filePath: string) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    const normalizedFilePath = String(filePath ?? '').trim()
    if (playbackSessionActive.value || !normalizedResourceId) {
      return
    }

    try {
      await window.api.service.startAsmrPlayback(normalizedResourceId)
      playbackSessionActive.value = true
      playbackSessionResourceId = normalizedResourceId
      playbackSessionTrackPath = normalizedFilePath
    } catch {
      // ignore playback log errors
    }
  }

  const finalizePlaybackSession = async (
    resourceIdOverride?: string,
    filePathOverride?: string,
    playbackTimeOverride?: number
  ) => {
    const resourceId = firstNonEmpty(resourceIdOverride, playbackSessionResourceId, currentResourceId.value)
    const filePath = firstNonEmpty(filePathOverride, playbackSessionTrackPath, getCurrentTrackPath())
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

  return {
    playbackSessionActive,
    getPlaybackSessionResourceId,
    getPlaybackSessionTrackPath,
    hasPlaybackSessionSnapshot,
    startPlaybackSession,
    finalizePlaybackSession
  }
}
