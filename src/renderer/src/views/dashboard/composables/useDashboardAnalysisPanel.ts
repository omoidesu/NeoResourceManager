import {
  computed,
  nextTick,
  ref,
  watch,
  type ComputedRef
} from 'vue'
import type { ComposeOption } from 'echarts/core'
import type { PieSeriesOption, BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption, GraphicComponentOption } from 'echarts/components'

type EChartsOption = ComposeOption<
  PieSeriesOption
  | BarSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | GraphicComponentOption
>

type Tone = 'mint' | 'blue' | 'amber' | 'purple' | 'rose' | 'green' | 'slate' | 'cyan' | 'orange' | 'magenta' | 'lime'
type AnalysisTabKey = 'category' | 'health' | 'longUnvisited' | 'usage' | 'addedTrend'
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
type MeasureDashboardTask = <T>(
  label: string,
  task: () => Promise<T>,
  extra?: Record<string, unknown>
) => Promise<T>

export function useDashboardAnalysisPanel(options: {
  isDark: ComputedRef<boolean>
  themeTokens: ComputedRef<Record<string, string>>
  defaultCategoryPillColor: string
  measureDashboardTask: MeasureDashboardTask
  colorAlpha: (color: string, alpha: number) => string
  resolveCategoryPillColor: (category: any) => string
  getCategoryEmoji: (category: any, categoryName: string) => string
  getCategoryTone: (categoryName: string, index?: number) => Tone
  getCategoryPillBackgroundColor: (color: string) => string
  getToneColor: (tone: Tone) => string
  isValidCssColor: (value: string) => boolean
  formatNumber: (value: number) => string
  formatRuntime: (value: number) => string
}) {
  const categoryOverview = ref<ResourceChip[]>([])
  const categoryOverviewLoading = ref(false)
  const categoryMap = ref<Record<string, any>>({})
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
  const dashboardLongUnvisitedBuckets = ref<Array<{ label: string; value: number }>>([])
  const dashboardAddedTrend = ref<Array<{ date: string; count: number }>>([])
  const analysisChartLoading = ref(false)
  const usageInsightItems = ref<UsageInsightItem[]>([])
  const activeAnalysisTab = ref<AnalysisTabKey>('category')
  const activeCategoryDistributionLabel = ref<string | null>(null)
  const activeHealthInsightLabel = ref<string | null>(null)
  const healthInsightTooltip = ref({
    visible: false,
    x: 0,
    y: 0,
    label: '',
    value: 0,
    percent: 0
  })
  let heatmapResizeObserver: ResizeObserver | null = null

  const loadCategoryOverview = async () => {
    categoryOverviewLoading.value = true
    try {
      await options.measureDashboardTask('loadCategoryOverview', async () => {
        const categories = await window.api.db.getCategory()
        categoryMap.value = Object.fromEntries(
          (Array.isArray(categories) ? categories : []).map((category: any) => [String(category?.id ?? '').trim(), category])
        )
        const overviewItems = await Promise.all(
          categories.map(async (category: any, index: number) => {
            const categoryId = String(category?.id ?? '').trim()
            const categoryName = String(category?.name ?? '').trim() || '未命名分类'
            let total = 0
            const color = options.resolveCategoryPillColor(category)

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
              emoji: options.getCategoryEmoji(category, categoryName),
              label: `${categoryName} ${total}`,
              tone: options.getCategoryTone(categoryName, index),
              color,
              backgroundColor: options.getCategoryPillBackgroundColor(color)
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

  const loadDashboardStats = async () => {
    dashboardStatsLoading.value = true
    try {
      await options.measureDashboardTask('loadDashboardStats', async () => {
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

  const getDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

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
      await options.measureDashboardTask('loadActivityHeatmap', async () => {
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
      await options.measureDashboardTask('loadAnalysisCharts', async () => {
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
                color: options.isValidCssColor(rawColor) ? rawColor : options.defaultCategoryPillColor
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

  const shortcuts = computed(() => {
    if (dashboardStatsLoading.value) {
      return [
        { label: '资源失效', value: '读取中', tone: 'rose' as Tone },
        { label: '封面缺失', value: '读取中', tone: 'purple' as Tone },
        { label: '长期未访问', value: '读取中', tone: 'mint' as Tone },
        { label: '标签管理', value: '进入', tone: 'slate' as Tone }
      ]
    }

    return [
      { label: '资源失效', value: options.formatNumber(dashboardStats.value.missingResources), tone: 'rose' as Tone },
      { label: '封面缺失', value: options.formatNumber(dashboardStats.value.missingCovers), tone: 'purple' as Tone },
      { label: '沉睡资源', value: options.formatNumber(dashboardStats.value.longUnvisitedResources), tone: 'mint' as Tone },
      { label: '标签管理', value: '进入', tone: 'slate' as Tone }
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

  const healthInsightTooltipStyle = computed(() => ({
    '--analysis-health-tooltip-border': options.themeTokens.value.overlayBorder,
    '--analysis-health-tooltip-bg': options.themeTokens.value.overlayBg,
    '--analysis-health-tooltip-shadow': options.themeTokens.value.shadowMedium,
    '--analysis-health-tooltip-strong': options.themeTokens.value.overlayTextStrong,
    '--analysis-health-tooltip-text': options.themeTokens.value.overlayTextMuted
  }))

  const categoryDistributionItems = computed(() => {
    const sortedItems = [...categoryOverview.value]
      .filter((item) => Number(item.count ?? 0) > 0)
      .sort((left, right) => right.count - left.count)
    const leadingItems = sortedItems.slice(0, 4).map((item) => ({
      label: item.categoryName,
      displayLabel: item.categoryName,
      value: Number(item.count ?? 0),
      color: options.isValidCssColor(item.color) ? item.color : options.getToneColor(item.tone),
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
        color: options.themeTokens.value.textFaint,
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
      color: options.themeTokens.value.success
    },
    {
      label: '封面缺失',
      value: dashboardStats.value.missingCovers,
      color: options.themeTokens.value.primary
    },
    {
      label: '资源失效',
      value: dashboardStats.value.missingResources,
      color: options.themeTokens.value.error
    },
    {
      label: '沉睡资源',
      value: dashboardStats.value.longUnvisitedResources,
      color: options.themeTokens.value.warning
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
    if (activeAnalysisTab.value === 'health') return '问题资源与维护压力'
    if (activeAnalysisTab.value === 'longUnvisited') return '沉睡资源风险分层'
    if (activeAnalysisTab.value === 'usage') return '近30天资源使用分布'
    if (activeAnalysisTab.value === 'addedTrend') return '近 14 天新增变化'
    return '分类资源占比'
  })

  const activeAnalysisMeta = computed(() => {
    if (activeAnalysisTab.value === 'health') {
      return `问题资源 ${options.formatNumber(
        healthInsightItems.value
          .filter((item) => item.label !== '正常资源')
          .reduce((total, item) => total + item.value, 0)
      )} 项`
    }

    if (activeAnalysisTab.value === 'longUnvisited') {
      return longUnvisitedAllZero.value
        ? '当前没有沉睡资源'
        : `当前沉睡资源 ${options.formatNumber(longUnvisitedTotal.value)} 项`
    }

    if (activeAnalysisTab.value === 'usage') {
      return '近 30 天启动统计'
    }

    if (activeAnalysisTab.value === 'addedTrend') {
      return `近 14 天新增 ${options.formatNumber(addedTrendTotal.value)} 项`
    }

    return `分类数量 ${options.formatNumber(categoryDistributionCategoryCount.value)}`
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
        value: options.formatNumber(activeItem.value),
        label: activeItem.displayLabel,
        hint: activeItem.isAggregate
          ? `包含 ${options.formatNumber(activeItem.mergedCount)} 个分类`
          : `占比 ${activeItem.percent}%`
      }
    }

    return {
      value: options.formatNumber(categoryDistributionTotal.value),
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
        backgroundColor: options.themeTokens.value.chartTooltipBg,
        borderColor: options.themeTokens.value.chartTooltipBorder,
        borderWidth: 1,
        textStyle: {
          color: options.themeTokens.value.chartTooltipText,
          fontSize: 12
        },
        formatter: (params: any) => {
          const target = categoryDistributionLegendItems.value.find((item) => item.label === String(params?.name ?? ''))
          const percent = Number(params?.percent ?? target?.percent ?? 0).toFixed(0)

          if (target?.isAggregate) {
            const representative = target.representativeNames.length
              ? `<br/>代表分类：${target.representativeNames.join(' / ')}`
              : ''
            return `${target.displayLabel}<br/>${options.formatNumber(Number(target.value ?? 0))} 项 · ${percent}%<br/>包含 ${options.formatNumber(target.mergedCount)} 个分类${representative}`
          }

          return `${target?.displayLabel ?? params?.name ?? '未分类'}<br/>${options.formatNumber(Number(params?.value ?? 0))} 项 · ${percent}%`
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
            fill: options.themeTokens.value.chartTooltipText,
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
            fill: options.themeTokens.value.chartTextMuted,
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
            fill: options.themeTokens.value.chartTextSoft,
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
            color: options.themeTokens.value.chartTrackStrong,
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
              shadowColor: options.themeTokens.value.chartShadow
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
    if (params?.componentType !== 'series') return
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
    if (!healthInsightTooltip.value.visible) return
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
      grid: { left: 0, right: 6, top: 4, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
          shadowStyle: { color: options.themeTokens.value.chartTrack }
        },
        backgroundColor: options.themeTokens.value.chartTooltipBg,
        borderColor: options.themeTokens.value.chartTooltipBorder,
        borderWidth: 1,
        textStyle: { color: options.themeTokens.value.chartTooltipText, fontSize: 12 },
        formatter: (params: any) => {
          const first = Array.isArray(params) ? params[0] : params
          return `${first?.name ?? '未分类'}<br/>${options.formatNumber(Number(first?.value ?? 0))} 次`
        }
      },
      xAxis: { type: 'value', max: displayMax, show: false },
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
            top: { color: options.themeTokens.value.chartTooltipText, fontWeight: 700 },
            normal: { color: options.themeTokens.value.textStrong, fontWeight: 600 }
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
            itemStyle: { color: item.color, borderRadius: 999 },
            label: {
              color: item.count === maxCount ? options.themeTokens.value.chartTooltipText : options.themeTokens.value.textStrong,
              fontWeight: item.count === maxCount ? 800 : 700
            }
          })),
          barWidth: 11,
          showBackground: true,
          backgroundStyle: { color: options.themeTokens.value.chartTrack, borderRadius: 999 },
          label: {
            show: true,
            position: 'right',
            distance: 10,
            color: options.themeTokens.value.chartTooltipText,
            fontSize: 12,
            fontWeight: 700,
            formatter: ({ value }: any) => options.formatNumber(Number(value ?? 0)),
            rich: {
              top: { color: options.themeTokens.value.chartTooltipText, fontWeight: 800 },
              normal: { color: options.themeTokens.value.textStrong, fontWeight: 700 }
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
      grid: { left: '14%', right: '14%', top: 16, bottom: 28, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: options.themeTokens.value.chartTrackStrong } },
        backgroundColor: options.themeTokens.value.chartTooltipBg,
        borderColor: options.themeTokens.value.chartTooltipBorder,
        borderWidth: 1,
        textStyle: { color: options.themeTokens.value.chartTooltipText, fontSize: 12 },
        formatter: (params: any) => {
          const first = Array.isArray(params) ? params[0] : params
          const matched = items.find((item) => item.label === String(first?.name ?? ''))
          const value = Number(matched?.value ?? first?.value ?? 0)
          const sleepingPercent = sleepingTotal > 0 ? (value / sleepingTotal) * 100 : 0
          const totalPercent = resourceTotal > 0 ? (value / resourceTotal) * 100 : 0
          if (isEmptyState) return `${matched?.detailLabel ?? first?.name ?? '区间'}<br/>0 项`
          return `${matched?.detailLabel ?? first?.name ?? '区间'}<br/>${options.formatNumber(value)} 项<br/>占沉睡资源 ${sleepingPercent.toFixed(1)}%<br/>占总资源 ${totalPercent.toFixed(1)}%`
        }
      },
      xAxis: {
        type: 'category',
        data: items.map((item) => item.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: options.themeTokens.value.chartTextMuted, fontSize: 11, interval: 0 }
      },
      yAxis: { type: 'value', min: 0, max: isEmptyState ? 1 : undefined, show: false },
      series: [
        {
          type: 'bar',
          barWidth: 28,
          barCategoryGap: '28%',
          data: items.map((item) => ({
            value: item.value > 0 ? item.value : isEmptyState ? 0.03 : zeroBarPlaceholder,
            itemStyle: {
              color: isEmptyState ? options.themeTokens.value.chartTrackStrong : item.color,
              opacity: item.value > 0 ? 1 : isEmptyState ? 0.72 : 0.28,
              borderRadius: [8, 8, 0, 0]
            },
            rawValue: item.value
          })),
          label: {
            show: true,
            position: 'top',
            color: isEmptyState ? options.themeTokens.value.chartTextMuted : options.themeTokens.value.chartTooltipText,
            fontSize: 11,
            fontWeight: 700,
            formatter: (params: any) => options.formatNumber(Number(params?.data?.rawValue ?? params?.value ?? 0))
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
      grid: { left: 6, right: 6, top: 14, bottom: 20 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: options.themeTokens.value.chartTrackStrong } },
        backgroundColor: options.themeTokens.value.chartTooltipBg,
        borderColor: options.themeTokens.value.chartTooltipBorder,
        borderWidth: 1,
        textStyle: { color: options.themeTokens.value.chartTooltipText, fontSize: 12 },
        formatter: (params: any) => {
          const first = Array.isArray(params) ? params[0] : params
          const value = Number(first?.data?.rawValue ?? first?.value ?? 0)
          const percent = total > 0 ? (value / total) * 100 : 0
          return `${first?.name ?? ''}<br/>新增 ${options.formatNumber(value)} 项<br/>占近 14 天新增 ${percent.toFixed(1)}%`
        }
      },
      xAxis: {
        type: 'category',
        data: items.map((item) => item.date.slice(5).replace('-', '/')),
        axisLine: { show: true, lineStyle: { color: options.themeTokens.value.chartAxis, width: 1 } },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 10,
          interval: (index: number) => index % 2 === 0,
          rich: {
            peak: { color: options.themeTokens.value.textStrong, fontWeight: 600 },
            normal: { color: options.themeTokens.value.chartTextSoft, fontWeight: 500 }
          },
          formatter: (value: string) => value === peakLabel ? `{peak|${value}}` : `{normal|${value}}`
        }
      },
      yAxis: { type: 'value', show: false },
      series: [
        {
          type: 'bar',
          barWidth: '48%',
          emphasis: {
            itemStyle: {
              opacity: 1,
              color: options.themeTokens.value.primary
            }
          },
          data: items.map((item) => ({
            value: item.count > 0 ? Math.max(item.count, minVisibleBar) : 0,
            rawValue: item.count,
            itemStyle: {
              color: item.count === peakCount && peakCount > 0
                ? options.colorAlpha(options.themeTokens.value.primary, 0.98)
                : options.colorAlpha(options.themeTokens.value.primary, 0.72),
              borderRadius: [6, 6, 0, 0]
            },
            label: {
              color: item.count === peakCount && peakCount > 0 ? options.themeTokens.value.chartTooltipText : options.themeTokens.value.textStrong
            }
          }))
        }
      ]
    }
  })

  const setupHeatmapFrameObserver = () => {
    if (!heatmapFrameRef.value) return
    heatmapResizeObserver?.disconnect()
    heatmapResizeObserver = new ResizeObserver(updateHeatmapSizing)
    heatmapResizeObserver.observe(heatmapFrameRef.value)
  }

  const cleanupHeatmapFrameObserver = () => {
    heatmapResizeObserver?.disconnect()
    heatmapResizeObserver = null
  }

  return {
    categoryOverview,
    categoryOverviewLoading,
    categoryMap,
    dashboardStatsLoading,
    dashboardStats,
    activityHeatmap,
    activityHeatmapSummary,
    activityHeatmapLoading,
    heatmapFrameRef,
    heatmapRectSize,
    heatmapGapSize,
    heatmapRangeDays,
    dashboardLongUnvisitedBuckets,
    dashboardAddedTrend,
    analysisChartLoading,
    usageInsightItems,
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
    activeAnalysisTitle,
    activeAnalysisMeta,
    categoryDistributionChartOption,
    categoryDistributionLegendItems,
    handleCategoryDistributionActiveChange,
    handleCategoryDistributionChartMouseOver,
    handleCategoryDistributionChartMouseOut,
    healthInsightSegments,
    handleHealthInsightActiveChange,
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
    cleanupHeatmapFrameObserver
  }
}
