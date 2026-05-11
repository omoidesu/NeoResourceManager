import type { ComputedRef, Ref } from 'vue'
import { setAudioPlayerSession, setAudioPlayerVisible } from '../../../utils/audio-player-store'

type NotifyType = 'success' | 'error' | 'info' | 'warning'

type CategoryProfileLike = {
  flags: {
    isSingleImage?: boolean
    isManga?: boolean
    isAsmr?: boolean
    isAudio?: boolean
    isVideo?: boolean
    isVideoFolder?: boolean
    isNovel?: boolean
  }
}

export const useDashboardReaderPlayerBridge = (options: {
  homeDetailResource: Ref<any | null>
  homeDetailCategoryProfile: ComputedRef<CategoryProfileLike>
  homeDetailScreenshotPaths: Ref<string[]>
  homeDetailGalleryItems: ComputedRef<any[]>
  homeDetailCurrentScreenshotIndex: Ref<number>
  homeDetailAudioTree: Ref<any[]>
  homePictureViewerImagePaths: Ref<string[]>
  homePictureViewerInitialIndex: Ref<number>
  homePictureViewerResourceIds: Ref<string[]>
  homeCurrentPictureViewerResourceId: Ref<string>
  showHomePictureViewer: Ref<boolean>
  homeComicReaderImagePaths: Ref<string[]>
  homeComicReaderInitialIndex: Ref<number>
  homeCurrentComicReaderResourceId: Ref<string>
  showHomeComicReader: Ref<boolean>
  homeTextReaderFilePath: Ref<string>
  homeTextReaderTitle: Ref<string>
  homeTextReaderInitialProgress: Ref<number>
  homeCurrentTextReaderResourceId: Ref<string>
  showHomeTextReader: Ref<boolean>
  homePdfReaderFilePath: Ref<string>
  homePdfReaderTitle: Ref<string>
  homePdfReaderInitialProgress: Ref<number>
  homeCurrentPdfReaderResourceId: Ref<string>
  showHomePdfReader: Ref<boolean>
  homeEpubReaderFilePath: Ref<string>
  homeEpubReaderTitle: Ref<string>
  homeEpubReaderInitialProgress: Ref<number>
  homeCurrentEpubReaderResourceId: Ref<string>
  showHomeEpubReader: Ref<boolean>
  homeEbookReaderFilePath: Ref<string>
  homeEbookReaderTitle: Ref<string>
  homeEbookReaderInitialProgress: Ref<number>
  homeCurrentEbookReaderResourceId: Ref<string>
  showHomeEbookReader: Ref<boolean>
  homeVideoPlayerPlaylist: Ref<any[]>
  homeVideoPlayerInitialPath: Ref<string>
  homeVideoPlayerInitialTime: Ref<number>
  homeVideoPlayerTitle: Ref<string>
  showHomeVideoPlayer: Ref<boolean>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  getResourceFilePath: (resource: any) => string
  getHomeResourceTitle: (resource: any, fallback?: string) => string
  getFileExtension: (filePath: string) => string
  getFileNameWithoutExtension: (filePath: string) => string
  normalizePathValue: (filePath: string) => string
  normalizeAudioPath: (filePath: string) => string
  getHomeDetailVideoSubItems: (resource: any) => any[]
  isHomeVideoFolderResource: (resource: any) => boolean
  resolveHomeResourceAudioTree: (resource: any) => Promise<any[]>
  collectAudioTreeTracks: (tree: any[]) => any[]
  collectVideoTreeTracks: (tree: any[], resource: any) => any[]
  collectAudioTreeImagePaths: (tree: any[]) => string[]
  sortHomeVideoTracksBySubItems: <T extends { path: string; label?: string }>(tracks: T[], resource: any) => T[]
  resolveAudioPlayerCoverPreviewUrl: (coverPath: string) => Promise<string>
  resolveVideoPlayerCoverPreviewUrl: (coverPath: string) => Promise<string>
}) => {
  const readComicProgress = async (resourceId: string) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return 0
    }

    try {
      const result = await window.api.service.getMultiImageReadingProgress(normalizedResourceId)
      return Math.max(0, Math.floor(Number(result?.data?.lastReadPage ?? 0)))
    } catch {
      return 0
    }
  }

  const readNovelProgress = async (resourceId: string) => {
    try {
      const result = await window.api.service.getNovelReadingProgress(String(resourceId ?? '').trim())
      return Math.max(0, Math.min(1, Number(result?.data?.lastReadPercent ?? 0)))
    } catch {
      return 0
    }
  }

  const resolveHomeAudioCoverPreview = async (resource: any) => {
    const coverPath = String(resource?.coverPath ?? '').trim()
    if (!coverPath) {
      return ''
    }

    return await options.resolveAudioPlayerCoverPreviewUrl(coverPath)
  }

  const resolveHomeVideoCoverPreview = async (resource: any) => {
    const coverPath = String(resource?.coverPath ?? '').trim()
    if (!coverPath) {
      return ''
    }

    return await options.resolveVideoPlayerCoverPreviewUrl(coverPath)
  }

  const resolveHomeAudioDisplayMode = (resource: any, categoryProfile?: CategoryProfileLike): 'default' | 'music' => {
    if (categoryProfile?.flags.isAudio) {
      return 'music'
    }

    if (categoryProfile?.flags.isAsmr || Boolean(resource?.asmrMeta)) {
      return 'default'
    }

    const extendTable = String(
      resource?.category?.referencePath
        ?? resource?.category?.extendTable
        ?? resource?.category?.meta?.extra?.extendTable
        ?? resource?.extendTable
        ?? ''
    ).trim()
    return extendTable === 'audio_meta' || Boolean(resource?.audioMeta) ? 'music' : 'default'
  }

  const applyHomeAudioPlayerSession = async (
    resource: any,
    playlist: Array<any>,
    initialPath: string,
    initialTime = 0,
    categoryProfile?: CategoryProfileLike
  ) => {
    const coverSrc = await resolveHomeAudioCoverPreview(resource)
    setAudioPlayerSession({
      resourceId: String(resource?.id ?? ''),
      initialPath,
      initialTime: Math.max(0, Number(initialTime ?? 0)),
      sessionVersion: Date.now(),
      title: String(resource?.title ?? '音频播放器'),
      artist: String(resource?.audioMeta?.artist ?? '').trim(),
      displayMode: resolveHomeAudioDisplayMode(resource, categoryProfile),
      coverSrc,
      playlist
    })
    setAudioPlayerVisible(true)
  }

  const startHomeReadingResource = async (resource: any, title: string) => {
    const resourceId = String(resource?.id ?? '').trim()
    if (!resourceId) {
      options.showNotifyByType('warning', title, '当前资源无效')
      return false
    }

    const result = await window.api.service.startReadingResource(resourceId)
    const resultType = result?.type ?? 'info'
    if (resultType === 'error' || resultType === 'warning') {
      options.showNotifyByType(resultType, title, result?.message ?? `${title}失败`)
      return false
    }

    return true
  }

  const openHomeSingleImageViewer = async (resource: any) => {
    const targetPath = options.getResourceFilePath(resource)
    if (!targetPath) {
      options.showNotifyByType('warning', '查看图片', '当前图片路径无效')
      return
    }

    const started = await startHomeReadingResource(resource, '开始浏览')
    if (!started) {
      return
    }

    options.homePictureViewerImagePaths.value = [targetPath]
    options.homePictureViewerResourceIds.value = [String(resource?.id ?? '')]
    options.homePictureViewerInitialIndex.value = 0
    options.homeCurrentPictureViewerResourceId.value = String(resource?.id ?? '')
    options.showHomePictureViewer.value = true
  }

  const openHomeComicReader = async (resource: any) => {
    const basePath = String(resource?.basePath ?? '').trim()
    const resourceId = String(resource?.id ?? '').trim()
    if (!basePath || !resourceId) {
      options.showNotifyByType('warning', '开始阅读', '当前漫画目录无效')
      return
    }

    const started = await startHomeReadingResource(resource, '开始阅读')
    if (!started) {
      return
    }

    const imagePaths = await window.api.dialog.getDirectoryImages(basePath)
    if (!Array.isArray(imagePaths) || !imagePaths.length) {
      options.showNotifyByType('warning', '开始阅读', '当前漫画目录没有可阅读图片')
      await window.api.service.stopResource(resourceId)
      return
    }

    options.homeComicReaderImagePaths.value = imagePaths
    options.homeComicReaderInitialIndex.value = await readComicProgress(resourceId)
    options.homeCurrentComicReaderResourceId.value = resourceId
    options.showHomeComicReader.value = true
  }

  const openHomeNovelReader = async (resource: any, categoryProfile: CategoryProfileLike) => {
    const targetPath = options.getResourceFilePath(resource)
    const resourceId = String(resource?.id ?? '').trim()
    if (!targetPath || !resourceId) {
      options.showNotifyByType('warning', '开始阅读', '当前阅读文件无效')
      return
    }

    const started = await startHomeReadingResource(resource, '开始阅读')
    if (!started) {
      return
    }

    const initialProgress = await readNovelProgress(resourceId)
    const title = options.getHomeResourceTitle(resource, '开始阅读')
    const fileExtension = options.getFileExtension(targetPath)

    if (categoryProfile.flags.isNovel && !['pdf', 'epub', 'mobi', 'azw', 'azw3'].includes(fileExtension)) {
      options.homeTextReaderFilePath.value = targetPath
      options.homeTextReaderTitle.value = title
      options.homeTextReaderInitialProgress.value = initialProgress
      options.homeCurrentTextReaderResourceId.value = resourceId
      options.showHomeTextReader.value = true
      return
    }

    if (fileExtension === 'pdf') {
      options.homePdfReaderFilePath.value = targetPath
      options.homePdfReaderTitle.value = title
      options.homePdfReaderInitialProgress.value = initialProgress
      options.homeCurrentPdfReaderResourceId.value = resourceId
      options.showHomePdfReader.value = true
      return
    }

    if (fileExtension === 'epub') {
      options.homeEpubReaderFilePath.value = targetPath
      options.homeEpubReaderTitle.value = title
      options.homeEpubReaderInitialProgress.value = initialProgress
      options.homeCurrentEpubReaderResourceId.value = resourceId
      options.showHomeEpubReader.value = true
      return
    }

    if (['mobi', 'azw', 'azw3'].includes(fileExtension)) {
      options.homeEbookReaderFilePath.value = targetPath
      options.homeEbookReaderTitle.value = title
      options.homeEbookReaderInitialProgress.value = initialProgress
      options.homeCurrentEbookReaderResourceId.value = resourceId
      options.showHomeEbookReader.value = true
      return
    }

    await window.api.service.stopResource(resourceId)
    options.showNotifyByType('warning', '开始阅读', '当前资源没有匹配的阅读器')
  }

  const openHomeAudioPlayback = async (resource: any, categoryProfile: CategoryProfileLike) => {
    const resourceId = String(resource?.id ?? '').trim()

    if (categoryProfile.flags.isAsmr) {
      const basePath = String(resource?.basePath ?? '').trim()
      if (!basePath || !resourceId) {
        options.showNotifyByType('warning', '播放音频', '当前音声目录无效')
        return
      }

      const audioTree = await options.resolveHomeResourceAudioTree(resource)
      const allTracks = options.collectAudioTreeTracks(audioTree)
        .map((track) => ({
          ...track,
          resourceId,
          resourceTitle: options.getHomeResourceTitle(resource, '音频播放器')
        }))
        .filter((track) => String(track.path ?? '').trim())

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

      await applyHomeAudioPlayerSession(
        resource,
        allTracks,
        String(resumeTrack?.path ?? allTracks[0]?.path ?? ''),
        resumeTrack ? lastPlayTime : 0,
        categoryProfile
      )
      return
    }

    const targetPath = options.getResourceFilePath(resource)
    if (!targetPath) {
      options.showNotifyByType('warning', '播放音频', '当前音乐路径无效')
      return
    }

    await applyHomeAudioPlayerSession(
      resource,
      [{
        path: targetPath,
        label: options.getFileNameWithoutExtension(targetPath) || options.getHomeResourceTitle(resource, '当前音乐'),
        resourceId,
        resourceTitle: options.getHomeResourceTitle(resource, '当前音乐'),
        artist: String(resource?.audioMeta?.artist ?? '').trim()
      }],
      targetPath,
      Math.max(0, Number(resource?.audioMeta?.lastPlayTime ?? 0)),
      categoryProfile
    )
  }

  const openHomeVideoPlayback = async (resource: any, categoryProfile: CategoryProfileLike) => {
    const resourceId = String(resource?.id ?? '').trim()
    const title = options.getHomeResourceTitle(resource, '视频播放')
    const shouldUseVideoFolderMode = categoryProfile.flags.isVideoFolder || options.getHomeDetailVideoSubItems(resource).length > 0

    if (shouldUseVideoFolderMode) {
      const basePath = String(resource?.basePath ?? '').trim()
      if (!basePath || !resourceId) {
        options.showNotifyByType('warning', '播放视频', '当前视频目录无效')
        return
      }

      let playbackResource = resource
      if (resourceId) {
        try {
          const detailResult = await window.api.service.getResourceDetail(resourceId)
          if (detailResult?.data) {
            playbackResource = detailResult.data
          }
        } catch {
          // ignore detail fetch failures and fall back to current resource
        }
      }

      const audioTree = await options.resolveHomeResourceAudioTree(playbackResource)
      const playlist = options.sortHomeVideoTracksBySubItems(options.collectVideoTreeTracks(audioTree, playbackResource), playbackResource)
      if (!playlist.length) {
        options.showNotifyByType('warning', '播放视频', '当前没有可播放的视频文件')
        return
      }

      const lastPlayFile = String(playbackResource?.videoMeta?.lastPlayFile ?? '').trim().replace(/\\/g, '/')
      const resumeTrack = lastPlayFile
        ? playlist.find((track) => String(track.path ?? '').replace(/\\/g, '/') === lastPlayFile)
        : null

      options.homeVideoPlayerPlaylist.value = playlist
      options.homeVideoPlayerInitialPath.value = String(resumeTrack?.path ?? playlist[0]?.path ?? '')
      options.homeVideoPlayerInitialTime.value = resumeTrack ? Math.max(0, Number(playbackResource?.videoMeta?.lastPlayTime ?? 0)) : 0
      options.homeVideoPlayerTitle.value = options.getHomeResourceTitle(playbackResource, title)
      options.showHomeVideoPlayer.value = true
      return
    }

    const targetPath = options.getResourceFilePath(resource)
    if (!targetPath) {
      options.showNotifyByType('warning', '播放视频', '当前视频路径无效')
      return
    }

    options.homeVideoPlayerPlaylist.value = [{
      path: targetPath,
      label: options.getFileNameWithoutExtension(targetPath) || title,
      resourceId,
      resourceTitle: title,
      coverSrc: await resolveHomeVideoCoverPreview(resource) || undefined
    }]
    options.homeVideoPlayerInitialPath.value = targetPath
    options.homeVideoPlayerInitialTime.value = Math.max(0, Number(resource?.videoMeta?.lastPlayTime ?? 0))
    options.homeVideoPlayerTitle.value = title
    options.showHomeVideoPlayer.value = true
  }

  const openHomeResourceByCategoryProfile = async (resource: any, categoryProfile: CategoryProfileLike) => {
    const fileExtension = options.getFileExtension(options.getResourceFilePath(resource))
    const shouldUseVideoFolderMode = options.isHomeVideoFolderResource(resource)
    const shouldOpenSingleImageViewer = categoryProfile.flags.isSingleImage
      || Boolean(resource?.singleImageMeta)
      || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'].includes(fileExtension)
    const shouldOpenComicReader = categoryProfile.flags.isManga || Boolean(resource?.multiImageMeta)
    const shouldOpenAsmrPlayer = categoryProfile.flags.isAsmr || Boolean(resource?.asmrMeta)
    const shouldOpenAudioPlayer = categoryProfile.flags.isAudio || Boolean(resource?.audioMeta)
    const shouldOpenVideoPlayer = categoryProfile.flags.isVideo || categoryProfile.flags.isVideoFolder || Boolean(resource?.videoMeta)
    const shouldOpenNovelReader = categoryProfile.flags.isNovel
      || Boolean(resource?.novelMeta)
      || ['txt', 'md', 'pdf', 'epub', 'mobi', 'azw', 'azw3'].includes(fileExtension)

    if (shouldOpenSingleImageViewer) {
      await openHomeSingleImageViewer(resource)
      return
    }

    if (shouldOpenComicReader) {
      await openHomeComicReader(resource)
      return
    }

    if (shouldOpenAsmrPlayer || shouldOpenAudioPlayer) {
      await openHomeAudioPlayback(resource, {
        ...categoryProfile,
        flags: {
          ...categoryProfile.flags,
          isAsmr: shouldOpenAsmrPlayer,
          isAudio: shouldOpenAudioPlayer && !shouldOpenAsmrPlayer
        }
      })
      return
    }

    if (shouldOpenVideoPlayer) {
      await openHomeVideoPlayback(resource, {
        ...categoryProfile,
        flags: {
          ...categoryProfile.flags,
          isVideo: true,
          isVideoFolder: shouldUseVideoFolderMode
        }
      })
      return
    }

    if (shouldOpenNovelReader) {
      await openHomeNovelReader(resource, categoryProfile)
      return
    }

    const websiteUrl = String(resource?.websiteMeta?.url ?? '').trim()
    if (Boolean(resource?.websiteMeta)) {
      if (!websiteUrl) {
        options.showNotifyByType('warning', '打开网站', '当前资源未填写网站地址')
        return
      }

      await window.api.dialog.openExternalUrl(websiteUrl)
      return
    }

    await window.api.service.launchResource(
      String(resource?.id ?? '').trim(),
      String(resource?.basePath ?? '').trim(),
      String(resource?.fileName ?? resource?.filename ?? '').trim() || null
    )
  }

  const handleHomeDetailLaunchAction = async () => {
    const resource = options.homeDetailResource.value
    if (!resource) {
      return
    }

    await openHomeResourceByCategoryProfile(resource, options.homeDetailCategoryProfile.value)
  }

  const handleHomeDetailOpenPictureViewer = async (target?: number | string) => {
    const imagePaths = options.homeDetailScreenshotPaths.value
    const currentPath = typeof target === 'string'
      ? target
      : typeof target === 'number'
        ? options.homeDetailGalleryItems.value[target]?.filePath ?? ''
        : imagePaths[options.homeDetailCurrentScreenshotIndex.value] ?? ''
    if (!currentPath) {
      return
    }

    const initialIndex = imagePaths.findIndex((item) => options.normalizePathValue(item) === options.normalizePathValue(currentPath))
    options.homePictureViewerImagePaths.value = imagePaths.length ? imagePaths : [currentPath]
    options.homePictureViewerResourceIds.value = options.homePictureViewerImagePaths.value.map(() => String(options.homeDetailResource.value?.id ?? ''))
    options.homePictureViewerInitialIndex.value = initialIndex >= 0 ? initialIndex : 0
    options.homeCurrentPictureViewerResourceId.value = String(options.homeDetailResource.value?.id ?? '')
    options.showHomePictureViewer.value = true
  }

  const openHomeAudioTreeAudioPlayer = async (targetPath: string) => {
    const resource = options.homeDetailResource.value
    const normalizedPath = String(targetPath ?? '').trim()
    if (!resource || !normalizedPath) {
      return
    }

    const allTracks = options.collectAudioTreeTracks(options.homeDetailAudioTree.value)
      .map((track) => ({
        ...track,
        resourceId: String(resource?.id ?? ''),
        resourceTitle: options.getHomeResourceTitle(resource, '音频播放器')
      }))
      .filter((track) => String(track.path ?? '').trim())
    if (!allTracks.length) {
      options.showNotifyByType('warning', '播放音频', '当前没有可播放的音频文件')
      return
    }

    const targetDirectory = normalizedPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const directoryTracks = allTracks.filter((track) => String(track.path ?? '').replace(/\\/g, '/').split('/').slice(0, -1).join('/') === targetDirectory)
    const playlist = directoryTracks.length ? directoryTracks : allTracks
    await applyHomeAudioPlayerSession(resource, playlist, normalizedPath, 0, options.homeDetailCategoryProfile.value)
  }

  const openHomeAudioTreeVideoPlayer = async (targetPath: string) => {
    const resource = options.homeDetailResource.value
    const normalizedPath = String(targetPath ?? '').trim()
    if (!resource || !normalizedPath) {
      return
    }

    const allTracks = options.sortHomeVideoTracksBySubItems(
      options.collectVideoTreeTracks(options.homeDetailAudioTree.value, resource),
      resource
    )
    if (!allTracks.length) {
      options.showNotifyByType('warning', '播放视频', '当前没有可播放的视频文件')
      return
    }

    const targetDirectory = normalizedPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const directoryTracks = allTracks.filter((track) => String(track.path ?? '').replace(/\\/g, '/').split('/').slice(0, -1).join('/') === targetDirectory)
    const playlist = directoryTracks.length ? directoryTracks : allTracks
    const normalizedTargetPath = normalizedPath.replace(/\\/g, '/')
    const matchedTrack = playlist.find((track) => String(track.path ?? '').replace(/\\/g, '/') === normalizedTargetPath)
    const lastPlayFile = String(resource?.videoMeta?.lastPlayFile ?? '').trim().replace(/\\/g, '/')

    options.homeVideoPlayerPlaylist.value = playlist
    options.homeVideoPlayerInitialPath.value = matchedTrack?.path ?? normalizedPath
    options.homeVideoPlayerInitialTime.value = lastPlayFile && lastPlayFile === String(matchedTrack?.path ?? normalizedPath).replace(/\\/g, '/')
      ? Math.max(0, Number(resource?.videoMeta?.lastPlayTime ?? 0))
      : 0
    options.homeVideoPlayerTitle.value = options.getHomeResourceTitle(resource, '视频播放')
    options.showHomeVideoPlayer.value = true
  }

  const handleHomeAudioTreePlay = (option: any) => {
    if (!option?.path) {
      return
    }

    if (option?.kind === 'video') {
      void openHomeAudioTreeVideoPlayer(String(option.path))
      return
    }

    if (option?.kind === 'audio') {
      void openHomeAudioTreeAudioPlayer(String(option.path))
    }
  }

  const handleHomeOpenAudioTreeImage = async (filePath: string) => {
    const normalizedPath = String(filePath ?? '').trim()
    if (!normalizedPath) {
      return
    }

    const imagePaths = options.collectAudioTreeImagePaths(options.homeDetailAudioTree.value)
    if (!imagePaths.length) {
      return
    }

    const initialIndex = imagePaths.findIndex((item) => options.normalizePathValue(item) === options.normalizePathValue(normalizedPath))
    options.homePictureViewerImagePaths.value = imagePaths
    options.homePictureViewerResourceIds.value = imagePaths.map(() => String(options.homeDetailResource.value?.id ?? ''))
    options.homePictureViewerInitialIndex.value = initialIndex >= 0 ? initialIndex : 0
    options.homeCurrentPictureViewerResourceId.value = String(options.homeDetailResource.value?.id ?? '')
    options.showHomePictureViewer.value = true
  }

  const stopHomeResourceSession = async (resourceId: string) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return
    }

    try {
      await window.api.service.stopResource(normalizedResourceId)
    } catch {
      // ignore stop failure in dashboard lightweight launchers
    }
  }

  const handleHomePictureViewerShowUpdate = async (visible: boolean) => {
    options.showHomePictureViewer.value = visible
    if (!visible && options.homeCurrentPictureViewerResourceId.value) {
      const currentId = options.homeCurrentPictureViewerResourceId.value
      options.homeCurrentPictureViewerResourceId.value = ''
      await stopHomeResourceSession(currentId)
    }
  }

  const handleHomeComicReaderShowUpdate = async (visible: boolean) => {
    options.showHomeComicReader.value = visible
    if (!visible && options.homeCurrentComicReaderResourceId.value) {
      const currentId = options.homeCurrentComicReaderResourceId.value
      options.homeCurrentComicReaderResourceId.value = ''
      await stopHomeResourceSession(currentId)
    }
  }

  const handleHomeComicReaderPageChange = async (index: number) => {
    options.homeComicReaderInitialIndex.value = Math.max(0, Math.floor(Number(index ?? 0)))
    if (options.homeCurrentComicReaderResourceId.value) {
      try {
        await window.api.service.updateMultiImageReadingProgress(
          options.homeCurrentComicReaderResourceId.value,
          options.homeComicReaderInitialIndex.value
        )
      } catch {
        // ignore progress persistence failure
      }
    }
  }

  const persistHomeNovelProgress = async (resourceId: string, progress: number) => {
    const normalizedResourceId = String(resourceId ?? '').trim()
    if (!normalizedResourceId) {
      return
    }

    try {
      await window.api.service.updateNovelReadingProgress(
        normalizedResourceId,
        Math.max(0, Math.min(1, Number(progress ?? 0)))
      )
    } catch {
      // ignore progress persistence failure
    }
  }

  const handleHomeTextReaderProgressChange = (progress: number) => {
    options.homeTextReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progress ?? 0)))
    void persistHomeNovelProgress(options.homeCurrentTextReaderResourceId.value, options.homeTextReaderInitialProgress.value)
  }

  const handleHomePdfReaderProgressChange = (progress: number) => {
    options.homePdfReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progress ?? 0)))
    void persistHomeNovelProgress(options.homeCurrentPdfReaderResourceId.value, options.homePdfReaderInitialProgress.value)
  }

  const handleHomeEpubReaderProgressChange = (progress: number) => {
    options.homeEpubReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progress ?? 0)))
    void persistHomeNovelProgress(options.homeCurrentEpubReaderResourceId.value, options.homeEpubReaderInitialProgress.value)
  }

  const handleHomeEbookReaderProgressChange = (progress: number) => {
    options.homeEbookReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progress ?? 0)))
    void persistHomeNovelProgress(options.homeCurrentEbookReaderResourceId.value, options.homeEbookReaderInitialProgress.value)
  }

  const handleHomeTextReaderShowUpdate = async (visible: boolean) => {
    options.showHomeTextReader.value = visible
    if (!visible && options.homeCurrentTextReaderResourceId.value) {
      const currentId = options.homeCurrentTextReaderResourceId.value
      options.homeCurrentTextReaderResourceId.value = ''
      await stopHomeResourceSession(currentId)
    }
  }

  const handleHomePdfReaderShowUpdate = async (visible: boolean) => {
    options.showHomePdfReader.value = visible
    if (!visible && options.homeCurrentPdfReaderResourceId.value) {
      const currentId = options.homeCurrentPdfReaderResourceId.value
      options.homeCurrentPdfReaderResourceId.value = ''
      await stopHomeResourceSession(currentId)
    }
  }

  const handleHomeEpubReaderShowUpdate = async (visible: boolean) => {
    options.showHomeEpubReader.value = visible
    if (!visible && options.homeCurrentEpubReaderResourceId.value) {
      const currentId = options.homeCurrentEpubReaderResourceId.value
      options.homeCurrentEpubReaderResourceId.value = ''
      await stopHomeResourceSession(currentId)
    }
  }

  const handleHomeEbookReaderShowUpdate = async (visible: boolean) => {
    options.showHomeEbookReader.value = visible
    if (!visible && options.homeCurrentEbookReaderResourceId.value) {
      const currentId = options.homeCurrentEbookReaderResourceId.value
      options.homeCurrentEbookReaderResourceId.value = ''
      await stopHomeResourceSession(currentId)
    }
  }

  return {
    handleHomeDetailLaunchAction,
    openHomeResourceByCategoryProfile,
    handleHomeDetailOpenPictureViewer,
    handleHomeAudioTreePlay,
    handleHomeOpenAudioTreeImage,
    handleHomePictureViewerShowUpdate,
    handleHomeComicReaderShowUpdate,
    handleHomeComicReaderPageChange,
    handleHomeTextReaderProgressChange,
    handleHomePdfReaderProgressChange,
    handleHomeEpubReaderProgressChange,
    handleHomeEbookReaderProgressChange,
    handleHomeTextReaderShowUpdate,
    handleHomePdfReaderShowUpdate,
    handleHomeEpubReaderShowUpdate,
    handleHomeEbookReaderShowUpdate
  }
}
