<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type HeatmapDay = {
  date: string
  launchCount: number
  totalRuntime: number
}

type HeatmapCell = {
  key: string
  date: Date
  label: string
  launchCount: number
  totalRuntime: number
  inRange: boolean
  level: number
}

type HeatmapWeek = {
  key: string
  monthLabel: string
  monthIndex: number
  days: HeatmapCell[]
}

const props = withDefaults(defineProps<{
  days: HeatmapDay[]
  loading?: boolean
  rangeDays: 30 | 84 | 365
  rectSize?: number
  gapSize?: number
  dark?: boolean
}>(), {
  loading: false,
  rectSize: 14,
  gapSize: 5,
  dark: true
})

const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
const tooltipState = ref<{
  visible: boolean
  left: number
  top: number
  cell: HeatmapCell | null
}>({
  visible: false,
  left: 0,
  top: 0,
  cell: null
})

const heatmapColorLevels = computed(() => (
  props.dark
    ? ['#232833', '#28465d', '#2f6177', '#43979a', '#63e2b7']
    : ['#d7dde8', '#b9c9e5', '#8fb6de', '#67c9b2', '#3ecf8e']
))
const heatmapRootRef = ref<HTMLElement | null>(null)
const monthsTrackRef = ref<HTMLElement | null>(null)
const weeksRef = ref<HTMLElement | null>(null)
const resolvedRectSize = ref(Math.max(8, Number(props.rectSize) || 14))
const resolvedGapSize = ref(Math.max(3, Number(props.gapSize) || 5))
let resizeObserver: ResizeObserver | null = null

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const formatTooltipDate = (date: Date) =>
  `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`

const formatRuntime = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainSeconds = totalSeconds % 60

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours} 小时 ${minutes} 分钟`
    }
    return `${hours} 小时`
  }

  if (minutes > 0) {
    return `${minutes} 分钟`
  }

  return `${remainSeconds} 秒`
}

const heatmapDataByDate = computed(() => {
  return new Map(
    (Array.isArray(props.days) ? props.days : [])
      .filter((item) => String(item?.date ?? '').trim())
      .map((item) => [String(item.date), item])
  )
})

const positiveLaunchCounts = computed(() =>
  (Array.isArray(props.days) ? props.days : [])
    .map((item) => Math.max(0, Number(item?.launchCount ?? 0)))
    .filter((value) => value > 0)
)

const maxLaunchCount = computed(() => Math.max(0, ...positiveLaunchCounts.value))

const resolveLevel = (launchCount: number, inRange: boolean) => {
  if (!inRange || launchCount <= 0) {
    return 0
  }

  if (maxLaunchCount.value <= 1) {
    return 1
  }

  const ratio = launchCount / maxLaunchCount.value
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

const weeks = computed<HeatmapWeek[]>(() => {
  const endDate = new Date()
  endDate.setHours(0, 0, 0, 0)
  const startDate = new Date(endDate)
  startDate.setDate(endDate.getDate() - (props.rangeDays - 1))

  const displayStart = new Date(startDate)
  displayStart.setDate(startDate.getDate() - startDate.getDay())
  const displayEnd = new Date(endDate)
  displayEnd.setDate(endDate.getDate() + (6 - endDate.getDay()))

  const weekList: HeatmapWeek[] = []
  let cursor = new Date(displayStart)
  let previousMonthIndex = -1

  while (cursor.getTime() <= displayEnd.getTime()) {
    const weekStart = new Date(cursor)
    const weekDays: HeatmapCell[] = []
    let firstInRangeDate: Date | null = null

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const cellDate = new Date(weekStart)
      cellDate.setDate(weekStart.getDate() + dayIndex)
      cellDate.setHours(0, 0, 0, 0)
      const dateKey = formatDateKey(cellDate)
      const dayData = heatmapDataByDate.value.get(dateKey)
      const inRange = cellDate.getTime() >= startDate.getTime() && cellDate.getTime() <= endDate.getTime()
      if (inRange && !firstInRangeDate) {
        firstInRangeDate = cellDate
      }

      const launchCount = Math.max(0, Number(dayData?.launchCount ?? 0))
      const totalRuntime = Math.max(0, Number(dayData?.totalRuntime ?? 0))

      weekDays.push({
        key: dateKey,
        date: cellDate,
        label: formatTooltipDate(cellDate),
        launchCount,
        totalRuntime,
        inRange,
        level: resolveLevel(launchCount, inRange)
      })
    }

    const monthIndex = firstInRangeDate ? firstInRangeDate.getMonth() : previousMonthIndex
    const monthLabel = firstInRangeDate && monthIndex !== previousMonthIndex
      ? `${firstInRangeDate.getMonth() + 1}月`
      : ''

    if (firstInRangeDate) {
      previousMonthIndex = monthIndex
    }

    weekList.push({
      key: formatDateKey(weekStart),
      monthLabel,
      monthIndex,
      days: weekDays
    })

    cursor.setDate(cursor.getDate() + 7)
  }

  return weekList
})

const fitSizing = async () => {
  const rootWidth = heatmapRootRef.value?.clientWidth ?? 0
  const fallbackRectSize = Math.max(8, Number(props.rectSize) || 14)
  const fallbackGapSize = Math.max(3, Number(props.gapSize) || 5)
  const weeksCount = Math.max(1, weeks.value.length)
  const width = Math.max(0, rootWidth)
  const minRectSize = props.rangeDays === 365 ? 4 : 6
  const minGapSize = props.rangeDays === 365 ? 1 : 2

  if (!width) {
    resolvedRectSize.value = fallbackRectSize
    resolvedGapSize.value = fallbackGapSize
    return
  }

  const labelColumnWidth = 32
  const gapRatio = 0.48
  const availableWidth = Math.max(0, width - labelColumnWidth - 2)

  let nextRectSize = minRectSize
  let nextGapSize = minGapSize

  for (let rectSize = fallbackRectSize; rectSize >= minRectSize; rectSize -= 1) {
    const minimumNeededWidth = weeksCount * rectSize + Math.max(0, weeksCount - 1) * minGapSize
    if (minimumNeededWidth > availableWidth) {
      continue
    }

    const desiredGapSize = Math.max(minGapSize, Math.min(fallbackGapSize, Math.round(rectSize * gapRatio)))
    const maxGapSize = weeksCount > 1
      ? Math.floor((availableWidth - weeksCount * rectSize) / Math.max(1, weeksCount - 1))
      : desiredGapSize

    nextRectSize = rectSize
    nextGapSize = Math.max(minGapSize, Math.min(desiredGapSize, maxGapSize))
    break
  }

  resolvedRectSize.value = nextRectSize
  resolvedGapSize.value = nextGapSize

  await nextTick()

  let guard = 0
  while (guard < 12) {
    const monthsOverflow = Math.max(
      0,
      (monthsTrackRef.value?.scrollWidth ?? 0) - (monthsTrackRef.value?.clientWidth ?? 0)
    )
    const weeksOverflow = Math.max(
      0,
      (weeksRef.value?.scrollWidth ?? 0) - (weeksRef.value?.clientWidth ?? 0)
    )

    if (Math.max(monthsOverflow, weeksOverflow) <= 0) {
      break
    }

    if (resolvedGapSize.value > minGapSize) {
      resolvedGapSize.value -= 1
    } else if (resolvedRectSize.value > minRectSize) {
      resolvedRectSize.value -= 1
      resolvedGapSize.value = Math.max(minGapSize, Math.min(fallbackGapSize, Math.round(resolvedRectSize.value * gapRatio)))
    } else {
      break
    }

    guard += 1
    await nextTick()
  }
}

const heatmapFrameStyle = computed(() => ({
  '--heatmap-cell-size': `${resolvedRectSize.value}px`,
  '--heatmap-gap': `${resolvedGapSize.value}px`,
  '--heatmap-month-color': props.dark ? '#8a8493' : '#8b94a7',
  '--heatmap-weekday-color': props.dark ? '#6f6977' : '#7b8598',
  '--heatmap-legend-color': props.dark ? '#8d8898' : '#7f899b',
  '--heatmap-empty-color': props.dark ? '#20242c' : '#e6ebf2',
  '--heatmap-tooltip-bg': props.dark ? 'rgba(16, 18, 24, 0.96)' : 'rgba(255, 255, 255, 0.98)',
  '--heatmap-tooltip-border': props.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.10)',
  '--heatmap-tooltip-strong': props.dark ? '#f5f7fb' : '#1f2937',
  '--heatmap-tooltip-text': props.dark ? '#b9c2d0' : '#5b6476',
  '--heatmap-tooltip-shadow': props.dark ? '0 18px 42px rgba(0, 0, 0, 0.28)' : '0 18px 42px rgba(15, 23, 42, 0.12)'
}))

const getCellStyle = (cell: HeatmapCell) => ({
  backgroundColor: heatmapColorLevels.value[cell.level],
  opacity: cell.inRange ? 1 : 0.5
})

const heatmapTooltipStyle = computed(() => ({
  '--heatmap-tooltip-bg': props.dark ? 'rgba(16, 18, 24, 0.96)' : 'rgba(255, 255, 255, 0.98)',
  '--heatmap-tooltip-border': props.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.10)',
  '--heatmap-tooltip-strong': props.dark ? '#f5f7fb' : '#1f2937',
  '--heatmap-tooltip-text': props.dark ? '#b9c2d0' : '#5b6476',
  '--heatmap-tooltip-shadow': props.dark ? '0 18px 42px rgba(0, 0, 0, 0.28)' : '0 18px 42px rgba(15, 23, 42, 0.12)'
}))

const hideTooltip = () => {
  tooltipState.value.visible = false
}

const updateTooltipPosition = (event: MouseEvent) => {
  tooltipState.value.left = event.clientX + 14
  tooltipState.value.top = event.clientY + 14
}

const showTooltip = (cell: HeatmapCell, event: MouseEvent) => {
  if (!cell.inRange) {
    hideTooltip()
    return
  }

  tooltipState.value.cell = cell
  tooltipState.value.visible = true
  updateTooltipPosition(event)
}

onBeforeUnmount(() => {
  hideTooltip()
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(() => [weeks.value.length, props.rangeDays, props.rectSize, props.gapSize], async () => {
  await nextTick()
  await fitSizing()
})

onMounted(() => {
  void fitSizing()
  if (typeof ResizeObserver !== 'undefined' && heatmapRootRef.value) {
    resizeObserver = new ResizeObserver(() => {
      void fitSizing()
    })
    resizeObserver.observe(heatmapRootRef.value)
  }
})
</script>

<template>
  <div ref="heatmapRootRef" class="dashboard-heatmap" :style="heatmapFrameStyle">
    <div class="dashboard-heatmap__months">
      <span class="dashboard-heatmap__corner" aria-hidden="true"></span>
      <div ref="monthsTrackRef" class="dashboard-heatmap__months-track">
        <span
          v-for="week in weeks"
          :key="`${week.key}-month`"
          class="dashboard-heatmap__month"
        >
          {{ week.monthLabel }}
        </span>
      </div>
    </div>

    <div class="dashboard-heatmap__content">
      <div class="dashboard-heatmap__weekdays" aria-label="星期">
        <span
          v-for="(label, index) in weekdayLabels"
          :key="`${label}-${index}`"
          class="dashboard-heatmap__weekday"
        >
          {{ label }}
        </span>
      </div>

      <div ref="weeksRef" class="dashboard-heatmap__weeks" :aria-busy="loading ? 'true' : 'false'">
        <div
          v-for="week in weeks"
          :key="week.key"
          class="dashboard-heatmap__week"
        >
          <button
            v-for="cell in week.days"
            :key="cell.key"
            type="button"
            class="dashboard-heatmap__cell"
            :class="{
              'dashboard-heatmap__cell--empty': !cell.inRange,
              'dashboard-heatmap__cell--loading': loading
            }"
            :style="getCellStyle(cell)"
            :disabled="!cell.inRange"
            :aria-label="`${cell.label}，${cell.launchCount} 次启动，总使用时间 ${formatRuntime(cell.totalRuntime)}`"
            @mouseenter="showTooltip(cell, $event)"
            @mousemove="updateTooltipPosition($event)"
            @mouseleave="hideTooltip"
          />
        </div>
      </div>
    </div>

    <div class="dashboard-heatmap__legend" aria-label="热力图图例">
      <span>少</span>
      <i
        v-for="(color, index) in heatmapColorLevels"
        :key="`${color}-${index}`"
        :style="{ backgroundColor: color }"
      ></i>
      <span>多</span>
    </div>

    <teleport to="body">
      <div
        v-if="tooltipState.visible && tooltipState.cell"
        class="dashboard-heatmap__tooltip"
        :style="{
          left: `${tooltipState.left}px`,
          top: `${tooltipState.top}px`,
          ...heatmapTooltipStyle
        }"
      >
        <strong>{{ tooltipState.cell.label }}</strong>
        <span>{{ tooltipState.cell.launchCount }} 次启动</span>
        <span>总使用时间 {{ formatRuntime(tooltipState.cell.totalRuntime) }}</span>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.dashboard-heatmap {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dashboard-heatmap *,
.dashboard-heatmap *::before,
.dashboard-heatmap *::after {
  box-sizing: border-box;
}

.dashboard-heatmap__months {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: end;
  column-gap: 10px;
}

.dashboard-heatmap__corner {
  display: block;
  width: 22px;
  height: 1px;
}

.dashboard-heatmap__months-track {
  display: flex;
  gap: var(--heatmap-gap);
  min-width: 0;
}

.dashboard-heatmap__month {
  position: relative;
  width: var(--heatmap-cell-size);
  min-width: var(--heatmap-cell-size);
  color: var(--heatmap-month-color);
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
  white-space: nowrap;
  overflow: visible;
}

.dashboard-heatmap__content {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: start;
  column-gap: 10px;
}

.dashboard-heatmap__weekdays {
  display: grid;
  grid-template-rows: repeat(7, var(--heatmap-cell-size));
  gap: var(--heatmap-gap);
  padding-top: 1px;
}

.dashboard-heatmap__weekday {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  color: var(--heatmap-weekday-color);
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
}

.dashboard-heatmap__weeks {
  display: flex;
  gap: var(--heatmap-gap);
  min-width: 0;
}

.dashboard-heatmap__week {
  display: grid;
  grid-template-rows: repeat(7, var(--heatmap-cell-size));
  gap: var(--heatmap-gap);
}

.dashboard-heatmap__cell {
  width: var(--heatmap-cell-size);
  height: var(--heatmap-cell-size);
  min-width: 0;
  border: 0;
  border-radius: max(4px, calc(var(--heatmap-cell-size) * 0.26));
  padding: 0;
  box-shadow: none;
  cursor: default;
  transition: transform 0.15s ease, filter 0.15s ease, opacity 0.15s ease;
}

.dashboard-heatmap__cell:not(:disabled):hover {
  transform: translateY(-1px);
  filter: brightness(1.06);
}

.dashboard-heatmap__cell--empty {
  background: var(--heatmap-empty-color);
}

.dashboard-heatmap__cell--loading {
  animation: dashboard-heatmap-pulse 1.35s ease-in-out infinite;
}

.dashboard-heatmap__legend {
  display: inline-flex;
  align-self: flex-end;
  align-items: center;
  gap: 6px;
  color: var(--heatmap-legend-color);
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
}

.dashboard-heatmap__legend i {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  display: inline-block;
}

.dashboard-heatmap__tooltip {
  position: fixed;
  z-index: 9999;
  display: flex;
  min-width: 164px;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--heatmap-tooltip-border);
  border-radius: 12px;
  background: var(--heatmap-tooltip-bg);
  box-shadow: var(--heatmap-tooltip-shadow);
  color: var(--heatmap-tooltip-strong);
  pointer-events: none;
}

.dashboard-heatmap__tooltip strong {
  font-size: 12px;
  line-height: 1.3;
  font-weight: 700;
}

.dashboard-heatmap__tooltip span {
  color: var(--heatmap-tooltip-text);
  font-size: 12px;
  line-height: 1.35;
}

@keyframes dashboard-heatmap-pulse {
  0%,
  100% {
    opacity: 0.62;
  }

  50% {
    opacity: 1;
  }
}
</style>
