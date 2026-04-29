<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { dateZhCN, zhCN } from 'naive-ui'
import { colorAlpha, twColor } from '../../utils/colors'
import { getAppPrimaryColor } from '../../theme/primary'
import packageJson from '../../../../../package.json'

type Tone = 'mint' | 'blue' | 'amber' | 'purple' | 'rose' | 'green' | 'slate' | 'cyan' | 'orange' | 'magenta' | 'lime'
type ResourceChip = {
  id: string
  routeId: string
  categoryName: string
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
type FavoriteOverviewCard = {
  key: 'frequent' | 'recent' | 'dormant'
  title: string
  value: number
  meta: string
}
type CoverWallFilterKey = 'all' | 'recentRun' | 'favorite' | 'game' | 'recentAccess'
type CoverWallResource = {
  id: string
  title: string
  categoryId: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  coverPath: string
  coverUrl: string
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
type ContinueCard = {
  id: string
  categoryId: string
  time: string
  title: string
  categoryName: string
  categoryEmoji: string
  categoryColor: string
  type: string
  state: string
  note: string
  action: string
  tone: Tone
}
const appIsDark = inject('appIsDark', computed(() => true))
const appPrimaryColor = inject<ComputedRef<string>>('appPrimaryColor', computed(() => getAppPrimaryColor(isDark.value)))
const router = useRouter()
const appVersion = packageJson.version
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
      magentaSoft: colorAlpha(twColor('pink', 600), 0.18)
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
    magentaSoft: colorAlpha(twColor('pink', 500), 0.14)
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
const nextPlayHeroId = ref('')
const favoriteOverview = ref<FavoriteOverviewCard[]>([])
const favoriteOverviewLoading = ref(false)
const coverWallLoading = ref(false)
const coverWallActiveFilter = ref<CoverWallFilterKey>('all')
const coverWallItems = ref<CoverWallResource[]>([])
const coverWallCounts = ref<Record<CoverWallFilterKey, number>>({
  all: 0,
  recentRun: 0,
  favorite: 0,
  game: 0,
  recentAccess: 0
})
const coverWallRawItems = ref<Record<CoverWallFilterKey, any[]>>({
  all: [],
  recentRun: [],
  favorite: [],
  game: [],
  recentAccess: []
})
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
const continueLogsLoading = ref(false)
const continueLogsPage = ref(1)
const continueLogsPageSize = 10
const continueLogsTotal = ref(0)
let heatmapResizeObserver: ResizeObserver | null = null

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
    const categories = await window.api.db.getCategory()
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
          emoji: getCategoryEmoji(category, categoryName),
          label: `${categoryName} ${total}`,
          tone: getCategoryTone(categoryName, index),
          color,
          backgroundColor: getCategoryPillBackgroundColor(color)
        }
      })
    )

    categoryOverview.value = overviewItems
  } catch {
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
    const items = await window.api.db.getRecentlyAddedResources(7, 3)
    recentFeeds.value = await Promise.all(items.map(async (item: any) => {
      const categoryName = String(item?.categoryName ?? '').trim()
      const categoryEmoji = String(item?.categoryEmoji ?? '').trim()
      const coverPath = String(item?.coverPath ?? '').trim()
      let coverUrl = ''

      if (coverPath) {
        coverUrl = await window.api.dialog.getImagePreviewUrl(coverPath, {
          maxWidth: 640,
          maxHeight: 220,
          fit: 'cover',
          quality: 90
        }) ?? ''
      }

      return {
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
      }
    }))
  } catch {
    recentFeeds.value = []
  } finally {
    recentFeedsLoading.value = false
  }
}

const getRecentFeedStyle = (feed: RecentFeed) => {
  if (!feed.coverUrl) {
    return {}
  }

  return {
    backgroundImage: [
      'linear-gradient(90deg, rgba(10, 10, 10, 0.88) 0%, rgba(10, 10, 10, 0.72) 46%, rgba(10, 10, 10, 0.82) 100%)',
      `url("${feed.coverUrl}")`
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
    '--next-play-cover-url': `url("${item.coverUrl}")`
  }
}

const loadFavoriteOverview = async () => {
  favoriteOverviewLoading.value = true
  try {
    const items = await window.api.db.getHomeFavoriteOverview()
    favoriteOverview.value = Array.isArray(items)
      ? items.map((item: any) => ({
        key: String(item?.key ?? 'frequent') as FavoriteOverviewCard['key'],
        title: String(item?.title ?? '收藏速览'),
        value: Number(item?.value ?? 0),
        meta: String(item?.meta ?? '')
      }))
      : []
  } catch {
    favoriteOverview.value = []
  } finally {
    favoriteOverviewLoading.value = false
  }
}

const hydrateCoverWallItems = async (filterKey = coverWallActiveFilter.value) => {
  const rawItems = coverWallRawItems.value[filterKey] ?? []
  coverWallLoading.value = true
  try {
    const items = await Promise.all(rawItems.map(async (item: any, index: number) => {
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
        coverUrl
      }
    }))

    coverWallItems.value = items.filter((item) => item.id)
  } finally {
    coverWallLoading.value = false
  }
}

const loadCoverWallData = async () => {
  coverWallLoading.value = true
  try {
    const result = await window.api.db.getHomeCoverWallData(15)
    coverWallCounts.value = {
      all: Number(result?.counts?.all ?? 0),
      recentRun: Number(result?.counts?.recentRun ?? 0),
      favorite: Number(result?.counts?.favorite ?? 0),
      game: Number(result?.counts?.game ?? 0),
      recentAccess: Number(result?.counts?.recentAccess ?? 0)
    }
    coverWallRawItems.value = {
      all: Array.isArray(result?.items?.all) ? result.items.all : [],
      recentRun: Array.isArray(result?.items?.recentRun) ? result.items.recentRun : [],
      favorite: Array.isArray(result?.items?.favorite) ? result.items.favorite : [],
      game: Array.isArray(result?.items?.game) ? result.items.game : [],
      recentAccess: Array.isArray(result?.items?.recentAccess) ? result.items.recentAccess : []
    }
    await hydrateCoverWallItems()
  } catch {
    coverWallCounts.value = { all: 0, recentRun: 0, favorite: 0, game: 0, recentAccess: 0 }
    coverWallRawItems.value = { all: [], recentRun: [], favorite: [], game: [], recentAccess: [] }
    coverWallItems.value = []
  } finally {
    coverWallLoading.value = false
  }
}

const handleCoverFilterClick = async (filterKey: CoverWallFilterKey) => {
  if (coverWallActiveFilter.value === filterKey && coverWallItems.value.length) {
    return
  }

  coverWallActiveFilter.value = filterKey
  await hydrateCoverWallItems(filterKey)
}

const getCoverCardStyle = (item: CoverWallResource) => ({
  color: item.categoryColor,
  '--cover-card-url': item.coverUrl ? `url("${item.coverUrl}")` : 'none'
})

const shuffleArray = <T,>(items: T[]) => {
  const nextItems = [...items]
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = nextItems[index]
    nextItems[index] = nextItems[swapIndex]
    nextItems[swapIndex] = current
  }
  return nextItems
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
    const heroId = String(parsed?.heroId ?? '').trim()

    if (!pool.length) {
      return null
    }

    return {
      pool,
      heroId
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
      pool: nextPlayPool.value,
      heroId: nextPlayHeroId.value
    }))
  } catch {
    // ignore storage failures
  }
}

const buildNextPlayVisible = (heroId?: string) => {
  const pool = nextPlayPool.value
  if (!pool.length) {
    nextPlayVisible.value = []
    nextPlayHeroId.value = ''
    persistNextPlaySessionCache()
    return
  }

  const visibleItems = pool.slice(0, Math.min(9, pool.length))
  nextPlayVisible.value = visibleItems
  nextPlayHeroId.value = heroId && visibleItems.some((item) => item.id === heroId)
    ? heroId
    : (visibleItems[0]?.id ?? '')
  persistNextPlaySessionCache()
}

const nextPlayHero = computed(() => {
  return nextPlayVisible.value.find((item) => item.id === nextPlayHeroId.value) ?? nextPlayVisible.value[0] ?? null
})

const nextPlayMiniCards = computed(() => {
  if (!nextPlayHero.value) {
    return nextPlayVisible.value
  }

  return nextPlayVisible.value.filter((item) => item.id !== nextPlayHero.value?.id).slice(0, 8)
})

const loadNextPlayCards = async () => {
  const cachedState = readNextPlaySessionCache()
  if (cachedState?.pool?.length) {
    nextPlayPool.value = cachedState.pool.filter((item: any) => String(item?.id ?? '').trim())
    buildNextPlayVisible(cachedState.heroId)
    return
  }

  nextPlayLoading.value = true
  try {
    const rows = await window.api.db.getHomeNextPlayResources(9)
    const items = await Promise.all((Array.isArray(rows) ? rows : []).map(async (item: any, index: number) => {
      const categoryName = String(item?.categoryName ?? '').trim() || '未分类'
      const categoryEmoji = String(item?.categoryEmoji ?? '').trim() || getCategoryEmoji(item, categoryName)
      const tone = getCategoryTone(categoryName, index)
      const categoryColor = String(item?.categoryPillColor ?? '').trim() || getToneColor(tone)
      const coverPath = String(item?.coverPath ?? '').trim()
      let coverUrl = ''

      if (coverPath) {
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
      return candidate
    }))

    nextPlayPool.value = items.filter((item) => item.id)
    buildNextPlayVisible()
  } catch {
    nextPlayPool.value = []
    buildNextPlayVisible()
  } finally {
    nextPlayLoading.value = false
  }
}

const rotateNextPlayCards = () => {
  if (nextPlayPool.value.length <= 1) {
    return
  }

  nextPlayPool.value = shuffleArray(nextPlayPool.value)
  buildNextPlayVisible()
}

const launchNextPlayResource = async (item: NextPlayCard | null) => {
  const resourceId = String(item?.id ?? '').trim()
  const basePath = String(item?.basePath ?? '').trim()
  const fileName = String(item?.fileName ?? '').trim()

  if (!resourceId || !basePath || nextPlayLaunchingId.value === resourceId) {
    return
  }

  nextPlayLaunchingId.value = resourceId
  try {
    await window.api.service.launchResource(resourceId, basePath, fileName || null)
  } finally {
    nextPlayLaunchingId.value = ''
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

const activityHeatmapData = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Array.from({ length: heatmapRangeDays.value }, (_item, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (heatmapRangeDays.value - 1 - index))
    const dateKey = getDateKey(date)
    const heatmapDay = activityHeatmapByDate.value.get(dateKey)

    return {
      timestamp: date.getTime(),
      value: heatmapDay?.launchCount ?? 0
    }
  })
})

const heatmapActiveColors = computed(() => [
  '#233749',
  '#2f5a6f',
  '#3e8d93',
  '#63e2b7'
])
const heatmapThemeOverrides = computed(() => ({
  rectSizeLarge: `${heatmapRectSize.value}px`,
  xGapLarge: `${heatmapGapSize.value}px`,
  yGapLarge: `${heatmapGapSize.value}px`,
  borderRadiusLarge: `${Math.max(4, Math.round(heatmapRectSize.value * 0.28))}px`,
  fontSizeLarge: '12px'
}))

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
    12,
    Math.min(16, Math.floor((width - weekLabelWidth) / (columns + gaps * gapRatio)))
  )

  heatmapRectSize.value = nextRectSize
  heatmapGapSize.value = Math.max(5, Math.min(8, Math.round(nextRectSize * gapRatio)))
}

const getHeatmapDayByTimestamp = (timestamp: number) => {
  return activityHeatmapByDate.value.get(getDateKey(new Date(timestamp))) ?? null
}

const formatHeatmapDate = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(timestamp))
  } catch {
    return ''
  }
}

const loadActivityHeatmap = async () => {
  activityHeatmapLoading.value = true
  try {
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
  } finally {
    activityHeatmapLoading.value = false
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

const getContinueActionLabel = (categoryName: string) => {
  const normalizedName = categoryName.trim().toLowerCase()

  if (['游戏', 'game', 'galgame'].some((keyword) => normalizedName.includes(keyword))) {
    return '继续游玩'
  }

  if (['网站', '网址', 'website', 'web'].some((keyword) => normalizedName.includes(keyword))) {
    return '继续访问'
  }

  if (['漫画', 'comic', 'manga', '小说', '书', 'novel', 'book'].some((keyword) => normalizedName.includes(keyword))) {
    return '继续阅读'
  }

  if (
    ['电影', '番剧', '视频', '动漫', '音声', '音乐', 'audio', 'movie', 'anime', 'video', 'asmr', 'music']
      .some((keyword) => normalizedName.includes(keyword))
  ) {
    return '继续播放'
  }

  return '继续使用'
}

const loadContinueLogs = async (page = 1, append = false) => {
  const normalizedPage = Math.max(1, page)
  if (continueLogsLoading.value) {
    return
  }

  continueLogsLoading.value = true
  try {
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
        state: isRunning ? '正在运行' : `运行 ${formatRuntime(duration)}`,
        note: isRunning ? '当前还没有结束记录' : formatLogTime(item?.endTime),
        action: getContinueActionLabel(categoryName),
        tone: getCategoryTone(categoryName, baseIndex + index)
      }
    })

    continueCards.value = append
      ? [...continueCards.value, ...nextCards]
      : nextCards
  } catch {
    if (!append) {
      continueCards.value = []
      continueLogsTotal.value = 0
    }
  } finally {
    continueLogsLoading.value = false
  }
}

const handleContinueRailScroll = () => {
  const rail = continueRailRef.value
  if (!rail || continueLogsLoading.value || !continueLogsHasMore.value) {
    return
  }

  const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft
  if (remaining <= 120) {
    void loadContinueLogs(continueLogsPage.value + 1, true)
  }
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
    { label: '长期未访问', value: formatNumber(dashboardStats.value.longUnvisitedResources), tone: 'mint' },
    { label: '标签管理', value: '进入', tone: 'slate' }
  ]
})

const coverFilters = computed(() => ([
  { key: 'all' as const, label: `全部 ${formatNumber(coverWallCounts.value.all)}`, tone: 'mint' as Tone },
  { key: 'recentRun' as const, label: `最近运行 ${formatNumber(coverWallCounts.value.recentRun)}`, tone: 'slate' as Tone },
  { key: 'favorite' as const, label: `收藏 ${formatNumber(coverWallCounts.value.favorite)}`, tone: 'purple' as Tone },
  { key: 'game' as const, label: `游戏 ${formatNumber(coverWallCounts.value.game)}`, tone: 'blue' as Tone },
  { key: 'recentAccess' as const, label: `按最近访问 ${formatNumber(coverWallCounts.value.recentAccess)}`, tone: 'slate' as Tone }
]))

const toneClass = (tone: Tone) => `tone-${tone}`

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

const navigateToResourceDetail = (resourceItem: { id?: string; title?: string; categoryId?: string }) => {
  const resourceId = String(resourceItem?.id ?? '').trim()
  const title = String(resourceItem?.title ?? '').trim()
  const categoryId = String(resourceItem?.categoryId ?? '').trim()

  if (!resourceId || !title || !categoryId) {
    return
  }

  router.push({
    name: 'category',
    params: {
      id: categoryId
    },
    query: {
      keyword: title,
      resourceId,
      openDetail: '1'
    }
  })
}

const handleRecentFeedClick = (feed: RecentFeed) => {
  navigateToResourceDetail(feed)
}

onMounted(() => {
  void loadCategoryOverview()
  void loadRecentFeeds()
  void loadFavoriteOverview()
  void loadNextPlayCards()
  void loadCoverWallData()
  void loadDashboardStats()
  void loadActivityHeatmap()
  void loadContinueLogs()
  requestAnimationFrame(() => {
    updateHeatmapSizing()
    if (heatmapFrameRef.value) {
      heatmapResizeObserver = new ResizeObserver(updateHeatmapSizing)
      heatmapResizeObserver.observe(heatmapFrameRef.value)
    }
  })
})

onBeforeUnmount(() => {
  heatmapResizeObserver?.disconnect()
  heatmapResizeObserver = null
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
            <input v-model="searchKeyword" type="search" placeholder="搜索资源、标签、开发商" />
          </label>
          <button class="hero-search__button hero-search__button--primary" type="submit">搜索</button>
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
        <aside class="heatmap-stats" aria-label="热力图基础摘要">
          <article class="heatmap-stat-card">
            <span>本周启动</span>
            <strong>{{ activityHeatmapLoading ? '读取中' : `${formatNumber(heatmapWeekLaunchCount)} 次` }}</strong>
          </article>
          <article class="heatmap-stat-card heatmap-stat-card--mint">
            <span>连续活跃</span>
            <strong>{{ activityHeatmapLoading ? '读取中' : `${formatNumber(heatmapActiveStreak)} 天` }}</strong>
          </article>
          <article class="heatmap-stat-card heatmap-stat-card--blue">
            <span>峰值日</span>
            <strong>{{ activityHeatmapLoading ? '读取中' : heatmapPeakDayLabel }}</strong>
          </article>
        </aside>
        <div ref="heatmapFrameRef" class="activity-heatmap-frame">
          <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
            <n-heatmap
              class="activity-heatmap"
              :data="activityHeatmapData"
              :loading="activityHeatmapLoading"
              :active-colors="heatmapActiveColors"
              minimum-color="#1e2430"
              :tooltip="true"
              :first-day-of-week="0"
              :theme-overrides="heatmapThemeOverrides"
              size="large"
              fill-calendar-leading
            >
              <template #indicator-leading-text>
                少
              </template>
              <template #indicator-trailing-text>
                多
              </template>
              <template #tooltip="{ timestamp, value }">
                <div class="activity-heatmap__tooltip">
                  <strong>{{ formatHeatmapDate(timestamp) }}</strong>
                  <span>{{ formatNumber(Number(value ?? 0)) }} 次启动</span>
                  <span>{{ formatRuntime(getHeatmapDayByTimestamp(timestamp)?.totalRuntime ?? 0) }}</span>
                </div>
              </template>
            </n-heatmap>
          </n-config-provider>
        </div>
        <aside class="heatmap-stats heatmap-stats--insights" aria-label="热力图分析摘要">
          <article class="heatmap-stat-card">
            <span>最活跃时段</span>
            <strong>{{ activityHeatmapLoading ? '读取中' : activityHeatmapSummary.mostActiveHour }}</strong>
          </article>
          <article class="heatmap-stat-card heatmap-stat-card--mint">
            <span>最活跃星期</span>
            <strong>{{ activityHeatmapLoading ? '读取中' : activityHeatmapSummary.mostActiveWeekday }}</strong>
          </article>
          <article class="heatmap-stat-card heatmap-stat-card--blue">
            <span>常用类型</span>
            <strong>{{ activityHeatmapLoading ? '读取中' : activityHeatmapSummary.mostUsedCategory }}</strong>
          </article>
        </aside>
      </div>
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
        >
          <div class="next-play-hero__surface">
            <div class="next-play-card__copy">
              <strong>{{ nextPlayHero.title }}</strong>
              <small>{{ nextPlayHero.reason }}</small>
            </div>
            <button
              type="button"
              class="next-play-hero__action next-play-hero__action--primary"
              :disabled="nextPlayLaunchingId === nextPlayHero.id"
              @click="launchNextPlayResource(nextPlayHero)"
            >
              {{ nextPlayLaunchingId === nextPlayHero.id ? '打开中' : '立即打开' }}
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
            @click="navigateToResourceDetail(item)"
          >
            <strong>{{ item.title }}</strong>
          </button>
        </div>
      </div>
      <div v-else class="next-play-empty">
        暂无推荐_(:з)∠)_
      </div>
    </section>

    <section class="body-row">
      <div class="continue-panel">
        <div class="continue-panel__header">
          <h2>继续使用</h2>
        </div>
        <div v-if="continueLogsLoading && !continueCards.length" class="continue-empty">正在读取启动日志</div>
        <div v-else-if="!continueCards.length" class="continue-empty">还没有启动记录</div>
        <div
          v-else
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
              <button
                type="button"
                class="continue-card"
                :style="getContinueCardStyle(card)"
                @click="navigateToResourceDetail(card)"
              >
                <span class="continue-card__time">{{ card.time }}</span>
                <h3>{{ card.title }}</h3>
                <p>{{ card.type }}</p>
                <strong>{{ card.state }}</strong>
                <small>{{ card.note }}</small>
                <span class="continue-card__action">{{ card.action }}</span>
              </button>
            </n-timeline-item>
          </n-timeline>
          <div v-if="continueLogsLoading" class="continue-rail__status">加载中</div>
          <div v-else-if="continueLogsHasMore" class="continue-rail__status">继续向右滚动加载更多</div>
        </div>
      </div>

      <aside class="queue-panel">
        <h2>收藏速览</h2>
        <article v-if="favoriteOverviewLoading && !favoriteOverview.length" class="queue-item queue-item--empty">
          <strong>读取中</strong>
          <span>正在整理收藏概况</span>
        </article>
        <article v-else-if="!favoriteOverview.length" class="queue-item queue-item--empty">
          <strong>还没有收藏资源</strong>
          <span>去资源详情里点一下收藏就会出现在这里</span>
        </article>
        <div v-else class="queue-summary">
          <article
            v-for="item in favoriteOverview"
            :key="item.key"
            class="queue-summary__card"
            :class="`queue-summary__card--${item.key}`"
          >
            <strong>{{ item.title }}</strong>
            <span>{{ formatNumber(item.value) }} 项 · {{ item.meta }}</span>
          </article>
        </div>
      </aside>
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

    <section id="home-cover-wall" class="cover-section">
      <header class="cover-section__header">
        <div>
          <h2>封面墙</h2>
          <p>按封面快速找回最近运行、收藏过，或刚被你重新想起的那些资源。</p>
        </div>
      </header>

      <div class="cover-filters">
        <button
          v-for="filter in coverFilters"
          :key="filter.key"
          type="button"
          class="soft-chip"
          :class="[toneClass(filter.tone as Tone), { 'is-active': coverWallActiveFilter === filter.key }]"
          @click="handleCoverFilterClick(filter.key)"
        >
          {{ filter.label }}
        </button>
      </div>

      <div v-if="coverWallLoading && !coverWallItems.length" class="cover-empty">正在整理封面墙</div>
      <div v-else-if="!coverWallItems.length" class="cover-empty">暂时没有可展示的封面</div>
      <div v-else class="cover-grid">
        <button
          v-for="item in coverWallItems"
          :key="item.id"
          type="button"
          class="cover-card"
          :style="getCoverCardStyle(item)"
          @click="navigateToResourceDetail(item)"
        >
          <div class="cover-card__art"></div>
          <strong>{{ item.title }}</strong>
        </button>
      </div>
    </section>

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
  min-height: 100%;
  padding: 24px;
  background: var(--home-bg);
  color: var(--home-text-strong);
  overflow: auto;
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

.hero-card,
.heatmap-card,
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
  justify-content: center;
  gap: 12px;
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
  display: flex;
  min-height: 286px;
  flex-direction: column;
  gap: 16px;
  margin-top: 18px;
  padding: 16px;
  border-radius: 22px;
  border-color: rgba(255, 255, 255, 0.06);
  background: var(--home-panel);
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
  color: #8d8898;
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
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  padding: 0 14px;
  background: #1f2430;
  color: #dce3ef;
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
  background: #63e2b7;
  color: #10231c;
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
}

.heatmap-stat-card {
  display: flex;
  min-height: 70px;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 16px;
  background: #1b1b1b;
}

.heatmap-stat-card span {
  color: #868091;
  font-size: 12px;
  font-weight: 600;
}

.heatmap-stat-card strong {
  color: #f5f7fb;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.3;
  word-break: break-word;
}

.heatmap-stats--insights .heatmap-stat-card strong {
  font-size: 17px;
}

.heatmap-stat-card--mint strong {
  color: #63e2b7;
}

.heatmap-stat-card--blue strong {
  color: #8cb7ff;
}

.activity-heatmap-frame {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  overflow-x: hidden;
  padding-top: 4px;
}

.activity-heatmap-frame::-webkit-scrollbar {
  display: none;
}

.activity-heatmap {
  width: 100%;
  min-width: 0;
}

.activity-heatmap :deep(.n-heatmap__content) {
  width: 100%;
}

.activity-heatmap :deep(.n-heatmap__calendar-table) {
  border-spacing: 0;
  width: 100%;
  margin: 0;
}

.activity-heatmap :deep(.n-heatmap__month-label-cell) {
  padding-bottom: 14px;
  text-align: left;
}

.activity-heatmap :deep(.n-heatmap__day-cell) {
  padding: 0;
}

.activity-heatmap :deep(.n-heatmap__footer) {
  justify-content: flex-end;
  margin-top: 18px;
  color: #8d8898;
}

.activity-heatmap :deep(.n-heatmap__month-label-cell),
.activity-heatmap :deep(.n-heatmap__week-label-cell) {
  color: #7f7a89;
  font-size: 11px;
  font-weight: 600;
}

.activity-heatmap :deep(.n-heatmap__week-label-cell) {
  color: #66606d;
}

.activity-heatmap :deep(.n-heatmap-rect) {
  box-shadow: none;
  stroke: transparent;
}

.activity-heatmap__tooltip {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.activity-heatmap__tooltip strong {
  font-size: 12px;
}

.activity-heatmap__tooltip span {
  font-size: 12px;
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
  color: #63e2b7;
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
  grid-template-columns: minmax(320px, 2fr) minmax(0, 3fr);
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
  background: color-mix(in srgb, currentColor 24%, #14161a);
  color: inherit;
}

.next-play-hero::before,
.next-play-mini-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(180deg, rgba(10, 12, 16, 0.1) 0%, rgba(10, 12, 16, 0.32) 52%, rgba(10, 12, 16, 0.66) 100%),
    var(--next-play-cover-url);
  background-size: cover;
  background-position: center;
  opacity: 0.94;
  pointer-events: none;
}

.next-play-hero__surface {
  display: flex;
  min-height: 100%;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 18px 16px;
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
  background: #63e2b7;
  color: #10231c;
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
  color: #14161a;
  font-size: 11px;
  font-weight: 500;
}

.next-play-hero strong {
  color: #f5f7fb;
  font-size: 21px;
  line-height: 1.25;
  font-weight: 700;
  max-width: 16ch;
}

.next-play-hero small {
  color: #d8d3e0;
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
  height: 100%;
  aspect-ratio: 1.8 / 1;
  border: 0;
  padding: 0;
  border-radius: 12px;
  background: color-mix(in srgb, currentColor 18%, #14161a);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease;
}

.next-play-mini-card::before {
  background-image:
    linear-gradient(180deg, rgba(78, 82, 90, 0.16) 0%, rgba(58, 62, 70, 0.28) 48%, rgba(24, 27, 32, 0.72) 100%),
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
  color: #f8fafc;
  font-size: 11px;
  line-height: 1.3;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.body-row {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(260px, 1fr);
  gap: 18px;
  margin-top: 18px;
}

.continue-panel,
.queue-panel,
.cover-section {
  border-radius: 24px;
}

.continue-panel,
.queue-panel {
  padding: 18px;
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

.continue-timeline {
  width: max-content;
  padding: 0 12px 2px;
}

.continue-timeline :deep(.n-timeline-item) {
  width: max-content;
  padding-right: 24px;
}

.continue-timeline :deep(.n-timeline-item-content) {
  margin-top: 12px;
}

.continue-timeline :deep(.n-timeline-item-timeline) {
  width: 100%;
}

.continue-card {
  display: inline-flex;
  width: fit-content;
  min-width: 220px;
  max-width: 320px;
  min-height: 132px;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid currentColor;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
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

.continue-card strong {
  color: var(--home-text);
  font-size: 13px;
  line-height: 1.5;
}

.continue-card__action {
  display: inline-flex;
  width: fit-content;
  height: 32px;
  align-items: center;
  margin-top: auto;
  padding: 0 12px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 18%, var(--home-panel));
  color: inherit;
  font-size: 12px;
  font-weight: 800;
}

.continue-rail__status {
  display: inline-flex;
  min-width: 120px;
  height: 166px;
  align-items: center;
  justify-content: center;
  padding-top: 22px;
  color: var(--home-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.queue-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  color: var(--home-text-muted);
}

.queue-summary {
  display: grid;
  gap: 6px;
}

.queue-summary__card {
  display: flex;
  min-height: 78px;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid transparent;
}

.queue-summary__card--frequent {
  background: #263142;
}

.queue-summary__card--recent {
  background: #233137;
}

.queue-summary__card--dormant {
  background: #2b2140;
}

.queue-summary__card strong {
  color: #f8fafc;
  font-size: 14px;
  font-weight: 500;
}

.queue-summary__card span {
  color: #d3c8b8;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
}

.shortcut-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.cover-section {
  margin-top: 18px;
  padding: 18px;
}

.cover-section__header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 18px;
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
  margin-top: 14px;
}

.cover-filters button {
  cursor: pointer;
}

.cover-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr));
  gap: 14px;
  margin-top: 14px;
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
}

.cover-card__art {
  position: relative;
  min-height: 110px;
  border-radius: 16px;
  background-color: color-mix(in srgb, currentColor 38%, var(--home-elevated));
  transition: transform 0.18s ease, filter 0.18s ease;
  overflow: hidden;
}

.cover-card__art::before {
  content: '';
  position: absolute;
  inset: -8px;
  background-image:
    linear-gradient(180deg, rgba(14, 16, 20, 0.22) 0%, rgba(14, 16, 20, 0.34) 100%),
    var(--cover-card-url);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(20px) saturate(0.74) brightness(0.82);
  transform: scale(1.12);
  pointer-events: none;
}

.cover-card__art::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(180deg, rgba(18, 20, 24, 0.12) 0%, rgba(18, 20, 24, 0.28) 100%);
  opacity: 1;
  pointer-events: none;
}

.cover-card:hover .cover-card__art {
  transform: translateY(-2px);
  filter: brightness(1.04);
}

.cover-card:focus-visible {
  outline: 0;
}

.cover-card:focus-visible .cover-card__art {
  box-shadow: 0 0 0 3px var(--home-primary-focus);
}

.cover-card strong {
  overflow: hidden;
  color: var(--home-text-strong);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.tone-mint {
  color: var(--home-success);
  background: var(--home-success-soft);
}

.soft-chip.tone-mint.is-active {
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

@media (max-width: 1100px) {
  .hero-card,
  .body-row,
  .heatmap-card {
    grid-template-columns: 1fr;
  }

  .heatmap-body {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .heatmap-stats {
    grid-template-columns: 1fr;
  }

  .activity-heatmap-frame {
    grid-column: 1 / -1;
  }

  .stats-grid,
  .shortcut-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cover-grid {
    grid-template-columns: repeat(3, minmax(120px, 1fr));
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

  .heatmap-header {
    flex-direction: column;
    align-items: stretch;
  }

  .heatmap-range {
    justify-content: flex-start;
  }

  .heatmap-stats {
    grid-template-columns: 1fr;
  }

  .heatmap-body {
    grid-template-columns: 1fr;
  }

  .activity-heatmap-frame {
    grid-column: auto;
  }

  .cover-section__header {
    align-items: stretch;
    flex-direction: column;
  }

  .next-play-hero {
    min-height: 164px;
  }
}
</style>
