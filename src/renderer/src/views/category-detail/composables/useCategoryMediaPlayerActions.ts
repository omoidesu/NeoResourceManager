import type {ComputedRef, Ref} from 'vue'

type NotifyType = 'success' | 'error' | 'info' | 'warning'

interface UseCategoryMediaPlayerActionsOptions {
  categoryName: ComputedRef<string>
  selectedDetailResource: Ref<any>
  detailAudioPlaylist: Ref<any[]>
  detailAudioVideoPlaylist: Ref<any[]>
  videoPlayerPlaylist: Ref<any[]>
  videoPlayerInitialPath: Ref<string>
  videoPlayerInitialTime: Ref<number>
  videoPlayerTitle: Ref<string>
  showVideoPlayer: Ref<boolean>
  detailIsAsmr: ComputedRef<boolean>
  detailIsAudio: ComputedRef<boolean>
  detailIsVideo: ComputedRef<boolean>
  isVideoFolderCategory: ComputedRef<boolean>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  getResourceFilePath: (resource: any) => string
  getAudioDirectoryPath: (path: string) => string
  normalizeAudioPath: (path: string) => string
  applyAudioPlayerSession: (resource: any, playlist: any[], targetPath: string, initialTime?: number) => Promise<void>
  loadPlaybackResumeRestartThresholds: () => Promise<void>
  loadAllCategoryResources: () => Promise<any[]>
  buildMusicPlaylistTrack: (resource: any) => any
  buildVideoPlaylistTrack: (resource: any) => Promise<any>
  resolveResourceAudioTree: (resource: any) => Promise<any[]>
  collectAudioTreeTracks: (tree: any[]) => any[]
  collectAudioTreeVideoTracks: (tree: any[], resource: any) => any[]
  sortVideoTracksBySubItems: (tracks: any[], resource: any) => any[]
  refreshVideoSubCoverPreviewUrls: (resource: any) => Promise<void>
}

export const useCategoryMediaPlayerActions = (options: UseCategoryMediaPlayerActionsOptions) => {
  const openAudioPlayer = async (targetPath: string) => {
    const normalizedPath = String(targetPath ?? '').trim()
    if (!normalizedPath) {
      return
    }

    const allTracks = options.detailAudioPlaylist.value
    if (!allTracks.length) {
      options.showNotifyByType('warning', '播放音频', '当前没有可播放的音频文件')
      return
    }

    const targetDirectory = options.getAudioDirectoryPath(normalizedPath)
    const directoryTracks = allTracks.filter((track) => options.getAudioDirectoryPath(track.path) === targetDirectory)
    const playlist = directoryTracks.length ? directoryTracks : allTracks

    await options.applyAudioPlayerSession(options.selectedDetailResource.value, playlist, normalizedPath, 0)
  }

  const openAudioTreeVideoPlayer = async (targetPath: string) => {
    const normalizedPath = String(targetPath ?? '').trim()
    if (!normalizedPath) {
      return
    }

    const allTracks = options.detailAudioVideoPlaylist.value
    if (!allTracks.length) {
      options.showNotifyByType('warning', '播放视频', '当前没有可播放的视频文件')
      return
    }

    const targetDirectory = options.getAudioDirectoryPath(normalizedPath)
    const directoryTracks = allTracks.filter((track) => options.getAudioDirectoryPath(track.path) === targetDirectory)
    const playlist = directoryTracks.length ? directoryTracks : allTracks
    const normalizedTargetPath = normalizedPath.replace(/\\/g, '/')
    const matchedTrack = playlist.find((track) => track.path.replace(/\\/g, '/') === normalizedTargetPath)
    await options.loadPlaybackResumeRestartThresholds()

    options.videoPlayerPlaylist.value = playlist
    options.videoPlayerInitialPath.value = matchedTrack?.path ?? normalizedPath
    const lastPlayFile = String(options.selectedDetailResource.value?.videoMeta?.lastPlayFile ?? '').trim().replace(/\\/g, '/')
    const normalizedMatchedPath = String(matchedTrack?.path ?? normalizedPath).replace(/\\/g, '/')
    options.videoPlayerInitialTime.value = lastPlayFile && lastPlayFile === normalizedMatchedPath
      ? Math.max(0, Number(options.selectedDetailResource.value?.videoMeta?.lastPlayTime ?? 0))
      : 0
    options.videoPlayerTitle.value = String(options.selectedDetailResource.value?.title ?? options.categoryName.value ?? '视频播放')
    options.showVideoPlayer.value = true
  }

  const handleAudioTreePlay = (option: any) => {
    if (!option?.path) {
      return
    }

    if (option?.kind === 'video') {
      void openAudioTreeVideoPlayer(String(option.path))
      return
    }

    void openAudioPlayer(String(option.path))
  }

  const openAsmrPlaybackFromLaunch = async (resource: any) => {
    try {
      const audioTree = await options.resolveResourceAudioTree(resource)
      const allTracks = options.collectAudioTreeTracks(audioTree)
      if (!allTracks.length) {
        options.showNotifyByType('warning', '播放音频', '当前没有可播放的音频文件')
        return
      }

      const lastPlayFile = String(resource?.asmrMeta?.lastPlayFile ?? '').trim()
      const lastPlayTime = Math.max(0, Number(resource?.asmrMeta?.lastPlayTime ?? 0))
      const normalizedLastPlayFile = options.normalizeAudioPath(lastPlayFile)
      const resumeTrack = normalizedLastPlayFile
        ? allTracks.find((track) => options.normalizeAudioPath(track.path) === normalizedLastPlayFile)
        : null

      if (!resumeTrack) {
        await options.applyAudioPlayerSession(resource, allTracks, String(allTracks[0]?.path ?? ''), 0)
        return
      }

      const resumeDirectory = options.getAudioDirectoryPath(resumeTrack.path)
      const directoryTracks = allTracks.filter((track) => options.getAudioDirectoryPath(track.path) === resumeDirectory)
      const playlist = directoryTracks.length ? directoryTracks : allTracks
      await options.applyAudioPlayerSession(resource, playlist, resumeTrack.path, lastPlayTime)
    } catch {
      options.showNotifyByType('error', '播放音频', '读取音声目录失败')
    }
  }

  const openAudioPlaybackFromLaunch = async (resource: any) => {
    const targetPath = options.getResourceFilePath(resource)
    if (!targetPath) {
      options.showNotifyByType('warning', '播放音频', '当前音乐路径无效')
      return
    }

    const allResources = await options.loadAllCategoryResources()
    const playlist = allResources
      .map((item: any) => options.buildMusicPlaylistTrack(item))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
    const normalizedTargetPath = options.normalizeAudioPath(targetPath)
    const matchedTrack = playlist.find((item) => options.normalizeAudioPath(item.path) === normalizedTargetPath)

    if (!playlist.length || !matchedTrack) {
      options.showNotifyByType('warning', '播放音频', '当前没有可播放的音乐资源')
      return
    }

    await options.applyAudioPlayerSession(
      resource,
      playlist,
      matchedTrack.path,
      Math.max(0, Number(resource?.audioMeta?.lastPlayTime ?? 0))
    )
  }

  const openVideoPlaybackFromLaunch = async (resource: any) => {
    await options.loadPlaybackResumeRestartThresholds()
    if (options.isVideoFolderCategory.value) {
      let playbackResource = resource
      const resourceId = String(resource?.id ?? '').trim()
      if (resourceId) {
        try {
          const detailResult = await window.api.service.getResourceDetail(resourceId)
          if (detailResult?.type === 'success' && detailResult?.data) {
            playbackResource = detailResult.data
          }
        } catch {
          // ignore detail fetch errors and fall back to current resource
        }
      }

      await options.refreshVideoSubCoverPreviewUrls(playbackResource)
      const audioTree = await options.resolveResourceAudioTree(playbackResource)
      const playlist = options.sortVideoTracksBySubItems(
        options.collectAudioTreeVideoTracks(audioTree, playbackResource),
        playbackResource
      )
      if (!playlist.length) {
        options.showNotifyByType('warning', '播放视频', '当前没有可播放的视频文件')
        return
      }

      const lastPlayFile = String(playbackResource?.videoMeta?.lastPlayFile ?? '').trim()
      const normalizedLastPlayFile = lastPlayFile.replace(/\\/g, '/')
      const resumeTrack = normalizedLastPlayFile
        ? playlist.find((item) => item.path.replace(/\\/g, '/') === normalizedLastPlayFile)
        : null

      options.videoPlayerPlaylist.value = playlist
      options.videoPlayerInitialPath.value = resumeTrack?.path ?? String(playlist[0]?.path ?? '')
      options.videoPlayerInitialTime.value = resumeTrack ? Math.max(0, Number(playbackResource?.videoMeta?.lastPlayTime ?? 0)) : 0
      options.videoPlayerTitle.value = String(playbackResource?.title ?? options.categoryName.value ?? '视频播放')
      options.showVideoPlayer.value = true
      return
    }

    const targetPath = options.getResourceFilePath(resource)
    if (!targetPath) {
      options.showNotifyByType('warning', '播放视频', '当前视频路径无效')
      return
    }

    const allResources = await options.loadAllCategoryResources()
    const playlist = (await Promise.all(allResources.map((item: any) => options.buildVideoPlaylistTrack(item))))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
    const normalizedTargetPath = targetPath.replace(/\\/g, '/')
    const matchedTrack = playlist.find((item) => item.path.replace(/\\/g, '/') === normalizedTargetPath)

    if (!playlist.length || !matchedTrack) {
      options.showNotifyByType('warning', '播放视频', '当前没有可播放的视频资源')
      return
    }

    const lastPlayFile = String(resource?.videoMeta?.lastPlayFile ?? '').trim()
    const normalizedLastPlayFile = lastPlayFile.replace(/\\/g, '/')
    const resumeTrack = normalizedLastPlayFile
      ? playlist.find((item) => item.path.replace(/\\/g, '/') === normalizedLastPlayFile)
      : null

    options.videoPlayerPlaylist.value = playlist
    options.videoPlayerInitialPath.value = resumeTrack?.path ?? matchedTrack.path
    options.videoPlayerInitialTime.value = resumeTrack ? Math.max(0, Number(resource?.videoMeta?.lastPlayTime ?? 0)) : 0
    options.videoPlayerTitle.value = String(resource?.title ?? options.categoryName.value ?? '视频播放')
    options.showVideoPlayer.value = true
  }

  return {
    openAudioPlayer,
    openAudioTreeVideoPlayer,
    handleAudioTreePlay,
    openAsmrPlaybackFromLaunch,
    openAudioPlaybackFromLaunch,
    openVideoPlaybackFromLaunch
  }
}
