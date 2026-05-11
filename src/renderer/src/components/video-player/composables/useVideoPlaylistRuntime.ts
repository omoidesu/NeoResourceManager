import { computed, ref } from 'vue'

export type VideoTrack = {
  path: string
  label: string
  resourceId?: string
  resourceTitle?: string
  coverSrc?: string
  subtitlePath?: string
}

type DragPosition = 'before' | 'after'

type UseVideoPlaylistRuntimeOptions = {
  getInitialPath: () => string
  getFileName: (filePath?: string) => string
  onPlaylistReordered: (playlist: VideoTrack[]) => void
}

export const useVideoPlaylistRuntime = ({
  getInitialPath,
  getFileName,
  onPlaylistReordered
}: UseVideoPlaylistRuntimeOptions) => {
  const orderedPlaylist = ref<VideoTrack[]>([])
  const currentIndex = ref(0)
  const draggingTrackIndex = ref<number | null>(null)
  const dragOverTrackIndex = ref<number | null>(null)
  const dragOverPosition = ref<DragPosition | null>(null)
  let suppressPlaylistReload = false

  const normalizedPlaylist = computed(() =>
    orderedPlaylist.value
      .map((track) => {
        const path = String(track?.path ?? '').trim()
        return {
          ...track,
          path,
          label: String(track?.label ?? '').trim() || getFileName(path)
        }
      })
      .filter((track) => track.path)
  )
  const currentTrack = computed(() => normalizedPlaylist.value[currentIndex.value] ?? null)
  const canPrevious = computed(() => currentIndex.value > 0)
  const canNext = computed(() => currentIndex.value < normalizedPlaylist.value.length - 1)

  const syncOrderedPlaylist = (playlist: VideoTrack[], initialPath = getInitialPath()) => {
    const nextPlaylist = Array.isArray(playlist)
      ? playlist
        .map((track) => ({
          ...track,
          path: String(track?.path ?? '').trim(),
          label: String(track?.label ?? '').trim() || getFileName(track?.path)
        }))
        .filter((track) => track.path)
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
    if (fromIndex < 0 || targetIndex < 0 || fromIndex >= normalizedPlaylist.value.length || targetIndex >= normalizedPlaylist.value.length) {
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

    suppressPlaylistReload = true
    onPlaylistReordered(nextPlaylist.map((track) => ({ ...track })))
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
  }
}
