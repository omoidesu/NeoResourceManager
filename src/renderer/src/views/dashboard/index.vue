<script setup lang="ts">
import { computed, defineAsyncComponent, h, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronBackOutline, ChevronDownOutline, ChevronUpOutline } from '@vicons/ionicons5'
import VChart from 'vue-echarts'
import { use as useECharts, type ComposeOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, GraphicComponent } from 'echarts/components'
import type { PieSeriesOption, BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption, GraphicComponentOption } from 'echarts/components'
import { colorAlpha, twColor } from '../../utils/colors'
import { confirmDialog, notify } from '../../utils/notification'
import { getAppPrimaryColor } from '../../theme/primary'
import { setAudioPlayerSession, setAudioPlayerVisible } from '../../utils/audio-player-store'
import DashboardHeatmap from '../../components/DashboardHeatmap.vue'
import { createEmptyMetaByType } from '../../components/meta/meta-factory'
import { resolveMetaFormComponent } from '../../components/meta/registry'
import ResourceDetailDrawer from '../category-detail/components/ResourceDetailDrawer.vue'
import ResourceEditorDrawer from '../category-detail/components/ResourceEditorDrawer.vue'
import AudioCoverCandidateModal from '../category-detail/components/AudioCoverCandidateModal.vue'
import VideoCoverCandidateModal from '../category-detail/components/VideoCoverCandidateModal.vue'
import VideoSubCoverCandidateModal from '../category-detail/components/VideoSubCoverCandidateModal.vue'
import { useCategoryDetailAudioContextMenu } from '../category-detail/composables/useCategoryDetailAudioContextMenu'
import { useCategoryDetailFormatters } from '../category-detail/composables/useCategoryDetailFormatters'
import { useCategoryDetailPresentation } from '../category-detail/composables/useCategoryDetailPresentation'
import { useCategoryEditorAssistActions } from '../category-detail/composables/useCategoryEditorAssistActions'
import { useCategoryEditorPathAnalysis } from '../category-detail/composables/useCategoryEditorPathAnalysis'
import { useCategoryEditorSoftwareScript } from '../category-detail/composables/useCategoryEditorSoftwareScript'
import { normalizeWebsiteIconSource, useCategoryPreviewAssets } from '../category-detail/composables/useCategoryPreviewAssets'
import { useCategoryVideoOrderDialog } from '../category-detail/composables/useCategoryVideoOrderDialog'
import { resolveCategoryProfile } from '../category-detail/profile-registry'
import { getWebsitePlaceholderEmoji } from '../../utils/website-placeholder-emoji'
import { DictType, ResourceLaunchMode } from '../../../../common/constants'
import packageJson from '../../../../../package.json'

useECharts([CanvasRenderer, PieChart, BarChart, GridComponent, TooltipComponent, GraphicComponent])

type EChartsOption = ComposeOption<
  PieSeriesOption
  | BarSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | GraphicComponentOption
>

const PictureViewer = defineAsyncComponent(() => import('../../components/PictureViewer.vue'))
const ComicReader = defineAsyncComponent(() => import('../../components/ComicReader.vue'))
const TextReader = defineAsyncComponent(() => import('../../components/TextReader.vue'))
const PdfReader = defineAsyncComponent(() => import('../../components/PdfReader.vue'))
const EpubReader = defineAsyncComponent(() => import('../../components/EpubReader.vue'))
const EbookReader = defineAsyncComponent(() => import('../../components/EbookReader.vue'))
const VideoPlayer = defineAsyncComponent(() => import('../../components/VideoPlayer.vue'))
const storeIconModules = import.meta.glob('../../assets/store-icons/*', {
  eager: true,
  import: 'default'
}) as Record<string, string>
const engineIconModules = import.meta.glob('../../assets/engine-icons/*', {
  eager: true,
  import: 'default'
}) as Record<string, string>
const storeIconUrlByName = new Map<string, string>(
  Object.entries(storeIconModules).map(([filePath, url]) => [filePath.split('/').pop() ?? filePath, url])
)
const engineIconUrlByName = new Map<string, string>(
  Object.entries(engineIconModules).map(([filePath, url]) => [filePath.split('/').pop() ?? filePath, url])
)

type Tone = 'mint' | 'blue' | 'amber' | 'purple' | 'rose' | 'green' | 'slate' | 'cyan' | 'orange' | 'magenta' | 'lime'
type ResourceChip = {
  id: string
  routeId: string
  categoryName: string
  count: number
  label: string
  emoji: string
  tone: Tone
  color: string
  backgroundColor: string
}
type RecentFeed = {
  id: string
  title: string
  meta: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  coverUrl: string
}
type NextPlayCard = {
  id: string
  order: number
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  coverUrl: string
  meta: string
  reason: string
  action: string
  basePath: string
  fileName: string
  favorite: boolean
  rating: number
  createTime: number
  accessCount: number
}
type HomePinnedCard = {
  id: string
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  coverUrl: string
  basePath: string
  fileName: string
  pinnedAt: number | null
  createTime: number | null
  lastAccessTime: number | null
  accessCount: number
  meta: string
}
type AnalysisTabKey = 'category' | 'health' | 'longUnvisited' | 'usage' | 'addedTrend'
type CoverWallFilterKey = 'all' | 'recentRun' | 'recentAdd' | 'favorite' | 'coverOnly'
type CoverWallResource = {
  id: string
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  coverPath: string
  coverUrl: string
  favorite: boolean
  isCompleted: boolean
  missingStatus: boolean
  isPinned: boolean
  rating: number
  createTime: number | null
  lastAccessTime: number | null
  accessCount: number
  tagCount: number
  authorCount: number
  searchText: string
}
type CoverWallCategoryChip = {
  id: string
  label: string
  emoji: string
  color: string
  count: number
}
type CoverWallPageState = {
  offset: number
  hasMore: boolean
  loading: boolean
}
type DashboardStats = {
  totalResources: number
  favoriteResources: number
  completedResources: number
  missingResources: number
  missingCovers: number
  longUnvisitedResources: number
  recentLaunchCount: number
  recentRuntimeSeconds: number
}
type ActivityHeatmapDay = {
  date: string
  launchCount: number
  totalRuntime: number
}
type ActivityHeatmapSummary = {
  mostActiveHour: string
  mostActiveWeekday: string
  mostUsedCategory: string
}
type UsageInsightItem = {
  label: string
  categoryEmoji: string
  count: number
  color: string
}
type ContinueCard = {
  id: string
  categoryId: string
  time: string
  title: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  type: string
  launchMode: string
  launchModeLabel: string
  state: string
  note: string
  action: string
  tone: Tone
}
const appIsDark = inject('appIsDark', computed(() => true))
const appPrimaryColor = inject<ComputedRef<string>>('appPrimaryColor', computed(() => getAppPrimaryColor(isDark.value)))
const router = useRouter()
const route = useRoute()
const appVersion = packageJson.version
const emitRendererTiming = (message: string, meta?: Record<string, unknown>) => {
  window.api?.diagnostics?.logRenderer('info', message, meta)
}
const toCssUrlValue = (value: unknown) => {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return 'none'
  }

  const escaped = normalized
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')

  return `url("${escaped}")`
}
const measureDashboardTask = async <T,>(
  label: string,
  task: () => Promise<T>,
  extra?: Record<string, unknown>
) => {
  const startedAt = performance.now()
  emitRendererTiming('dashboard task start', {
    label,
    ...(extra ?? {})
  })

  try {
    const result = await task()
    emitRendererTiming('dashboard task end', {
      label,
      elapsedMs: Math.round(performance.now() - startedAt),
      status: 'success',
      ...(extra ?? {})
    })
    return result
  } catch (error) {
    emitRendererTiming('dashboard task end', {
      label,
      elapsedMs: Math.round(performance.now() - startedAt),
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      ...(extra ?? {})
    })
    throw error
  }
}
const scheduledDashboardTaskTimers: number[] = []
let dashboardDisposed = false
const isDashboardPreviewWorkAllowed = () => !dashboardDisposed && route.name === 'dashboard'
const scheduleDashboardDeferredTask = (label: string, delayMs: number, task: () => Promise<void> | void) => {
  const timer = window.setTimeout(() => {
    const index = scheduledDashboardTaskTimers.indexOf(timer)
    if (index >= 0) {
      scheduledDashboardTaskTimers.splice(index, 1)
    }

    if (dashboardDisposed) {
      return
    }

    emitRendererTiming('dashboard deferred task start', {
      label,
      delayMs
    })

    Promise.resolve(task()).catch(() => {
      // keep dashboard resilient; concrete loaders already handle their own errors
    })
  }, delayMs)

  scheduledDashboardTaskTimers.push(timer)
}
const isDark = computed(() => Boolean(appIsDark.value))
const primaryColor = computed(() => appPrimaryColor.value)
const searchKeyword = ref('')

const themeTokens = computed(() => {
  if (isDark.value) {
    return {
      pageBg: twColor('neutral', 925),
      panelBg: twColor('neutral', 900),
      panelBgSubtle: twColor('neutral', 875),
      elevatedBg: twColor('neutral', 850),
      inputBg: twColor('neutral', 800),
      border: twColor('neutral', 800),
      borderSubtle: colorAlpha(twColor('neutral', 750), 0.45),
      text: twColor('neutral', 375),
      textStrong: twColor('neutral', 275),
      textMuted: twColor('neutral', 450),
      textFaint: twColor('neutral', 575),
      primary: primaryColor.value,
      primarySoft: colorAlpha(primaryColor.value, 0.2),
      primaryHover: colorAlpha(primaryColor.value, 0.9),
      primaryFocus: colorAlpha(primaryColor.value, 0.34),
      primaryText: twColor('neutral', 950),
      info: twColor('sky', 600),
      infoSoft: colorAlpha(twColor('sky', 600), 0.18),
      cyan: twColor('cyan', 600),
      cyanSoft: colorAlpha(twColor('cyan', 600), 0.18),
      success: twColor('lime', 600),
      successSoft: colorAlpha(twColor('lime', 600), 0.18),
      lime: twColor('lime', 600),
      limeSoft: colorAlpha(twColor('lime', 600), 0.2),
      green: twColor('green', 600),
      greenSoft: colorAlpha(twColor('green', 600), 0.18),
      warning: twColor('amber', 600),
      warningSoft: colorAlpha(twColor('amber', 600), 0.18),
      orange: twColor('orange', 600),
      orangeSoft: colorAlpha(twColor('orange', 600), 0.18),
      error: twColor('rose', 600),
      errorSoft: colorAlpha(twColor('rose', 600), 0.18),
      magenta: twColor('pink', 600),
      magentaSoft: colorAlpha(twColor('pink', 600), 0.18),
      solidPanel: '#1b1b1b',
      solidPanelAlt: '#161616',
      solidPanelStrong: '#111317',
      secondaryButtonBg: '#1f2430',
      secondaryButtonText: '#dce3ef',
      overlayBorder: 'rgba(255, 255, 255, 0.08)',
      overlayBg: 'rgba(15, 20, 25, 0.96)',
      overlayTextStrong: '#f8fafc',
      overlayTextMuted: '#9aa5b6',
      overlayMetaText: 'rgba(245, 247, 251, 0.92)',
      overlayTextSoft: '#868091',
      activeNeutralBg: '#262626',
      actionSurfaceBg: 'rgba(15, 20, 25, 0.76)',
      actionSurfaceBorder: 'rgba(255, 255, 255, 0.10)',
      actionButtonBg: 'rgba(31, 36, 48, 0.94)',
      actionButtonBorder: 'rgba(255, 255, 255, 0.08)',
      actionButtonText: '#dce3ef',
      shadowSoft: '0 10px 24px rgba(0, 0, 0, 0.22)',
      shadowMedium: '0 14px 34px rgba(0, 0, 0, 0.18)',
      shadowStrong: '0 24px 52px rgba(0, 0, 0, 0.3)',
      chartTooltipBg: 'rgba(16, 18, 24, 0.94)',
      chartTooltipBorder: 'rgba(255, 255, 255, 0.08)',
      chartTooltipText: '#f5f7fb',
      chartTextMuted: '#8d8898',
      chartTextSoft: '#6d7a8e',
      chartTrack: 'rgba(255,255,255,0.035)',
      chartTrackStrong: 'rgba(255,255,255,0.06)',
      chartAxis: 'rgba(255,255,255,0.08)',
      chartShadow: 'rgba(0, 0, 0, 0.28)',
      feedCoverOverlay: 'linear-gradient(90deg, rgba(10, 10, 10, 0.88) 0%, rgba(10, 10, 10, 0.72) 46%, rgba(10, 10, 10, 0.82) 100%)',
      nextPlayHeroOverlay: 'linear-gradient(180deg, rgba(10, 12, 16, 0.10) 0%, rgba(10, 12, 16, 0.32) 52%, rgba(10, 12, 16, 0.66) 100%)',
      nextPlayMiniOverlay: 'linear-gradient(180deg, rgba(78, 82, 90, 0.16) 0%, rgba(58, 62, 70, 0.28) 48%, rgba(24, 27, 32, 0.72) 100%)',
      pinnedCoverOverlay: 'linear-gradient(180deg, rgba(10, 12, 16, 0.58) 0%, rgba(10, 12, 16, 0.72) 100%)',
      coverCardOverlay: 'linear-gradient(180deg, rgba(14, 16, 20, 0.22) 0%, rgba(14, 16, 20, 0.34) 100%)',
      coverCardGlass: 'linear-gradient(180deg, rgba(18, 20, 24, 0.12) 0%, rgba(18, 20, 24, 0.28) 100%)',
      coverCardGlassFallback: 'linear-gradient(180deg, rgba(18, 20, 24, 0.12) 0%, rgba(18, 20, 24, 0.36) 100%)',
      coverCardImageFilter: 'saturate(0.82) brightness(0.84)'
    }
  }

  return {
    pageBg: twColor('neutral', 25),
    panelBg: twColor('neutral', 25),
    panelBgSubtle: twColor('neutral', 50),
    elevatedBg: twColor('neutral', 75),
    inputBg: twColor('neutral', 25),
    border: twColor('neutral', 150),
    borderSubtle: twColor('neutral', 175),
    text: twColor('neutral', 700),
    textStrong: twColor('neutral', 800),
    textMuted: twColor('neutral', 500),
    textFaint: twColor('neutral', 400),
    primary: primaryColor.value,
    primarySoft: colorAlpha(primaryColor.value, 0.14),
    primaryHover: colorAlpha(primaryColor.value, 0.9),
    primaryFocus: colorAlpha(primaryColor.value, 0.24),
    primaryText: twColor('neutral', 25),
    info: twColor('sky', 500),
    infoSoft: colorAlpha(twColor('sky', 500), 0.14),
    cyan: twColor('cyan', 500),
    cyanSoft: colorAlpha(twColor('cyan', 500), 0.14),
    success: twColor('lime', 500),
    successSoft: colorAlpha(twColor('lime', 500), 0.14),
    lime: twColor('lime', 600),
    limeSoft: colorAlpha(twColor('lime', 600), 0.16),
    green: twColor('green', 600),
    greenSoft: colorAlpha(twColor('green', 600), 0.14),
    warning: twColor('amber', 500),
    warningSoft: colorAlpha(twColor('amber', 500), 0.16),
    orange: twColor('orange', 500),
    orangeSoft: colorAlpha(twColor('orange', 500), 0.14),
    error: twColor('rose', 500),
    errorSoft: colorAlpha(twColor('rose', 500), 0.14),
    magenta: twColor('pink', 500),
    magentaSoft: colorAlpha(twColor('pink', 500), 0.14),
    solidPanel: twColor('neutral', 25),
    solidPanelAlt: twColor('neutral', 50),
    solidPanelStrong: twColor('neutral', 25),
    secondaryButtonBg: twColor('neutral', 100),
    secondaryButtonText: twColor('neutral', 700),
    overlayBorder: colorAlpha(twColor('neutral', 800), 0.08),
    overlayBg: colorAlpha(twColor('neutral', 25), 0.96),
    overlayTextStrong: twColor('neutral', 800),
    overlayTextMuted: twColor('neutral', 500),
    overlayMetaText: twColor('neutral', 700),
    overlayTextSoft: twColor('neutral', 450),
    activeNeutralBg: twColor('neutral', 100),
    actionSurfaceBg: 'rgba(255, 255, 255, 0.72)',
    actionSurfaceBorder: 'rgba(15, 23, 42, 0.10)',
    actionButtonBg: 'rgba(255, 255, 255, 0.92)',
    actionButtonBorder: 'rgba(15, 23, 42, 0.12)',
    actionButtonText: twColor('neutral', 700),
    shadowSoft: '0 10px 24px rgba(15, 23, 42, 0.12)',
    shadowMedium: '0 14px 34px rgba(15, 23, 42, 0.10)',
    shadowStrong: '0 24px 52px rgba(15, 23, 42, 0.14)',
    chartTooltipBg: colorAlpha(twColor('neutral', 25), 0.96),
    chartTooltipBorder: colorAlpha(twColor('neutral', 800), 0.08),
    chartTooltipText: twColor('neutral', 800),
    chartTextMuted: twColor('neutral', 500),
    chartTextSoft: twColor('neutral', 450),
    chartTrack: colorAlpha(twColor('neutral', 700), 0.08),
    chartTrackStrong: colorAlpha(twColor('neutral', 700), 0.12),
    chartAxis: colorAlpha(twColor('neutral', 700), 0.16),
    chartShadow: 'rgba(15, 23, 42, 0.16)',
    feedCoverOverlay: 'linear-gradient(90deg, rgba(248, 250, 252, 0.90) 0%, rgba(241, 245, 249, 0.74) 46%, rgba(226, 232, 240, 0.82) 100%)',
    nextPlayHeroOverlay: 'linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(241, 245, 249, 0.22) 52%, rgba(226, 232, 240, 0.58) 100%)',
    nextPlayMiniOverlay: 'linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(241, 245, 249, 0.24) 48%, rgba(226, 232, 240, 0.62) 100%)',
    pinnedCoverOverlay: 'linear-gradient(180deg, rgba(248, 250, 252, 0.54) 0%, rgba(241, 245, 249, 0.74) 100%)',
    coverCardOverlay: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(241, 245, 249, 0.12) 100%)',
    coverCardGlass: 'linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(226, 232, 240, 0.10) 100%)',
    coverCardGlassFallback: 'linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(226, 232, 240, 0.28) 100%)'
    ,
    coverCardImageFilter: 'saturate(0.94) brightness(0.97)'
  }
})

const categoryOverview = ref<ResourceChip[]>([])
const categoryOverviewLoading = ref(false)
const recentFeeds = ref<RecentFeed[]>([])
const recentFeedsLoading = ref(false)
const nextPlayLoading = ref(false)
const nextPlayLaunchingId = ref('')
const nextPlayPool = ref<NextPlayCard[]>([])
const nextPlayVisible = ref<NextPlayCard[]>([])
const homePinnedCards = ref<HomePinnedCard[]>([])
const homePinnedLoading = ref(false)
const homePinnedPage = ref(0)
const homePinnedLaunchingId = ref('')
const homePinnedDeletingId = ref('')
const coverWallLoading = ref(false)
const coverWallActiveFilter = ref<CoverWallFilterKey>('all')
const coverWallActiveCategoryId = ref('')
const coverWallPageSize = 60
const coverWallItems = ref<Record<CoverWallFilterKey, CoverWallResource[]>>({
  all: [],
  recentRun: [],
  recentAdd: [],
  favorite: [],
  coverOnly: []
})
const coverWallSearchKeyword = ref('')
const coverWallQueryTotal = ref(0)
const coverWallCounts = ref<Record<CoverWallFilterKey, number>>({
  all: 0,
  recentRun: 0,
  recentAdd: 0,
  favorite: 0,
  coverOnly: 0
})
const coverWallPageState = ref<Record<CoverWallFilterKey, CoverWallPageState>>({
  all: { offset: 0, hasMore: true, loading: false },
  recentRun: { offset: 0, hasMore: true, loading: false },
  recentAdd: { offset: 0, hasMore: true, loading: false },
  favorite: { offset: 0, hasMore: true, loading: false },
  coverOnly: { offset: 0, hasMore: true, loading: false }
})
const coverWallStageRef = ref<HTMLElement | null>(null)
const coverWallLoadMoreRef = ref<HTMLElement | null>(null)
const coverWallStickyRef = ref<HTMLElement | null>(null)
const coverWallCardRefs = new Map<string, HTMLElement>()
const coverWallHoverState = ref<{ id: string; left: number; top: number } | null>(null)
const coverWallStickyStuck = ref(false)
const dashboardStatsLoading = ref(false)
const dashboardStats = ref<DashboardStats>({
  totalResources: 0,
  favoriteResources: 0,
  completedResources: 0,
  missingResources: 0,
  missingCovers: 0,
  longUnvisitedResources: 0,
  recentLaunchCount: 0,
  recentRuntimeSeconds: 0
})
const activityHeatmap = ref<ActivityHeatmapDay[]>([])
const activityHeatmapSummary = ref<ActivityHeatmapSummary>({
  mostActiveHour: '暂无',
  mostActiveWeekday: '暂无',
  mostUsedCategory: '暂无'
})
const activityHeatmapLoading = ref(false)
const heatmapFrameRef = ref<HTMLElement | null>(null)
const heatmapRectSize = ref(14)
const heatmapGapSize = ref(5)
const heatmapRangeDays = ref<30 | 84 | 365>(84)
const continueRailRef = ref<HTMLElement | null>(null)
const continueCards = ref<ContinueCard[]>([])
const continueLaunchingId = ref('')
const continueRailShowBackButton = ref(false)
const continueLogsLoading = ref(false)
const continueLogsPage = ref(1)
const continueLogsPageSize = 10
const continueLogsTotal = ref(0)
const activeAnalysisTab = ref<AnalysisTabKey>('category')
const dashboardLongUnvisitedBuckets = ref<Array<{ label: string; value: number }>>([])
const dashboardAddedTrend = ref<Array<{ date: string; count: number }>>([])
const analysisChartLoading = ref(false)
const usageInsightItems = ref<UsageInsightItem[]>([])
const categoryMap = ref<Record<string, any>>({})
const showHomeDetailDrawer = ref(false)
const homeDetailDrawerWidth = ref(500)
const homeDetailResource = ref<any | null>(null)
const homeDetailCategory = ref<any | null>(null)
const homeDetailEngineList = ref<any[]>([])
const homeDetailEngineOptionList = ref<any[]>([])
const homeDetailLanguageOptions = ref<any[]>([])
const showHomeEditResourceDrawer = ref(false)
const homeEditCategory = ref<any | null>(null)
const homeEditFormData = ref<any>({ name: '', meta: {} })
const homeEditingResourceId = ref('')
const homeEditInitialFormData = ref<any | null>(null)
const homeEditFormRef = ref<any>(null)
const homeEditBasePathFormItemRef = ref<any>(null)
const homeEditFetchResourceInfoLoading = ref(false)
const homeEditVideoCoverFrameLoading = ref(false)
const showHomeEditAudioCoverCandidateModal = ref(false)
const showHomeEditVideoCoverCandidateModal = ref(false)
const showHomeEditVideoSubCoverCandidateModal = ref(false)
const showHomeEditSoftwareScriptModal = ref(false)
const homeEditAuthorSelectOptions = ref<Array<{ label: string; value: string }>>([])
const homeEditTagSelectOptions = ref<Array<{ label: string; value: string }>>([])
const homeEditTypeSelectOptions = ref<Array<{ label: string; value: string }>>([])
const homeEditWebsiteTypeOptions = ref<any[]>([])
const homeEditAudioCoverCandidates = ref<Array<{
  label: string
  coverPath: string
  previewSrc: string
  queryText: string
  albumName: string
}>>([])
const homeEditVideoCoverCandidates = ref<Array<{
  label: string
  coverPath: string
  previewSrc: string
  time: number
  group: 'fixed' | 'random'
}>>([])
const homeEditVideoSubCoverCandidateItems = ref<Array<{
  fileName: string
  relativePath: string
  candidates: Array<{
    label: string
    coverPath: string
    previewSrc: string
    time: number
  }>
}>>([])
const homeEditSoftwareScriptDraft = ref('')
const homeEditSoftwareScriptRuntimePath = ref('')
const homeEditSoftwareScriptRuntimes = ref<Array<{ label: string; value: string; shellType: 'powershell' | 'cmd' }>>([])
const homeDetailScreenshotPaths = ref<string[]>([])
const homeDetailAudioTree = ref<any[]>([])
const homeDetailAudioTreeLoading = ref(false)
const homeDetailAudioContextMenuVisible = ref(false)
const homeDetailAudioContextMenuX = ref(0)
const homeDetailAudioContextMenuY = ref(0)
const homeDetailAudioContextMenuTarget = ref<any | null>(null)
const showHomeVideoOrderModal = ref(false)
const homeDetailVisibleLogCount = ref(5)
const homeDetailCurrentScreenshotIndex = ref(0)
const homeDetailRatingDraft = ref(-1)
const showHomeDeleteScreenshotConfirm = ref(false)
const homeVideoSubCoverPreviewUrls = ref<Record<string, string>>({})
let homeDetailRequestId = 0
let heatmapResizeObserver: ResizeObserver | null = null
let coverWallLoadMoreObserver: IntersectionObserver | null = null
let coverWallHoverShowTimer: number | null = null
let coverWallHoverHideTimer: number | null = null
let coverWallSearchTimer: number | null = null
let coverWallStickyScrollHost: HTMLElement | Window | null = null
let coverWallStickyRafId: number | null = null
const showHomePictureViewer = ref(false)
const homePictureViewerImagePaths = ref<string[]>([])
const homePictureViewerInitialIndex = ref(0)
const homePictureViewerResourceIds = ref<string[]>([])
const homeCurrentPictureViewerResourceId = ref('')
const showHomeComicReader = ref(false)
const homeComicReaderImagePaths = ref<string[]>([])
const homeComicReaderInitialIndex = ref(0)
const homeCurrentComicReaderResourceId = ref('')
const showHomeTextReader = ref(false)
const homeTextReaderFilePath = ref('')
const homeTextReaderTitle = ref('')
const homeTextReaderInitialProgress = ref(0)
const homeCurrentTextReaderResourceId = ref('')
const showHomePdfReader = ref(false)
const homePdfReaderFilePath = ref('')
const homePdfReaderTitle = ref('')
const homePdfReaderInitialProgress = ref(0)
const homeCurrentPdfReaderResourceId = ref('')
const showHomeEpubReader = ref(false)
const homeEpubReaderFilePath = ref('')
const homeEpubReaderTitle = ref('')
const homeEpubReaderInitialProgress = ref(0)
const homeCurrentEpubReaderResourceId = ref('')
const showHomeEbookReader = ref(false)
const homeEbookReaderFilePath = ref('')
const homeEbookReaderTitle = ref('')
const homeEbookReaderInitialProgress = ref(0)
const homeCurrentEbookReaderResourceId = ref('')
const showHomeVideoPlayer = ref(false)
const homeVideoPlayerPlaylist = ref<Array<{
  path: string
  label: string
  resourceId?: string
  resourceTitle?: string
  coverSrc?: string
  subtitlePath?: string
}>>([])
const homeVideoPlayerInitialPath = ref('')
const homeVideoPlayerInitialTime = ref(0)
const homeVideoPlayerTitle = ref('')

const defaultCategoryPillColor = '#737373'
const nextPlaySessionStorageKey = 'neo-resource-manager:dashboard:next-play'
const categoryTonePalette: Tone[] = ['purple', 'cyan', 'amber', 'orange', 'rose', 'magenta', 'lime', 'blue', 'green', 'slate']
const categoryToneByName: Array<{ keywords: string[]; tone: Tone }> = [
  { keywords: ['游戏', 'game', 'galgame'], tone: 'purple' },
  { keywords: ['软件', '应用', '工具', 'software', 'app'], tone: 'cyan' },
  { keywords: ['图片', '画集', 'image'], tone: 'amber' },
  { keywords: ['漫画', 'comic', 'manga'], tone: 'orange' },
  { keywords: ['电影', 'movie'], tone: 'rose' },
  { keywords: ['番剧', 'anime'], tone: 'magenta' },
  { keywords: ['音声', 'asmr', '广播剧'], tone: 'lime' },
  { keywords: ['音乐', 'music', 'audio'], tone: 'blue' },
  { keywords: ['小说', '书', 'novel', 'book'], tone: 'green' },
  { keywords: ['视频', 'video'], tone: 'rose' },
  { keywords: ['网站', '网址', 'website', 'web'], tone: 'slate' }
]
const categoryEmojiByName: Array<{ keywords: string[]; emoji: string }> = [
  { keywords: ['游戏', 'game', 'galgame'], emoji: '🎮' },
  { keywords: ['软件', '应用', '工具', 'software', 'app'], emoji: '💻' },
  { keywords: ['图片', '画集', 'image'], emoji: '🖼️' },
  { keywords: ['漫画', 'comic', 'manga'], emoji: '📚' },
  { keywords: ['电影', 'movie'], emoji: '🎬' },
  { keywords: ['番剧', 'anime'], emoji: '📺' },
  { keywords: ['音声', 'asmr', '广播剧'], emoji: '🎧' },
  { keywords: ['音乐', 'music', 'audio'], emoji: '🎵' },
  { keywords: ['小说', '书', 'novel', 'book'], emoji: '📖' },
  { keywords: ['网站', '网址', 'website', 'web'], emoji: '🌐' }
]

const getCategoryTone = (categoryName: string, index: number): Tone => {
  const normalizedName = categoryName.trim().toLowerCase()
  const matched = categoryToneByName.find((item) =>
    item.keywords.some((keyword) => normalizedName.includes(keyword.toLowerCase()))
  )

  return matched?.tone ?? categoryTonePalette[index % categoryTonePalette.length]
}

const isValidCssColor = (color: string) => {
  if (!color || typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return /^#[0-9a-f]{3,8}$/i.test(color)
  }

  return CSS.supports('color', color)
}

const resolveCategoryPillColor = (category: any) => {
  const configuredColor = String(category?.pillColor ?? category?.pill_color ?? '').trim()
  if (isValidCssColor(configuredColor)) {
    return configuredColor
  }

  return defaultCategoryPillColor
}

const getCategoryPillBackgroundColor = (color: string) => {
  try {
    return colorAlpha(color, isDark.value ? 0.2 : 0.14)
  } catch {
    return isDark.value ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
  }
}

const getCategoryEmoji = (category: any, categoryName: string) => {
  const emoji = String(category?.emoji ?? '').trim()
  if (emoji) {
    return emoji
  }

  const normalizedName = categoryName.trim().toLowerCase()
  const matched = categoryEmojiByName.find((item) =>
    item.keywords.some((keyword) => normalizedName.includes(keyword.toLowerCase()))
  )

  return matched?.emoji ?? '📁'
}

const loadCategoryOverview = async () => {
  categoryOverviewLoading.value = true
  try {
    await measureDashboardTask('loadCategoryOverview', async () => {
      const categories = await window.api.db.getCategory()
      categoryMap.value = Object.fromEntries(
        (Array.isArray(categories) ? categories : []).map((category: any) => [String(category?.id ?? '').trim(), category])
      )
      const overviewItems = await Promise.all(
        categories.map(async (category: any, index: number) => {
          const categoryId = String(category?.id ?? '').trim()
          const categoryName = String(category?.name ?? '').trim() || '未命名分类'
          let total = 0
          const color = resolveCategoryPillColor(category)

          if (categoryId) {
            const result = await window.api.db.getResourceByCategoryId(categoryId, {
              page: 1,
              pageSize: 1
            })
            total = Number(result?.total ?? 0)
          }

          return {
            id: categoryId || categoryName,
            routeId: categoryId,
            categoryName,
            count: total,
            emoji: getCategoryEmoji(category, categoryName),
            label: `${categoryName} ${total}`,
            tone: getCategoryTone(categoryName, index),
            color,
            backgroundColor: getCategoryPillBackgroundColor(color)
          }
        })
      )

      categoryOverview.value = overviewItems
    })
  } catch {
    categoryMap.value = {}
    categoryOverview.value = []
  } finally {
    categoryOverviewLoading.value = false
  }
}

const normalizeDateValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (value instanceof Date) {
    return value
  }

  if (typeof value === 'number') {
    return new Date(value < 10_000_000_000 ? value * 1000 : value)
  }

  const numericValue = Number(value)
  if (Number.isFinite(numericValue)) {
    return new Date(numericValue < 10_000_000_000 ? numericValue * 1000 : numericValue)
  }

  const parsedDate = new Date(String(value ?? ''))
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

const formatAddedTime = (value: unknown) => {
  const date = normalizeDateValue(value)
  if (!date) {
    return '最近添加'
  }

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) {
    return '刚刚添加'
  }

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前添加`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前添加`
  }

  const diffDays = Math.floor(diffHours / 24)
  return diffDays <= 1 ? '昨天添加' : `${diffDays} 天前添加`
}

const loadRecentFeeds = async () => {
  recentFeedsLoading.value = true
  try {
    await measureDashboardTask('loadRecentFeeds', async () => {
      const items = await window.api.db.getRecentlyAddedResources(7, 3)
      if (!isDashboardPreviewWorkAllowed()) {
        return
      }
      const feeds: RecentFeed[] = []
      for (const item of items) {
        if (!isDashboardPreviewWorkAllowed()) {
          break
        }
        const categoryName = String(item?.categoryName ?? '').trim()
        const categoryEmoji = String(item?.categoryEmoji ?? '').trim()
        const coverPath = String(item?.coverPath ?? '').trim()
        let coverUrl = ''

        if (coverPath && isDashboardPreviewWorkAllowed()) {
          coverUrl = await window.api.dialog.getImagePreviewUrl(coverPath, {
            maxWidth: 640,
            maxHeight: 220,
            fit: 'cover',
            quality: 90
          }) ?? ''
        }

        feeds.push({
          id: String(item?.id ?? ''),
          title: String(item?.title ?? '未命名资源'),
          meta: [
            categoryEmoji || '📁',
            categoryName || '未分类',
            formatAddedTime(item?.createTime)
          ].filter(Boolean).join(' · '),
          categoryId: String(item?.categoryId ?? ''),
          categoryName,
          categoryEmoji,
          coverUrl
        })
      }
      if (isDashboardPreviewWorkAllowed()) {
        recentFeeds.value = feeds
      }
    })
  } catch {
    if (!dashboardDisposed) {
      recentFeeds.value = []
    }
  } finally {
    if (!dashboardDisposed) {
      recentFeedsLoading.value = false
    }
  }
}

const getRecentFeedStyle = (feed: RecentFeed) => {
  if (!feed.coverUrl) {
    return {}
  }

  return {
    backgroundImage: [
      themeTokens.value.feedCoverOverlay,
      toCssUrlValue(feed.coverUrl)
    ].join(', '),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }
}

const getNextPlayCardStyle = (item: NextPlayCard) => {
  const baseStyle = {
    color: item.categoryColor,
    borderColor: colorAlpha(item.categoryColor, isDark.value ? 0.38 : 0.24),
    backgroundColor: colorAlpha(item.categoryColor, isDark.value ? 0.14 : 0.08)
  }

  if (!item.coverUrl) {
    return baseStyle
  }

  return {
    ...baseStyle,
    '--next-play-cover-url': toCssUrlValue(item.coverUrl)
  }
}

const formatPinnedRelativeTime = (value: unknown) => {
  const date = normalizeDateValue(value)
  if (!date) {
    return ''
  }

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) {
    return '刚刚'
  }

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) {
    return diffDays <= 1 ? '昨天' : `${diffDays} 天前`
  }

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) {
    return `${diffMonths} 个月前`
  }

  return `${Math.floor(diffMonths / 12)} 年前`
}

const getHomePinnedMeta = (item: { categoryName?: string; accessCount?: number; lastAccessTime?: unknown; pinnedAt?: unknown }) => {
  const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
  const accessCount = Number(item?.accessCount ?? 0)
  const lastAccess = formatPinnedRelativeTime(item?.lastAccessTime)
  const pinnedAt = formatPinnedRelativeTime(item?.pinnedAt)

  if (accessCount >= 6) {
    return `${categoryName} · 常用启动项`
  }

  if (lastAccess) {
    return `${categoryName} · 上次打开 ${lastAccess}`
  }

  if (pinnedAt) {
    return `${categoryName} · ${pinnedAt}固定`
  }

  return `${categoryName} · 已固定到首页`
}

const loadHomePinnedCards = async () => {
  homePinnedLoading.value = true
  try {
    await measureDashboardTask('loadHomePinnedCards', async () => {
      const items = await window.api.db.getHomePinnedResources(12)
      homePinnedCards.value = Array.isArray(items)
        ? await Promise.all(items.map(async (item: any) => {
          const coverPath = String(item?.coverPath ?? '').trim()
          let coverUrl = ''

          if (coverPath) {
            coverUrl = await window.api.dialog.getImagePreviewUrl(coverPath, {
              maxWidth: 720,
              maxHeight: 420,
              fit: 'cover',
              quality: 86
            }) ?? ''
          }

          return {
            id: String(item?.id ?? ''),
            title: String(item?.title ?? '未命名资源'),
            categoryId: String(item?.categoryId ?? ''),
            categoryName: String(item?.categoryName ?? '').trim() || '未分类',
            categoryEmoji: String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, String(item?.categoryName ?? '')),
            categoryColor: String(item?.categoryPillColor ?? '').trim() || defaultCategoryPillColor,
            coverUrl,
            basePath: String(item?.basePath ?? ''),
            fileName: String(item?.fileName ?? ''),
            pinnedAt: normalizeDateValue(item?.pinnedAt)?.getTime() ?? null,
            createTime: normalizeDateValue(item?.createTime)?.getTime() ?? null,
            lastAccessTime: normalizeDateValue(item?.lastAccessTime)?.getTime() ?? null,
            accessCount: Number(item?.accessCount ?? 0),
            meta: getHomePinnedMeta(item)
          }
        }))
        : []
      homePinnedPage.value = Math.min(homePinnedPage.value, Math.max(Math.ceil(homePinnedCards.value.length / 4) - 1, 0))
    })
  } catch {
    homePinnedCards.value = []
    homePinnedPage.value = 0
  } finally {
    homePinnedLoading.value = false
  }
}

const hydrateSingleCoverWallCollection = async (rawItems: any[]) => {
  const items = await Promise.all((Array.isArray(rawItems) ? rawItems : []).map(async (item: any, index: number) => {
    const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
    const categoryEmoji = String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, categoryName)
    const tone = getCategoryTone(categoryName, index)
    const categoryColor = String(item?.categoryPillColor ?? '').trim() || getToneColor(tone)
    const coverPath = String(item?.coverPath ?? '').trim()
    let coverUrl = ''

    if (coverPath) {
      coverUrl = await window.api.dialog.getImagePreviewUrl(coverPath, {
        maxWidth: 420,
        maxHeight: 560,
        fit: 'cover',
        quality: 88
      }) ?? ''
    }

    return {
      id: String(item?.id ?? ''),
      title: String(item?.title ?? '未命名资源'),
      categoryId: String(item?.categoryId ?? ''),
      categoryName,
      categoryEmoji,
      categoryColor,
      coverPath,
      coverUrl,
      favorite: Boolean(item?.ifFavorite),
      isCompleted: Boolean(item?.isCompleted),
      missingStatus: Boolean(item?.missingStatus),
      isPinned: Boolean(item?.isPinned),
      rating: Number(item?.rating ?? -1),
      createTime: normalizeDateValue(item?.createTime)?.getTime() ?? null,
      lastAccessTime: normalizeDateValue(item?.lastAccessTime)?.getTime() ?? null,
      accessCount: Math.max(0, Number(item?.accessCount ?? 0)),
      tagCount: Math.max(0, Number(item?.tagCount ?? 0)),
      authorCount: Math.max(0, Number(item?.authorCount ?? 0)),
      searchText: String(item?.searchText ?? '').trim()
    }
  }))

  return items.filter((item) => item.id)
}
const resetCoverWallViewState = () => {
  coverWallHoverState.value = null
  coverWallCardRefs.clear()
}

const resetCoverWallPageState = (filterKey?: CoverWallFilterKey) => {
  if (filterKey) {
    coverWallPageState.value[filterKey] = { offset: 0, hasMore: true, loading: false }
    coverWallItems.value[filterKey] = []
    return
  }

  coverWallPageState.value = {
    all: { offset: 0, hasMore: true, loading: false },
    recentRun: { offset: 0, hasMore: true, loading: false },
    recentAdd: { offset: 0, hasMore: true, loading: false },
    favorite: { offset: 0, hasMore: true, loading: false },
    coverOnly: { offset: 0, hasMore: true, loading: false }
  }
  coverWallItems.value = { all: [], recentRun: [], recentAdd: [], favorite: [], coverOnly: [] }
}

const mergeCoverWallPage = (filterKey: CoverWallFilterKey, items: CoverWallResource[], reset = false) => {
  const currentItems = reset ? [] : (coverWallItems.value[filterKey] ?? [])
  const seenIds = new Set(currentItems.map((item) => item.id))
  const mergedItems = [...currentItems]
  for (const item of items) {
    if (seenIds.has(item.id)) {
      continue
    }
    seenIds.add(item.id)
    mergedItems.push(item)
  }
  coverWallItems.value[filterKey] = mergedItems
}

const loadCoverWallPage = async (filterKey: CoverWallFilterKey, reset = false) => {
  const pageState = coverWallPageState.value[filterKey]
  if (pageState.loading || (!reset && !pageState.hasMore)) {
    return
  }

  pageState.loading = true
  if (reset) {
    pageState.offset = 0
    pageState.hasMore = true
  }

  try {
    const result = await window.api.db.getHomeCoverWallData({
      filter: filterKey,
      limit: coverWallPageSize,
      offset: pageState.offset,
      keyword: coverWallSearchKeyword.value.trim() || undefined
    })

    coverWallCounts.value = {
      all: Number(result?.counts?.all ?? 0),
      recentRun: Number(result?.counts?.recentRun ?? 0),
      recentAdd: Number(result?.counts?.recentAdd ?? 0),
      favorite: Number(result?.counts?.favorite ?? 0),
      coverOnly: Number(result?.counts?.coverOnly ?? 0)
    }

    const rawItems = Array.isArray(result?.items) ? result.items : []
    coverWallQueryTotal.value = Number(result?.total ?? rawItems.length)
    const hydratedItems = await hydrateSingleCoverWallCollection(rawItems)
    emitRendererTiming('dashboard cover wall page hydrated', {
      filterKey,
      reset,
      rawItemCount: rawItems.length,
      hydratedItemCount: hydratedItems.length,
      coveredItemCount: hydratedItems.filter((item) => Boolean(String(item.coverUrl ?? '').trim())).length
    })
    mergeCoverWallPage(filterKey, hydratedItems, reset)

    pageState.offset += rawItems.length
    pageState.hasMore = Boolean(result?.hasMore)
  } catch {
    emitRendererTiming('dashboard cover wall page hydrated', {
      filterKey,
      reset,
      status: 'error'
    })
    if (reset) {
      coverWallItems.value[filterKey] = []
      pageState.offset = 0
      pageState.hasMore = false
    }
  } finally {
    pageState.loading = false
  }
}

const loadCoverWallData = async () => {
  coverWallLoading.value = true
  try {
    await measureDashboardTask('loadCoverWallData', async () => {
      resetCoverWallPageState()
      await loadCoverWallPage('all', true)
      resetCoverWallViewState()
    })
  } catch {
    coverWallCounts.value = { all: 0, recentRun: 0, recentAdd: 0, favorite: 0, coverOnly: 0 }
    resetCoverWallPageState()
    resetCoverWallViewState()
  } finally {
    coverWallLoading.value = false
  }
}

const handleCoverFilterClick = (filterKey: CoverWallFilterKey) => {
  if (coverWallActiveSelection.value.kind === 'status' && coverWallActiveFilter.value === filterKey) {
    return
  }

  coverWallActiveFilter.value = filterKey
  coverWallActiveCategoryId.value = ''
  coverWallSearchKeyword.value = ''
  resetCoverWallViewState()
  if (!coverWallItems.value[filterKey].length && coverWallPageState.value[filterKey].hasMore) {
    void loadCoverWallPage(filterKey, true)
  }
}

const getCoverCardStyle = (item: CoverWallResource) => ({
  color: item.categoryColor,
  '--cover-card-url': toCssUrlValue(item.coverUrl)
})

const setCoverWallCardRef = (id: string, element: any) => {
  if (element instanceof HTMLElement) {
    coverWallCardRefs.set(id, element)
    return
  }

  coverWallCardRefs.delete(id)
}

const clearCoverWallHoverTimers = () => {
  if (coverWallHoverShowTimer != null) {
    clearTimeout(coverWallHoverShowTimer)
    coverWallHoverShowTimer = null
  }
  if (coverWallHoverHideTimer != null) {
    clearTimeout(coverWallHoverHideTimer)
    coverWallHoverHideTimer = null
  }
}

const positionCoverWallHoverCard = (itemId: string) => {
  const stageElement = coverWallStageRef.value
  const cardElement = coverWallCardRefs.get(itemId)
  if (!stageElement || !cardElement) {
    return
  }

  const stageRect = stageElement.getBoundingClientRect()
  const cardRect = cardElement.getBoundingClientRect()
  const panelWidth = 272
  const gap = 14
  const preferredRight = cardRect.right + gap + panelWidth <= stageRect.right
  const rawLeft = preferredRight
    ? cardRect.right - stageRect.left + gap
    : cardRect.left - stageRect.left - panelWidth - gap
  const maxLeft = Math.max(stageRect.width - panelWidth, 0)
  const left = Math.min(Math.max(rawLeft, 0), maxLeft)
  const maxTop = Math.max(stageRect.height - 210, 0)
  const top = Math.min(Math.max(cardRect.top - stageRect.top + 8, 0), maxTop)

  coverWallHoverState.value = {
    id: itemId,
    left,
    top
  }
}

const scheduleCoverWallHoverShow = (itemId: string) => {
  if (coverWallHoverHideTimer != null) {
    clearTimeout(coverWallHoverHideTimer)
    coverWallHoverHideTimer = null
  }
  if (coverWallHoverState.value?.id === itemId) {
    return
  }
  if (coverWallHoverShowTimer != null) {
    clearTimeout(coverWallHoverShowTimer)
  }
  coverWallHoverShowTimer = window.setTimeout(() => {
    positionCoverWallHoverCard(itemId)
    coverWallHoverShowTimer = null
  }, 600)
}

const scheduleCoverWallHoverHide = (itemId?: string) => {
  if (coverWallHoverShowTimer != null) {
    clearTimeout(coverWallHoverShowTimer)
    coverWallHoverShowTimer = null
  }
  if (!coverWallHoverState.value) {
    return
  }
  if (itemId && coverWallHoverState.value.id !== itemId) {
    return
  }
  if (coverWallHoverHideTimer != null) {
    clearTimeout(coverWallHoverHideTimer)
    coverWallHoverHideTimer = null
  }
  coverWallHoverState.value = null
}

const readNextPlaySessionCache = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(nextPlaySessionStorageKey)
    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue)
    const pool = Array.isArray(parsed?.pool) ? parsed.pool : []
    if (!pool.length) {
      return null
    }

    return {
      pool
    }
  } catch {
    return null
  }
}

const persistNextPlaySessionCache = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return
  }

  try {
    if (!nextPlayPool.value.length) {
      window.sessionStorage.removeItem(nextPlaySessionStorageKey)
      return
    }

    window.sessionStorage.setItem(nextPlaySessionStorageKey, JSON.stringify({
      pool: nextPlayPool.value
    }))
  } catch {
    // ignore storage failures
  }
}

const normalizeNextPlayPool = (pool: NextPlayCard[]) => {
  return [...pool]
    .filter((item) => String(item?.id ?? '').trim())
    .sort((left, right) => {
      const leftOrder = Number.isFinite(Number(left?.order)) ? Number(left.order) : Number.MAX_SAFE_INTEGER
      const rightOrder = Number.isFinite(Number(right?.order)) ? Number(right.order) : Number.MAX_SAFE_INTEGER
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }
      return String(left?.title ?? '').localeCompare(String(right?.title ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    })
    .map((item, index) => ({
      ...item,
      order: index + 1
    }))
}

const buildNextPlayVisible = () => {
  const pool = normalizeNextPlayPool(nextPlayPool.value)
  nextPlayPool.value = pool
  if (!pool.length) {
    nextPlayVisible.value = []
    persistNextPlaySessionCache()
    return
  }

  const visibleItems = pool.slice(0, Math.min(9, pool.length))
  nextPlayVisible.value = visibleItems
  persistNextPlaySessionCache()
}

const nextPlayHero = computed(() => {
  return nextPlayVisible.value.find((item) => Number(item?.order ?? 0) === 1) ?? nextPlayVisible.value[0] ?? null
})

const nextPlayMiniCards = computed(() => {
  if (!nextPlayHero.value) {
    return nextPlayVisible.value
  }

  return nextPlayVisible.value.filter((item) => item.id !== nextPlayHero.value?.id).slice(0, 8)
})

const homePinnedPageSize = 4
const homePinnedPageCount = computed(() => Math.max(Math.ceil(homePinnedCards.value.length / homePinnedPageSize), 1))
const visibleHomePinnedCards = computed(() => {
  const start = homePinnedPage.value * homePinnedPageSize
  return homePinnedCards.value.slice(start, start + homePinnedPageSize)
})
const canMoveHomePinnedPrev = computed(() => homePinnedPage.value > 0)
const canMoveHomePinnedNext = computed(() => homePinnedPage.value < homePinnedPageCount.value - 1)
const homePinnedPageDots = computed(() =>
  Array.from({ length: homePinnedPageCount.value }, (_, index) => index)
)

const hydrateNextPlayCards = async (rows: any[]) => {
  const items: NextPlayCard[] = []
  for (const [index, item] of (Array.isArray(rows) ? rows : []).entries()) {
    if (!isDashboardPreviewWorkAllowed()) {
      break
    }
    const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
    const categoryEmoji = String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, categoryName)
    const tone = getCategoryTone(categoryName, index)
    const categoryColor = String(item?.categoryPillColor ?? '').trim() || getToneColor(tone)
    const coverPath = String(item?.coverPath ?? '').trim()
    let coverUrl = ''

    if (coverPath && isDashboardPreviewWorkAllowed()) {
      coverUrl = await window.api.dialog.getImagePreviewUrl(coverPath, {
        maxWidth: 720,
        maxHeight: 420,
        fit: 'cover',
        quality: 90
      }) ?? ''
    }

    const createTimeValue = Number(item?.createTime ?? 0)
    const ratingValue = Number(item?.rating ?? -1)
    const accessCountValue = Number(item?.accessCount ?? 0)
    const candidate: NextPlayCard = {
      id: String(item?.id ?? ''),
      order: Math.max(1, Number(item?.order ?? index + 1)),
      title: String(item?.title ?? '未命名资源'),
      categoryId: String(item?.categoryId ?? ''),
      categoryName,
      categoryEmoji,
      categoryColor,
      coverUrl,
      meta: [categoryEmoji, categoryName].filter(Boolean).join(' · '),
      reason: String(item?.reason ?? '随机补位，也许正合胃口'),
      action: getContinueActionLabel(categoryName),
      basePath: String(item?.basePath ?? ''),
      fileName: String(item?.fileName ?? ''),
      favorite: Boolean(item?.ifFavorite),
        rating: Number.isFinite(ratingValue) ? ratingValue : -1,
        createTime: Number.isFinite(createTimeValue) ? createTimeValue : 0,
        accessCount: Number.isFinite(accessCountValue) ? accessCountValue : 0
    }
    items.push(candidate)
  }

  if (!isDashboardPreviewWorkAllowed()) {
    return
  }

  nextPlayPool.value = items.filter((item) => item.id)
  buildNextPlayVisible()
}

const loadNextPlayCards = async (forceRefresh = false) => {
  const cachedState = forceRefresh ? null : readNextPlaySessionCache()
  if (cachedState?.pool?.length) {
    emitRendererTiming('dashboard task end', {
      label: 'loadNextPlayCards',
      status: 'cache-hit',
      forceRefresh: Boolean(forceRefresh),
      itemCount: Array.isArray(cachedState.pool) ? cachedState.pool.length : 0
    })
    nextPlayPool.value = cachedState.pool
      .filter((item: any) => String(item?.id ?? '').trim())
      .map((item: any, index: number) => ({
        ...item,
        order: Math.max(1, Number(item?.order ?? index + 1)),
        categoryName: String(item?.categoryName ?? '').trim() || '未分类',
        categoryEmoji: String(item?.categoryEmoji ?? '').trim() || '📁'
      }))
    buildNextPlayVisible()
    return
  }

  nextPlayLoading.value = true
  try {
    await measureDashboardTask('loadNextPlayCards', async () => {
      const rows = await window.api.db.getHomeNextPlayResources(9)
      if (!isDashboardPreviewWorkAllowed()) {
        return
      }
      await hydrateNextPlayCards(rows)
    }, {
      forceRefresh: Boolean(forceRefresh)
    })
  } catch {
    if (!dashboardDisposed) {
      nextPlayPool.value = []
      buildNextPlayVisible()
    }
  } finally {
    if (!dashboardDisposed) {
      nextPlayLoading.value = false
    }
  }
}

const rotateNextPlayCards = async () => {
  if (nextPlayLoading.value) {
    return
  }

  await loadNextPlayCards(true)
}

const promoteNextPlayCard = (itemIdInput: string) => {
  const itemId = String(itemIdInput ?? '').trim()
  if (!itemId) {
    return
  }

  const currentPool = normalizeNextPlayPool(nextPlayPool.value)
  const target = currentPool.find((item) => item.id === itemId)
  if (!target || target.order === 1) {
    return
  }

  const targetOrder = target.order
  nextPlayPool.value = currentPool.map((item) => {
    if (item.id === itemId) {
      return {
        ...item,
        order: 1
      }
    }

    if (item.order < targetOrder) {
      return {
        ...item,
        order: item.order + 1
      }
    }

    return item
  })
  buildNextPlayVisible()
}

const launchNextPlayResource = async (item: NextPlayCard | null) => {
  const resourceId = String(item?.id ?? '').trim()
  const categoryId = String(item?.categoryId ?? '').trim()
  if (!resourceId || !categoryId || nextPlayLaunchingId.value === resourceId) {
    return
  }

  nextPlayLaunchingId.value = resourceId
  try {
    const context = await resolveHomeResourceContext(resourceId, categoryId)
    if (!context?.resource) {
      notify('error', '接下来看看', '未能读取资源详情')
      return
    }

    await openHomeResourceByCategoryProfile(context.resource, context.categoryProfile)
  } finally {
    nextPlayLaunchingId.value = ''
  }
}

const buildDisplayBasePath = (resource: any) => {
  const basePath = String(resource?.basePath ?? '')
  const fileName = String(resource?.fileName ?? resource?.filename ?? '')

  if (!basePath) {
    return ''
  }

  if (!fileName) {
    return basePath
  }

  const normalizedBasePath = basePath.replace(/[\\/]+$/, '')
  if (!normalizedBasePath) {
    return fileName
  }

  return `${normalizedBasePath}\\${fileName}`
}

const buildDisplayDirectoryPath = (resource: any) => {
  return String(resource?.basePath ?? '').trim()
}

const getResourceNameFromBasePath = (basePath: string) => {
  const normalizedPath = String(basePath ?? '').replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/').filter(Boolean)

  if (!pathSegments.length) {
    return ''
  }

  const lastSegment = pathSegments[pathSegments.length - 1]
  if (lastSegment.includes('.') && pathSegments.length > 1) {
    return pathSegments[pathSegments.length - 2]
  }

  return lastSegment
}

const getResourceFilePath = (resource: any) => {
  return String(buildDisplayBasePath(resource) ?? '').trim()
}

const getHomeResourceTitle = (resource: any, fallback = '资源') => {
  return String(resource?.title ?? '').trim() || fallback
}

const getFileNameWithoutExtension = (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim().replace(/\\/g, '/')
  const fileName = normalizedPath.split('/').pop() ?? ''
  const matched = fileName.match(/^(.+?)(\.[^.]+)?$/)
  return matched?.[1] ?? ''
}

const getFileExtension = (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim().replace(/\\/g, '/')
  const fileName = normalizedPath.split('/').pop() ?? ''
  return String(fileName.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase()
}

const normalizePathValue = (targetPath: string | null | undefined) => String(targetPath ?? '').replace(/\\/g, '/').trim()
const compareByFileName = (left: string, right: string) => String(left ?? '').localeCompare(String(right ?? ''), undefined, {
  numeric: true,
  sensitivity: 'base'
})
const getRelativeVideoPath = (basePath: string | null | undefined, filePath: string | null | undefined) => {
  const normalizedBasePath = normalizePathValue(basePath).replace(/\/+$/, '')
  const normalizedFilePath = normalizePathValue(filePath)
  if (!normalizedBasePath) {
    return normalizedFilePath
  }

  if (normalizedFilePath.toLowerCase().startsWith(`${normalizedBasePath.toLowerCase()}/`)) {
    return normalizedFilePath.slice(normalizedBasePath.length + 1)
  }

  return normalizedFilePath
}
const resolveHomeStoreIcon = (icon: string) => {
  if (!icon) {
    return ''
  }

  if (/^(?:https?:|data:|file:|\/|[a-zA-Z]:[\\/])/.test(icon)) {
    return icon
  }

  return storeIconUrlByName.get(icon) ?? icon
}
const resolveHomeEngineIcon = (icon: string) => {
  if (!icon) {
    return ''
  }

  if (/^(?:https?:|data:|file:|\/|[a-zA-Z]:[\\/])/.test(icon)) {
    return icon
  }

  return engineIconUrlByName.get(icon) ?? icon
}
const normalizeAudioPath = (filePath: string) => String(filePath ?? '').trim().replace(/\\/g, '/').toLowerCase()

const collectAudioTreeImagePaths = (tree: any[]) => {
  const imagePaths: string[] = []

  const walk = (nodes: any[]) => {
    for (const node of nodes) {
      if (!node) {
        continue
      }

      if (node?.kind === 'image' && node?.path) {
        imagePaths.push(String(node.path))
      }

      if (Array.isArray(node?.children) && node.children.length) {
        walk(node.children)
      }
    }
  }

  walk(Array.isArray(tree) ? tree : [])
  return imagePaths
}

const collectAudioTreeTracks = (tree: any[]) => {
  const tracks: Array<{
    path: string
    label: string
    duration?: number
    resourceId?: string
    resourceTitle?: string
    artist?: string
    coverSrc?: string
  }> = []

  const walk = (nodes: any[]) => {
    for (const node of nodes) {
      if (Array.isArray(node?.children) && node.children.length) {
        walk(node.children)
      }

      if (node?.path && node?.kind === 'audio') {
        tracks.push({
          path: String(node.path),
          label: String(node.label ?? node.name ?? getFileNameWithoutExtension(String(node.path)) ?? '音频'),
          duration: Number(node?.duration ?? 0) || undefined,
          artist: String(node?.artist ?? '').trim() || undefined
        })
      }
    }
  }

  walk(Array.isArray(tree) ? tree : [])
  return tracks
}

const collectVideoTreeTracks = (tree: any[], resource: any) => {
  const tracks: Array<{
    path: string
    label: string
    resourceId?: string
    resourceTitle?: string
    coverSrc?: string
    subtitlePath?: string
  }> = []

  const walk = (nodes: any[]) => {
    for (const node of nodes) {
      if (Array.isArray(node?.children) && node.children.length) {
        walk(node.children)
      }

      if (node?.path && node?.kind === 'video') {
        tracks.push({
          path: String(node.path),
          label: String(node.label ?? node.name ?? getFileNameWithoutExtension(String(node.path)) ?? '视频'),
          resourceId: String(resource?.id ?? ''),
          resourceTitle: String(resource?.title ?? '视频播放'),
          coverSrc: String(node?.coverPreviewSrc ?? '').trim() || undefined,
          subtitlePath: String(node?.subtitlePath ?? '').trim() || undefined
        })
      }
    }
  }

  walk(Array.isArray(tree) ? tree : [])
  return tracks
}

const getHomeDetailMediaSubItems = (items: any[]) =>
  (Array.isArray(items) ? items : [])
    .map((item: any) => ({
      id: String(item?.id ?? ''),
      fileName: String(item?.fileName ?? '').trim(),
      relativePath: normalizePathValue(String(item?.relativePath ?? '')),
      kind: String(item?.kind ?? 'video').trim(),
      coverPath: String(item?.coverPath ?? '').trim(),
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : Number.MAX_SAFE_INTEGER,
      isVisible: item?.isVisible !== false,
      hasSubtitle: item?.hasSubtitle === true,
      duration: item?.duration ?? null,
      bitrate: item?.bitrate ?? null,
      sampleRate: item?.sampleRate ?? null,
      frameRate: item?.frameRate ?? null,
      audioBitrate: item?.audioBitrate ?? null,
      audioSampleRate: item?.audioSampleRate ?? null,
      width: item?.width ?? null,
      height: item?.height ?? null
    }))
    .filter((item) => item.relativePath)
    .sort((left, right) => {
      const sortCompare = left.sortOrder - right.sortOrder
      if (sortCompare !== 0) {
        return sortCompare
      }

      return compareByFileName(left.fileName || left.relativePath, right.fileName || right.relativePath)
    })

const getHomeDetailVideoSubItems = (resource: any) => getHomeDetailMediaSubItems(resource?.videoSubs)
const getHomeDetailAsmrSubItems = (resource: any) => getHomeDetailMediaSubItems(resource?.asmrSubs)
const resolveHomeResourceCategoryProfile = (resource: any) =>
  resolveCategoryProfile(resolveDashboardCategorySettings(resource?.category ?? {}))
const isHomeVideoFolderResource = (resource: any) =>
  resolveHomeResourceCategoryProfile(resource).flags.isVideoFolder || getHomeDetailVideoSubItems(resource).length > 0
const getHomeVideoSubCoverKey = (resource: any, relativePath: string | null | undefined) =>
  `${String(resource?.id ?? '').trim()}::${normalizePathValue(relativePath).toLowerCase()}`
const getHomeVideoSubCoverPreviewSrc = (resource: any, relativePath: string | null | undefined) =>
  homeVideoSubCoverPreviewUrls.value[getHomeVideoSubCoverKey(resource, relativePath)] ?? ''
const scheduleHomeVideoSubCoverPreviewRefresh = (resource: any) => {
  void refreshHomeVideoSubCoverPreviewUrls(resource)
}

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

  return await resolveAudioPlayerCoverPreviewUrl(coverPath)
}

const applyHomeAudioPlayerSession = async (resource: any, playlist: Array<any>, initialPath: string, initialTime = 0) => {
  const coverSrc = await resolveHomeAudioCoverPreview(resource)
  setAudioPlayerSession({
    resourceId: String(resource?.id ?? ''),
    initialPath,
    initialTime: Math.max(0, Number(initialTime ?? 0)),
    sessionVersion: Date.now(),
    title: String(resource?.title ?? '音频播放器'),
    artist: String(resource?.audioMeta?.artist ?? '').trim(),
    displayMode: String(resource?.category?.referencePath ?? resource?.extendTable ?? '').trim() === 'audio_meta' ? 'music' : 'default',
    coverSrc,
    playlist
  })
  setAudioPlayerVisible(true)
}

const refreshHomeVideoSubCoverPreviewUrls = async (resource: any) => {
  const resourceId = String(resource?.id ?? '').trim()
  if (!resourceId) {
    return
  }

  const videoSubItems = getHomeDetailVideoSubItems(resource)
  if (!videoSubItems.length) {
    return
  }

  const nextMap = {...homeVideoSubCoverPreviewUrls.value}
  const updates = await Promise.all(videoSubItems.map(async (item) => {
    const coverPath = String(item.coverPath ?? '').trim()
    const key = getHomeVideoSubCoverKey(resource, item.relativePath)
    if (!coverPath) {
      return {key, value: ''}
    }

    try {
      return {
        key,
        value: await resolveVideoSubCoverPreviewUrl(coverPath)
      }
    } catch {
      return {key, value: ''}
    }
  }))

  for (const item of updates) {
    nextMap[item.key] = item.value
  }
  homeVideoSubCoverPreviewUrls.value = nextMap
}

const refreshHomeDetailAudioTree = async (resource?: any) => {
  const targetResource = resource ?? homeDetailResource.value
  if (!targetResource || !(homeDetailIsAsmr.value || isHomeVideoFolderResource(targetResource))) {
    homeDetailAudioTree.value = []
    homeDetailAudioTreeLoading.value = false
    return
  }

  const requestId = homeDetailRequestId
  homeDetailAudioTreeLoading.value = true
  try {
    const audioTree = await window.api.dialog.getDirectoryAudioTree(String(targetResource.basePath ?? ''), { includeMetadata: false })
    if (requestId !== homeDetailRequestId) {
      return
    }

    homeDetailAudioTree.value = await decorateHomeDetailAudioTree(targetResource, Array.isArray(audioTree) ? audioTree : [])
  } finally {
    if (requestId === homeDetailRequestId) {
      homeDetailAudioTreeLoading.value = false
    }
  }
}

const applyStoredHomeDetailAudioTreeMetadata = (nodes: any[], resource: any) => {
  const subItems = isHomeVideoFolderResource(resource)
    ? getHomeDetailVideoSubItems(resource)
    : getHomeDetailAsmrSubItems(resource)
  if (!subItems.length) {
    return Array.isArray(nodes) ? nodes : []
  }

  const metadataMap = new Map(subItems.map((item) => [item.relativePath.toLowerCase(), item] as const))
  const basePath = String(resource?.basePath ?? '')
  const visit = (entries: any[]): any[] =>
    entries.map((entry) => {
      if (!entry) {
        return entry
      }

      if (Array.isArray(entry.children) && entry.children.length) {
        return {
          ...entry,
          children: visit(entry.children)
        }
      }

      if (!entry.path) {
        return {...entry}
      }

      const metadata = metadataMap.get(getRelativeVideoPath(basePath, String(entry.path)).toLowerCase())
      if (!metadata) {
        return {...entry}
      }

      return {
        ...entry,
        hasSubtitle: metadata.hasSubtitle ?? entry.hasSubtitle ?? false,
        duration: metadata.duration ?? entry.duration ?? null,
        bitrate: metadata.bitrate ?? entry.bitrate ?? null,
        sampleRate: metadata.sampleRate ?? entry.sampleRate ?? null,
        frameRate: metadata.frameRate ?? entry.frameRate ?? null,
        audioBitrate: metadata.audioBitrate ?? entry.audioBitrate ?? null,
        audioSampleRate: metadata.audioSampleRate ?? entry.audioSampleRate ?? null,
        width: metadata.width ?? entry.width ?? null,
        height: metadata.height ?? entry.height ?? null,
        __metadataResolved: true
      }
    })

  return visit(Array.isArray(nodes) ? nodes : [])
}

const reorderHomeVideoTreeBySubItems = (nodes: any[], resource: any): any[] => {
  const videoSubItems = getHomeDetailVideoSubItems(resource)
  if (!isHomeVideoFolderResource(resource) || !videoSubItems.length) {
    return Array.isArray(nodes) ? nodes : []
  }

  const basePath = String(resource?.basePath ?? '')
  const orderMap = new Map<string, number>(videoSubItems.map((item, index) => [item.relativePath.toLowerCase(), index]))
  const visibleMap = new Map<string, boolean>(videoSubItems.map((item) => [item.relativePath.toLowerCase(), item.isVisible]))
  const visibleOrderMap = new Map<string, number>(
    videoSubItems
      .filter((item) => item.isVisible !== false)
      .map((item, index) => [item.relativePath.toLowerCase(), index])
  )
  const coverPathMap = new Map(videoSubItems.map((item) => [item.relativePath.toLowerCase(), item.coverPath ?? '']))
  const metadataMap = new Map(videoSubItems.map((item) => [item.relativePath.toLowerCase(), item] as const))

  const visit = (entries: any[]): any[] =>
    entries
      .map((entry) => {
        if (!entry) {
          return null
        }

        if (entry.kind === 'video' && entry.path) {
          const relativePath = getRelativeVideoPath(basePath, String(entry.path)).toLowerCase()
          if (visibleMap.get(relativePath) === false) {
            return null
          }
          const orderIndex = visibleOrderMap.get(relativePath)
          const metadata = metadataMap.get(relativePath)

          return {
            ...entry,
            coverPath: coverPathMap.get(relativePath) ?? '',
            coverPreviewSrc: getHomeVideoSubCoverPreviewSrc(resource, relativePath),
            sortOrderLabel: orderIndex != null ? orderIndex + 1 : '',
            hasSubtitle: metadata?.hasSubtitle ?? entry.hasSubtitle ?? false,
            duration: metadata?.duration ?? entry.duration ?? null,
            bitrate: metadata?.bitrate ?? entry.bitrate ?? null,
            sampleRate: metadata?.sampleRate ?? entry.sampleRate ?? null,
            frameRate: metadata?.frameRate ?? entry.frameRate ?? null,
            audioBitrate: metadata?.audioBitrate ?? entry.audioBitrate ?? null,
            audioSampleRate: metadata?.audioSampleRate ?? entry.audioSampleRate ?? null,
            width: metadata?.width ?? entry.width ?? null,
            height: metadata?.height ?? entry.height ?? null,
            __metadataResolved: true
          }
        }

        if (Array.isArray(entry.children) && entry.children.length) {
          const nextChildren = visit(entry.children)
          if (!nextChildren.length && entry.isDirectory) {
            return null
          }

          return {
            ...entry,
            children: nextChildren
          }
        }

        return {...entry}
      })
      .filter((entry): entry is any => Boolean(entry))
      .sort((left, right) => {
        const resolveOrderIndex = (entry: any): number | null => {
          if (entry?.isDirectory) {
            const childIndexes = Array.isArray(entry.children)
              ? entry.children
                .map((child: any) => resolveOrderIndex(child))
                .filter((value: number | null): value is number => value != null)
              : []
            return childIndexes.length ? Math.min(...childIndexes) : null
          }

          if (entry?.kind === 'video' && entry?.path) {
            const relativePath = getRelativeVideoPath(basePath, String(entry.path)).toLowerCase()
            return orderMap.get(relativePath) ?? null
          }

          return null
        }

        if (Boolean(left?.isDirectory) !== Boolean(right?.isDirectory)) {
          return left?.isDirectory ? -1 : 1
        }

        const leftIndex = resolveOrderIndex(left)
        const rightIndex = resolveOrderIndex(right)
        if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
          return leftIndex - rightIndex
        }

        if (leftIndex != null || rightIndex != null) {
          return leftIndex != null ? -1 : 1
        }

        return compareByFileName(String(left?.label ?? ''), String(right?.label ?? ''))
      })

  return visit(Array.isArray(nodes) ? nodes : [])
}

const sortHomeVideoTracksBySubItems = <T extends { path: string; label?: string }>(tracks: T[], resource: any) => {
  const videoSubItems = getHomeDetailVideoSubItems(resource)
  if (!videoSubItems.length) {
    return [...tracks]
  }

  const basePath = String(resource?.basePath ?? '')
  const orderMap = new Map<string, number>(videoSubItems.map((item, index) => [item.relativePath.toLowerCase(), index]))
  const visibleMap = new Map<string, boolean>(videoSubItems.map((item) => [item.relativePath.toLowerCase(), item.isVisible]))

  return [...tracks]
    .filter((track) => {
      const relativePath = getRelativeVideoPath(basePath, track.path).toLowerCase()
      return visibleMap.get(relativePath) !== false
    })
    .sort((left, right) => {
      const leftRelativePath = getRelativeVideoPath(basePath, left.path).toLowerCase()
      const rightRelativePath = getRelativeVideoPath(basePath, right.path).toLowerCase()
      const leftIndex = orderMap.get(leftRelativePath)
      const rightIndex = orderMap.get(rightRelativePath)

      if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
        return leftIndex - rightIndex
      }

      if (leftIndex != null || rightIndex != null) {
        return leftIndex != null ? -1 : 1
      }

      const labelCompare = compareByFileName(String(left.label ?? ''), String(right.label ?? ''))
      if (labelCompare !== 0) {
        return labelCompare
      }

      return compareByFileName(leftRelativePath, rightRelativePath)
    })
}

const decorateHomeDetailAudioTree = async (resource: any, directoryTree: any[]) => {
  if (isHomeVideoFolderResource(resource)) {
    await refreshHomeVideoSubCoverPreviewUrls(resource)
  }

  return reorderHomeVideoTreeBySubItems(
    applyStoredHomeDetailAudioTreeMetadata(directoryTree, resource),
    resource
  )
}

const resolveHomeResourceAudioTree = async (resource: any) => {
  const resourceId = String(resource?.id ?? '')
  const selectedId = String(homeDetailResource.value?.id ?? '')
  if (resourceId && resourceId === selectedId && homeDetailAudioTree.value.length) {
    return homeDetailAudioTree.value
  }

  const directoryTree = await window.api.dialog.getDirectoryAudioTree(String(resource?.basePath ?? ''), {includeMetadata: false})
  return await decorateHomeDetailAudioTree(resource, directoryTree)
}

const normalizeWebsiteUrl = (value: unknown) => {
  const normalizedValue = String(value ?? '').trim()
  if (!normalizedValue) {
    return ''
  }

  return /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedValue)
    ? normalizedValue
    : `https://${normalizedValue}`
}

const getWebsiteResourceUrl = (resource: any) =>
  normalizeWebsiteUrl(resource?.websiteMeta?.url ?? resource?.meta?.website ?? resource?.website ?? '')

const formatDateTime = (value: string | number | Date | null | undefined) => {
  if (!value) {
    return '暂无'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date)
}

const formatDuration = (seconds: number | null | undefined) => {
  const totalSeconds = Math.max(0, Number(seconds ?? 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainSeconds = Math.floor(totalSeconds % 60)

  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟 ${remainSeconds}秒`
  }

  if (minutes > 0) {
    return `${minutes}分钟 ${remainSeconds}秒`
  }

  return `${remainSeconds}秒`
}

const formatAsmrDuration = (seconds: number | null | undefined) => {
  const normalizedSeconds = Number(seconds ?? 0)
  if (normalizedSeconds === -1) {
    return '计算中'
  }

  return formatDuration(normalizedSeconds)
}

const formatAudioBitrate = (bitrate: number | null | undefined) => {
  const normalized = Number(bitrate ?? 0)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '未知'
  }

  return `${Math.round(normalized / 1000)} kbps`
}

const formatAudioSampleRate = (sampleRate: number | null | undefined) => {
  const normalized = Number(sampleRate ?? 0)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '未知'
  }

  return `${normalized} Hz`
}

const formatFrameRate = (frameRate: number | null | undefined) => {
  const normalized = Number(frameRate ?? 0)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '未知'
  }

  return `${normalized.toFixed(normalized >= 10 ? 0 : 2)} fps`
}

const formatImageResolution = (width: number | null | undefined, height: number | null | undefined) => {
  const normalizedWidth = Number(width ?? 0)
  const normalizedHeight = Number(height ?? 0)
  if (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0 || !Number.isFinite(normalizedHeight) || normalizedHeight <= 0) {
    return '未知'
  }

  return `${normalizedWidth} × ${normalizedHeight}`
}

const isUnknownEndTime = (value: string | number | Date | null | undefined) => {
  if (!value) {
    return false
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime())
}

const formatLogEndTime = (value: string | number | Date | null | undefined) => {
  if (isUnknownEndTime(value)) {
    return '未检测到结束时间'
  }

  return formatDateTime(value)
}

const formatLogDuration = (logItem: { endTime?: string | number | Date | null; duration?: number | null }) => {
  if (isUnknownEndTime(logItem?.endTime)) {
    return '未知'
  }

  return formatDuration(logItem?.duration)
}

const formatLaunchMode = (launchMode: string | null | undefined, usePlayTerms = false) => {
  switch (String(launchMode ?? '').trim()) {
    case ResourceLaunchMode.ADMIN:
      return '管理员启动'
    case ResourceLaunchMode.MTOOL:
      return 'MTool 启动'
    case ResourceLaunchMode.LOCALE_EMULATOR:
      return 'LE 转区启动'
    case ResourceLaunchMode.NORMAL:
      return usePlayTerms ? '普通播放' : '普通启动'
    default:
      return String(launchMode ?? (usePlayTerms ? '普通播放' : '普通启动'))
  }
}

const getRatingComment = (rating: number | null | undefined) => {
  const normalizedRating = Number(rating ?? 0)

  if (normalizedRating < 0) return ''
  if (normalizedRating >= 4.6) return '夯爆了'
  if (normalizedRating >= 4.1) return '夯'
  if (normalizedRating >= 3.1) return '顶级'
  if (normalizedRating >= 2.1) return '人上人'
  if (normalizedRating >= 1.1) return 'NPC'
  return '路边'
}

const getRatingEmoji = (rating: number | null | undefined) => {
  const normalizedRating = Number(rating ?? 0)

  if (normalizedRating >= 4.9) return '🔥🔥'
  if (normalizedRating >= 4.5) return '🔥'
  if (normalizedRating > 4) return '👑'
  if (normalizedRating > 3) return '😎'
  if (normalizedRating > 2) return '🙂'
  if (normalizedRating >= 1.1) return '😮‍💨'
  return '🫥'
}

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

const homeDetailCategoryName = computed(() =>
  String(homeDetailCategory.value?.name ?? homeDetailResource.value?.categoryName ?? '').trim() || '资源'
)
const homeEditCategoryName = computed(() =>
  String(homeEditCategory.value?.name ?? homeDetailResource.value?.categoryName ?? '').trim() || '资源'
)
const homeDetailCategorySettings = computed(() => {
  const category = homeDetailCategory.value ?? {}
  return resolveDashboardCategorySettings(category)
})
const homeEditCategorySettings = computed(() => {
  const category = homeEditCategory.value ?? {}
  return resolveDashboardCategorySettings(category)
})
const homeDetailCategoryProfile = computed(() => resolveCategoryProfile(homeDetailCategorySettings.value))
const homeEditCategoryProfile = computed(() => resolveCategoryProfile(homeEditCategorySettings.value))
const homeDetailActorFilterLabel = computed(() => homeDetailCategoryProfile.value.flags.isAsmr ? '声优' : '声优/演员')
const homeEditActorFilterLabel = computed(() => homeEditCategoryProfile.value.flags.isAsmr ? '声优' : '声优/演员')
const homeDetailIsWebsite = computed(() => homeDetailCategoryProfile.value.flags.isWebsite)
const homeDetailIsSoftware = computed(() => homeDetailCategoryProfile.value.flags.isSoftware)
const homeDetailIsManga = computed(() => homeDetailCategoryProfile.value.flags.isManga)
const homeDetailIsAsmr = computed(() => homeDetailCategoryProfile.value.flags.isAsmr)
const homeDetailIsAudio = computed(() => homeDetailCategoryProfile.value.flags.isAudio)
const homeDetailIsNovel = computed(() => homeDetailCategoryProfile.value.flags.isNovel)
const homeEditIsSoftware = computed(() => homeEditCategoryProfile.value.flags.isSoftware)
const homeEditIsAsmr = computed(() => homeEditCategoryProfile.value.flags.isAsmr)
const homeEditIsAudio = computed(() => homeEditCategoryProfile.value.flags.isAudio)
const homeEditIsNovel = computed(() => homeEditCategoryProfile.value.flags.isNovel)
const homeEditIsVideoFolderCategory = computed(() => homeEditCategoryProfile.value.flags.isVideoFolder)
const homeDetailIsVideoCategory = computed(() => homeDetailCategoryProfile.value.flags.isVideo)
const homeDetailIsVideoFolderCategory = computed(() => homeDetailCategoryProfile.value.flags.isVideoFolder)
const homeDetailStartText = computed(() => homeDetailCategoryProfile.value.labels.startText)
const homeDetailDetailStats = computed(() => homeDetailResource.value?.stats ?? null)
const homeDetailDetailLogs = computed(() =>
  Array.isArray(homeDetailResource.value?.logs)
    ? homeDetailResource.value.logs
    : []
)
const homeDetailVisibleDetailLogs = computed(() =>
  homeDetailDetailLogs.value.slice(0, homeDetailVisibleLogCount.value)
)
const homeDetailHasMoreDetailLogs = computed(() => homeDetailVisibleLogCount.value < homeDetailDetailLogs.value.length)
const homeDetailNoMore = computed(() => homeDetailDetailLogs.value.length > 5 && !homeDetailHasMoreDetailLogs.value)
const homeDetailRatingComment = computed(() => getRatingComment(homeDetailRatingDraft.value))
const homeDetailHasPendingRatingChange = computed(() => {
  if (!homeDetailResource.value) {
    return false
  }

  return Number(homeDetailResource.value.rating ?? -1) !== Number(homeDetailRatingDraft.value)
})
const homeDetailDetailDisplayPath = computed(() => buildDisplayDirectoryPath(homeDetailResource.value))
const homeDetailWebsiteUrl = computed(() => getWebsiteResourceUrl(homeDetailResource.value))
const homeDetailWebsiteIsDownloadLink = computed(() => Boolean(
  homeDetailResource.value?.websiteMeta?.isDownloadLink
  ?? homeDetailResource.value?.meta?.isDownloadLink
))
const homeDetailWebsiteAddressLabel = computed(() => homeDetailWebsiteIsDownloadLink.value ? '下载地址' : '网站地址')
const homeDetailWebsiteIconLabel = computed(() => homeDetailWebsiteIsDownloadLink.value ? '链接图标' : '站点图标')
const homeDetailWebsitePlaceholderEmoji = computed(() =>
  getWebsitePlaceholderEmoji(
    homeDetailResource.value?.id,
    homeDetailWebsiteUrl.value,
    homeDetailWebsiteIsDownloadLink.value
  )
)
const homeDetailWebsiteCoverPlaceholderText = computed(() => homeDetailWebsiteIsDownloadLink.value ? '下载链接' : '网站封面')
const homeDetailOpenFolderText = computed(() =>
  homeDetailIsWebsite.value ? `打开${homeDetailCategoryName.value}` : `打开${homeDetailCategoryName.value}文件夹`
)
const homeEditModelComponent = computed(() => resolveMetaFormComponent(String(homeEditCategorySettings.value.extendTable ?? '')))
const homeEditModelComponentKey = computed(() => String(homeEditCategorySettings.value.extendTable ?? '').trim() || 'empty-meta')
const homeEditDescriptionLabel = computed(() =>
  homeEditCategoryProfile.value.flags.isGame ? '游戏简介' : `${homeEditCategoryName.value}描述`
)
const homeEditDescriptionPlaceholder = computed(() =>
  homeEditCategoryProfile.value.flags.isGame ? '请输入游戏简介' : `请输入${homeEditCategoryName.value}描述`
)
const homeEditAuthorInputPlaceholder = computed(() =>
  homeEditIsAudio.value
    ? '可输入多个艺术家，按回车创建标签'
    : `请输入${String(homeEditCategorySettings.value.authorText ?? '作者')}`
)
const homeEditHasBasePath = computed(() => Boolean(String(homeEditFormData.value?.basePath ?? '').trim()))
const homeEditHasCoverPath = computed(() => Boolean(String(homeEditFormData.value?.coverPath ?? '').trim()))
const homeEditNormalizedAllowedExtensions = computed(() =>
  (homeEditCategorySettings.value.extensions ?? [])
    .map((extension: string) => String(extension ?? '').trim().toLowerCase())
    .filter(Boolean)
    .map((extension: string) => (extension.startsWith('.') ? extension : `.${extension}`))
)
const homeEditSoftwareScriptShellType = computed<'powershell' | 'cmd'>(() =>
  homeEditSoftwareScriptRuntimes.value.find((item) => item.value === homeEditSoftwareScriptRuntimePath.value)?.shellType ?? 'powershell'
)
const homeEditSoftwareScriptPlaceholder = computed(() =>
  homeEditSoftwareScriptShellType.value === 'powershell'
    ? '例如：\nSet-Location d:/myDir\n. .\\venv\\Scripts\\Activate.ps1\npy -3.10 run.py'
    : '例如：\ncd /d d:/myDir\ncall .\\venv\\Scripts\\activate\npy -3.10 run.py'
)
const homeDetailWebsiteFaviconPath = computed(() =>
  String(homeDetailResource.value?.websiteMeta?.favicon ?? homeDetailResource.value?.meta?.icon ?? '').trim()
)
const homeDetailCurrentScreenshotPath = computed(() =>
  homeDetailScreenshotPaths.value[homeDetailCurrentScreenshotIndex.value] ?? ''
)
const homeDetailCanLaunch = computed(() => {
  const resource = homeDetailResource.value
  if (homeDetailCategoryProfile.value.flags.isWebsite) {
    return Boolean(homeDetailWebsiteUrl.value)
  }

  return Boolean(resource?.basePath) && !resource?.missingStatus && !resource?.isRunning
})
const homeDetailCanStop = computed(() => Boolean(homeDetailResource.value?.isRunning))
const homeDetailCategoryDescriptionBoxStyle = computed(() => ({ height: 'auto' }))
const homeDetailStores = computed(() =>
  Array.isArray(homeDetailResource.value?.stores)
    ? homeDetailResource.value.stores
      .filter((item: any) => !item?.isDeleted && item?.store)
      .map((item: any) => ({
        id: String(item?.id ?? `${item?.storeId}-${item?.workId}`),
        name: String(item?.store?.name ?? ''),
        icon: resolveHomeStoreIcon(String(item?.store?.extra?.icon ?? '')),
        url: String(item?.url ?? '')
      }))
      .filter((item: any) => item.name)
    : []
)
const homeDetailNormalizedEngineList = computed(() =>
  homeDetailEngineList.value
    .map((item: any) => ({
      id: String(item?.id ?? item?.value ?? '').trim(),
      name: String(item?.name ?? item?.label ?? '').trim(),
      icon: ''
    }))
    .filter((item: any) => item.id && item.name)
)
const homeDetailNormalizedEngineOptionList = computed(() =>
  homeDetailEngineOptionList.value
    .map((option: any) => ({
      id: String(option?.value ?? '').trim(),
      name: String(option?.label ?? '').trim(),
      icon: resolveHomeEngineIcon(String(option?.extra?.icon ?? ''))
    }))
    .filter((item: any) => item.id && item.name)
)
const homeDetailNormalizedLanguageList = computed(() =>
  homeDetailLanguageOptions.value
    .map((item: any) => ({
      id: String(item?.value ?? item?.id ?? '').trim(),
      name: String(item?.label ?? item?.name ?? '').trim()
    }))
    .filter((item: any) => item.id && item.name)
)

const { formatVideoFrameTime } = useCategoryDetailFormatters()

const {
  coverPreviewSrc: homeEditCoverPreviewSrc,
  detailCoverPreviewSrc: homeDetailCoverPreviewSrc,
  detailScreenshotPreviewSrc: homeDetailScreenshotPreviewSrc,
  detailWebsiteFaviconSrc: homeDetailWebsiteFaviconSrc,
  detailGalleryImageUrls: homeDetailGalleryImageUrls,
  resolveCoverPreviewUrl: resolveHomeEditCoverPreviewUrl,
  resolveVideoSubCoverPreviewUrl,
  resolveAudioPlayerCoverPreviewUrl
} = useCategoryPreviewAssets({
  formCoverPath: computed(() => String(homeEditFormData.value?.coverPath ?? '').trim()),
  detailCoverPath: computed(() => String(homeDetailResource.value?.coverPath ?? '').trim()),
  currentScreenshotPath: homeDetailCurrentScreenshotPath,
  detailIsWebsite: homeDetailIsWebsite,
  detailWebsiteFaviconPath: homeDetailWebsiteFaviconPath,
  detailScreenshotPaths: homeDetailScreenshotPaths
})

const {
  detailStatsText: homeDetailStatsText,
  detailShowTotalRuntime: homeDetailShowTotalRuntime,
  detailShowLogs: homeDetailShowLogs,
  detailPreviewSectionTitle: homeDetailPreviewSectionTitle,
  detailGallerySectionTitle: homeDetailGallerySectionTitle,
  detailDirectorySectionTitle: homeDetailDirectorySectionTitle,
  detailDirectoryEmptyText: homeDetailDirectoryEmptyText,
  detailEmptyLogDescription: homeDetailEmptyLogDescription,
  detailLogModeLabel: homeDetailLogModeLabel,
  detailLogDurationLabel: homeDetailLogDurationLabel,
  hasDetailDescription: homeDetailHasDetailDescription,
  detailReadingProgressText: homeDetailReadingProgressText,
  detailPlaybackProgressText: homeDetailPlaybackProgressText,
  detailGalleryItems: homeDetailGalleryItems,
  detailMetaItems: homeDetailMetaItems
} = useCategoryDetailPresentation({
  selectedDetailResource: homeDetailResource,
  categoryName: homeDetailCategoryName,
  categorySettings: homeDetailCategorySettings,
  categoryProfile: homeDetailCategoryProfile,
  actorFilterLabel: homeDetailActorFilterLabel,
  detailIsManga: homeDetailIsManga,
  detailIsAsmr: homeDetailIsAsmr,
  detailIsAudio: homeDetailIsAudio,
  detailIsNovel: homeDetailIsNovel,
  detailIsWebsite: homeDetailIsWebsite,
  isVideoCategory: homeDetailIsVideoCategory,
  detailScreenshotPaths: homeDetailScreenshotPaths,
  detailGalleryImageUrls: homeDetailGalleryImageUrls,
  detailWebsiteAddressLabel: homeDetailWebsiteAddressLabel,
  detailWebsiteIconLabel: homeDetailWebsiteIconLabel,
  detailWebsiteIsDownloadLink: homeDetailWebsiteIsDownloadLink,
  detailWebsitePlaceholderEmoji: homeDetailWebsitePlaceholderEmoji,
  detailWebsiteFaviconSrc: homeDetailWebsiteFaviconSrc,
  detailWebsiteUrl: homeDetailWebsiteUrl,
  normalizedEngineList: homeDetailNormalizedEngineList,
  normalizedEngineOptionList: homeDetailNormalizedEngineOptionList,
  normalizedLanguageList: homeDetailNormalizedLanguageList,
  normalizeWebsiteIconSource,
  formatDuration,
  formatAsmrDuration,
  formatAudioBitrate,
  formatAudioSampleRate,
  buildDisplayBasePath
})

const renderHomeAudioTreeFileLabel = (option: any, icon: string, label: string) => h('div', {
  class: 'detail-audio-tree__file',
  onContextmenu: (event: MouseEvent) => handleHomeOpenAudioTreeContextMenu(event, option)
}, [
  option?.kind === 'video'
    ? h('div', {
      class: 'detail-audio-tree__video-cover-shell'
    }, [
      option?.coverPreviewSrc
        ? h('img', {
          src: String(option.coverPreviewSrc),
          alt: '',
          class: 'detail-audio-tree__video-cover'
        })
        : h('div', {
          class: 'detail-audio-tree__video-cover detail-audio-tree__video-cover--empty'
        }),
      h('span', {
        class: 'detail-audio-tree__video-cover-index'
      }, String(option?.sortOrderLabel ?? ''))
    ])
    : null,
  h('div', {
    class: 'detail-audio-tree__file-title'
  }, [
    h('span', null, `${icon} ${label}`),
    option?.hasSubtitle
      ? h('span', {
        class: 'detail-audio-tree__subtitle-badge',
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
          padding: '0 6px',
          borderRadius: '999px',
          background: 'rgba(99, 226, 183, 0.16)',
          color: 'rgb(125, 232, 196)',
          fontSize: '11px',
          lineHeight: '18px',
          whiteSpace: 'nowrap'
        }
      }, '字幕')
      : null
  ])
])

const renderHomeAudioTreeLabel = ({option}: { option: any }) => {
  if (option?.isDirectory) {
    return h('span', {class: 'detail-audio-tree__label'}, `📁 ${option.label}`)
  }

  if (option?.kind === 'image') {
    return renderHomeAudioTreeFileLabel(option, '🖼', String(option?.label ?? ''))
  }

  if (option?.kind === 'video') {
    return renderHomeAudioTreeFileLabel(option, '🎬', String(option?.label ?? ''))
  }

  return renderHomeAudioTreeFileLabel(option, '🎵', String(option?.label ?? ''))
}

const renderHomeAudioTreeSuffix = ({option}: { option: any }) => {
  if (option?.isDirectory) {
    return null
  }

  if (option?.kind === 'image') {
    return h('span', {
      class: 'detail-audio-tree__action-button detail-audio-tree__action-button--play',
      role: 'button',
      tabindex: 0,
      'aria-label': '查看图片',
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        void handleHomeOpenAudioTreeImage(String(option?.path ?? ''))
      },
      onContextmenu: (event: MouseEvent) => handleHomeOpenAudioTreeContextMenu(event, option),
      onKeydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        void handleHomeOpenAudioTreeImage(String(option?.path ?? ''))
      }
    }, '▶')
  }

  return h('span', {
    class: 'detail-audio-tree__action-button detail-audio-tree__action-button--play',
    role: 'button',
    tabindex: 0,
    'aria-label': option?.kind === 'video' ? '播放视频' : '播放音频',
    onClick: (event: MouseEvent) => {
      event.stopPropagation()
      handleHomeAudioTreePlay(option)
    },
    onContextmenu: (event: MouseEvent) => handleHomeOpenAudioTreeContextMenu(event, option),
    onKeydown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      handleHomeAudioTreePlay(option)
    }
  }, '▶')
}

watch(
  () => homeDetailResource.value?.rating,
  (rating) => {
    homeDetailRatingDraft.value = Number(rating ?? -1)
  },
  { immediate: true }
)

const loadHomeDetailCategoryAssets = async (categoryId: string) => {
  const normalizedCategoryId = String(categoryId ?? '').trim()
  if (!normalizedCategoryId) {
    homeDetailEngineList.value = []
    homeDetailEngineOptionList.value = []
    homeDetailLanguageOptions.value = []
    return
  }

  const [engineList, engineOptions, languageOptions] = await Promise.all([
    window.api.db.getEngineByCategoryId(normalizedCategoryId),
    window.api.db.getSelectDictData(DictType.GAME_ENGINE_TYPE),
    window.api.db.getSelectDictData(DictType.LANGUAGE_TYPE)
  ])

  homeDetailEngineList.value = Array.isArray(engineList) ? engineList : []
  homeDetailEngineOptionList.value = Array.isArray(engineOptions) ? engineOptions : []
  homeDetailLanguageOptions.value = Array.isArray(languageOptions) ? languageOptions : []
}

const openHomeDetailDrawer = async (item: { id?: string; categoryId?: string } | null) => {
  const resourceId = String(item?.id ?? '').trim()
  const categoryId = String(item?.categoryId ?? '').trim()
  if (!resourceId) {
    return
  }

  const requestId = ++homeDetailRequestId
  homeDetailVisibleLogCount.value = 5
  homeDetailCurrentScreenshotIndex.value = 0
  showHomeDeleteScreenshotConfirm.value = false
  homeDetailScreenshotPaths.value = []
  homeDetailAudioTree.value = []
  homeDetailAudioTreeLoading.value = false
  homeDetailAudioContextMenuVisible.value = false
  homeDetailAudioContextMenuTarget.value = null

  try {
    const [detailResult, categoryResult] = await Promise.all([
      window.api.service.getResourceDetail(resourceId),
      categoryId
        ? window.api.db.getCategoryById(categoryId)
        : Promise.resolve(categoryMap.value[categoryId] ?? null)
    ])

    if (requestId !== homeDetailRequestId) {
      return
    }

    const resource = detailResult?.data ?? detailResult
    if (!resource) {
      notify('error', '资源详情', '未能读取资源详情')
      return
    }

    const resolvedCategorySource = await ensureDashboardCategorySource(
      String(resource?.categoryId ?? categoryId),
      categoryResult ?? categoryMap.value[categoryId] ?? resource?.category ?? null
    )
    if (requestId !== homeDetailRequestId) {
      return
    }

    homeDetailResource.value = resource
    homeDetailCategory.value = resolvedCategorySource
    showHomeDetailDrawer.value = true

    await loadHomeDetailCategoryAssets(String(resource?.categoryId ?? categoryId))
    if (requestId !== homeDetailRequestId) {
      return
    }

    if (homeDetailIsManga.value && String(resource?.basePath ?? '').trim()) {
      const imagePaths = await window.api.dialog.getDirectoryImages(String(resource.basePath))
      if (requestId !== homeDetailRequestId) {
        return
      }

      if (Array.isArray(imagePaths) && imagePaths.length) {
        homeDetailScreenshotPaths.value = imagePaths
      } else if (String(resource?.id ?? '').trim()) {
        const screenshotPaths = await window.api.dialog.getScreenshotImages(String(resource.id))
        if (requestId !== homeDetailRequestId) {
          return
        }

        homeDetailScreenshotPaths.value = Array.isArray(screenshotPaths) ? screenshotPaths : []
      } else {
        homeDetailScreenshotPaths.value = []
      }
    } else if (String(resource?.id ?? '').trim()) {
      const screenshotPaths = await window.api.dialog.getScreenshotImages(String(resource.id))
      if (requestId !== homeDetailRequestId) {
        return
      }

      homeDetailScreenshotPaths.value = Array.isArray(screenshotPaths) ? screenshotPaths : []
    }

    if (
      (homeDetailIsAsmr.value || homeDetailIsVideoFolderCategory.value)
      && String(resource?.basePath ?? '').trim()
    ) {
      homeDetailAudioTreeLoading.value = true
      try {
        const audioTree = await window.api.dialog.getDirectoryAudioTree(String(resource.basePath), { includeMetadata: false })
        if (requestId !== homeDetailRequestId) {
          return
        }

        homeDetailAudioTree.value = await decorateHomeDetailAudioTree(resource, Array.isArray(audioTree) ? audioTree : [])
      } finally {
        if (requestId === homeDetailRequestId) {
          homeDetailAudioTreeLoading.value = false
        }
      }
    }
  } catch (error) {
    notify('error', '资源详情', error instanceof Error ? error.message : '读取资源详情失败')
  }
}

const handleHomeDetailLaunchAction = async () => {
  const resource = homeDetailResource.value
  if (!resource) {
    return
  }

  await openHomeResourceByCategoryProfile(resource, homeDetailCategoryProfile.value)
}

const openHomeResourceByCategoryProfile = async (
  resource: any,
  categoryProfile: ReturnType<typeof resolveCategoryProfile>
) => {
  const fileExtension = getFileExtension(getResourceFilePath(resource))
  const shouldUseVideoFolderMode = isHomeVideoFolderResource(resource)
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

  const websiteUrl = getWebsiteResourceUrl(resource)
  if (Boolean(resource?.websiteMeta)) {
    if (!websiteUrl) {
      showNotifyByType('warning', '打开网站', '当前资源未填写网站地址')
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

const handleHomeDetailEditResource = (resource: any) => {
  void (async () => {
    if (!resource) {
      return
    }

    const context = await resolveHomeResourceContext(String(resource?.id ?? ''), String(resource?.categoryId ?? ''))
    if (!context?.resource) {
      showNotifyByType('warning', '修改信息', '未能读取可编辑的资源详情')
      return
    }

    const normalizedCategoryId = String(context.resource?.categoryId ?? resource?.categoryId ?? '').trim()
    if (normalizedCategoryId) {
      await loadHomeDetailCategoryAssets(normalizedCategoryId)
      await loadHomeEditFormOptions(normalizedCategoryId)
    } else {
      homeEditAuthorSelectOptions.value = []
      homeEditTagSelectOptions.value = []
      homeEditTypeSelectOptions.value = []
    }

    const resolvedHomeEditCategory = await ensureDashboardCategorySource(
      normalizedCategoryId,
      context.categorySource ?? context.categoryInfo
    )
    homeEditCategory.value = resolvedHomeEditCategory ?? context.categoryInfo
    const nextFormData = mapHomeDetailToEditFormData(context.resource)
    homeEditingResourceId.value = String(context.resource?.id ?? '')
    homeEditFormData.value = cloneHomeEditFormData(nextFormData)
    homeEditInitialFormData.value = cloneHomeEditFormData(nextFormData)
    showHomeDetailDrawer.value = false
    showHomeEditResourceDrawer.value = true
  })()
}

const handleHomeDetailOpenVideoOrderDialog = (resource: any) => {
  if (!resource) {
    return
  }

  openHomeVideoOrderDialog(resource)
}

const handleHomeDetailOpenCategory = (resource: any) => {
  const categoryId = String(resource?.categoryId ?? '').trim()
  if (!categoryId) {
    return
  }

  showHomeDetailDrawer.value = false
  router.push({
    name: 'category',
    params: {
      id: categoryId
    }
  })
}

const handleHomeDetailOpenResourcePath = async () => {
  const resource = homeDetailResource.value
  if (!resource) {
    return
  }

  if (homeDetailIsWebsite.value) {
    const websiteUrl = homeDetailWebsiteUrl.value
    if (websiteUrl) {
      await window.api.dialog.openExternalUrl(websiteUrl)
    }
    return
  }

  await window.api.dialog.openPath(String(resource?.basePath ?? ''))
}

const handleHomeDetailOpenStoreWebsite = async (url: string) => {
  const normalizedUrl = String(url ?? '').trim()
  if (!normalizedUrl) {
    return
  }

  await window.api.dialog.openExternalUrl(normalizedUrl)
}

const handleHomeDetailCopyText = async (text: string) => {
  await window.api.dialog.copyTextToClipboard(text)
}

const handleHomeDetailOpenPictureViewer = async (target?: number | string) => {
  const imagePaths = homeDetailScreenshotPaths.value
  const currentPath = typeof target === 'string'
    ? target
    : typeof target === 'number'
      ? homeDetailGalleryItems.value[target]?.filePath ?? ''
      : imagePaths[homeDetailCurrentScreenshotIndex.value] ?? ''
  if (!currentPath) {
    return
  }

  const initialIndex = imagePaths.findIndex((item) => normalizePathValue(item) === normalizePathValue(currentPath))
  homePictureViewerImagePaths.value = imagePaths.length ? imagePaths : [currentPath]
  homePictureViewerResourceIds.value = homePictureViewerImagePaths.value.map(() => String(homeDetailResource.value?.id ?? ''))
  homePictureViewerInitialIndex.value = initialIndex >= 0 ? initialIndex : 0
  homeCurrentPictureViewerResourceId.value = String(homeDetailResource.value?.id ?? '')
  showHomePictureViewer.value = true
}

const handleHomeDetailPreviousScreenshot = () => {
  if (!homeDetailScreenshotPaths.value.length) {
    return
  }

  homeDetailCurrentScreenshotIndex.value = homeDetailCurrentScreenshotIndex.value === 0
    ? homeDetailScreenshotPaths.value.length - 1
    : homeDetailCurrentScreenshotIndex.value - 1
}

const handleHomeDetailNextScreenshot = () => {
  if (!homeDetailScreenshotPaths.value.length) {
    return
  }

  homeDetailCurrentScreenshotIndex.value = homeDetailCurrentScreenshotIndex.value === homeDetailScreenshotPaths.value.length - 1
    ? 0
    : homeDetailCurrentScreenshotIndex.value + 1
}

const handleHomeDetailDeleteCurrentScreenshot = () => {
  notify('info', '首页详情', '首页预览暂不支持删除截图，请进入分类详情操作')
}

const handleHomeDetailOpenScreenshotFolder = async () => {
  if (!homeDetailResource.value?.id) {
    return
  }

  await window.api.dialog.openScreenshotFolder(String(homeDetailResource.value.id))
}

const handleHomeDetailLoadMoreLogs = () => {
  if (!homeDetailHasMoreDetailLogs.value) {
    return
  }

  homeDetailVisibleLogCount.value = Math.min(homeDetailDetailLogs.value.length, homeDetailVisibleLogCount.value + 5)
}

const handleHomeDetailRatingUpdate = (value: number) => {
  homeDetailRatingDraft.value = Number.isFinite(Number(value)) ? Number(value) : 0
}

const handleHomeDetailSubmitRating = async () => {
  if (!homeDetailResource.value || !homeDetailHasPendingRatingChange.value) {
    return
  }

  try {
    const result = await window.api.service.updateResourceRating(
      String(homeDetailResource.value.id ?? ''),
      Number(homeDetailRatingDraft.value)
    )
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '评分更新完成'
    notify(resultType, '更新评分', resultMessage)

    if (resultType === 'error') {
      return
    }

    homeDetailResource.value = {
      ...homeDetailResource.value,
      rating: Number(homeDetailRatingDraft.value)
    }
    nextPlayPool.value = nextPlayPool.value.map((item) =>
      item.id === homeDetailResource.value?.id
        ? { ...item, rating: Number(homeDetailRatingDraft.value) }
        : item
    )
    nextPlayVisible.value = nextPlayVisible.value.map((item) =>
      item.id === homeDetailResource.value?.id
        ? { ...item, rating: Number(homeDetailRatingDraft.value) }
        : item
    )
  } catch (error) {
    notify('error', '更新评分', error instanceof Error ? error.message : '更新评分失败')
  }
}

const formatNumber = (value: number) => new Intl.NumberFormat('zh-CN').format(Math.max(0, Math.floor(Number(value) || 0)))

const formatRuntime = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
  }

  return `${minutes} 分钟`
}

const stats = computed(() => {
  if (dashboardStatsLoading.value) {
    return [
      { label: '总资源', value: '读取中' },
      { label: '收藏 / 已完成', value: '读取中' },
      { label: '资源健康', value: '读取中' },
      { label: '最近活动', value: '读取中' }
    ]
  }

  return [
    { label: '总资源', value: formatNumber(dashboardStats.value.totalResources) },
    {
      label: '收藏 / 已完成',
      value: `${formatNumber(dashboardStats.value.favoriteResources)} / ${formatNumber(dashboardStats.value.completedResources)}`
    },
    {
      label: '资源健康',
      value: `${formatNumber(dashboardStats.value.missingResources)} 个失效 / ${formatNumber(dashboardStats.value.missingCovers)} 无封面`
    },
    {
      label: '最近活动',
      value: `${formatNumber(dashboardStats.value.recentLaunchCount)} 次启动 / ${formatRuntime(dashboardStats.value.recentRuntimeSeconds)}`
    }
  ]
})

const loadDashboardStats = async () => {
  dashboardStatsLoading.value = true
  try {
    await measureDashboardTask('loadDashboardStats', async () => {
      const data = await window.api.db.getDashboardStats()
      dashboardStats.value = {
        totalResources: Number(data?.totalResources ?? 0),
        favoriteResources: Number(data?.favoriteResources ?? 0),
        completedResources: Number(data?.completedResources ?? 0),
        missingResources: Number(data?.missingResources ?? 0),
        missingCovers: Number(data?.missingCovers ?? 0),
        longUnvisitedResources: Number(data?.longUnvisitedResources ?? 0),
        recentLaunchCount: Number(data?.recentLaunchCount ?? 0),
        recentRuntimeSeconds: Number(data?.recentRuntimeSeconds ?? 0)
      }
    })
  } finally {
    dashboardStatsLoading.value = false
  }
}

const activityHeatmapByDate = computed(() => {
  return new Map(activityHeatmap.value.map((item) => [item.date, item]))
})

const getDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const parseDateKeyToTimestamp = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map((item) => Number(item))
  return new Date(year, month - 1, day).getTime()
}

const updateHeatmapSizing = () => {
  const width = heatmapFrameRef.value?.clientWidth ?? 0
  if (!width) {
    return
  }

  const weekLabelWidth = 28
  const columns = Math.max(5, Math.ceil(heatmapRangeDays.value / 7))
  const gaps = columns - 1
  const gapRatio = 0.48
  const nextRectSize = Math.max(
    8,
    Math.min(16, Math.floor((width - weekLabelWidth) / (columns + gaps * gapRatio)))
  )

  heatmapRectSize.value = nextRectSize
  heatmapGapSize.value = Math.max(3, Math.min(8, Math.round(nextRectSize * gapRatio)))
}

const loadActivityHeatmap = async () => {
  activityHeatmapLoading.value = true
  try {
    await measureDashboardTask('loadActivityHeatmap', async () => {
      const response = await window.api.db.getActivityHeatmap(heatmapRangeDays.value)
      const rows = Array.isArray(response?.days) ? response.days : []
      activityHeatmap.value = rows.map((item: any) => ({
        date: String(item?.date ?? ''),
        launchCount: Number(item?.launchCount ?? 0),
        totalRuntime: Number(item?.totalRuntime ?? 0)
      })).filter((item) => item.date && Number.isFinite(parseDateKeyToTimestamp(item.date)))
      activityHeatmapSummary.value = {
        mostActiveHour: String(response?.summary?.mostActiveHour ?? '暂无'),
        mostActiveWeekday: String(response?.summary?.mostActiveWeekday ?? '暂无'),
        mostUsedCategory: String(response?.summary?.mostUsedCategory ?? '暂无')
      }
    }, {
      rangeDays: Number(heatmapRangeDays.value)
    })
  } finally {
    activityHeatmapLoading.value = false
  }
}

const loadAnalysisCharts = async () => {
  analysisChartLoading.value = true
  try {
    await measureDashboardTask('loadAnalysisCharts', async () => {
      const [longUnvisitedBuckets, addedTrend, usageDistribution] = await Promise.all([
        window.api.db.getDashboardLongUnvisitedBuckets(),
        window.api.db.getDashboardAddedTrend(14),
        window.api.db.getDashboardUsageDistribution(30)
      ])

      dashboardLongUnvisitedBuckets.value = Array.isArray(longUnvisitedBuckets)
        ? longUnvisitedBuckets.map((item: any) => ({
          label: String(item?.label ?? '').trim(),
          value: Number(item?.value ?? 0)
        }))
        : []

      dashboardAddedTrend.value = Array.isArray(addedTrend)
        ? addedTrend.map((item: any) => ({
          date: String(item?.date ?? '').trim(),
          count: Number(item?.count ?? 0)
        }))
        : []

      usageInsightItems.value = Array.isArray(usageDistribution)
        ? usageDistribution
          .map((item: any) => {
            const label = String(item?.categoryName ?? '').trim() || '未分类'
            const categoryEmoji = String(item?.categoryEmoji ?? '').trim()
            const rawColor = String(item?.categoryPillColor ?? '').trim()
            return {
              label,
              categoryEmoji,
              count: Number(item?.launchCount ?? 0),
              color: isValidCssColor(rawColor) ? rawColor : defaultCategoryPillColor
            }
          })
          .filter((item) => item.count > 0)
        : []
    })
  } finally {
    analysisChartLoading.value = false
  }
}

const heatmapWeekLaunchCount = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - 6)
  const startKey = getDateKey(startDate)

  return activityHeatmap.value
    .filter((item) => item.date >= startKey)
    .reduce((total, item) => total + item.launchCount, 0)
})

const heatmapActiveStreak = computed(() => {
  let streak = 0

  for (let offset = 0; offset < heatmapRangeDays.value; offset += 1) {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - offset)
    const day = activityHeatmapByDate.value.get(getDateKey(date))

    if ((day?.launchCount ?? 0) > 0) {
      streak += 1
      continue
    }

    break
  }

  return streak
})

const heatmapPeakDayLabel = computed(() => {
  const peakDay = [...activityHeatmap.value]
    .sort((left, right) => right.launchCount - left.launchCount || left.date.localeCompare(right.date))[0]

  if (!peakDay || peakDay.launchCount <= 0) {
    return '暂无'
  }

  const date = new Date(parseDateKeyToTimestamp(peakDay.date))
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
})
const heatmapSubtitle = computed(() => (
  heatmapRangeDays.value === 365
    ? '最近一年资源活跃分布'
    : heatmapRangeDays.value === 84
    ? '最近 12 周资源活跃分布'
    : '最近 30 天资源活跃分布'
))

watch(heatmapRangeDays, () => {
  void loadActivityHeatmap()
  void nextTick(() => {
    requestAnimationFrame(() => {
      updateHeatmapSizing()
    })
  })
})

const continueLogsHasMore = computed(() => continueCards.value.length < continueLogsTotal.value)

const formatLogTime = (value: unknown) => {
  const date = normalizeDateValue(value)
  if (!date) {
    return '最近启动'
  }

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) {
    return '刚刚'
  }

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays <= 1) {
    return '昨天'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

const getUseText = (categoryName: string) => {
  const normalizedName = categoryName.trim().toLowerCase()

  if (['游戏', 'game', 'galgame'].some((keyword) => normalizedName.includes(keyword))) {
    return '游玩'
  }

  if (['网站', '网址', 'website', 'web'].some((keyword) => normalizedName.includes(keyword))) {
    return '访问'
  }

  if (['图片', '画集', 'image'].some((keyword) => normalizedName.includes(keyword))) {
    return '查看'
  }

  if (['漫画', 'comic', 'manga', '小说', '书', 'novel', 'book'].some((keyword) => normalizedName.includes(keyword))) {
    return '阅读'
  }

  if (
    ['电影', '番剧', '视频', '动漫', '音声', '音乐', 'audio', 'movie', 'anime', 'video', 'asmr', 'music']
      .some((keyword) => normalizedName.includes(keyword))
  ) {
    return '播放'
  }

  return '使用'
}

const getContinueActionLabel = (categoryName: string) => `继续${getUseText(categoryName)}`
const getNextPlayActionLabel = (categoryName: string) => `开始${getUseText(categoryName)}`

const loadContinueLogs = async (page = 1, append = false) => {
  const normalizedPage = Math.max(1, page)
  if (continueLogsLoading.value) {
    return
  }

  continueLogsLoading.value = true
  try {
    await measureDashboardTask('loadContinueLogs', async () => {
      const result = await window.api.db.getRecentResourceLogs(normalizedPage, continueLogsPageSize)
      continueLogsPage.value = Number(result?.page ?? normalizedPage)
      continueLogsTotal.value = Number(result?.total ?? 0)
      const baseIndex = append ? continueCards.value.length : 0
      const nextCards = (result?.items ?? []).map((item: any, index: number) => {
        const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
        const categoryEmoji = String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, categoryName)
        const categoryColor = String(item?.categoryPillColor ?? '').trim() || defaultCategoryPillColor
        const endTime = normalizeDateValue(item?.endTime)
        const duration = Number(item?.duration ?? 0)
        const isRunning = !endTime

        return {
          id: String(item?.resourceId ?? ''),
          categoryId: String(item?.categoryId ?? ''),
          time: formatLogTime(item?.startTime),
          title: String(item?.title ?? '未命名资源'),
          categoryName,
          categoryEmoji,
          categoryColor,
          type: `${categoryEmoji} ${categoryName}`,
          launchMode: String(item?.launchMode ?? ResourceLaunchMode.NORMAL),
          launchModeLabel: formatLaunchMode(item?.launchMode, false),
          state: isRunning ? '正在运行' : `运行 ${formatRuntime(duration)}`,
          note: isRunning ? '当前还没有结束记录' : formatLogTime(item?.endTime),
          action: getContinueActionLabel(categoryName),
          tone: getCategoryTone(categoryName, baseIndex + index)
        }
      })

      continueCards.value = append
        ? [...continueCards.value, ...nextCards]
        : nextCards
    }, {
      page: normalizedPage,
      append: Boolean(append)
    })
  } catch {
    if (!append) {
      continueCards.value = []
      continueLogsTotal.value = 0
    }
  } finally {
    continueLogsLoading.value = false
    void nextTick(() => {
      handleContinueRailScroll()
    })
  }
}

const handleContinueRailScroll = () => {
  const rail = continueRailRef.value
  if (!rail) {
    return
  }

  continueRailShowBackButton.value = rail.scrollLeft > 12

  if (continueLogsLoading.value || !continueLogsHasMore.value) {
    return
  }

  const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft
  if (remaining <= 120) {
    void loadContinueLogs(continueLogsPage.value + 1, true)
  }
}

const scrollContinueRailToStart = () => {
  const rail = continueRailRef.value
  if (!rail) {
    return
  }

  continueRailShowBackButton.value = false
  rail.scrollTo({
    left: 0,
    behavior: 'smooth'
  })
}

const handleContinueRailWheel = (event: WheelEvent) => {
  const rail = continueRailRef.value
  if (!rail) {
    return
  }

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (!delta) {
    return
  }

  const maxScrollLeft = rail.scrollWidth - rail.clientWidth
  if (maxScrollLeft <= 0) {
    return
  }

  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, rail.scrollLeft + delta))
  if (nextScrollLeft === rail.scrollLeft) {
    return
  }

  event.preventDefault()
  rail.scrollLeft = nextScrollLeft
  handleContinueRailScroll()
}

const launchContinueCard = async (card: ContinueCard) => {
  const resourceId = String(card?.id ?? '').trim()
  const categoryId = String(card?.categoryId ?? '').trim()
  if (!resourceId || continueLaunchingId.value === resourceId) {
    return
  }

  continueLaunchingId.value = resourceId
  try {
    const context = await resolveHomeResourceContext(resourceId, categoryId)
    if (!context?.resource) {
      notify('error', '继续使用', '未能读取资源详情')
      return
    }

    const resource = context.resource
    const categoryProfile = context.categoryProfile
    const launchMode = String(card?.launchMode ?? ResourceLaunchMode.NORMAL).trim() || ResourceLaunchMode.NORMAL
    const hasInternalCapability = categoryProfile.flags.isSingleImage
      || categoryProfile.flags.isManga
      || categoryProfile.flags.isAsmr
      || categoryProfile.flags.isAudio
      || categoryProfile.flags.isVideo
      || categoryProfile.flags.isVideoFolder
      || categoryProfile.flags.isNovel
      || Boolean(resource?.singleImageMeta)
      || Boolean(resource?.multiImageMeta)
      || Boolean(resource?.asmrMeta)
      || Boolean(resource?.audioMeta)
      || Boolean(resource?.videoMeta)
      || Boolean(resource?.novelMeta)

    if (hasInternalCapability) {
      await openHomeResourceByCategoryProfile(resource, categoryProfile)
      return
    }

    const normalizedBasePath = String(resource?.basePath ?? '').trim()
    const normalizedFileName = String(resource?.fileName ?? resource?.filename ?? '').trim() || null

    switch (launchMode) {
      case ResourceLaunchMode.MTOOL:
        await window.api.service.launchResourceWithMtool(resourceId, normalizedBasePath, normalizedFileName)
        return
      case ResourceLaunchMode.LOCALE_EMULATOR:
        await window.api.service.launchResourceWithLocaleEmulator(resourceId, normalizedBasePath, normalizedFileName)
        return
      case ResourceLaunchMode.ADMIN:
        await window.api.service.launchResourceAsAdmin(resourceId, normalizedBasePath, normalizedFileName)
        return
      default:
        await openHomeResourceByCategoryProfile(resource, categoryProfile)
        return
    }
  } catch (error) {
    notify('error', '继续使用', error instanceof Error ? error.message : '打开资源失败')
  } finally {
    continueLaunchingId.value = ''
  }
}


const getToneColor = (tone: Tone) => {
  const tokens = themeTokens.value
  const colors: Record<Tone, string> = {
    mint: tokens.success,
    blue: tokens.info,
    amber: tokens.warning,
    purple: tokens.primary,
    rose: tokens.error,
    green: tokens.green,
    slate: tokens.text,
    cyan: tokens.cyan,
    orange: tokens.orange,
    magenta: tokens.magenta,
    lime: tokens.lime
  }

  return colors[tone]
}

const getContinueCardColor = (card: { categoryName: string; categoryColor?: string; tone: Tone }) => {
  if (card.categoryColor && isValidCssColor(card.categoryColor)) {
    return card.categoryColor
  }

  const categoryColor = categoryOverview.value.find((item) => item.categoryName === card.categoryName)?.color
  return categoryColor || getToneColor(card.tone)
}

const getContinueCardStyle = (card: { categoryName: string; categoryColor?: string; tone: Tone }) => {
  const color = getContinueCardColor(card)
  return {
    color,
    backgroundColor: colorAlpha(color, isDark.value ? 0.24 : 0.14),
    borderColor: colorAlpha(color, isDark.value ? 0.42 : 0.3)
  }
}

const shortcuts = computed(() => {
  if (dashboardStatsLoading.value) {
    return [
      { label: '资源失效', value: '读取中', tone: 'rose' },
      { label: '封面缺失', value: '读取中', tone: 'purple' },
      { label: '长期未访问', value: '读取中', tone: 'mint' },
      { label: '标签管理', value: '进入', tone: 'slate' }
    ]
  }

  return [
    { label: '资源失效', value: formatNumber(dashboardStats.value.missingResources), tone: 'rose' },
    { label: '封面缺失', value: formatNumber(dashboardStats.value.missingCovers), tone: 'purple' },
    { label: '沉睡资源', value: formatNumber(dashboardStats.value.longUnvisitedResources), tone: 'mint' },
    { label: '标签管理', value: '进入', tone: 'slate' }
  ]
})

const analysisTabs = [
  { key: 'category' as const, label: '分类占比' },
  { key: 'health' as const, label: '资源健康' },
  { key: 'longUnvisited' as const, label: '沉睡资源' },
  { key: 'usage' as const, label: '使用类型' },
  { key: 'addedTrend' as const, label: '新增趋势' }
]

const analysisTabOptions = analysisTabs.map((item) => ({
  label: item.label,
  value: item.key
}))

const activeCategoryDistributionLabel = ref<string | null>(null)
const activeHealthInsightLabel = ref<string | null>(null)
const healthInsightTooltip = ref<{
  visible: boolean
  x: number
  y: number
  label: string
  value: number
  percent: number
}>({
  visible: false,
  x: 0,
  y: 0,
  label: '',
  value: 0,
  percent: 0
})

const healthInsightTooltipStyle = computed(() => ({
  '--analysis-health-tooltip-border': themeTokens.value.overlayBorder,
  '--analysis-health-tooltip-bg': themeTokens.value.overlayBg,
  '--analysis-health-tooltip-shadow': themeTokens.value.shadowMedium,
  '--analysis-health-tooltip-strong': themeTokens.value.overlayTextStrong,
  '--analysis-health-tooltip-text': themeTokens.value.overlayTextMuted
}))

const categoryDistributionItems = computed(() => {
  const sortedItems = [...categoryOverview.value]
    .filter((item) => Number(item.count ?? 0) > 0)
    .sort((left, right) => right.count - left.count)
  const leadingItems = sortedItems.slice(0, 4).map((item) => ({
    label: item.categoryName,
    displayLabel: item.categoryName,
    value: Number(item.count ?? 0),
    color: isValidCssColor(item.color) ? item.color : getToneColor(item.tone),
    isAggregate: false,
    mergedCount: 0,
    representativeNames: [] as string[]
  }))
  const trailingItems = sortedItems.slice(4)
  const othersCount = trailingItems.reduce((total, item) => total + Number(item.count ?? 0), 0)

  if (othersCount > 0) {
    leadingItems.push({
      label: '其他',
      displayLabel: '其他分类',
      value: othersCount,
      color: themeTokens.value.textFaint,
      isAggregate: true,
      mergedCount: trailingItems.length,
      representativeNames: trailingItems.slice(0, 3).map((item) => item.categoryName)
    })
  }

  return leadingItems
})

const categoryDistributionTotal = computed(() =>
  Math.max(0, categoryDistributionItems.value.reduce((sum, item) => sum + item.value, 0))
)

const categoryDistributionCategoryCount = computed(() =>
  categoryOverview.value.filter((item) => Number(item?.count ?? 0) > 0).length
)

const healthInsightItems = computed(() => [
  {
    label: '正常资源',
    value: Math.max(
      dashboardStats.value.totalResources
      - dashboardStats.value.missingResources
      - dashboardStats.value.missingCovers,
      0
    ),
    color: themeTokens.value.success
  },
  {
    label: '封面缺失',
    value: dashboardStats.value.missingCovers,
    color: themeTokens.value.primary
  },
  {
    label: '资源失效',
    value: dashboardStats.value.missingResources,
    color: themeTokens.value.error
  },
  {
    label: '沉睡资源',
    value: dashboardStats.value.longUnvisitedResources,
    color: themeTokens.value.warning
  }
])

const healthInsightTotal = computed(() => Math.max(1, dashboardStats.value.totalResources))

const longUnvisitedBucketItems = computed(() => {
  const riskPalette = ['#d89a49', '#df8434', '#cf6427', '#d44f33']
  const compactLabels = ['近 3 个月', '3 - 6 个月', '6 - 12 个月', '1 年以上']
  const preciseLabels = ['30 - 90 天', '90 - 180 天', '180 - 365 天', '365 天以上']

  return dashboardLongUnvisitedBuckets.value.map((item, index) => ({
    key: `bucket-${index}`,
    label: compactLabels[index] ?? item.label,
    detailLabel: preciseLabels[index] ?? item.label,
    value: Number(item.value ?? 0),
    color: riskPalette[index] ?? riskPalette[riskPalette.length - 1]
  }))
})

const longUnvisitedTotal = computed(() =>
  Math.max(0, longUnvisitedBucketItems.value.reduce((total, item) => total + item.value, 0))
)

const longUnvisitedAllZero = computed(() =>
  longUnvisitedBucketItems.value.length > 0 && longUnvisitedBucketItems.value.every((item) => item.value <= 0)
)

const longUnvisitedInsightText = computed(() => {
  const items = longUnvisitedBucketItems.value
  const values = items.map((item) => item.value)
  const maxValue = Math.max(...values, 0)

  if (maxValue <= 0) {
    return '当前没有沉睡资源，资源状态较健康'
  }

  const peakIndexes = items
    .map((item, index) => ({ index, value: item.value }))
    .filter((item) => item.value === maxValue)
    .map((item) => item.index)

  if (peakIndexes.length > 1) {
    if (peakIndexes.includes(2) || peakIndexes.includes(3)) {
      return '6 - 12 个月与 1 年以上资源较多，建议优先检查长期沉睡资源'
    }

    if (peakIndexes.includes(0) && peakIndexes.includes(1)) {
      return '近 3 个月与 3 - 6 个月分布接近，当前更适合先观察再逐步整理'
    }

    return '沉睡资源分布较分散，建议先从中长期区间开始整理'
  }

  switch (peakIndexes[0]) {
    case 0:
      return '沉睡资源主要集中在近 3 个月，可先观察，不必急着清理'
    case 1:
      return '当前沉睡资源主要集中在 3 - 6 个月，建议优先从这一段开始整理'
    case 2:
      return '沉睡资源主要集中在 6 - 12 个月，建议优先检查是否仍有保留价值'
    case 3:
      return '建议优先检查 1 年以上未访问资源'
    default:
      return '当前没有明显沉睡压力，资源活跃度较稳定'
  }
})

const usageInsightMaxCount = computed(() =>
  Math.max(...usageInsightItems.value.map((item) => item.count), 0)
)

const usageInsightSummaryText = computed(() => {
  const items = usageInsightItems.value
  if (!items.length || usageInsightMaxCount.value <= 0) {
    return '开始使用资源后，这里会展示近期重心分布'
  }

  const [first, second] = items
  if (!second || first.count >= second.count + 2) {
    return `近 30 天启动主要集中在${first.label}`
  }

  return `近期使用重心偏向${first.label}与${second.label}`
})

const addedTrendTotal = computed(() =>
  dashboardAddedTrend.value.reduce((total, item) => total + item.count, 0)
)

const addedTrendPeakItem = computed(() => {
  return [...dashboardAddedTrend.value]
    .sort((left, right) => right.count - left.count || left.date.localeCompare(right.date))[0] ?? null
})

const addedTrendInsightText = computed(() => {
  const peak = addedTrendPeakItem.value
  if (!peak || peak.count <= 0) {
    return '近 14 天还没有明显新增波动'
  }

  return `${peak.date.slice(5).replace('-', '/')} 为近 14 天新增峰值`
})

const activeAnalysisTitle = computed(() => {
  if (activeAnalysisTab.value === 'health') {
    return '问题资源与维护压力'
  }

  if (activeAnalysisTab.value === 'longUnvisited') {
    return '沉睡资源风险分层'
  }

  if (activeAnalysisTab.value === 'usage') {
    return '近30天资源使用分布'
  }

  if (activeAnalysisTab.value === 'addedTrend') {
    return '近 14 天新增变化'
  }

  return '分类资源占比'
})

const activeAnalysisMeta = computed(() => {
  if (activeAnalysisTab.value === 'health') {
    return `问题资源 ${formatNumber(
      healthInsightItems.value
        .filter((item) => item.label !== '正常资源')
        .reduce((total, item) => total + item.value, 0)
    )} 项`
  }

  if (activeAnalysisTab.value === 'longUnvisited') {
    return longUnvisitedAllZero.value
      ? '当前没有沉睡资源'
      : `当前沉睡资源 ${formatNumber(longUnvisitedTotal.value)} 项`
  }

  if (activeAnalysisTab.value === 'usage') {
    return '近 30 天启动统计'
  }

  if (activeAnalysisTab.value === 'addedTrend') {
  return `近 14 天新增 ${formatNumber(addedTrendTotal.value)} 项`
  }

  return `分类数量 ${formatNumber(categoryDistributionCategoryCount.value)}`
})

const categoryDistributionLegendItems = computed(() => {
  const total = Math.max(1, categoryDistributionTotal.value)
  return categoryDistributionItems.value.map((item) => ({
    ...item,
    percent: Math.round((item.value / total) * 100)
  }))
})

const categoryDistributionActiveItem = computed(() => {
  const activeLabel = String(activeCategoryDistributionLabel.value ?? '').trim()
  if (!activeLabel) {
    return null
  }

  return categoryDistributionLegendItems.value.find((item) => item.label === activeLabel) ?? null
})

const categoryDistributionCenterSummary = computed(() => {
  const activeItem = categoryDistributionActiveItem.value
  if (activeItem) {
    return {
      value: formatNumber(activeItem.value),
      label: activeItem.displayLabel,
      hint: activeItem.isAggregate
        ? `包含 ${formatNumber(activeItem.mergedCount)} 个分类`
        : `占比 ${activeItem.percent}%`
    }
  }

  return {
    value: formatNumber(categoryDistributionTotal.value),
    label: '已收录资源',
    hint: ''
  }
})

const categoryDistributionChartOption = computed<EChartsOption>(() => {
  const activeLabel = String(activeCategoryDistributionLabel.value ?? '').trim()
  const data = categoryDistributionLegendItems.value.map((item) => ({
    value: item.value,
    name: item.label,
    itemStyle: {
      color: item.color,
      borderRadius: 6,
      opacity: activeLabel && activeLabel !== item.label ? 0.42 : 1,
      shadowBlur: activeLabel === item.label ? 18 : 0,
      shadowColor: activeLabel === item.label ? item.color : 'transparent'
    }
  }))

  return {
    animationDuration: 360,
    animationDurationUpdate: 360,
    tooltip: {
      trigger: 'item',
      backgroundColor: themeTokens.value.chartTooltipBg,
      borderColor: themeTokens.value.chartTooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: themeTokens.value.chartTooltipText,
        fontSize: 12
      },
      formatter: (params: any) => {
        const target = categoryDistributionLegendItems.value.find((item) => item.label === String(params?.name ?? ''))
        const percent = Number(params?.percent ?? target?.percent ?? 0).toFixed(0)

        if (target?.isAggregate) {
          const representative = target.representativeNames.length
            ? `<br/>代表分类：${target.representativeNames.join(' / ')}`
            : ''
          return `${target.displayLabel}<br/>${formatNumber(Number(target.value ?? 0))} 项 · ${percent}%<br/>包含 ${formatNumber(target.mergedCount)} 个分类${representative}`
        }

        return `${target?.displayLabel ?? params?.name ?? '未分类'}<br/>${formatNumber(Number(params?.value ?? 0))} 项 · ${percent}%`
      }
    },
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '33%',
        silent: true,
        style: {
          text: categoryDistributionCenterSummary.value.value,
          fill: themeTokens.value.chartTooltipText,
          fontSize: 30,
          fontWeight: 800,
          textAlign: 'center'
        }
      },
      {
        type: 'text',
        left: 'center',
        top: '55%',
        silent: true,
        style: {
          text: categoryDistributionCenterSummary.value.label,
          fill: themeTokens.value.chartTextMuted,
          fontSize: 13,
          fontWeight: 700,
          textAlign: 'center'
        }
      },
      {
        type: 'text',
        left: 'center',
        top: '66%',
        silent: true,
        style: {
          text: categoryDistributionCenterSummary.value.hint,
          fill: themeTokens.value.chartTextSoft,
          fontSize: 11,
          fontWeight: 600,
          textAlign: 'center'
        }
      }
    ],
    series: [
      {
        type: 'pie',
        silent: true,
        z: 1,
        radius: ['62%', '86%'],
        center: ['50%', '50%'],
        roundCap: false,
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        tooltip: { show: false },
        itemStyle: {
          color: themeTokens.value.chartTrackStrong,
          borderRadius: 6
        },
        padAngle: 1.5,
        data: data.map((item) => ({
          value: item.value,
          name: item.name
        }))
      },
      {
        type: 'pie',
        z: 2,
        radius: ['62%', '86%'],
        center: ['50%', '50%'],
        roundCap: false,
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        padAngle: 1.5,
        itemStyle: {
          borderRadius: 0
        },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: {
            shadowBlur: 20,
            shadowColor: themeTokens.value.chartShadow
          }
        },
        data
      }
    ]
  }
})

const handleCategoryDistributionActiveChange = (label?: string | null) => {
  activeCategoryDistributionLabel.value = String(label ?? '').trim() || null
}

const handleCategoryDistributionChartMouseOver = (params: any) => {
  if (params?.componentType !== 'series') {
    return
  }

  handleCategoryDistributionActiveChange(params?.name)
}

const handleCategoryDistributionChartMouseOut = () => {
  handleCategoryDistributionActiveChange(null)
}

const healthInsightSegments = computed(() => {
  const total = healthInsightItems.value.reduce((sum, item) => sum + item.value, 0)
  return healthInsightItems.value.map((item) => ({
    ...item,
    percent: total > 0 ? (item.value / total) * 100 : 0,
    totalPercent: healthInsightTotal.value > 0 ? (item.value / healthInsightTotal.value) * 100 : 0,
    hasPlaceholder: item.value <= 0
  }))
})

const handleHealthInsightActiveChange = (label?: string | null) => {
  activeHealthInsightLabel.value = String(label ?? '').trim() || null
}

const showHealthInsightTooltip = (event: MouseEvent, item: { label: string; value: number; totalPercent: number }) => {
  handleHealthInsightActiveChange(item.label)
  const targetRect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  healthInsightTooltip.value.visible = true
  healthInsightTooltip.value.x = event.clientX
  healthInsightTooltip.value.y = targetRect?.top ?? event.clientY
  healthInsightTooltip.value.label = item.label
  healthInsightTooltip.value.value = item.value
  healthInsightTooltip.value.percent = item.totalPercent
}

const moveHealthInsightTooltip = (event: MouseEvent) => {
  if (!healthInsightTooltip.value.visible) {
    return
  }

  healthInsightTooltip.value.x = event.clientX
}

const hideHealthInsightTooltip = () => {
  healthInsightTooltip.value.visible = false
  handleHealthInsightActiveChange(null)
}

const usageDistributionChartOption = computed<EChartsOption>(() => {
  const items = [...usageInsightItems.value].reverse()
  const maxCount = Math.max(usageInsightMaxCount.value, 1)
  const displayMax = maxCount / 0.9

  return {
    animationDuration: 360,
    animationDurationUpdate: 360,
    grid: {
      left: 0,
      right: 6,
      top: 4,
      bottom: 4,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: themeTokens.value.chartTrack
        }
      },
      backgroundColor: themeTokens.value.chartTooltipBg,
      borderColor: themeTokens.value.chartTooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: themeTokens.value.chartTooltipText,
        fontSize: 12
      },
      formatter: (params: any) => {
        const first = Array.isArray(params) ? params[0] : params
        return `${first?.name ?? '未分类'}<br/>${formatNumber(Number(first?.value ?? 0))} 次`
      }
    },
    xAxis: {
      type: 'value',
      max: displayMax,
      show: false
    },
    yAxis: {
      type: 'category',
      inverse: false,
      data: items.map((item) => item.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 12,
        width: 72,
        overflow: 'truncate',
        rich: {
          top: {
            color: themeTokens.value.chartTooltipText,
            fontWeight: 700
          },
          normal: {
            color: themeTokens.value.textStrong,
            fontWeight: 600
          }
        },
        formatter: (value: string) => {
          const matched = items.find((item) => item.label === value)
          const style = matched?.count === maxCount ? 'top' : 'normal'
          return `{${style}|${value}}`
        }
      }
    },
    series: [
      {
        type: 'bar',
        data: items.map((item) => ({
          value: item.count,
          itemStyle: {
            color: item.color,
            borderRadius: 999
          },
          label: {
            color: item.count === maxCount ? themeTokens.value.chartTooltipText : themeTokens.value.textStrong,
            fontWeight: item.count === maxCount ? 800 : 700
          }
        })),
        barWidth: 11,
        showBackground: true,
        backgroundStyle: {
          color: themeTokens.value.chartTrack,
          borderRadius: 999
        },
        label: {
          show: true,
          position: 'right',
          distance: 10,
          color: themeTokens.value.chartTooltipText,
          fontSize: 12,
          fontWeight: 700,
          formatter: ({ value }: any) => formatNumber(Number(value ?? 0)),
          rich: {
            top: {
              color: themeTokens.value.chartTooltipText,
              fontWeight: 800
            },
            normal: {
              color: themeTokens.value.textStrong,
              fontWeight: 700
            }
          }
        }
      }
    ]
  }
})

const longUnvisitedDistributionChartOption = computed<EChartsOption>(() => {
  const items = longUnvisitedBucketItems.value
  const sleepingTotal = Math.max(1, longUnvisitedTotal.value)
  const resourceTotal = Math.max(1, dashboardStats.value.totalResources)
  const maxValue = Math.max(...items.map((item) => item.value), 0)
  const zeroBarPlaceholder = maxValue > 0 ? Math.max(0.6, maxValue * 0.045) : 0.6
  const isEmptyState = longUnvisitedAllZero.value

  return {
    animationDuration: 360,
    animationDurationUpdate: 360,
    grid: {
      left: '14%',
      right: '14%',
      top: 16,
      bottom: 28,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: themeTokens.value.chartTrackStrong
        }
      },
      backgroundColor: themeTokens.value.chartTooltipBg,
      borderColor: themeTokens.value.chartTooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: themeTokens.value.chartTooltipText,
        fontSize: 12
      },
      formatter: (params: any) => {
        const first = Array.isArray(params) ? params[0] : params
        const matched = items.find((item) => item.label === String(first?.name ?? ''))
        const value = Number(matched?.value ?? first?.value ?? 0)
        const sleepingPercent = sleepingTotal > 0 ? (value / sleepingTotal) * 100 : 0
        const totalPercent = resourceTotal > 0 ? (value / resourceTotal) * 100 : 0
        if (isEmptyState) {
          return `${matched?.detailLabel ?? first?.name ?? '区间'}<br/>0 项`
        }
        return `${matched?.detailLabel ?? first?.name ?? '区间'}<br/>${formatNumber(value)} 项<br/>占沉睡资源 ${sleepingPercent.toFixed(1)}%<br/>占总资源 ${totalPercent.toFixed(1)}%`
      }
    },
    xAxis: {
      type: 'category',
      data: items.map((item) => item.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: themeTokens.value.chartTextMuted,
        fontSize: 11,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: isEmptyState ? 1 : undefined,
      show: false
    },
    series: [
      {
        type: 'bar',
        barWidth: 28,
        barCategoryGap: '28%',
        data: items.map((item) => ({
          value: item.value > 0
            ? item.value
            : isEmptyState
              ? 0.03
              : zeroBarPlaceholder,
          itemStyle: {
            color: isEmptyState ? themeTokens.value.chartTrackStrong : item.color,
            opacity: item.value > 0 ? 1 : isEmptyState ? 0.72 : 0.28,
            borderRadius: [8, 8, 0, 0]
          },
          rawValue: item.value
        })),
        label: {
          show: true,
          position: 'top',
          color: isEmptyState ? themeTokens.value.chartTextMuted : themeTokens.value.chartTooltipText,
          fontSize: 11,
          fontWeight: 700,
          formatter: (params: any) => formatNumber(Number(params?.data?.rawValue ?? params?.value ?? 0))
        }
      }
    ]
  }
})

const addedTrendChartOption = computed<EChartsOption>(() => {
  const items = dashboardAddedTrend.value
  const total = Math.max(1, addedTrendTotal.value)
  const peakCount = Math.max(...items.map((item) => item.count), 0)
  const peakLabel = addedTrendPeakItem.value?.date.slice(5).replace('-', '/') ?? ''
  const minVisibleBar = peakCount > 0 ? Math.min(Math.max(1.2, peakCount * 0.12), peakCount * 0.28) : 0
  return {
    animationDuration: 360,
    animationDurationUpdate: 360,
    grid: {
      left: 6,
      right: 6,
      top: 14,
      bottom: 20
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: themeTokens.value.chartTrackStrong
        }
      },
      backgroundColor: themeTokens.value.chartTooltipBg,
      borderColor: themeTokens.value.chartTooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: themeTokens.value.chartTooltipText,
        fontSize: 12
      },
      formatter: (params: any) => {
        const first = Array.isArray(params) ? params[0] : params
        const value = Number(first?.data?.rawValue ?? first?.value ?? 0)
        const percent = total > 0 ? (value / total) * 100 : 0
        return `${first?.name ?? ''}<br/>新增 ${formatNumber(value)} 项<br/>占近 14 天新增 ${percent.toFixed(1)}%`
      }
    },
    xAxis: {
      type: 'category',
      data: items.map((item) => item.date.slice(5).replace('-', '/')),
      axisLine: {
        show: true,
        lineStyle: {
          color: themeTokens.value.chartAxis,
          width: 1
        }
      },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 10,
        interval: (index: number) => index % 2 === 0,
        rich: {
          peak: {
            color: themeTokens.value.textStrong,
            fontWeight: 600
          },
          normal: {
            color: themeTokens.value.chartTextSoft,
            fontWeight: 500
          }
        },
        formatter: (value: string) => value === peakLabel ? `{peak|${value}}` : `{normal|${value}}`
      }
    },
    yAxis: {
      type: 'value',
      show: false
    },
    series: [
      {
        type: 'bar',
        barWidth: '48%',
        emphasis: {
          itemStyle: {
            opacity: 1,
            color: themeTokens.value.primary
          }
        },
        data: items.map((item) => ({
          value: item.count > 0 ? Math.max(item.count, minVisibleBar) : 0,
          rawValue: item.count,
          itemStyle: {
            color: item.count === peakCount && peakCount > 0
              ? colorAlpha(themeTokens.value.primary, 0.98)
              : colorAlpha(themeTokens.value.primary, 0.72),
            borderRadius: [6, 6, 0, 0]
          },
          label: {
            color: item.count === peakCount && peakCount > 0 ? themeTokens.value.chartTooltipText : themeTokens.value.textStrong
          }
        }))
      }
    ]
  }
})

const coverFilters = computed(() => ([
  { key: 'all' as const, label: `全部 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.all) || 0)))}`, tone: 'mint' as Tone },
  { key: 'recentRun' as const, label: `最近使用 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.recentRun) || 0)))}`, tone: 'slate' as Tone },
  { key: 'recentAdd' as const, label: `最近添加 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.recentAdd) || 0)))}`, tone: 'blue' as Tone },
  { key: 'favorite' as const, label: `已收藏 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.favorite) || 0)))}`, tone: 'purple' as Tone },
  { key: 'coverOnly' as const, label: `有封面 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value.coverOnly) || 0)))}`, tone: 'green' as Tone }
]))

const coverWallActiveSelection = computed<{ kind: 'status' | 'category'; key: string }>(() => {
  if (coverWallActiveCategoryId.value) {
    return { kind: 'category', key: coverWallActiveCategoryId.value }
  }

  return { kind: 'status', key: coverWallActiveFilter.value }
})

const currentCoverWallStatusItems = computed(() => coverWallItems.value[coverWallActiveFilter.value] ?? [])
const currentCoverWallPageState = computed(() => coverWallPageState.value[coverWallActiveFilter.value])

const displayedCoverWallItems = computed(() => {
  const baseItems = coverWallActiveSelection.value.kind === 'category'
    ? (coverWallItems.value.all ?? []).filter((item) => item.categoryId === coverWallActiveSelection.value.key)
    : (coverWallItems.value[coverWallActiveFilter.value] ?? [])

  return baseItems
})

const coverWallVisibleItems = computed(() => displayedCoverWallItems.value)
const coverWallShouldLoadMore = computed(() =>
  !coverWallLoading.value
  && currentCoverWallPageState.value.hasMore
  && !currentCoverWallPageState.value.loading
)
const coverWallInitialLoading = computed(() =>
  coverWallLoading.value
  || (
    coverWallActiveSelection.value.kind === 'status'
    && currentCoverWallPageState.value.loading
    && !currentCoverWallStatusItems.value.length
  )
)

const coverWallHoveredItem = computed(() =>
  coverWallVisibleItems.value.find((item) => item.id === coverWallHoverState.value?.id) ?? null
)

const currentCoverWallCategoryChips = computed<CoverWallCategoryChip[]>(() => {
  const counts = new Map<string, CoverWallCategoryChip>()
  for (const item of currentCoverWallStatusItems.value) {
    const key = `${item.categoryId}::${item.categoryName}`
    const current = counts.get(key)
    if (current) {
      current.count += 1
      continue
    }

    counts.set(key, {
      id: item.categoryId,
      label: item.categoryName,
      emoji: item.categoryEmoji,
      color: item.categoryColor,
      count: 1
    })
  }

  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'))
})

const coverWallCategoryFilters = computed(() => {
  const chipMap = new Map(currentCoverWallCategoryChips.value.map((item) => [item.id, item] as const))
  const orderedFromTop = categoryOverview.value
    .filter((item) => String(item.routeId ?? '').trim())
    .map((item) => {
      const categoryId = String(item.routeId ?? '').trim()
      const matched = chipMap.get(categoryId)
      return {
        id: categoryId,
        label: item.categoryName,
        emoji: item.emoji,
        color: item.color || matched?.color || defaultCategoryPillColor,
        count: Number(item.count ?? 0)
      }
    }) as CoverWallCategoryChip[]

  const appended = currentCoverWallCategoryChips.value.filter((item) =>
    !orderedFromTop.some((orderedItem) => orderedItem.id === item.id)
  )

  return [...orderedFromTop, ...appended]
})

const toneClass = (tone: Tone) => `tone-${tone}`

const getCoverWallHoverMetaLabel = (item: CoverWallResource) => {
  return item.lastAccessTime
    ? `上次使用 ${formatPinnedRelativeTime(item.lastAccessTime)}`
    : '上次使用 暂无记录'
}

const getCoverWallCompletedLabel = (item: CoverWallResource) => {
  const categoryName = item.categoryName.trim().toLowerCase()
  if (categoryName.includes('游戏') || categoryName.includes('game') || categoryName.includes('galgame')) {
    return '已通关'
  }

  if (categoryName.includes('小说') || categoryName.includes('书') || categoryName.includes('novel') || categoryName.includes('book')) {
    return '已读完'
  }

  if (
    categoryName.includes('电影')
    || categoryName.includes('番剧')
    || categoryName.includes('anime')
    || categoryName.includes('movie')
    || categoryName.includes('视频')
    || categoryName.includes('video')
  ) {
    return '已播完'
  }

  return '已完成'
}

const getCoverWallStateBadges = (item: CoverWallResource) => {
  const badges: string[] = []

  if (item.missingStatus) {
    badges.push('资源失效')
  }

  if (item.favorite) {
    badges.push('已收藏')
  }

  if (item.isCompleted) {
    badges.push(getCoverWallCompletedLabel(item))
  }

  if (item.isPinned) {
    badges.push('已固定')
  }

  return badges
}

const getCoverWallSummaryText = () => {
  if (coverWallSearchKeyword.value.trim()) {
    return `当前结果 ${String(Math.max(0, Math.trunc(Number(coverWallQueryTotal.value) || 0)))} 项`
  }

  if (coverWallActiveSelection.value.kind === 'status') {
    return `当前结果 ${String(Math.max(0, Math.trunc(Number(coverWallCounts.value[coverWallActiveFilter.value] ?? 0))))} 项`
  }

  return `当前结果 ${String(Math.max(0, Math.trunc(Number(displayedCoverWallItems.value.length) || 0)))} 项`
}

const getCoverWallCategoryChipStyle = (chip: { color: string }, active = false) => {
  if (active) {
    return {}
  }

  return {
    color: chip.color,
    borderColor: colorAlpha(chip.color, 0.32),
    background: colorAlpha(chip.color, 0.14)
  }
}

const getCoverWallHoverStyle = () => ({
  left: `${coverWallHoverState.value?.left ?? 0}px`,
  top: `${coverWallHoverState.value?.top ?? 0}px`
})

const handleCoverWallCategoryClick = (categoryId: string) => {
  if (coverWallActiveSelection.value.kind === 'category' && coverWallActiveCategoryId.value === categoryId) {
    coverWallActiveCategoryId.value = ''
    coverWallActiveFilter.value = 'all'
  } else {
    coverWallActiveCategoryId.value = categoryId
  }
  resetCoverWallViewState()
}

const setupCoverWallLoadMoreObserver = () => {
  coverWallLoadMoreObserver?.disconnect()
  coverWallLoadMoreObserver = null

  if (typeof IntersectionObserver === 'undefined' || !coverWallShouldLoadMore.value) {
    return
  }

  nextTick(() => {
    if (!coverWallLoadMoreRef.value || !coverWallShouldLoadMore.value) {
      return
    }

    coverWallLoadMoreObserver = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry?.isIntersecting || !coverWallShouldLoadMore.value) {
        return
      }
      void loadCoverWallPage(coverWallActiveFilter.value, false)
    }, {
      root: coverWallStickyScrollHost instanceof Window ? null : coverWallStickyScrollHost,
      rootMargin: '240px 0px 420px 0px',
      threshold: 0
    })

    coverWallLoadMoreObserver.observe(coverWallLoadMoreRef.value)
  })
}

const clearCoverWallStickyRaf = () => {
  if (coverWallStickyRafId != null) {
    cancelAnimationFrame(coverWallStickyRafId)
    coverWallStickyRafId = null
  }
}

const updateCoverWallStickyState = () => {
  clearCoverWallStickyRaf()
  coverWallStickyRafId = requestAnimationFrame(() => {
    coverWallStickyRafId = null
    const stickyElement = coverWallStickyRef.value
    if (!stickyElement) {
      coverWallStickyStuck.value = false
      return
    }

    const stickyTop = stickyElement.getBoundingClientRect().top
    const hostTop = coverWallStickyScrollHost instanceof Window
      ? 0
      : (coverWallStickyScrollHost?.getBoundingClientRect().top ?? 0)

    coverWallStickyStuck.value = stickyTop <= hostTop + 0.5
  })
}

const unbindCoverWallStickyEvents = () => {
  if (coverWallStickyScrollHost instanceof Window) {
    window.removeEventListener('scroll', updateCoverWallStickyState)
  } else if (coverWallStickyScrollHost) {
    coverWallStickyScrollHost.removeEventListener('scroll', updateCoverWallStickyState)
  }

  window.removeEventListener('resize', updateCoverWallStickyState)
  coverWallStickyScrollHost = null
  clearCoverWallStickyRaf()
}

const bindCoverWallStickyEvents = () => {
  unbindCoverWallStickyEvents()
  const stickyElement = coverWallStickyRef.value
  if (!stickyElement) {
    coverWallStickyStuck.value = false
    return
  }

  coverWallStickyScrollHost = stickyElement.closest('.n-layout-scroll-container') as HTMLElement | null ?? window

  if (coverWallStickyScrollHost instanceof Window) {
    window.addEventListener('scroll', updateCoverWallStickyState, { passive: true })
  } else {
    coverWallStickyScrollHost.addEventListener('scroll', updateCoverWallStickyState, { passive: true })
  }

  window.addEventListener('resize', updateCoverWallStickyState, { passive: true })
  updateCoverWallStickyState()
  setupCoverWallLoadMoreObserver()
}

const getCoverWallBackTopListenTarget = () =>
  coverWallStickyScrollHost instanceof Window
    ? document
    : (coverWallStickyScrollHost ?? document)

const handleSearch = () => {
  const keyword = searchKeyword.value.trim()
  router.push({
    name: 'search',
    query: keyword ? { keyword } : undefined
  })
}

const handleCategoryPillClick = (categoryId: string) => {
  if (!categoryId) {
    return
  }

  router.push({
    name: 'category',
    params: {
      id: categoryId
    }
  })
}

const handleRecentFeedClick = (feed: RecentFeed) => {
  void openHomeDetailDrawer(feed)
}

const openContinueCard = (card: ContinueCard) => {
  void openHomeDetailDrawer(card)
}

const handleContinueCardKeydown = (event: KeyboardEvent, card: ContinueCard) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  openContinueCard(card)
}

const getHomePinnedCardStyle = (item: HomePinnedCard) => {
  const accent = item.categoryColor || defaultCategoryPillColor
  const hasCover = Boolean(String(item?.coverUrl ?? '').trim())
  return {
    '--queue-pinned-accent': accent,
    '--queue-pinned-cover-image': toCssUrlValue(item.coverUrl),
    background: hasCover
      ? colorAlpha(accent, isDark.value ? 0.08 : 0.06)
      : colorAlpha(accent, isDark.value ? 0.2 : 0.12),
    borderColor: colorAlpha(accent, hasCover ? (isDark.value ? 0.24 : 0.16) : (isDark.value ? 0.28 : 0.18))
  }
}

const openHomePinnedCard = (item: HomePinnedCard) => {
  void openHomeDetailDrawer(item)
}

const handleHomePinnedCardKeydown = (event: KeyboardEvent, item: HomePinnedCard) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  openHomePinnedCard(item)
}

const showNotifyByType = (type: 'success' | 'error' | 'info' | 'warning', title: string, content: string) => {
  notify(type, title, content)
}
const showHomeEditNotifyByType = (type: string, title: string, content: string) => {
  const normalizedType = type === 'warn' ? 'warning' : type
  showNotifyByType(normalizedType as 'success' | 'error' | 'info' | 'warning', title, content)
}

const hasDashboardCategoryShape = (category: any) =>
  Boolean(String(category?.extendTable ?? category?.meta?.extra?.extendTable ?? '').trim())

const ensureDashboardCategorySource = async (categoryIdInput: string, fallbackSource: any) => {
  if (hasDashboardCategoryShape(fallbackSource)) {
    return fallbackSource
  }

  const categoryId = String(categoryIdInput ?? '').trim()
  if (!categoryId) {
    return fallbackSource ?? null
  }

  const mapCategory = categoryMap.value[categoryId]
  if (hasDashboardCategoryShape(mapCategory)) {
    return mapCategory
  }

  try {
    const dbCategory = await window.api.db.getCategoryById(categoryId)
    if (hasDashboardCategoryShape(dbCategory)) {
      return dbCategory
    }
  } catch {
    // keep fallback path resilient; caller will degrade gracefully if category still missing
  }

  return fallbackSource ?? null
}

const createHomeEditorEmptyFormData = () => ({
  name: '',
  author: '',
  authors: [] as string[],
  description: '',
  coverPath: '',
  basePath: '',
  actors: [] as string[],
  tags: [] as string[],
  types: [] as string[],
  meta: createEmptyMetaByType(String(homeEditCategorySettings.value.extendTable ?? ''))
})

const cloneHomeEditFormData = (value: any) => JSON.parse(JSON.stringify(value ?? createHomeEditorEmptyFormData()))

const normalizeSelectedValues = (values: string[]) =>
  Array.from(new Set(
    (values ?? [])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
  ))

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
const formatAudioCoverCandidateQuery = (query: Record<string, string>) =>
  [
    query?.title ? `歌名：${query.title}` : '',
    query?.artist ? `歌手：${query.artist}` : '',
    query?.album ? `专辑：${query.album}` : ''
  ]
    .filter(Boolean)
    .join(' / ')

const syncHomeEditAudioAuthorFields = (targetForm: any, names?: string[]) => {
  if (String(homeEditCategorySettings.value.extendTable ?? '').trim() !== 'audio_meta' || !targetForm) {
    return
  }

  const normalizedNames = normalizeAudioAuthorList(
    Array.isArray(names)
      ? names
      : [
        ...(Array.isArray(targetForm.authors) ? targetForm.authors : []),
        String(targetForm.author ?? '').trim()
      ]
  )
  const displayName = joinAudioAuthorNames(normalizedNames)

  targetForm.authors = normalizedNames
  targetForm.author = displayName
  targetForm.meta = {
    ...(targetForm.meta ?? {}),
    artist: displayName
  }
}

const mapHomeDetailToEditFormData = (resource: any) => {
  const pickFirstNonEmptyString = (...values: any[]) => {
    for (const value of values) {
      const normalized = String(value ?? '').trim()
      if (normalized) {
        return normalized
      }
    }

    return ''
  }

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
    author: joinAudioAuthorNames(authorNames) || String(resource?.audioMeta?.artist ?? ''),
    authors: homeEditIsAudio.value ? authorNames : [],
    actors: Array.isArray(resource?.actors) ? resource.actors.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
    tags: Array.isArray(resource?.tags) ? resource.tags.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
    types: Array.isArray(resource?.types) ? resource.types.map((item: any) => String(item?.name ?? '')).filter(Boolean) : [],
    meta: {
      ...createEmptyMetaByType(String(homeEditCategorySettings.value.extendTable ?? '')),
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

const assignHomeEditFormRef = (instance: any) => {
  homeEditFormRef.value = instance ?? null
}

const assignHomeEditBasePathFormItemRef = (instance: any) => {
  homeEditBasePathFormItemRef.value = instance ?? null
}

const createSelectOption = (value: string) => ({
  label: value,
  value
})

const homeEditFormRules = computed(() => ({
  basePath: {
    trigger: ['blur', 'change'],
    validator: (_rule: unknown, value: string) => {
      if (!value) {
        return new Error(`请选择${homeEditCategoryName.value}路径`)
      }

      if (!validateHomeEditBasePathExtension(value)) {
        return new Error(getHomeEditBasePathValidationMessage())
      }

      return true
    }
  },
  'meta.website': {
    trigger: ['blur', 'change'],
    validator: (_rule: unknown, value: string) => {
      if (String(homeEditCategorySettings.value.extendTable ?? '').trim() !== 'website_meta') {
        return true
      }

      if (!String(value ?? '').trim()) {
        return new Error('请输入网站地址')
      }

      if (!normalizeWebsiteUrl(value)) {
        return new Error('请输入合法的网站地址')
      }

      return true
    }
  }
}))

const validateHomeEditBasePathExtension = (basePath: string) => {
  if (!basePath || homeEditCategorySettings.value.resourcePathType !== 'file') {
    return true
  }

  const allowedExtensions = homeEditNormalizedAllowedExtensions.value
  if (!allowedExtensions.length) {
    return true
  }

  return allowedExtensions.includes(getFileExtension(basePath))
}

const getHomeEditBasePathValidationMessage = () => {
  const allowedExtensions = homeEditNormalizedAllowedExtensions.value
  if (!allowedExtensions.length) {
    return `请选择合法的${homeEditCategoryName.value}文件`
  }

  return `请选择合法的${homeEditCategoryName.value}文件，仅支持 ${allowedExtensions.join(', ')}`
}

const loadHomeEditFormOptions = async (categoryId: string) => {
  const normalizedCategoryId = String(categoryId ?? '').trim()
  if (!normalizedCategoryId) {
    homeEditAuthorSelectOptions.value = []
    homeEditTagSelectOptions.value = []
    homeEditTypeSelectOptions.value = []
    homeEditWebsiteTypeOptions.value = []
    return
  }

  const [authorList, tagList, typeList, gameSiteTypeDict, asmrSiteTypeDict] = await Promise.all([
    window.api.db.getAuthorByCategoryId(normalizedCategoryId),
    window.api.db.getTagByCategoryId(normalizedCategoryId),
    window.api.db.getTypeByCategoryId(normalizedCategoryId),
    window.api.db.getSelectDictData(DictType.GAME_SITE_TYPE),
    window.api.db.getSelectDictData(DictType.ASMR_SITE_TYPE)
  ])

  homeEditAuthorSelectOptions.value = Array.isArray(authorList)
    ? authorList
      .map((item: any) => {
        const name = String(item?.name ?? '').trim()
        return name ? { label: name, value: name } : null
      })
      .filter(Boolean) as Array<{ label: string; value: string }>
    : []
  homeEditTagSelectOptions.value = Array.isArray(tagList)
    ? tagList
      .map((item: any) => {
        const name = String(item?.name ?? '').trim()
        return name ? { label: name, value: name } : null
      })
      .filter(Boolean) as Array<{ label: string; value: string }>
    : []
  homeEditTypeSelectOptions.value = Array.isArray(typeList)
    ? typeList
      .map((item: any) => {
        const name = String(item?.name ?? '').trim()
        return name ? { label: name, value: name } : null
      })
      .filter(Boolean) as Array<{ label: string; value: string }>
    : []
  homeEditWebsiteTypeOptions.value = Array.from(
    new Map<string, any>(
      [...(Array.isArray(gameSiteTypeDict) ? gameSiteTypeDict : []), ...(Array.isArray(asmrSiteTypeDict) ? asmrSiteTypeDict : [])]
        .map((item: any) => [String(item?.value ?? item?.id ?? '').trim(), item] as const)
        .filter(([value]) => value)
    ).values()
  )
}

const homeEditSoftwareScript = useCategoryEditorSoftwareScript({
  formData: homeEditFormData,
  basePathFormItemRef: homeEditBasePathFormItemRef,
  showSoftwareScriptModal: showHomeEditSoftwareScriptModal,
  softwareScriptDraft: homeEditSoftwareScriptDraft,
  softwareScriptRuntimePath: homeEditSoftwareScriptRuntimePath,
  softwareScriptRuntimes: homeEditSoftwareScriptRuntimes,
  softwareScriptShellType: homeEditSoftwareScriptShellType,
  showNotifyByType: showHomeEditNotifyByType
})

const {
  ensureSoftwareScriptRuntimes: ensureHomeEditSoftwareScriptRuntimes,
  resolveSoftwareScriptShell: resolveHomeEditSoftwareScriptShell,
  denormalizeSoftwareScript: denormalizeHomeEditSoftwareScript,
  handleConfirmSoftwareScript: handleHomeEditConfirmSoftwareScript
} = homeEditSoftwareScript

const homeEditPathAnalysis = useCategoryEditorPathAnalysis({
  formData: homeEditFormData,
  categorySettings: homeEditCategorySettings,
  detailIsAsmr: homeEditIsAsmr,
  websiteTypeOptions: homeEditWebsiteTypeOptions,
  showNotifyByType: showHomeEditNotifyByType,
  confirmDialog,
  getFileNameWithoutExtension,
  getResourceNameFromBasePath,
  normalizeAudioAuthorList,
  joinAudioAuthorNames,
  syncAudioAuthorFields: syncHomeEditAudioAuthorFields
})

const {
  applyDefaultPathName: applyHomeEditDefaultPathName,
  applyNovelFileAnalysis: applyHomeEditNovelFileAnalysis,
  applyGamePathAnalysis: applyHomeEditGamePathAnalysis,
  applyAudioPathAnalysis: applyHomeEditAudioPathAnalysis,
  applyMultiImageDirectoryAnalysis: applyHomeEditMultiImageDirectoryAnalysis,
  applyAudioCoverAnalysis: applyHomeEditAudioCoverAnalysis
} = homeEditPathAnalysis

const homeEditAssistActions = useCategoryEditorAssistActions({
  formData: homeEditFormData,
  editingResourceId: homeEditingResourceId,
  fetchResourceInfoLoading: homeEditFetchResourceInfoLoading,
  videoCoverFrameLoading: homeEditVideoCoverFrameLoading,
  showAudioCoverCandidateModal: showHomeEditAudioCoverCandidateModal,
  showVideoCoverCandidateModal: showHomeEditVideoCoverCandidateModal,
  showVideoSubCoverCandidateModal: showHomeEditVideoSubCoverCandidateModal,
  audioCoverCandidates: homeEditAudioCoverCandidates,
  videoCoverCandidates: homeEditVideoCoverCandidates,
  videoSubCoverCandidateItems: homeEditVideoSubCoverCandidateItems,
  basePathFormItemRef: homeEditBasePathFormItemRef,
  showSoftwareScriptModal: showHomeEditSoftwareScriptModal,
  softwareScriptDraft: homeEditSoftwareScriptDraft,
  softwareScriptRuntimePath: homeEditSoftwareScriptRuntimePath,
  categoryName: homeEditCategoryName,
  categorySettings: homeEditCategorySettings,
  isSoftwareCategory: homeEditIsSoftware,
  isVideoFolderCategory: homeEditIsVideoFolderCategory,
  detailIsAsmr: homeEditIsAsmr,
  websiteTypeOptions: homeEditWebsiteTypeOptions,
  normalizedLanguageList: homeDetailNormalizedLanguageList,
  showNotifyByType: showHomeEditNotifyByType,
  validateBasePathExtension: validateHomeEditBasePathExtension,
  getBasePathValidationMessage: getHomeEditBasePathValidationMessage,
  applyDefaultPathName: applyHomeEditDefaultPathName,
  applyAudioPathAnalysis: applyHomeEditAudioPathAnalysis,
  applyAudioCoverAnalysis: applyHomeEditAudioCoverAnalysis,
  applyGamePathAnalysis: applyHomeEditGamePathAnalysis,
  applyNovelFileAnalysis: applyHomeEditNovelFileAnalysis,
  applyMultiImageDirectoryAnalysis: applyHomeEditMultiImageDirectoryAnalysis,
  normalizeSelectedValues,
  normalizeWebsiteUrl,
  resolveCoverPreviewUrl: resolveHomeEditCoverPreviewUrl,
  formatAudioCoverCandidateQuery,
  ensureSoftwareScriptRuntimes: ensureHomeEditSoftwareScriptRuntimes,
  resolveSoftwareScriptShell: resolveHomeEditSoftwareScriptShell,
  denormalizeSoftwareScript: denormalizeHomeEditSoftwareScript
})

const {
  handleOpenSoftwareScriptModal: handleHomeEditorOpenSoftwareScript,
  handleFetchAlbumCover: handleHomeEditorFetchAlbumCover,
  handleUseScreenshotCover: handleHomeEditorUseScreenshotCover,
  handleUseVideoRandomFrameCover: handleHomeEditorUseVideoRandomFrameCover,
  handleUseFirstCover: handleHomeEditorUseFirstCover,
  handleChooseCustomCover: handleHomeEditorChooseCustomCover,
  handleFetchWebsiteCover: handleHomeEditorFetchWebsiteCover,
  handleChooseCoverFromScreenshotFolder: handleHomeEditorChooseCoverFromScreenshotFolder,
  handleClearCover: handleHomeEditorClearCover,
  handleSelectBasePath: handleHomeEditorSelectBasePath,
  handleFetchGameInfo: handleHomeEditorFetchGameInfo,
  handleFetchWebsiteInfo: handleHomeEditorFetchWebsiteInfo,
  handleCheckGameEngine: handleHomeEditorCheckGameEngine
} = homeEditAssistActions

const handleHomeEditAudioAuthorsUpdate = (value: string[]) => {
  syncHomeEditAudioAuthorFields(homeEditFormData.value, value)
}

const closeHomeEditAudioCoverCandidateModal = () => {
  showHomeEditAudioCoverCandidateModal.value = false
  homeEditAudioCoverCandidates.value = []
}

const handleUseHomeEditAudioCoverCandidate = (candidate: {
  coverPath?: string
  albumName?: string
}) => {
  homeEditFormData.value.coverPath = String(candidate?.coverPath ?? '').trim()
  const albumName = String(candidate?.albumName ?? '').trim()
  if (albumName) {
    homeEditFormData.value.meta = {
      ...(homeEditFormData.value.meta ?? {}),
      album: albumName
    }
  }
  closeHomeEditAudioCoverCandidateModal()
}

const closeHomeEditVideoCoverCandidateModal = () => {
  showHomeEditVideoCoverCandidateModal.value = false
  homeEditVideoCoverCandidates.value = []
}

const handleUseHomeEditVideoCoverCandidate = (coverPath: string) => {
  homeEditFormData.value.coverPath = String(coverPath ?? '').trim()
  closeHomeEditVideoCoverCandidateModal()
}

const closeHomeEditVideoSubCoverCandidateModal = () => {
  showHomeEditVideoSubCoverCandidateModal.value = false
  homeEditVideoSubCoverCandidateItems.value = []
}

const handleUseHomeEditVideoSubCoverCandidate = (coverPath: string) => {
  homeEditFormData.value.coverPath = String(coverPath ?? '').trim()
  closeHomeEditVideoSubCoverCandidateModal()
}

const homeEditFixedVideoCoverCandidates = computed(() =>
  homeEditVideoCoverCandidates.value.filter((candidate) => candidate.group === 'fixed')
)

const homeEditRandomVideoCoverCandidates = computed(() =>
  homeEditVideoCoverCandidates.value.filter((candidate) => candidate.group === 'random')
)

const handleHomeEditTagsChange = (value: string[]) => {
  homeEditFormData.value.tags = normalizeSelectedValues(value)
}

const handleHomeEditTypesChange = (value: string[]) => {
  homeEditFormData.value.types = normalizeSelectedValues(value)
}

const handleHomeEditReset = () => {
  homeEditFormData.value = createHomeEditorEmptyFormData()
}

const handleHomeEditRestoreDefault = () => {
  if (!homeEditInitialFormData.value) {
    return
  }

  homeEditFormData.value = cloneHomeEditFormData(homeEditInitialFormData.value)
}

const handleHomeEditSubmit = async () => {
  if (!homeEditingResourceId.value) {
    return
  }

  try {
    await homeEditFormRef.value?.validate?.()
  } catch {
    return
  }

  if (!validateHomeEditBasePathExtension(String(homeEditFormData.value?.basePath ?? ''))) {
    showNotifyByType('warning', `修改${homeEditCategoryName.value}`, getHomeEditBasePathValidationMessage())
    return
  }

  if (
    String(homeEditCategorySettings.value.extendTable ?? '').trim() === 'website_meta'
    && !normalizeWebsiteUrl(homeEditFormData.value?.meta?.website)
  ) {
    showNotifyByType('warning', `修改${homeEditCategoryName.value}`, '请填写网站地址')
    return
  }

  const payload = cloneHomeEditFormData(homeEditFormData.value)
  syncHomeEditAudioAuthorFields(payload)
  if (String(homeEditCategorySettings.value.extendTable ?? '').trim() === 'website_meta') {
    payload.meta = {
      ...(payload.meta ?? {}),
      website: normalizeWebsiteUrl(payload?.meta?.website)
    }
  }

  const result = await window.api.service.updateResource(homeEditingResourceId.value, payload)
  const resultType = result?.type ?? 'info'
  const resultMessage = result?.message ?? '操作完成'
  showNotifyByType(resultType as any, `修改${homeEditCategoryName.value}`, resultMessage)

  if (resultType !== 'error') {
    showHomeEditResourceDrawer.value = false
    homeEditInitialFormData.value = null
    if (homeDetailResource.value?.id === homeEditingResourceId.value) {
      const detailResult = await window.api.service.getResourceDetail(homeEditingResourceId.value)
      if (detailResult?.data) {
        homeDetailResource.value = detailResult.data
      }
    }
    void loadHomePinnedCards()
  }
}

function resolveDashboardCategorySettings(categoryInput: any) {
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

async function resolveHomeResourceContext(resourceIdInput: string, categoryIdInput?: string) {
  const resourceId = String(resourceIdInput ?? '').trim()
  const categoryId = String(categoryIdInput ?? '').trim()
  if (!resourceId) {
    return null
  }

  const [detailResult, categoryResult] = await Promise.all([
    window.api.service.getResourceDetail(resourceId),
    categoryId
      ? (categoryMap.value[categoryId]
        ? Promise.resolve(categoryMap.value[categoryId])
        : window.api.db.getCategoryById(categoryId))
      : Promise.resolve(null)
  ])

  const resource = detailResult?.data ?? detailResult
  if (!resource) {
    return null
  }

  const resolvedCategoryId = String(resource?.categoryId ?? categoryId).trim()
  const categorySource = await ensureDashboardCategorySource(
    resolvedCategoryId,
    categoryResult ?? categoryMap.value[resolvedCategoryId] ?? resource?.category ?? null
  )
  const categoryInfo = resolveDashboardCategorySettings(categorySource ?? {})
  const categoryProfile = resolveCategoryProfile(categoryInfo)

  return {
    resource,
    categorySource,
    categoryInfo,
    categoryProfile
  }
}

const startHomeReadingResource = async (resource: any, title: string) => {
  const resourceId = String(resource?.id ?? '').trim()
  if (!resourceId) {
    showNotifyByType('warning', title, '当前资源无效')
    return false
  }

  const result = await window.api.service.startReadingResource(resourceId)
  const resultType = result?.type ?? 'info'
  if (resultType === 'error' || resultType === 'warning') {
    showNotifyByType(resultType, title, result?.message ?? `${title}失败`)
    return false
  }

  return true
}

const openHomeSingleImageViewer = async (resource: any) => {
  const targetPath = getResourceFilePath(resource)
  if (!targetPath) {
    showNotifyByType('warning', '查看图片', '当前图片路径无效')
    return
  }

  const started = await startHomeReadingResource(resource, '开始浏览')
  if (!started) {
    return
  }

  homePictureViewerImagePaths.value = [targetPath]
  homePictureViewerResourceIds.value = [String(resource?.id ?? '')]
  homePictureViewerInitialIndex.value = 0
  homeCurrentPictureViewerResourceId.value = String(resource?.id ?? '')
  showHomePictureViewer.value = true
}

const openHomeComicReader = async (resource: any) => {
  const basePath = String(resource?.basePath ?? '').trim()
  const resourceId = String(resource?.id ?? '').trim()
  if (!basePath || !resourceId) {
    showNotifyByType('warning', '开始阅读', '当前漫画目录无效')
    return
  }

  const started = await startHomeReadingResource(resource, '开始阅读')
  if (!started) {
    return
  }

  const imagePaths = await window.api.dialog.getDirectoryImages(basePath)
  if (!Array.isArray(imagePaths) || !imagePaths.length) {
    showNotifyByType('warning', '开始阅读', '当前漫画目录没有可阅读图片')
    await window.api.service.stopResource(resourceId)
    return
  }

  homeComicReaderImagePaths.value = imagePaths
  homeComicReaderInitialIndex.value = await readComicProgress(resourceId)
  homeCurrentComicReaderResourceId.value = resourceId
  showHomeComicReader.value = true
}

const openHomeNovelReader = async (resource: any, categoryProfile: ReturnType<typeof resolveCategoryProfile>) => {
  const targetPath = getResourceFilePath(resource)
  const resourceId = String(resource?.id ?? '').trim()
  if (!targetPath || !resourceId) {
    showNotifyByType('warning', '开始阅读', '当前阅读文件无效')
    return
  }

  const started = await startHomeReadingResource(resource, '开始阅读')
  if (!started) {
    return
  }

  const initialProgress = await readNovelProgress(resourceId)
  const title = getHomeResourceTitle(resource, '开始阅读')
  const fileExtension = getFileExtension(targetPath)

  if (categoryProfile.flags.isNovel && !['pdf', 'epub', 'mobi', 'azw', 'azw3'].includes(fileExtension)) {
    homeTextReaderFilePath.value = targetPath
    homeTextReaderTitle.value = title
    homeTextReaderInitialProgress.value = initialProgress
    homeCurrentTextReaderResourceId.value = resourceId
    showHomeTextReader.value = true
    return
  }

  if (fileExtension === 'pdf') {
    homePdfReaderFilePath.value = targetPath
    homePdfReaderTitle.value = title
    homePdfReaderInitialProgress.value = initialProgress
    homeCurrentPdfReaderResourceId.value = resourceId
    showHomePdfReader.value = true
    return
  }

  if (fileExtension === 'epub') {
    homeEpubReaderFilePath.value = targetPath
    homeEpubReaderTitle.value = title
    homeEpubReaderInitialProgress.value = initialProgress
    homeCurrentEpubReaderResourceId.value = resourceId
    showHomeEpubReader.value = true
    return
  }

  if (['mobi', 'azw', 'azw3'].includes(fileExtension)) {
    homeEbookReaderFilePath.value = targetPath
    homeEbookReaderTitle.value = title
    homeEbookReaderInitialProgress.value = initialProgress
    homeCurrentEbookReaderResourceId.value = resourceId
    showHomeEbookReader.value = true
    return
  }

  await window.api.service.stopResource(resourceId)
  showNotifyByType('warning', '开始阅读', '当前资源没有匹配的阅读器')
}

const openHomeAudioPlayback = async (resource: any, categoryProfile: ReturnType<typeof resolveCategoryProfile>) => {
  const resourceId = String(resource?.id ?? '').trim()

  if (categoryProfile.flags.isAsmr) {
    const basePath = String(resource?.basePath ?? '').trim()
    if (!basePath || !resourceId) {
      showNotifyByType('warning', '播放音频', '当前音声目录无效')
      return
    }

    const audioTree = await resolveHomeResourceAudioTree(resource)
    const allTracks = collectAudioTreeTracks(audioTree)
      .map((track) => ({
        ...track,
        resourceId,
        resourceTitle: getHomeResourceTitle(resource, '音频播放器')
      }))
      .filter((track) => String(track.path ?? '').trim())

    if (!allTracks.length) {
      showNotifyByType('warning', '播放音频', '当前没有可播放的音频文件')
      return
    }

    const lastPlayFile = String(resource?.asmrMeta?.lastPlayFile ?? '').trim()
    const lastPlayTime = Math.max(0, Number(resource?.asmrMeta?.lastPlayTime ?? 0))
    const normalizedLastPlayFile = normalizeAudioPath(lastPlayFile)
    const resumeTrack = normalizedLastPlayFile
      ? allTracks.find((track) => normalizeAudioPath(track.path) === normalizedLastPlayFile)
      : null

    await applyHomeAudioPlayerSession(
      resource,
      allTracks,
      String(resumeTrack?.path ?? allTracks[0]?.path ?? ''),
      resumeTrack ? lastPlayTime : 0
    )
    return
  }

  const targetPath = getResourceFilePath(resource)
  if (!targetPath) {
    showNotifyByType('warning', '播放音频', '当前音乐路径无效')
    return
  }

  await applyHomeAudioPlayerSession(
    resource,
    [{
      path: targetPath,
      label: getFileNameWithoutExtension(targetPath) || getHomeResourceTitle(resource, '当前音乐'),
      resourceId,
      resourceTitle: getHomeResourceTitle(resource, '当前音乐'),
      artist: String(resource?.audioMeta?.artist ?? '').trim()
    }],
    targetPath,
    Math.max(0, Number(resource?.audioMeta?.lastPlayTime ?? 0))
  )
}

const openHomeVideoPlayback = async (resource: any, categoryProfile: ReturnType<typeof resolveCategoryProfile>) => {
  const resourceId = String(resource?.id ?? '').trim()
  const title = getHomeResourceTitle(resource, '视频播放')
  const shouldUseVideoFolderMode = categoryProfile.flags.isVideoFolder || getHomeDetailVideoSubItems(resource).length > 0

  if (shouldUseVideoFolderMode) {
    const basePath = String(resource?.basePath ?? '').trim()
    if (!basePath || !resourceId) {
      showNotifyByType('warning', '播放视频', '当前视频目录无效')
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

    const audioTree = await resolveHomeResourceAudioTree(playbackResource)
    const playlist = sortHomeVideoTracksBySubItems(collectVideoTreeTracks(audioTree, playbackResource), playbackResource)
    if (!playlist.length) {
      showNotifyByType('warning', '播放视频', '当前没有可播放的视频文件')
      return
    }

    const lastPlayFile = String(playbackResource?.videoMeta?.lastPlayFile ?? '').trim().replace(/\\/g, '/')
    const resumeTrack = lastPlayFile
      ? playlist.find((track) => String(track.path ?? '').replace(/\\/g, '/') === lastPlayFile)
      : null

    homeVideoPlayerPlaylist.value = playlist
    homeVideoPlayerInitialPath.value = String(resumeTrack?.path ?? playlist[0]?.path ?? '')
    homeVideoPlayerInitialTime.value = resumeTrack ? Math.max(0, Number(playbackResource?.videoMeta?.lastPlayTime ?? 0)) : 0
    homeVideoPlayerTitle.value = getHomeResourceTitle(playbackResource, title)
    showHomeVideoPlayer.value = true
    return
  }

  const targetPath = getResourceFilePath(resource)
  if (!targetPath) {
    showNotifyByType('warning', '播放视频', '当前视频路径无效')
    return
  }

  homeVideoPlayerPlaylist.value = [{
    path: targetPath,
    label: getFileNameWithoutExtension(targetPath) || title,
    resourceId,
    resourceTitle: title
  }]
  homeVideoPlayerInitialPath.value = targetPath
  homeVideoPlayerInitialTime.value = Math.max(0, Number(resource?.videoMeta?.lastPlayTime ?? 0))
  homeVideoPlayerTitle.value = title
  showHomeVideoPlayer.value = true
}

const openHomeAudioTreeAudioPlayer = async (targetPath: string) => {
  const resource = homeDetailResource.value
  const normalizedPath = String(targetPath ?? '').trim()
  if (!resource || !normalizedPath) {
    return
  }

  const allTracks = collectAudioTreeTracks(homeDetailAudioTree.value)
    .map((track) => ({
      ...track,
      resourceId: String(resource?.id ?? ''),
      resourceTitle: getHomeResourceTitle(resource, '音频播放器')
    }))
    .filter((track) => String(track.path ?? '').trim())
  if (!allTracks.length) {
    showNotifyByType('warning', '播放音频', '当前没有可播放的音频文件')
    return
  }

  const targetDirectory = normalizedPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
  const directoryTracks = allTracks.filter((track) => String(track.path ?? '').replace(/\\/g, '/').split('/').slice(0, -1).join('/') === targetDirectory)
  const playlist = directoryTracks.length ? directoryTracks : allTracks
  await applyHomeAudioPlayerSession(resource, playlist, normalizedPath, 0)
}

const openHomeAudioTreeVideoPlayer = async (targetPath: string) => {
  const resource = homeDetailResource.value
  const normalizedPath = String(targetPath ?? '').trim()
  if (!resource || !normalizedPath) {
    return
  }

  const allTracks = sortHomeVideoTracksBySubItems(
    collectVideoTreeTracks(homeDetailAudioTree.value, resource),
    resource
  )
  if (!allTracks.length) {
    showNotifyByType('warning', '播放视频', '当前没有可播放的视频文件')
    return
  }

  const targetDirectory = normalizedPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
  const directoryTracks = allTracks.filter((track) => String(track.path ?? '').replace(/\\/g, '/').split('/').slice(0, -1).join('/') === targetDirectory)
  const playlist = directoryTracks.length ? directoryTracks : allTracks
  const normalizedTargetPath = normalizedPath.replace(/\\/g, '/')
  const matchedTrack = playlist.find((track) => String(track.path ?? '').replace(/\\/g, '/') === normalizedTargetPath)
  const lastPlayFile = String(resource?.videoMeta?.lastPlayFile ?? '').trim().replace(/\\/g, '/')

  homeVideoPlayerPlaylist.value = playlist
  homeVideoPlayerInitialPath.value = matchedTrack?.path ?? normalizedPath
  homeVideoPlayerInitialTime.value = lastPlayFile && lastPlayFile === String(matchedTrack?.path ?? normalizedPath).replace(/\\/g, '/')
    ? Math.max(0, Number(resource?.videoMeta?.lastPlayTime ?? 0))
    : 0
  homeVideoPlayerTitle.value = getHomeResourceTitle(resource, '视频播放')
  showHomeVideoPlayer.value = true
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

  const imagePaths = collectAudioTreeImagePaths(homeDetailAudioTree.value)
  if (!imagePaths.length) {
    return
  }

  const initialIndex = imagePaths.findIndex((item) => normalizePathValue(item) === normalizePathValue(normalizedPath))
  homePictureViewerImagePaths.value = imagePaths
  homePictureViewerResourceIds.value = imagePaths.map(() => String(homeDetailResource.value?.id ?? ''))
  homePictureViewerInitialIndex.value = initialIndex >= 0 ? initialIndex : 0
  homeCurrentPictureViewerResourceId.value = String(homeDetailResource.value?.id ?? '')
  showHomePictureViewer.value = true
}

const {
  closeDetailAudioContextMenu: closeHomeDetailAudioContextMenu,
  handleOpenAudioTreeContextMenu: handleHomeOpenAudioTreeContextMenu,
  detailAudioContextMenuOptions: homeDetailAudioContextMenuOptions,
  detailAudioContextMenuPosition: homeDetailAudioContextMenuPosition,
  handleSelectDetailAudioContextMenu: handleHomeSelectDetailAudioContextMenu
} = useCategoryDetailAudioContextMenu({
  detailAudioContextMenuVisible: homeDetailAudioContextMenuVisible,
  detailAudioContextMenuX: homeDetailAudioContextMenuX,
  detailAudioContextMenuY: homeDetailAudioContextMenuY,
  detailAudioContextMenuTarget: homeDetailAudioContextMenuTarget,
  formatAsmrDuration,
  formatAudioBitrate,
  formatAudioSampleRate,
  formatFrameRate,
  formatImageResolution,
  handleOpenAudioTreeImage: handleHomeOpenAudioTreeImage,
  handleAudioTreePlay: handleHomeAudioTreePlay,
  showNotifyByType: (type, title, content) =>
    showNotifyByType(type as 'success' | 'error' | 'info' | 'warning', title, content)
})

const {
  videoOrderResource: homeVideoOrderResource,
  videoOrderItems: homeVideoOrderItems,
  isVideoOrderSubmitting: isHomeVideoOrderSubmitting,
  videoOrderDragIndex: homeVideoOrderDragIndex,
  videoOrderDragOverIndex: homeVideoOrderDragOverIndex,
  resetVideoOrderDialog: resetHomeVideoOrderDialog,
  handleResetVideoOrderItems: handleResetHomeVideoOrderItems,
  isVideoOrderItemChanged: isHomeVideoOrderItemChanged,
  moveVideoOrderItem: moveHomeVideoOrderItem,
  handleVideoOrderDragStart: handleHomeVideoOrderDragStart,
  handleVideoOrderDragEnter: handleHomeVideoOrderDragEnter,
  handleVideoOrderDrop: handleHomeVideoOrderDrop,
  handleVideoOrderDragEnd: handleHomeVideoOrderDragEnd,
  handleOpenVideoOrderDialog: openHomeVideoOrderDialog,
  handleSubmitVideoOrder: handleSubmitHomeVideoOrder
} = useCategoryVideoOrderDialog({
  showVideoOrderModal: showHomeVideoOrderModal,
  showDetailDrawer: showHomeDetailDrawer,
  selectedDetailResource: homeDetailResource,
  fetchData: async () => {},
  getDetailVideoSubItems: getHomeDetailVideoSubItems,
  scheduleVideoSubCoverPreviewRefresh: scheduleHomeVideoSubCoverPreviewRefresh,
  refreshVideoSubCoverPreviewUrls: refreshHomeVideoSubCoverPreviewUrls,
  refreshDetailAudioTree: refreshHomeDetailAudioTree,
  showNotifyByType: (type, title, content) =>
    showNotifyByType(type as 'success' | 'error' | 'info' | 'warning', title, content),
  compareByFileName
})

const launchHomePinnedResource = async (item: HomePinnedCard) => {
  const resourceId = String(item?.id ?? '').trim()
  const categoryId = String(item?.categoryId ?? '').trim()
  if (!resourceId || !categoryId || homePinnedLaunchingId.value === resourceId) {
    return
  }

  homePinnedLaunchingId.value = resourceId
  try {
    const [detailResult, categoryResult] = await Promise.all([
      window.api.service.getResourceDetail(resourceId),
      categoryMap.value[categoryId]
        ? Promise.resolve(categoryMap.value[categoryId])
        : window.api.db.getCategoryById(categoryId)
    ])

    const resource = detailResult?.data ?? detailResult
    if (!resource) {
      notify('error', '首页固定', '未能读取资源详情')
      return
    }

    const categoryInfo = resolveDashboardCategorySettings(categoryResult ?? {})
    const categoryProfile = resolveCategoryProfile(categoryInfo)
    await openHomeResourceByCategoryProfile(resource, categoryProfile)
  } catch (error) {
    notify('error', '首页固定', error instanceof Error ? error.message : '打开资源失败')
  } finally {
    homePinnedLaunchingId.value = ''
  }
}

const handleRemoveHomePin = async (item: HomePinnedCard) => {
  const resourceId = String(item?.id ?? '').trim()
  if (!resourceId || homePinnedDeletingId.value === resourceId) {
    return
  }

  homePinnedDeletingId.value = resourceId
  try {
    const result = await window.api.service.updateResourceHomePin(resourceId, false)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'
    notify(resultType, '取消首页固定', resultMessage)

    if (resultType !== 'error') {
      await loadHomePinnedCards()
    }
  } catch (error) {
    notify('error', '取消首页固定', error instanceof Error ? error.message : '移除失败')
  } finally {
    homePinnedDeletingId.value = ''
  }
}

const moveHomePinnedPage = (direction: -1 | 1) => {
  const nextPage = homePinnedPage.value + direction
  if (nextPage < 0 || nextPage >= homePinnedPageCount.value) {
    return
  }

  homePinnedPage.value = nextPage
}

const selectHomePinnedPage = (pageIndex: number) => {
  if (pageIndex < 0 || pageIndex >= homePinnedPageCount.value) {
    return
  }

  homePinnedPage.value = pageIndex
}

const handleHomePinnedAdd = () => {
  notify('info', '首页固定', '在推荐区、继续使用或资源详情里右键选择固定到首页')
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
  showHomePictureViewer.value = visible
  if (!visible && homeCurrentPictureViewerResourceId.value) {
    const currentId = homeCurrentPictureViewerResourceId.value
    homeCurrentPictureViewerResourceId.value = ''
    await stopHomeResourceSession(currentId)
  }
}

const handleHomeComicReaderShowUpdate = async (visible: boolean) => {
  showHomeComicReader.value = visible
  if (!visible && homeCurrentComicReaderResourceId.value) {
    const currentId = homeCurrentComicReaderResourceId.value
    homeCurrentComicReaderResourceId.value = ''
    await stopHomeResourceSession(currentId)
  }
}

const handleHomeComicReaderPageChange = async (index: number) => {
  homeComicReaderInitialIndex.value = Math.max(0, Math.floor(Number(index ?? 0)))
  if (homeCurrentComicReaderResourceId.value) {
    try {
      await window.api.service.updateMultiImageReadingProgress(homeCurrentComicReaderResourceId.value, homeComicReaderInitialIndex.value)
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
    await window.api.service.updateNovelReadingProgress(normalizedResourceId, Math.max(0, Math.min(1, Number(progress ?? 0))))
  } catch {
    // ignore progress persistence failure
  }
}

const handleHomeTextReaderProgressChange = (progress: number) => {
  homeTextReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progress ?? 0)))
  void persistHomeNovelProgress(homeCurrentTextReaderResourceId.value, homeTextReaderInitialProgress.value)
}

const handleHomePdfReaderProgressChange = (progress: number) => {
  homePdfReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progress ?? 0)))
  void persistHomeNovelProgress(homeCurrentPdfReaderResourceId.value, homePdfReaderInitialProgress.value)
}

const handleHomeEpubReaderProgressChange = (progress: number) => {
  homeEpubReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progress ?? 0)))
  void persistHomeNovelProgress(homeCurrentEpubReaderResourceId.value, homeEpubReaderInitialProgress.value)
}

const handleHomeEbookReaderProgressChange = (progress: number) => {
  homeEbookReaderInitialProgress.value = Math.max(0, Math.min(1, Number(progress ?? 0)))
  void persistHomeNovelProgress(homeCurrentEbookReaderResourceId.value, homeEbookReaderInitialProgress.value)
}

const handleHomeTextReaderShowUpdate = async (visible: boolean) => {
  showHomeTextReader.value = visible
  if (!visible && homeCurrentTextReaderResourceId.value) {
    const currentId = homeCurrentTextReaderResourceId.value
    homeCurrentTextReaderResourceId.value = ''
    await stopHomeResourceSession(currentId)
  }
}

const handleHomePdfReaderShowUpdate = async (visible: boolean) => {
  showHomePdfReader.value = visible
  if (!visible && homeCurrentPdfReaderResourceId.value) {
    const currentId = homeCurrentPdfReaderResourceId.value
    homeCurrentPdfReaderResourceId.value = ''
    await stopHomeResourceSession(currentId)
  }
}

const handleHomeEpubReaderShowUpdate = async (visible: boolean) => {
  showHomeEpubReader.value = visible
  if (!visible && homeCurrentEpubReaderResourceId.value) {
    const currentId = homeCurrentEpubReaderResourceId.value
    homeCurrentEpubReaderResourceId.value = ''
    await stopHomeResourceSession(currentId)
  }
}

const handleHomeEbookReaderShowUpdate = async (visible: boolean) => {
  showHomeEbookReader.value = visible
  if (!visible && homeCurrentEbookReaderResourceId.value) {
    const currentId = homeCurrentEbookReaderResourceId.value
    homeCurrentEbookReaderResourceId.value = ''
    await stopHomeResourceSession(currentId)
  }
}

watch(
  () => coverWallSearchKeyword.value,
  () => {
    coverWallHoverState.value = null
    if (coverWallSearchTimer != null) {
      clearTimeout(coverWallSearchTimer)
    }
    coverWallSearchTimer = window.setTimeout(() => {
      coverWallSearchTimer = null
      resetCoverWallPageState(coverWallActiveFilter.value)
      void loadCoverWallPage(coverWallActiveFilter.value, true)
    }, 220)
  }
)

watch(
  () => [
    coverWallLoading.value,
    coverWallActiveFilter.value,
    currentCoverWallPageState.value.hasMore,
    currentCoverWallPageState.value.loading,
    displayedCoverWallItems.value.length
  ],
  () => {
    setupCoverWallLoadMoreObserver()
  }
)

onMounted(() => {
  dashboardDisposed = false
  emitRendererTiming('dashboard lifecycle', {
    phase: 'mounted'
  })
  void loadHomePinnedCards()
  void loadDashboardStats()
  scheduleDashboardDeferredTask('categoryOverview', 180, loadCategoryOverview)
  scheduleDashboardDeferredTask('continueLogs', 320, loadContinueLogs)
  scheduleDashboardDeferredTask('activityHeatmap', 520, loadActivityHeatmap)
  scheduleDashboardDeferredTask('analysisCharts', 620, loadAnalysisCharts)
  scheduleDashboardDeferredTask('coverWallData', 760, loadCoverWallData)
  scheduleDashboardDeferredTask('recentFeeds', 1800, loadRecentFeeds)
  scheduleDashboardDeferredTask('nextPlayCards', 2400, () => loadNextPlayCards())
  requestAnimationFrame(() => {
    updateHeatmapSizing()
    bindCoverWallStickyEvents()
    if (heatmapFrameRef.value) {
      heatmapResizeObserver = new ResizeObserver(updateHeatmapSizing)
      heatmapResizeObserver.observe(heatmapFrameRef.value)
    }
  })
})

onBeforeUnmount(() => {
  dashboardDisposed = true
  emitRendererTiming('dashboard lifecycle', {
    phase: 'beforeUnmount',
    pendingDeferredTaskCount: scheduledDashboardTaskTimers.length
  })
  while (scheduledDashboardTaskTimers.length) {
    const timer = scheduledDashboardTaskTimers.pop()
    if (timer != null) {
      clearTimeout(timer)
    }
  }
  const perf = (window as any).__nrmCategoryRoutePerf
  if (perf && String(perf.from ?? '').includes('/')) {
    emitRendererTiming('dashboard route exit', {
      to: String(perf.to ?? ''),
      categoryId: String(perf.categoryId ?? ''),
      elapsedMs: Math.round(performance.now() - Number(perf.startedAt ?? 0))
    })
  }
  heatmapResizeObserver?.disconnect()
  heatmapResizeObserver = null
  coverWallLoadMoreObserver?.disconnect()
  coverWallLoadMoreObserver = null
  if (coverWallSearchTimer != null) {
    clearTimeout(coverWallSearchTimer)
    coverWallSearchTimer = null
  }
  clearCoverWallHoverTimers()
  unbindCoverWallStickyEvents()
})
</script>

<template>
  <div class="home-page">
    <section class="hero-card">
      <div class="hero-card__left">
        <h1>欢迎使用Neo Resource Manager，当前版本 v{{ appVersion }}</h1>
        <div class="resource-overview">
          <div class="section-eyebrow">资源概览</div>
          <div class="chip-row">
            <span v-if="categoryOverviewLoading" class="soft-chip tone-slate">读取中</span>
            <span v-else-if="!categoryOverview.length" class="soft-chip tone-slate">暂无分类</span>
            <template v-else>
              <button
                v-for="chip in categoryOverview"
                :key="chip.id"
                class="soft-chip"
                type="button"
                :class="toneClass(chip.tone)"
                :style="{ color: chip.color, backgroundColor: chip.backgroundColor }"
                @click="handleCategoryPillClick(chip.routeId)"
              >
                <span class="soft-chip__emoji" aria-hidden="true">{{ chip.emoji }}</span>
                <span>{{ chip.label }}</span>
              </button>
            </template>
          </div>
        </div>
        <form class="hero-search" @submit.prevent="handleSearch">
          <label class="hero-search__field">
            <span class="hero-search__dot"></span>
            <input v-model="searchKeyword" type="search" placeholder="搜索功能开发中" disabled />
          </label>
          <button class="hero-search__button hero-search__button--primary" type="submit" disabled>搜索</button>
        </form>
      </div>

      <aside class="hero-feed">
        <h2>最近添加的资源</h2>
        <div class="hero-feed__list">
          <article v-if="recentFeedsLoading" class="feed-item feed-item--empty">
            <strong>读取中</strong>
            <span>正在查询最近一周添加的资源</span>
          </article>
          <article v-else-if="!recentFeeds.length" class="feed-item feed-item--empty">
            <strong>最近没有收到好资源么</strong>
            <span>( ´･ω･` )</span>
          </article>
          <template v-else>
            <button
              v-for="feed in recentFeeds"
              :key="feed.id"
              class="feed-item feed-item--button"
              type="button"
              :style="getRecentFeedStyle(feed)"
              @click="handleRecentFeedClick(feed)"
            >
              <strong>{{ feed.title }}</strong>
              <span>{{ feed.meta }}</span>
            </button>
          </template>
        </div>
      </aside>
    </section>

    <section class="stats-grid" aria-label="资源统计">
      <article v-for="stat in stats" :key="stat.label" class="stat-card">
        <span>{{ stat.label }}</span>
        <strong>{{ stat.value }}</strong>
      </article>
    </section>

    <section class="body-row">
      <div class="continue-panel">
        <div class="continue-panel__header">
          <h2>继续使用</h2>
        </div>
        <div v-if="continueLogsLoading && !continueCards.length" class="continue-empty">正在读取启动日志</div>
        <div v-else-if="!continueCards.length" class="continue-empty">还没有启动记录</div>
        <template v-else>
          <button
            v-if="continueRailShowBackButton"
            type="button"
            class="continue-rail__back-button"
            aria-label="回到最左侧"
            @click="scrollContinueRailToStart"
          >
            <n-icon :component="ChevronBackOutline" />
          </button>
          <div
            ref="continueRailRef"
            class="continue-rail"
            @scroll.passive="handleContinueRailScroll"
            @wheel="handleContinueRailWheel"
          >
            <n-timeline horizontal size="large" class="continue-timeline">
              <n-timeline-item
                v-for="(card, index) in continueCards"
                :key="`${card.id}-${card.time}-${index}`"
                :color="getContinueCardColor(card)"
                class="continue-timeline__item"
              >
                <article
                  class="continue-card"
                  :style="getContinueCardStyle(card)"
                  tabindex="0"
                  role="button"
                  @click="openContinueCard(card)"
                  @keydown="handleContinueCardKeydown($event, card)"
                >
                  <span class="continue-card__time">{{ card.time }}</span>
                  <h3>{{ card.title }}</h3>
                  <p>{{ card.type }}</p>
                  <small class="continue-card__launch-mode">{{ card.launchModeLabel }}</small>
                  <strong>{{ card.state }}</strong>
                  <small>{{ card.note }}</small>
                  <n-button
                    size="small"
                    secondary
                    :color="getContinueCardColor(card)"
                    class="continue-card__action-button"
                    :loading="continueLaunchingId === card.id"
                    @click.stop="launchContinueCard(card)"
                  >
                    {{ card.action }}
                  </n-button>
                </article>
              </n-timeline-item>
            </n-timeline>
            <div v-if="continueLogsLoading" class="continue-rail__status">加载中</div>
          </div>
        </template>
      </div>

      <aside class="queue-panel">
        <div class="queue-panel__header">
          <h2>首页固定</h2>
          <button type="button" class="queue-panel__action" @click="handleHomePinnedAdd">
            添加固定
          </button>
        </div>
        <div v-if="homePinnedCards.length" class="queue-panel__pager">
          <button
            type="button"
            class="queue-panel__pager-button"
            :disabled="!canMoveHomePinnedPrev"
            @click="moveHomePinnedPage(-1)"
          >
            ‹
          </button>
          <div class="queue-panel__dots" aria-label="首页固定分页">
            <button
              v-for="pageIndex in homePinnedPageDots"
              :key="pageIndex"
              type="button"
              class="queue-panel__dot"
              :class="{ 'queue-panel__dot--active': pageIndex === homePinnedPage }"
              :aria-label="`第 ${pageIndex + 1} 页`"
              :aria-current="pageIndex === homePinnedPage ? 'true' : undefined"
              @click="selectHomePinnedPage(pageIndex)"
            />
          </div>
          <button
            type="button"
            class="queue-panel__pager-button"
            :disabled="!canMoveHomePinnedNext"
            @click="moveHomePinnedPage(1)"
          >
            ›
          </button>
        </div>
        <article v-if="homePinnedLoading && !homePinnedCards.length" class="queue-item queue-item--empty">
          <strong>读取中</strong>
          <span>正在整理首页固定内容</span>
        </article>
        <div v-else-if="!homePinnedCards.length" class="queue-empty-state">
          <div class="queue-empty-state__icon" aria-hidden="true">
            <span class="queue-empty-state__icon-dot queue-empty-state__icon-dot--active"></span>
            <span class="queue-empty-state__icon-dot"></span>
            <span class="queue-empty-state__icon-dot"></span>
            <span class="queue-empty-state__icon-dot"></span>
          </div>
          <strong>还没有固定资源</strong>
          <p>把常用的游戏、音声或网站固定到首页，之后打开应用就能更快使用它们。</p>
          <button type="button" class="queue-empty-state__action" @click="handleHomePinnedAdd">
            添加第一个资源
          </button>
        </div>
        <div v-else class="queue-pinned-grid">
          <article
            v-for="item in visibleHomePinnedCards"
            :key="item.id"
            class="queue-pinned-card"
            :style="getHomePinnedCardStyle(item)"
            @click="openHomePinnedCard(item)"
            @keydown="handleHomePinnedCardKeydown($event, item)"
            tabindex="0"
            role="button"
          >
            <strong>{{ item.title }}</strong>
            <small>{{ item.categoryEmoji }} {{ item.meta }}</small>
            <div class="queue-pinned-card__actions">
              <n-button-group size="tiny">
                <n-popconfirm
                  positive-text="移除"
                  negative-text="取消"
                  :positive-button-props="{ type: 'error' }"
                  @positive-click.stop="handleRemoveHomePin(item)"
                >
                  <template #trigger>
                    <n-button
                      secondary
                      :loading="homePinnedDeletingId === item.id"
                      :disabled="homePinnedLaunchingId === item.id"
                      @click.stop
                    >
                      移除
                    </n-button>
                  </template>
                  确认取消固定该资源吗
                </n-popconfirm>
                <n-button
                  type="primary"
                  secondary
                  :loading="homePinnedLaunchingId === item.id"
                  :disabled="homePinnedDeletingId === item.id"
                  @click.stop="launchHomePinnedResource(item)"
                >
                  打开
                </n-button>
              </n-button-group>
            </div>
          </article>
        </div>
      </aside>
    </section>

    <section class="next-play-section">
      <header class="next-play-section__header">
        <h2>接下来看看</h2>
        <button type="button" class="next-play-section__swap" @click="rotateNextPlayCards">
          换一组
        </button>
      </header>
      <div v-if="nextPlayLoading && !nextPlayVisible.length" class="next-play-empty">
        正在整理下一批想玩的资源
      </div>
      <div v-else-if="!nextPlayHero" class="next-play-empty">
        暂无推荐_(:з)∠)_
      </div>
      <div v-else-if="nextPlayHero" class="next-play-layout">
        <article
          class="next-play-hero"
          :style="getNextPlayCardStyle(nextPlayHero)"
          @click="openHomeDetailDrawer(nextPlayHero)"
        >
          <div class="next-play-hero__surface">
            <small class="next-play-hero__meta">
              {{ nextPlayHero.categoryEmoji }} {{ nextPlayHero.categoryName }}
            </small>
            <div class="next-play-card__copy">
              <strong>{{ nextPlayHero.title }}</strong>
              <small>{{ nextPlayHero.reason }}</small>
            </div>
            <button
              type="button"
              class="next-play-hero__action next-play-hero__action--primary"
              :disabled="nextPlayLaunchingId === nextPlayHero.id"
              @click.stop="launchNextPlayResource(nextPlayHero)"
            >
              {{ nextPlayLaunchingId === nextPlayHero.id ? '打开中' : getNextPlayActionLabel(nextPlayHero.categoryName) }}
            </button>
          </div>
        </article>
        <div class="next-play-mini-grid">
          <button
            v-for="item in nextPlayMiniCards"
            :key="item.id"
            type="button"
            class="next-play-mini-card"
            :style="getNextPlayCardStyle(item)"
            @click="promoteNextPlayCard(item.id)"
          >
            <small>{{ item.categoryEmoji }} {{ item.categoryName }}</small>
            <strong>{{ item.title }}</strong>
          </button>
        </div>
      </div>
      <div v-else class="next-play-empty">
        暂无推荐_(:з)∠)_
      </div>
    </section>

    <section class="analysis-section">
      <header class="analysis-section__header">
        <div>
          <h2>资源分析</h2>
          <p>活跃趋势与资源结构</p>
        </div>
      </header>

      <div class="analysis-section__body">
        <section class="heatmap-card">
          <header class="heatmap-header">
            <div class="heatmap-copy">
              <h2>活跃热力图</h2>
              <p>{{ activityHeatmapLoading ? '正在读取一年内启动日志' : heatmapSubtitle }}</p>
            </div>
            <div class="heatmap-range" role="tablist" aria-label="热力图区间">
              <button
                type="button"
                class="heatmap-range__pill"
                :class="{ 'heatmap-range__pill--active': heatmapRangeDays === 365 }"
                :aria-selected="heatmapRangeDays === 365"
                @click="heatmapRangeDays = 365"
              >
                近一年
              </button>
              <button
                type="button"
                class="heatmap-range__pill"
                :class="{ 'heatmap-range__pill--active': heatmapRangeDays === 84 }"
                :aria-selected="heatmapRangeDays === 84"
                @click="heatmapRangeDays = 84"
              >
                12 周
              </button>
              <button
                type="button"
                class="heatmap-range__pill"
                :class="{ 'heatmap-range__pill--active': heatmapRangeDays === 30 }"
                :aria-selected="heatmapRangeDays === 30"
                @click="heatmapRangeDays = 30"
              >
                30 天
              </button>
            </div>
          </header>
          <div class="heatmap-body">
            <aside class="heatmap-stats" :class="{ 'heatmap-stats--animating': activityHeatmapLoading }" aria-label="热力图基础摘要">
              <article class="heatmap-stat-card">
                <span>本周启动</span>
                <transition name="heatmap-value" mode="out-in">
                  <strong :key="`week-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : heatmapWeekLaunchCount}`">
                    {{ activityHeatmapLoading ? '读取中' : `${formatNumber(heatmapWeekLaunchCount)} 次` }}
                  </strong>
                </transition>
              </article>
              <article class="heatmap-stat-card heatmap-stat-card--mint">
                <span>连续活跃</span>
                <transition name="heatmap-value" mode="out-in">
                  <strong :key="`streak-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : heatmapActiveStreak}`">
                    {{ activityHeatmapLoading ? '读取中' : `${formatNumber(heatmapActiveStreak)} 天` }}
                  </strong>
                </transition>
              </article>
              <article class="heatmap-stat-card heatmap-stat-card--blue">
                <span>峰值日</span>
                <transition name="heatmap-value" mode="out-in">
                  <strong :key="`peak-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : heatmapPeakDayLabel}`">
                    {{ activityHeatmapLoading ? '读取中' : heatmapPeakDayLabel }}
                  </strong>
                </transition>
              </article>
            </aside>
            <div ref="heatmapFrameRef" class="activity-heatmap-frame" :class="{ 'activity-heatmap-frame--animating': activityHeatmapLoading }">
              <transition name="heatmap-surface" mode="out-in">
                <DashboardHeatmap
                  :key="`heatmap-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : activityHeatmap.length}`"
                  class="activity-heatmap"
                  :days="activityHeatmap"
                  :loading="activityHeatmapLoading"
                  :range-days="heatmapRangeDays"
                  :rect-size="heatmapRectSize"
                  :gap-size="heatmapGapSize"
                  :dark="isDark"
                />
              </transition>
            </div>
            <aside class="heatmap-stats heatmap-stats--insights" :class="{ 'heatmap-stats--animating': activityHeatmapLoading }" aria-label="热力图分析摘要">
              <article class="heatmap-stat-card">
                <span>最活跃时段</span>
                <transition name="heatmap-value" mode="out-in">
                  <strong :key="`hour-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : activityHeatmapSummary.mostActiveHour}`">
                    {{ activityHeatmapLoading ? '读取中' : activityHeatmapSummary.mostActiveHour }}
                  </strong>
                </transition>
              </article>
              <article class="heatmap-stat-card heatmap-stat-card--mint">
                <span>最活跃星期</span>
                <transition name="heatmap-value" mode="out-in">
                  <strong :key="`weekday-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : activityHeatmapSummary.mostActiveWeekday}`">
                    {{ activityHeatmapLoading ? '读取中' : activityHeatmapSummary.mostActiveWeekday }}
                  </strong>
                </transition>
              </article>
              <article class="heatmap-stat-card heatmap-stat-card--blue">
                <span>常用类型</span>
                <transition name="heatmap-value" mode="out-in">
                  <strong :key="`type-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : activityHeatmapSummary.mostUsedCategory}`">
                    {{ activityHeatmapLoading ? '读取中' : activityHeatmapSummary.mostUsedCategory }}
                  </strong>
                </transition>
              </article>
            </aside>
          </div>
          <div class="heatmap-stats heatmap-stats--merged" :class="{ 'heatmap-stats--animating': activityHeatmapLoading }" aria-label="热力图汇总摘要">
            <article class="heatmap-stat-card">
              <span>本周启动</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`merged-week-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : heatmapWeekLaunchCount}`">
                  {{ activityHeatmapLoading ? '读取中' : `${formatNumber(heatmapWeekLaunchCount)} 次` }}
                </strong>
              </transition>
            </article>
            <article class="heatmap-stat-card heatmap-stat-card--mint">
              <span>连续活跃</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`merged-streak-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : heatmapActiveStreak}`">
                  {{ activityHeatmapLoading ? '读取中' : `${formatNumber(heatmapActiveStreak)} 天` }}
                </strong>
              </transition>
            </article>
            <article class="heatmap-stat-card heatmap-stat-card--blue">
              <span>峰值日</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`merged-peak-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : heatmapPeakDayLabel}`">
                  {{ activityHeatmapLoading ? '读取中' : heatmapPeakDayLabel }}
                </strong>
              </transition>
            </article>
            <article class="heatmap-stat-card">
              <span>最活跃时段</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`merged-hour-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : activityHeatmapSummary.mostActiveHour}`">
                  {{ activityHeatmapLoading ? '读取中' : activityHeatmapSummary.mostActiveHour }}
                </strong>
              </transition>
            </article>
            <article class="heatmap-stat-card heatmap-stat-card--mint">
              <span>最活跃星期</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`merged-weekday-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : activityHeatmapSummary.mostActiveWeekday}`">
                  {{ activityHeatmapLoading ? '读取中' : activityHeatmapSummary.mostActiveWeekday }}
                </strong>
              </transition>
            </article>
            <article class="heatmap-stat-card heatmap-stat-card--blue">
              <span>常用类型</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`merged-type-${heatmapRangeDays}-${activityHeatmapLoading ? 'loading' : activityHeatmapSummary.mostUsedCategory}`">
                  {{ activityHeatmapLoading ? '读取中' : activityHeatmapSummary.mostUsedCategory }}
                </strong>
              </transition>
            </article>
          </div>
        </section>

        <aside class="analysis-side-card">
          <header class="analysis-side-card__header">
            <div class="analysis-side-card__title-row">
              <h3>{{ analysisTabs.find((item) => item.key === activeAnalysisTab)?.label }}</h3>
              <n-select
                :value="activeAnalysisTab"
                :options="analysisTabOptions"
                size="small"
                class="analysis-side-card__select"
                @update:value="activeAnalysisTab = $event as AnalysisTabKey"
              />
            </div>
            <span class="analysis-side-card__meta">{{ activeAnalysisMeta }}</span>
            <p v-if="activeAnalysisTab !== 'category' && activeAnalysisTab !== 'health' && activeAnalysisTab !== 'longUnvisited' && activeAnalysisTab !== 'usage' && activeAnalysisTab !== 'addedTrend'">{{ activeAnalysisTitle }}</p>
          </header>

          <div v-if="activeAnalysisTab === 'category'" class="analysis-chart analysis-chart--category">
            <VChart
              class="analysis-chart__canvas analysis-chart__canvas--donut"
              :option="categoryDistributionChartOption"
              autoresize
              @mouseover="handleCategoryDistributionChartMouseOver"
              @mouseout="handleCategoryDistributionChartMouseOut"
              @globalout="handleCategoryDistributionChartMouseOut"
            />
            <div class="analysis-chart__legend">
              <article
                v-for="item in categoryDistributionLegendItems"
                :key="item.label"
                class="analysis-chart__legend-item analysis-chart__legend-item--category"
                :class="{
                  'analysis-chart__legend-item--active': activeCategoryDistributionLabel === item.label,
                  'analysis-chart__legend-item--aggregate': item.isAggregate
                }"
                @mouseenter="handleCategoryDistributionActiveChange(item.label)"
                @mouseleave="handleCategoryDistributionActiveChange(null)"
              >
                <span class="analysis-chart__legend-label">
                  <i :style="{ backgroundColor: item.color }"></i>
                  {{ item.displayLabel }}
                </span>
                <strong>{{ formatNumber(item.value) }}</strong>
                <span>{{ item.percent }}%</span>
              </article>
            </div>
          </div>

          <div v-else-if="activeAnalysisTab === 'health'" class="analysis-chart analysis-chart--health">
            <div class="analysis-health-bar" aria-label="资源健康分段条">
              <span
                v-for="item in healthInsightSegments"
                :key="item.label"
                class="analysis-health-bar__segment"
                :class="{
                  'analysis-health-bar__segment--active': activeHealthInsightLabel === item.label
                }"
                :style="{
                  width: `${item.percent}%`,
                  backgroundColor: item.color,
                  minWidth: item.value > 0 ? '10px' : '6px',
                  opacity: item.hasPlaceholder ? 0.28 : 1
                }"
                @mouseenter="showHealthInsightTooltip($event, item)"
                @mousemove="moveHealthInsightTooltip($event)"
                @mouseleave="hideHealthInsightTooltip"
              ></span>
            </div>
            <div class="analysis-chart__legend analysis-chart__legend--stacked">
              <article
                v-for="item in healthInsightSegments"
                :key="item.label"
                class="analysis-chart__legend-item"
                :class="{ 'analysis-chart__legend-item--soft-active': activeHealthInsightLabel === item.label }"
                @mouseenter="handleHealthInsightActiveChange(item.label)"
                @mouseleave="handleHealthInsightActiveChange(null)"
              >
                <span class="analysis-chart__legend-label">
                  <i :style="{ backgroundColor: item.color }"></i>
                  {{ item.label }}
                </span>
                <strong>{{ formatNumber(item.value) }}</strong>
              </article>
            </div>
            <p class="analysis-list__hint">建议优先处理：封面缺失 > 资源失效 > 长期未访问</p>
          </div>

          <div v-else-if="activeAnalysisTab === 'longUnvisited'" class="analysis-chart">
            <VChart class="analysis-chart__canvas" :option="longUnvisitedDistributionChartOption" autoresize />
            <p class="analysis-list__hint">{{ longUnvisitedInsightText }}</p>
          </div>

          <div v-else-if="activeAnalysisTab === 'usage'" class="analysis-chart">
            <VChart
              v-if="usageInsightItems.length"
              class="analysis-chart__canvas"
              :option="usageDistributionChartOption"
              autoresize
            />
            <div v-else class="analysis-chart__empty">近期还没有足够的启动记录</div>
            <p class="analysis-list__hint">{{ usageInsightSummaryText }}</p>
          </div>

          <div v-else class="analysis-chart">
            <VChart class="analysis-chart__canvas" :option="addedTrendChartOption" autoresize />
            <p class="analysis-list__hint">{{ addedTrendInsightText }}</p>
          </div>
        </aside>
      </div>
      <teleport to="body">
        <div
          v-if="healthInsightTooltip.visible"
          class="analysis-health-tooltip analysis-health-tooltip--floating"
          :style="{
            left: `${healthInsightTooltip.x}px`,
            top: `${healthInsightTooltip.y - 14}px`,
            ...healthInsightTooltipStyle
          }"
        >
          <strong>{{ healthInsightTooltip.label }}</strong>
          <span>{{ formatNumber(healthInsightTooltip.value) }} 项</span>
          <span>占比 {{ healthInsightTooltip.percent.toFixed(1) }}%</span>
        </div>
      </teleport>
    </section>

    <section class="shortcut-grid">
      <article
        v-for="item in shortcuts"
        :key="item.label"
        class="shortcut-card"
        :class="toneClass(item.tone as Tone)"
      >
        <strong>{{ item.label }}</strong>
        <span>{{ item.value }}</span>
      </article>
    </section>

    <section id="home-cover-wall" class="cover-section" :class="{ 'is-stuck': coverWallStickyStuck }">
      <div ref="coverWallStickyRef" class="cover-section__sticky" :class="{ 'is-stuck': coverWallStickyStuck }">
        <div class="cover-section__sticky-shell">
          <div class="cover-section__sticky-gap" aria-hidden="true"></div>
          <div class="cover-section__head">
            <header class="cover-section__header">
              <div>
                <h2>封面墙</h2>
                <p>按状态与分类快速缩小范围，先扫封面，再悬停看信息。</p>
              </div>
              <div class="cover-toolbar">
                <label class="cover-toolbar__search">
                  <input
                    v-model.trim="coverWallSearchKeyword"
                    type="search"
                    placeholder="搜索关键词，分类"
                  />
                </label>
              </div>
            </header>

            <div class="cover-filters">
              <button
                v-for="filter in coverFilters"
                :key="filter.key"
                type="button"
                class="soft-chip"
                :class="[toneClass(filter.tone as Tone), { 'is-active': coverWallActiveSelection.kind === 'status' && coverWallActiveFilter === filter.key }]"
                @click="handleCoverFilterClick(filter.key)"
              >
                {{ filter.label }}
              </button>
            </div>

            <div v-if="coverWallCategoryFilters.length" class="cover-category-row">
              <button
                v-for="chip in coverWallCategoryFilters"
                :key="chip.id"
                type="button"
                class="soft-chip cover-category-chip"
                :class="{ 'is-active': coverWallActiveSelection.kind === 'category' && coverWallActiveCategoryId === chip.id }"
                :style="getCoverWallCategoryChipStyle(chip, coverWallActiveSelection.kind === 'category' && coverWallActiveCategoryId === chip.id)"
                @click="handleCoverWallCategoryClick(chip.id)"
              >
                <span aria-hidden="true">{{ chip.emoji }}</span>
                {{ chip.label }} {{ chip.count }}
              </button>
            </div>
          </div>

          <div class="cover-summary-row">
            <span>{{ getCoverWallSummaryText() }}</span>
          </div>
        </div>
      </div>

      <div v-if="coverWallInitialLoading" class="cover-empty">正在整理封面墙</div>
      <div v-else-if="!displayedCoverWallItems.length" class="cover-empty">当前筛选下暂时没有可展示的封面</div>
      <div v-else ref="coverWallStageRef" class="cover-stage">
        <div class="cover-grid">
          <button
            v-for="item in coverWallVisibleItems"
            :key="item.id"
            :ref="(el) => setCoverWallCardRef(item.id, el)"
            type="button"
            class="cover-card"
            :style="getCoverCardStyle(item)"
            @mouseenter="scheduleCoverWallHoverShow(item.id)"
            @mouseleave="scheduleCoverWallHoverHide(item.id)"
            @focus="scheduleCoverWallHoverShow(item.id)"
            @blur="scheduleCoverWallHoverHide(item.id)"
            @click="openHomeDetailDrawer(item)"
          >
            <div class="cover-card__art" :class="{ 'is-fallback': !item.coverUrl }">
              <span class="cover-card__chip">{{ item.categoryEmoji }} {{ item.categoryName }}</span>
              <span v-if="!item.coverUrl" class="cover-card__fallback-title">{{ item.title }}</span>
            </div>
          </button>
        </div>

        <div
          v-if="coverWallHoverState && coverWallHoveredItem"
          class="cover-hover-card"
          :style="getCoverWallHoverStyle()"
        >
          <strong>{{ coverWallHoveredItem.title }}</strong>
          <p class="cover-hover-card__meta">
            {{ coverWallHoveredItem.categoryName }} · {{ getCoverWallHoverMetaLabel(coverWallHoveredItem) }}
          </p>
          <div v-if="getCoverWallStateBadges(coverWallHoveredItem).length" class="cover-hover-card__badge-row">
            <span
              v-for="badge in getCoverWallStateBadges(coverWallHoveredItem)"
              :key="badge"
              class="cover-hover-card__badge cover-hover-card__badge--soft"
            >
              {{ badge }}
            </span>
          </div>
          <p class="cover-hover-card__meta">
            {{ coverWallHoveredItem.createTime ? formatAddedTime(coverWallHoveredItem.createTime) : '最近添加' }}
          </p>
        </div>

        <div
          v-if="coverWallShouldLoadMore || currentCoverWallPageState.loading"
          ref="coverWallLoadMoreRef"
          class="cover-stage__loadmore"
        >
          {{ currentCoverWallPageState.loading ? '正在加载更多封面...' : '继续下滑加载更多封面' }}
        </div>
        <div v-else class="cover-stage__footer">
          已经到底了
        </div>
      </div>
    </section>

    <n-back-top
      v-if="coverWallStickyStuck"
      class="cover-wall-back-top"
      :right="26"
      :bottom="28"
      :visibility-height="0"
      :listen-to="getCoverWallBackTopListenTarget"
    />

    <PictureViewer
      v-model:show="showHomePictureViewer"
      :image-paths="homePictureViewerImagePaths"
      :initial-index="homePictureViewerInitialIndex"
      @update:show="handleHomePictureViewerShowUpdate"
    />

    <ComicReader
      v-model:show="showHomeComicReader"
      :image-paths="homeComicReaderImagePaths"
      :initial-index="homeComicReaderInitialIndex"
      @update:show="handleHomeComicReaderShowUpdate"
      @page-change="handleHomeComicReaderPageChange"
    />

    <TextReader
      v-model:show="showHomeTextReader"
      :file-path="homeTextReaderFilePath"
      :title="homeTextReaderTitle"
      :initial-progress="homeTextReaderInitialProgress"
      @update:show="handleHomeTextReaderShowUpdate"
      @progress-change="handleHomeTextReaderProgressChange"
    />

    <PdfReader
      v-model:show="showHomePdfReader"
      :file-path="homePdfReaderFilePath"
      :title="homePdfReaderTitle"
      :initial-progress="homePdfReaderInitialProgress"
      @update:show="handleHomePdfReaderShowUpdate"
      @progress-change="handleHomePdfReaderProgressChange"
    />

    <EpubReader
      v-model:show="showHomeEpubReader"
      :file-path="homeEpubReaderFilePath"
      :title="homeEpubReaderTitle"
      :initial-progress="homeEpubReaderInitialProgress"
      @update:show="handleHomeEpubReaderShowUpdate"
      @progress-change="handleHomeEpubReaderProgressChange"
    />

    <EbookReader
      :show="showHomeEbookReader"
      :file-path="homeEbookReaderFilePath"
      :title="homeEbookReaderTitle"
      :initial-progress="homeEbookReaderInitialProgress"
      @update:show="handleHomeEbookReaderShowUpdate"
      @progress-change="handleHomeEbookReaderProgressChange"
    />

    <VideoPlayer
      v-model:show="showHomeVideoPlayer"
      :playlist="homeVideoPlayerPlaylist"
      :initial-path="homeVideoPlayerInitialPath"
      :initial-time="homeVideoPlayerInitialTime"
      :title="homeVideoPlayerTitle"
    />

    <ResourceDetailDrawer
      :show="showHomeDetailDrawer"
      :width="homeDetailDrawerWidth"
      :selected-detail-resource="homeDetailResource"
      :category-name="homeDetailCategoryName"
      :category-settings="homeDetailCategorySettings"
      :detail-is-website="homeDetailIsWebsite"
      :detail-is-software="homeDetailIsSoftware"
      :detail-is-manga="homeDetailIsManga"
      :detail-is-asmr="homeDetailIsAsmr"
      :detail-is-audio="homeDetailIsAudio"
      :detail-is-novel="homeDetailIsNovel"
      :is-video-category="homeDetailIsVideoCategory"
      :is-video-folder-category="homeDetailIsVideoFolderCategory"
      :detail-website-favicon-src="homeDetailWebsiteFaviconSrc"
      :detail-website-placeholder-emoji="homeDetailWebsitePlaceholderEmoji"
      :detail-website-cover-placeholder-text="homeDetailWebsiteCoverPlaceholderText"
      :detail-cover-preview-src="homeDetailCoverPreviewSrc"
      :detail-rating-draft="homeDetailRatingDraft"
      :has-pending-rating-change="homeDetailHasPendingRatingChange"
      :rating-comment="homeDetailRatingComment"
      :get-rating-emoji="getRatingEmoji"
      :detail-stores="homeDetailStores"
      :detail-meta-items="homeDetailMetaItems"
      :detail-display-path="homeDetailDetailDisplayPath"
      :has-detail-description="homeDetailHasDetailDescription"
      :detail-description-box-style="homeDetailCategoryDescriptionBoxStyle"
      :detail-stats="homeDetailDetailStats"
      :detail-stats-text="homeDetailStatsText"
      :detail-show-total-runtime="homeDetailShowTotalRuntime"
      :detail-reading-progress-text="homeDetailReadingProgressText"
      :detail-playback-progress-text="homeDetailPlaybackProgressText"
      :detail-preview-section-title="homeDetailPreviewSectionTitle"
      :detail-screenshot-paths="homeDetailScreenshotPaths"
      :detail-screenshot-preview-src="homeDetailScreenshotPreviewSrc"
      :current-screenshot-index="homeDetailCurrentScreenshotIndex"
      :show-delete-screenshot-confirm="showHomeDeleteScreenshotConfirm"
      :detail-gallery-items="homeDetailGalleryItems"
      :detail-gallery-section-title="homeDetailGallerySectionTitle"
      :detail-directory-section-title="homeDetailDirectorySectionTitle"
      :detail-audio-tree-loading="homeDetailAudioTreeLoading"
      :detail-audio-tree="homeDetailAudioTree"
      :detail-directory-empty-text="homeDetailDirectoryEmptyText"
      :detail-audio-context-menu-visible="homeDetailAudioContextMenuVisible"
      :detail-audio-context-menu-position="homeDetailAudioContextMenuPosition"
      :detail-audio-context-menu-options="homeDetailAudioContextMenuOptions"
      :detail-show-logs="homeDetailShowLogs"
      :detail-logs="homeDetailDetailLogs"
      :detail-empty-log-description="homeDetailEmptyLogDescription"
      :visible-detail-logs="homeDetailVisibleDetailLogs"
      :has-more-detail-logs="homeDetailHasMoreDetailLogs"
      :no-more="homeDetailNoMore"
      :detail-log-mode-label="homeDetailLogModeLabel"
      :detail-log-duration-label="homeDetailLogDurationLabel"
      :start-text="homeDetailStartText"
      :detail-can-launch="homeDetailCanLaunch"
      :detail-can-stop="homeDetailCanStop"
      :detail-open-folder-text="homeDetailOpenFolderText"
      :show-open-category-button="true"
      open-category-button-text="转到分类"
      :handle-detail-drawer-resize-start="() => {}"
      :handle-rating-update="handleHomeDetailRatingUpdate"
      :handle-submit-rating="handleHomeDetailSubmitRating"
      :handle-copy-text="handleHomeDetailCopyText"
      :handle-open-detail-resource-path="handleHomeDetailOpenResourcePath"
      :handle-open-store-website="handleHomeDetailOpenStoreWebsite"
      :handle-open-picture-viewer="handleHomeDetailOpenPictureViewer"
      :handle-previous-screenshot="handleHomeDetailPreviousScreenshot"
      :handle-next-screenshot="handleHomeDetailNextScreenshot"
      :handle-delete-current-screenshot="handleHomeDetailDeleteCurrentScreenshot"
      :handle-open-detail-screenshot-folder="handleHomeDetailOpenScreenshotFolder"
      :render-audio-tree-label="renderHomeAudioTreeLabel"
      :render-audio-tree-suffix="renderHomeAudioTreeSuffix"
      :close-detail-audio-context-menu="closeHomeDetailAudioContextMenu"
      :handle-select-detail-audio-context-menu="handleHomeSelectDetailAudioContextMenu"
      :handle-audio-tree-play="handleHomeAudioTreePlay"
      :handle-open-audio-tree-context-menu="handleHomeOpenAudioTreeContextMenu"
      :handle-load-more-logs="handleHomeDetailLoadMoreLogs"
      :format-date-time="formatDateTime"
      :format-duration="formatDuration"
      :format-launch-mode="formatLaunchMode"
      :format-log-end-time="formatLogEndTime"
      :format-log-duration="formatLogDuration"
      :handle-detail-launch-action="handleHomeDetailLaunchAction"
      :handle-edit-resource="handleHomeDetailEditResource"
      :handle-open-category="handleHomeDetailOpenCategory"
      :handle-open-video-order-dialog="handleHomeDetailOpenVideoOrderDialog"
      @update:show="showHomeDetailDrawer = $event"
      @update:show-delete-screenshot-confirm="showHomeDeleteScreenshotConfirm = $event"
    >
      <template #description-content>
        <div
          class="detail-drawer__value detail-drawer__value--description detail-drawer__value--rich"
          v-html="homeDetailResource?.description"
        />
      </template>
    </ResourceDetailDrawer>

    <n-modal
      v-model:show="showHomeVideoOrderModal"
      preset="card"
      title="修改番剧顺序"
      :style="{ width: '760px', maxWidth: '92vw' }"
      @after-leave="resetHomeVideoOrderDialog"
    >
      <n-space vertical :size="16">
        <n-alert type="info" :show-icon="false">
          可调整番剧目录中视频文件的展示顺序，并控制是否在详情中显示。新扫描到的视频文件默认按文件名排序。
        </n-alert>
        <div class="video-order-modal__toolbar">
          <div class="video-order-modal__summary">
            共 {{ homeVideoOrderItems.length }} 个视频文件
          </div>
          <n-button size="small" @click="handleResetHomeVideoOrderItems">
            按文件名排序
          </n-button>
        </div>
        <n-scrollbar class="video-order-modal__scrollbar">
          <div class="video-order-modal__list">
            <div
              v-for="(item, index) in homeVideoOrderItems"
              :key="item.id || item.relativePath"
              class="video-order-item"
              :class="{
                'video-order-item--changed': isHomeVideoOrderItemChanged(item, index),
                'video-order-item--dragging': homeVideoOrderDragIndex === index,
                'video-order-item--drag-over': homeVideoOrderDragOverIndex === index && homeVideoOrderDragIndex !== index
              }"
              draggable="true"
              @dragstart="handleHomeVideoOrderDragStart(index, $event)"
              @dragenter.prevent="handleHomeVideoOrderDragEnter(index)"
              @dragover.prevent
              @drop.prevent="handleHomeVideoOrderDrop(index)"
              @dragend="handleHomeVideoOrderDragEnd"
            >
              <div
                class="video-order-item__change-marker"
                :class="{ 'video-order-item__change-marker--active': isHomeVideoOrderItemChanged(item, index) }"
              />
              <div class="video-order-item__index" :title="'拖动调整顺序'">{{ index + 1 }}</div>
              <img
                v-if="getHomeVideoSubCoverPreviewSrc(homeVideoOrderResource, item.relativePath)"
                :src="getHomeVideoSubCoverPreviewSrc(homeVideoOrderResource, item.relativePath)"
                alt=""
                class="video-order-item__cover"
                draggable="false"
              />
              <div v-else class="video-order-item__cover video-order-item__cover--empty">VIDEO</div>
              <div class="video-order-item__main">
                <div class="video-order-item__title">{{ item.fileName || item.relativePath }}</div>
              </div>
              <n-checkbox
                :checked="item.isVisible"
                @update:checked="(value: boolean) => { homeVideoOrderItems[index].isVisible = value }"
              >
                显示
              </n-checkbox>
              <div class="video-order-item__actions">
                <n-button quaternary circle size="small" :disabled="index === 0" @click="moveHomeVideoOrderItem(index, index - 1)">
                  <template #icon>
                    <n-icon :component="ChevronUpOutline" />
                  </template>
                </n-button>
                <n-button
                  quaternary
                  circle
                  size="small"
                  :disabled="index === homeVideoOrderItems.length - 1"
                  @click="moveHomeVideoOrderItem(index, index + 1)"
                >
                  <template #icon>
                    <n-icon :component="ChevronDownOutline" />
                  </template>
                </n-button>
                <span class="video-order-item__drag-hint">拖动排序</span>
              </div>
            </div>
          </div>
        </n-scrollbar>
        <div class="batch-label-modal__footer">
          <n-space justify="end">
            <n-button @click="showHomeVideoOrderModal = false">取消</n-button>
            <n-button type="primary" :loading="isHomeVideoOrderSubmitting" @click="handleSubmitHomeVideoOrder">
              保存
            </n-button>
          </n-space>
        </div>
      </n-space>
    </n-modal>

    <ResourceEditorDrawer
      :show="showHomeEditResourceDrawer"
      mode="edit"
      :category-name="homeEditCategoryName"
      :category-settings="homeEditCategorySettings"
      :form-data="homeEditFormData"
      :form-rules="homeEditFormRules"
      :set-form-ref="assignHomeEditFormRef"
      :set-base-path-form-item-ref="assignHomeEditBasePathFormItemRef"
      :is-novel-category="homeEditIsNovel"
      :is-audio-category="homeEditIsAudio"
      :is-software-category="homeEditIsSoftware"
      :detail-is-asmr="homeEditIsAsmr"
      :actor-filter-label="homeEditActorFilterLabel"
      :author-input-placeholder="homeEditAuthorInputPlaceholder"
      :description-label="homeEditDescriptionLabel"
      :description-placeholder="homeEditDescriptionPlaceholder"
      :model-component="homeEditModelComponent"
      :model-component-key="homeEditModelComponentKey"
      :fetch-resource-info-loading="homeEditFetchResourceInfoLoading"
      :author-select-options="homeEditAuthorSelectOptions"
      :tag-select-options="homeEditTagSelectOptions"
      :type-select-options="homeEditTypeSelectOptions"
      :create-select-option="createSelectOption"
      :cover-preview-src="homeEditCoverPreviewSrc"
      :cover-preview-label="homeEditFormData?.coverPath ? homeEditFormData.coverPath : '暂未设置封面'"
      :video-cover-frame-loading="homeEditVideoCoverFrameLoading"
      :has-base-path="homeEditHasBasePath"
      :has-cover-path="homeEditHasCoverPath"
      :editing-resource-id="homeEditingResourceId"
      @update:show="showHomeEditResourceDrawer = $event"
      @open-software-script="handleHomeEditorOpenSoftwareScript"
      @select-base-path="handleHomeEditorSelectBasePath"
      @update:actors="(value) => { homeEditFormData.actors = Array.isArray(value) ? value : [] }"
      @check-engine="handleHomeEditorCheckGameEngine"
      @fetch-game-info="handleHomeEditorFetchGameInfo"
      @fetch-website-info="handleHomeEditorFetchWebsiteInfo"
      @update:audio-authors="handleHomeEditAudioAuthorsUpdate"
      @tags-change="handleHomeEditTagsChange"
      @tag-search="() => {}"
      @tag-input-keydown="() => {}"
      @tag-input-blur="() => {}"
      @types-change="handleHomeEditTypesChange"
      @type-search="() => {}"
      @type-input-keydown="() => {}"
      @type-input-blur="() => {}"
      @choose-custom-cover="handleHomeEditorChooseCustomCover"
      @fetch-website-cover="handleHomeEditorFetchWebsiteCover"
      @fetch-album-cover="handleHomeEditorFetchAlbumCover"
      @use-video-random-frame-cover="handleHomeEditorUseVideoRandomFrameCover"
      @use-screenshot-cover="handleHomeEditorUseScreenshotCover"
      @choose-cover-from-screenshot-folder="handleHomeEditorChooseCoverFromScreenshotFolder"
      @use-first-cover="handleHomeEditorUseFirstCover"
      @clear-cover="handleHomeEditorClearCover"
      @close="showHomeEditResourceDrawer = false"
      @submit-edit="handleHomeEditSubmit"
      @reset-edit="handleHomeEditReset"
      @restore-default-edit="handleHomeEditRestoreDefault"
    />

    <AudioCoverCandidateModal
      :show="showHomeEditAudioCoverCandidateModal"
      :candidates="homeEditAudioCoverCandidates"
      @update:show="showHomeEditAudioCoverCandidateModal = $event"
      @select="handleUseHomeEditAudioCoverCandidate"
      @after-leave="closeHomeEditAudioCoverCandidateModal"
    />

    <VideoCoverCandidateModal
      :show="showHomeEditVideoCoverCandidateModal"
      :fixed-candidates="homeEditFixedVideoCoverCandidates"
      :random-candidates="homeEditRandomVideoCoverCandidates"
      :format-time="formatVideoFrameTime"
      @update:show="showHomeEditVideoCoverCandidateModal = $event"
      @select="handleUseHomeEditVideoCoverCandidate"
      @after-leave="closeHomeEditVideoCoverCandidateModal"
    />

    <VideoSubCoverCandidateModal
      :show="showHomeEditVideoSubCoverCandidateModal"
      :items="homeEditVideoSubCoverCandidateItems"
      :format-time="formatVideoFrameTime"
      @update:show="showHomeEditVideoSubCoverCandidateModal = $event"
      @select="handleUseHomeEditVideoSubCoverCandidate"
      @after-leave="closeHomeEditVideoSubCoverCandidateModal"
    />

    <n-modal
      v-model:show="showHomeEditSoftwareScriptModal"
      preset="card"
      title="编写脚本"
      :style="{ width: '680px' }"
    >
      <n-space vertical :size="16">
        <n-alert type="info" :show-icon="false">
          选择脚本解释器后，每一行都会按顺序执行，保存时会自动转换成一条命令。
        </n-alert>
        <n-form-item label="脚本运行器">
          <n-select
            v-model:value="homeEditSoftwareScriptRuntimePath"
            :options="homeEditSoftwareScriptRuntimes"
            label-field="label"
            value-field="value"
            placeholder="请选择 CMD 或 PowerShell"
          />
        </n-form-item>
        <n-input
          v-model:value="homeEditSoftwareScriptDraft"
          type="textarea"
          :rows="10"
          :placeholder="homeEditSoftwareScriptPlaceholder"
        />
        <div class="batch-label-modal__footer">
          <n-space justify="end">
            <n-button @click="showHomeEditSoftwareScriptModal = false">取消</n-button>
            <n-button type="primary" @click="handleHomeEditConfirmSoftwareScript">保存脚本</n-button>
          </n-space>
        </div>
      </n-space>
    </n-modal>

  </div>
</template>

<style scoped>
.home-page {
  --home-bg: v-bind('themeTokens.pageBg');
  --home-panel: v-bind('themeTokens.panelBg');
  --home-panel-subtle: v-bind('themeTokens.panelBgSubtle');
  --home-elevated: v-bind('themeTokens.elevatedBg');
  --home-input: v-bind('themeTokens.inputBg');
  --home-border: v-bind('themeTokens.border');
  --home-border-subtle: v-bind('themeTokens.borderSubtle');
  --home-text: v-bind('themeTokens.text');
  --home-text-strong: v-bind('themeTokens.textStrong');
  --home-text-muted: v-bind('themeTokens.textMuted');
  --home-text-faint: v-bind('themeTokens.textFaint');
  --home-primary: v-bind('themeTokens.primary');
  --home-primary-soft: v-bind('themeTokens.primarySoft');
  --home-primary-hover: v-bind('themeTokens.primaryHover');
  --home-primary-focus: v-bind('themeTokens.primaryFocus');
  --home-primary-text: v-bind('themeTokens.primaryText');
  --home-info: v-bind('themeTokens.info');
  --home-info-soft: v-bind('themeTokens.infoSoft');
  --home-cyan: v-bind('themeTokens.cyan');
  --home-cyan-soft: v-bind('themeTokens.cyanSoft');
  --home-success: v-bind('themeTokens.success');
  --home-success-soft: v-bind('themeTokens.successSoft');
  --home-lime: v-bind('themeTokens.lime');
  --home-lime-soft: v-bind('themeTokens.limeSoft');
  --home-green: v-bind('themeTokens.green');
  --home-green-soft: v-bind('themeTokens.greenSoft');
  --home-warning: v-bind('themeTokens.warning');
  --home-warning-soft: v-bind('themeTokens.warningSoft');
  --home-orange: v-bind('themeTokens.orange');
  --home-orange-soft: v-bind('themeTokens.orangeSoft');
  --home-error: v-bind('themeTokens.error');
  --home-error-soft: v-bind('themeTokens.errorSoft');
  --home-magenta: v-bind('themeTokens.magenta');
  --home-magenta-soft: v-bind('themeTokens.magentaSoft');
  --home-solid-panel: v-bind('themeTokens.solidPanel');
  --home-solid-panel-alt: v-bind('themeTokens.solidPanelAlt');
  --home-solid-panel-strong: v-bind('themeTokens.solidPanelStrong');
  --home-secondary-button-bg: v-bind('themeTokens.secondaryButtonBg');
  --home-secondary-button-text: v-bind('themeTokens.secondaryButtonText');
  --home-overlay-border: v-bind('themeTokens.overlayBorder');
  --home-overlay-bg: v-bind('themeTokens.overlayBg');
  --home-overlay-text-strong: v-bind('themeTokens.overlayTextStrong');
  --home-overlay-text-muted: v-bind('themeTokens.overlayTextMuted');
  --home-overlay-meta-text: v-bind('themeTokens.overlayMetaText');
  --home-overlay-text-soft: v-bind('themeTokens.overlayTextSoft');
  --home-active-neutral-bg: v-bind('themeTokens.activeNeutralBg');
  --home-action-surface-bg: v-bind('themeTokens.actionSurfaceBg');
  --home-action-surface-border: v-bind('themeTokens.actionSurfaceBorder');
  --home-action-button-bg: v-bind('themeTokens.actionButtonBg');
  --home-action-button-border: v-bind('themeTokens.actionButtonBorder');
  --home-action-button-text: v-bind('themeTokens.actionButtonText');
  --home-shadow-soft: v-bind('themeTokens.shadowSoft');
  --home-shadow-medium: v-bind('themeTokens.shadowMedium');
  --home-shadow-strong: v-bind('themeTokens.shadowStrong');
  --home-feed-cover-overlay: v-bind('themeTokens.feedCoverOverlay');
  --home-next-play-hero-overlay: v-bind('themeTokens.nextPlayHeroOverlay');
  --home-next-play-mini-overlay: v-bind('themeTokens.nextPlayMiniOverlay');
  --home-pinned-cover-overlay: v-bind('themeTokens.pinnedCoverOverlay');
  --home-cover-card-overlay: v-bind('themeTokens.coverCardOverlay');
  --home-cover-card-glass: v-bind('themeTokens.coverCardGlass');
  --home-cover-card-glass-fallback: v-bind('themeTokens.coverCardGlassFallback');
  --home-cover-card-image-filter: v-bind('themeTokens.coverCardImageFilter');
  min-height: 100%;
  padding: 24px;
  background: var(--home-bg);
  color: var(--home-text-strong);
  overflow: visible;
  scrollbar-width: none;
}

.home-page::-webkit-scrollbar {
  display: none;
}

:global(.main-content > .n-layout-scroll-container:has(.home-page)) {
  scrollbar-width: none;
}

:global(.main-content > .n-layout-scroll-container:has(.home-page)::-webkit-scrollbar) {
  display: none;
  width: 0;
  height: 0;
}

.home-page *,
.home-page *::before,
.home-page *::after {
  box-sizing: border-box;
}

.home-page h1,
.home-page h2,
.home-page h3,
.home-page p {
  margin: 0;
}

.video-order-modal__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.video-order-modal__summary {
  font-size: 13px;
  opacity: 0.72;
}

.video-order-modal__scrollbar {
  max-height: 56vh;
}

.video-order-modal__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.video-order-item {
  display: grid;
  grid-template-columns: 4px auto 72px minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.06);
  cursor: grab;
  user-select: none;
  transition: transform 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
  border: 1px solid transparent;
}

.video-order-item--changed {
  border-color: rgba(99, 226, 183, 0.16);
}

.video-order-item:active {
  cursor: grabbing;
}

.video-order-item--dragging {
  opacity: 0.45;
}

.video-order-item--drag-over {
  border-color: rgba(99, 226, 183, 0.34);
  background: rgba(99, 226, 183, 0.08);
  transform: translateY(-1px);
}

.video-order-item__index {
  width: 28px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  opacity: 0.7;
}

.video-order-item__change-marker {
  align-self: stretch;
  border-radius: 999px;
  background: transparent;
  transition: background-color 0.18s ease;
}

.video-order-item__change-marker--active {
  background: rgb(99, 226, 183);
}

.video-order-item__main {
  min-width: 0;
}

.video-order-item__cover {
  width: 72px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.06);
}

.video-order-item__cover--empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(216, 221, 229, 0.42);
  font-size: 10px;
}

.video-order-item__title {
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.video-order-item__actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-self: end;
}

.video-order-item__drag-hint {
  font-size: 12px;
  opacity: 0.6;
  white-space: nowrap;
}

.hero-card,
.heatmap-card,
.analysis-side-card,
.next-play-section,
.continue-panel,
.queue-panel,
.cover-section {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-color: var(--home-border);
  background: var(--home-panel);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.85fr);
  gap: 16px;
  min-height: 188px;
  padding: 16px;
  border-radius: 24px;
  overflow: hidden;
}

.hero-card__left {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: flex-start;
  gap: 14px;
}

.hero-card h1 {
  font-size: 28px;
  line-height: 1.2;
  font-weight: 800;
}

.section-eyebrow {
  color: var(--home-text);
  font-size: 13px;
  font-weight: 800;
}

.resource-overview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: auto;
}

.chip-row,
.cover-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.soft-chip {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  border-radius: 999px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

button.soft-chip {
  cursor: pointer;
  transition: filter 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

button.soft-chip:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

button.soft-chip:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.hero-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px;
  gap: 12px;
  margin-top: clamp(18px, 5vh, 48px);
}

.hero-search__field,
.hero-search__button,
.cover-jump {
  height: 46px;
  border-radius: 14px;
  border: 1px solid var(--home-border-subtle);
}

.hero-search__field {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: var(--home-input);
  color: var(--home-text-muted);
  font-size: 12px;
}

.hero-search__field input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--home-text-strong);
  font: inherit;
  font-weight: 700;
}

.hero-search__field input::placeholder {
  color: var(--home-text-muted);
}

.hero-search__field:focus-within {
  border-color: color-mix(in srgb, var(--home-primary) 54%, var(--home-border-subtle));
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.hero-search__dot {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--home-primary);
}

.hero-search__button {
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
}

.hero-search__button--primary {
  border-color: var(--home-primary-soft);
  background: var(--home-primary);
  color: var(--home-primary-text);
}

.hero-search__button--primary:hover {
  background: var(--home-primary-hover);
}

.hero-search__button--lucky {
  border-color: color-mix(in srgb, var(--home-warning) 36%, var(--home-border-subtle));
  background: var(--home-warning-soft);
  color: var(--home-warning);
}

.hero-search__button:hover {
  filter: brightness(1.08);
}

.hero-search__button:disabled {
  cursor: not-allowed;
  filter: saturate(0.85);
  opacity: 0.72;
}

.hero-card p {
  color: var(--home-text-muted);
  font-size: 12px;
}

.hero-feed {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--home-border-subtle);
  border-radius: 20px;
  background: var(--home-panel-subtle);
}

.hero-feed__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 3px 4px 3px 0;
}

.hero-feed h2,
.analysis-section h2,
.next-play-section h2,
.continue-panel h2,
.queue-panel h2,
.heatmap-card h2 {
  color: var(--home-text-strong);
  font-size: 17px;
  line-height: 1.2;
  font-weight: 800;
}

.feed-item {
  display: flex;
  min-height: 54px;
  flex: 0 0 54px;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--home-border-subtle);
  border-radius: 14px;
  background: var(--home-elevated);
  overflow: hidden;
}

.feed-item--button {
  width: 100%;
  appearance: none;
  background-color: var(--home-elevated);
  background-origin: border-box;
  background-clip: border-box;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.feed-item--button:hover {
  border-color: color-mix(in srgb, var(--home-primary) 42%, var(--home-border-subtle));
  transform: translateY(-1px);
  filter: brightness(1.06);
}

.feed-item--button:focus-visible {
  outline: 0;
  border-color: var(--home-primary);
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.feed-item--empty {
  flex-basis: 72px;
}

.feed-item strong,
.feed-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-item strong {
  color: var(--home-text-strong);
  font-size: 12px;
  font-weight: 700;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.42);
}

.feed-item span {
  color: color-mix(in srgb, var(--home-text) 88%, white);
  font-size: 12px;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.34);
}

.stats-grid,
.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.stat-card,
.shortcut-card {
  display: flex;
  min-height: 80px;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 12px;
  border: 1px solid var(--home-border);
  border-radius: 18px;
  background: var(--home-panel);
}

.stat-card span,
.shortcut-card span {
  color: var(--home-text);
  font-size: 13px;
  font-weight: 700;
}

.stat-card strong,
.shortcut-card strong {
  color: var(--home-text-strong);
  font-size: 14px;
  font-weight: 800;
}

.heatmap-card {
  container-type: inline-size;
  display: flex;
  min-height: 286px;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-radius: 22px;
  border-color: rgba(255, 255, 255, 0.06);
  background: var(--home-panel);
}

.analysis-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 18px;
}

.analysis-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.analysis-section__header p {
  margin-top: 6px;
  color: var(--home-text-muted);
  font-size: 12px;
}

.analysis-section__body {
  display: grid;
  grid-template-columns: minmax(0, 1.72fr) minmax(320px, 1fr);
  gap: 18px;
  align-items: stretch;
}

.heatmap-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.heatmap-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.heatmap-copy h2 {
  font-size: 18px;
  line-height: 1.2;
}

.heatmap-copy p {
  margin-top: 6px;
  color: var(--home-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.heatmap-range {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.heatmap-range__pill {
  min-width: 64px;
  height: 32px;
  border: 1px solid var(--home-border-subtle);
  border-radius: 999px;
  padding: 0 14px;
  background: var(--home-secondary-button-bg);
  color: var(--home-secondary-button-text);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.heatmap-range__pill:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.heatmap-range__pill:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.heatmap-range__pill--active {
  border-color: transparent;
  background: var(--home-primary);
  color: var(--home-primary-text);
}

.heatmap-body {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr) 208px;
  gap: 16px;
  min-height: 0;
}

.heatmap-stats {
  display: grid;
  gap: 12px;
  align-content: start;
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.heatmap-stats--merged {
  display: none;
}

.heatmap-stat-card {
  display: flex;
  min-height: 70px;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 16px;
  background: var(--home-solid-panel);
}

.heatmap-stat-card span {
  color: var(--home-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.heatmap-stat-card strong {
  color: var(--home-text-strong);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.3;
  word-break: break-word;
}

.heatmap-stats--animating {
  opacity: 0.84;
}

.heatmap-stats--insights .heatmap-stat-card strong {
  font-size: 17px;
}

.heatmap-stat-card--mint strong {
  color: var(--home-success);
}

.heatmap-stat-card--blue strong {
  color: var(--home-info);
}

.activity-heatmap-frame {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  overflow-x: hidden;
  transition: opacity 0.24s ease, transform 0.24s ease;
  padding-top: 4px;
}

.activity-heatmap-frame--animating {
  opacity: 0.9;
}

.activity-heatmap-frame::-webkit-scrollbar {
  display: none;
}

.activity-heatmap {
  width: 100%;
  min-width: 0;
}

.heatmap-surface-enter-active,
.heatmap-surface-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.heatmap-surface-enter-from,
.heatmap-surface-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.heatmap-value-enter-active,
.heatmap-value-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.heatmap-value-enter-from,
.heatmap-value-leave-to {
  opacity: 0;
  transform: translateY(3px);
}

@container (max-width: 1240px) {
  .heatmap-body {
    grid-template-columns: 1fr;
  }

  .activity-heatmap-frame {
    grid-column: auto;
    order: -1;
  }

  .heatmap-body > .heatmap-stats,
  .heatmap-body > .heatmap-stats--insights {
    display: none;
  }

  .heatmap-stats--merged {
    display: grid;
    margin-top: 16px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
}

@container (max-width: 860px) {
  .heatmap-stats--merged {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.next-play-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 18px;
  padding: 18px;
  border-radius: 24px;
  background: var(--home-panel);
}

.next-play-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.next-play-section__swap {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--home-success);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.next-play-section__swap:hover {
  filter: brightness(1.08);
}

.next-play-section__swap:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--home-primary-focus);
  border-radius: 8px;
}

.next-play-layout {
  display: grid;
  grid-template-columns: minmax(220px, 1.15fr) minmax(0, 1.85fr);
  gap: 16px;
  align-items: start;
}

.next-play-empty {
  display: flex;
  min-height: 158px;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--home-border-subtle);
  border-radius: 18px;
  color: var(--home-text-muted);
  font-size: 13px;
  text-align: center;
}

.next-play-hero,
.next-play-mini-card {
  position: relative;
  overflow: hidden;
}

.next-play-hero {
  display: flex;
  height: 100%;
  min-height: 0;
  border-radius: 16px;
  background: color-mix(in srgb, currentColor 24%, var(--home-solid-panel-alt));
  color: inherit;
}

.next-play-hero::before,
.next-play-mini-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    var(--home-next-play-hero-overlay),
    var(--next-play-cover-url);
  background-size: cover;
  background-position: center;
  opacity: 0.94;
  pointer-events: none;
}

.next-play-hero__surface {
  display: flex;
  position: relative;
  min-height: 100%;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 18px 16px;
}

.next-play-hero__meta {
  position: absolute;
  top: 14px;
  left: 18px;
  z-index: 1;
  display: inline-flex;
  max-width: calc(100% - 36px);
  align-items: center;
  gap: 4px;
  color: var(--home-overlay-meta-text);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.next-play-mini-card:focus-visible,
.next-play-hero__action:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.next-play-hero > *,
.next-play-mini-card > * {
  position: relative;
  z-index: 1;
}

.next-play-hero__action {
  width: fit-content;
  min-width: 96px;
  height: 36px;
  border: 0;
  border-radius: 12px;
  padding: 0 16px;
  background: var(--home-primary);
  color: var(--home-primary-text);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.next-play-hero__action:disabled {
  cursor: wait;
  opacity: 0.72;
}

.next-play-card__copy {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}

.next-play-card__reason {
  color: var(--home-primary-text);
  font-size: 11px;
  font-weight: 500;
}

.next-play-hero strong {
  color: var(--home-overlay-text-strong);
  font-size: 21px;
  line-height: 1.25;
  font-weight: 700;
  max-width: 16ch;
}

.next-play-hero small {
  color: var(--home-overlay-text-muted);
  font-size: 12px;
  line-height: 1.45;
  font-weight: 500;
  max-width: 28ch;
}

.next-play-mini-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 12px;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  align-content: start;
  height: 100%;
}

.next-play-mini-card {
  display: block;
  min-height: 0;
  min-width: 0;
  height: 100%;
  aspect-ratio: 1.8 / 1;
  border: 0;
  padding: 0;
  border-radius: 12px;
  background: color-mix(in srgb, currentColor 18%, var(--home-solid-panel-alt));
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease;
}

.next-play-mini-card::before {
  background-image:
    var(--home-next-play-mini-overlay),
    var(--next-play-cover-url);
}

.next-play-mini-card:hover,
.next-play-hero:hover {
  transform: translateY(-2px);
  filter: brightness(1.04);
}

.next-play-mini-card strong {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 9px;
  z-index: 1;
  display: block;
  color: var(--home-overlay-text-strong);
  font-size: 11px;
  line-height: 1.3;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.next-play-mini-card small {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 28px;
  z-index: 1;
  display: block;
  color: var(--home-overlay-meta-text);
  font-size: 10px;
  line-height: 1.2;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

@media (max-width: 1360px) {
  .next-play-layout {
    grid-template-columns: minmax(180px, 0.9fr) minmax(0, 2.1fr);
  }
}

.body-row {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(260px, 1fr);
  gap: 18px;
  margin-top: 18px;
  overflow: visible;
}

.continue-panel,
.queue-panel,
.cover-section {
  min-width: 0;
  border-radius: 24px;
}

.continue-panel,
.queue-panel {
  height: 372px;
  min-height: 372px;
  max-height: 372px;
  padding: 18px;
  overflow: hidden;
}

.continue-panel {
  position: relative;
  display: flex;
  flex-direction: column;
}

.continue-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.continue-empty {
  display: flex;
  min-height: 132px;
  align-items: center;
  justify-content: center;
  margin-top: 12px;
  border: 1px dashed var(--home-border);
  border-radius: 12px;
  color: var(--home-text-muted);
  font-size: 13px;
}

.continue-rail {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  align-items: flex-start;
  gap: 12px;
  overflow-x: auto;
  margin-top: 12px;
  padding: 0 2px 2px;
  scrollbar-width: none;
}

.continue-rail::-webkit-scrollbar {
  display: none;
}

.continue-rail__back-button {
  position: absolute;
  left: 18px;
  top: 50%;
  z-index: 2;
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: var(--home-overlay-bg);
  color: var(--home-overlay-text-strong);
  box-shadow: var(--home-shadow-soft);
  cursor: pointer;
  transform: translateY(-8px);
}

.continue-rail__back-button:hover {
  filter: brightness(1.08);
}

.continue-rail__back-button:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--home-primary-focus), var(--home-shadow-soft);
}

.continue-timeline {
  min-width: 0;
  width: max-content;
  height: 100%;
  padding: 0 12px 2px;
}

.continue-timeline :deep(.n-timeline-item) {
  width: max-content;
  height: 100%;
  padding-right: 24px;
}

.continue-timeline :deep(.n-timeline-item-content) {
  display: flex;
  height: calc(100% - 24px);
  margin-top: 12px;
}

.continue-timeline :deep(.n-timeline-item-timeline) {
  width: 100%;
}

.continue-card {
  display: inline-flex;
  box-sizing: border-box;
  width: fit-content;
  min-width: 220px;
  max-width: 320px;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid currentColor;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}

.continue-card:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.continue-card__action-button {
  margin-top: auto;
  align-self: flex-start;
  --n-height: 32px;
  --n-padding: 0 14px;
  --n-border-radius: 8px;
  --n-font-size: 13px;
  --n-font-weight: 700;
}

.continue-card__time {
  color: currentColor;
  font-size: 11px;
  font-weight: 800;
}

.continue-card h3 {
  max-width: 260px;
  overflow: hidden;
  color: var(--home-text-strong);
  font-size: 16px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.continue-card p,
.continue-card small {
  color: color-mix(in srgb, currentColor 42%, var(--home-text-muted));
  font-size: 12px;
}

.continue-card__launch-mode {
  display: block;
  margin-top: -2px;
}

.continue-card strong {
  color: var(--home-text);
  font-size: 13px;
  line-height: 1.5;
}

.continue-rail__status {
  display: inline-flex;
  min-width: 120px;
  height: 210px;
  align-items: center;
  justify-content: center;
  padding-top: 22px;
  color: var(--home-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.queue-panel {
  display: flex;
  height: 372px;
  min-height: 372px;
  max-height: 372px;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.queue-panel__header,
.queue-panel__pager,
.queue-pinned-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.queue-panel__action,
.queue-panel__pager-button,
.queue-panel__dot,
.queue-pinned-card {
  border: 0;
  font: inherit;
}

.queue-panel__action,
.queue-panel__pager-button,
.queue-panel__dot {
  cursor: pointer;
}

.queue-panel__action {
  padding: 0;
  background: transparent;
  color: var(--home-success);
  font-size: 12px;
  font-weight: 700;
}

.queue-panel__action:hover {
  filter: brightness(1.08);
}

.queue-panel__action:focus-visible,
.queue-panel__pager-button:focus-visible,
.queue-panel__dot:focus-visible,
.queue-pinned-card:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.queue-panel__pager {
  min-height: 28px;
}

.queue-panel__pager-button {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--home-secondary-button-bg);
  color: var(--home-secondary-button-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.queue-panel__pager-button:disabled {
  opacity: 0.42;
  cursor: default;
}

.queue-panel__dots {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.queue-panel__dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--home-text-muted) 40%, var(--home-panel-subtle));
}

.queue-panel__dot--active {
  background: var(--home-success);
}

.queue-item {
  position: relative;
  display: flex;
  min-height: 96px;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  background: var(--home-panel-subtle);
  border: 1px solid var(--home-border-subtle);
}

.queue-item--empty {
  flex: 1;
  min-height: 0;
  color: var(--home-text-muted);
}

.queue-empty-state {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  border: 1px solid var(--home-overlay-border);
  border-radius: 20px;
  background: var(--home-solid-panel);
  text-align: center;
}

.queue-empty-state__icon {
  display: grid;
  grid-template-columns: repeat(2, 10px);
  gap: 6px;
  place-content: center;
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: var(--home-secondary-button-bg);
}

.queue-empty-state__icon-dot {
  width: 10px;
  height: 10px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--home-text-muted) 46%, var(--home-panel-subtle));
}

.queue-empty-state__icon-dot--active {
  background: var(--home-success);
}

.queue-empty-state strong {
  color: var(--home-text-strong);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.queue-empty-state p {
  max-width: 284px;
  color: var(--home-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.queue-empty-state__action {
  min-width: 126px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: #63e2b7;
  color: var(--home-primary-text);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease;
}

.queue-empty-state__action:hover {
  filter: brightness(1.04);
  transform: translateY(-1px);
}

.queue-empty-state__action:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.queue-pinned-grid {
  display: grid;
  flex: 1;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
  min-height: 0;
}

.queue-pinned-card {
  position: relative;
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  justify-content: flex-start;
  gap: 8px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: transparent;
  overflow: hidden;
  text-align: left;
  transition: transform 0.18s ease, filter 0.18s ease, border-color 0.18s ease;
  cursor: pointer;
}

.queue-pinned-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    var(--home-pinned-cover-overlay),
    var(--queue-pinned-cover-image, none);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(3px) saturate(0.82) brightness(0.72);
  transform: scale(1.04);
  opacity: 1;
  pointer-events: none;
}

.queue-pinned-card:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.queue-pinned-card > * {
  position: relative;
  z-index: 1;
}

.queue-pinned-card strong {
  color: var(--home-overlay-text-strong);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-pinned-card small {
  color: var(--home-overlay-meta-text);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-pinned-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
}

.queue-pinned-card__actions :deep(.n-button-group) {
  --n-border-radius: 8px;
}

.queue-pinned-card__actions :deep(.n-button) {
  --n-color: var(--home-action-button-bg);
  --n-color-hover: var(--home-action-button-bg);
  --n-color-pressed: var(--home-action-button-bg);
  --n-color-focus: var(--home-action-button-bg);
  --n-border: 1px solid var(--home-action-button-border);
  --n-border-hover: 1px solid var(--home-action-button-border);
  --n-border-pressed: 1px solid var(--home-action-button-border);
  --n-border-focus: 1px solid var(--home-action-button-border);
  --n-text-color: var(--home-action-button-text);
  --n-text-color-hover: var(--home-action-button-text);
  --n-text-color-pressed: var(--home-action-button-text);
  --n-text-color-focus: var(--home-action-button-text);
  --n-font-size: 12px;
  --n-font-weight: 700;
}

.queue-pinned-card__actions :deep(.n-button--primary-type) {
  --n-color: color-mix(in srgb, var(--home-success) 88%, white);
  --n-color-hover: color-mix(in srgb, var(--home-success) 94%, white);
  --n-color-pressed: color-mix(in srgb, var(--home-success) 100%, white);
  --n-color-focus: color-mix(in srgb, var(--home-success) 94%, white);
  --n-border: 1px solid color-mix(in srgb, var(--home-success) 78%, var(--home-action-button-border));
  --n-border-hover: 1px solid color-mix(in srgb, var(--home-success) 78%, var(--home-action-button-border));
  --n-border-pressed: 1px solid color-mix(in srgb, var(--home-success) 78%, var(--home-action-button-border));
  --n-border-focus: 1px solid color-mix(in srgb, var(--home-success) 78%, var(--home-action-button-border));
  --n-text-color: #2d3a25;
  --n-text-color-hover: #2d3a25;
  --n-text-color-pressed: #2d3a25;
  --n-text-color-focus: #2d3a25;
}

.analysis-side-card {
  display: flex;
  min-height: 286px;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 22px;
}

.analysis-side-card__header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.analysis-side-card__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.analysis-side-card__header h3 {
  color: var(--home-text-strong);
  font-size: 17px;
  line-height: 1.2;
  font-weight: 800;
}

.analysis-side-card__meta {
  flex: 0 0 auto;
  color: var(--home-text-muted);
  font-size: 12px;
}

.analysis-side-card__select {
  width: 118px;
  flex: 0 0 auto;
}

.analysis-side-card__select :deep(.n-base-selection) {
  border-radius: 12px;
  background: var(--home-panel-subtle);
}

.analysis-side-card__header p {
  color: var(--home-text-muted);
  font-size: 12px;
}

.analysis-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
}

.analysis-chart {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

.analysis-chart--category {
  display: grid;
  grid-template-columns: minmax(220px, 38%) minmax(0, 62%);
  align-items: center;
  gap: 18px;
}

.analysis-chart--health {
  justify-content: flex-start;
}

.analysis-chart__canvas {
  min-height: 176px;
  width: 100%;
}

.analysis-chart__canvas--donut {
  width: clamp(180px, 38%, 220px);
  min-width: 180px;
  max-width: 220px;
  height: clamp(180px, 38%, 220px);
  min-height: 180px;
  max-height: 220px;
  justify-self: center;
}

.analysis-chart__legend {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.analysis-chart__legend--stacked {
  gap: 10px;
}

.analysis-chart__legend-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--home-border-subtle);
  border-radius: 12px;
  background: var(--home-panel-subtle);
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.analysis-chart__legend-item strong,
.analysis-chart__legend-item span {
  font-size: 12px;
}

.analysis-chart__legend-item strong {
  color: var(--home-text-strong);
  font-weight: 800;
}

.analysis-chart__legend-item > span:last-child {
  color: var(--home-text-muted);
  font-weight: 600;
}

.analysis-chart__legend-item--category {
  grid-template-columns: minmax(0, 1fr) auto auto;
  min-height: 0;
  padding: 8px 0;
  border-width: 0 0 1px;
  border-radius: 0;
  border-color: var(--home-border-subtle);
  background: transparent;
  box-sizing: border-box;
  cursor: default;
}

.analysis-chart__legend-item--category:first-child {
  padding-top: 2px;
}

.analysis-chart__legend-item--category:last-child {
  border-bottom: 0;
  padding-bottom: 2px;
}

.analysis-chart__legend-item--category strong {
  min-width: 28px;
  text-align: right;
}

.analysis-chart__legend-item--category > span:last-child {
  min-width: 34px;
  text-align: right;
  font-size: 11px;
}

.analysis-chart__legend-item--aggregate .analysis-chart__legend-label,
.analysis-chart__legend-item--aggregate strong,
.analysis-chart__legend-item--aggregate > span:last-child {
  color: color-mix(in srgb, var(--home-text-muted) 88%, #dbe3ef);
}

.analysis-chart__legend-item--active {
  border-color: transparent;
  border-radius: 12px;
  background: var(--home-active-neutral-bg);
  box-shadow: none;
  transform: none;
}

.analysis-chart__legend-item--soft-active {
  background: var(--home-active-neutral-bg);
  border-color: color-mix(in srgb, var(--home-primary) 28%, var(--home-border-subtle));
}

.analysis-chart__legend-item--soft-active .analysis-chart__legend-label,
.analysis-chart__legend-item--soft-active strong,
.analysis-chart__legend-item--soft-active > span:last-child {
  color: var(--home-text-strong);
}

.analysis-chart__legend-label {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  color: var(--home-text-strong);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.analysis-chart__legend-label i {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.analysis-health-bar {
  display: flex;
  gap: 6px;
  width: 100%;
  height: 18px;
}

.analysis-health-bar__segment {
  display: block;
  min-width: 0;
  height: 100%;
  border-radius: 999px;
  transition: filter 0.18s ease, opacity 0.18s ease;
}

.analysis-health-bar__segment:hover,
.analysis-health-bar__segment--active {
  filter: brightness(1.1);
}

.analysis-health-tooltip {
  display: flex;
  min-width: 104px;
  flex-direction: column;
  gap: 4px;
}

.analysis-health-tooltip--floating {
  position: fixed;
  z-index: 2500;
  padding: 10px 12px;
  border: 1px solid var(--analysis-health-tooltip-border);
  border-radius: 12px;
  background: var(--analysis-health-tooltip-bg);
  box-shadow: var(--analysis-health-tooltip-shadow);
  pointer-events: none;
  transform: translate(-50%, calc(-100% - 10px));
}

.analysis-health-tooltip--floating::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px;
  width: 10px;
  height: 10px;
  border-right: 1px solid var(--analysis-health-tooltip-border);
  border-bottom: 1px solid var(--analysis-health-tooltip-border);
  background: var(--analysis-health-tooltip-bg);
  transform: translateX(-50%) rotate(45deg);
}

.analysis-health-tooltip strong {
  color: var(--analysis-health-tooltip-strong);
  font-size: 12px;
  font-weight: 700;
}

.analysis-health-tooltip span {
  color: var(--analysis-health-tooltip-text);
  font-size: 12px;
  line-height: 1.35;
}

.analysis-chart__empty {
  display: flex;
  min-height: 176px;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--home-border-subtle);
  border-radius: 16px;
  color: var(--home-text-muted);
  font-size: 13px;
  text-align: center;
}

.analysis-list__item {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border-radius: 14px;
  background: var(--home-panel-subtle);
  border: 1px solid var(--home-border-subtle);
}

.analysis-list__item strong,
.analysis-list__item span {
  font-size: 13px;
}

.analysis-list__item strong {
  font-weight: 700;
}

.analysis-list__item span {
  color: var(--home-text-strong);
  font-weight: 800;
}

.analysis-list__hint {
  margin-top: auto;
  color: var(--home-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.shortcut-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.cover-section {
  position: relative;
  margin-top: 18px;
  padding: 18px;
  overflow: visible;
  scroll-margin-top: 18px;
  background: var(--home-solid-panel-alt);
  border-radius: 24px;
  background-clip: padding-box;
}

.cover-section__sticky {
  position: sticky;
  top: 0;
  z-index: 8;
}

.cover-section.is-stuck {
  min-height: calc(100vh - 18px);
}

.cover-section__sticky-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 12px;
  overflow: hidden;
  background: var(--home-solid-panel-alt);
}

.cover-section__sticky-gap {
  height: 0;
  flex: 0 0 0;
  background: var(--home-solid-panel-alt);
}

.cover-section__sticky.is-stuck .cover-section__sticky-gap {
  height: 12px;
  flex-basis: 12px;
}

.cover-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.cover-section__head {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--home-overlay-border);
  border-radius: 20px;
  background: var(--home-solid-panel);
  backdrop-filter: blur(18px);
  box-shadow: var(--home-shadow-medium);
}

.cover-section h2 {
  font-size: 22px;
  font-weight: 800;
}

.cover-section p {
  margin-top: 6px;
  color: var(--home-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.cover-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cover-filters button {
  cursor: pointer;
}

.cover-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cover-toolbar__search {
  display: flex;
  align-items: center;
  width: 320px;
  height: 42px;
  border: 1px solid var(--home-overlay-border);
  border-radius: 14px;
  background: var(--home-solid-panel-strong);
  padding: 0 14px;
}

.cover-toolbar__search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--home-text-strong);
  font-size: 12px;
}

.cover-toolbar__search input::placeholder {
  color: var(--home-text-muted);
}

.cover-category-row {
  display: flex;
  overflow-x: auto;
  gap: 8px;
  padding-top: 2px;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.cover-category-row::-webkit-scrollbar {
  display: none;
}

.cover-category-chip {
  flex: 0 0 auto;
  border: 1px solid transparent;
  min-height: 28px;
  font-size: 11px;
}

.cover-category-chip.is-active {
  color: var(--home-primary-text);
  background: var(--home-primary);
  border-color: transparent;
}

.cover-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 0;
  padding: 0 6px;
  color: var(--home-text-muted);
  font-size: 12px;
}

.cover-summary-row strong {
  color: var(--home-success);
  font-size: 12px;
  font-weight: 800;
}

.cover-stage {
  position: relative;
  margin-top: 14px;
  display: flex;
  flex-direction: column;
}

.cover-section.is-stuck .cover-stage,
.cover-section.is-stuck .cover-empty {
  min-height: calc(100vh - 230px);
}

.cover-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.cover-empty {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  margin-top: 14px;
  border: 1px dashed var(--home-border-subtle);
  border-radius: 18px;
  color: var(--home-text-muted);
  font-size: 13px;
}

.cover-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  border: 0;
  padding: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: 220px 320px;
}

.cover-card__art {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 188 / 254;
  border-radius: 16px;
  background-color: color-mix(in srgb, currentColor 38%, var(--home-elevated));
  transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
  overflow: hidden;
}

.cover-card__art::before {
  content: '';
  position: absolute;
  inset: -8px;
  background-image:
    var(--home-cover-card-overlay),
    var(--cover-card-url);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: var(--home-cover-card-image-filter);
  transform: scale(1.04);
  pointer-events: none;
}

.cover-card__art::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: var(--home-cover-card-glass);
  opacity: 1;
  pointer-events: none;
}

.cover-card__art.is-fallback::before {
  display: none;
}

.cover-card__art.is-fallback::after {
  background-image: var(--home-cover-card-glass-fallback);
}

.cover-card:hover .cover-card__art {
  transform: translateY(-2px);
  filter: brightness(1.04);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.2);
}

.cover-card:focus-visible {
  outline: 0;
}

.cover-card:focus-visible .cover-card__art {
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.cover-card__chip {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border: 1px solid var(--home-overlay-border);
  border-radius: 999px;
  padding: 0 10px;
  background: var(--home-overlay-bg);
  color: var(--home-overlay-text-strong);
  font-size: 11px;
  font-weight: 800;
  backdrop-filter: blur(10px);
}

.cover-card__fallback-title {
  position: relative;
  z-index: 1;
  display: -webkit-box;
  max-width: calc(100% - 24px);
  overflow: hidden;
  color: var(--home-overlay-text-strong);
  font-size: 16px;
  line-height: 1.45;
  font-weight: 800;
  text-align: center;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
}

.cover-hover-card {
  position: absolute;
  z-index: 3;
  width: 272px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--home-overlay-border);
  border-radius: 18px;
  background: var(--home-overlay-bg);
  box-shadow: var(--home-shadow-strong);
  pointer-events: none;
}

.cover-hover-card__badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cover-hover-card > strong {
  color: var(--home-text-strong);
  font-size: 18px;
  line-height: 1.25;
  font-weight: 800;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.cover-hover-card__meta {
  color: var(--home-overlay-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.cover-hover-card__badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  border-radius: 999px;
  padding: 0 10px;
  background: var(--home-secondary-button-bg);
  color: var(--home-secondary-button-text);
  font-size: 11px;
  font-weight: 800;
}

.cover-hover-card__badge--soft {
  background: color-mix(in srgb, var(--home-secondary-button-bg) 82%, transparent);
}

@media (min-width: 1500px) {
  .cover-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}

@media (min-width: 1740px) {
  .cover-grid {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }
}

@media (min-width: 2060px) {
  .cover-grid {
    grid-template-columns: repeat(9, minmax(0, 1fr));
  }
}

.cover-stage__footer {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: auto;
  padding-top: 14px;
  border: 1px solid var(--home-border-subtle);
  border-radius: 16px;
  background: var(--home-solid-panel);
  color: var(--home-text-muted);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  padding: 0 16px;
}

.cover-stage__loadmore {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  margin-top: auto;
  padding-top: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--home-text-muted) 8%, transparent);
  color: var(--home-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.cover-wall-back-top {
  z-index: 16;
}

.tone-mint {
  color: var(--home-success);
  background: var(--home-success-soft);
}

.soft-chip.tone-mint.is-active {
  color: var(--home-primary-text);
  background: var(--home-primary);
}

.soft-chip.tone-blue.is-active,
.soft-chip.tone-purple.is-active,
.soft-chip.tone-green.is-active,
.soft-chip.tone-slate.is-active,
.soft-chip.tone-cyan.is-active,
.soft-chip.tone-amber.is-active,
.soft-chip.tone-orange.is-active,
.soft-chip.tone-magenta.is-active,
.soft-chip.tone-rose.is-active,
.soft-chip.tone-lime.is-active {
  color: var(--home-primary-text);
  background: var(--home-primary);
}

.tone-blue {
  color: var(--home-info);
  background: var(--home-info-soft);
}

.tone-cyan {
  color: var(--home-cyan);
  background: var(--home-cyan-soft);
}

.tone-amber {
  color: var(--home-warning);
  background: var(--home-warning-soft);
}

.tone-orange {
  color: var(--home-orange);
  background: var(--home-orange-soft);
}

.tone-purple {
  color: var(--home-primary);
  background: var(--home-primary-soft);
}

.tone-magenta {
  color: var(--home-magenta);
  background: var(--home-magenta-soft);
}

.tone-rose {
  color: var(--home-error);
  background: var(--home-error-soft);
}

.tone-green {
  color: var(--home-green);
  background: var(--home-green-soft);
}

.tone-lime {
  color: var(--home-lime);
  background: var(--home-lime-soft);
}

.tone-slate {
  color: var(--home-text);
  background: var(--home-elevated);
}

.shortcut-card,
.shortcut-card.tone-rose,
.shortcut-card.tone-purple,
.shortcut-card.tone-mint,
.shortcut-card.tone-slate {
  color: var(--home-text-strong);
  background: var(--home-panel);
}

.shortcut-card span {
  color: var(--home-text-muted);
}

.shortcut-card.tone-rose span {
  color: var(--home-error);
}

.shortcut-card.tone-purple span {
  color: var(--home-primary);
}

.shortcut-card.tone-mint span {
  color: var(--home-success);
}

.shortcut-card.tone-slate span {
  color: var(--home-text);
}

@media (max-width: 1440px) {
  .cover-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (max-width: 1280px) {
  .hero-card,
  .body-row,
  .analysis-section__body,
  .heatmap-card {
    grid-template-columns: 1fr;
  }

  .stats-grid,
  .shortcut-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cover-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .next-play-layout {
    grid-template-columns: 1fr;
  }

  .next-play-hero {
    height: auto;
  }

  .next-play-mini-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    height: auto;
  }

  .queue-pinned-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .home-page {
    padding: 16px;
  }

  .hero-search,
  .stats-grid,
  .shortcut-grid,
  .cover-grid {
    grid-template-columns: 1fr;
  }

  .next-play-mini-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: none;
  }

  .queue-pinned-grid {
    grid-template-columns: 1fr;
  }

  .heatmap-header {
    flex-direction: column;
    align-items: stretch;
  }

  .analysis-section__header {
    flex-direction: column;
  }

  .heatmap-range {
    justify-content: flex-start;
  }

  .cover-section__header {
    align-items: stretch;
    flex-direction: column;
  }

  .cover-toolbar {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .cover-toolbar__search {
    width: 100%;
  }

  .cover-summary-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .cover-hover-card {
    display: none;
  }

  .next-play-hero {
    min-height: 164px;
  }
}

</style>
