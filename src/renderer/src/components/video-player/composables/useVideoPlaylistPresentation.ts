import { computed, type Ref } from 'vue'
import type { VideoTrack } from './useVideoPlaylistRuntime'

type UseVideoPlaylistPresentationOptions = {
  currentTrack: Readonly<Ref<VideoTrack | null>>
  fallbackTitle: Readonly<Ref<string>>
  getFileName: (filePath?: string) => string
}

export const useVideoPlaylistPresentation = ({
  currentTrack,
  fallbackTitle,
  getFileName
}: UseVideoPlaylistPresentationOptions) => {
  const displayTitle = computed(() =>
    String(currentTrack.value?.resourceTitle ?? currentTrack.value?.label ?? fallbackTitle.value ?? '').trim() || '视频播放'
  )

  const getTrackFileName = (track: VideoTrack) => getFileName(track.path)

  const getTrackCoverSrc = (track: VideoTrack) => String(track?.coverSrc ?? '').trim()

  return {
    displayTitle,
    getTrackFileName,
    getTrackCoverSrc
  }
}
