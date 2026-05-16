<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCheckbox, NInput, NNumberAnimation, NRate, NSelect, NTag } from 'naive-ui'
import { DictType } from '../../../../common/constants'
import { colorAlpha, twColor } from '../../utils/colors'
import { getAppPrimaryColor } from '../../theme/primary'
import { getWebsitePlaceholderEmoji } from '../../utils/website-placeholder-emoji'
import { confirmDialog, notify } from '../../utils/notification'
import { resolveCategoryProfile } from '../category-detail/profile-registry'
import { useCategoryDetailFormatters } from '../category-detail/composables/useCategoryDetailFormatters'
import { useCategoryDetailPresentation } from '../category-detail/composables/useCategoryDetailPresentation'
import {
  normalizeCoverPreviewSource,
  normalizeWebsiteIconSource,
  resolveImagePreviewSource
} from '../../shared/preview/usePreviewAssetLoader'

type ModuleKey = 'issues' | 'tags' | 'archive'
type IssueTypeKey = 'all' | 'brokenPath' | 'missingCover' | 'longUnvisited' | 'ignored'
type BrokenPathSubtypeKey = 'all' | 'directoryMissing' | 'launchFileMissing'
type IssueStatus = '待处理' | '已忽略'
type ActionButtonType = 'default' | 'primary' | 'warning' | 'error'

type ModuleCard = {
  key: ModuleKey
  eyebrow: string
  title: string
  metricValue: number
  metricSuffix?: string
  metricSecondaryValue?: number
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
  issueSubTypeLabel?: string
  issueTypeLabel: string
  issueDetail: string
  recentAccess: string
  createdAt: string
  status: IssueStatus
  coverKind: 'broken' | 'missing' | 'idle' | 'ignored'
  coverLabel: string
  rating: string
  favorite: boolean
  actions: IssueAction[]
}

type GovernanceWorkbenchResponse = {
  summary: {
    allIssueCount?: number
    brokenPathCount: number
    missingCoverCount: number
    longUnvisitedCount: number
    ignoredCount: number
    totalTagCount: number
    totalCategoryCount: number
    archiveCandidateCount: number
  }
  tabs: IssueTab[]
  brokenPathSubTabs?: Array<{ key: BrokenPathSubtypeKey; label: string; count: number }>
  filters: {
    categories: Array<{ label: string; value: string }>
    tags: Array<{ label: string; value: string }>
  }
  items: IssueRecord[]
}

const ResourceDetailDrawer = defineAsyncComponent(() => import('../category-detail/components/ResourceDetailDrawer.vue'))

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

const injectedIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))
const isDark = computed(() => Boolean(injectedIsDark.value))
const appPrimaryColor = inject<ComputedRef<string>>('appPrimaryColor', computed(() => getAppPrimaryColor(isDark.value)))
const router = useRouter()
const {
  formatDateTime,
  formatDuration,
  formatLogEndTime,
  formatLogDuration,
  formatLaunchMode,
  getRatingEmoji
} = useCategoryDetailFormatters()

const activeModule = ref<ModuleKey>('issues')
const activeIssueTab = ref<IssueTypeKey>('all')
const activeBrokenPathSubtype = ref<BrokenPathSubtypeKey>('all')
const searchKeyword = ref('')
const selectedCategory = ref<string>('all')
const selectedRating = ref<string>('all')
const selectedSort = ref<'priority' | 'recent' | 'created'>('priority')
const onlyFavorite = ref(false)
const selectedIssueIds = ref<string[]>([])
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
  ignoredCount: 0,
  totalTagCount: 0,
  totalCategoryCount: 0,
  archiveCandidateCount: 0
})
const issueTabs = ref<IssueTab[]>([
  { key: 'all', label: '全部', count: 0 },
  { key: 'brokenPath', label: '路径失效', count: 0 },
  { key: 'missingCover', label: '无封面', count: 0 },
  { key: 'longUnvisited', label: '长期未访问', count: 0 },
  { key: 'ignored', label: '已忽略问题', count: 0 }
])
const brokenPathSubTabs = ref<Array<{ key: BrokenPathSubtypeKey; label: string; count: number }>>([
  { key: 'all', label: '全部', count: 0 },
  { key: 'directoryMissing', label: '目录失效', count: 0 },
  { key: 'launchFileMissing', label: '启动文件丢失', count: 0 }
])
const categoryOptions = ref<Array<{ label: string; value: string }>>([{ label: '全部分类', value: 'all' }])
const issueRecords = ref<IssueRecord[]>([])
let governanceRequestToken = 0

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
const ratingComment = computed(() => {
  const normalizedRating = Number(detailRatingDraft.value ?? -1)
  if (normalizedRating >= 4.9) return '封神'
  if (normalizedRating >= 4.5) return '超神'
  if (normalizedRating > 4) return '推荐'
  if (normalizedRating > 3) return '还行'
  if (normalizedRating > 2) return '一般'
  if (normalizedRating >= 1.1) return '勉强'
  if (normalizedRating > 0) return '避雷'
  if (normalizedRating === 0) return '区'
  return ''
})
const hasPendingRatingChange = computed(() => {
  if (!selectedDetailResource.value) {
    return false
  }

  return Number(selectedDetailResource.value.rating ?? -1) !== Number(detailRatingDraft.value)
})
const detailCanLaunch = computed(() => false)
const detailCanStop = computed(() => false)

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

const modules = computed<ModuleCard[]>(() => [
  {
    key: 'issues',
    eyebrow: '当前模块',
    title: '问题资源管理',
    metricValue: Number(workbenchSummary.value.allIssueCount ?? 0),
    status: '',
    hint: `无封面 ${workbenchSummary.value.missingCoverCount} · 长期未访问 ${workbenchSummary.value.longUnvisitedCount}`
  },
  {
    key: 'tags',
    eyebrow: '组织结构',
    title: '标签 / 分类管理',
    metricValue: Number(workbenchSummary.value.totalTagCount ?? 0),
    metricSuffix: '标签',
    metricSecondaryValue: Number(workbenchSummary.value.totalCategoryCount ?? 0),
    metricSecondarySuffix: '分类',
    status: '',
    hint: '存在低频标签与分类结构待整理'
  },
  {
    key: 'archive',
    eyebrow: '存储治理',
    title: '归档管理',
    metricValue: Number(workbenchSummary.value.archiveCandidateCount ?? 0),
    status: '',
    hint: '后续在归档工作区中统一打包、恢复与清理'
  }
])

const issueStats = computed(() => {
  const currentCount = issueRecords.value.length
  const ignoredCount = issueRecords.value.filter((item) => item.status === '已忽略').length
  const actionableCount = issueRecords.value.filter((item) => item.actions.length > 2).length
  const selectedCount = selectedIssueIds.value.length

  return { currentCount, ignoredCount, actionableCount, selectedCount }
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

const getActionButtonType = (tone?: IssueAction['tone']): ActionButtonType => {
  if (tone === 'primary' || tone === 'warning' || tone === 'error') {
    return tone
  }

  return 'default'
}

const isActionSecondary = (tone?: IssueAction['tone']) => tone === 'warning' || tone === 'error'
const isActionTertiary = (tone?: IssueAction['tone']) => !tone || tone === 'default'
const getIssueRatingValue = (rating: string) => {
  const normalized = Number(rating ?? 0)
  if (!Number.isFinite(normalized) || normalized < 0) {
    return 0
  }

  return Math.min(5, normalized)
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

const loadGovernanceIssues = async () => {
  if (activeModule.value !== 'issues') {
    return
  }

  const requestToken = ++governanceRequestToken
  loading.value = true

  try {
    const result = await window.api.db.getGovernanceIssueWorkbench({
      issueType: activeIssueTab.value,
      brokenPathSubtype: activeBrokenPathSubtype.value,
      keyword: searchKeyword.value,
      category: selectedCategory.value,
      rating: selectedRating.value,
      onlyFavorite: onlyFavorite.value,
      sortBy: selectedSort.value
    }) as GovernanceWorkbenchResponse

    if (requestToken !== governanceRequestToken) {
      return
    }

    workbenchSummary.value = result?.summary ?? workbenchSummary.value
    issueTabs.value = Array.isArray(result?.tabs) && result.tabs.length ? result.tabs : issueTabs.value
    brokenPathSubTabs.value = Array.isArray(result?.brokenPathSubTabs) && result.brokenPathSubTabs.length
      ? result.brokenPathSubTabs
      : brokenPathSubTabs.value
    categoryOptions.value = Array.isArray(result?.filters?.categories) && result.filters.categories.length
      ? result.filters.categories
      : [{ label: '全部分类', value: 'all' }]
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
  const confirmed = await confirmDialog('移除资源', `确认移除“${item.title}”吗？此操作会删除数据库中的资源记录。`)
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

const handleIssueAction = async (item: IssueRecord, action: IssueAction) => {
  if (action.label === '查看详情') {
    await openResourceDetail(item)
    return
  }

  if (action.label === '手动选择封面') {
    await openResourceCategory(item)
    return
  }

  if (action.label === '忽略') {
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

onMounted(() => {
  window.addEventListener('mousemove', handleDetailDrawerResizeMove)
  window.addEventListener('mouseup', handleDetailDrawerResizeEnd)
  void loadGovernanceIssues()
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleDetailDrawerResizeMove)
  window.removeEventListener('mouseup', handleDetailDrawerResizeEnd)
  document.body.style.userSelect = ''
})

watch(
  [
    activeModule,
    activeIssueTab,
    activeBrokenPathSubtype,
    searchKeyword,
    selectedCategory,
    selectedRating,
    selectedSort,
    onlyFavorite
  ],
  () => {
    void loadGovernanceIssues()
  }
)

watch(activeIssueTab, (value) => {
  if (value !== 'brokenPath') {
    activeBrokenPathSubtype.value = 'all'
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
    <header class="workbench-hero">
      <div class="workbench-hero__head">
        <div class="workbench-hero__title-block">
          <h1>资源治理工作台</h1>
          <p>集中处理问题资源、组织结构与归档动作</p>
        </div>

        <div class="workbench-hero__actions">
          <n-button type="primary" @click="refreshGovernanceIssues">刷新问题列表</n-button>
          <n-button @click="activeModule = 'archive'">打开归档队列</n-button>
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
              show-separator
            />
            <span v-if="module.metricSuffix" class="module-card__metric-suffix">{{ module.metricSuffix }}</span>
            <template v-if="module.metricSecondaryValue !== undefined">
              <span class="module-card__metric-divider">/</span>
              <n-number-animation
                :from="0"
                :to="module.metricSecondaryValue"
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

        <div class="issues-toolbar__filters">
          <n-input v-model:value="searchKeyword" clearable placeholder="搜索标题、分类、标签或问题说明" />
          <n-select v-model:value="selectedCategory" :options="categoryOptions" />
          <n-select v-model:value="selectedRating" :options="ratingOptions" />
          <n-select v-model:value="selectedSort" :options="sortOptions" />
        </div>

        <div class="issues-toolbar__toggles">
          <label class="issues-toggle">
            <n-checkbox :checked="onlyFavorite" @update:checked="onlyFavorite = $event" />
            <span>仅看收藏资源</span>
          </label>
        </div>

        <div class="issues-toolbar__stats">
          <article class="issues-stat-card issues-stat-card--error">
            <span>当前命中</span>
            <strong>{{ issueStats.currentCount }}</strong>
            <p>当前问题类型与筛选条件下的资源数量</p>
          </article>
          <article class="issues-stat-card issues-stat-card--primary">
            <span>可直接处理</span>
            <strong>{{ issueStats.actionableCount }}</strong>
            <p>支持重扫、补封面、归档等快捷动作</p>
          </article>
          <article class="issues-stat-card">
            <span>已忽略</span>
            <strong>{{ issueStats.ignoredCount }}</strong>
            <p>处于忽略状态，可恢复为待处理</p>
          </article>
        </div>
      </section>

      <section v-if="issueStats.selectedCount" class="issues-batch-bar">
        <div class="issues-batch-bar__copy">
          <strong>已选择 {{ issueStats.selectedCount }} 项问题资源</strong>
          <span>可执行忽略、恢复待处理、归档并删除本地资源等批量动作。</span>
        </div>
        <div class="issues-batch-bar__actions">
          <n-button @click="handleBatchSetIgnored(true)">批量忽略</n-button>
          <n-button @click="handleBatchSetIgnored(false)">恢复待处理</n-button>
          <n-button type="primary" @click="notify('info', '归档工作区待接入', '当前批量归档入口将在归档管理模块接入后启用')">批量归档</n-button>
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
          <article v-for="item in issueRecords" :key="item.id" class="issue-card">
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
                  <div class="issue-card__meta-row">
                    <n-tag size="small" round :bordered="false">{{ item.issueTypeLabel }}</n-tag>
                    <n-tag
                      v-if="item.issueSubTypeLabel"
                      size="small"
                      round
                      :bordered="false"
                      type="error"
                    >
                      {{ item.issueSubTypeLabel }}
                    </n-tag>
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
                    <n-tag size="small" round :bordered="false" :type="item.status === '已忽略' ? 'warning' : 'success'">
                      {{ item.status }}
                    </n-tag>
                  </div>
                </div>

                <div class="issue-card__signals">
                  <span>{{ item.favorite ? '已收藏' : '未收藏' }}</span>
                </div>
              </div>

              <p class="issue-card__detail">{{ item.issueDetail }}</p>

              <div class="issue-card__tags">
                <span v-for="tag in item.tags" :key="tag" class="issue-chip">{{ tag }}</span>
              </div>

              <div class="issue-card__footer">
                <div class="issue-card__timeline">
                  <span>最近访问：{{ item.recentAccess }}</span>
                  <span>创建时间：{{ item.createdAt }}</span>
                </div>

                <div class="issue-card__actions">
                  <n-button
                    v-for="action in item.actions"
                    :key="action.label"
                    size="small"
                    :type="getActionButtonType(action.tone)"
                    :secondary="isActionSecondary(action.tone)"
                    :tertiary="isActionTertiary(action.tone)"
                    @click="handleIssueAction(item, action)"
                  >
                    {{ action.label }}
                  </n-button>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div v-else class="issues-empty">
          <strong>{{ loading ? '正在加载问题资源…' : '当前筛选条件下没有命中的问题资源' }}</strong>
          <span>{{ loading ? '正在从本地数据库读取治理工作台数据。' : '可以切换问题类型、放宽分类或评分筛选，或者取消“仅看收藏资源”。' }}</span>
        </div>
      </section>
    </section>

    <section v-else class="module-placeholder">
      <span>{{ activeModule === 'tags' ? '标签 / 分类管理' : '归档管理' }}</span>
      <strong>{{ activeModule === 'tags' ? '组织体系治理待接入' : '归档流程工作区待接入' }}</strong>
      <p>当前先完成问题资源管理模块，另外两个模块后续可继续沿同一工作台结构补齐。</p>
    </section>

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
  </section>
</template>

<style scoped>
.governance-page {
  min-height: 100%;
  padding: 14px 16px 24px;
  color: v-bind(textColor);
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
  grid-template-columns: minmax(220px, 1.5fr) repeat(3, minmax(150px, 0.56fr));
  gap: 10px;
}

.issues-toolbar__toggles {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.issues-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: v-bind(mutedTextColor);
  font-size: 13px;
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
  gap: 8px;
  min-height: 88px;
  padding: 14px 16px;
  border: 1px solid v-bind(borderColor);
  border-radius: 16px;
  background: v-bind(cardBackground);
}

.issues-stat-card strong {
  font-size: 20px;
  line-height: 1;
  font-weight: 800;
  color: v-bind(titleColor);
}

.issues-stat-card--error strong {
  color: v-bind('topThemeTokens.error');
}

.issues-stat-card--primary strong {
  color: v-bind('topThemeTokens.primary');
}

.issues-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
}

.issues-batch-bar__copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  grid-template-columns: auto 112px minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
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
  min-height: 124px;
  overflow: hidden;
  border-radius: 16px;
  border: 1px dashed v-bind(borderSubtleColor);
  font-size: 13px;
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
  padding: 6px 10px;
  border-radius: 999px;
  backdrop-filter: blur(10px);
  background: rgba(15, 23, 42, 0.58);
  color: #f8fafc;
}

.issue-cover--broken {
  color: v-bind('topThemeTokens.error');
  background: v-bind('topThemeTokens.errorSoft');
}

.issue-cover--missing {
  color: v-bind('topThemeTokens.primary');
  background: v-bind('topThemeTokens.primarySoft');
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
  gap: 8px;
}

.issue-card__title-wrap h3 {
  margin: 0;
}

.issue-card__meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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

.issue-card__detail {
  margin: 0;
  color: v-bind(textColor);
  font-size: 14px;
  line-height: 1.6;
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
}

.issue-card__timeline {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  color: v-bind(softTextColor);
  font-size: 12px;
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
