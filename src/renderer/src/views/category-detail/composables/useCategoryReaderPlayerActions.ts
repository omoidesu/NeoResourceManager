import type {ComputedRef, Ref} from 'vue'
import {useCategoryImageComicActions} from './useCategoryImageComicActions'
import {useCategoryMediaPlayerActions} from './useCategoryMediaPlayerActions'
import {useCategoryNovelReaderActions} from './useCategoryNovelReaderActions'

type NotifyType = 'success' | 'error' | 'info' | 'warning'

interface UseCategoryReaderPlayerActionsOptions {
  categoryId: ComputedRef<string>
  categoryName: ComputedRef<string>
  selectedDetailResource: Ref<any>
  resourceList: Ref<any[]>
  totalResources: Ref<number>
  sortBy: Ref<string>
  detailScreenshotPaths: Ref<string[]>
  detailAudioPlaylist: Ref<any[]>
  detailAudioVideoPlaylist: Ref<any[]>
  detailAudioImagePaths: Ref<string[]>
  pictureViewerImagePaths: Ref<string[]>
  pictureViewerResourceIds: Ref<string[]>
  pictureViewerInitialIndex: Ref<number>
  pictureViewerAllowDelete: Ref<boolean>
  comicReaderImagePaths: Ref<string[]>
  comicReaderInitialIndex: Ref<number>
  currentScreenshotIndex: Ref<number>
  currentPictureViewerResourceId: Ref<string>
  currentComicReaderResourceId: Ref<string>
  currentTextReaderResourceId: Ref<string>
  currentPdfReaderResourceId: Ref<string>
  currentEpubReaderResourceId: Ref<string>
  currentEbookReaderResourceId: Ref<string>
  textReaderInitialProgress: Ref<number>
  pdfReaderInitialProgress: Ref<number>
  epubReaderInitialProgress: Ref<number>
  ebookReaderInitialProgress: Ref<number>
  textReaderFilePath: Ref<string>
  pdfReaderFilePath: Ref<string>
  epubReaderFilePath: Ref<string>
  ebookReaderFilePath: Ref<string>
  textReaderTitle: Ref<string>
  pdfReaderTitle: Ref<string>
  epubReaderTitle: Ref<string>
  ebookReaderTitle: Ref<string>
  showPictureViewer: Ref<boolean>
  showComicReader: Ref<boolean>
  showTextReader: Ref<boolean>
  showPdfReader: Ref<boolean>
  showEpubReader: Ref<boolean>
  showEbookReader: Ref<boolean>
  showVideoPlayer: Ref<boolean>
  videoPlayerPlaylist: Ref<any[]>
  videoPlayerInitialPath: Ref<string>
  videoPlayerInitialTime: Ref<number>
  videoPlayerTitle: Ref<string>
  isSingleImageCategory: ComputedRef<boolean>
  detailIsManga: ComputedRef<boolean>
  detailIsAsmr: ComputedRef<boolean>
  detailIsAudio: ComputedRef<boolean>
  detailIsVideo: ComputedRef<boolean>
  detailIsNovel: ComputedRef<boolean>
  isVideoFolderCategory: ComputedRef<boolean>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
  getResourceFilePath: (resource: any) => string
  getFileNameWithoutExtension: (filePath: string) => string
  getAudioDirectoryPath: (path: string) => string
  normalizeAudioPath: (path: string) => string
  loadPictureViewerScrollMode: () => Promise<void>
  buildResourceQuery: (page: number, size: number) => Record<string, unknown>
  fetchData: () => Promise<void>
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
  readComicProgress: (resourceId: string) => Promise<number>
  writeComicProgress: (resourceId: string, progressIndex: number) => Promise<void>
  refreshDetailScreenshots: (nextIndex?: number, targetResource?: any) => Promise<void>
  startComicReadingSession: (resource: any) => Promise<boolean>
  stopComicReadingSession: () => Promise<void>
  readNovelProgress: (resourceId: string) => Promise<number>
  startNovelReaderSession: (resource: any, title: string) => Promise<boolean>
  stopTextReadingSession: () => Promise<void>
  stopPdfReadingSession: () => Promise<void>
  stopEpubReadingSession: () => Promise<void>
  stopEbookReadingSession: () => Promise<void>
}

export const useCategoryReaderPlayerActions = (options: UseCategoryReaderPlayerActionsOptions) => {
  const imageComicActions = useCategoryImageComicActions({
    categoryId: options.categoryId,
    selectedDetailResource: options.selectedDetailResource,
    resourceList: options.resourceList,
    totalResources: options.totalResources,
    sortBy: options.sortBy,
    detailScreenshotPaths: options.detailScreenshotPaths,
    detailAudioImagePaths: options.detailAudioImagePaths,
    pictureViewerImagePaths: options.pictureViewerImagePaths,
    pictureViewerResourceIds: options.pictureViewerResourceIds,
    pictureViewerInitialIndex: options.pictureViewerInitialIndex,
    pictureViewerAllowDelete: options.pictureViewerAllowDelete,
    comicReaderImagePaths: options.comicReaderImagePaths,
    comicReaderInitialIndex: options.comicReaderInitialIndex,
    currentScreenshotIndex: options.currentScreenshotIndex,
    currentPictureViewerResourceId: options.currentPictureViewerResourceId,
    currentComicReaderResourceId: options.currentComicReaderResourceId,
    showPictureViewer: options.showPictureViewer,
    showComicReader: options.showComicReader,
    detailIsManga: options.detailIsManga,
    showNotifyByType: options.showNotifyByType,
    getResourceFilePath: options.getResourceFilePath,
    loadPictureViewerScrollMode: options.loadPictureViewerScrollMode,
    buildResourceQuery: options.buildResourceQuery,
    fetchData: options.fetchData,
    readComicProgress: options.readComicProgress,
    writeComicProgress: options.writeComicProgress,
    refreshDetailScreenshots: options.refreshDetailScreenshots,
    startComicReadingSession: options.startComicReadingSession,
    stopComicReadingSession: options.stopComicReadingSession
  })

  const novelReaderActions = useCategoryNovelReaderActions({
    categoryName: options.categoryName,
    currentTextReaderResourceId: options.currentTextReaderResourceId,
    currentPdfReaderResourceId: options.currentPdfReaderResourceId,
    currentEpubReaderResourceId: options.currentEpubReaderResourceId,
    currentEbookReaderResourceId: options.currentEbookReaderResourceId,
    textReaderInitialProgress: options.textReaderInitialProgress,
    pdfReaderInitialProgress: options.pdfReaderInitialProgress,
    epubReaderInitialProgress: options.epubReaderInitialProgress,
    ebookReaderInitialProgress: options.ebookReaderInitialProgress,
    textReaderFilePath: options.textReaderFilePath,
    pdfReaderFilePath: options.pdfReaderFilePath,
    epubReaderFilePath: options.epubReaderFilePath,
    ebookReaderFilePath: options.ebookReaderFilePath,
    textReaderTitle: options.textReaderTitle,
    pdfReaderTitle: options.pdfReaderTitle,
    epubReaderTitle: options.epubReaderTitle,
    ebookReaderTitle: options.ebookReaderTitle,
    showPictureViewer: options.showPictureViewer,
    showComicReader: options.showComicReader,
    showTextReader: options.showTextReader,
    showPdfReader: options.showPdfReader,
    showEpubReader: options.showEpubReader,
    showEbookReader: options.showEbookReader,
    showNotifyByType: options.showNotifyByType,
    getResourceFilePath: options.getResourceFilePath,
    getFileNameWithoutExtension: options.getFileNameWithoutExtension,
    fetchData: options.fetchData,
    readNovelProgress: options.readNovelProgress,
    startNovelReaderSession: options.startNovelReaderSession,
    stopTextReadingSession: options.stopTextReadingSession,
    stopPdfReadingSession: options.stopPdfReadingSession,
    stopEpubReadingSession: options.stopEpubReadingSession,
    stopEbookReadingSession: options.stopEbookReadingSession
  })

  const mediaPlayerActions = useCategoryMediaPlayerActions({
    categoryName: options.categoryName,
    selectedDetailResource: options.selectedDetailResource,
    detailAudioPlaylist: options.detailAudioPlaylist,
    detailAudioVideoPlaylist: options.detailAudioVideoPlaylist,
    videoPlayerPlaylist: options.videoPlayerPlaylist,
    videoPlayerInitialPath: options.videoPlayerInitialPath,
    videoPlayerInitialTime: options.videoPlayerInitialTime,
    videoPlayerTitle: options.videoPlayerTitle,
    showVideoPlayer: options.showVideoPlayer,
    detailIsAsmr: options.detailIsAsmr,
    detailIsAudio: options.detailIsAudio,
    detailIsVideo: options.detailIsVideo,
    isVideoFolderCategory: options.isVideoFolderCategory,
    showNotifyByType: options.showNotifyByType,
    getResourceFilePath: options.getResourceFilePath,
    getAudioDirectoryPath: options.getAudioDirectoryPath,
    normalizeAudioPath: options.normalizeAudioPath,
    applyAudioPlayerSession: options.applyAudioPlayerSession,
    loadPlaybackResumeRestartThresholds: options.loadPlaybackResumeRestartThresholds,
    loadAllCategoryResources: options.loadAllCategoryResources,
    buildMusicPlaylistTrack: options.buildMusicPlaylistTrack,
    buildVideoPlaylistTrack: options.buildVideoPlaylistTrack,
    resolveResourceAudioTree: options.resolveResourceAudioTree,
    collectAudioTreeTracks: options.collectAudioTreeTracks,
    collectAudioTreeVideoTracks: options.collectAudioTreeVideoTracks,
    sortVideoTracksBySubItems: options.sortVideoTracksBySubItems,
    refreshVideoSubCoverPreviewUrls: options.refreshVideoSubCoverPreviewUrls
  })

  const onLaunchSpecialResource = async (resource: any) => {
    if (options.isSingleImageCategory.value) {
      await imageComicActions.handlePreviewSingleImageResource(resource)
      return true
    }

    if (options.detailIsManga.value) {
      await imageComicActions.openComicReader(resource)
      return true
    }

    if (options.detailIsAsmr.value) {
      await mediaPlayerActions.openAsmrPlaybackFromLaunch(resource)
      return true
    }

    if (options.detailIsAudio.value) {
      await mediaPlayerActions.openAudioPlaybackFromLaunch(resource)
      return true
    }

    if (options.detailIsVideo.value) {
      await mediaPlayerActions.openVideoPlaybackFromLaunch(resource)
      return true
    }

    if (options.detailIsNovel.value) {
      await novelReaderActions.openNovelReader(resource)
      return true
    }

    return false
  }

  return {
    ...imageComicActions,
    ...novelReaderActions,
    ...mediaPlayerActions,
    onLaunchSpecialResource
  }
}
