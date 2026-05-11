<script setup lang="ts">
import { computed, defineAsyncComponent, h, inject, ref, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronBackOutline, ChevronDownOutline, ChevronUpOutline } from '@vicons/ionicons5'
import { preloadCategoryDetailRoute } from '../../router'
import { colorAlpha, twColor } from '../../utils/colors'
import { confirmDialog, notify } from '../../utils/notification'
import { getAppPrimaryColor } from '../../theme/primary'
import DashboardHeroSection from './components/DashboardHeroSection.vue'
import DashboardPinnedSection from './components/DashboardPinnedSection.vue'
import DashboardNextPlaySection from './components/DashboardNextPlaySection.vue'
import { useCategoryDetailAudioContextMenu } from '../category-detail/composables/useCategoryDetailAudioContextMenu'
import { useCategoryDetailFormatters } from '../category-detail/composables/useCategoryDetailFormatters'
import { useCategoryDetailPresentation } from '../category-detail/composables/useCategoryDetailPresentation'
import { normalizeWebsiteIconSource, useCategoryPreviewAssets } from '../category-detail/composables/useCategoryPreviewAssets'
import { useCategoryVideoOrderDialog } from '../category-detail/composables/useCategoryVideoOrderDialog'
import { resolveCategoryProfile } from '../category-detail/profile-registry'
import { getWebsitePlaceholderEmoji } from '../../utils/website-placeholder-emoji'
import { sanitizeRichHtml } from '../../utils/rich-content-sanitizer'
import { useDashboardBootstrap } from './composables/useDashboardBootstrap'
import { useDashboardAnalysisPanel } from './composables/useDashboardAnalysisPanel'
import { useDashboardRecentFeeds } from './composables/useDashboardRecentFeeds'
import { useDashboardDeferredTasks } from './composables/useDashboardDeferredTasks'
import { useDashboardEditorAssistRuntime } from './composables/useDashboardEditorAssistRuntime'
import { useDashboardDetailRuntime } from './composables/useDashboardDetailRuntime'
import { useDashboardEditorRuntime } from './composables/useDashboardEditorRuntime'
import { useDashboardPinnedContinue } from './composables/useDashboardPinnedContinue'
import { useDashboardReaderPlayerBridge } from './composables/useDashboardReaderPlayerBridge'
import { ResourceLaunchMode } from '../../../../common/constants'
import packageJson from '../../../../../package.json'

const PictureViewer = defineAsyncComponent(() => import('../../components/PictureViewer.vue'))
const ComicReader = defineAsyncComponent(() => import('../../components/ComicReader.vue'))
const TextReader = defineAsyncComponent(() => import('../../components/TextReader.vue'))
const PdfReader = defineAsyncComponent(() => import('../../components/PdfReader.vue'))
const EpubReader = defineAsyncComponent(() => import('../../components/EpubReader.vue'))
const EbookReader = defineAsyncComponent(() => import('../../components/EbookReader.vue'))
const VideoPlayer = defineAsyncComponent(() => import('../../components/VideoPlayer.vue'))
const DashboardAnalysisSection = defineAsyncComponent(() => import('./components/DashboardAnalysisSection.vue'))
const DashboardCoverWallRuntimeSection = defineAsyncComponent(() => import('./components/DashboardCoverWallRuntimeSection.vue'))
const ResourceDetailDrawer = defineAsyncComponent(() => import('../category-detail/components/ResourceDetailDrawer.vue'))
const ResourceEditorDrawer = defineAsyncComponent(() => import('../category-detail/components/ResourceEditorDrawer.vue'))
const AudioCoverCandidateModal = defineAsyncComponent(() => import('../category-detail/components/AudioCoverCandidateModal.vue'))
const VideoCoverCandidateModal = defineAsyncComponent(() => import('../category-detail/components/VideoCoverCandidateModal.vue'))
const VideoSubCoverCandidateModal = defineAsyncComponent(() => import('../category-detail/components/VideoSubCoverCandidateModal.vue'))
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
type HomePinnedAddCandidate = {
  id: string
  title: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  meta: string
  coverUrl: string
  isPinned?: boolean
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
type DashboardCoverWallRuntimeExpose = {
  refreshCoverWallResource?: (resourceId: string) => Promise<void> | void
  updateCoverWallPinnedState?: (resourceId: string, isPinned: boolean) => void
  applyCoverWallSearchKeyword?: (keyword: string) => void
}
const appIsDark = inject('appIsDark', computed(() => true))
const appPrimaryColor = inject<ComputedRef<string>>('appPrimaryColor', computed(() => getAppPrimaryColor(isDark.value)))
const router = useRouter()
const route = useRoute()
const appVersion = packageJson.version
const emitRendererTiming = (message: string, meta?: Record<string, unknown>) => {
  window.api?.diagnostics?.logRenderer('info', message, meta)
}
const preloadCategoryDetailChunk = (reason: string) => {
  const startedAt = performance.now()
  const result = preloadCategoryDetailRoute()
  if (result.status === 'cached' || result.status === 'pending') {
    return
  }

  emitRendererTiming('category route preload', {
    reason,
    status: result.status
  })

  result.promise
    .then(() => {
      emitRendererTiming('category route preload end', {
        reason,
        status: result.status,
        elapsedMs: Math.round(performance.now() - startedAt)
      })
    })
    .catch((error) => {
      emitRendererTiming('category route preload end', {
        reason,
        status: 'error',
        elapsedMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error)
      })
    })
}
const scheduleCategoryDetailIdlePreload = () => {
  const preloadWhenDashboardStillActive = () => {
    if (route.name !== 'dashboard') {
      return
    }

    preloadCategoryDetailChunk('dashboard-idle-fallback')
  }
  const requestIdleCallback = (window as any).requestIdleCallback as undefined | ((
    callback: () => void,
    options?: { timeout?: number }
  ) => number)
  const scheduleIdlePreload = () => {
    if (route.name !== 'dashboard') {
      return
    }

    if (requestIdleCallback) {
      requestIdleCallback(preloadWhenDashboardStillActive, { timeout: 1800 })
      return
    }

    preloadWhenDashboardStillActive()
  }

  window.setTimeout(scheduleIdlePreload, 2200)
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
const {
  dashboardDisposed,
  isDashboardPreviewWorkAllowed,
  measureDashboardTask,
  startDashboardBootstrap,
  stopDashboardBootstrap
} = useDashboardBootstrap({
  emitRendererTiming,
  routeNameGetter: () => route.name
})
const isDark = computed(() => Boolean(appIsDark.value))
const primaryColor = computed(() => appPrimaryColor.value)
const searchKeyword = ref('')
const coverWallRuntimeRef = ref<DashboardCoverWallRuntimeExpose | null>(null)
const coverWallSectionRef = ref<HTMLElement | null>(null)

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

const nextPlayLoading = ref(false)
const nextPlayLaunchingId = ref('')
const nextPlayPool = ref<NextPlayCard[]>([])
const nextPlayVisible = ref<NextPlayCard[]>([])
const homePinnedCards = ref<HomePinnedCard[]>([])
const homePinnedLoading = ref(false)
const homePinnedPage = ref(0)
const homePinnedLaunchingId = ref('')
const homePinnedDeletingId = ref('')
const homePinnedAddingId = ref('')
const coverWallLaunchingId = ref('')
const homePinnedMaxCount = 20
const homePinnedAddCandidates = ref<HomePinnedAddCandidate[]>([])
const homePinnedAddCandidatesLoading = ref(false)
const homePinnedAddKeyword = ref('')
const homePinnedAddTotal = ref(0)
const continueRailRef = ref<HTMLElement | null>(null)
const continueCards = ref<ContinueCard[]>([])
const continueLaunchingId = ref('')
const continueRailShowBackButton = ref(false)
const continueLogsLoading = ref(false)
const continueLogsPage = ref(1)
const continueLogsTotal = ref(0)
const showHomeVideoOrderModal = ref(false)
const homeVideoSubCoverPreviewUrls = ref<Record<string, string>>({})
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

const dashboardAnalysis = useDashboardAnalysisPanel({
  isDark,
  themeTokens,
  defaultCategoryPillColor,
  measureDashboardTask,
  colorAlpha,
  resolveCategoryPillColor,
  getCategoryEmoji,
  getCategoryTone: (categoryName, index = 0) => getCategoryTone(categoryName, index),
  getCategoryPillBackgroundColor,
  getToneColor,
  isValidCssColor,
  formatNumber,
  formatRuntime
})

const {
  recentFeeds,
  recentFeedsLoading,
  loadRecentFeeds,
  getRecentFeedStyle
} = useDashboardRecentFeeds({
  dashboardDisposed,
  measureDashboardTask,
  isDashboardPreviewWorkAllowed,
  toCssUrlValue,
  feedCoverOverlay: computed(() => themeTokens.value.feedCoverOverlay),
  formatAddedTime
})

const refreshCoverWallResource = async (resourceId: string) => {
  await coverWallRuntimeRef.value?.refreshCoverWallResource?.(resourceId)
}

const scrollToCoverWallSection = () => {
  coverWallSectionRef.value?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  })
}

const jumpToCoverWallSearch = (keyword = '') => {
  coverWallRuntimeRef.value?.applyCoverWallSearchKeyword?.(keyword)
  scrollToCoverWallSection()
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

const getHomePinnedAddCandidateMeta = (item: any) => {
  const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
  const lastAccessValue = item?.lastAccessTime ?? item?.latestStartTime
  const createTimeValue = item?.createTime
  const lastAccessText = formatPinnedRelativeTime(lastAccessValue)
  if (lastAccessText) {
    return `${categoryName} · 上次打开 ${lastAccessText}`
  }

  const addedText = formatAddedTime(createTimeValue)
  return `${categoryName} · ${addedText}`
}

const mapHomePinnedAddCandidate = async (item: any): Promise<HomePinnedAddCandidate | null> => {
  const id = String(item?.id ?? '').trim()
  if (!id) {
    return null
  }

  const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
  const categoryEmoji = String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, categoryName)
  const categoryColor = String(item?.categoryPillColor ?? item?.categoryColor ?? '').trim() || defaultCategoryPillColor
  const rawCoverUrl = String(item?.coverUrl ?? '').trim()
  const coverPath = String(item?.coverPath ?? '').trim()
  let coverUrl = rawCoverUrl

  if (!coverUrl && coverPath && isDashboardPreviewWorkAllowed()) {
    coverUrl = await window.api.dialog.getImagePreviewUrl(coverPath, {
      maxWidth: 640,
      maxHeight: 220,
      fit: 'cover',
      quality: 88
    }) ?? ''
  }

  return {
    id,
    title: String(item?.title ?? '未命名资源').trim() || '未命名资源',
    categoryName,
    categoryEmoji,
    categoryColor,
    meta: String(item?.meta ?? '').trim() || getHomePinnedAddCandidateMeta(item),
    coverUrl,
    isPinned: Boolean(item?.isPinned)
  }
}

const loadHomePinnedAddCandidates = async (keyword = '') => {
  const pinnedIds = new Set(homePinnedCards.value.map((item) => String(item.id).trim()).filter(Boolean))
  const trimmedKeyword = keyword.trim()
  homePinnedAddKeyword.value = trimmedKeyword
  homePinnedAddCandidatesLoading.value = true

  try {
    if (trimmedKeyword) {
      const result = await window.api.db.getHomeCoverWallData({
        filter: 'all',
        limit: 15,
        keyword: trimmedKeyword
      })
      const rows = Array.isArray(result?.items) ? result.items : []
      homePinnedAddTotal.value = Number(result?.total ?? rows.length)
      const mapped = await Promise.all(rows.map((row) => mapHomePinnedAddCandidate(row)))
      homePinnedAddCandidates.value = mapped
        .filter((item): item is HomePinnedAddCandidate => Boolean(item?.id))
        .slice(0, 15)
      return
    }

    const result = await window.api.db.getHomeCoverWallData({
      filter: 'recentRun',
      limit: 15
    })
    const recentRunRows = Array.isArray(result?.items) ? result.items : []
    const recentRunMapped = await Promise.all(recentRunRows.map((row) => mapHomePinnedAddCandidate(row)))
    const deduped = new Map<string, HomePinnedAddCandidate>()

    recentRunMapped.forEach((item) => {
      if (item?.id && !pinnedIds.has(String(item.id)) && !deduped.has(item.id)) {
        deduped.set(item.id, {
          ...item,
          isPinned: false
        })
      }
    })

    if (deduped.size < 15) {
      const supplementRows = await window.api.db.getHomeNextPlayResources(15)
      const supplementMapped = await Promise.all(
        (Array.isArray(supplementRows) ? supplementRows : []).map((row) => mapHomePinnedAddCandidate(row))
      )

      supplementMapped.forEach((item) => {
        if (deduped.size >= 15) {
          return
        }
        if (item?.id && !pinnedIds.has(String(item.id)) && !deduped.has(item.id)) {
          deduped.set(item.id, {
            ...item,
            isPinned: false
          })
        }
      })
    }

    homePinnedAddTotal.value = deduped.size
    homePinnedAddCandidates.value = [...deduped.values()].slice(0, 15)
  } catch (error) {
    homePinnedAddCandidates.value = []
    homePinnedAddTotal.value = 0
    notify('error', '添加首页固定', error instanceof Error ? error.message : '读取候选资源失败')
  } finally {
    homePinnedAddCandidatesLoading.value = false
  }
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
    if (!dashboardDisposed.value) {
      nextPlayPool.value = []
      buildNextPlayVisible()
    }
  } finally {
    if (!dashboardDisposed.value) {
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

  homeDetailAudioTreeLoading.value = true
  try {
    const audioTree = await window.api.dialog.getDirectoryAudioTree(String(targetResource.basePath ?? ''), { includeMetadata: false })
    homeDetailAudioTree.value = await decorateHomeDetailAudioTree(targetResource, Array.isArray(audioTree) ? audioTree : [])
  } finally {
    homeDetailAudioTreeLoading.value = false
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

const {
  showDetailDrawer: showHomeDetailDrawer,
  detailDrawerWidth: homeDetailDrawerWidth,
  selectedDetailResource: homeDetailResource,
  detailScreenshotPaths: homeDetailScreenshotPaths,
  detailAudioTree: homeDetailAudioTree,
  detailAudioTreeLoading: homeDetailAudioTreeLoading,
  detailAudioContextMenuVisible: homeDetailAudioContextMenuVisible,
  detailAudioContextMenuX: homeDetailAudioContextMenuX,
  detailAudioContextMenuY: homeDetailAudioContextMenuY,
  detailAudioContextMenuTarget: homeDetailAudioContextMenuTarget,
  detailCurrentScreenshotIndex: homeDetailCurrentScreenshotIndex,
  detailRatingDraft: homeDetailRatingDraft,
  showDeleteScreenshotConfirm: showHomeDeleteScreenshotConfirm,
  detailCategoryName: homeDetailCategoryName,
  detailCategorySettings: homeDetailCategorySettings,
  detailCategoryProfile: homeDetailCategoryProfile,
  detailActorFilterLabel: homeDetailActorFilterLabel,
  detailIsWebsite: homeDetailIsWebsite,
  detailIsSoftware: homeDetailIsSoftware,
  detailIsManga: homeDetailIsManga,
  detailIsAsmr: homeDetailIsAsmr,
  detailIsAudio: homeDetailIsAudio,
  detailIsNovel: homeDetailIsNovel,
  detailIsVideoCategory: homeDetailIsVideoCategory,
  detailIsVideoFolderCategory: homeDetailIsVideoFolderCategory,
  detailStartText: homeDetailStartText,
  detailStats: homeDetailDetailStats,
  detailLogs: homeDetailDetailLogs,
  visibleDetailLogs: homeDetailVisibleDetailLogs,
  hasMoreDetailLogs: homeDetailHasMoreDetailLogs,
  noMore: homeDetailNoMore,
  ratingComment: homeDetailRatingComment,
  hasPendingRatingChange: homeDetailHasPendingRatingChange,
  detailDisplayPath: homeDetailDetailDisplayPath,
  detailWebsiteUrl: homeDetailWebsiteUrl,
  detailWebsiteIsDownloadLink: homeDetailWebsiteIsDownloadLink,
  detailWebsiteAddressLabel: homeDetailWebsiteAddressLabel,
  detailWebsiteIconLabel: homeDetailWebsiteIconLabel,
  detailWebsitePlaceholderEmoji: homeDetailWebsitePlaceholderEmoji,
  detailWebsiteCoverPlaceholderText: homeDetailWebsiteCoverPlaceholderText,
  detailOpenFolderText: homeDetailOpenFolderText,
  detailWebsiteFaviconPath: homeDetailWebsiteFaviconPath,
  detailCurrentScreenshotPath: homeDetailCurrentScreenshotPath,
  detailCanLaunch: homeDetailCanLaunch,
  detailCanStop: homeDetailCanStop,
  detailCategoryDescriptionBoxStyle: homeDetailCategoryDescriptionBoxStyle,
  detailStores: homeDetailStores,
  detailNormalizedEngineList: homeDetailNormalizedEngineList,
  detailNormalizedEngineOptionList: homeDetailNormalizedEngineOptionList,
  detailNormalizedLanguageList: homeDetailNormalizedLanguageList,
  handleDetailDrawerResizeStart: handleHomeDetailDrawerResizeStart,
  handleDetailDrawerShowUpdate: handleHomeDetailDrawerShowUpdate,
  loadDetailCategoryAssets: loadHomeDetailCategoryAssets,
  openDetailDrawer: openHomeDetailDrawer,
  handleDetailOpenResourcePath: handleHomeDetailOpenResourcePath,
  handleDetailOpenStoreWebsite: handleHomeDetailOpenStoreWebsite,
  handleDetailCopyText: handleHomeDetailCopyText,
  handleDetailPreviousScreenshot: handleHomeDetailPreviousScreenshot,
  handleDetailNextScreenshot: handleHomeDetailNextScreenshot,
  handleDetailDeleteCurrentScreenshot: handleHomeDetailDeleteCurrentScreenshot,
  handleDetailOpenScreenshotFolder: handleHomeDetailOpenScreenshotFolder,
  handleDetailLoadMoreLogs: handleHomeDetailLoadMoreLogs,
  handleDetailRatingUpdate: handleHomeDetailRatingUpdate,
  handleDetailSubmitRating: handleHomeDetailSubmitRating
} = useDashboardDetailRuntime({
  getCategoryMap: () => categoryMap.value,
  nextPlayPool,
  nextPlayVisible,
  notify,
  getWebsitePlaceholderEmoji,
  resolveDashboardCategorySettings,
  resolveCategoryProfile,
  resolveHomeStoreIcon,
  resolveHomeEngineIcon,
  getWebsiteResourceUrl,
  buildDisplayDirectoryPath,
  getRatingComment,
  ensureDashboardCategorySource: (categoryId, fallbackSource) => ensureDashboardCategorySource(categoryId, fallbackSource),
  decorateHomeDetailAudioTree
})
const homeDetailDescriptionHtml = computed(() => sanitizeRichHtml(String(homeDetailResource.value?.description ?? '')))

const {
  showEditResourceDrawer: showHomeEditResourceDrawer,
  editFormData: homeEditFormData,
  editingResourceId: homeEditingResourceId,
  editBasePathFormItemRef: homeEditBasePathFormItemRef,
  editFetchResourceInfoLoading: homeEditFetchResourceInfoLoading,
  editVideoCoverFrameLoading: homeEditVideoCoverFrameLoading,
  showEditAudioCoverCandidateModal: showHomeEditAudioCoverCandidateModal,
  showEditVideoCoverCandidateModal: showHomeEditVideoCoverCandidateModal,
  showEditVideoSubCoverCandidateModal: showHomeEditVideoSubCoverCandidateModal,
  showEditSoftwareScriptModal: showHomeEditSoftwareScriptModal,
  editAuthorSelectOptions: homeEditAuthorSelectOptions,
  editTagSelectOptions: homeEditTagSelectOptions,
  editTypeSelectOptions: homeEditTypeSelectOptions,
  editWebsiteTypeOptions: homeEditWebsiteTypeOptions,
  editAudioCoverCandidates: homeEditAudioCoverCandidates,
  editVideoCoverCandidates: homeEditVideoCoverCandidates,
  editVideoSubCoverCandidateItems: homeEditVideoSubCoverCandidateItems,
  editSoftwareScriptDraft: homeEditSoftwareScriptDraft,
  editSoftwareScriptRuntimePath: homeEditSoftwareScriptRuntimePath,
  editSoftwareScriptRuntimes: homeEditSoftwareScriptRuntimes,
  editCategoryName: homeEditCategoryName,
  editCategorySettings: homeEditCategorySettings,
  editActorFilterLabel: homeEditActorFilterLabel,
  editIsSoftware: homeEditIsSoftware,
  editIsAsmr: homeEditIsAsmr,
  editIsAudio: homeEditIsAudio,
  editIsNovel: homeEditIsNovel,
  editIsVideoFolderCategory: homeEditIsVideoFolderCategory,
  editModelComponent: homeEditModelComponent,
  editModelComponentKey: homeEditModelComponentKey,
  editDescriptionLabel: homeEditDescriptionLabel,
  editDescriptionPlaceholder: homeEditDescriptionPlaceholder,
  editAuthorInputPlaceholder: homeEditAuthorInputPlaceholder,
  editHasBasePath: homeEditHasBasePath,
  editHasCoverPath: homeEditHasCoverPath,
  editSoftwareScriptShellType: homeEditSoftwareScriptShellType,
  editSoftwareScriptPlaceholder: homeEditSoftwareScriptPlaceholder,
  formRules: homeEditFormRules,
  normalizeSelectedValues,
  normalizeAudioAuthorList,
  joinAudioAuthorNames,
  syncEditAudioAuthorFields: syncHomeEditAudioAuthorFields,
  openEditResource: openHomeEditResource,
  assignEditFormRef: assignHomeEditFormRef,
  assignEditBasePathFormItemRef: assignHomeEditBasePathFormItemRef,
  validateBasePathExtension: validateHomeEditBasePathExtension,
  getBasePathValidationMessage: getHomeEditBasePathValidationMessage,
  handleEditAudioAuthorsUpdate: handleHomeEditAudioAuthorsUpdate,
  handleEditTagsChange: handleHomeEditTagsChange,
  handleEditTypesChange: handleHomeEditTypesChange,
  handleEditReset: handleHomeEditReset,
  handleEditRestoreDefault: handleHomeEditRestoreDefault,
  handleEditDrawerShowUpdate: handleHomeEditDrawerShowUpdate,
  handleEditSubmit: handleHomeEditSubmit
} = useDashboardEditorRuntime({
  showDetailDrawer: showHomeDetailDrawer,
  selectedDetailResource: homeDetailResource,
  notify: (type, title, content) => showNotifyByType(type, title, content),
  resolveDashboardCategorySettings,
  resolveCategoryProfile,
  ensureDashboardCategorySource: (categoryId, fallbackSource) => ensureDashboardCategorySource(categoryId, fallbackSource),
  resolveHomeResourceContext,
  loadDetailCategoryAssets: loadHomeDetailCategoryAssets,
  buildDisplayBasePath,
  normalizeWebsiteUrl,
  getFileExtension,
  getLoadHomePinnedCards: () => loadHomePinnedCards,
  refreshCoverWallResource
})

const { formatVideoFrameTime } = useCategoryDetailFormatters()

const {
  coverPreviewSrc: homeEditCoverPreviewSrc,
  detailCoverPreviewSrc: homeDetailCoverPreviewSrc,
  detailScreenshotPreviewSrc: homeDetailScreenshotPreviewSrc,
  detailWebsiteFaviconSrc: homeDetailWebsiteFaviconSrc,
  detailGalleryImageUrls: homeDetailGalleryImageUrls,
  resolveCoverPreviewUrl: resolveHomeEditCoverPreviewUrl,
  resolveVideoSubCoverPreviewUrl,
  resolveAudioPlayerCoverPreviewUrl,
  resolveVideoPlayerCoverPreviewUrl
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

const handleHomeDetailEditResource = (resource: any) => {
  void openHomeEditResource(resource)
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

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(Math.max(0, Math.floor(Number(value) || 0)))
}

function formatRuntime(seconds: number) {
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


function getToneColor(tone: Tone) {
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

const {
  loadHomePinnedCards,
  visibleHomePinnedCards,
  canMoveHomePinnedPrev,
  canMoveHomePinnedNext,
  homePinnedPageDots,
  moveHomePinnedPage,
  selectHomePinnedPage,
  loadContinueLogs,
  handleContinueRailScroll,
  scrollContinueRailToStart,
  handleContinueRailWheel,
  getContinueCardColor,
  getContinueCardStyle
} = useDashboardPinnedContinue({
  homePinnedCards,
  homePinnedLoading,
  homePinnedPage,
  continueRailRef,
  continueCards,
  continueLogsLoading,
  continueLogsPage,
  continueLogsTotal,
  continueRailShowBackButton,
  categoryOverview: dashboardAnalysis.categoryOverview,
  isDark,
  defaultCategoryPillColor,
  measureDashboardTask,
  getCategoryEmoji,
  getCategoryTone,
  getToneColor,
  normalizeDateValue,
  formatPinnedRelativeTime,
  formatLogTime,
  formatLaunchMode: (value, usePlayTerms) => formatLaunchMode(value as string | null | undefined, usePlayTerms),
  formatRuntime,
  getContinueActionLabel,
  colorAlpha,
  isValidCssColor
})

const {
  categoryOverview,
  categoryOverviewLoading,
  categoryMap,
  dashboardStatsLoading,
  dashboardStats,
  activityHeatmap,
  activityHeatmapSummary,
  activityHeatmapLoading,
  analysisChartLoading,
  heatmapFrameRef,
  heatmapRectSize,
  heatmapGapSize,
  heatmapRangeDays,
  activeAnalysisTab,
  activeCategoryDistributionLabel,
  activeHealthInsightLabel,
  healthInsightTooltip,
  loadCategoryOverview,
  loadDashboardStats,
  updateHeatmapSizing,
  loadActivityHeatmap,
  loadAnalysisCharts,
  shortcuts,
  analysisTabs,
  analysisTabOptions,
  healthInsightTooltipStyle,
  heatmapWeekLaunchCount,
  heatmapActiveStreak,
  heatmapPeakDayLabel,
  heatmapSubtitle,
  activeAnalysisMeta,
  categoryDistributionChartOption,
  categoryDistributionLegendItems,
  handleCategoryDistributionActiveChange,
  handleCategoryDistributionChartMouseOver,
  handleCategoryDistributionChartMouseOut,
  healthInsightSegments,
  showHealthInsightTooltip,
  moveHealthInsightTooltip,
  hideHealthInsightTooltip,
  usageDistributionChartOption,
  longUnvisitedDistributionChartOption,
  longUnvisitedInsightText,
  addedTrendChartOption,
  addedTrendInsightText,
  usageInsightSummaryText,
  setupHeatmapFrameObserver,
  cleanupHeatmapFrameObserver,
  usageInsightItems,
  handleHealthInsightActiveChange
} = dashboardAnalysis

void heatmapFrameRef

const setDashboardHeatmapFrameRef = (element: Element | null) => {
  heatmapFrameRef.value = element as HTMLElement | null
}

const handleSearch = (keywordValue?: string) => {
  const keyword = String(keywordValue ?? searchKeyword.value).trim()
  searchKeyword.value = ''
  jumpToCoverWallSearch(keyword)
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

const handleRecentFeedClick = (feed: any) => {
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

  if (event.target !== event.currentTarget) {
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

const createSelectOption = (value: string) => ({
  label: value,
  value
})

const homeEditAssistRuntime = useDashboardEditorAssistRuntime({
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
  softwareScriptRuntimes: homeEditSoftwareScriptRuntimes,
  softwareScriptShellType: homeEditSoftwareScriptShellType,
  categoryName: homeEditCategoryName,
  categorySettings: homeEditCategorySettings,
  isSoftwareCategory: homeEditIsSoftware,
  isVideoFolderCategory: homeEditIsVideoFolderCategory,
  detailIsAsmr: homeEditIsAsmr,
  websiteTypeOptions: homeEditWebsiteTypeOptions,
  normalizedLanguageList: homeDetailNormalizedLanguageList,
  showNotifyByType: showHomeEditNotifyByType,
  confirmDialog,
  getFileNameWithoutExtension,
  getResourceNameFromBasePath,
  normalizeAudioAuthorList,
  joinAudioAuthorNames,
  syncAudioAuthorFields: syncHomeEditAudioAuthorFields,
  validateBasePathExtension: validateHomeEditBasePathExtension,
  getBasePathValidationMessage: getHomeEditBasePathValidationMessage,
  normalizeSelectedValues,
  normalizeWebsiteUrl,
  resolveCoverPreviewUrl: resolveHomeEditCoverPreviewUrl,
  isEditorActive: () => Boolean(showHomeEditResourceDrawer.value)
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
  handleCheckGameEngine: handleHomeEditorCheckGameEngine,
  handleConfirmSoftwareScript: handleHomeEditConfirmSoftwareScript,
  closeAudioCoverCandidateModal: closeHomeEditAudioCoverCandidateModal,
  handleUseAudioCoverCandidate: handleUseHomeEditAudioCoverCandidate,
  closeVideoCoverCandidateModal: closeHomeEditVideoCoverCandidateModal,
  handleUseVideoCoverCandidate: handleUseHomeEditVideoCoverCandidate,
  closeVideoSubCoverCandidateModal: closeHomeEditVideoSubCoverCandidateModal,
  handleUseVideoSubCoverCandidate: handleUseHomeEditVideoSubCoverCandidate,
  fixedVideoCoverCandidates: homeEditFixedVideoCoverCandidates,
  randomVideoCoverCandidates: homeEditRandomVideoCoverCandidates
} = homeEditAssistRuntime

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

const {
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
} = useDashboardReaderPlayerBridge({
  homeDetailResource,
  homeDetailCategoryProfile,
  homeDetailScreenshotPaths,
  homeDetailGalleryItems,
  homeDetailCurrentScreenshotIndex,
  homeDetailAudioTree,
  homePictureViewerImagePaths,
  homePictureViewerInitialIndex,
  homePictureViewerResourceIds,
  homeCurrentPictureViewerResourceId,
  showHomePictureViewer,
  homeComicReaderImagePaths,
  homeComicReaderInitialIndex,
  homeCurrentComicReaderResourceId,
  showHomeComicReader,
  homeTextReaderFilePath,
  homeTextReaderTitle,
  homeTextReaderInitialProgress,
  homeCurrentTextReaderResourceId,
  showHomeTextReader,
  homePdfReaderFilePath,
  homePdfReaderTitle,
  homePdfReaderInitialProgress,
  homeCurrentPdfReaderResourceId,
  showHomePdfReader,
  homeEpubReaderFilePath,
  homeEpubReaderTitle,
  homeEpubReaderInitialProgress,
  homeCurrentEpubReaderResourceId,
  showHomeEpubReader,
  homeEbookReaderFilePath,
  homeEbookReaderTitle,
  homeEbookReaderInitialProgress,
  homeCurrentEbookReaderResourceId,
  showHomeEbookReader,
  homeVideoPlayerPlaylist,
  homeVideoPlayerInitialPath,
  homeVideoPlayerInitialTime,
  homeVideoPlayerTitle,
  showHomeVideoPlayer,
  showNotifyByType: (type, title, content) => showNotifyByType(type, title, content),
  getResourceFilePath,
  getHomeResourceTitle,
  getFileExtension,
  getFileNameWithoutExtension,
  normalizePathValue,
  normalizeAudioPath,
  getHomeDetailVideoSubItems,
  isHomeVideoFolderResource,
  resolveHomeResourceAudioTree,
  collectAudioTreeTracks,
  collectVideoTreeTracks,
  collectAudioTreeImagePaths,
  sortHomeVideoTracksBySubItems,
  resolveAudioPlayerCoverPreviewUrl,
  resolveVideoPlayerCoverPreviewUrl
})

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

const launchCoverWallResource = async (item: any) => {
  const resourceId = String(item?.id ?? '').trim()
  const categoryId = String(item?.categoryId ?? '').trim()
  if (!resourceId || !categoryId || coverWallLaunchingId.value === resourceId) {
    return
  }

  coverWallLaunchingId.value = resourceId
  try {
    const [detailResult, categoryResult] = await Promise.all([
      window.api.service.getResourceDetail(resourceId),
      categoryMap.value[categoryId]
        ? Promise.resolve(categoryMap.value[categoryId])
        : window.api.db.getCategoryById(categoryId)
    ])

    const resource = detailResult?.data ?? detailResult
    if (!resource) {
      notify('error', '封面墙', '未能读取资源详情')
      return
    }

    const categoryInfo = resolveDashboardCategorySettings(categoryResult ?? {})
    const categoryProfile = resolveCategoryProfile(categoryInfo)
    await openHomeResourceByCategoryProfile(resource, categoryProfile)
  } catch (error) {
    notify('error', '封面墙', error instanceof Error ? error.message : '打开资源失败')
  } finally {
    coverWallLaunchingId.value = ''
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
      coverWallRuntimeRef.value?.updateCoverWallPinnedState?.(resourceId, false)
      await loadHomePinnedCards()
      await loadHomePinnedAddCandidates(homePinnedAddKeyword.value)
      await refreshCoverWallResource(resourceId)
    }
  } catch (error) {
    notify('error', '取消首页固定', error instanceof Error ? error.message : '移除失败')
  } finally {
    homePinnedDeletingId.value = ''
  }
}

const handleHomePinnedAdd = () => {
  void loadHomePinnedAddCandidates('')
}

const handleHomePinnedAddSearch = (keyword: string) => {
  void loadHomePinnedAddCandidates(keyword)
}

const handleCoverWallHomePin = (item: any) => {
  void handleAddHomePin({
    id: String(item?.id ?? '').trim(),
    title: String(item?.title ?? '未命名资源').trim() || '未命名资源',
    categoryName: String(item?.categoryName ?? '未分类').trim() || '未分类',
    categoryEmoji: String(item?.categoryEmoji ?? '').trim() || '📁',
    categoryColor: String(item?.categoryColor ?? item?.categoryPillColor ?? '').trim() || defaultCategoryPillColor,
    meta: getHomePinnedAddCandidateMeta(item),
    coverUrl: String(item?.coverUrl ?? '').trim()
  })
}

const handleAddHomePin = async (item: HomePinnedAddCandidate) => {
  const resourceId = String(item?.id ?? '').trim()
  const alreadyPinned = homePinnedCards.value.some((card) => String(card?.id ?? '').trim() === resourceId)
  const pinnedLimitReached = !alreadyPinned && homePinnedCards.value.length >= homePinnedMaxCount
  if (!resourceId || homePinnedAddingId.value === resourceId || alreadyPinned) {
    if (alreadyPinned) {
      notify('info', '固定到首页', '该资源已经固定到首页')
    }
    return
  }
  if (pinnedLimitReached) {
    notify('warning', '固定到首页', `首页固定最多支持 ${homePinnedMaxCount} 个资源，请先移除部分固定项`)
    return
  }

  homePinnedAddingId.value = resourceId
  try {
    const result = await window.api.service.updateResourceHomePin(resourceId, true)
    const resultType = result?.type ?? 'info'
    const resultMessage = result?.message ?? '操作完成'
    notify(resultType, '固定到首页', resultMessage)

    if (resultType !== 'error') {
      coverWallRuntimeRef.value?.updateCoverWallPinnedState?.(resourceId, true)
      await loadHomePinnedCards()
      await loadHomePinnedAddCandidates(homePinnedAddKeyword.value)
      await refreshCoverWallResource(resourceId)
    }
  } catch (error) {
    notify('error', '固定到首页', error instanceof Error ? error.message : '固定失败')
  } finally {
    homePinnedAddingId.value = ''
  }
}

useDashboardDeferredTasks({
  startDashboardBootstrap,
  stopDashboardBootstrap,
  routePerfGetter: () => (window as any).__nrmCategoryRoutePerf,
  immediateTasks: [
    loadHomePinnedCards,
    loadDashboardStats
  ],
  deferredTasks: [
    { label: 'categoryOverview', delayMs: 180, task: loadCategoryOverview },
    { label: 'continueLogs', delayMs: 320, task: loadContinueLogs },
    { label: 'activityHeatmap', delayMs: 520, task: loadActivityHeatmap },
    { label: 'analysisCharts', delayMs: 620, task: loadAnalysisCharts },
    { label: 'recentFeeds', delayMs: 1800, task: loadRecentFeeds },
    { label: 'nextPlayCards', delayMs: 2400, task: () => loadNextPlayCards() }
  ],
  afterFrame: () => {
    emitRendererTiming('dashboard lifecycle', {
      phase: 'afterFrame'
    })
    void window.api.service.startBackgroundServices('dashboard-after-frame', 1200)
    scheduleCategoryDetailIdlePreload()
    updateHeatmapSizing()
    setupHeatmapFrameObserver()
  },
  cleanup: () => {
    cleanupHeatmapFrameObserver()
  }
})
</script>

<template>
  <div class="home-page">
    <DashboardHeroSection
      :app-version="appVersion"
      :category-overview-loading="categoryOverviewLoading"
      :category-overview="categoryOverview"
      :search-keyword="searchKeyword"
      :recent-feeds-loading="recentFeedsLoading"
      :recent-feeds="recentFeeds"
      :stats="stats"
      :get-recent-feed-style="getRecentFeedStyle"
      @category-click="handleCategoryPillClick"
      @recent-feed-click="handleRecentFeedClick"
      @update:search-keyword="searchKeyword = $event"
      @search="handleSearch"
    />

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

      <DashboardPinnedSection
        :home-pinned-cards="homePinnedCards"
        :home-pinned-loading="homePinnedLoading"
        :home-pinned-count="homePinnedCards.length"
        :home-pinned-max-count="homePinnedMaxCount"
        :home-pinned-add-candidates="homePinnedAddCandidates"
        :home-pinned-add-candidates-loading="homePinnedAddCandidatesLoading"
        :home-pinned-add-keyword="homePinnedAddKeyword"
        :home-pinned-add-total="homePinnedAddTotal"
        :home-pinned-adding-id="homePinnedAddingId"
        :visible-home-pinned-cards="visibleHomePinnedCards"
        :home-pinned-page-dots="homePinnedPageDots"
        :home-pinned-page="homePinnedPage"
        :can-move-home-pinned-prev="canMoveHomePinnedPrev"
        :can-move-home-pinned-next="canMoveHomePinnedNext"
        :home-pinned-launching-id="homePinnedLaunchingId"
        :home-pinned-deleting-id="homePinnedDeletingId"
        :get-home-pinned-card-style="getHomePinnedCardStyle"
        @add="handleHomePinnedAdd"
        @search="handleHomePinnedAddSearch"
        @jump-cover-wall="jumpToCoverWallSearch(homePinnedAddKeyword)"
        @move-page="moveHomePinnedPage"
        @select-page="selectHomePinnedPage"
        @open-card="openHomePinnedCard"
        @card-keydown="handleHomePinnedCardKeydown"
        @remove="handleRemoveHomePin"
        @launch="launchHomePinnedResource"
        @pin="handleAddHomePin"
      />
    </section>

    <DashboardNextPlaySection
      :next-play-loading="nextPlayLoading"
      :next-play-visible="nextPlayVisible"
      :next-play-hero="nextPlayHero"
      :next-play-mini-cards="nextPlayMiniCards"
      :next-play-launching-id="nextPlayLaunchingId"
      :get-next-play-card-style="getNextPlayCardStyle"
      :get-next-play-action-label="getNextPlayActionLabel"
      @swap="rotateNextPlayCards"
      @open-detail="openHomeDetailDrawer"
      @launch="launchNextPlayResource"
      @promote="promoteNextPlayCard"
    />

    <DashboardAnalysisSection
      :is-dark="isDark"
      :activity-heatmap-loading="activityHeatmapLoading"
      :analysis-chart-loading="analysisChartLoading"
      :activity-heatmap="activityHeatmap"
      :activity-heatmap-summary="activityHeatmapSummary"
      :heatmap-rect-size="heatmapRectSize"
      :heatmap-gap-size="heatmapGapSize"
      :heatmap-range-days="heatmapRangeDays"
      :heatmap-week-launch-count="heatmapWeekLaunchCount"
      :heatmap-active-streak="heatmapActiveStreak"
      :heatmap-peak-day-label="heatmapPeakDayLabel"
      :heatmap-subtitle="heatmapSubtitle"
      :active-analysis-tab="activeAnalysisTab"
      :analysis-tabs="analysisTabs"
      :analysis-tab-options="analysisTabOptions"
      :active-analysis-meta="activeAnalysisMeta"
      :category-distribution-chart-option="categoryDistributionChartOption"
      :category-distribution-legend-items="categoryDistributionLegendItems"
      :active-category-distribution-label="activeCategoryDistributionLabel"
      :active-health-insight-label="activeHealthInsightLabel"
      :health-insight-segments="healthInsightSegments"
      :health-insight-tooltip="healthInsightTooltip"
      :health-insight-tooltip-style="healthInsightTooltipStyle"
      :long-unvisited-distribution-chart-option="longUnvisitedDistributionChartOption"
      :long-unvisited-insight-text="longUnvisitedInsightText"
      :usage-distribution-chart-option="usageDistributionChartOption"
      :usage-insight-items="usageInsightItems"
      :usage-insight-summary-text="usageInsightSummaryText"
      :added-trend-chart-option="addedTrendChartOption"
      :added-trend-insight-text="addedTrendInsightText"
      :shortcuts="shortcuts"
      :format-number="formatNumber"
      :set-heatmap-frame-ref="setDashboardHeatmapFrameRef"
      :handle-category-distribution-active-change="handleCategoryDistributionActiveChange"
      :handle-category-distribution-chart-mouse-over="handleCategoryDistributionChartMouseOver"
      :handle-category-distribution-chart-mouse-out="handleCategoryDistributionChartMouseOut"
      :handle-health-insight-active-change="handleHealthInsightActiveChange"
      :show-health-insight-tooltip="showHealthInsightTooltip"
      :move-health-insight-tooltip="moveHealthInsightTooltip"
      :hide-health-insight-tooltip="hideHealthInsightTooltip"
      @update:heatmap-range-days="heatmapRangeDays = $event"
      @update:active-analysis-tab="activeAnalysisTab = $event"
    />

    <section ref="coverWallSectionRef" class="cover-wall-anchor">
    <DashboardCoverWallRuntimeSection
      ref="coverWallRuntimeRef"
      :category-overview="categoryOverview"
      :default-category-pill-color="defaultCategoryPillColor"
        :get-category-emoji="getCategoryEmoji"
        :get-category-tone="getCategoryTone"
        :get-tone-color="getToneColor"
      :color-alpha="colorAlpha"
      :format-added-time="formatAddedTime"
      :to-css-url-value="toCssUrlValue"
      :home-pinned-adding-id="homePinnedAddingId"
      :home-pinned-count="homePinnedCards.length"
      :home-pinned-max-count="homePinnedMaxCount"
      @open-detail="openHomeDetailDrawer"
      @open-resource="launchCoverWallResource"
      @pin-home="handleCoverWallHomePin"
    />
    </section>

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
      v-if="showHomeDetailDrawer || homeDetailResource"
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
      :handle-detail-drawer-resize-start="handleHomeDetailDrawerResizeStart"
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
      @update:show="handleHomeDetailDrawerShowUpdate"
      @update:show-delete-screenshot-confirm="showHomeDeleteScreenshotConfirm = $event"
    >
      <template #description-content>
        <div
          class="detail-drawer__value detail-drawer__value--description detail-drawer__value--rich rich-markdown-content"
          v-html="homeDetailDescriptionHtml"
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
      v-if="showHomeEditResourceDrawer || homeEditingResourceId"
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
      @update:show="handleHomeEditDrawerShowUpdate"
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
      @close="handleHomeEditDrawerShowUpdate(false)"
      @submit-edit="handleHomeEditSubmit"
      @reset-edit="handleHomeEditReset"
      @restore-default-edit="handleHomeEditRestoreDefault"
    />

    <AudioCoverCandidateModal
      v-if="showHomeEditAudioCoverCandidateModal"
      :show="showHomeEditAudioCoverCandidateModal"
      :candidates="homeEditAudioCoverCandidates"
      @update:show="showHomeEditAudioCoverCandidateModal = $event"
      @select="handleUseHomeEditAudioCoverCandidate"
      @after-leave="closeHomeEditAudioCoverCandidateModal"
    />

    <VideoCoverCandidateModal
      v-if="showHomeEditVideoCoverCandidateModal"
      :show="showHomeEditVideoCoverCandidateModal"
      :fixed-candidates="homeEditFixedVideoCoverCandidates"
      :random-candidates="homeEditRandomVideoCoverCandidates"
      :format-time="formatVideoFrameTime"
      @update:show="showHomeEditVideoCoverCandidateModal = $event"
      @select="handleUseHomeEditVideoCoverCandidate"
      @after-leave="closeHomeEditVideoCoverCandidateModal"
    />

    <VideoSubCoverCandidateModal
      v-if="showHomeEditVideoSubCoverCandidateModal"
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

.cover-wall-anchor {
  scroll-margin-top: 20px;
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

.next-play-section,
.continue-panel,
.queue-panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-color: var(--home-border);
  background: var(--home-panel);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
}

.next-play-section h2,
.continue-panel h2,
.queue-panel h2 {
  color: var(--home-text-strong);
  font-size: 17px;
  line-height: 1.2;
  font-weight: 800;
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
  color: var(--home-primary);
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
    grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1.9fr);
    gap: 16px;
    align-items: stretch;
    min-width: 0;
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
    min-width: 0;
    min-height: 236px;
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
    align-content: stretch;
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }

.next-play-mini-card {
  display: block;
  min-height: 0;
  min-width: 0;
  width: 100%;
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
      grid-template-columns: minmax(196px, 0.82fr) minmax(0, 2.08fr);
      gap: 14px;
    }

    .next-play-hero {
      min-height: 222px;
    }

    .next-play-hero__surface {
      gap: 10px;
      padding: 14px 16px 14px;
    }

    .next-play-hero strong {
      font-size: 18px;
      max-width: 15ch;
    }

    .next-play-hero small {
      font-size: 11px;
      max-width: 24ch;
    }

    .next-play-hero__action {
      min-width: 88px;
      height: 34px;
      padding: 0 14px;
    }

    .next-play-mini-grid {
      gap: 8px 10px;
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
.queue-panel {
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
  color: var(--home-primary);
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
  background: var(--home-primary);
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

  @media (max-width: 1280px) {
    .body-row {
    grid-template-columns: 1fr;
  }

    .next-play-layout {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .next-play-hero {
      min-height: 220px;
      height: auto;
    }

    .next-play-mini-grid {
      height: auto;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }

    .queue-pinned-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

@media (max-width: 720px) {
    .home-page {
      padding: 16px;
    }

    .next-play-layout {
      gap: 10px;
    }

    .next-play-hero {
      min-height: 198px;
    }

    .next-play-hero__surface {
      padding: 12px 14px 12px;
    }

    .next-play-hero strong {
      font-size: 17px;
      max-width: 100%;
    }

    .next-play-hero small {
      max-width: 100%;
    }

    .next-play-mini-grid {
      gap: 8px;
    }

    .next-play-mini-card {
      aspect-ratio: 1.45 / 1;
      border-radius: 10px;
    }

    .next-play-mini-card small {
      bottom: 25px;
      font-size: 9px;
    }

    .next-play-mini-card strong {
      bottom: 8px;
      font-size: 10px;
    }

    .queue-pinned-grid {
      grid-template-columns: 1fr;
    }

    .next-play-hero {
      min-height: 164px;
    }
  }

</style>
