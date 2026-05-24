<script setup lang="ts">
import { computed, defineAsyncComponent, h, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCheckbox, NDataTable, NDropdown, NIcon, NInput, NModal, NNumberAnimation, NPopconfirm, NPopover, NProgress, NRate, NSelect, NTag } from 'naive-ui'
import type { DataTableColumns, DataTableRowKey } from 'naive-ui'
import {
  AlertCircleOutline,
  ArchiveOutline,
  CubeOutline,
  DocumentOutline,
  FileTrayStackedOutline,
  FolderOpenOutline,
  LayersOutline,
  LogoWindows
} from '@vicons/ionicons5'
import { DictType, Settings } from '../../../../common/constants'
import BackgroundProgressToast from '../../components/BackgroundProgressToast.vue'
import CoverSelectorPanel from '../../components/CoverSelectorPanel.vue'
import { colorAlpha, twColor } from '../../utils/colors'
import { getAppPrimaryColor } from '../../theme/primary'
import { getWebsitePlaceholderEmoji } from '../../utils/website-placeholder-emoji'
import { confirmDialog, notify } from '../../utils/notification'
import { resolveCategoryProfile } from '../category-detail/profile-registry'
import { createEmptyMetaByType } from '../../components/meta/meta-factory'
import { useCategoryDetailFormatters } from '../category-detail/composables/useCategoryDetailFormatters'
import { useCategoryDetailPresentation } from '../category-detail/composables/useCategoryDetailPresentation'
import {
  normalizeCoverPreviewSource,
  normalizeWebsiteIconSource,
  resolveImagePreviewSource
} from '../../shared/preview/usePreviewAssetLoader'

type ModuleKey = 'issues' | 'tags' | 'archive'
type IssueTypeKey = 'all' | 'brokenPath' | 'missingCover' | 'longUnvisited' | 'duplicateResource' | 'ignored'
type BrokenPathSubtypeKey = 'all' | 'directoryMissing' | 'launchFileMissing'
type LongUnvisitedBucketKey = 'all' | 'over1Month' | 'threeToSixMonths' | 'sixToTwelveMonths' | 'overOneYear'
type IssueStatus = '待处理' | '已忽略'
type ActionButtonType = 'default' | 'primary' | 'warning' | 'error'

type ModuleCard = {
  key: ModuleKey
  eyebrow: string
  title: string
  metricValue: number
  metricValuePrecision?: number
  metricSuffix?: string
  metricSecondaryValue?: number
  metricSecondaryPrecision?: number
  metricSecondarySuffix?: string
  status: string
  hint: string
}

type IssueTab = {
  key: IssueTypeKey
  label: string
  count: number
}

type IssueAction = {
  label: string
  tone?: 'primary' | 'default' | 'warning' | 'error'
}

type IssueInsightCardTone = 'default' | 'primary' | 'warning' | 'error' | 'success'

type IssueInsightCard = {
  key: string
  label: string
  count: number
  summary: string
  action: string
  tone?: IssueInsightCardTone
}

type IssueRecord = {
  id: string
  resourceId: string
  title: string
  category: string
  categoryId: string
  categoryEmoji: string
  categoryColor: string
  coverPath?: string
  coverUrl?: string
  tags: string[]
  issueType: Exclude<IssueTypeKey, 'ignored' | 'all'>
  issueSubType?: Exclude<BrokenPathSubtypeKey, 'all'> | null
  longUnvisitedBucket?: Exclude<LongUnvisitedBucketKey, 'all'> | null
  issueSubTypeLabel?: string
  issueTypeLabel: string
  issueDetail: string
  currentRecordLabel?: string
  currentRecordPath?: string
  currentRecordDirectoryPath?: string
  resourcePath?: string
  recentAccess: string
  createdAt: string
  status: IssueStatus
  coverKind: 'broken' | 'missing' | 'idle' | 'duplicate' | 'ignored'
  coverLabel: string
  rating: string
  favorite: boolean
  actions: IssueAction[]
}

type DuplicateIssueGroup = {
  key: string
  title: string
  category: string
  categoryColor: string
  items: IssueRecord[]
}

type ArchivePackageRecord = {
  id: string
  resourceId: string
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  archivePath: string
  archiveFormat: string
  archiveLevel: number
  passwordEnabled?: boolean
  archivePassword?: string
  sourcePath: string
  sourceSize: number
  archiveSize: number
  status: string
  archivedAt: number | null
  items: Array<{
    resourceId: string
    title: string
    coverPath: string
    sourcePath: string
    categoryId: string
    categoryName: string
    categoryEmoji: string
    categoryColor: string
  }>
}

type ArchiveQueueRecord = {
  id: string
  operation?: 'archive' | 'restore'
  archiveId?: string
  resourceId: string
  resourceIds?: string[]
  title: string
  coverPath: string
  sourcePath: string
  sourcePaths?: string[]
  archivePath: string
  archiveFormat: string
  status: string
  progress: number
  currentIndex: number
  totalCount: number
  message: string
  errorMessage: string
  createdAt: number | null
  startedAt: number | null
  finishedAt: number | null
}

type GovernanceWorkbenchResponse = {
  summary: {
    allIssueCount?: number
    brokenPathCount: number
    missingCoverCount: number
    longUnvisitedCount: number
    duplicateResourceCount?: number
    ignoredCount: number
    totalTagCount: number
    totalTypeCount?: number
    totalCategoryCount: number
    archiveCandidateCount: number
    archivePackageCount?: number
    archiveStorageSizeBytes?: number
  }
  tabs: IssueTab[]
  brokenPathSubTabs?: Array<{ key: BrokenPathSubtypeKey; label: string; count: number }>
  longUnvisitedSubTabs?: Array<{ key: LongUnvisitedBucketKey; label: string; count: number }>
  filters: {
    categories: Array<{ label: string; value: string }>
    tags: Array<{ label: string; value: string }>
  }
  items: IssueRecord[]
}

type TagWorkbenchViewKey = 'tags' | 'types'

type TagWorkbenchEntityRecord = {
  id: string
  name: string
  categoryId: string
  categoryName: string
  categoryEmoji?: string
  categoryColor?: string
  resourceCount: number
}

type TagWorkbenchEntityKind = 'tag' | 'type'

type GovernanceTagWorkbenchResponse = {
  summary: {
    totalTagCount: number
    totalTypeCount: number
    unusedTagCount: number
    unusedTypeCount: number
  }
  filters: {
    categories: Array<{ label: string; value: string }>
  }
  tags: TagWorkbenchEntityRecord[]
  types: TagWorkbenchEntityRecord[]
}

const ResourceDetailDrawer = defineAsyncComponent(() => import('../category-detail/components/ResourceDetailDrawer.vue'))
const AudioCoverCandidateModal = defineAsyncComponent(() => import('../category-detail/components/AudioCoverCandidateModal.vue'))
const VideoCoverCandidateModal = defineAsyncComponent(() => import('../category-detail/components/VideoCoverCandidateModal.vue'))
const VideoSubCoverCandidateModal = defineAsyncComponent(() => import('../category-detail/components/VideoSubCoverCandidateModal.vue'))

const ratingOptions = [
  { label: '全部评分', value: 'all' },
  { label: '4 分及以上', value: '4+' },
  { label: '3 分及以上', value: '3+' },
  { label: '3 分以下', value: '0-3' }
]

const sortOptions = [
  { label: '按优先级', value: 'priority' },
  { label: '按最近访问', value: 'recent' },
  { label: '按创建时间', value: 'created' }
]

const archiveDataTableScrollbarProps = {
  trigger: 'none' as const
}

const getArchiveFormatVisual = (format: string) => {
  const normalized = String(format ?? '').trim().toLowerCase()

  switch (normalized) {
    case 'zip':
      return { label: 'ZIP', icon: ArchiveOutline, className: 'zip' }
    case '7z':
      return { label: '7Z', icon: LayersOutline, className: 'seven-z' }
    case 'tar':
      return { label: 'TAR', icon: FolderOpenOutline, className: 'tar' }
    case 'xz':
      return { label: 'XZ', icon: CubeOutline, className: 'xz' }
    case 'tar.xz':
      return { label: 'TAR.XZ', icon: CubeOutline, className: 'tar-xz' }
    case 'exe':
      return { label: 'EXE', icon: LogoWindows, className: 'exe' }
    default:
      return {
        label: normalized ? normalized.toUpperCase() : 'FILE',
        icon: DocumentOutline,
        className: 'default'
      }
  }
}

const getArchiveLevelLabel = (archiveLevel: number) => {
  const normalizedLevel = Math.max(0, Math.min(9, Number(archiveLevel ?? 0)))
  if (normalizedLevel <= 1) return `${normalizedLevel} - 仅存储`
  if (normalizedLevel <= 3) return `${normalizedLevel} - 快速压缩`
  if (normalizedLevel <= 6) return `${normalizedLevel} - 标准压缩`
  if (normalizedLevel <= 8) return `${normalizedLevel} - 最大压缩`
  return `${normalizedLevel} - 极限压缩`
}

const injectedIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))
const isDark = computed(() => Boolean(injectedIsDark.value))
const appPrimaryColor = inject<ComputedRef<string>>('appPrimaryColor', computed(() => getAppPrimaryColor(isDark.value)))
const router = useRouter()
const {
  formatVideoFrameTime,
  formatDateTime,
  formatDuration,
  formatLogEndTime,
  formatLogDuration,
  formatLaunchMode,
  getRatingEmoji,
  getRatingComment
} = useCategoryDetailFormatters()

const activeModule = ref<ModuleKey>('issues')
const activeIssueTab = ref<IssueTypeKey>('all')
const activeBrokenPathSubtype = ref<BrokenPathSubtypeKey>('all')
const activeLongUnvisitedBucket = ref<LongUnvisitedBucketKey>('all')
const searchKeyword = ref('')
const selectedCategory = ref<string>('all')
const selectedRating = ref<string>('all')
const selectedSort = ref<'priority' | 'recent' | 'created'>('priority')
const onlyFavorite = ref(false)
const selectedIssueIds = ref<string[]>([])
const showRelocateModal = ref(false)
const relocateSaving = ref(false)
const relocateSelecting = ref(false)
const showCoverPickerModal = ref(false)
const coverPickerSaving = ref(false)
const coverPickerActionLoading = ref(false)
const coverPickerVideoFrameLoading = ref(false)
const relocateTargetItem = ref<IssueRecord | null>(null)
const relocateTargetPath = ref('')
const coverPickerItem = ref<IssueRecord | null>(null)
const coverPickerCategory = ref<any>(null)
const coverPickerResourceDetail = ref<any>(null)
const coverPickerFormData = ref<any | null>(null)
const coverPickerPreviewSrc = ref('')
const showGovernanceAudioCoverCandidateModal = ref(false)
const showGovernanceVideoCoverCandidateModal = ref(false)
const showGovernanceVideoSubCoverCandidateModal = ref(false)
const governanceAudioCoverCandidates = ref<Array<{ label: string; coverPath: string; previewSrc: string; queryText: string }>>([])
const governanceVideoCoverCandidates = ref<Array<{ label: string; coverPath: string; previewSrc: string; time: number; group: 'fixed' | 'random' }>>([])
const governanceVideoSubCoverCandidateItems = ref<Array<{
  fileName: string
  relativePath: string
  candidates: Array<{ label: string; coverPath: string; previewSrc: string; time: number }>
}>>([])
const loading = ref(false)
const showDetailDrawer = ref(false)
const detailDrawerWidth = ref(500)
const selectedDetailResource = ref<any | null>(null)
const detailCategory = ref<any | null>(null)
const detailEngineList = ref<any[]>([])
const detailEngineOptionList = ref<any[]>([])
const detailLanguageOptions = ref<any[]>([])
const detailCoverPreviewSrc = ref('')
const detailWebsiteFaviconSrc = ref('')
const detailRatingDraft = ref(-1)
const detailVisibleLogCount = ref(5)
const detailCurrentScreenshotIndex = ref(0)
const detailAudioTree = ref<any[]>([])
const detailAudioTreeLoading = ref(false)
const detailAudioContextMenuVisible = ref(false)
const isResizingDetailDrawer = ref(false)
const detailDrawerResizeStartX = ref(0)
const detailDrawerResizeStartWidth = ref(500)
const showDeleteScreenshotConfirm = ref(false)
const detailGalleryImageUrls = ref<Record<string, string>>({})
const detailScreenshotPaths = ref<string[]>([])
let detailRequestToken = 0

const workbenchSummary = ref<GovernanceWorkbenchResponse['summary']>({
  allIssueCount: 0,
  brokenPathCount: 0,
  missingCoverCount: 0,
  longUnvisitedCount: 0,
  duplicateResourceCount: 0,
  ignoredCount: 0,
  totalTagCount: 0,
  totalTypeCount: 0,
  totalCategoryCount: 0,
  archiveCandidateCount: 0,
  archivePackageCount: 0,
  archiveStorageSizeBytes: 0
})
const issueTabs = ref<IssueTab[]>([
  { key: 'all', label: '全部', count: 0 },
  { key: 'brokenPath', label: '路径失效', count: 0 },
  { key: 'missingCover', label: '封面缺失', count: 0 },
  { key: 'longUnvisited', label: '沉睡资源', count: 0 },
  { key: 'duplicateResource', label: '疑似重复', count: 0 },
  { key: 'ignored', label: '已忽略问题', count: 0 }
])
const brokenPathSubTabs = ref<Array<{ key: BrokenPathSubtypeKey; label: string; count: number }>>([
  { key: 'all', label: '全部', count: 0 },
  { key: 'directoryMissing', label: '目录失效', count: 0 },
  { key: 'launchFileMissing', label: '启动文件丢失', count: 0 }
])
const longUnvisitedSubTabs = ref<Array<{ key: LongUnvisitedBucketKey; label: string; count: number }>>([
  { key: 'all', label: '全部', count: 0 },
  { key: 'over1Month', label: '超 1 个月', count: 0 },
  { key: 'threeToSixMonths', label: '3 - 6 个月', count: 0 },
  { key: 'sixToTwelveMonths', label: '6 - 12 个月', count: 0 },
  { key: 'overOneYear', label: '1 年以上', count: 0 }
])
const categoryOptions = ref<Array<{ label: string; value: string }>>([{ label: '全部分类', value: 'all' }])
const issueRecords = ref<IssueRecord[]>([])
let governanceRequestToken = 0
const tagWorkbenchLoading = ref(false)
const tagWorkbenchKeyword = ref('')
const tagWorkbenchCategory = ref('all')
const tagWorkbenchView = ref<TagWorkbenchViewKey>('tags')
const selectedTagEntityIds = ref<string[]>([])
const tagEntityBatchDeleting = ref(false)
const tagEntityRenameVisible = ref(false)
const tagEntityRenameSaving = ref(false)
const tagEntityRenameTarget = ref<TagWorkbenchEntityRecord | null>(null)
const tagEntityRenameKind = ref<TagWorkbenchEntityKind>('tag')
const tagEntityRenameDraft = ref('')
const tagWorkbench = ref<GovernanceTagWorkbenchResponse>({
  summary: {
    totalTagCount: 0,
    totalTypeCount: 0,
    unusedTagCount: 0,
    unusedTypeCount: 0
  },
  filters: {
    categories: [{ label: '全部分类', value: 'all' }]
  },
  tags: [],
  types: []
})
let tagWorkbenchRequestToken = 0

const normalizeAudioAuthorList = (values: string[]) => {
  const normalizedValues: string[] = []
  const seen = new Set<string>()

  for (const value of values ?? []) {
    const rawText = String(value ?? '').trim()
    if (!rawText) {
      continue
    }

    const splitValues = rawText
      .split(/\s*(?:\/|／|,|，|、|;|；|\||·| feat\. | ft\. | featuring | with | x | × | & | ＆ )\s*/i)
      .map((item) => item.trim())
      .filter(Boolean)

    for (const splitValue of splitValues) {
      const normalizedKey = splitValue.toLowerCase()
      if (seen.has(normalizedKey)) {
        continue
      }

      seen.add(normalizedKey)
      normalizedValues.push(splitValue)
    }
  }

  return normalizedValues
}

const joinAudioAuthorNames = (names: string[]) => normalizeAudioAuthorList(names).join(' / ')

const buildDisplayBasePath = (resource: any) => {
  const basePath = String(resource?.basePath ?? '')
  const fileName = String(resource?.fileName ?? resource?.filename ?? '')

  if (!basePath) {
    return ''
  }

  if (!fileName) {
    return basePath
  }

  return `${basePath.replace(/[\\/]+$/, '')}\\${fileName}`
}

const mapGovernanceResourceDetailToFormData = (resource: any, categoryInfo: any) => {
  const pickFirstNonEmptyString = (...values: any[]) => {
    for (const value of values) {
      const normalized = String(value ?? '').trim()
      if (normalized) {
        return normalized
      }
    }

    return ''
  }

  const extendTable = String(categoryInfo?.extendTable ?? categoryInfo?.meta?.extra?.extendTable ?? '').trim()
  const authorNames = Array.isArray(resource?.authors)
    ? resource.authors.map((item: any) => String(item?.name ?? '')).filter(Boolean)
    : []
  const stores = Array.isArray(resource?.stores) ? resource.stores : []
  const pixivStore = stores.find((item: any) => String(item?.store?.value ?? '').trim().toLowerCase() === 'pixiv')
  const primaryStore = stores.find((item: any) => String(item?.id ?? '') !== String(pixivStore?.id ?? '')) ?? stores[0]
  const additionalStores = stores.filter((item: any) => {
    const itemId = String(item?.id ?? '')
    const primaryStoreId = String(primaryStore?.id ?? '')
    const pixivStoreId = String(pixivStore?.id ?? '')
    return itemId && itemId !== primaryStoreId && itemId !== pixivStoreId
  })

  return {
    name: resource?.title ?? '',
    description: resource?.description ?? '',
    coverPath: resource?.coverPath ?? '',
    basePath: buildDisplayBasePath(resource),
    categoryId: String(resource?.categoryId ?? categoryInfo?.id ?? ''),
    author: joinAudioAuthorNames(authorNames) || String(resource?.audioMeta?.artist ?? ''),
    authors: extendTable === 'audio_meta' ? authorNames : [],
    actors: Array.isArray(resource?.actors) ? resource.actors.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
    tags: Array.isArray(resource?.tags) ? resource.tags.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
    types: Array.isArray(resource?.types) ? resource.types.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
    meta: {
      ...createEmptyMetaByType(extendTable),
      ...(resource?.gameMeta ?? {}),
      ...(resource?.softwareMeta ?? {}),
      ...(resource?.singleImageMeta ?? {}),
      ...(resource?.multiImageMeta ?? {}),
      ...(resource?.videoMeta ?? {}),
      ...(resource?.asmrMeta ?? {}),
      ...(resource?.audioMeta ?? {}),
      ...(resource?.novelMeta ?? {}),
      ...(resource?.websiteMeta ?? {}),
      pixivId: String(pixivStore?.workId ?? ''),
      websiteType: pickFirstNonEmptyString(
        primaryStore?.storeId,
        resource?.gameMeta?.websiteType,
        resource?.asmrMeta?.websiteType,
        resource?.multiImageMeta?.websiteType,
        resource?.singleImageMeta?.websiteType
      ),
      gameId: pickFirstNonEmptyString(
        primaryStore?.workId,
        resource?.gameMeta?.gameId,
        resource?.asmrMeta?.gameId,
        resource?.multiImageMeta?.gameId,
        resource?.singleImageMeta?.gameId
      ),
      website: pickFirstNonEmptyString(
        resource?.websiteMeta?.url,
        primaryStore?.url,
        resource?.gameMeta?.website,
        resource?.asmrMeta?.website,
        resource?.multiImageMeta?.website,
        resource?.singleImageMeta?.website
      ),
      additionalStores: additionalStores.map((item: any) => ({
        websiteType: String(item?.storeId ?? ''),
        workId: String(item?.workId ?? ''),
        website: String(item?.url ?? '')
      }))
    }
  }
}

const detailCategoryName = computed(() =>
  String(detailCategory.value?.name ?? selectedDetailResource.value?.categoryName ?? '').trim() || '资源'
)
const getFallbackAuthorText = (extendTable: string) => {
  switch (String(extendTable ?? '').trim()) {
    case 'game_meta':
      return '开发商/社团'
    case 'audio_meta':
      return '艺术家'
    case 'website_meta':
      return '站点'
    default:
      return '作者'
  }
}
const resolveGovernanceCategorySettings = (categoryInput: any) => {
  const category = categoryInput ?? {}
  const categoryExtra = category?.meta?.extra ?? {}
  const extendTable = String(category?.extendTable ?? categoryExtra?.extendTable ?? '').trim()

  return {
    ...category,
    meta: category?.meta,
    extendTable,
    resourcePathType: String(category?.resourcePathType ?? categoryExtra?.resourcePathType ?? '').trim(),
    startText: String(category?.startText ?? categoryExtra?.startText ?? '').trim(),
    authorText: String(category?.authorText ?? categoryExtra?.authorText ?? '').trim() || getFallbackAuthorText(extendTable)
  }
}
const detailCategorySettings = computed(() => resolveGovernanceCategorySettings(detailCategory.value))
const detailCategoryProfile = computed(() => resolveCategoryProfile(detailCategorySettings.value))
const detailActorFilterLabel = computed(() => detailCategoryProfile.value.flags.isAsmr ? '声优' : '声优/演员')
const detailIsWebsite = computed(() => detailCategoryProfile.value.flags.isWebsite)
const detailIsSoftware = computed(() => detailCategoryProfile.value.flags.isSoftware)
const detailIsManga = computed(() => detailCategoryProfile.value.flags.isManga)
const detailIsAsmr = computed(() => detailCategoryProfile.value.flags.isAsmr)
const detailIsAudio = computed(() => detailCategoryProfile.value.flags.isAudio)
const detailIsNovel = computed(() => detailCategoryProfile.value.flags.isNovel)
const detailIsVideoCategory = computed(() => detailCategoryProfile.value.flags.isVideo)
const detailIsVideoFolderCategory = computed(() => detailCategoryProfile.value.flags.isVideoFolder)
const detailStartText = computed(() => detailCategoryProfile.value.labels.startText)
const detailStats = computed(() => selectedDetailResource.value?.stats ?? null)
const detailLogs = computed(() => Array.isArray(selectedDetailResource.value?.logs) ? selectedDetailResource.value.logs : [])
const visibleDetailLogs = computed(() => detailLogs.value.slice(0, detailVisibleLogCount.value))
const hasMoreDetailLogs = computed(() => detailVisibleLogCount.value < detailLogs.value.length)
const noMore = computed(() => detailLogs.value.length > 5 && !hasMoreDetailLogs.value)
const detailWebsiteUrl = computed(() =>
  String(selectedDetailResource.value?.websiteMeta?.url ?? selectedDetailResource.value?.url ?? '').trim()
)
const detailWebsiteIsDownloadLink = computed(() => Boolean(
  selectedDetailResource.value?.websiteMeta?.isDownloadLink
  ?? selectedDetailResource.value?.meta?.isDownloadLink
))
const detailWebsiteAddressLabel = computed(() => detailWebsiteIsDownloadLink.value ? '下载地址' : '网站地址')
const detailWebsiteIconLabel = computed(() => detailWebsiteIsDownloadLink.value ? '链接图标' : '站点图标')
const detailWebsitePlaceholderEmoji = computed(() =>
  getWebsitePlaceholderEmoji(
    selectedDetailResource.value?.id,
    detailWebsiteUrl.value,
    detailWebsiteIsDownloadLink.value
  )
)
const detailWebsiteCoverPlaceholderText = computed(() => detailWebsiteIsDownloadLink.value ? '下载链接' : '网站封面')
const detailOpenFolderText = computed(() =>
  detailIsWebsite.value ? `打开${detailCategoryName.value}` : `打开${detailCategoryName.value}文件夹`
)
const detailStores = computed(() =>
  Array.isArray(selectedDetailResource.value?.stores)
    ? selectedDetailResource.value.stores
      .filter((item: any) => !item?.isDeleted && item?.store)
      .map((item: any) => ({
        id: String(item?.id ?? `${item?.storeId}-${item?.workId}`),
        name: String(item?.store?.name ?? ''),
        icon: '',
        url: String(item?.url ?? '')
      }))
      .filter((item: any) => item.name)
    : []
)
const detailNormalizedEngineList = computed(() =>
  detailEngineList.value
    .map((item: any) => ({
      id: String(item?.id ?? item?.value ?? '').trim(),
      name: String(item?.name ?? item?.label ?? '').trim(),
      icon: ''
    }))
    .filter((item: any) => item.id && item.name)
)
const detailNormalizedEngineOptionList = computed(() =>
  detailEngineOptionList.value
    .map((option: any) => ({
      id: String(option?.value ?? '').trim(),
      name: String(option?.label ?? '').trim(),
      icon: ''
    }))
    .filter((item: any) => item.id && item.name)
)
const detailNormalizedLanguageList = computed(() =>
  detailLanguageOptions.value
    .map((item: any) => ({
      id: String(item?.value ?? item?.id ?? '').trim(),
      name: String(item?.label ?? item?.name ?? '').trim()
    }))
    .filter((item: any) => item.id && item.name)
)
const detailCategoryDescriptionBoxStyle = computed(() => ({ height: 'auto' }))
const buildDisplayDirectoryPath = (resource: any) => String(resource?.basePath ?? '').trim()
const {
  detailStatsText,
  detailShowTotalRuntime,
  detailPreviewSectionTitle,
  detailGallerySectionTitle,
  detailDirectorySectionTitle,
  detailDirectoryEmptyText,
  detailEmptyLogDescription,
  detailLogModeLabel,
  detailLogDurationLabel,
  detailShowLogs,
  hasDetailDescription,
  detailReadingProgressText,
  detailPlaybackProgressText,
  detailGalleryItems,
  detailMetaItems,
  detailDisplayPath
} = useCategoryDetailPresentation({
  selectedDetailResource,
  categoryName: detailCategoryName,
  categorySettings: detailCategorySettings,
  categoryProfile: detailCategoryProfile,
  actorFilterLabel: detailActorFilterLabel,
  detailIsManga,
  detailIsAsmr,
  detailIsAudio,
  detailIsNovel,
  detailIsWebsite,
  isVideoCategory: detailIsVideoCategory,
  detailScreenshotPaths,
  detailGalleryImageUrls,
  detailWebsiteAddressLabel,
  detailWebsiteIconLabel,
  detailWebsiteIsDownloadLink,
  detailWebsitePlaceholderEmoji,
  detailWebsiteFaviconSrc,
  detailWebsiteUrl,
  normalizedEngineList: detailNormalizedEngineList,
  normalizedEngineOptionList: detailNormalizedEngineOptionList,
  normalizedLanguageList: detailNormalizedLanguageList,
  normalizeWebsiteIconSource,
  formatDuration,
  formatAsmrDuration: formatDuration,
  formatAudioBitrate: (value) => {
    const normalized = Number(value ?? 0)
    return Number.isFinite(normalized) && normalized > 0 ? `${Math.round(normalized / 1000)} kbps` : '未知'
  },
  formatAudioSampleRate: (value) => {
    const normalized = Number(value ?? 0)
    return Number.isFinite(normalized) && normalized > 0 ? `${normalized} Hz` : '未知'
  },
  buildDisplayBasePath: buildDisplayDirectoryPath
})
const ratingComment = computed(() => getRatingComment(detailRatingDraft.value))
const hasPendingRatingChange = computed(() => {
  if (!selectedDetailResource.value) {
    return false
  }

  return Number(selectedDetailResource.value.rating ?? -1) !== Number(detailRatingDraft.value)
})
const detailCanLaunch = computed(() => false)
const detailCanStop = computed(() => false)
const coverPickerCategorySettings = computed(() => resolveGovernanceCategorySettings(coverPickerCategory.value))
const coverPickerCategoryProfile = computed(() => resolveCategoryProfile(coverPickerCategorySettings.value))
const coverPickerExtendTable = computed(() => String(coverPickerCategorySettings.value.extendTable ?? '').trim())
const coverPickerIsWebsiteCategory = computed(() => coverPickerCategoryProfile.value.flags.isWebsite)
const coverPickerIsVideoFolderCategory = computed(() => coverPickerCategoryProfile.value.flags.isVideoFolder)
const showGovernanceWebsiteCoverFetchButton = computed(() => coverPickerIsWebsiteCategory.value)
const showGovernanceScreenshotCoverButton = computed(() => ![
  'software_meta',
  'multi_image_meta',
  'asmr_meta',
  'audio_meta',
  'novel_meta',
  'video_meta',
  'website_meta'
].includes(coverPickerExtendTable.value))
const showGovernanceScreenshotFolderButton = computed(() => ![
  'software_meta',
  'audio_meta',
  'multi_image_meta',
  'asmr_meta',
  'novel_meta',
  'website_meta'
].includes(coverPickerExtendTable.value))
const coverPickerPreviewLabel = computed(() => {
  const coverPath = String(coverPickerFormData.value?.coverPath ?? '').trim()
  return coverPath || '暂未设置封面'
})
const coverPickerHasBasePath = computed(() => Boolean(String(coverPickerFormData.value?.basePath ?? '').trim()))
const coverPickerHasCoverPath = computed(() => Boolean(String(coverPickerFormData.value?.coverPath ?? '').trim()))
const coverPickerEditingResourceId = computed(() => String(coverPickerItem.value?.resourceId ?? '').trim())
const coverPickerResourceMissing = computed(() => Boolean(coverPickerResourceDetail.value?.missingStatus))

const pageStyle = computed(() => ({
  backgroundColor: injectedIsDark.value ? '#121212' : '#f7f8fa',
  color: injectedIsDark.value ? 'rgba(255, 255, 245, 0.86)' : '#1f2329'
}))

const topThemeTokens = computed(() => {
  const primary = appPrimaryColor.value

  if (isDark.value) {
    return {
      panelBg: twColor('neutral', 900),
      panelBgSubtle: twColor('neutral', 875),
      elevatedBg: twColor('neutral', 850),
      border: twColor('neutral', 800),
      borderSubtle: colorAlpha(twColor('neutral', 750), 0.45),
      textStrong: twColor('neutral', 275),
      text: twColor('neutral', 375),
      textMuted: twColor('neutral', 450),
      textFaint: twColor('neutral', 575),
      primary,
      primarySoft: colorAlpha(primary, 0.2),
      primaryFocus: colorAlpha(primary, 0.34),
      primaryText: twColor('neutral', 950),
      success: twColor('lime', 600),
      successSoft: colorAlpha(twColor('lime', 600), 0.18),
      warning: twColor('amber', 600),
      warningSoft: colorAlpha(twColor('amber', 600), 0.18),
      error: twColor('rose', 600),
      errorSoft: colorAlpha(twColor('rose', 600), 0.18),
      info: twColor('sky', 600),
      infoSoft: colorAlpha(twColor('sky', 600), 0.18),
      secondaryButtonBg: '#1f2430',
      secondaryButtonText: '#dce3ef',
      actionButtonBorder: 'rgba(255, 255, 255, 0.08)',
      shadowMedium: '0 14px 34px rgba(0, 0, 0, 0.18)'
    }
  }

  return {
    panelBg: twColor('neutral', 25),
    panelBgSubtle: twColor('neutral', 50),
    elevatedBg: twColor('neutral', 75),
    border: twColor('neutral', 150),
    borderSubtle: twColor('neutral', 175),
    textStrong: twColor('neutral', 800),
    text: twColor('neutral', 700),
    textMuted: twColor('neutral', 500),
    textFaint: twColor('neutral', 400),
    primary,
    primarySoft: colorAlpha(primary, 0.14),
    primaryFocus: colorAlpha(primary, 0.24),
    primaryText: twColor('neutral', 25),
    success: twColor('lime', 500),
    successSoft: colorAlpha(twColor('lime', 500), 0.14),
    warning: twColor('amber', 500),
    warningSoft: colorAlpha(twColor('amber', 500), 0.16),
    error: twColor('rose', 500),
    errorSoft: colorAlpha(twColor('rose', 500), 0.14),
    info: twColor('sky', 500),
    infoSoft: colorAlpha(twColor('sky', 500), 0.14),
    secondaryButtonBg: twColor('neutral', 100),
    secondaryButtonText: twColor('neutral', 700),
    actionButtonBorder: 'rgba(15, 23, 42, 0.12)',
    shadowMedium: '0 14px 34px rgba(15, 23, 42, 0.10)'
  }
})

const defaultArchiveCategoryPillColor = '#737373'

const getCategoryPillStyle = (categoryColor?: string) => {
  const normalizedColor = String(categoryColor ?? '').trim() || defaultArchiveCategoryPillColor
  return {
    backgroundColor: colorAlpha(normalizedColor, isDark.value ? 0.2 : 0.14),
    color: normalizedColor
  }
}

const renderCategoryPill = (name: string, emoji?: string, categoryColor?: string) => {
  const pillStyle = getCategoryPillStyle(categoryColor)
  const displayName = String(name ?? '').trim() || '未分类'

  return h(
    'div',
    {
      title: displayName,
      style: {
        display: 'inline-flex',
        minHeight: '30px',
        maxWidth: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        padding: '0 12px',
        borderRadius: '999px',
        border: '0',
        whiteSpace: 'nowrap',
        lineHeight: '1',
        fontSize: '12px',
        fontWeight: '800',
        color: pillStyle.color,
        backgroundColor: pillStyle.backgroundColor
      }
    },
    [
      emoji
        ? h(
            'span',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
                lineHeight: '1'
              }
            },
            emoji
          )
        : null,
      h(
        'span',
        {
          style: {
            display: 'inline-block',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: '1',
            fontWeight: '800'
          }
        },
        displayName
      )
    ]
  )
}

const heroBackground = computed(() => topThemeTokens.value.panelBg)
const cardBackground = computed(() => topThemeTokens.value.panelBg)
const subtleBackground = computed(() => topThemeTokens.value.panelBgSubtle)
const elevatedBackground = computed(() => topThemeTokens.value.elevatedBg)
const activeCardBackground = computed(() => topThemeTokens.value.primarySoft)
const borderColor = computed(() => topThemeTokens.value.border)
const borderSubtleColor = computed(() => topThemeTokens.value.borderSubtle)
const activeBorderColor = computed(() => colorAlpha(topThemeTokens.value.primary, isDark.value ? 0.32 : 0.22))
const titleColor = computed(() => topThemeTokens.value.textStrong)
const textColor = computed(() => topThemeTokens.value.text)
const mutedTextColor = computed(() => topThemeTokens.value.textMuted)
const softTextColor = computed(() => topThemeTokens.value.textFaint)
const heroShadow = computed(() => topThemeTokens.value.shadowMedium)
const activeShadow = computed(() => `inset 0 0 0 1px ${colorAlpha(topThemeTokens.value.primary, isDark.value ? 0.12 : 0.08)}`)
const archiveStorageSizeGb = computed(() => {
  const bytes = Math.max(0, Number(workbenchSummary.value.archiveStorageSizeBytes ?? 0))
  return Math.round((bytes / (1024 ** 3)) * 100) / 100
})

const modules = computed<ModuleCard[]>(() => [
  {
    key: 'issues',
    eyebrow: '当前模块',
    title: '问题资源管理',
    metricValue: Number(workbenchSummary.value.allIssueCount ?? 0),
    status: '',
    hint: `封面缺失 ${workbenchSummary.value.missingCoverCount} · 长期未访问 ${workbenchSummary.value.longUnvisitedCount} · 疑似重复 ${workbenchSummary.value.duplicateResourceCount ?? 0}`
  },
  {
    key: 'tags',
    eyebrow: '组织结构',
    title: '标签 / 分类管理',
    metricValue: Number(workbenchSummary.value.totalTagCount ?? 0),
    metricSuffix: '标签',
    metricSecondaryValue: Number(workbenchSummary.value.totalTypeCount ?? 0),
    metricSecondarySuffix: '分类',
    status: '',
    hint: '管理标签与分类的使用关系'
  },
  {
    key: 'archive',
    eyebrow: '存储治理',
    title: '归档包管理',
    metricValue: Number(workbenchSummary.value.archivePackageCount ?? 0),
    metricSuffix: '已归档包',
    metricSecondaryValue: archiveStorageSizeGb.value,
    metricSecondaryPrecision: 2,
    metricSecondarySuffix: 'GB 归档包占用',
    status: '',
    hint: '统一管理归档包、恢复解压与删除'
  }
])

const tagWorkbenchViewOptions = computed(() => [
  { key: 'tags' as const, label: '标签管理', count: tagWorkbench.value.tags.length },
  { key: 'types' as const, label: '分类管理', count: tagWorkbench.value.types.length }
])

const tagWorkbenchCategoryOptions = computed(() => tagWorkbench.value.filters.categories.length
  ? tagWorkbench.value.filters.categories
  : [{ label: '全部分类', value: 'all' }]
)

const tagWorkbenchSummaryCards = computed(() => [
  {
    label: '标签',
    value: tagWorkbench.value.summary.totalTagCount,
    hint: `${tagWorkbench.value.summary.unusedTagCount} 个标签当前未使用`
  },
  {
    label: '分类',
    value: tagWorkbench.value.summary.totalTypeCount,
    hint: `${tagWorkbench.value.summary.unusedTypeCount} 个分类当前未使用`
  }
])

const currentTagEntityKind = computed<TagWorkbenchEntityKind>(() => tagWorkbenchView.value === 'tags' ? 'tag' : 'type')

const matchTagWorkbenchKeyword = (...values: Array<string | number | null | undefined>) => {
  const keyword = tagWorkbenchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return true
  }

  return values.some((value) => String(value ?? '').toLowerCase().includes(keyword))
}

const filteredTagWorkbenchTags = computed(() => {
  const selectedCategory = String(tagWorkbenchCategory.value ?? 'all')
  return tagWorkbench.value.tags.filter((item) => {
    if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
      return false
    }

    return matchTagWorkbenchKeyword(item.name, item.categoryName, item.resourceCount)
  })
})

const filteredTagWorkbenchTypes = computed(() => {
  const selectedCategory = String(tagWorkbenchCategory.value ?? 'all')
  return tagWorkbench.value.types.filter((item) => {
    if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
      return false
    }

    return matchTagWorkbenchKeyword(item.name, item.categoryName, item.resourceCount)
  })
})

const currentTagEntityRows = computed(() => tagWorkbenchView.value === 'tags'
  ? filteredTagWorkbenchTags.value
  : filteredTagWorkbenchTypes.value
)

const selectedTagEntityRecords = computed(() => {
  const selectedIds = new Set(selectedTagEntityIds.value)
  return currentTagEntityRows.value.filter((item) => selectedIds.has(item.id))
})

const unusedCurrentTagEntityRecords = computed(() => currentTagEntityRows.value.filter((item) => Number(item.resourceCount ?? 0) <= 0))

const archiveCategoryOptions = computed(() => {
  const categoryNames = Array.from(new Set(
    archivePackages.value
      .map((item) => String(item.categoryName ?? '').trim())
      .filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))

  return [{ label: '全部分类', value: 'all' }, ...categoryNames.map((name) => ({ label: name, value: name }))]
})

const archiveFormatOptions = computed(() => {
  const formatNames = Array.from(new Set(
    archivePackages.value
      .map((item) => String(item.archiveFormat ?? '').trim().toLowerCase())
      .filter(Boolean)
  )).sort((left, right) => left.localeCompare(right))

  return [{ label: '全部格式', value: 'all' }, ...formatNames.map((name) => ({ label: name.toUpperCase(), value: name }))]
})

const filteredArchivePackages = computed(() => {
  const keyword = archiveFilterKeyword.value.trim().toLowerCase()
  const selectedArchiveCategory = String(archiveFilterCategory.value ?? 'all').trim()
  const selectedArchiveFormat = String(archiveFilterFormat.value ?? 'all').trim().toLowerCase()

  return archivePackages.value.filter((item) => {
    if (selectedArchiveCategory !== 'all' && item.categoryName !== selectedArchiveCategory) {
      return false
    }
    if (selectedArchiveFormat !== 'all' && String(item.archiveFormat ?? '').trim().toLowerCase() !== selectedArchiveFormat) {
      return false
    }
    if (!keyword) {
      return true
    }

    const searchText = [
      item.title,
      item.categoryName,
      item.archiveFormat,
      item.archivePath,
      item.sourcePath
    ].join(' ').toLowerCase()
    return searchText.includes(keyword)
  })
})

const archiveRunningQueueItem = computed(() => archiveQueueItems.value.find((item) => item.status === 'running') ?? null)
const archiveQueuedCount = computed(() => archiveQueueItems.value.filter((item) => item.status === 'queued').length)
const archiveQueueCount = computed(() => archiveQueueItems.value.length)
const archiveCompletedQueueItems = computed(() => archiveQueueItems.value.filter((item) => item.status === 'completed'))
const archiveCompletedQueueCount = computed(() => archiveCompletedQueueItems.value.length)
const archiveRunningOperation = computed<'archive' | 'restore'>(() =>
  String(archiveRunningQueueItem.value?.operation ?? 'archive') === 'restore' ? 'restore' : 'archive'
)
const archiveRunningEyebrow = computed(() => archiveRunningOperation.value === 'restore' ? '还原进行中' : '归档进行中')
const archiveStopActionLabel = computed(() => archiveRunningOperation.value === 'restore' ? '停止还原' : '停止归档')
const archiveQueuedHintLabel = computed(() => archiveRunningOperation.value === 'restore' ? '项还原任务排队中' : '项排队中')
const issueStats = computed(() => {
  const currentCount = issueRecords.value.length
  const ignoredCount = issueRecords.value.filter((item) => item.status === '已忽略').length
  const actionableCount = issueRecords.value.filter((item) => item.actions.length > 2).length
  const selectedCount = selectedIssueIds.value.length

  return { currentCount, ignoredCount, actionableCount, selectedCount }
})

const selectedIssueRecords = computed(() =>
  issueRecords.value.filter((item) => selectedIssueIds.value.includes(item.id))
)
const selectedArchivePackageIds = ref<string[]>([])
const everythingEnabled = ref(false)
const archivePathConfigured = ref(false)
const rescanningIssueIds = ref<string[]>([])
const archivingIssueIds = ref<string[]>([])
const batchRescanning = ref(false)
const batchArchiving = ref(false)
const archiveProgressToastVisible = ref(false)
const archiveProgressToastDismissed = ref(false)
const archiveProgressPercent = ref(0)
const archiveProgressTitle = ref('')
const archiveProgressSubtitle = ref('')
const archiveProgressResourceTitle = ref('')
const archivePackagesLoading = ref(false)
const archiveQueueLoading = ref(false)
const archiveStopping = ref(false)
const archiveQueueDrawerVisible = ref(false)
const deletingArchiveQueueIds = ref<string[]>([])
const restoringArchivePackageIds = ref<string[]>([])
const deletingArchivePackageIds = ref<string[]>([])
const clearingCompletedArchiveQueueItems = ref(false)
const archiveFilterKeyword = ref('')
const archiveFilterCategory = ref('all')
const archiveFilterFormat = ref('all')
const archivePackages = ref<ArchivePackageRecord[]>([])
const archivePackageItemPreviewMap = ref<Record<string, string>>({})
const archiveQueueItems = ref<ArchiveQueueRecord[]>([])
const selectedArchivePackageRecords = computed(() =>
  filteredArchivePackages.value
    .filter((item) => selectedArchivePackageIds.value.includes(item.id))
)

const selectedIssueTypeSummary = computed(() => {
  const items = selectedIssueRecords.value
  if (!items.length) {
    return {
      allSameType: false,
      primaryType: '',
      message: ''
    }
  }

  const typeLabels = Array.from(new Set(items.map((item) => item.issueTypeLabel)))
  const allSameType = typeLabels.length === 1
  const primaryType = allSameType ? typeLabels[0] : ''

  if (!allSameType) {
    return {
      allSameType,
      primaryType,
      message: `当前选中 ${items.length} 项，包含多种问题类型，可执行通用批量动作。`
    }
  }

  if (items[0]?.issueType === 'brokenPath') {
    return {
      allSameType,
      primaryType,
      message: `当前选中均为${primaryType}，建议优先批量重扫或设为忽略。`
    }
  }

  if (items[0]?.issueType === 'missingCover') {
    return {
      allSameType,
      primaryType,
      message: `当前选中均为${primaryType}，建议优先补封面或设为忽略。`
    }
  }

  if (items[0]?.issueType === 'longUnvisited') {
    return {
      allSameType,
      primaryType,
      message: `当前选中均为${primaryType}，建议优先批量归档或批量设为忽略。`
    }
  }

  return {
    allSameType,
    primaryType,
    message: `当前选中均为${primaryType}，可执行对应的批量治理动作。`
  }
})

const canBatchRescan = computed(() =>
  everythingEnabled.value
  && !batchRescanning.value
  && selectedIssueRecords.value.length > 0
  && selectedIssueRecords.value.every((item) => item.issueType === 'brokenPath')
)

const canBatchArchive = computed(() =>
  archivePathConfigured.value
  && !batchArchiving.value
  && selectedIssueRecords.value.length > 0
  && selectedIssueRecords.value.every((item) => item.issueType === 'longUnvisited')
  && selectedIssueRecords.value.every((item) => item.actions.some((action) => action.label === '归档'))
  && selectedIssueRecords.value.every((item) => !archivingIssueIds.value.includes(String(item.resourceId ?? '').trim()))
)

const duplicateIssueGroups = computed<DuplicateIssueGroup[]>(() => {
  const groupMap = new Map<string, DuplicateIssueGroup>()

  for (const item of issueRecords.value.filter((entry) => entry.issueType === 'duplicateResource')) {
    const title = String(item.title ?? '').trim()
    const categoryId = String(item.categoryId ?? '').trim()
    const key = `${categoryId}:${title.toLowerCase()}`
    const currentGroup = groupMap.get(key)

    if (currentGroup) {
      currentGroup.items.push(item)
      continue
    }

    groupMap.set(key, {
      key,
      title,
      category: item.category,
      categoryColor: item.categoryColor,
      items: [item]
    })
  }

  return Array.from(groupMap.values())
})

const nonDuplicateIssueRecords = computed(() =>
  issueRecords.value.filter((item) => item.issueType !== 'duplicateResource')
)


const getNumericRatingValue = (item: Pick<IssueRecord, 'rating'>) => {
  const value = Number(item.rating ?? 0)
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }

  return Math.min(5, value)
}

const issueInsightCards = computed<IssueInsightCard[]>(() => {
  const items = issueRecords.value
  const pendingItems = items.filter((item) => item.status !== '已忽略')
  const ignoredItems = items.filter((item) => item.status === '已忽略')
  const brokenPending = pendingItems.filter((item) => item.issueType === 'brokenPath')
  const missingPending = pendingItems.filter((item) => item.issueType === 'missingCover')
  const longPending = pendingItems.filter((item) => item.issueType === 'longUnvisited')
  const duplicatePending = pendingItems.filter((item) => item.issueType === 'duplicateResource')
  const favoriteMissing = missingPending.filter((item) => item.favorite)
  const highRatingLong = longPending.filter((item) => getNumericRatingValue(item) >= 4)
  const highRatingDuplicate = duplicatePending.filter((item) => getNumericRatingValue(item) >= 4)
  const ignoredBroken = ignoredItems.filter((item) => item.issueType === 'brokenPath')
  const ignoredMissing = ignoredItems.filter((item) => item.issueType === 'missingCover')

  if (activeIssueTab.value === 'brokenPath') {
    const directoryMissing = brokenPending.filter((item) => item.issueSubType === 'directoryMissing').length
    const launchFileMissing = brokenPending.filter((item) => item.issueSubType === 'launchFileMissing').length

    return [
      {
        key: 'broken-priority',
        label: '优先处理',
        count: brokenPending.length,
        summary: brokenPending.length ? `${brokenPending.length} 条路径失效，建议先重定位` : '当前没有待重定位的路径失效资源',
        action: brokenPending.length ? '先处理会直接影响启动的资源' : '这一类问题暂时没有处理压力',
        tone: 'error'
      },
      {
        key: 'broken-directory',
        label: '目录失效',
        count: directoryMissing,
        summary: directoryMissing ? `${directoryMissing} 条目录失效，建议先核对根目录` : '当前没有目录失效资源',
        action: directoryMissing ? '适合优先批量检查磁盘路径' : '目录层面暂时稳定',
        tone: 'warning'
      },
      {
        key: 'broken-launch',
        label: '启动文件丢失',
        count: launchFileMissing,
        summary: launchFileMissing ? `${launchFileMissing} 条入口缺失，需修正启动文件` : '当前没有启动文件丢失资源',
        action: launchFileMissing ? '可检查入口文件名或启动参数' : '入口文件状态正常',
        tone: 'primary'
      }
    ]
  }

  if (activeIssueTab.value === 'missingCover') {
    return [
      {
        key: 'missing-direct',
        label: '可直接完成',
        count: missingPending.length,
        summary: missingPending.length ? `${missingPending.length} 条封面缺失，可直接补封面` : '当前没有待补封面的资源',
        action: missingPending.length ? '建议优先补齐展示频率高的资源' : '封面完整度当前较稳定',
        tone: 'primary'
      },
      {
        key: 'missing-favorite',
        label: '收藏资源',
        count: favoriteMissing.length,
        summary: favoriteMissing.length ? `${favoriteMissing.length} 条收藏资源缺封面` : '当前没有收藏资源存在封面缺失',
        action: favoriteMissing.length ? '可优先补齐常用资源的封面展示' : '收藏资源展示较完整',
        tone: 'warning'
      },
      {
        key: 'missing-ignored',
        label: '已忽略',
        count: ignoredMissing.length,
        summary: ignoredMissing.length ? `${ignoredMissing.length} 条封面问题已忽略` : '当前没有已忽略的封面问题',
        action: ignoredMissing.length ? '需要时可恢复后继续处理' : '后续忽略项会显示在这里',
        tone: 'success'
      }
    ]
  }

  if (activeIssueTab.value === 'longUnvisited') {
    return [
      {
        key: 'long-archive',
        label: '建议归档',
        count: longPending.length,
        summary: longPending.length ? `${longPending.length} 条长期未访问，可转入归档队列` : '当前没有待归档的长期未访问资源',
        action: longPending.length ? '适合先批量检查后统一归档' : '归档压力当前较低',
        tone: 'warning'
      },
      {
        key: 'long-high-rating',
        label: '高评分沉睡',
        count: highRatingLong.length,
        summary: highRatingLong.length ? `${highRatingLong.length} 条高评分资源长期未访问` : '当前没有高评分沉睡资源',
        action: highRatingLong.length ? '建议归档前先确认是否仍需保留在主视图' : '高评分资源活跃度正常',
        tone: 'primary'
      },
      {
        key: 'long-ignored',
        label: '已忽略',
        count: ignoredItems.filter((item) => item.issueType === 'longUnvisited').length,
        summary: ignoredItems.filter((item) => item.issueType === 'longUnvisited').length
          ? `${ignoredItems.filter((item) => item.issueType === 'longUnvisited').length} 条沉睡问题已忽略`
          : '当前没有已忽略的沉睡资源问题',
        action: ignoredItems.filter((item) => item.issueType === 'longUnvisited').length ? '需要时可恢复后重新评估归档' : '后续忽略项会显示在这里',
        tone: 'success'
      }
    ]
  }

  if (activeIssueTab.value === 'duplicateResource') {
    const ignoredDuplicate = ignoredItems.filter((item) => item.issueType === 'duplicateResource').length

    return [
      {
        key: 'duplicate-review',
        label: '待核对重复',
        count: duplicatePending.length,
        summary: duplicatePending.length ? `${duplicatePending.length} 条疑似重复，建议先核对详情` : '当前没有待核对的疑似重复资源',
        action: duplicatePending.length ? '先确认是否为重复导入或同名不同版本' : '重复资源压力当前较低',
        tone: 'error'
      },
      {
        key: 'duplicate-high-rating',
        label: '高评分重复',
        count: highRatingDuplicate.length,
        summary: highRatingDuplicate.length ? `${highRatingDuplicate.length} 条高评分资源存在重名` : '当前没有高评分重复资源',
        action: highRatingDuplicate.length ? '建议优先保留评分更高或信息更完整的版本' : '高评分资源重复风险较低',
        tone: 'warning'
      },
      {
        key: 'duplicate-ignored',
        label: '已忽略',
        count: ignoredDuplicate,
        summary: ignoredDuplicate ? `${ignoredDuplicate} 条疑似重复已忽略` : '当前没有已忽略的疑似重复问题',
        action: ignoredDuplicate ? '需要时可恢复后重新核对' : '后续忽略项会显示在这里',
        tone: 'success'
      }
    ]
  }

  if (activeIssueTab.value === 'ignored') {
    const ignoredLong = ignoredItems.filter((item) => item.issueType === 'longUnvisited').length

    return [
      {
        key: 'ignored-total',
        label: '已忽略',
        count: ignoredItems.length,
        summary: ignoredItems.length ? `${ignoredItems.length} 条问题已暂时忽略` : '当前没有已忽略问题',
        action: ignoredItems.length ? '可按需要恢复为待处理' : '忽略后的问题会集中显示在这里',
        tone: 'success'
      },
      {
        key: 'ignored-broken',
        label: '路径失效已忽略',
        count: ignoredBroken.length,
        summary: ignoredBroken.length ? `${ignoredBroken.length} 条路径问题仍处于忽略状态` : '当前没有被忽略的路径失效问题',
        action: ignoredBroken.length ? '建议定期复查，避免资源长期不可用' : '路径问题当前都在主流程里处理',
        tone: 'warning'
      },
      {
        key: 'ignored-long',
        label: '沉睡问题已忽略',
        count: ignoredLong,
        summary: ignoredLong ? `${ignoredLong} 条长期未访问问题已忽略` : '当前没有被忽略的沉睡资源问题',
        action: ignoredLong ? '可恢复后重新评估归档时机' : '沉睡资源当前没有被搁置的项',
        tone: 'primary'
      }
    ]
  }

  return [
    {
      key: 'all-priority',
      label: '优先处理',
      count: brokenPending.length,
      summary: brokenPending.length ? `${brokenPending.length} 条路径失效，建议先重定位` : '当前没有需要优先重定位的问题',
      action: brokenPending.length ? '先处理目录失效与启动文件丢失' : '可以继续处理封面缺失或疑似重复',
      tone: 'error'
    },
    {
      key: 'all-direct',
      label: '可直接完成',
      count: missingPending.length,
      summary: missingPending.length ? `${missingPending.length} 条封面缺失，可直接补封面` : '当前没有待补封面的资源',
      action: missingPending.length ? '建议优先补齐展示频率高的资源' : '当前这类问题压力较低',
      tone: 'primary'
    },
    {
      key: 'all-ignored',
      label: '已忽略',
      count: ignoredItems.length,
      summary: ignoredItems.length ? `${ignoredItems.length} 条问题已忽略，可随时恢复` : '当前没有已忽略问题',
      action: ignoredItems.length ? '需要时可恢复为待处理继续治理' : '后续忽略项会显示在这里',
      tone: 'success'
    }
  ]
})

const allVisibleSelected = computed(() => (
  issueRecords.value.length > 0
  && issueRecords.value.every((item) => selectedIssueIds.value.includes(item.id))
))

const toggleIssueSelection = (issueId: string, checked: boolean) => {
  selectedIssueIds.value = checked
    ? [...new Set([...selectedIssueIds.value, issueId])]
    : selectedIssueIds.value.filter((id) => id !== issueId)
}

const toggleSelectAllVisible = (checked: boolean) => {
  selectedIssueIds.value = checked ? issueRecords.value.map((item) => item.id) : []
}

const isDuplicateGroupSelected = (group: DuplicateIssueGroup) =>
  group.items.length > 0 && group.items.every((item) => selectedIssueIds.value.includes(item.id))

const isDuplicateGroupIndeterminate = (group: DuplicateIssueGroup) =>
  group.items.some((item) => selectedIssueIds.value.includes(item.id)) && !isDuplicateGroupSelected(group)

const toggleDuplicateGroupSelection = (group: DuplicateIssueGroup, checked: boolean) => {
  const groupIds = group.items.map((item) => item.id)
  selectedIssueIds.value = checked
    ? [...new Set([...selectedIssueIds.value, ...groupIds])]
    : selectedIssueIds.value.filter((id) => !groupIds.includes(id))
}

const getActionButtonType = (tone?: IssueAction['tone']): ActionButtonType => {
  if (tone === 'primary' || tone === 'warning' || tone === 'error') {
    return tone
  }

  return 'default'
}

const isActionSecondary = (tone?: IssueAction['tone']) => tone === 'warning' || tone === 'error'
const isActionTertiary = (tone?: IssueAction['tone']) => !tone || tone === 'default'
const getIssuePrimaryReason = (item: Pick<IssueRecord, 'issueTypeLabel'>) => item.issueTypeLabel
const getIssueSecondaryReason = (item: Pick<IssueRecord, 'issueSubTypeLabel'>) =>
  String(item.issueSubTypeLabel ?? '').trim()

const getIssueStatusActionLabel = (item: Pick<IssueRecord, 'status'>) =>
  item.status === '已忽略' ? '恢复待处理' : '暂不处理'

const getRecommendedIssueActionLabel = (item: Pick<IssueRecord, 'issueType' | 'status'>) => {
  if (item.status === '已忽略') {
    return ''
  }

  switch (item.issueType) {
    case 'brokenPath':
      return '重定位资源'
    case 'missingCover':
      return '选择封面'
    case 'longUnvisited':
      return '归档'
    case 'duplicateResource':
      return '查看详情'
    default:
      return ''
  }
}

const isIssuePrimaryAction = (item: Pick<IssueRecord, 'issueType' | 'status'>, action: Pick<IssueAction, 'label'>) =>
  action.label === getRecommendedIssueActionLabel(item)

const issueDangerActionLabels = new Set(['移除资源', '移除并删除本地资源'])
const issueVisibleSecondaryActionLabels = new Set(['重新扫描', '查看详情', '归档'])

const getIssueVisibleActions = (item: Pick<IssueRecord, 'issueType' | 'status'>, actions: IssueAction[]) => {
  const recommendedLabel = getRecommendedIssueActionLabel(item)
  const visibleActions = actions.filter((action) => {
    if (action.label === '忽略' || action.label === '恢复待处理') {
      return false
    }

    if (action.label === recommendedLabel) {
      return true
    }

    return issueVisibleSecondaryActionLabels.has(action.label)
  })

  if (item.issueType === 'brokenPath') {
    const orderMap = new Map([
      ['重定位资源', 0],
      ['重新扫描', 1],
      ['查看详情', 2]
    ])

    return [...visibleActions].sort((left, right) => {
      const leftOrder = orderMap.get(left.label) ?? 99
      const rightOrder = orderMap.get(right.label) ?? 99
      return leftOrder - rightOrder
    })
  }

  return visibleActions
}

const getIssueOverflowActions = (item: Pick<IssueRecord, 'issueType' | 'status'>, actions: IssueAction[]) =>
  actions
    .filter((action) => action.label !== '忽略' && action.label !== '恢复待处理')
    .filter((action) => !getIssueVisibleActions(item, actions).some((visible) => visible.label === action.label))

const getIssueOverflowOptions = (item: Pick<IssueRecord, 'issueType' | 'status'>, actions: IssueAction[]) =>
  getIssueOverflowActions(item, actions).map((action) => ({
    key: action.label,
    label: action.label,
    tone: action.tone
  }))

const duplicateIssueOverflowOptions = [
  {
    key: '移除资源',
    label: '移除资源',
    tone: 'error'
  },
  {
    key: '移除并删除本地资源',
    label: '移除资源和本地文件',
    tone: 'error'
  }
]

const isIssueActionDisabled = (item: Pick<IssueRecord, 'issueType' | 'resourceId'>, action: Pick<IssueAction, 'label'>) => {
  if (action.label === '重新扫描') {
    const resourceId = String(item.resourceId ?? '').trim()
    return !everythingEnabled.value || item.issueType !== 'brokenPath' || rescanningIssueIds.value.includes(resourceId)
  }

  if (action.label === '归档') {
    return !archivePathConfigured.value
      || item.issueType !== 'longUnvisited'
      || archivingIssueIds.value.includes(String(item.resourceId ?? '').trim())
  }

  return false
}

const isIssueActionLoading = (item: Pick<IssueRecord, 'resourceId'>, action: Pick<IssueAction, 'label'>) => {
  if (action.label === '重新扫描') {
    return rescanningIssueIds.value.includes(String(item.resourceId ?? '').trim())
  }

  if (action.label === '归档') {
    return archivingIssueIds.value.includes(String(item.resourceId ?? '').trim())
  }

  return false
}

const getIssueActionButtonType = (item: Pick<IssueRecord, 'issueType' | 'status'>, action: IssueAction): ActionButtonType => {
  if (isIssuePrimaryAction(item, action)) {
    return 'primary'
  }

  return getActionButtonType(action.tone)
}

const isIssueActionSecondary = (item: Pick<IssueRecord, 'issueType' | 'status'>, action: IssueAction) => {
  if (isIssuePrimaryAction(item, action)) {
    return false
  }

  return isActionSecondary(action.tone)
}

const isIssueActionTertiary = (item: Pick<IssueRecord, 'issueType' | 'status'>, action: IssueAction) => {
  if (isIssuePrimaryAction(item, action)) {
    return false
  }

  return action.label === '查看详情' || isActionTertiary(action.tone)
}
const getIssueRatingValue = (rating: string) => {
  const normalized = Number(rating ?? 0)
  if (!Number.isFinite(normalized) || normalized < 0) {
    return 0
  }

  return Math.min(5, normalized)
}

const getIssuePrimaryTime = (item: Pick<IssueRecord, 'issueType' | 'recentAccess' | 'createdAt'>) => {
  if (item.issueType === 'missingCover') {
    return {
      label: '创建时间',
      value: item.createdAt
    }
  }

  return {
    label: '最近访问',
    value: item.recentAccess
  }
}

const getIssueSecondaryTime = (item: Pick<IssueRecord, 'issueType' | 'recentAccess' | 'createdAt'>) => {
  if (item.issueType === 'missingCover') {
    return {
      label: '最近访问',
      value: item.recentAccess
    }
  }

  return {
    label: '创建时间',
    value: item.createdAt
  }
}

const truncateMiddleText = (text: string, options?: { head?: number; tail?: number }) => {
  const normalized = String(text ?? '').trim()
  if (!normalized) {
    return ''
  }

  const head = Math.max(4, Number(options?.head ?? 18))
  const tail = Math.max(6, Number(options?.tail ?? 18))
  if (normalized.length <= head + tail + 3) {
    return normalized
  }

  return `${normalized.slice(0, head)}...${normalized.slice(-tail)}`
}

const handleOpenIssueDirectory = async (directoryPath: string) => {
  const normalizedPath = String(directoryPath ?? '').trim()
  if (!normalizedPath) {
    return
  }

  await window.api.dialog.openPath(normalizedPath)
}

const handleOpenArchiveOutputDirectory = async (archivePath: string) => {
  const normalizedPath = String(archivePath ?? '').trim()
  if (!normalizedPath) {
    return
  }

  const directoryPath = normalizedPath.replace(/[\\/][^\\/]+$/, '')
  await window.api.dialog.openPath(directoryPath || normalizedPath)
}

const resolveIssueCoverPreviewUrl = async (coverPath: string) => {
  try {
    return await resolveImagePreviewSource(normalizeCoverPreviewSource(coverPath), {
      maxWidth: 320,
      maxHeight: 220,
      fit: 'cover',
      quality: 78,
      fallbackToFileUrl: true
    })
  } catch {
    return ''
  }
}

const resolveGovernanceCoverPreviewUrl = async (coverPath: string) => {
  const normalizedCoverPath = String(coverPath ?? '').trim()
  if (!normalizedCoverPath) {
    return ''
  }

  return resolveIssueCoverPreviewUrl(normalizedCoverPath)
}

const formatAudioCoverCandidateQuery = (query: Record<string, string>) =>
  Object.entries(query ?? {})
    .map(([key, value]) => {
      const label = key === 'title' ? '歌名' : key === 'artist' ? '歌手' : key === 'album' ? '专辑' : key
      return `${label}：${String(value ?? '').trim()}`
    })
    .filter(Boolean)
    .join(' / ')

const syncGovernanceCoverPickerPreview = async () => {
  const coverPath = String(coverPickerFormData.value?.coverPath ?? '').trim()
  coverPickerPreviewSrc.value = coverPath ? await resolveGovernanceCoverPreviewUrl(coverPath) : ''
}

const updateGovernanceCoverPickerPath = async (coverPath: string) => {
  if (!coverPickerFormData.value) {
    return
  }

  coverPickerFormData.value = {
    ...coverPickerFormData.value,
    coverPath: String(coverPath ?? '').trim()
  }
  await syncGovernanceCoverPickerPreview()
}

const refreshEverythingEnabled = async () => {
  const [httpSetting, cliSetting] = await Promise.all([
    window.api.db.getSetting(Settings.USE_EVERYTHING_HTTP),
    window.api.db.getSetting(Settings.USE_EVERYTHING_CLI)
  ])

  everythingEnabled.value = String(httpSetting?.value ?? Settings.USE_EVERYTHING_HTTP.default) === '1'
    || String(cliSetting?.value ?? Settings.USE_EVERYTHING_CLI.default) === '1'
}

const refreshArchivePathConfigured = async () => {
  const archivePathSetting = await window.api.db.getSetting(Settings.ARCHIVE_PATH)
  archivePathConfigured.value = Boolean(String(archivePathSetting?.value ?? Settings.ARCHIVE_PATH.default).trim())
}

const formatArchiveFileSize = (bytes: number) => {
  const normalizedBytes = Math.max(0, Number(bytes ?? 0))
  if (!normalizedBytes) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = normalizedBytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

const formatArchiveDateTime = (timestamp: number | null) => {
  if (!timestamp || Number.isNaN(timestamp)) {
    return '暂无'
  }
  return formatDateTime(new Date(timestamp))
}

const getArchiveQueueStatusLabel = (status: string) => {
  if (status === 'running') return '进行中'
  if (status === 'queued') return '排队中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '已取消'
  return status || '未知'
}

const getArchiveQueueStatusType = (status: string) => {
  if (status === 'running') return 'info'
  if (status === 'queued') return 'warning'
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'error'
  return 'default'
}

const syncArchivingIssueIdsFromQueue = (items: ArchiveQueueRecord[]) => {
  archivingIssueIds.value = Array.from(
    new Set(
      (items ?? [])
        .filter((item) => (item.status === 'queued' || item.status === 'running') && String(item.operation ?? 'archive') === 'archive')
        .flatMap((item) => {
          const explicitIds = Array.isArray(item.resourceIds)
            ? item.resourceIds.map((entry) => String(entry ?? '').trim()).filter(Boolean)
            : []
          if (explicitIds.length) {
            return explicitIds
          }
          const fallbackId = String(item.resourceId ?? '').trim()
          return fallbackId ? [fallbackId] : []
        })
        .filter(Boolean)
    )
  )
  restoringArchivePackageIds.value = Array.from(
    new Set(
      (items ?? [])
        .filter((item) => (item.status === 'queued' || item.status === 'running') && String(item.operation ?? 'archive') === 'restore')
        .map((item) => String(item.archiveId ?? '').trim())
        .filter(Boolean)
    )
  )
}

const refreshArchivePackages = async () => {
  const result = await window.api.service.listArchivedPackages()
  if (result?.type !== 'success') {
    throw new Error(String(result?.message ?? '读取归档包列表失败'))
  }
  archivePackages.value = Array.isArray(result?.data) ? result.data : []
  selectedArchivePackageIds.value = selectedArchivePackageIds.value.filter((id) =>
    archivePackages.value.some((item) => item.id === id)
  )
}

const getArchivePackageItemPreviewKey = (archiveId: string, resourceId: string) => `${archiveId}:${resourceId}`

const ensureArchivePackageItemPreview = async (archiveId: string, item: ArchivePackageRecord['items'][number]) => {
  const previewKey = getArchivePackageItemPreviewKey(archiveId, String(item.resourceId ?? '').trim())
  if (archivePackageItemPreviewMap.value[previewKey] !== undefined) {
    return archivePackageItemPreviewMap.value[previewKey]
  }

  const normalizedCoverPath = String(item.coverPath ?? '').trim()
  if (!normalizedCoverPath) {
    archivePackageItemPreviewMap.value = {
      ...archivePackageItemPreviewMap.value,
      [previewKey]: ''
    }
    return ''
  }

  try {
    const previewUrl = await resolveImagePreviewSource(normalizeCoverPreviewSource(normalizedCoverPath), {
      maxWidth: 360,
      maxHeight: 360,
      fit: 'cover',
      quality: 80,
      fallbackToFileUrl: true
    })
    archivePackageItemPreviewMap.value = {
      ...archivePackageItemPreviewMap.value,
      [previewKey]: previewUrl
    }
    return previewUrl
  } catch {
    archivePackageItemPreviewMap.value = {
      ...archivePackageItemPreviewMap.value,
      [previewKey]: ''
    }
    return ''
  }
}

const renderArchivePackageExpandedRow = (row: ArchivePackageRecord) => {
  const archiveId = String(row.id ?? '').trim()
  const items = Array.isArray(row.items) ? row.items : []

  return h(
    'ul',
    { class: 'archive-package-expand' },
    items.length
      ? items.map((item) => {
          const itemTitle = String(item.title ?? '未命名资源')
          const resourceId = String(item.resourceId ?? '').trim()
          const previewKey = getArchivePackageItemPreviewKey(archiveId, resourceId)
          const previewSrc = archivePackageItemPreviewMap.value[previewKey] ?? ''

          return h(
            NPopover,
            {
              key: resourceId || itemTitle,
              trigger: 'hover',
              placement: 'right',
              onUpdateShow: (show: boolean) => {
                if (show) {
                  void ensureArchivePackageItemPreview(archiveId, item)
                }
              }
            },
            {
              trigger: () => h(
                'li',
                { class: 'archive-package-expand__item' },
                h(
                  'span',
                  {
                    class: 'archive-package-expand__title',
                    title: itemTitle
                  },
                  itemTitle
                )
              ),
              default: () => h(
                'div',
                {
                  class: 'archive-package-preview',
                  style: {
                    width: '200px',
                    minHeight: '120px'
                  }
                },
                previewSrc
                  ? h('img', {
                      class: 'archive-package-preview__image',
                      src: previewSrc,
                      alt: itemTitle,
                      style: {
                        display: 'block',
                        width: '200px',
                        height: '200px',
                        borderRadius: '8px',
                        objectFit: 'cover'
                      }
                    })
                  : h(
                      'div',
                      {
                        class: 'archive-package-preview__empty',
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '200px',
                          height: '120px',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }
                      },
                      '暂无封面'
                    )
              )
            }
          )
        })
      : [h('div', { class: 'archive-empty archive-empty--compact' }, '归档包内暂无资源项')]
  )
}

const refreshArchiveQueue = async () => {
  const result = await window.api.service.listArchiveQueueItems()
  if (result?.type !== 'success') {
    throw new Error(String(result?.message ?? '读取归档队列失败'))
  }
  const nextItems = Array.isArray(result?.data) ? result.data : []
  archiveQueueItems.value = nextItems
  syncArchivingIssueIdsFromQueue(nextItems)
}

const loadArchiveWorkbench = async () => {
  if (activeModule.value !== 'archive') {
    return
  }

  archivePackagesLoading.value = true
  archiveQueueLoading.value = true
  try {
    await Promise.all([
      refreshArchivePackages(),
      refreshArchiveQueue(),
      refreshArchivePathConfigured()
    ])
  } finally {
    archivePackagesLoading.value = false
    archiveQueueLoading.value = false
  }
}

const loadTagWorkbench = async () => {
  if (activeModule.value !== 'tags') {
    return
  }

  const requestToken = ++tagWorkbenchRequestToken
  tagWorkbenchLoading.value = true

  try {
    const result = await window.api.db.getGovernanceTagWorkbench() as GovernanceTagWorkbenchResponse
    if (requestToken !== tagWorkbenchRequestToken) {
      return
    }

    tagWorkbench.value = {
      summary: {
        totalTagCount: Number(result?.summary?.totalTagCount ?? 0),
        totalTypeCount: Number(result?.summary?.totalTypeCount ?? 0),
        unusedTagCount: Number(result?.summary?.unusedTagCount ?? 0),
        unusedTypeCount: Number(result?.summary?.unusedTypeCount ?? 0)
      },
      filters: {
        categories: Array.isArray(result?.filters?.categories) && result.filters.categories.length
          ? result.filters.categories
          : [{ label: '全部分类', value: 'all' }]
      },
      tags: Array.isArray(result?.tags) ? result.tags : [],
      types: Array.isArray(result?.types) ? result.types : []
    }

    workbenchSummary.value = {
      ...workbenchSummary.value,
      totalTagCount: tagWorkbench.value.summary.totalTagCount,
      totalTypeCount: tagWorkbench.value.summary.totalTypeCount
    }
    const currentIds = new Set(currentTagEntityRows.value.map((item) => item.id))
    selectedTagEntityIds.value = selectedTagEntityIds.value.filter((id) => currentIds.has(id))
  } catch (error) {
    if (requestToken !== tagWorkbenchRequestToken) {
      return
    }

    notify('error', '加载标签分类数据失败', error instanceof Error ? error.message : '请稍后重试')
  } finally {
    if (requestToken === tagWorkbenchRequestToken) {
      tagWorkbenchLoading.value = false
    }
  }
}

const openTagEntityRenameModal = (item: TagWorkbenchEntityRecord) => {
  tagEntityRenameTarget.value = item
  tagEntityRenameKind.value = currentTagEntityKind.value
  tagEntityRenameDraft.value = String(item.name ?? '').trim()
  tagEntityRenameVisible.value = true
}

const handleRenameTagEntity = async () => {
  const target = tagEntityRenameTarget.value
  const nextName = tagEntityRenameDraft.value.trim()
  if (!target || !nextName || tagEntityRenameSaving.value) {
    return
  }

  tagEntityRenameSaving.value = true
  try {
    const result = await window.api.db.renameGovernanceTagEntity(tagEntityRenameKind.value, target.id, nextName)
    const type = result?.type === 'success' ? 'success' : result?.type === 'warning' ? 'warning' : 'error'
    notify(type, `${tagEntityRenameKind.value === 'tag' ? '标签' : '分类'}重命名`, String(result?.message ?? '操作完成'))
    if (result?.type === 'success') {
      tagEntityRenameVisible.value = false
      tagEntityRenameTarget.value = null
      tagEntityRenameDraft.value = ''
      await loadTagWorkbench()
    }
  } catch (error) {
    notify('error', `${tagEntityRenameKind.value === 'tag' ? '标签' : '分类'}重命名失败`, error instanceof Error ? error.message : String(error))
  } finally {
    tagEntityRenameSaving.value = false
  }
}

const handleDeleteTagEntity = async (item: TagWorkbenchEntityRecord, kind: TagWorkbenchEntityKind) => {
  try {
    const result = await window.api.db.deleteGovernanceTagEntity(kind, item.id)
    const type = result?.type === 'success' ? 'success' : result?.type === 'warning' ? 'warning' : 'error'
    notify(type, `删除${kind === 'tag' ? '标签' : '分类'}`, String(result?.message ?? '操作完成'))
    if (result?.type === 'success') {
      await loadTagWorkbench()
    }
  } catch (error) {
    notify('error', `删除${kind === 'tag' ? '标签' : '分类'}失败`, error instanceof Error ? error.message : String(error))
  }
}

const handleTagEntityTableSelection = (keys: DataTableRowKey[]) => {
  selectedTagEntityIds.value = keys.map((key) => String(key))
}

const deleteTagEntitiesByIds = async (ids: string[], title: string) => {
  const normalizedIds = Array.from(new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean)))
  if (!normalizedIds.length || tagEntityBatchDeleting.value) {
    return
  }

  const confirmed = await confirmDialog(
    title,
    `确定删除选中的 ${normalizedIds.length} 个${currentTagEntityKind.value === 'tag' ? '标签' : '分类'}吗？\n删除后会解除对应资源关联。`
  )
  if (!confirmed) {
    return
  }

  tagEntityBatchDeleting.value = true
  try {
    const result = await window.api.db.deleteGovernanceTagEntities(currentTagEntityKind.value, normalizedIds)
    const type = result?.type === 'success' ? 'success' : result?.type === 'warning' ? 'warning' : 'error'
    notify(type, title, String(result?.message ?? '操作完成'))
    if (result?.type === 'success') {
      selectedTagEntityIds.value = selectedTagEntityIds.value.filter((id) => !normalizedIds.includes(id))
      await loadTagWorkbench()
    }
  } catch (error) {
    notify('error', `${title}失败`, error instanceof Error ? error.message : String(error))
  } finally {
    tagEntityBatchDeleting.value = false
  }
}

const handleBatchDeleteTagEntities = async () => {
  await deleteTagEntitiesByIds(selectedTagEntityIds.value, `批量删除${currentTagEntityKind.value === 'tag' ? '标签' : '分类'}`)
}

const handleCleanUnusedTagEntities = async () => {
  await deleteTagEntitiesByIds(
    unusedCurrentTagEntityRecords.value.map((item) => item.id),
    `清理未使用${currentTagEntityKind.value === 'tag' ? '标签' : '分类'}`
  )
}

const resolveDetailCoverPreviewUrl = async (coverPath: string) => {
  try {
    return await resolveImagePreviewSource(normalizeCoverPreviewSource(coverPath), {
      maxWidth: 960,
      maxHeight: 720,
      fit: 'inside',
      quality: 84,
      fallbackToFileUrl: true
    })
  } catch {
    return ''
  }
}

const resolveDetailWebsiteFaviconPreviewUrl = async (faviconPath: string) => {
  try {
    return await resolveImagePreviewSource(normalizeWebsiteIconSource(faviconPath), {
      maxWidth: 64,
      maxHeight: 64,
      fit: 'cover',
      quality: 80,
      fallbackToFileUrl: true
    }, normalizeWebsiteIconSource)
  } catch {
    return ''
  }
}

const openResourceCategory = async (item: Pick<IssueRecord, 'categoryId' | 'resourceId'>) => {
  await router.push({
    path: `/category/${item.categoryId}`,
    query: {
      resourceId: item.resourceId,
      openDetail: '1'
    }
  })
}

const clampDetailDrawerWidth = (nextWidth: number) => {
  const maxWidth = Math.max(420, Math.floor(window.innerWidth * 0.9))
  return Math.min(maxWidth, Math.max(420, nextWidth))
}

const handleDetailDrawerResizeStart = (event: MouseEvent) => {
  detailDrawerResizeStartX.value = event.clientX
  detailDrawerResizeStartWidth.value = detailDrawerWidth.value
  isResizingDetailDrawer.value = true
  document.body.style.userSelect = 'none'
}

const handleDetailDrawerResizeMove = (event: MouseEvent) => {
  if (!isResizingDetailDrawer.value) {
    return
  }

  const delta = detailDrawerResizeStartX.value - event.clientX
  detailDrawerWidth.value = clampDetailDrawerWidth(detailDrawerResizeStartWidth.value + delta)
}

const handleDetailDrawerResizeEnd = () => {
  if (!isResizingDetailDrawer.value) {
    return
  }

  isResizingDetailDrawer.value = false
  document.body.style.userSelect = ''
}

const handleDetailDrawerShowUpdate = (nextShow: boolean) => {
  showDetailDrawer.value = nextShow
  if (!nextShow) {
    detailRequestToken += 1
  }
}

const loadDetailCategoryAssets = async (categoryIdInput: string) => {
  const categoryId = String(categoryIdInput ?? '').trim()
  if (!categoryId) {
    detailEngineList.value = []
    detailEngineOptionList.value = []
    detailLanguageOptions.value = []
    return
  }

  const [engineList, engineOptions, languageOptions] = await Promise.all([
    window.api.db.getEngineByCategoryId(categoryId),
    window.api.db.getSelectDictData(DictType.GAME_ENGINE_TYPE),
    window.api.db.getSelectDictData(DictType.LANGUAGE_TYPE)
  ])

  detailEngineList.value = Array.isArray(engineList) ? engineList : []
  detailEngineOptionList.value = Array.isArray(engineOptions) ? engineOptions : []
  detailLanguageOptions.value = Array.isArray(languageOptions) ? languageOptions : []
}

const openResourceDetail = async (item: IssueRecord) => {
  const resourceId = String(item.resourceId ?? '').trim()
  const categoryId = String(item.categoryId ?? '').trim()
  if (!resourceId) {
    return
  }

  const requestToken = ++detailRequestToken
  detailVisibleLogCount.value = 5
  detailCurrentScreenshotIndex.value = 0
  detailAudioTree.value = []
  detailAudioTreeLoading.value = false
  detailAudioContextMenuVisible.value = false
  showDeleteScreenshotConfirm.value = false
  detailScreenshotPaths.value = []
  detailGalleryImageUrls.value = {}

  try {
    const [detailResult, categoryResult] = await Promise.all([
      window.api.service.getResourceDetail(resourceId),
      categoryId ? window.api.db.getCategoryById(categoryId) : Promise.resolve(null)
    ])

    if (requestToken !== detailRequestToken) {
      return
    }

    const resource = detailResult?.data ?? detailResult
    if (!resource) {
      notify('error', '资源详情', '未能读取资源详情')
      return
    }

    selectedDetailResource.value = resource
    detailCategory.value = categoryResult ?? resource?.category ?? null
    showDetailDrawer.value = true

    await loadDetailCategoryAssets(String(resource?.categoryId ?? categoryId))
    if (requestToken !== detailRequestToken) {
      return
    }

    detailRatingDraft.value = Number(resource?.rating ?? -1)
    const normalizedCoverPath = String(resource?.coverPath ?? '').trim()
    detailCoverPreviewSrc.value = normalizedCoverPath ? await resolveDetailCoverPreviewUrl(normalizedCoverPath) : ''
    const normalizedFavicon = String(resource?.websiteMeta?.favicon ?? resource?.meta?.icon ?? '').trim()
    detailWebsiteFaviconSrc.value = normalizedFavicon
      ? await resolveDetailWebsiteFaviconPreviewUrl(normalizedFavicon)
      : ''
  } catch (error) {
    if (requestToken !== detailRequestToken) {
      return
    }

    notify('error', '资源详情', error instanceof Error ? error.message : '读取资源详情失败')
  }
}

const handleDetailOpenResourcePath = async () => {
  const resource = selectedDetailResource.value
  if (!resource) {
    return
  }

  if (detailIsWebsite.value) {
    const websiteUrl = detailWebsiteUrl.value
    if (websiteUrl) {
      await window.api.dialog.openExternalUrl(websiteUrl)
    }
    return
  }

  await window.api.dialog.openPath(String(resource?.basePath ?? ''))
}

const handleDetailOpenStoreWebsite = async (url: string) => {
  const normalizedUrl = String(url ?? '').trim()
  if (!normalizedUrl) {
    return
  }

  await window.api.dialog.openExternalUrl(normalizedUrl)
}

const handleDetailCopyText = async (text: string) => {
  await window.api.dialog.copyTextToClipboard(text)
}

const handleCopyIssuePath = async (text: string) => {
  const normalizedText = String(text ?? '').trim()
  if (!normalizedText) {
    return
  }

  await handleDetailCopyText(normalizedText)
  notify('success', '路径已复制', '当前路径已复制到剪贴板')
}

const handleDetailLoadMoreLogs = () => {
  if (!hasMoreDetailLogs.value) {
    return
  }

  detailVisibleLogCount.value = Math.min(detailLogs.value.length, detailVisibleLogCount.value + 5)
}

const handleDetailRatingUpdate = (value: number) => {
  detailRatingDraft.value = Number.isFinite(Number(value)) ? Number(value) : 0
}

const handleDetailSubmitRating = async () => {
  if (!selectedDetailResource.value || !hasPendingRatingChange.value) {
    return
  }

  try {
    const result = await window.api.service.updateResourceRating(
      String(selectedDetailResource.value.id ?? ''),
      Number(detailRatingDraft.value)
    )
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '评分更新完成'
    notify(resultType, '更新评分', resultMessage)

    if (resultType === 'error') {
      return
    }

    selectedDetailResource.value = {
      ...selectedDetailResource.value,
      rating: Number(detailRatingDraft.value)
    }
  } catch (error) {
    notify('error', '更新评分', error instanceof Error ? error.message : '更新评分失败')
  }
}

const handleDetailOpenCategory = async (resource: any) => {
  const categoryId = String(resource?.categoryId ?? detailCategory.value?.id ?? '').trim()
  const resourceId = String(resource?.id ?? '').trim()
  if (!categoryId || !resourceId) {
    return
  }

  await openResourceCategory({ categoryId, resourceId })
}

const handleIssueEditResource = async (item: IssueRecord) => {
  await openResourceCategory(item)
}

const fetchGovernanceWorkbench = async () =>
  window.api.db.getGovernanceIssueWorkbench({
    issueType: activeIssueTab.value,
    brokenPathSubtype: activeBrokenPathSubtype.value,
    longUnvisitedBucket: activeLongUnvisitedBucket.value,
    keyword: searchKeyword.value,
    category: selectedCategory.value,
    rating: selectedRating.value,
    onlyFavorite: onlyFavorite.value,
    sortBy: selectedSort.value
  }) as Promise<GovernanceWorkbenchResponse>

const applyGovernanceWorkbenchMeta = (result?: GovernanceWorkbenchResponse | null) => {
  workbenchSummary.value = result?.summary
    ? {
        ...workbenchSummary.value,
        ...result.summary
      }
    : workbenchSummary.value
  issueTabs.value = Array.isArray(result?.tabs) && result.tabs.length ? result.tabs : issueTabs.value
  brokenPathSubTabs.value = Array.isArray(result?.brokenPathSubTabs) && result.brokenPathSubTabs.length
    ? result.brokenPathSubTabs
    : brokenPathSubTabs.value
  longUnvisitedSubTabs.value = Array.isArray(result?.longUnvisitedSubTabs) && result.longUnvisitedSubTabs.length
    ? result.longUnvisitedSubTabs
    : longUnvisitedSubTabs.value
  categoryOptions.value = Array.isArray(result?.filters?.categories) && result.filters.categories.length
    ? result.filters.categories
    : [{ label: '全部分类', value: 'all' }]
}

const refreshWorkbenchSummary = async () => {
  const result = await fetchGovernanceWorkbench()
  applyGovernanceWorkbenchMeta(result)
}

const loadGovernanceIssues = async () => {
  if (activeModule.value !== 'issues') {
    return
  }

  const requestToken = ++governanceRequestToken
  loading.value = true

  try {
    const [result] = await Promise.all([
      fetchGovernanceWorkbench(),
      refreshEverythingEnabled(),
      refreshArchivePathConfigured()
    ])

    if (requestToken !== governanceRequestToken) {
      return
    }

    applyGovernanceWorkbenchMeta(result)
    const rawItems = Array.isArray(result?.items) ? result.items : []
    const nextItems = await Promise.all(rawItems.map(async (item) => {
      const coverPath = String(item?.coverPath ?? '').trim()
      if (!coverPath) {
        return {
          ...item,
          coverPath: '',
          coverUrl: ''
        }
      }

      return {
        ...item,
        coverPath,
        coverUrl: await resolveIssueCoverPreviewUrl(coverPath)
      }
    }))

    if (requestToken !== governanceRequestToken) {
      return
    }

    issueRecords.value = nextItems
    selectedIssueIds.value = selectedIssueIds.value.filter((id) => issueRecords.value.some((item) => item.id === id))
  } catch (error) {
    if (requestToken !== governanceRequestToken) {
      return
    }

    issueRecords.value = []
    notify('error', '加载资源治理数据失败', error instanceof Error ? error.message : '请稍后重试')
  } finally {
    if (requestToken === governanceRequestToken) {
      loading.value = false
    }
  }
}

const refreshGovernanceIssues = async () => {
  selectedIssueIds.value = []
  await loadGovernanceIssues()
}

const handleRefreshWorkbench = async () => {
  if (activeModule.value === 'archive') {
    await loadArchiveWorkbench()
    return
  }

  if (activeModule.value === 'tags') {
    await loadTagWorkbench()
    return
  }

  await refreshGovernanceIssues()
}

const setIssueIgnored = async (item: IssueRecord, ignored: boolean) => {
  const result = await window.api.service.setGovernanceIssueIgnored(item.resourceId, item.issueType, ignored)
  if (result?.type === 'success') {
    notify('success', ignored ? '问题已忽略' : '已恢复待处理', String(result?.message ?? '操作成功'))
    await refreshGovernanceIssues()
    return
  }

  notify(result?.type === 'warning' ? 'warning' : 'error', ignored ? '忽略失败' : '恢复失败', String(result?.message ?? '操作失败'))
}

const handleDeleteResource = async (item: IssueRecord) => {
  const confirmed = await confirmDialog(
    '移除资源',
    `你确定要删除这个记录吗？\n“${item.title}”将会消失！`
  )
  if (!confirmed) {
    return
  }

  const result = await window.api.service.deleteResource(item.resourceId)
  if (result?.type === 'success') {
    notify('success', '资源已移除', String(result?.message ?? '操作成功'))
    await refreshGovernanceIssues()
    return
  }

  notify(result?.type === 'warning' ? 'warning' : 'error', '移除失败', String(result?.message ?? '操作失败'))
}

const handleDeleteResourceWithFiles = async (item: IssueRecord) => {
  const confirmed = await confirmDialog(
    '移除并删除本地资源',
    `你确定要删除这个记录吗？\n“${item.title}”将会永久消失！（真的很久！）`
  )
  if (!confirmed) {
    return
  }

  const result = await window.api.service.deleteResourceWithFiles(item.resourceId)
  if (result?.type === 'success') {
    notify('success', '资源已删除', String(result?.message ?? '操作成功'))
    await refreshGovernanceIssues()
    return
  }

  notify(result?.type === 'warning' ? 'warning' : 'error', '删除失败', String(result?.message ?? '操作失败'))
}

const closeRelocateModal = () => {
  showRelocateModal.value = false
  relocateSaving.value = false
  relocateSelecting.value = false
  relocateTargetItem.value = null
  relocateTargetPath.value = ''
}

const closeGovernanceAudioCoverCandidateModal = () => {
  showGovernanceAudioCoverCandidateModal.value = false
  governanceAudioCoverCandidates.value = []
}

const closeGovernanceVideoCoverCandidateModal = () => {
  showGovernanceVideoCoverCandidateModal.value = false
  governanceVideoCoverCandidates.value = []
}

const closeGovernanceVideoSubCoverCandidateModal = () => {
  showGovernanceVideoSubCoverCandidateModal.value = false
  governanceVideoSubCoverCandidateItems.value = []
}

const closeCoverPickerModal = () => {
  showCoverPickerModal.value = false
  coverPickerSaving.value = false
  coverPickerActionLoading.value = false
  coverPickerVideoFrameLoading.value = false
  coverPickerItem.value = null
  coverPickerCategory.value = null
  coverPickerResourceDetail.value = null
  coverPickerFormData.value = null
  coverPickerPreviewSrc.value = ''
  closeGovernanceAudioCoverCandidateModal()
  closeGovernanceVideoCoverCandidateModal()
  closeGovernanceVideoSubCoverCandidateModal()
}

const openRelocateModal = (item: IssueRecord) => {
  relocateTargetItem.value = item
  relocateTargetPath.value = ''
  showRelocateModal.value = true
}

const openCoverPickerModal = async (item: IssueRecord) => {
  try {
    coverPickerActionLoading.value = true
    const [detailResult, categoryResult] = await Promise.all([
      window.api.service.getResourceDetail(item.resourceId),
      window.api.db.getCategoryById(item.categoryId)
    ])

    const detail = detailResult?.data ?? detailResult
    if (!detail) {
      notify('error', '选择封面', '未能读取资源详情')
      return
    }

    coverPickerItem.value = item
    coverPickerResourceDetail.value = detail
    coverPickerCategory.value = categoryResult
    coverPickerFormData.value = mapGovernanceResourceDetailToFormData(detail, categoryResult)
    await syncGovernanceCoverPickerPreview()
    showCoverPickerModal.value = true
  } catch (error) {
    notify('error', '选择封面', error instanceof Error ? error.message : '打开封面选择失败')
  } finally {
    coverPickerActionLoading.value = false
  }
}

const handleSelectRelocatePath = async () => {
  try {
    relocateSelecting.value = true
    const selectedPath = await window.api.dialog.selectFile([])
    if (!selectedPath) {
      return
    }

    relocateTargetPath.value = String(selectedPath).trim()
  } catch (error) {
    notify('error', '选择文件失败', error instanceof Error ? error.message : '请稍后重试')
  } finally {
    relocateSelecting.value = false
  }
}

const handleGovernanceChooseCustomCover = async () => {
  try {
    coverPickerActionLoading.value = true
    const coverPath = await window.api.dialog.selectFile(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'])
    if (coverPath) {
      await updateGovernanceCoverPickerPath(String(coverPath))
    }
  } catch (error) {
    notify('error', '选择封面', error instanceof Error ? error.message : '选择自定义封面失败')
  } finally {
    coverPickerActionLoading.value = false
  }
}

const handleGovernanceFetchWebsiteCover = async () => {
  const normalizedUrl = String(coverPickerFormData.value?.meta?.website ?? '').trim()
  if (!normalizedUrl) {
    notify('warning', '获取页面图片', '请先确认当前资源存在合法的网站地址')
    return
  }

  try {
    coverPickerActionLoading.value = true
    const result = await window.api.service.fetchWebsiteCover(normalizedUrl)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '获取页面图片完成'
    const data = result?.data ?? {}

    if (resultType !== 'error') {
      const nextWebsite = String(data.website ?? normalizedUrl).trim()
      const nextCoverPath = String(data.coverPath ?? '').trim()
      if (coverPickerFormData.value) {
        coverPickerFormData.value = {
          ...coverPickerFormData.value,
          meta: {
            ...(coverPickerFormData.value.meta ?? {}),
            website: nextWebsite
          }
        }
      }
      if (nextCoverPath) {
        await updateGovernanceCoverPickerPath(nextCoverPath)
      }
    }

    notify(resultType === 'warning' ? 'warning' : resultType === 'error' ? 'error' : 'success', '获取页面图片', resultMessage)
  } finally {
    coverPickerActionLoading.value = false
  }
}

const handleGovernanceFetchAlbumCover = async () => {
  try {
    coverPickerActionLoading.value = true
    const payload = {
      basePath: String(coverPickerFormData.value?.basePath ?? ''),
      title: String(coverPickerFormData.value?.name ?? ''),
      album: String(coverPickerFormData.value?.meta?.album ?? ''),
      artist: String(coverPickerFormData.value?.author ?? ''),
      artists: Array.isArray(coverPickerFormData.value?.authors)
        ? coverPickerFormData.value.authors.map((item: string) => String(item ?? '')).filter(Boolean)
        : []
    }

    const result = await window.api.service.fetchAudioAlbumCover(payload)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '获取专辑封面完成'

    if (resultType === 'success') {
      const rawCandidates = Array.isArray(result?.data?.coverCandidates) ? result.data.coverCandidates : []
      const resolvedCandidates = await Promise.all(
        rawCandidates.map(async (candidate: any) => {
          const coverPath = String(candidate?.coverPath ?? '').trim()
          return {
            label: String(candidate?.label ?? '').trim(),
            coverPath,
            previewSrc: await resolveGovernanceCoverPreviewUrl(coverPath),
            queryText: formatAudioCoverCandidateQuery(candidate?.query ?? {})
          }
        })
      )
      const availableCandidates = resolvedCandidates.filter((candidate) => candidate.coverPath && candidate.previewSrc)

      if (availableCandidates.length) {
        governanceAudioCoverCandidates.value = availableCandidates
        showGovernanceAudioCoverCandidateModal.value = true
      } else if (result?.data?.coverPath) {
        await updateGovernanceCoverPickerPath(String(result.data.coverPath))
      }
    }

    notify(resultType === 'warning' ? 'warning' : resultType === 'error' ? 'error' : 'success', '获取专辑封面', resultMessage)
  } catch (error) {
    notify('error', '获取专辑封面', error instanceof Error ? error.message : '获取专辑封面失败')
  } finally {
    coverPickerActionLoading.value = false
  }
}

const handleGovernanceUseScreenshotCover = async () => {
  try {
    coverPickerActionLoading.value = true
    const result = await window.api.service.captureCoverScreenshot(String(coverPickerFormData.value?.basePath ?? '').trim())
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '截图完成'

    if (resultType === 'error' || resultType === 'warning') {
      notify(resultType === 'warning' ? 'warning' : 'error', '封面截图', resultMessage)
      return
    }

    const screenshotFilePath = String(result?.data?.filePath ?? '').trim()
    if (!screenshotFilePath) {
      notify('warning', '封面截图', '截图成功，但未返回图片文件')
      return
    }

    await updateGovernanceCoverPickerPath(screenshotFilePath)
    notify('success', '封面截图', resultMessage)
  } catch (error) {
    notify('error', '封面截图', error instanceof Error ? error.message : '使用截图作为封面失败')
  } finally {
    coverPickerActionLoading.value = false
  }
}

const handleGovernanceChooseCoverFromScreenshotFolder = async () => {
  if (!coverPickerEditingResourceId.value) {
    notify('warning', '选择封面', '当前资源还没有可用的截图目录')
    return
  }

  try {
    coverPickerActionLoading.value = true
    const screenshotPath = await window.api.dialog.selectScreenshotImage(coverPickerEditingResourceId.value)
    if (screenshotPath) {
      await updateGovernanceCoverPickerPath(String(screenshotPath))
    }
  } catch (error) {
    notify('error', '选择封面', error instanceof Error ? error.message : '从截图文件夹选择封面失败')
  } finally {
    coverPickerActionLoading.value = false
  }
}

const handleGovernanceUseFirstCover = async () => {
  try {
    coverPickerActionLoading.value = true
    const basePath = String(coverPickerFormData.value?.basePath ?? '').trim()
    const result = await window.api.service.analyzeMultiImageDirectory(basePath)
    const coverPath = String(result?.data?.coverPath ?? '').trim() || 'auto://first-cover'
    await updateGovernanceCoverPickerPath(coverPath)
  } catch (error) {
    notify('error', '选择第一张封面', error instanceof Error ? error.message : '选择第一张封面失败')
  } finally {
    coverPickerActionLoading.value = false
  }
}

const handleGovernanceUseVideoRandomFrameCover = async () => {
  const basePath = String(coverPickerFormData.value?.basePath ?? '').trim()
  if (!basePath) {
    notify('warning', '随机帧封面', coverPickerIsVideoFolderCategory.value ? '请先确认番剧目录' : '请先确认视频文件路径')
    return
  }

  try {
    coverPickerVideoFrameLoading.value = true
    if (coverPickerIsVideoFolderCategory.value) {
      const result = await window.api.service.extractVideoSubCoverFrames(basePath)
      const resultType = result?.type ?? 'info'
      const resultMessage = result?.message ?? '番剧随机帧生成完成'

      if (resultType === 'error' || resultType === 'warning') {
        notify(resultType === 'warning' ? 'warning' : 'error', '随机帧封面', resultMessage)
        return
      }

      const rawItems = Array.isArray(result?.data?.items) ? result.data.items : []
      const resolvedItems = await Promise.all(rawItems.map(async (item: any) => {
        const rawCandidates = Array.isArray(item?.coverCandidates) ? item.coverCandidates : []
        const resolvedCandidates = await Promise.all(rawCandidates.map(async (candidate: any) => {
          const coverPath = String(candidate?.coverPath ?? '').trim()
          return {
            label: String(candidate?.label ?? '').trim() || '随机帧',
            coverPath,
            previewSrc: await resolveGovernanceCoverPreviewUrl(coverPath),
            time: Math.max(0, Number(candidate?.time ?? 0))
          }
        }))

        return {
          fileName: String(item?.fileName ?? '').trim(),
          relativePath: String(item?.relativePath ?? '').trim(),
          candidates: resolvedCandidates.filter((candidate) => candidate.coverPath && candidate.previewSrc)
        }
      }))
      governanceVideoSubCoverCandidateItems.value = resolvedItems.filter((item) => item.candidates.length)
      showGovernanceVideoSubCoverCandidateModal.value = governanceVideoSubCoverCandidateItems.value.length > 0
      if (!governanceVideoSubCoverCandidateItems.value.length) {
        notify('warning', '随机帧封面', '已生成番剧随机帧，但预览加载失败')
      }
      return
    }

    const result = await window.api.service.extractVideoCoverFrames(basePath)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '随机帧生成完成'

    if (resultType === 'error' || resultType === 'warning') {
      notify(resultType === 'warning' ? 'warning' : 'error', '随机帧封面', resultMessage)
      return
    }

    const rawCandidates = Array.isArray(result?.data?.coverCandidates) ? result.data.coverCandidates : []
    const resolvedCandidates = await Promise.all(rawCandidates.map(async (candidate: any) => {
      const coverPath = String(candidate?.coverPath ?? '').trim()
      return {
        label: String(candidate?.label ?? '').trim() || '随机帧',
        coverPath,
        previewSrc: await resolveGovernanceCoverPreviewUrl(coverPath),
        time: Math.max(0, Number(candidate?.time ?? 0)),
        group: String(candidate?.group ?? '') === 'fixed' ? 'fixed' : 'random' as const
      }
    }))
    governanceVideoCoverCandidates.value = resolvedCandidates.filter((candidate) => candidate.coverPath && candidate.previewSrc)
    showGovernanceVideoCoverCandidateModal.value = governanceVideoCoverCandidates.value.length > 0
    if (!governanceVideoCoverCandidates.value.length) {
      notify('warning', '随机帧封面', '已生成随机帧，但预览加载失败')
    }
  } catch (error) {
    notify('error', '随机帧封面', error instanceof Error ? error.message : '生成随机帧失败')
  } finally {
    coverPickerVideoFrameLoading.value = false
  }
}

const handleGovernanceClearCover = async () => {
  await updateGovernanceCoverPickerPath('')
}

const handleGovernanceUseAudioCoverCandidate = async (candidate: { coverPath?: string }) => {
  await updateGovernanceCoverPickerPath(String(candidate?.coverPath ?? ''))
  closeGovernanceAudioCoverCandidateModal()
}

const handleGovernanceUseVideoCoverCandidate = async (coverPath: string) => {
  await updateGovernanceCoverPickerPath(coverPath)
  closeGovernanceVideoCoverCandidateModal()
}

const handleGovernanceUseVideoSubCoverCandidate = async (coverPath: string) => {
  await updateGovernanceCoverPickerPath(coverPath)
  closeGovernanceVideoSubCoverCandidateModal()
}

const handleConfirmRelocate = async () => {
  const item = relocateTargetItem.value
  const nextPath = String(relocateTargetPath.value ?? '').trim()
  if (!item || !nextPath) {
    notify('warning', '重定位资源', '请先选择新的文件路径')
    return
  }

  try {
    relocateSaving.value = true
    const [detailResult, categoryResult] = await Promise.all([
      window.api.service.getResourceDetail(item.resourceId),
      window.api.db.getCategoryById(item.categoryId)
    ])

    const detail = detailResult?.data ?? detailResult
    if (!detail) {
      notify('error', '重定位资源', '未能读取资源详情')
      return
    }

    const formData = mapGovernanceResourceDetailToFormData(detail, categoryResult)
    const payload = JSON.parse(JSON.stringify({
      ...formData,
      basePath: nextPath
    }))

    const result = await window.api.service.updateResource(item.resourceId, payload)
    if (result?.type === 'success') {
      notify('success', '重定位资源', String(result?.message ?? '路径已更新'))
      closeRelocateModal()
      await refreshGovernanceIssues()
      return
    }

    notify(result?.type === 'warning' ? 'warning' : 'error', '重定位失败', String(result?.message ?? '操作失败'))
  } catch (error) {
    notify('error', '重定位失败', error instanceof Error ? error.message : '请稍后重试')
  } finally {
    relocateSaving.value = false
  }
}

const handleConfirmCoverPicker = async () => {
  const item = coverPickerItem.value
  if (!item || !coverPickerFormData.value) {
    notify('warning', '选择封面', '当前没有可更新的资源')
    return
  }

  try {
    coverPickerSaving.value = true
    const payload = JSON.parse(JSON.stringify(coverPickerFormData.value))
    const result = await window.api.service.updateResource(item.resourceId, payload)

    if (result?.type === 'success') {
      notify('success', '选择封面', String(result?.message ?? '封面已更新'))
      closeCoverPickerModal()
      await refreshGovernanceIssues()
      return
    }

    notify(result?.type === 'warning' ? 'warning' : 'error', '选择封面', String(result?.message ?? '更新失败'))
  } catch (error) {
    notify('error', '选择封面', error instanceof Error ? error.message : '更新封面失败')
  } finally {
    coverPickerSaving.value = false
  }
}

const handleIssueAction = async (item: IssueRecord, action: IssueAction) => {
  if (action.label === '查看详情') {
    await openResourceDetail(item)
    return
  }

  if (action.label === '选择封面') {
    await openCoverPickerModal(item)
    return
  }

  if (action.label === '重定位资源') {
    openRelocateModal(item)
    return
  }

  if (action.label === '重新扫描') {
    if (!everythingEnabled.value) {
      notify('warning', '重新扫描', 'Everything 已关闭，请先在设置中开启后再使用重新扫描。')
      return
    }

    const normalizedResourceId = String(item.resourceId ?? '').trim()
    if (rescanningIssueIds.value.includes(normalizedResourceId)) {
      return
    }

    rescanningIssueIds.value = [...rescanningIssueIds.value, normalizedResourceId]

    try {
      const result = await window.api.service.rescanMissingResources([item.resourceId])
      if (result?.type === 'success') {
        notify('success', '重新扫描', String(result?.message ?? '操作成功'))
        await refreshGovernanceIssues()
        return
      }

      notify(result?.type === 'warning' ? 'warning' : 'error', '重新扫描', String(result?.message ?? '操作失败'))
      await refreshGovernanceIssues()
    } finally {
      rescanningIssueIds.value = rescanningIssueIds.value.filter((id) => id !== normalizedResourceId)
    }
    return
  }

  if (action.label === '归档') {
    const normalizedResourceId = String(item.resourceId ?? '').trim()
    if (!normalizedResourceId) {
      notify('warning', '归档', '资源ID无效')
      return
    }

    if (!archivingIssueIds.value.includes(normalizedResourceId)) {
      archivingIssueIds.value = [...archivingIssueIds.value, normalizedResourceId]
    }

    const result = await window.api.service.archiveResource(item.resourceId)
    if (result?.type === 'success') {
      await refreshArchiveQueue()
      notify('info', '归档', String(result?.message ?? '已加入归档任务'))
      return
    }

    archivingIssueIds.value = archivingIssueIds.value.filter((id) => id !== normalizedResourceId)
    notify(result?.type === 'warning' ? 'warning' : 'error', '归档失败', String(result?.message ?? '操作失败'))
    return
  }

  if (action.label === '忽略' || action.label === '暂不处理') {
    await setIssueIgnored(item, true)
    return
  }

  if (action.label === '恢复待处理') {
    await setIssueIgnored(item, false)
    return
  }

  if (action.label === '移除资源') {
    await handleDeleteResource(item)
    return
  }

  if (action.label === '移除并删除本地资源') {
    await handleDeleteResourceWithFiles(item)
    return
  }

  notify('info', '功能待接入', `“${action.label}”后续将接入真实治理动作。`)
}


const handleBatchSetIgnored = async (ignored: boolean) => {
  const selectedItems = issueRecords.value.filter((item) => selectedIssueIds.value.includes(item.id))
    .filter((item) => ignored ? item.status !== '已忽略' : item.status === '已忽略')

  if (!selectedItems.length) {
    notify('warning', ignored ? '批量忽略' : '恢复待处理', ignored ? '当前没有可忽略的问题资源' : '当前没有可恢复的问题资源')
    return
  }

  const result = await window.api.service.batchSetGovernanceIssueIgnored(
    selectedItems.map((item) => ({
      resourceId: item.resourceId,
      issueType: item.issueType
    })),
    ignored
  )

  if (result?.type === 'success') {
    notify('success', ignored ? '批量忽略完成' : '批量恢复完成', String(result?.message ?? '操作成功'))
    await refreshGovernanceIssues()
    return
  }

  notify(result?.type === 'warning' ? 'warning' : 'error', ignored ? '批量忽略失败' : '批量恢复失败', String(result?.message ?? '操作失败'))
}

const handleBatchDeleteResources = async () => {
  const selectedItems = selectedIssueRecords.value
  if (!selectedItems.length) {
    notify('warning', '批量移除', '请先选择要移除的问题资源')
    return
  }

  const confirmed = await confirmDialog(
    '批量移除',
    `你确定要删除这些记录吗？\n选中的 ${selectedItems.length} 项问题资源将会消失！`
  )
  if (!confirmed) {
    return
  }

  const result = await window.api.service.deleteResources(selectedItems.map((item) => item.resourceId))
  if (result?.type === 'success') {
    notify('success', '批量移除完成', String(result?.message ?? '操作成功'))
    await refreshGovernanceIssues()
    return
  }

  notify(result?.type === 'warning' ? 'warning' : 'error', '批量移除失败', String(result?.message ?? '操作失败'))
}

const handleBatchDeleteResourcesWithFiles = async () => {
  const selectedItems = selectedIssueRecords.value
  if (!selectedItems.length) {
    notify('warning', '移除并删除本地文件', '请先选择要删除的问题资源')
    return
  }

  const confirmed = await confirmDialog(
    '移除并删除本地文件',
    `确认移除选中的 ${selectedItems.length} 项问题资源吗？\n\n这会删除数据库记录，并尝试删除对应的本地文件或资源目录。\n\n此操作不可恢复，是否继续？`
  )
  if (!confirmed) {
    return
  }

  const results = await Promise.all(
    selectedItems.map((item) => window.api.service.deleteResourceWithFiles(item.resourceId))
  )
  const successCount = results.filter((result) => result?.type === 'success').length
  const failedResult = results.find((result) => result?.type !== 'success')

  if (!failedResult) {
    notify('success', '批量删除完成', `已删除 ${successCount} 项资源`)
    await refreshGovernanceIssues()
    return
  }

  notify(
    failedResult?.type === 'warning' ? 'warning' : 'error',
    '批量删除部分失败',
    `已成功 ${successCount} 项，失败 ${results.length - successCount} 项。${String(failedResult?.message ?? '请稍后重试')}`
  )
  await refreshGovernanceIssues()
}

const handleBatchRescan = async () => {
  if (!selectedIssueRecords.value.length) {
    notify('warning', '批量重扫', '请先选择要处理的问题资源')
    return
  }

  if (!canBatchRescan.value) {
    notify('warning', '批量重扫', '当前仅支持对路径失效资源进行批量重扫')
    return
  }

  batchRescanning.value = true
  try {
    const result = await window.api.service.rescanMissingResources(
      selectedIssueRecords.value.map((item) => item.resourceId)
    )

    if (result?.type === 'success') {
      notify('success', '批量重扫', String(result?.message ?? '操作成功'))
      await refreshGovernanceIssues()
      return
    }

    notify(result?.type === 'warning' ? 'warning' : 'error', '批量重扫', String(result?.message ?? '操作失败'))
    await refreshGovernanceIssues()
  } finally {
    batchRescanning.value = false
  }
}

const handleBatchArchive = async () => {
  if (!selectedIssueRecords.value.length) {
    notify('warning', '批量归档', '请先选择要处理的问题资源')
    return
  }

  if (!canBatchArchive.value) {
    notify('warning', '批量归档', '当前仅支持对可归档的沉睡资源执行批量归档，请先确认已配置归档路径')
    return
  }

  const targetItems = [...selectedIssueRecords.value]
  const targetIds = targetItems
    .map((item) => String(item.resourceId ?? '').trim())
    .filter(Boolean)

  archivingIssueIds.value = Array.from(new Set([...archivingIssueIds.value, ...targetIds]))
  batchArchiving.value = true

  try {
    const batchResult = await window.api.service.archiveResources(targetIds)
    const resultItems = Array.isArray(batchResult?.data?.results) ? batchResult.data.results : []
    const successCount = Number(batchResult?.data?.successCount ?? resultItems.filter((result: any) => result?.type === 'success').length)
    const failedResult = resultItems.find((result: any) => result?.type !== 'success')

    if (!failedResult) {
      await refreshArchiveQueue()
      notify('info', '批量归档', `已加入 ${successCount} 项资源的归档任务`)
      return
    }

    await refreshArchiveQueue()
    notify(
      failedResult?.type === 'warning' ? 'warning' : 'error',
      '批量归档',
      `已加入 ${successCount} 项资源的归档任务，另有 ${resultItems.length - successCount} 项提交失败。${String(failedResult?.message ?? '请稍后重试')}`
    )
  } finally {
    batchArchiving.value = false
  }
}

const handleBatchDangerAction = (key: string) => {
  if (key === '移除并删除本地文件') {
    void handleBatchDeleteResourcesWithFiles()
    return
  }
}

const batchDangerOptions = [
  {
    label: '移除并删除本地文件',
    key: '移除并删除本地文件'
  }
]

const handleOpenArchiveQueue = async () => {
  archiveQueueDrawerVisible.value = true
  archiveQueueLoading.value = true
  try {
    await refreshArchiveQueue()
  } finally {
    archiveQueueLoading.value = false
  }
}

const handleStopArchiveQueue = async () => {
  if (archiveStopping.value) {
    return
  }

  archiveStopping.value = true
  try {
    const result = await window.api.service.stopArchiveQueue()
    notify(result?.type === 'warning' ? 'warning' : 'success', '停止归档', String(result?.message ?? '操作完成'))
    await Promise.all([
      refreshArchiveQueue(),
      refreshGovernanceIssues()
    ])
  } catch (error) {
    notify('error', '停止归档', error instanceof Error ? error.message : '停止归档失败')
  } finally {
    archiveStopping.value = false
  }
}

const handleDeleteArchiveQueueItem = async (queueItemId: string) => {
  const normalizedQueueItemId = String(queueItemId ?? '').trim()
  if (!normalizedQueueItemId || deletingArchiveQueueIds.value.includes(normalizedQueueItemId)) {
    return
  }

  deletingArchiveQueueIds.value = [...deletingArchiveQueueIds.value, normalizedQueueItemId]
  try {
    const result = await window.api.service.deleteArchiveQueueItem(normalizedQueueItemId)
    if (result?.type === 'success') {
      await Promise.all([
        refreshArchiveQueue(),
        refreshGovernanceIssues()
      ])
    }
    notify(result?.type === 'success' ? 'success' : 'warning', '归档队列', String(result?.message ?? '操作完成'))
  } catch (error) {
    notify('error', '归档队列', error instanceof Error ? error.message : '删除队列项失败')
  } finally {
    deletingArchiveQueueIds.value = deletingArchiveQueueIds.value.filter((id) => id !== normalizedQueueItemId)
  }
}

const handleClearCompletedArchiveQueueItems = async () => {
  const targetIds = archiveCompletedQueueItems.value
    .map((item) => String(item.id ?? '').trim())
    .filter(Boolean)

  if (!targetIds.length || clearingCompletedArchiveQueueItems.value) {
    return
  }

  clearingCompletedArchiveQueueItems.value = true
  deletingArchiveQueueIds.value = Array.from(new Set([...deletingArchiveQueueIds.value, ...targetIds]))
  try {
    const results = await Promise.all(
      targetIds.map((queueItemId) => window.api.service.deleteArchiveQueueItem(queueItemId))
    )
    const successCount = results.filter((result) => result?.type === 'success').length
    const failedResult = results.find((result) => result?.type !== 'success')

    await refreshArchiveQueue()

    if (!failedResult) {
      notify('success', '归档队列', `已移除 ${successCount} 条已完成项目`)
      return
    }

    notify(
      failedResult?.type === 'warning' ? 'warning' : 'error',
      '归档队列',
      `已移除 ${successCount} 条已完成项目，另有 ${results.length - successCount} 条移除失败。${String(failedResult?.message ?? '请稍后重试')}`
    )
  } catch (error) {
    notify('error', '归档队列', error instanceof Error ? error.message : '批量移除已完成项目失败')
  } finally {
    deletingArchiveQueueIds.value = deletingArchiveQueueIds.value.filter((id) => !targetIds.includes(id))
    clearingCompletedArchiveQueueItems.value = false
  }
}

const handleRestoreArchivedPackage = async (item: ArchivePackageRecord) => {
  const archiveId = String(item?.id ?? '').trim()
  if (!archiveId || restoringArchivePackageIds.value.includes(archiveId)) {
    return
  }

  restoringArchivePackageIds.value = [...restoringArchivePackageIds.value, archiveId]
  try {
    const result = await window.api.service.restoreArchivedPackage(archiveId)
    const type = result?.type === 'success' ? 'success' : result?.type === 'warning' ? 'warning' : 'error'
    notify(type, '还原归档包', String(result?.message ?? '归档包已加入还原队列'))
    if (result?.type === 'success' || result?.type === 'warning') {
      await Promise.all([
        refreshArchivePackages(),
        refreshArchiveQueue(),
        refreshArchivePathConfigured()
      ])
    }
  } catch (error) {
    notify('error', '还原归档包失败', error instanceof Error ? error.message : String(error))
  } finally {
    if (!archiveQueueItems.value.some((queueItem) =>
      queueItem.archiveId === archiveId
      && String(queueItem.operation ?? 'archive') === 'restore'
      && (queueItem.status === 'queued' || queueItem.status === 'running')
    )) {
      restoringArchivePackageIds.value = restoringArchivePackageIds.value.filter((id) => id !== archiveId)
    }
  }
}

const handleBatchRestoreArchivedPackages = async () => {
  const archiveIds = selectedArchivePackageRecords.value.map((item) => item.id).filter(Boolean)
  if (!archiveIds.length) {
    return
  }

  restoringArchivePackageIds.value = Array.from(new Set([...restoringArchivePackageIds.value, ...archiveIds]))
  try {
    const result = await window.api.service.restoreArchivedPackages(archiveIds)
    const successCount = Number(result?.data?.successCount ?? 0)
    const failedCount = Number(result?.data?.failedCount ?? 0)
    const type = result?.type === 'success' ? 'success' : result?.type === 'warning' ? 'warning' : 'error'
    notify(
      type,
      '批量还原归档包',
      successCount > 0
        ? `已加入 ${successCount} 个还原任务${failedCount ? `，${failedCount} 个提交失败` : ''}`
        : String(result?.message ?? '提交还原任务失败')
    )
    await Promise.all([
      refreshArchivePackages(),
      refreshArchiveQueue()
    ])
  } catch (error) {
    notify('error', '批量还原归档包失败', error instanceof Error ? error.message : String(error))
  } finally {
    const activeRestoreIds = new Set(
      archiveQueueItems.value
        .filter((queueItem) => String(queueItem.operation ?? 'archive') === 'restore' && (queueItem.status === 'queued' || queueItem.status === 'running'))
        .map((queueItem) => String(queueItem.archiveId ?? '').trim())
        .filter(Boolean)
    )
    restoringArchivePackageIds.value = restoringArchivePackageIds.value.filter((id) => activeRestoreIds.has(id))
  }
}

const handleDeleteArchivedPackage = async (item: ArchivePackageRecord) => {
  const archiveId = String(item?.id ?? '').trim()
  if (!archiveId || deletingArchivePackageIds.value.includes(archiveId)) {
    return
  }

  deletingArchivePackageIds.value = [...deletingArchivePackageIds.value, archiveId]
  try {
    const result = await window.api.service.deleteArchivedPackage(archiveId)
    const type = result?.type === 'success' ? 'success' : result?.type === 'warning' ? 'warning' : 'error'
    notify(type, '删除归档包', String(result?.message ?? '归档包已删除'))
    if (result?.type === 'success' || result?.type === 'warning') {
      await Promise.all([
        refreshArchivePackages(),
        refreshArchivePathConfigured()
      ])
    }
  } catch (error) {
    notify('error', '删除归档包失败', error instanceof Error ? error.message : String(error))
  } finally {
    deletingArchivePackageIds.value = deletingArchivePackageIds.value.filter((id) => id !== archiveId)
  }
}

const handleBatchDeleteArchivedPackages = async () => {
  const archiveIds = selectedArchivePackageRecords.value.map((item) => item.id).filter(Boolean)
  if (!archiveIds.length || deletingArchivePackageIds.value.some((id) => archiveIds.includes(id))) {
    return
  }

  const confirmed = await confirmDialog(
    '批量删除归档包',
    `确定删除选中的 ${archiveIds.length} 个归档包吗？\n归档包文件和归档记录都会被移除，资源不会自动还原。`
  )
  if (!confirmed) {
    return
  }

  deletingArchivePackageIds.value = Array.from(new Set([...deletingArchivePackageIds.value, ...archiveIds]))
  try {
    const result = await window.api.service.deleteArchivedPackages(archiveIds)
    const type = result?.type === 'success' ? 'success' : result?.type === 'warning' ? 'warning' : 'error'
    notify(type, '批量删除归档包', String(result?.message ?? '归档包已删除'))
    if (result?.type === 'success' || result?.type === 'warning') {
      selectedArchivePackageIds.value = selectedArchivePackageIds.value.filter((id) => !archiveIds.includes(id))
      await Promise.all([
        refreshArchivePackages(),
        refreshArchivePathConfigured()
      ])
    }
  } catch (error) {
    notify('error', '批量删除归档包失败', error instanceof Error ? error.message : String(error))
  } finally {
    deletingArchivePackageIds.value = deletingArchivePackageIds.value.filter((id) => !archiveIds.includes(id))
  }
}

const getArchivePackageRowKey = (item: ArchivePackageRecord) => item.id

const handleArchivePackageDataTableSelection = (keys: DataTableRowKey[]) => {
  selectedArchivePackageIds.value = keys.map((key) => String(key))
}

const getTagEntityRowKey = (item: TagWorkbenchEntityRecord) => item.id

const tagWorkbenchEntityColumns = computed<DataTableColumns<TagWorkbenchEntityRecord>>(() => [
  {
    type: 'selection',
    fixed: 'left',
    width: 48
  },
  {
    title: tagWorkbenchView.value === 'tags' ? '标签' : '分类',
    key: 'name',
    minWidth: 180,
    ellipsis: {
      tooltip: true
    }
  },
  {
    title: '所属分类',
    key: 'categoryName',
    width: 160,
    render: (row) => renderCategoryPill(row.categoryName, row.categoryEmoji, row.categoryColor)
  },
  {
    title: '使用资源数',
    key: 'resourceCount',
    width: 130,
    sorter: (left, right) => Number(left.resourceCount ?? 0) - Number(right.resourceCount ?? 0)
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render: (row) => {
      const entityKind = currentTagEntityKind.value
      const entityLabel = entityKind === 'tag' ? '标签' : '分类'
      return h(
        'div',
        { class: 'archive-table__actions tag-entity-table__actions' },
        [
          h(
            NButton,
            {
              size: 'tiny',
              tertiary: true,
              class: 'archive-table__action-button',
              onClick: () => openTagEntityRenameModal(row)
            },
            { default: () => '重命名' }
          ),
          h(
            NPopconfirm,
            {
              positiveButtonProps: { type: 'error' },
              onPositiveClick: () => handleDeleteTagEntity(row, entityKind)
            },
            {
              trigger: () => h(
                NButton,
                {
                  size: 'tiny',
                  tertiary: true,
                  type: 'error',
                  class: 'archive-table__action-button'
                },
                { default: () => '删除' }
              ),
              icon: () => h(
                NIcon,
                {
                  color: topThemeTokens.value.error,
                  size: 18
                },
                { default: () => h(AlertCircleOutline) }
              ),
              default: () => h(
                'div',
                { class: 'archive-delete-popconfirm__content' },
                [
                  h('div', `确认删除“${row.name}”？`),
                  h('div', `删除后会解除资源与该${entityLabel}的关联。`)
                ]
              )
            }
          )
        ]
      )
    }
  }
])

const archivePackageDataTableColumns = computed<DataTableColumns<ArchivePackageRecord>>(() => [
  {
    type: 'selection',
    fixed: 'left',
    width: 48
  },
  {
    type: 'expand',
    expandable: (row) => Array.isArray(row.items) && row.items.length > 0,
    renderExpand: (row) => renderArchivePackageExpandedRow(row)
  },
  {
    title: '资源名',
    key: 'title',
    minWidth: 220,
    ellipsis: {
      tooltip: true
    },
    render: (row) => h(
      'div',
      {
        class: 'archive-table__title',
        title: row.title
      },
      row.title
    )
  },
  {
    title: '分类',
    key: 'categoryName',
    width: 140,
    ellipsis: {
      tooltip: true
    },
    render: (row) => {
      const pillStyle = getCategoryPillStyle(row.categoryColor)
      return h(
        'div',
        {
          title: row.categoryName || '未分类',
          style: {
            display: 'inline-flex',
            minHeight: '30px',
            maxWidth: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            padding: '0 12px',
            borderRadius: '999px',
            border: '0',
            whiteSpace: 'nowrap',
            lineHeight: '1',
            fontSize: '12px',
            fontWeight: '800',
            color: pillStyle.color,
            backgroundColor: pillStyle.backgroundColor
          }
        },
        [
          row.categoryEmoji
            ? h(
                'span',
                {
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                    lineHeight: '1'
                  }
                },
                row.categoryEmoji
              )
            : null,
          h(
            'span',
            {
              style: {
                display: 'inline-block',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: '1',
                fontWeight: '800'
              }
            },
            row.categoryName || '未分类'
          )
        ]
      )
    }
  },
  {
    title: '格式',
    key: 'archiveFormat',
    width: 118,
    render: (row) => {
      const visual = getArchiveFormatVisual(row.archiveFormat)
      return h(
        'div',
        { class: `archive-format-chip archive-format-chip--${visual.className}` },
        [
          h(
            NIcon,
            {
              size: 14,
              class: 'archive-format-chip__icon',
              style: {
                display: 'inline-flex',
                transform: 'translateY(2px)'
              }
            },
            { default: () => h(visual.icon) }
          ),
          h('span', { class: 'archive-format-chip__label' }, visual.label)
        ]
      )
    }
  },
  {
    title: '压缩等级',
    key: 'archiveLevel',
    width: 132,
    render: (row) => getArchiveLevelLabel(Number(row.archiveLevel ?? 0))
  },
  {
    title: '原始大小',
    key: 'sourceSize',
    width: 118,
    sorter: (left, right) => Number(left.sourceSize ?? 0) - Number(right.sourceSize ?? 0),
    render: (row) => formatArchiveFileSize(row.sourceSize)
  },
  {
    title: '压缩包大小',
    key: 'archiveSize',
    width: 118,
    sorter: (left, right) => Number(left.archiveSize ?? 0) - Number(right.archiveSize ?? 0),
    render: (row) => formatArchiveFileSize(row.archiveSize)
  },
  {
    title: '归档时间',
    key: 'archivedAt',
    width: 168,
    sorter: (left, right) => Number(left.archivedAt ?? 0) - Number(right.archivedAt ?? 0),
    render: (row) => formatArchiveDateTime(row.archivedAt)
  },
  {
    title: '归档路径',
    key: 'archivePath',
    minWidth: 300,
    ellipsis: {
      tooltip: true
    },
    render: (row) => h(
      'code',
      {
        class: 'archive-naive-table__path',
        title: row.archivePath
      },
      truncateMiddleText(row.archivePath, { head: 22, tail: 24 })
    )
  },
  {
    title: '操作',
    key: 'actions',
    fixed: 'right',
    width: 292,
    render: (row) => h(
      'div',
      { class: 'archive-table__actions archive-naive-table__actions' },
      [
        h(
          NButton,
          {
            size: 'tiny',
            tertiary: true,
            class: 'archive-table__action-button',
            loading: restoringArchivePackageIds.value.includes(row.id),
            disabled: deletingArchivePackageIds.value.includes(row.id),
            onClick: () => handleRestoreArchivedPackage(row)
          },
          { default: () => '还原' }
        ),
        h(
          NPopconfirm,
          {
            disabled: restoringArchivePackageIds.value.includes(row.id),
            positiveButtonProps: { type: 'error' },
            onPositiveClick: () => handleDeleteArchivedPackage(row)
          },
          {
            trigger: () => h(
              NButton,
              {
                size: 'tiny',
                tertiary: true,
                type: 'error',
                class: 'archive-table__action-button',
                loading: deletingArchivePackageIds.value.includes(row.id),
                disabled: restoringArchivePackageIds.value.includes(row.id)
              },
              { default: () => '删除' }
            ),
            icon: () => h(
              NIcon,
              {
                color: topThemeTokens.value.error,
                size: 18
              },
              { default: () => h(AlertCircleOutline) }
            ),
            default: () => h(
              'div',
              { class: 'archive-delete-popconfirm__content' },
              [
                h('div', `确认删除“${row.title}”？`),
                h('div', '删除后资源将彻底消失，无法找回！')
              ]
            )
          }
        ),
        h(
          NButton,
          {
            size: 'tiny',
            tertiary: true,
            class: 'archive-table__action-button archive-table__action-button--wide',
            onClick: () => handleCopyIssuePath(row.archivePath)
          },
          { default: () => '复制路径' }
        ),
        h(
          NButton,
          {
            size: 'tiny',
            tertiary: true,
            class: 'archive-table__action-button archive-table__action-button--wide',
            onClick: () => handleOpenArchiveOutputDirectory(row.archivePath)
          },
          { default: () => '打开目录' }
        )
      ]
    )
  }
])

const handleSettingsChanged = () => {
  void Promise.all([
    refreshEverythingEnabled(),
    refreshArchivePathConfigured()
  ])
}

const handleArchiveProgressToastDismiss = () => {
  archiveProgressToastDismissed.value = true
  archiveProgressToastVisible.value = false
}

const handleArchiveProgressEvent = (event: Event) => {
  const customEvent = event as CustomEvent<{
    taskId?: string
    operation?: 'archive' | 'restore'
    archiveId?: string
    resourceId?: string
    title?: string
    message?: string
    progress?: number
    current?: number
    total?: number
    done?: boolean
  }>
  const detail = customEvent.detail ?? {}
  const operation = String(detail.operation ?? 'archive') === 'restore' ? 'restore' : 'archive'
  archiveProgressTitle.value = String(detail.title ?? (operation === 'restore' ? '资源还原' : '资源归档')).trim() || (operation === 'restore' ? '资源还原' : '资源归档')
  archiveProgressSubtitle.value = String(detail.message ?? '').trim() || (operation === 'restore' ? '正在还原资源' : '正在归档资源')
  const progress = Math.max(0, Math.min(100, Math.round(Number(detail.progress ?? 0))))
  const current = Math.max(0, Number(detail.current ?? 1))
  const total = Math.max(0, Number(detail.total ?? 1))
  archiveProgressPercent.value = progress
  archiveProgressResourceTitle.value = `第 ${current} / ${total} 个${operation === 'restore' ? '还原任务' : '归档任务'}`
  const taskId = String(detail.taskId ?? '').trim()
  if (taskId) {
    archiveQueueItems.value = archiveQueueItems.value.map((item) => item.id === taskId
      ? {
          ...item,
          operation,
          archiveId: String(detail.archiveId ?? item.archiveId ?? '').trim(),
          resourceId: String(detail.resourceId ?? item.resourceId ?? '').trim(),
          status: detail.done ? (item.status === 'cancelled' ? 'cancelled' : 'completed') : 'running',
          progress,
          currentIndex: current,
          totalCount: total,
          message: archiveProgressSubtitle.value
        }
      : item)
  }

  if (detail.done) {
    archiveProgressToastVisible.value = false
    archiveProgressToastDismissed.value = false
    return
  }

  if (!archiveProgressToastDismissed.value) {
    archiveProgressToastVisible.value = true
  }
}

const handleResourceArchiveFinished = (event: Event) => {
  const customEvent = event as CustomEvent<{ taskId?: string; operation?: 'archive' | 'restore'; archiveId?: string; resourceId?: string; success?: boolean }>
  const normalizedResourceId = String(customEvent.detail?.resourceId ?? '').trim()
  const normalizedArchiveId = String(customEvent.detail?.archiveId ?? '').trim()
  const normalizedTaskId = String(customEvent.detail?.taskId ?? '').trim()
  const operation = String(customEvent.detail?.operation ?? 'archive') === 'restore' ? 'restore' : 'archive'

  if (operation === 'restore' && normalizedArchiveId) {
    restoringArchivePackageIds.value = restoringArchivePackageIds.value.filter((id) => id !== normalizedArchiveId)
  } else if (normalizedResourceId) {
    archivingIssueIds.value = archivingIssueIds.value.filter((id) => id !== normalizedResourceId)
  } else {
    archivingIssueIds.value = []
  }

  if (normalizedTaskId) {
    void refreshArchiveQueue()
  }

  if (customEvent.detail?.success) {
    if (activeModule.value === 'issues') {
      void Promise.all([
        refreshGovernanceIssues(),
        refreshArchivePackages(),
        refreshArchiveQueue()
      ])
      return
    }

    void Promise.all([
      refreshWorkbenchSummary(),
      refreshArchivePackages(),
      refreshArchiveQueue()
    ])
  }
}

onMounted(() => {
  window.addEventListener('mousemove', handleDetailDrawerResizeMove)
  window.addEventListener('mouseup', handleDetailDrawerResizeEnd)
  window.addEventListener('app-settings-changed', handleSettingsChanged as EventListener)
  window.addEventListener('resource-archive-progress', handleArchiveProgressEvent as EventListener)
  window.addEventListener('resource-archive-finished', handleResourceArchiveFinished as EventListener)
  void loadGovernanceIssues()
  void refreshArchiveQueue().catch(() => {})
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleDetailDrawerResizeMove)
  window.removeEventListener('mouseup', handleDetailDrawerResizeEnd)
  window.removeEventListener('app-settings-changed', handleSettingsChanged as EventListener)
  window.removeEventListener('resource-archive-progress', handleArchiveProgressEvent as EventListener)
  window.removeEventListener('resource-archive-finished', handleResourceArchiveFinished as EventListener)
  document.body.style.userSelect = ''
})

watch(
  [
    activeModule,
    activeIssueTab,
    activeBrokenPathSubtype,
    activeLongUnvisitedBucket,
    searchKeyword,
    selectedCategory,
    selectedRating,
    selectedSort,
    onlyFavorite
  ],
  () => {
    void loadGovernanceIssues()
    void loadTagWorkbench()
    void loadArchiveWorkbench()
  }
)

watch(
  [tagWorkbenchView, tagWorkbenchCategory, tagWorkbenchKeyword],
  () => {
    const currentIds = new Set(currentTagEntityRows.value.map((item) => item.id))
    selectedTagEntityIds.value = selectedTagEntityIds.value.filter((id) => currentIds.has(id))
  }
)

watch(activeIssueTab, (value) => {
  if (value !== 'brokenPath') {
    activeBrokenPathSubtype.value = 'all'
  }
  if (value !== 'longUnvisited') {
    activeLongUnvisitedBucket.value = 'all'
  }
})

watch(
  () => selectedDetailResource.value?.rating,
  (rating) => {
    detailRatingDraft.value = Number(rating ?? -1)
  },
  { immediate: true }
)
</script>

<template>
  <section class="governance-page" :style="pageStyle">
    <AppScrollbar class="governance-page__scrollbar">
      <div class="governance-page__content">
        <BackgroundProgressToast
          :show="archiveProgressToastVisible"
          :progress="archiveProgressPercent"
          title="正在后台归档资源"
          :subtitle-lines="[
            archiveProgressResourceTitle,
            archiveProgressTitle,
            archiveProgressSubtitle
          ].filter(Boolean)"
          :clickable="false"
          @close="handleArchiveProgressToastDismiss"
        />

        <header class="workbench-hero">
          <div class="workbench-hero__head">
            <div class="workbench-hero__title-block">
              <h1>资源治理工作台</h1>
              <p>集中处理问题资源、组织结构与归档动作</p>
            </div>

            <div class="workbench-hero__actions">
              <n-button type="primary" @click="handleRefreshWorkbench">刷新问题资源</n-button>
            </div>
          </div>

          <div class="module-grid" aria-label="治理模块">
            <button
              v-for="module in modules"
              :key="module.key"
              type="button"
              class="module-card"
              :class="{ 'module-card--active': module.key === activeModule }"
              @click="activeModule = module.key"
            >
              <span class="module-card__eyebrow">{{ module.eyebrow }}</span>
              <strong class="module-card__title">{{ module.title }}</strong>
              <div class="module-card__metric">
                <n-number-animation
                  :from="0"
                  :to="module.metricValue"
                  :precision="module.metricValuePrecision ?? 0"
                  show-separator
                />
                <span v-if="module.metricSuffix" class="module-card__metric-suffix">{{ module.metricSuffix }}</span>
                <template v-if="module.metricSecondaryValue !== undefined">
                  <span class="module-card__metric-divider">/</span>
                  <n-number-animation
                    :from="0"
                    :to="module.metricSecondaryValue"
                    :precision="module.metricSecondaryPrecision ?? 0"
                    show-separator
                  />
                  <span v-if="module.metricSecondarySuffix" class="module-card__metric-suffix">{{ module.metricSecondarySuffix }}</span>
                </template>
              </div>
              <span v-if="module.status" class="module-card__status">{{ module.status }}</span>
              <span class="module-card__hint">{{ module.hint }}</span>
            </button>
          </div>
        </header>

        <section v-if="activeModule === 'issues'" class="issues-workbench">
          <section class="issues-toolbar">
            <div class="issues-toolbar__main">
              <div class="issues-toolbar__copy">
                <h2>问题资源管理</h2>
                <p>聚焦不可用、信息缺失与长期未访问资源，支持快速筛选和集中治理。</p>
              </div>

              <div class="issues-tabs" role="tablist" aria-label="问题类型">
                <button
                  v-for="tab in issueTabs"
                  :key="tab.key"
                  type="button"
                  class="issues-tab"
                  :class="{ 'issues-tab--active': tab.key === activeIssueTab }"
                  :aria-selected="tab.key === activeIssueTab"
                  @click="activeIssueTab = tab.key"
                >
                  <span>{{ tab.label }}</span>
                  <strong>{{ tab.count }}</strong>
                </button>
              </div>
            </div>

            <div v-if="activeIssueTab === 'brokenPath'" class="issues-subtabs" role="tablist" aria-label="路径失效子类型">
              <button
                v-for="subTab in brokenPathSubTabs"
                :key="subTab.key"
                type="button"
                class="issues-subtab"
                :class="{ 'issues-subtab--active': subTab.key === activeBrokenPathSubtype }"
                :aria-selected="subTab.key === activeBrokenPathSubtype"
                @click="activeBrokenPathSubtype = subTab.key"
              >
                <span>{{ subTab.label }}</span>
                <strong>{{ subTab.count }}</strong>
              </button>
            </div>

            <div v-else-if="activeIssueTab === 'longUnvisited'" class="issues-subtabs" role="tablist" aria-label="沉睡资源区间">
              <button
                v-for="subTab in longUnvisitedSubTabs"
                :key="subTab.key"
                type="button"
                class="issues-subtab"
                :class="{ 'issues-subtab--active': subTab.key === activeLongUnvisitedBucket }"
                :aria-selected="subTab.key === activeLongUnvisitedBucket"
                @click="activeLongUnvisitedBucket = subTab.key"
              >
                <span>{{ subTab.label }}</span>
                <strong>{{ subTab.count }}</strong>
              </button>
            </div>

            <div class="issues-toolbar__utility">
              <div class="issues-toolbar__utility-label">
                <span>辅助筛选</span>
                <p>按标题、分类与评分进一步收窄。</p>
              </div>

              <div class="issues-toolbar__utility-controls">
                <div class="issues-toolbar__filters">
                  <n-input v-model:value="searchKeyword" clearable placeholder="搜索标题、分类、标签或问题说明" />
                  <n-select v-model:value="selectedCategory" :options="categoryOptions" />
                  <n-select v-model:value="selectedRating" :options="ratingOptions" />
                  <n-select v-model:value="selectedSort" :options="sortOptions" />
                  <label class="issues-toggle issues-toggle--filter">
                    <n-checkbox :checked="onlyFavorite" @update:checked="onlyFavorite = $event" />
                    <span>仅看收藏资源</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="issues-toolbar__stats">
              <article
                v-for="card in issueInsightCards"
                :key="card.key"
                class="issues-stat-card"
                :class="`issues-stat-card--${card.tone ?? 'default'}`"
              >
                <span>{{ card.label }}</span>
                <strong>
                  <n-number-animation :from="0" :to="card.count" show-separator />
                </strong>
                <div class="issues-stat-card__summary">{{ card.summary }}</div>
              </article>
            </div>
          </section>

          <section v-if="issueStats.selectedCount" class="issues-batch-bar">
            <div class="issues-batch-bar__copy">
              <strong>已选择 {{ issueStats.selectedCount }} 项问题资源</strong>
              <span>{{ selectedIssueTypeSummary.message }}</span>
              <button type="button" class="issues-batch-bar__clear" @click="selectedIssueIds = []">清空选择</button>
            </div>
            <div class="issues-batch-bar__actions">
              <div class="issues-batch-bar__group">
                <n-button @click="handleBatchSetIgnored(true)">批量设为忽略</n-button>
                <n-button
                  v-if="activeIssueTab === 'longUnvisited'"
                  :disabled="!canBatchArchive"
                  :loading="batchArchiving"
                  @click="handleBatchArchive"
                >
                  批量归档
                </n-button>
                <n-button
                  v-else
                  :disabled="!canBatchRescan"
                  :loading="batchRescanning"
                  @click="handleBatchRescan"
                >
                  批量重扫
                </n-button>
              </div>
              <div class="issues-batch-bar__group">
                <n-button @click="handleBatchDeleteResources">批量移除</n-button>
              </div>
              <div class="issues-batch-bar__group">
                <n-dropdown trigger="click" :options="batchDangerOptions" @select="(key) => handleBatchDangerAction(String(key))">
                  <n-button type="warning" secondary>更多危险操作</n-button>
                </n-dropdown>
              </div>
            </div>
          </section>

          <section class="issues-list-panel">
            <header class="issues-list-panel__header">
              <label class="issues-select-all">
                <n-checkbox :checked="allVisibleSelected" @update:checked="toggleSelectAllVisible" />
                <span>全选当前结果</span>
              </label>
            </header>

            <div v-if="issueRecords.length" class="issues-list">
          <template v-if="activeIssueTab === 'duplicateResource' || activeIssueTab === 'all'">
            <article
              v-for="group in duplicateIssueGroups"
              :key="group.key"
              class="issue-card issue-card--duplicate-group"
            >
              <div class="issue-card__select">
                <n-checkbox
                  :checked="isDuplicateGroupSelected(group)"
                  :indeterminate="isDuplicateGroupIndeterminate(group)"
                  @update:checked="toggleDuplicateGroupSelection(group, $event)"
                />
              </div>

              <div class="issue-duplicate-group">
                <header class="issue-duplicate-group__header">
                  <div>
                    <h3>{{ group.title }}</h3>
                    <div class="issue-duplicate-group__meta">
                      <n-tag size="small" round :bordered="false" type="error">疑似重复</n-tag>
                      <n-tag size="small" round :bordered="false" :color="{ color: colorAlpha(group.categoryColor, 0.14), textColor: group.categoryColor }">
                        {{ group.category }}
                      </n-tag>
                      <span>{{ group.items.length }} 项资源名称相同</span>
                    </div>
                  </div>
                </header>

                <div class="issue-duplicate-group__list">
                  <section
                    v-for="item in group.items"
                    :key="item.id"
                    class="issue-duplicate-item"
                  >
                    <div class="issue-cover issue-duplicate-item__cover" :class="`issue-cover--${item.coverKind}`">
                      <img v-if="item.coverUrl" :src="item.coverUrl" :alt="item.title" class="issue-cover__image">
                      <span :class="{ 'issue-cover__badge': item.coverUrl }">{{ item.coverLabel }}</span>
                    </div>

                    <div class="issue-duplicate-item__main">
                      <div class="issue-duplicate-item__head">
                        <h4>{{ item.title }}</h4>
                        <div class="issue-card__rating issue-duplicate-item__rating">
                          <n-rate
                            readonly
                            allow-half
                            size="small"
                            :value="getIssueRatingValue(item.rating)"
                          />
                          <span>{{ item.rating }}</span>
                        </div>
                        <n-tag size="small" round :bordered="false" :type="item.status === '已忽略' ? 'warning' : 'success'">
                          {{ item.status }}
                        </n-tag>
                      </div>
                      <p>{{ item.issueDetail }}</p>
                      <div v-if="item.resourcePath" class="issue-duplicate-item__path">
                        <span>路径</span>
                        <code>{{ item.resourcePath }}</code>
                      </div>
                      <div class="issue-card__timeline issue-duplicate-item__timeline">
                        <span class="issue-card__timeline-primary">{{ getIssuePrimaryTime(item).label }}：{{ getIssuePrimaryTime(item).value }}</span>
                        <span>{{ getIssueSecondaryTime(item).label }}：{{ getIssueSecondaryTime(item).value }}</span>
                      </div>
                    </div>

                    <div class="issue-duplicate-item__actions">
                      <n-button size="small" tertiary @click="handleIssueEditResource(item)">编辑</n-button>
                      <n-button size="small" type="primary" @click="openResourceDetail(item)">查看详情</n-button>
                      <n-dropdown
                        trigger="click"
                        :options="duplicateIssueOverflowOptions"
                        @select="(key) => handleIssueAction(item, { label: String(key), tone: 'error' })"
                      >
                        <n-button size="small" tertiary class="issue-card__more-action">
                          <span>更多</span>
                          <span class="issue-card__more-caret" aria-hidden="true"></span>
                        </n-button>
                      </n-dropdown>
                    </div>
                  </section>
                </div>
              </div>
            </article>
          </template>

          <template v-if="activeIssueTab !== 'duplicateResource'">
          <article v-for="item in nonDuplicateIssueRecords" :key="item.id" class="issue-card">
            <div class="issue-card__select">
              <n-checkbox
                :checked="selectedIssueIds.includes(item.id)"
                @update:checked="toggleIssueSelection(item.id, $event)"
              />
            </div>

            <div class="issue-cover" :class="`issue-cover--${item.coverKind}`">
              <img v-if="item.coverUrl" :src="item.coverUrl" :alt="item.title" class="issue-cover__image">
              <span :class="{ 'issue-cover__badge': item.coverUrl }">{{ item.coverLabel }}</span>
            </div>

            <div class="issue-card__main">
              <div class="issue-card__head">
                <div class="issue-card__title-wrap">
                  <h3>{{ item.title }}</h3>
                  <div class="issue-card__issue-line">
                    <n-tag size="small" round :bordered="false" type="error">
                      {{ getIssuePrimaryReason(item) }}
                    </n-tag>
                    <n-tag
                      v-if="getIssueSecondaryReason(item)"
                      size="small"
                      round
                      :bordered="false"
                      class="issue-card__reason-tag"
                    >
                      原因：{{ getIssueSecondaryReason(item) }}
                    </n-tag>
                  </div>
                  <div class="issue-card__meta-row">
                    <n-tag size="small" round :bordered="false" :color="{ color: colorAlpha(item.categoryColor, 0.14), textColor: item.categoryColor }">
                      {{ item.category }}
                    </n-tag>
                    <div class="issue-card__rating">
                      <n-rate
                        readonly
                        allow-half
                        size="small"
                        :value="getIssueRatingValue(item.rating)"
                      />
                      <span>{{ item.rating }}</span>
                    </div>
                    <div class="issue-card__status-group">
                      <n-tag size="small" round :bordered="false" :type="item.status === '已忽略' ? 'warning' : 'success'">
                        {{ item.status }}
                      </n-tag>
                      <button type="button" class="issue-card__status-action" @click="handleIssueAction(item, { label: getIssueStatusActionLabel(item), tone: 'default' })">
                        {{ getIssueStatusActionLabel(item) }}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="issue-card__signals">
                  <span>{{ item.favorite ? '已收藏' : '未收藏' }}</span>
                </div>
              </div>

              <p class="issue-card__detail">{{ item.issueDetail }}</p>
              <div v-if="item.currentRecordPath" class="issue-card__record-path">
                <div class="issue-card__record-path-head">
                  <div class="issue-card__record-path-inline">
                    <span>{{ item.currentRecordLabel || '当前路径' }}</span>
                    <code :title="item.currentRecordPath">{{ truncateMiddleText(item.currentRecordPath || '', { head: 16, tail: 20 }) }}</code>
                  </div>
                  <div class="issue-card__record-path-actions">
                    <n-button size="tiny" tertiary @click="handleCopyIssuePath(item.currentRecordPath || '')">复制</n-button>
                    <n-button
                      v-if="item.currentRecordDirectoryPath"
                      size="tiny"
                      tertiary
                      @click="handleOpenIssueDirectory(item.currentRecordDirectoryPath || '')"
                    >
                      打开目录
                    </n-button>
                  </div>
                </div>
              </div>

              <div class="issue-card__tags">
                <span v-for="tag in item.tags" :key="tag" class="issue-chip">{{ tag }}</span>
              </div>

              <div class="issue-card__footer">
                <div class="issue-card__timeline">
                  <span class="issue-card__timeline-primary">{{ getIssuePrimaryTime(item).label }}：{{ getIssuePrimaryTime(item).value }}</span>
                  <span>{{ getIssueSecondaryTime(item).label }}：{{ getIssueSecondaryTime(item).value }}</span>
                </div>

                <div class="issue-card__actions">
                  <n-button
                    v-for="action in getIssueVisibleActions(item, item.actions)"
                    :key="action.label"
                    size="small"
                    :type="getIssueActionButtonType(item, action)"
                    :secondary="isIssueActionSecondary(item, action)"
                    :tertiary="isIssueActionTertiary(item, action)"
                    :loading="isIssueActionLoading(item, action)"
                    :disabled="isIssueActionDisabled(item, action)"
                    :class="{ 'issue-card__action--primary': isIssuePrimaryAction(item, action) }"
                    @click="handleIssueAction(item, action)"
                  >
                    {{ action.label }}
                  </n-button>
                  <n-dropdown
                    v-if="getIssueOverflowOptions(item, item.actions).length"
                    trigger="click"
                    :options="getIssueOverflowOptions(item, item.actions)"
                    @select="(key) => handleIssueAction(item, { label: String(key), tone: issueDangerActionLabels.has(String(key)) ? 'error' : 'default' })"
                  >
                    <n-button size="small" tertiary class="issue-card__more-action">
                      <span>更多</span>
                      <span class="issue-card__more-caret" aria-hidden="true"></span>
                    </n-button>
                  </n-dropdown>
                </div>
              </div>
            </div>
          </article>
          </template>
            </div>

            <div v-else class="issues-empty">
              <strong>{{ loading ? '正在加载问题资源…' : '当前筛选条件下没有命中的问题资源' }}</strong>
              <span>{{ loading ? '正在从本地数据库读取治理工作台数据。' : '可以切换问题类型、放宽分类或评分筛选，或者取消“仅看收藏资源”。' }}</span>
            </div>
          </section>
        </section>

        <section v-else-if="activeModule === 'archive'" class="archive-workbench">
          <section v-if="archiveRunningQueueItem" class="archive-progress-card">
            <div class="archive-progress-card__copy">
              <div class="archive-progress-card__eyebrow">{{ archiveRunningEyebrow }}</div>
              <strong>{{ archiveRunningQueueItem.title }}</strong>
              <p>{{ archiveProgressResourceTitle }} · {{ archiveProgressSubtitle }}</p>
              <span v-if="archiveQueuedCount" class="archive-progress-card__queued">后续还有 {{ archiveQueuedCount }} {{ archiveQueuedHintLabel }}</span>
            </div>
            <div class="archive-progress-card__side">
              <div class="archive-progress-card__percent">{{ archiveProgressPercent }}%</div>
              <n-progress
                type="line"
                :percentage="archiveProgressPercent"
                :show-indicator="false"
                status="info"
                class="archive-progress-card__progress"
              />
              <n-button
                type="warning"
                secondary
                :loading="archiveStopping"
                @click="handleStopArchiveQueue"
              >
                {{ archiveStopActionLabel }}
              </n-button>
            </div>
          </section>

          <section class="archive-panel">
            <div class="archive-panel__head">
              <div>
                <h2>已归档资源包</h2>
                <p>按标题、分类与格式快速查看已生成的归档包。</p>
              </div>
            </div>

            <div class="archive-panel__filters">
              <n-input v-model:value="archiveFilterKeyword" clearable placeholder="搜索标题、分类、格式或归档路径" />
              <n-select v-model:value="archiveFilterCategory" :options="archiveCategoryOptions" />
              <n-select v-model:value="archiveFilterFormat" :options="archiveFormatOptions" />
            </div>

            <div v-if="selectedArchivePackageIds.length" class="archive-batch-bar">
              <div class="archive-batch-bar__copy">
                <strong>已选择 {{ selectedArchivePackageIds.length }} 个归档包</strong>
                <span>可以批量加入还原队列，或移除归档包文件与记录。</span>
              </div>
              <div class="archive-batch-bar__actions">
                <button type="button" class="archive-batch-bar__clear" @click="selectedArchivePackageIds = []">清空选择</button>
                <n-button
                  type="primary"
                  secondary
                  :disabled="selectedArchivePackageRecords.some((item) => restoringArchivePackageIds.includes(item.id) || deletingArchivePackageIds.includes(item.id))"
                  @click="handleBatchRestoreArchivedPackages"
                >批量还原</n-button>
                <n-button
                  type="error"
                  secondary
                  :disabled="selectedArchivePackageRecords.some((item) => restoringArchivePackageIds.includes(item.id) || deletingArchivePackageIds.includes(item.id))"
                  @click="handleBatchDeleteArchivedPackages"
                >批量移除</n-button>
              </div>
            </div>

            <div v-if="archivePackagesLoading" class="archive-empty">
              <strong>正在加载归档包记录…</strong>
              <span>正在读取本地归档记录与包大小统计。</span>
            </div>

            <template v-else-if="filteredArchivePackages.length">
              <div class="archive-naive-table-panel">
                <n-data-table
                  class="archive-naive-table"
                  size="small"
                  :bordered="false"
                  :single-line="false"
                  :columns="archivePackageDataTableColumns"
                  :data="filteredArchivePackages"
                  :row-key="getArchivePackageRowKey"
                  :checked-row-keys="selectedArchivePackageIds"
                  :pagination="{ pageSize: 10 }"
                  :scroll-x="1290"
                  :scrollbar-props="archiveDataTableScrollbarProps"
                  @update:checked-row-keys="handleArchivePackageDataTableSelection"
                />
              </div>
            </template>

            <div v-else class="archive-empty">
              <strong>当前没有命中的归档包记录</strong>
              <span>可以放宽标题、分类或格式筛选，或者先从沉睡资源发起归档。</span>
            </div>
          </section>

          <button type="button" class="archive-queue-fab" @click="handleOpenArchiveQueue">
            <div class="archive-queue-fab__content">
              <n-icon size="18" class="archive-queue-fab__icon">
                <FileTrayStackedOutline />
              </n-icon>
              <strong>归档队列</strong>
              <span>{{ archiveQueueCount }} 项</span>
            </div>
          </button>
        </section>

        <section v-else-if="activeModule === 'tags'" class="tag-workbench">
          <section class="issues-toolbar">
            <div class="issues-toolbar__main">
              <div class="issues-toolbar__copy">
                <h2>标签 / 分类管理</h2>
                <p>查看标签与分类的使用情况，优先整理未使用项。</p>
              </div>

              <div class="issues-tabs" role="tablist" aria-label="标签分类类型">
                <button
                  v-for="item in tagWorkbenchViewOptions"
                  :key="item.key"
                  type="button"
                  class="issues-tab"
                  :class="{ 'issues-tab--active': tagWorkbenchView === item.key }"
                  :aria-selected="tagWorkbenchView === item.key"
                  @click="tagWorkbenchView = item.key"
                >
                  <span>{{ item.label }}</span>
                  <strong>{{ item.count }}</strong>
                </button>
                <n-button
                  secondary
                  type="warning"
                  :disabled="!unusedCurrentTagEntityRecords.length"
                  :loading="tagEntityBatchDeleting"
                  @click="handleCleanUnusedTagEntities"
                >
                  清理未使用{{ currentTagEntityKind === 'tag' ? '标签' : '分类' }}
                </n-button>
              </div>
            </div>

            <div class="issues-toolbar__utility">
              <div class="issues-toolbar__utility-label">
                <span>辅助筛选</span>
                <p>按名称与所属分类进一步收窄。</p>
              </div>

              <div class="issues-toolbar__utility-controls">
                <div class="tag-workbench__filters">
                  <n-input v-model:value="tagWorkbenchKeyword" clearable placeholder="搜索标签或分类" />
                  <n-select v-model:value="tagWorkbenchCategory" :options="tagWorkbenchCategoryOptions" />
                </div>
              </div>
            </div>

            <div class="issues-toolbar__stats tag-workbench__stats">
              <article
                v-for="item in tagWorkbenchSummaryCards"
                :key="item.label"
                class="issues-stat-card"
              >
                <span>{{ item.label }}</span>
                <strong>
                  <n-number-animation :from="0" :to="item.value" show-separator />
                </strong>
                <div class="issues-stat-card__summary">{{ item.hint }}</div>
              </article>
            </div>
          </section>

          <section v-if="selectedTagEntityIds.length" class="archive-batch-bar tag-entity-batch-bar">
            <div class="archive-batch-bar__copy">
              <strong>已选择 {{ selectedTagEntityIds.length }} 个{{ currentTagEntityKind === 'tag' ? '标签' : '分类' }}</strong>
              <span>可以批量删除并解除资源关联。</span>
            </div>
            <div class="archive-batch-bar__actions">
              <button type="button" class="archive-batch-bar__clear" @click="selectedTagEntityIds = []">清空选择</button>
              <n-button
                type="error"
                secondary
                :loading="tagEntityBatchDeleting"
                :disabled="!selectedTagEntityRecords.length"
                @click="handleBatchDeleteTagEntities"
              >
                批量删除
              </n-button>
            </div>
          </section>

          <div class="tag-table-panel">
            <n-data-table
              class="archive-naive-table tag-entity-table"
              size="small"
              :bordered="false"
              :single-line="false"
              :loading="tagWorkbenchLoading"
              :columns="tagWorkbenchEntityColumns"
              :data="currentTagEntityRows"
              :row-key="getTagEntityRowKey"
              :checked-row-keys="selectedTagEntityIds"
              :pagination="{ pageSize: 10 }"
              @update:checked-row-keys="handleTagEntityTableSelection"
            />
          </div>
        </section>

        <section v-else class="module-placeholder">
          <span>工作台模块</span>
          <strong>模块待接入</strong>
          <p>当前模块暂未配置展示内容。</p>
        </section>

        <n-modal
          v-model:show="tagEntityRenameVisible"
          preset="card"
          :title="`重命名${tagEntityRenameKind === 'tag' ? '标签' : '分类'}`"
          class="tag-entity-rename-modal"
          :style="{ width: '560px', maxWidth: '92vw' }"
          :bordered="false"
        >
          <div class="tag-entity-rename-modal__content">
            <n-input
              v-model:value="tagEntityRenameDraft"
              clearable
              placeholder="请输入新名称"
              @keyup.enter="handleRenameTagEntity"
            />
            <div class="tag-entity-rename-modal__footer">
              <n-button @click="tagEntityRenameVisible = false">取消</n-button>
              <n-button
                type="primary"
                :loading="tagEntityRenameSaving"
                :disabled="!tagEntityRenameDraft.trim()"
                @click="handleRenameTagEntity"
              >
                确认重命名
              </n-button>
            </div>
          </div>
        </n-modal>
      </div>
    </AppScrollbar>

    <transition name="archive-queue-panel">
      <aside v-if="archiveQueueDrawerVisible" class="archive-queue-panel">
        <div class="archive-queue-panel__header">
          <div class="archive-queue-panel__title-wrap">
            <strong>归档队列</strong>
            <span>{{ archiveQueueCount }} 项任务</span>
          </div>
          <div class="archive-queue-panel__header-actions">
            <n-button
              size="tiny"
              tertiary
              :disabled="!archiveCompletedQueueCount"
              :loading="clearingCompletedArchiveQueueItems"
              @click="handleClearCompletedArchiveQueueItems"
            >
              移除已完成
            </n-button>
            <button type="button" class="archive-queue-panel__close" @click="archiveQueueDrawerVisible = false">
              ×
            </button>
          </div>
        </div>

        <div class="archive-queue-panel__hint">
          当前会话中的归档任务，进行中不可删除。
        </div>

        <AppScrollbar class="archive-queue-panel__scroll">
          <div v-if="archiveQueueLoading" class="archive-empty archive-empty--compact">
            <strong>正在读取归档队列…</strong>
            <span>请稍候。</span>
          </div>
          <div v-else-if="archiveQueueItems.length" class="archive-queue-list">
            <article v-for="item in archiveQueueItems" :key="item.id" class="archive-queue-item">
              <div class="archive-queue-item__head">
                <strong :title="item.title">{{ item.title }}</strong>
                <n-tag size="small" round :type="getArchiveQueueStatusType(item.status)">
                  {{ getArchiveQueueStatusLabel(item.status) }}
                </n-tag>
              </div>
              <div class="archive-queue-item__message-row">
                <div class="archive-queue-item__message">{{ item.message || '等待归档' }}</div>
                <n-button
                  size="tiny"
                  tertiary
                  :disabled="item.status === 'running'"
                  :loading="deletingArchiveQueueIds.includes(item.id)"
                  @click="handleDeleteArchiveQueueItem(item.id)"
                >
                  删除
                </n-button>
              </div>
              <n-progress
                v-if="item.status === 'running' || item.progress > 0"
                type="line"
                :percentage="item.progress"
                :show-indicator="false"
                status="info"
              />
            </article>
          </div>
          <div v-else class="archive-empty archive-empty--compact">
            <strong>当前没有归档队列任务</strong>
            <span>从沉睡资源发起归档后，会在这里看到排队和完成记录。</span>
          </div>
        </AppScrollbar>
      </aside>
    </transition>

    <ResourceDetailDrawer
      v-if="showDetailDrawer || selectedDetailResource"
      :show="showDetailDrawer"
      :width="detailDrawerWidth"
      :selected-detail-resource="selectedDetailResource"
      :category-name="detailCategoryName"
      :category-settings="detailCategorySettings"
      :detail-is-website="detailIsWebsite"
      :detail-is-software="detailIsSoftware"
      :detail-is-manga="detailIsManga"
      :detail-is-asmr="detailIsAsmr"
      :detail-is-audio="detailIsAudio"
      :detail-is-novel="detailIsNovel"
      :is-video-category="detailIsVideoCategory"
      :is-video-folder-category="detailIsVideoFolderCategory"
      :detail-website-favicon-src="detailWebsiteFaviconSrc"
      :detail-website-placeholder-emoji="detailWebsitePlaceholderEmoji"
      :detail-website-cover-placeholder-text="detailWebsiteCoverPlaceholderText"
      :detail-cover-preview-src="detailCoverPreviewSrc"
      :detail-rating-draft="detailRatingDraft"
      :has-pending-rating-change="hasPendingRatingChange"
      :rating-comment="ratingComment"
      :get-rating-emoji="getRatingEmoji"
      :detail-stores="detailStores"
      :detail-meta-items="detailMetaItems"
      :detail-display-path="detailDisplayPath"
      :has-detail-description="hasDetailDescription"
      :detail-description-box-style="detailCategoryDescriptionBoxStyle"
      :detail-stats="detailStats"
      :detail-stats-text="detailStatsText"
      :detail-show-total-runtime="detailShowTotalRuntime"
      :detail-reading-progress-text="detailReadingProgressText"
      :detail-playback-progress-text="detailPlaybackProgressText"
      :detail-preview-section-title="detailPreviewSectionTitle"
      :detail-screenshot-paths="detailScreenshotPaths"
      :detail-screenshot-preview-src="''"
      :current-screenshot-index="detailCurrentScreenshotIndex"
      :show-delete-screenshot-confirm="showDeleteScreenshotConfirm"
      :detail-gallery-items="detailGalleryItems"
      :detail-gallery-section-title="detailGallerySectionTitle"
      :detail-directory-section-title="detailDirectorySectionTitle"
      :detail-audio-tree-loading="detailAudioTreeLoading"
      :detail-audio-tree="detailAudioTree"
      :detail-directory-empty-text="detailDirectoryEmptyText"
      :detail-audio-context-menu-visible="detailAudioContextMenuVisible"
      :detail-audio-context-menu-position="{ x: 0, y: 0 }"
      :detail-audio-context-menu-options="[]"
      :detail-show-logs="detailShowLogs"
      :detail-logs="detailLogs"
      :detail-empty-log-description="detailEmptyLogDescription"
      :visible-detail-logs="visibleDetailLogs"
      :has-more-detail-logs="hasMoreDetailLogs"
      :no-more="noMore"
      :detail-log-mode-label="detailLogModeLabel"
      :detail-log-duration-label="detailLogDurationLabel"
      :start-text="detailStartText"
      :detail-can-launch="detailCanLaunch"
      :detail-can-stop="detailCanStop"
      :detail-open-folder-text="detailOpenFolderText"
      :show-open-category-button="true"
      open-category-button-text="转到分类"
      :handle-detail-drawer-resize-start="handleDetailDrawerResizeStart"
      :handle-rating-update="handleDetailRatingUpdate"
      :handle-submit-rating="handleDetailSubmitRating"
      :handle-copy-text="handleDetailCopyText"
      :handle-open-detail-resource-path="handleDetailOpenResourcePath"
      :handle-open-store-website="handleDetailOpenStoreWebsite"
      :handle-load-more-logs="handleDetailLoadMoreLogs"
      :format-date-time="formatDateTime"
      :format-duration="formatDuration"
      :format-launch-mode="formatLaunchMode"
      :format-log-end-time="formatLogEndTime"
      :format-log-duration="formatLogDuration"
      :handle-detail-launch-action="() => {}"
      :handle-edit-resource="handleDetailOpenCategory"
      :handle-open-category="handleDetailOpenCategory"
      @update:show="handleDetailDrawerShowUpdate"
      @update:show-delete-screenshot-confirm="showDeleteScreenshotConfirm = $event"
    />

    <AudioCoverCandidateModal
      :show="showGovernanceAudioCoverCandidateModal"
      :candidates="governanceAudioCoverCandidates"
      @update:show="showGovernanceAudioCoverCandidateModal = $event"
      @select="handleGovernanceUseAudioCoverCandidate"
      @after-leave="closeGovernanceAudioCoverCandidateModal"
    />

    <VideoCoverCandidateModal
      :show="showGovernanceVideoCoverCandidateModal"
      :fixed-candidates="governanceVideoCoverCandidates.filter((candidate) => candidate.group === 'fixed')"
      :random-candidates="governanceVideoCoverCandidates.filter((candidate) => candidate.group === 'random')"
      :format-time="formatVideoFrameTime"
      @update:show="showGovernanceVideoCoverCandidateModal = $event"
      @select="handleGovernanceUseVideoCoverCandidate"
      @after-leave="closeGovernanceVideoCoverCandidateModal"
    />

    <VideoSubCoverCandidateModal
      :show="showGovernanceVideoSubCoverCandidateModal"
      :items="governanceVideoSubCoverCandidateItems"
      :format-time="formatVideoFrameTime"
      @update:show="showGovernanceVideoSubCoverCandidateModal = $event"
      @select="handleGovernanceUseVideoSubCoverCandidate"
      @after-leave="closeGovernanceVideoSubCoverCandidateModal"
    />

    <n-modal
      :show="showCoverPickerModal"
      preset="card"
      title="选择封面"
      class="governance-cover-modal"
      :style="{ width: '600px', maxWidth: '92vw' }"
      :mask-closable="!(coverPickerSaving || coverPickerActionLoading || coverPickerVideoFrameLoading)"
      @update:show="(show) => { if (!show) closeCoverPickerModal() }"
    >
      <div class="governance-cover-modal__content">
        <CoverSelectorPanel
          :preview-src="coverPickerPreviewSrc"
          :preview-label="coverPickerPreviewLabel"
          :busy="coverPickerActionLoading"
          :video-cover-frame-loading="coverPickerVideoFrameLoading"
          :has-base-path="coverPickerHasBasePath"
          :has-editing-resource-id="Boolean(coverPickerEditingResourceId)"
          :has-cover-path="coverPickerHasCoverPath"
          :show-website-cover-fetch-button="showGovernanceWebsiteCoverFetchButton"
          :show-album-cover-fetch-button="coverPickerExtendTable === 'audio_meta'"
          :show-video-random-frame-button="coverPickerExtendTable === 'video_meta'"
          :show-screenshot-cover-button="showGovernanceScreenshotCoverButton"
          :disable-screenshot-cover-button="coverPickerResourceMissing"
          :show-screenshot-folder-button="showGovernanceScreenshotFolderButton"
          :show-first-cover-button="coverPickerExtendTable === 'multi_image_meta'"
          @choose-custom-cover="handleGovernanceChooseCustomCover"
          @fetch-website-cover="handleGovernanceFetchWebsiteCover"
          @fetch-album-cover="handleGovernanceFetchAlbumCover"
          @use-video-random-frame-cover="handleGovernanceUseVideoRandomFrameCover"
          @use-screenshot-cover="handleGovernanceUseScreenshotCover"
          @choose-cover-from-screenshot-folder="handleGovernanceChooseCoverFromScreenshotFolder"
          @use-first-cover="handleGovernanceUseFirstCover"
          @clear-cover="handleGovernanceClearCover"
        />
      </div>

      <template #footer>
        <div class="governance-cover-modal__footer">
          <n-button :disabled="coverPickerSaving" @click="closeCoverPickerModal">取消</n-button>
          <n-button type="primary" :loading="coverPickerSaving" @click="handleConfirmCoverPicker">确认更新</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      :show="showRelocateModal"
      preset="card"
      title="重定位资源"
      class="relocate-modal"
      :style="{ width: '560px', maxWidth: '92vw' }"
      :mask-closable="!relocateSaving"
      @update:show="(show) => { if (!show) closeRelocateModal() }"
    >
      <div class="relocate-modal__content">
        <div class="relocate-modal__path">
          <n-input :value="relocateTargetPath" readonly placeholder="请选择新的文件路径" />
          <n-button :loading="relocateSelecting" @click="handleSelectRelocatePath">选择文件</n-button>
        </div>
      </div>

      <template #footer>
        <div class="relocate-modal__footer">
          <n-button :disabled="relocateSaving" @click="closeRelocateModal">取消</n-button>
          <n-button type="primary" :loading="relocateSaving" :disabled="!relocateTargetPath" @click="handleConfirmRelocate">确认更新</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<style scoped>
.governance-page {
  height: 100%;
  color: v-bind(textColor);
  overflow: hidden;
  box-sizing: border-box;
}

.governance-page__scrollbar {
  max-height: 100%;
}

.governance-page__content {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px 16px 24px;
  box-sizing: border-box;
}

.workbench-hero,
.issues-toolbar,
.issues-list-panel,
.issues-batch-bar,
.module-placeholder {
  border: 1px solid v-bind(borderColor);
  border-radius: 22px;
  background: v-bind(heroBackground);
  box-shadow: v-bind(heroShadow);
}

.workbench-hero {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
}

.workbench-hero__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.workbench-hero__title-block,
.issues-toolbar__copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workbench-hero__title-block h1,
.issues-toolbar__copy h2 {
  margin: 0;
  font-size: 26px;
  line-height: 1.1;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: v-bind(titleColor);
}

.workbench-hero__title-block p,
.issues-toolbar__copy p,
.module-placeholder p {
  margin: 0;
  color: v-bind(mutedTextColor);
  font-size: 14px;
  line-height: 1.5;
}

.workbench-hero__actions,
.issues-batch-bar__actions,
.issue-card__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.workbench-hero__actions :deep(.n-button),
.issues-batch-bar__actions :deep(.n-button),
.issue-card__actions :deep(.n-button) {
  --n-border-radius: 13px;
  --n-font-weight: 700;
}

.workbench-hero__actions :deep(.n-button) {
  --n-height: 36px;
}

.workbench-hero__actions :deep(.n-button:not(.n-button--primary-type)) {
  --n-color: v-bind('topThemeTokens.secondaryButtonBg');
  --n-color-hover: v-bind('topThemeTokens.secondaryButtonBg');
  --n-color-pressed: v-bind('topThemeTokens.secondaryButtonBg');
  --n-color-focus: v-bind('topThemeTokens.secondaryButtonBg');
  --n-text-color: v-bind('topThemeTokens.secondaryButtonText');
  --n-text-color-hover: v-bind('topThemeTokens.secondaryButtonText');
  --n-text-color-pressed: v-bind('topThemeTokens.secondaryButtonText');
  --n-text-color-focus: v-bind('topThemeTokens.secondaryButtonText');
  --n-border: 1px solid v-bind('topThemeTokens.actionButtonBorder');
  --n-border-hover: 1px solid v-bind('topThemeTokens.actionButtonBorder');
  --n-border-pressed: 1px solid v-bind('topThemeTokens.actionButtonBorder');
  --n-border-focus: 1px solid v-bind('topThemeTokens.actionButtonBorder');
}

.workbench-hero__actions :deep(.n-button--primary-type) {
  --n-color: v-bind('topThemeTokens.primary');
  --n-color-hover: v-bind('topThemeTokens.primary');
  --n-color-pressed: v-bind('topThemeTokens.primary');
  --n-color-focus: v-bind('topThemeTokens.primary');
  --n-text-color: v-bind('topThemeTokens.primaryText');
  --n-text-color-hover: v-bind('topThemeTokens.primaryText');
  --n-text-color-pressed: v-bind('topThemeTokens.primaryText');
  --n-text-color-focus: v-bind('topThemeTokens.primaryText');
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.archive-workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  padding-bottom: 84px;
}

.archive-progress-card,
.archive-panel {
  border: 1px solid v-bind(borderColor);
  border-radius: 22px;
  background: v-bind(heroBackground);
  box-shadow: v-bind(heroShadow);
}

.archive-progress-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
  padding: 18px 20px;
}

.archive-progress-card__copy,
.archive-panel__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.archive-progress-card__eyebrow {
  color: v-bind(softTextColor);
  font-size: 13px;
  line-height: 1.2;
}

.archive-progress-card__copy strong,
.archive-panel__head h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 800;
  color: v-bind(titleColor);
}

.archive-progress-card__copy p,
.archive-progress-card__queued,
.archive-panel__head p,
.archive-queue-drawer__hint,
.archive-queue-item__message,
.archive-empty span {
  margin: 0;
  color: v-bind(mutedTextColor);
  font-size: 14px;
  line-height: 1.5;
}

.archive-progress-card__side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
  justify-content: center;
}

.archive-progress-card__percent {
  font-size: 30px;
  line-height: 1;
  font-weight: 800;
  color: v-bind(titleColor);
}

.archive-progress-card__progress {
  margin-top: 2px;
}

.archive-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 20px 20px;
}

.archive-panel__filters {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(180px, 0.8fr) minmax(180px, 0.8fr);
  gap: 12px;
}

.archive-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid v-bind(activeBorderColor);
  border-radius: 14px;
  background: v-bind(activeCardBackground);
}

.archive-batch-bar__copy {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.archive-batch-bar__copy strong {
  color: v-bind(titleColor);
  font-size: 14px;
}

.archive-batch-bar__copy span {
  color: v-bind(mutedTextColor);
  font-size: 12px;
  line-height: 1.4;
}

.archive-batch-bar__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.archive-batch-bar__clear {
  padding: 0;
  border: none;
  background: transparent;
  color: v-bind(titleColor);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.archive-batch-bar__clear:hover {
  color: v-bind(appPrimaryColor);
}

.archive-table__title {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-format-chip {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 999px;
  background: color-mix(in srgb, v-bind(subtleBackground) 82%, transparent);
  color: v-bind(titleColor);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;
}

.archive-format-chip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
}

.archive-format-chip__icon :deep(svg) {
  display: block;
}

.archive-format-chip__label {
  display: inline-block;
  line-height: 1;
}

.archive-format-chip--zip {
  border-color: color-mix(in srgb, v-bind(topThemeTokens.warning) 40%, v-bind(borderSubtleColor));
  color: v-bind(topThemeTokens.warning);
}

.archive-format-chip--seven-z {
  border-color: color-mix(in srgb, v-bind(topThemeTokens.primary) 42%, v-bind(borderSubtleColor));
  color: v-bind(topThemeTokens.primary);
}

.archive-format-chip--tar {
  border-color: color-mix(in srgb, v-bind(topThemeTokens.info) 40%, v-bind(borderSubtleColor));
  color: v-bind(topThemeTokens.info);
}

.archive-format-chip--xz,
.archive-format-chip--tar-xz {
  border-color: color-mix(in srgb, v-bind(topThemeTokens.success) 40%, v-bind(borderSubtleColor));
  color: v-bind(topThemeTokens.success);
}

.archive-format-chip--exe {
  border-color: color-mix(in srgb, v-bind(topThemeTokens.error) 40%, v-bind(borderSubtleColor));
  color: v-bind(topThemeTokens.error);
}

.archive-table__actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.archive-table__action-button {
  min-width: 44px;
}

.archive-table__action-button--wide {
  min-width: 62px;
}

.archive-naive-table-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 2px;
}

.archive-naive-table-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.archive-naive-table-panel__head h3 {
  margin: 0;
  color: v-bind(titleColor);
  font-size: 15px;
}

.archive-naive-table-panel__head span {
  display: block;
  margin-top: 4px;
  color: v-bind(mutedTextColor);
  font-size: 12px;
}

.archive-naive-table__path {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: v-bind(mutedTextColor);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-naive-table__actions {
  min-width: 0;
  gap: 10px;
}

.archive-delete-popconfirm__content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.45;
}

.archive-naive-table {
  overflow: hidden;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 16px;
}

.archive-naive-table :deep(.n-data-table-wrapper) {
  border-radius: 16px;
}

.archive-naive-table :deep(.n-data-table-th),
.archive-naive-table :deep(.n-data-table-td) {
  height: auto;
  padding: 14px 16px;
  border-right: none;
  border-left: none;
  color: v-bind(titleColor);
  font-size: 13px;
  line-height: 1.5;
  vertical-align: middle;
}

.archive-naive-table :deep(.n-data-table-th) {
  color: v-bind(softTextColor);
  font-weight: 700;
}

.archive-naive-table :deep(.n-data-table-tr:last-child .n-data-table-td) {
  border-bottom: none;
}

.archive-naive-table :deep(.n-data-table-td--fixed-right),
.archive-naive-table :deep(.n-data-table-th--fixed-right) {
  box-shadow: -12px 0 18px -18px rgba(0, 0, 0, 0.55);
}

.archive-naive-table :deep(.n-data-table-td--fixed-left),
.archive-naive-table :deep(.n-data-table-th--fixed-left) {
  text-align: center;
}

.archive-naive-table :deep(.n-scrollbar-rail) {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
}

.archive-naive-table :deep(.n-scrollbar-rail--disabled) {
  background: transparent !important;
  backdrop-filter: none;
}

.archive-naive-table :deep(.n-scrollbar-rail:hover) {
  background: rgba(255, 255, 255, 0.06);
}

.archive-naive-table :deep(.n-scrollbar-rail__scrollbar) {
  border-radius: 999px;
  background: rgba(99, 226, 183, 0.42);
}

.archive-naive-table :deep(.n-scrollbar-rail__scrollbar:hover) {
  background: rgba(99, 226, 183, 0.62);
}

.archive-naive-table :deep(.n-scrollbar-rail--vertical) {
  width: 8px;
  right: 4px;
}

.archive-naive-table :deep(.n-scrollbar-rail--horizontal) {
  height: 8px;
  bottom: 4px;
}

.archive-empty,
.archive-queue-drawer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.archive-empty {
  min-height: 220px;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.archive-empty--compact {
  min-height: 160px;
}

.archive-empty strong,
.archive-queue-item__head strong {
  color: v-bind(titleColor);
}

.archive-queue-fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid v-bind(activeBorderColor);
  border-radius: 999px;
  background: color-mix(in srgb, v-bind(activeCardBackground) 72%, v-bind(heroBackground) 28%);
  box-shadow:
    0 18px 34px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  color: v-bind(titleColor);
  cursor: pointer;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.archive-queue-fab:hover {
  transform: translateY(-1px);
  box-shadow:
    0 22px 40px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.archive-queue-fab:focus-visible {
  outline: 2px solid v-bind(activeBorderColor);
  outline-offset: 2px;
}

.archive-queue-panel {
  position: fixed;
  right: 28px;
  bottom: 96px;
  z-index: 30;
  width: 340px;
  max-width: calc(100vw - 32px);
  height: min(620px, calc(100vh - 140px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 14px 14px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 18px;
  background: color-mix(in srgb, v-bind(heroBackground) 92%, #6a6a73 8%);
  box-shadow:
    0 28px 60px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
}

.archive-queue-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.archive-queue-panel__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.archive-queue-panel__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.archive-queue-panel__title-wrap strong {
  font-size: 15px;
  line-height: 1.2;
  color: v-bind(titleColor);
}

.archive-queue-panel__title-wrap span,
.archive-queue-panel__hint {
  font-size: 12px;
  line-height: 1.4;
  color: v-bind(mutedTextColor);
}

.archive-package-expand {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 8px 4px 8px 22px;
  list-style: disc;
}

.archive-package-expand__item {
  min-width: 0;
  color: v-bind(titleColor);
  line-height: 1.6;
}

.archive-package-expand__title {
  display: inline-block;
  max-width: 100%;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}

.archive-package-preview {
  width: 200px;
  min-height: 120px;
}

.archive-package-preview__image {
  display: block;
  width: 200px;
  height: 200px;
  border-radius: 8px;
  object-fit: cover;
  background: color-mix(in srgb, v-bind(elevatedBackground) 82%, transparent);
}

.archive-package-preview__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 120px;
  border-radius: 8px;
  background: color-mix(in srgb, v-bind(elevatedBackground) 82%, transparent);
  color: v-bind(mutedTextColor);
  font-size: 12px;
}


.archive-queue-panel__close {
  width: 28px;
  height: 28px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: v-bind(mutedTextColor);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
}

.archive-queue-panel__close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: v-bind(titleColor);
}

.archive-queue-panel__scroll {
  flex: 1 1 auto;
  min-height: 0;
}

.archive-queue-fab__content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px 16px;
}

.archive-queue-fab__icon {
  opacity: 0.92;
  flex: 0 0 auto;
}

.archive-queue-fab__content strong {
  font-size: 13px;
  line-height: 1.1;
  white-space: nowrap;
}

.archive-queue-fab__content span {
  font-size: 12px;
  line-height: 1.1;
  opacity: 0.78;
  white-space: nowrap;
}

.archive-queue-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}

.archive-queue-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 0;
  border-bottom: 1px solid v-bind(borderSubtleColor);
  background: transparent;
}

.archive-queue-item:last-child {
  border-bottom: none;
}

.archive-queue-item__head,
.archive-queue-item__meta,
.archive-queue-item__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.archive-queue-item__message-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.archive-queue-item__head strong {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.25;
}

.archive-queue-item__meta,
.archive-queue-item__time {
  color: v-bind(softTextColor);
  font-size: 11px;
  line-height: 1.3;
}

.archive-queue-item__message {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.35;
}

.archive-queue-panel-enter-active,
.archive-queue-panel-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.archive-queue-panel-enter-from,
.archive-queue-panel-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.module-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-height: 148px;
  padding: 16px 18px;
  border: 1px solid v-bind(borderColor);
  border-radius: 16px;
  background: v-bind(cardBackground);
  text-align: left;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.module-card:hover {
  transform: translateY(-1px);
}

.module-card__eyebrow,
.issues-stat-card span,
.issues-list-panel__meta span,
.module-placeholder span {
  color: v-bind(softTextColor);
  font-size: 13px;
  line-height: 1.2;
}

.module-card__title,
.issue-card__title-wrap h3,
.module-placeholder strong {
  font-size: 18px;
  line-height: 1.2;
  font-weight: 800;
  color: v-bind(titleColor);
}

.module-card__metric {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 28px;
  line-height: 1;
  font-weight: 800;
  color: v-bind(titleColor);
}

.module-card__metric-suffix,
.module-card__metric-divider {
  font-size: 14px;
  line-height: 1.2;
  font-weight: 700;
  color: v-bind(mutedTextColor);
}

.module-card__status {
  color: v-bind(textColor);
  font-size: 13px;
  line-height: 1.45;
}

.module-card__hint,
.issues-stat-card p,
.issues-empty span {
  margin: 0;
  color: v-bind(mutedTextColor);
  font-size: 13px;
  line-height: 1.5;
}

.module-card--active {
  border-color: v-bind(activeBorderColor);
  background: v-bind(activeCardBackground);
  box-shadow: v-bind(activeShadow);
}

.issues-workbench {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}

.tag-workbench {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}

.tag-table-panel {
  border: 1px solid v-bind(borderColor);
  border-radius: 18px;
  background: v-bind(cardBackground);
}

.tag-workbench__filters {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(180px, 320px);
  gap: 10px;
}

.tag-table-panel {
  padding: 8px;
  overflow: hidden;
}

.issues-toolbar__stats.tag-workbench__stats {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.tag-entity-table__actions {
  gap: 12px;
}

.tag-entity-rename-modal {
  width: 560px;
  max-width: 92vw;
}

.tag-entity-rename-modal__content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.tag-entity-rename-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.category-pill {
  display: inline-flex;
  max-width: 100%;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 12px;
  border-radius: 999px;
  border: 0;
  white-space: nowrap;
  line-height: 1;
  font-size: 12px;
  font-weight: 800;
}

.category-pill__emoji {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.category-pill__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.issues-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 18px;
}

.issues-toolbar__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.issues-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.issues-subtabs {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.issues-toolbar__utility {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 10px 12px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 14px;
  background: v-bind(cardBackground);
}

.issues-toolbar__utility-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 2px;
}

.issues-toolbar__utility-label span {
  color: v-bind(softTextColor);
  font-size: 12px;
  line-height: 1.2;
  font-weight: 700;
}

.issues-toolbar__utility-label p {
  margin: 0;
  color: v-bind(mutedTextColor);
  font-size: 11px;
  line-height: 1.35;
}

.issues-toolbar__utility-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.issues-tab {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 999px;
  background: v-bind(subtleBackground);
  color: v-bind(mutedTextColor);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    transform 160ms ease;
}

.issues-tab strong {
  color: v-bind(titleColor);
  font-size: 13px;
}

.issues-tab:hover {
  transform: translateY(-1px);
}

.issues-tab--active {
  border-color: v-bind(activeBorderColor);
  background: v-bind(activeCardBackground);
  color: v-bind(titleColor);
}

.issues-subtab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 999px;
  background: v-bind(cardBackground);
  color: v-bind(mutedTextColor);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    transform 160ms ease;
}

.issues-subtab strong {
  color: v-bind(titleColor);
  font-size: 12px;
}

.issues-subtab:hover {
  transform: translateY(-1px);
}

.issues-subtab--active {
  border-color: v-bind(activeBorderColor);
  background: v-bind(activeCardBackground);
  color: v-bind(titleColor);
}

.issues-toolbar__filters {
  display: grid;
  grid-template-columns: minmax(220px, 1.5fr) repeat(3, minmax(150px, 0.56fr)) max-content;
  gap: 10px;
  align-items: stretch;
}

.issues-toolbar__filters :deep(.n-input),
.issues-toolbar__filters :deep(.n-base-selection) {
  height: 40px;
}

.issues-toolbar__filters :deep(.n-input .n-input-wrapper),
.issues-toolbar__filters :deep(.n-base-selection .n-base-selection-label) {
  min-height: 40px;
}

.issues-toolbar__toggles {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.issues-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 999px;
  background: v-bind(cardBackground);
  color: v-bind(mutedTextColor);
  font-size: 12px;
  font-weight: 700;
}

.issues-toggle--inline {
  align-self: flex-start;
  min-height: 34px;
  padding: 0 12px;
  background: v-bind(subtleBackground);
}

.issues-toggle--filter {
  align-self: stretch;
  min-height: 40px;
  padding: 0 14px;
}

.issues-toolbar__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.issues-toolbar__copy {
  gap: 4px;
}

.issues-toolbar__copy h2 {
  font-size: 22px;
}

.issues-toolbar__copy p {
  font-size: 13px;
  line-height: 1.45;
  max-width: 720px;
}

.issues-stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 74px;
  padding: 10px 14px;
  border: 1px solid v-bind(borderColor);
  border-radius: 16px;
  background: v-bind(cardBackground);
}

.issues-stat-card strong {
  font-size: 18px;
  line-height: 1;
  font-weight: 800;
  color: v-bind(titleColor);
}

.issues-stat-card__summary {
  color: v-bind(textColor);
  font-size: 12px;
  line-height: 1.35;
  font-weight: 700;
}

.issues-stat-card--error strong {
  color: v-bind('topThemeTokens.error');
}

.issues-stat-card--primary strong {
  color: v-bind('topThemeTokens.primary');
}

.issues-stat-card--warning strong {
  color: v-bind('topThemeTokens.warning');
}

.issues-stat-card--success strong {
  color: v-bind('topThemeTokens.success');
}

.issues-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-color: v-bind(activeBorderColor);
  background: v-bind(activeCardBackground);
  box-shadow: v-bind(activeShadow);
}

.issues-batch-bar__copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.issues-batch-bar__clear {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: v-bind(titleColor);
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  cursor: pointer;
}

.issues-batch-bar__clear:hover {
  color: v-bind(appPrimaryColor);
}

.issues-batch-bar__copy strong,
.issues-empty strong {
  color: v-bind(titleColor);
  font-size: 15px;
  font-weight: 800;
}

.issues-batch-bar__copy span {
  color: v-bind(mutedTextColor);
  font-size: 13px;
}

.issues-batch-bar__group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.issues-list-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
}

.issues-list-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.issues-select-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: v-bind(mutedTextColor);
  font-size: 13px;
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.issue-card {
  display: grid;
  grid-template-columns: auto 84px minmax(0, 1fr);
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid v-bind(borderColor);
  border-radius: 18px;
  background: v-bind(cardBackground);
}

.issue-card__select {
  display: flex;
  align-items: flex-start;
  padding-top: 6px;
}

.issue-cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  aspect-ratio: 4 / 5;
  min-height: auto;
  align-self: start;
  overflow: hidden;
  border-radius: 14px;
  border: 1px dashed v-bind(borderSubtleColor);
  font-size: 12px;
  font-weight: 700;
  color: v-bind(titleColor);
  background: v-bind(elevatedBackground);
}

.issue-cover__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.issue-cover__badge {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 8px;
  border-radius: 999px;
  backdrop-filter: blur(10px);
  background: rgba(15, 23, 42, 0.58);
  color: #f8fafc;
  font-size: 11px;
  line-height: 1;
}

.issue-cover--broken {
  color: v-bind('topThemeTokens.error');
  background: v-bind('topThemeTokens.errorSoft');
}

.issue-cover--missing {
  color: v-bind('topThemeTokens.primary');
  background: v-bind('topThemeTokens.primarySoft');
}

.issue-cover--duplicate {
  color: v-bind('topThemeTokens.info');
  background: v-bind('topThemeTokens.infoSoft');
}

.issue-cover--idle {
  color: v-bind('topThemeTokens.warning');
  background: v-bind('topThemeTokens.warningSoft');
}

.issue-cover--ignored {
  color: v-bind('topThemeTokens.success');
  background: v-bind('topThemeTokens.successSoft');
}

.issue-card__main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.issue-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.issue-card__title-wrap {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.issue-card__title-wrap h3 {
  margin: 0;
}

.issue-card__issue-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.issue-card__reason-tag {
  --n-color: v-bind(subtleBackground);
  --n-text-color: v-bind(mutedTextColor);
}

.issue-card__meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: v-bind(mutedTextColor);
}

.issue-card__signals {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
  color: v-bind(softTextColor);
  font-size: 12px;
}

.issue-card__rating {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  color: v-bind(mutedTextColor);
  font-size: 12px;
  font-weight: 700;
}

.issue-card__rating :deep(.n-rate) {
  font-size: 14px;
}

.issue-card__status-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.issue-card__status-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 999px;
  background: v-bind(subtleBackground);
  color: v-bind(mutedTextColor);
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background-color 160ms ease;
}

.issue-card__status-action:hover {
  color: v-bind(titleColor);
  border-color: v-bind(activeBorderColor);
}

.issue-card__detail {
  margin: 0;
  color: v-bind(textColor);
  font-size: 14px;
  line-height: 1.6;
}

.issue-card__record-path {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 12px;
  background: v-bind(subtleBackground);
}

.issue-card__record-path-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.issue-card__record-path-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.issue-card__record-path-head span {
  color: v-bind(softTextColor);
  font-size: 12px;
  line-height: 1.2;
  font-weight: 700;
  flex-shrink: 0;
}

.issue-card__record-path-inline code {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: v-bind(textColor);
  font-size: 12px;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.issue-card__record-path-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.issue-card__tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.issue-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 999px;
  background: v-bind(subtleBackground);
  color: v-bind(mutedTextColor);
  font-size: 12px;
  font-weight: 700;
}

.issue-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: auto;
}

.issue-card__timeline {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  color: v-bind(softTextColor);
  font-size: 12px;
}

.issue-card__timeline-primary {
  color: v-bind(textColor);
  font-weight: 700;
}

.issue-card__action--primary {
  order: -1;
}

.issue-card__more-action {
  --n-height: 28px;
  --n-padding: 0 8px;
  --n-font-size: 12px;
  --n-font-weight: 700;
  --n-text-color: v-bind(softTextColor);
  --n-text-color-hover: v-bind(titleColor);
  --n-text-color-pressed: v-bind(titleColor);
  --n-text-color-focus: v-bind(titleColor);
}

.issue-card__more-caret {
  width: 0;
  height: 0;
  margin-left: 4px;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
}

.issue-card--duplicate-group {
  grid-template-columns: auto minmax(0, 1fr);
}

.issue-duplicate-group {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}

.issue-duplicate-group__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.issue-duplicate-group__header h3 {
  margin: 0;
  color: v-bind(titleColor);
  font-size: 18px;
  line-height: 1.35;
}

.issue-duplicate-group__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
  color: v-bind(mutedTextColor);
  font-size: 12px;
}

.issue-duplicate-group__list {
  display: flex;
  flex-direction: column;
}

.issue-duplicate-item {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  gap: 14px;
  padding: 14px 0;
  border-top: 1px solid v-bind(borderSubtleColor);
}

.issue-duplicate-item:first-child {
  border-top: none;
  padding-top: 0;
}

.issue-duplicate-item:last-child {
  padding-bottom: 0;
}

.issue-duplicate-item__main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.issue-duplicate-item__cover {
  width: 72px;
  border-radius: 12px;
}

.issue-duplicate-item__head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.issue-duplicate-item__head h4 {
  margin: 0;
  color: v-bind(titleColor);
  font-size: 15px;
  line-height: 1.35;
}

.issue-duplicate-item__main p {
  margin: 0;
  color: v-bind(textColor);
  font-size: 13px;
  line-height: 1.55;
}

.issue-duplicate-item__path {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid v-bind(borderSubtleColor);
  border-radius: 10px;
  background: v-bind(subtleBackground);
}

.issue-duplicate-item__path span {
  flex-shrink: 0;
  color: v-bind(softTextColor);
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
}

.issue-duplicate-item__path code {
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: v-bind(textColor);
  font-size: 12px;
  line-height: 1.4;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.issue-duplicate-item__rating {
  min-height: 20px;
}

.issue-duplicate-item__timeline {
  font-size: 12px;
}

.issue-duplicate-item__actions {
  display: inline-flex;
  align-items: flex-end;
  justify-content: flex-end;
  align-self: end;
  gap: 8px;
  flex-wrap: wrap;
}

.relocate-modal__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.relocate-modal__path {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.relocate-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.governance-cover-modal__content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.governance-cover-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.issues-empty,
.module-placeholder {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  margin-top: 16px;
  padding: 20px 18px;
}

.module-placeholder strong {
  font-size: 18px;
}

@media (max-width: 1280px) {
  .issues-toolbar__main,
  .issues-list-panel__header,
  .issues-batch-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .issues-toolbar__utility {
    grid-template-columns: 1fr;
  }

  .issues-toolbar__filters,
  .issues-toolbar__stats {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 1080px) {
  .module-grid,
  .issues-toolbar__stats {
    grid-template-columns: 1fr;
  }

  .issue-card {
    grid-template-columns: 1fr;
  }

  .issue-card--duplicate-group {
    grid-template-columns: 1fr;
  }

  .issue-duplicate-item {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .issue-duplicate-item__actions {
    grid-column: 2;
    justify-content: flex-start;
  }

  .issue-card__select {
    padding-top: 0;
  }
}

@media (max-width: 780px) {
  .governance-page {
    padding: 12px;
  }

  .workbench-hero,
  .issues-toolbar,
  .issues-list-panel,
  .issues-batch-bar,
  .module-placeholder {
    padding: 14px;
  }

  .workbench-hero__head {
    flex-direction: column;
  }

  .workbench-hero__actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .workbench-hero__actions :deep(.n-button),
  .issues-toolbar__filters,
  .issues-toolbar__stats {
    width: 100%;
    grid-template-columns: 1fr;
  }

  .issue-card__head,
  .issue-card__footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .issue-card__signals {
    align-items: flex-start;
  }
}
</style>
