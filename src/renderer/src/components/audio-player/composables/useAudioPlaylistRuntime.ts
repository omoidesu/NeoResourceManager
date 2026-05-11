import { computed, ref } from 'vue'
import type { AudioPlaybackMode, SharedAudioTrack } from '../../../utils/audio-player-store'

type DragPosition = 'before' | 'after'
type ResolveNextDirection = 'previous' | 'next' | 'ended'

type UseAudioPlaylistRuntimeOptions = {
  getInitialPath: () => string
  onPlaylistReordered: (playlist: SharedAudioTrack[], initialPath: string) => void
}

export const useAudioPlaylistRuntime = ({
  getInitialPath,
  onPlaylistReordered
}: UseAudioPlaylistRuntimeOptions) => {
  const orderedPlaylist = ref<SharedAudioTrack[]>([])
  const currentIndex = ref(0)
  const playbackMode = ref<AudioPlaybackMode>('order')
  const draggingTrackIndex = ref<number | null>(null)
  const dragOverTrackIndex = ref<number | null>(null)
  const dragOverPosition = ref<DragPosition | null>(null)
  let suppressPlaylistReload = false

  const currentTrack = computed(() => orderedPlaylist.value[currentIndex.value] ?? null)

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

  const resolveNextTrackIndex = (direction: ResolveNextDirection) => {
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

  const syncOrderedPlaylist = (playlist: SharedAudioTrack[], initialPath = getInitialPath()) => {
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

    const normalizedInitialPath = String(initialPath ?? '').trim()
    const initialIndex = nextPlaylist.findIndex((track) => String(track?.path ?? '').trim() === normalizedInitialPath)
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

  const reorderPlaylist = (fromIndex: number, targetIndex: number, position: DragPosition) => {
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

    onPlaylistReordered(
      nextPlaylist,
      activeTrackPath || String(nextPlaylist[currentIndex.value]?.path ?? '')
    )
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

  const consumeSuppressPlaylistReload = () => {
    if (!suppressPlaylistReload) {
      return false
    }

    suppressPlaylistReload = false
    return true
  }

  return {
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
  }
}
