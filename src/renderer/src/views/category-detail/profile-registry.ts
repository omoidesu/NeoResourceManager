export type CategoryProfileId =
  | 'launchable-resource'
  | 'single-media-resource'
  | 'folder-reader-resource'
  | 'website-resource'
  | 'hybrid-resource'
  | 'list-only-resource'

type ExtendTable =
  | 'game_meta'
  | 'software_meta'
  | 'single_image_meta'
  | 'multi_image_meta'
  | 'video_meta'
  | 'asmr_meta'
  | 'audio_meta'
  | 'novel_meta'
  | 'website_meta'
  | ''

type ResourcePathType = 'file' | 'folder' | 'launchable' | 'virtual' | 'url' | ''

export interface CategoryProfileInput {
  extendTable?: string | null
  resourcePathType?: string | null
  startText?: string | null
}

export interface CategoryProfile {
  id: CategoryProfileId
  extendTable: ExtendTable
  resourcePathType: ResourcePathType
  flags: {
    isGame: boolean
    isSoftware: boolean
    isSingleImage: boolean
    isManga: boolean
    isVideo: boolean
    isVideoFolder: boolean
    isAsmr: boolean
    isAudio: boolean
    isNovel: boolean
    isWebsite: boolean
  }
  features: {
    showBatchImportButton: boolean
    showZoneLaunch: boolean
    showAdminLaunch: boolean
    showMtoolLaunch: boolean
    showScreenshotFolder: boolean
    showCompletedToggle: boolean
    showCardCover: boolean
    showDeleteFiles: boolean
    showEngineFilter: boolean
    showAuthorFilter: boolean
    showMissingFilter: boolean
    showRunningFilter: boolean
    showCardDefaultAppOpen: boolean
    usesWebsiteTerms: boolean
    usesBrowseTerms: boolean
    usesPlayTerms: boolean
    showDetailLogs: boolean
    showDetailTotalRuntime: boolean
  }
  labels: {
    startText: string
    completedActionLabel: string
    batchImportResourceLabel: string
  }
}

const normalizeExtendTable = (value: string | null | undefined): ExtendTable =>
  String(value ?? '').trim() as ExtendTable

const normalizeResourcePathType = (value: string | null | undefined): ResourcePathType =>
  String(value ?? '').trim() as ResourcePathType

const resolveProfileId = (extendTable: ExtendTable, resourcePathType: ResourcePathType): CategoryProfileId => {
  if (extendTable === 'website_meta') {
    return 'website-resource'
  }

  if (extendTable === 'game_meta' || extendTable === 'software_meta') {
    return 'launchable-resource'
  }

  if (extendTable === 'multi_image_meta' || extendTable === 'asmr_meta') {
    return 'folder-reader-resource'
  }

  if (extendTable === 'video_meta' && resourcePathType === 'folder') {
    return 'hybrid-resource'
  }

  if (
    extendTable === 'single_image_meta'
    || extendTable === 'audio_meta'
    || extendTable === 'novel_meta'
    || extendTable === 'video_meta'
  ) {
    return 'single-media-resource'
  }

  return 'list-only-resource'
}

export const resolveCategoryProfile = (input: CategoryProfileInput): CategoryProfile => {
  const extendTable = normalizeExtendTable(input.extendTable)
  const resourcePathType = normalizeResourcePathType(input.resourcePathType)
  const isGame = extendTable === 'game_meta'
  const isSoftware = extendTable === 'software_meta'
  const isSingleImage = extendTable === 'single_image_meta'
  const isManga = extendTable === 'multi_image_meta'
  const isVideo = extendTable === 'video_meta'
  const isAsmr = extendTable === 'asmr_meta'
  const isAudio = extendTable === 'audio_meta'
  const isNovel = extendTable === 'novel_meta'
  const isWebsite = extendTable === 'website_meta'
  const isVideoFolder = isVideo && resourcePathType === 'folder'

  let startText = String(input.startText ?? '').trim()
  if (!startText) {
    if (isSingleImage) {
      startText = '查看'
    } else if (isManga || isNovel) {
      startText = '阅读'
    } else {
      startText = '启动'
    }
  }

  let completedActionLabel = '通关'
  if (isNovel) {
    completedActionLabel = '读完'
  } else if (isVideo) {
    completedActionLabel = '播完'
  }

  let batchImportResourceLabel = '游戏'
  if (isManga) {
    batchImportResourceLabel = '漫画'
  } else if (isAsmr) {
    batchImportResourceLabel = '音声'
  } else if (isAudio) {
    batchImportResourceLabel = '音乐'
  } else if (isNovel) {
    batchImportResourceLabel = '小说'
  } else if (isVideo) {
    batchImportResourceLabel = '电影'
  } else if (isSingleImage) {
    batchImportResourceLabel = '图片'
  }

  return {
    id: resolveProfileId(extendTable, resourcePathType),
    extendTable,
    resourcePathType,
    flags: {
      isGame,
      isSoftware,
      isSingleImage,
      isManga,
      isVideo,
      isVideoFolder,
      isAsmr,
      isAudio,
      isNovel,
      isWebsite
    },
    features: {
      showBatchImportButton: ['game_meta', 'single_image_meta', 'multi_image_meta', 'video_meta', 'asmr_meta', 'audio_meta', 'novel_meta'].includes(extendTable),
      showZoneLaunch: isGame,
      showAdminLaunch: isSoftware,
      showMtoolLaunch: isGame,
      showScreenshotFolder: isGame,
      showCompletedToggle: isGame || isNovel || isVideo,
      showCardCover: !isSoftware,
      showDeleteFiles: isGame,
      showEngineFilter: isGame,
      showAuthorFilter: !isWebsite,
      showMissingFilter: !isWebsite,
      showRunningFilter: !isWebsite,
      showCardDefaultAppOpen: !['game_meta', 'software_meta', 'website_meta', 'multi_image_meta', 'asmr_meta'].includes(extendTable) && !isVideoFolder,
      usesWebsiteTerms: isWebsite,
      usesBrowseTerms: isSingleImage || isManga || isNovel,
      usesPlayTerms: isAsmr || isAudio || isVideo,
      showDetailLogs: !isWebsite && !isSingleImage && !isManga && !isAudio,
      showDetailTotalRuntime: !isWebsite
    },
    labels: {
      startText,
      completedActionLabel,
      batchImportResourceLabel
    }
  }
}
