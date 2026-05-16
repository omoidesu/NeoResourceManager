import type { Component, CSSProperties } from 'vue'

export type FilterCountItem = {
  id?: string
  name: string
  count: number
}

export type EngineFilterItem = FilterCountItem & {
  icon?: string
}

export type DetailMetaItem = {
  label: string
  value: string
  icon?: string
  full?: boolean
  copyValue?: string
  clampLines?: number
}

export type DetailStoreItem = {
  id: string
  name: string
  icon?: string
  url?: string
}

export type DetailStatsText = {
  firstAccess: string
  lastAccess: string
  accessCount: string
  totalRuntime: string
}

export type DetailAudioContextMenuPosition = {
  x: number
  y: number
}

export type CategorySettingsContract = {
  extendTable?: string
  resourcePathType?: string
  authorText?: string
  [key: string]: unknown
}

export type NamedResourceItem = {
  id?: string | number
  name: string
}

export type DetailResourceMetaLike = {
  translator?: string
  [key: string]: unknown
}

export type DetailSelectedResource = {
  id?: string | number
  title?: string
  fileName?: string
  description?: string
  isRunning?: boolean
  createTime?: string | number | Date | null
  authors?: NamedResourceItem[]
  tags?: NamedResourceItem[]
  types?: NamedResourceItem[]
  multiImageMeta?: DetailResourceMetaLike
  [key: string]: unknown
}

export type DetailStats = {
  firstAccessTime?: string | number | Date | null
  lastAccessTime?: string | number | Date | null
  accessCount?: number | null
  totalRuntime?: number | null
}

export type DetailGalleryItem = {
  filePath: string
  index: number
  url: string
}

export type DetailAudioTreeNode = {
  key?: string | number
  label?: string
  path?: string
  kind?: string
  isDirectory?: boolean
  children?: DetailAudioTreeNode[]
  [key: string]: unknown
}

export type DetailAudioContextMenuOption = {
  key: string
  label: string
  disabled?: boolean
  [key: string]: unknown
}

export type DetailLogItem = {
  startTime?: string | number | Date | null
  endTime?: string | number | Date | null
  duration?: number | null
  launchMode?: string | null
  [key: string]: unknown
}

export type SelectOptionLike = {
  label: string
  value: string
  [key: string]: unknown
}

export type ResourceEditorFormData = {
  name?: string
  basePath?: string
  author?: string
  authors?: string[]
  actors?: string[]
  tags?: string[]
  types?: string[]
  meta?: Record<string, unknown>
  description?: string
  cover?: string
  [key: string]: unknown
}

export interface ResourceDetailDrawerProps {
  show: boolean
  width: number | string
  selectedDetailResource: DetailSelectedResource | null
  categoryName?: string
  categorySettings?: CategorySettingsContract
  detailIsWebsite?: boolean
  detailIsSoftware?: boolean
  detailIsManga?: boolean
  detailIsAsmr?: boolean
  detailIsAudio?: boolean
  detailIsNovel?: boolean
  isVideoCategory?: boolean
  isVideoFolderCategory?: boolean
  detailWebsiteFaviconSrc?: string
  detailWebsitePlaceholderEmoji?: string
  detailWebsiteCoverPlaceholderText?: string
  detailCoverPreviewSrc?: string
  detailRatingDraft?: number
  hasPendingRatingChange?: boolean
  ratingComment?: string
  getRatingEmoji?: ((...args: any[]) => string) | null
  detailStores?: DetailStoreItem[]
  detailMetaItems?: DetailMetaItem[]
  detailDisplayPath?: string
  hasDetailDescription?: boolean
  detailDescriptionBoxStyle?: Partial<CSSProperties>
  detailStats?: DetailStats
  detailStatsText?: DetailStatsText
  detailShowTotalRuntime?: boolean
  detailReadingProgressText?: string
  detailPlaybackProgressText?: string
  detailPreviewSectionTitle?: string
  detailScreenshotPaths?: string[]
  detailScreenshotPreviewSrc?: string
  currentScreenshotIndex?: number
  showDeleteScreenshotConfirm?: boolean
  detailGalleryItems?: DetailGalleryItem[]
  detailGallerySectionTitle?: string
  detailDirectorySectionTitle?: string
  detailAudioTreeLoading?: boolean
  detailAudioTree?: DetailAudioTreeNode[]
  detailDirectoryEmptyText?: string
  detailAudioContextMenuVisible?: boolean
  detailAudioContextMenuPosition?: DetailAudioContextMenuPosition
  detailAudioContextMenuOptions?: DetailAudioContextMenuOption[]
  detailShowLogs?: boolean
  detailLogs?: DetailLogItem[]
  detailEmptyLogDescription?: string
  visibleDetailLogs?: DetailLogItem[]
  hasMoreDetailLogs?: boolean
  noMore?: boolean
  detailLogModeLabel?: string
  detailLogDurationLabel?: string
  startText?: string
  detailCanLaunch?: boolean
  detailCanStop?: boolean
  detailOpenFolderText?: string
  showOpenCategoryButton?: boolean
  openCategoryButtonText?: string
  handleDetailDrawerResizeStart?: (event: MouseEvent) => void
  handleRatingUpdate?: (value: number) => void
  handleSubmitRating?: () => void | Promise<void>
  handleCopyText?: (value: string, label?: string) => void
  handleOpenDetailResourcePath?: () => void | Promise<void>
  handleOpenStoreWebsite?: (url: string) => void | Promise<void>
  handleOpenPictureViewer?: (target?: number | string) => void | Promise<void>
  handlePreviousScreenshot?: () => void | Promise<void>
  handleNextScreenshot?: () => void | Promise<void>
  handleDeleteCurrentScreenshot?: () => void | Promise<void>
  handleOpenDetailScreenshotFolder?: () => void | Promise<void>
  renderAudioTreeLabel?: (info: { option: DetailAudioTreeNode }) => unknown
  renderAudioTreeSuffix?: (info: { option: DetailAudioTreeNode }) => unknown
  closeDetailAudioContextMenu?: () => void
  handleSelectDetailAudioContextMenu?: (key: string) => void
  handleAudioTreePlay?: (option: DetailAudioTreeNode) => void
  handleOpenAudioTreeContextMenu?: (event: MouseEvent, option: DetailAudioTreeNode) => void
  handleLoadMoreLogs?: () => void
  formatDateTime?: (value: string | number | Date | null | undefined) => string
  formatDuration?: (value: number | null | undefined) => string
  formatLaunchMode?: (launchMode: string | null | undefined, usePlayTerms?: boolean) => string
  formatLogEndTime?: (value: string | number | Date | null | undefined) => string
  formatLogDuration?: (logItem: DetailLogItem) => string
  handleDetailLaunchAction?: () => void | Promise<void>
  handleEditResource?: (resource: DetailSelectedResource) => void | Promise<void>
  handleOpenCategory?: (resource: DetailSelectedResource) => void | Promise<void>
  handleOpenVideoOrderDialog?: (resource: DetailSelectedResource) => void | Promise<void>
}

export interface ResourceEditorDrawerProps {
  show: boolean
  mode: 'add' | 'edit'
  categoryName: string
  categorySettings: CategorySettingsContract
  formData: ResourceEditorFormData
  formRules: Record<string, unknown>
  setFormRef?: ((instance: any) => void) | null
  setBasePathFormItemRef?: ((instance: any) => void) | null
  isNovelCategory: boolean
  isAudioCategory: boolean
  isSoftwareCategory: boolean
  detailIsAsmr: boolean
  actorFilterLabel: string
  authorInputPlaceholder: string
  descriptionLabel: string
  descriptionPlaceholder: string
  modelComponent?: Component | null
  modelComponentKey: string
  fetchResourceInfoLoading: boolean
  authorSelectOptions: SelectOptionLike[]
  tagSelectOptions: SelectOptionLike[]
  typeSelectOptions: SelectOptionLike[]
  createSelectOption?: ((value: string) => SelectOptionLike) | null
  coverPreviewSrc: string
  coverPreviewLabel: string
  videoCoverFrameLoading: boolean
  hasBasePath: boolean
  hasCoverPath: boolean
  editingResourceId: string
  duplicateResourceChecking?: boolean
  duplicateResourceMessage?: string
  duplicateResourceTitle?: string
}

export interface CategoryFilterPanelProps {
  showMissingFilter: boolean
  missingFile: boolean
  missingResourceCount: number
  favoriteOnly: boolean
  favoriteResourceCount: number
  showCompletedFilter: boolean
  completedOnly: boolean
  completedStateLabel: string
  completedResourceCount: number
  showRunningFilter: boolean
  runningOnly: boolean
  runningResourceCount: number
  filterSectionsStyle: Partial<CSSProperties>
  showAuthorFilter: boolean
  categorySettings: CategorySettingsContract
  authorSearch: string
  filteredAuthorList: FilterCountItem[]
  selectedAuthorList: string[]
  showActorFilter: boolean
  actorFilterLabel: string
  actorSearch: string
  filteredActorList: FilterCountItem[]
  selectedActorList: string[]
  isAudioCategory: boolean
  albumSearch: string
  filteredAlbumList: FilterCountItem[]
  selectedAlbumList: string[]
  tagSearch: string
  filteredTagList: FilterCountItem[]
  selectedTagList: string[]
  detailIsAsmr: boolean
  typeSearch: string
  filteredTypeList: FilterCountItem[]
  selectedTypeList: string[]
  showEngineFilter: boolean
  filteredEngineList: EngineFilterItem[]
  selectedEngineList: string[]
}
