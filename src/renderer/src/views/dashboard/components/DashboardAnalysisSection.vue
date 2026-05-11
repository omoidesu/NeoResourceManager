<script setup lang="ts">
import VChart from 'vue-echarts'
import { use as useECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, GraphicComponent } from 'echarts/components'
import DashboardHeatmap from '../../../components/DashboardHeatmap.vue'

useECharts([CanvasRenderer, PieChart, BarChart, GridComponent, TooltipComponent, GraphicComponent])

type Tone = 'mint' | 'blue' | 'amber' | 'purple' | 'rose' | 'green' | 'slate' | 'cyan' | 'orange' | 'magenta' | 'lime'
type AnalysisTabKey = 'category' | 'health' | 'longUnvisited' | 'usage' | 'addedTrend'

const props = defineProps<{
  isDark: boolean
  activityHeatmapLoading: boolean
  analysisChartLoading: boolean
  activityHeatmap: Array<any>
  activityHeatmapSummary: Record<string, string>
  heatmapRectSize: number
  heatmapGapSize: number
  heatmapRangeDays: 30 | 84 | 365
  heatmapWeekLaunchCount: number
  heatmapActiveStreak: number
  heatmapPeakDayLabel: string
  heatmapSubtitle: string
  activeAnalysisTab: AnalysisTabKey
  analysisTabs: Array<{ key: AnalysisTabKey; label: string }>
  analysisTabOptions: Array<{ label: string; value: AnalysisTabKey }>
  activeAnalysisMeta: string
  categoryDistributionChartOption: any
  categoryDistributionLegendItems: Array<any>
  activeCategoryDistributionLabel: string | null
  activeHealthInsightLabel: string | null
  healthInsightSegments: Array<any>
  healthInsightTooltip: {
    visible: boolean
    x: number
    y: number
    label: string
    value: number
    percent: number
  }
  healthInsightTooltipStyle: Record<string, string | number>
  longUnvisitedDistributionChartOption: any
  longUnvisitedInsightText: string
  usageDistributionChartOption: any
  usageInsightItems: Array<any>
  usageInsightSummaryText: string
  addedTrendChartOption: any
  addedTrendInsightText: string
  shortcuts: Array<{ label: string; value: string; tone: Tone }>
  formatNumber: (value: number) => string
  setHeatmapFrameRef: (element: Element | null) => void
  handleCategoryDistributionActiveChange: (label?: string | null) => void
  handleCategoryDistributionChartMouseOver: (params: any) => void
  handleCategoryDistributionChartMouseOut: () => void
  handleHealthInsightActiveChange: (label?: string | null) => void
  showHealthInsightTooltip: (event: MouseEvent, item: any) => void
  moveHealthInsightTooltip: (event: MouseEvent) => void
  hideHealthInsightTooltip: () => void
}>()

const emit = defineEmits<{
  (e: 'update:heatmapRangeDays', value: 30 | 84 | 365): void
  (e: 'update:activeAnalysisTab', value: AnalysisTabKey): void
}>()

const toneClass = (tone: Tone) => `tone-${tone}`

const resolveElementRef = (value: any): Element | null => {
  if (value instanceof Element) {
    return value
  }

  if (value?.$el instanceof Element) {
    return value.$el
  }

  return null
}

const setHeatmapFrame = (value: any) => {
  props.setHeatmapFrameRef(resolveElementRef(value))
}

</script>

<template>
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
            <p>{{ props.activityHeatmapLoading ? '正在读取一年内启动日志' : props.heatmapSubtitle }}</p>
          </div>
          <div class="heatmap-range" role="tablist" aria-label="热力图区间">
            <button
              type="button"
              class="heatmap-range__pill"
              :class="{ 'heatmap-range__pill--active': props.heatmapRangeDays === 365 }"
              :aria-selected="props.heatmapRangeDays === 365"
              @click="emit('update:heatmapRangeDays', 365)"
            >
              近一年
            </button>
            <button
              type="button"
              class="heatmap-range__pill"
              :class="{ 'heatmap-range__pill--active': props.heatmapRangeDays === 84 }"
              :aria-selected="props.heatmapRangeDays === 84"
              @click="emit('update:heatmapRangeDays', 84)"
            >
              12 周
            </button>
            <button
              type="button"
              class="heatmap-range__pill"
              :class="{ 'heatmap-range__pill--active': props.heatmapRangeDays === 30 }"
              :aria-selected="props.heatmapRangeDays === 30"
              @click="emit('update:heatmapRangeDays', 30)"
            >
              30 天
            </button>
          </div>
        </header>
        <div class="heatmap-body">
          <aside class="heatmap-stats" :class="{ 'heatmap-stats--animating': props.activityHeatmapLoading }" aria-label="热力图基础摘要">
            <article class="heatmap-stat-card">
              <span>本周启动</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`week-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.heatmapWeekLaunchCount}`">
                  {{ props.activityHeatmapLoading ? '读取中' : `${props.formatNumber(props.heatmapWeekLaunchCount)} 次` }}
                </strong>
              </transition>
            </article>
            <article class="heatmap-stat-card heatmap-stat-card--mint">
              <span>连续活跃</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`streak-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.heatmapActiveStreak}`">
                  {{ props.activityHeatmapLoading ? '读取中' : `${props.formatNumber(props.heatmapActiveStreak)} 天` }}
                </strong>
              </transition>
            </article>
            <article class="heatmap-stat-card heatmap-stat-card--blue">
              <span>峰值日</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`peak-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.heatmapPeakDayLabel}`">
                  {{ props.activityHeatmapLoading ? '读取中' : props.heatmapPeakDayLabel }}
                </strong>
              </transition>
            </article>
          </aside>
          <div :ref="setHeatmapFrame" class="activity-heatmap-frame" :class="{ 'activity-heatmap-frame--animating': props.activityHeatmapLoading }">
            <transition name="heatmap-surface" mode="out-in">
              <DashboardHeatmap
                :key="`heatmap-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.activityHeatmap.length}`"
                class="activity-heatmap"
                :days="props.activityHeatmap"
                :loading="props.activityHeatmapLoading"
                :range-days="props.heatmapRangeDays"
                :rect-size="props.heatmapRectSize"
                :gap-size="props.heatmapGapSize"
                :dark="props.isDark"
              />
            </transition>
          </div>
          <aside class="heatmap-stats heatmap-stats--insights" :class="{ 'heatmap-stats--animating': props.activityHeatmapLoading }" aria-label="热力图分析摘要">
            <article class="heatmap-stat-card">
              <span>最活跃时段</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`hour-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.activityHeatmapSummary.mostActiveHour}`">
                  {{ props.activityHeatmapLoading ? '读取中' : props.activityHeatmapSummary.mostActiveHour }}
                </strong>
              </transition>
            </article>
            <article class="heatmap-stat-card heatmap-stat-card--mint">
              <span>最活跃星期</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`weekday-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.activityHeatmapSummary.mostActiveWeekday}`">
                  {{ props.activityHeatmapLoading ? '读取中' : props.activityHeatmapSummary.mostActiveWeekday }}
                </strong>
              </transition>
            </article>
            <article class="heatmap-stat-card heatmap-stat-card--blue">
              <span>常用类型</span>
              <transition name="heatmap-value" mode="out-in">
                <strong :key="`type-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.activityHeatmapSummary.mostUsedCategory}`">
                  {{ props.activityHeatmapLoading ? '读取中' : props.activityHeatmapSummary.mostUsedCategory }}
                </strong>
              </transition>
            </article>
          </aside>
        </div>
        <div class="heatmap-stats heatmap-stats--merged" :class="{ 'heatmap-stats--animating': props.activityHeatmapLoading }" aria-label="热力图汇总摘要">
          <article class="heatmap-stat-card">
            <span>本周启动</span>
            <transition name="heatmap-value" mode="out-in">
              <strong :key="`merged-week-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.heatmapWeekLaunchCount}`">
                {{ props.activityHeatmapLoading ? '读取中' : `${props.formatNumber(props.heatmapWeekLaunchCount)} 次` }}
              </strong>
            </transition>
          </article>
          <article class="heatmap-stat-card heatmap-stat-card--mint">
            <span>连续活跃</span>
            <transition name="heatmap-value" mode="out-in">
              <strong :key="`merged-streak-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.heatmapActiveStreak}`">
                {{ props.activityHeatmapLoading ? '读取中' : `${props.formatNumber(props.heatmapActiveStreak)} 天` }}
              </strong>
            </transition>
          </article>
          <article class="heatmap-stat-card heatmap-stat-card--blue">
            <span>峰值日</span>
            <transition name="heatmap-value" mode="out-in">
              <strong :key="`merged-peak-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.heatmapPeakDayLabel}`">
                {{ props.activityHeatmapLoading ? '读取中' : props.heatmapPeakDayLabel }}
              </strong>
            </transition>
          </article>
          <article class="heatmap-stat-card">
            <span>最活跃时段</span>
            <transition name="heatmap-value" mode="out-in">
              <strong :key="`merged-hour-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.activityHeatmapSummary.mostActiveHour}`">
                {{ props.activityHeatmapLoading ? '读取中' : props.activityHeatmapSummary.mostActiveHour }}
              </strong>
            </transition>
          </article>
          <article class="heatmap-stat-card heatmap-stat-card--mint">
            <span>最活跃星期</span>
            <transition name="heatmap-value" mode="out-in">
              <strong :key="`merged-weekday-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.activityHeatmapSummary.mostActiveWeekday}`">
                {{ props.activityHeatmapLoading ? '读取中' : props.activityHeatmapSummary.mostActiveWeekday }}
              </strong>
            </transition>
          </article>
          <article class="heatmap-stat-card heatmap-stat-card--blue">
            <span>常用类型</span>
            <transition name="heatmap-value" mode="out-in">
              <strong :key="`merged-type-${props.heatmapRangeDays}-${props.activityHeatmapLoading ? 'loading' : props.activityHeatmapSummary.mostUsedCategory}`">
                {{ props.activityHeatmapLoading ? '读取中' : props.activityHeatmapSummary.mostUsedCategory }}
              </strong>
            </transition>
          </article>
        </div>
      </section>

      <aside class="analysis-side-card">
        <header class="analysis-side-card__header">
          <div class="analysis-side-card__title-row">
            <h3>{{ props.analysisTabs.find((item) => item.key === props.activeAnalysisTab)?.label }}</h3>
            <n-select
              :value="props.activeAnalysisTab"
              :options="props.analysisTabOptions"
              size="small"
              class="analysis-side-card__select"
              @update:value="emit('update:activeAnalysisTab', $event as AnalysisTabKey)"
            />
          </div>
          <span class="analysis-side-card__meta">{{ props.activeAnalysisMeta }}</span>
        </header>

        <div v-if="props.activeAnalysisTab === 'category'" class="analysis-chart analysis-chart--category">
          <VChart
            class="analysis-chart__canvas analysis-chart__canvas--donut"
            :option="props.categoryDistributionChartOption"
            autoresize
            @mouseover="props.handleCategoryDistributionChartMouseOver"
            @mouseout="props.handleCategoryDistributionChartMouseOut"
            @globalout="props.handleCategoryDistributionChartMouseOut"
          />
          <div class="analysis-chart__legend">
            <article
              v-for="item in props.categoryDistributionLegendItems"
              :key="item.label"
              class="analysis-chart__legend-item analysis-chart__legend-item--category"
              :class="{
                'analysis-chart__legend-item--active': props.activeCategoryDistributionLabel === item.label,
                'analysis-chart__legend-item--aggregate': item.isAggregate
              }"
              @mouseenter="props.handleCategoryDistributionActiveChange(item.label)"
              @mouseleave="props.handleCategoryDistributionActiveChange(null)"
            >
              <span class="analysis-chart__legend-label">
                <i :style="{ backgroundColor: item.color }"></i>
                {{ item.displayLabel }}
              </span>
              <strong>{{ props.formatNumber(item.value) }}</strong>
              <span>{{ item.percent }}%</span>
            </article>
          </div>
        </div>

        <div v-else-if="props.activeAnalysisTab === 'health'" class="analysis-chart analysis-chart--health">
          <div class="analysis-health-bar" aria-label="资源健康分段条">
            <span
              v-for="item in props.healthInsightSegments"
              :key="item.label"
              class="analysis-health-bar__segment"
              :class="{ 'analysis-health-bar__segment--active': props.activeHealthInsightLabel === item.label }"
              :style="{
                width: `${item.percent}%`,
                backgroundColor: item.color,
                minWidth: item.value > 0 ? '10px' : '6px',
                opacity: item.hasPlaceholder ? 0.28 : 1
              }"
              @mouseenter="props.showHealthInsightTooltip($event, item)"
              @mousemove="props.moveHealthInsightTooltip($event)"
              @mouseleave="props.hideHealthInsightTooltip"
            ></span>
          </div>
          <div class="analysis-chart__legend analysis-chart__legend--stacked">
            <article
              v-for="item in props.healthInsightSegments"
              :key="item.label"
              class="analysis-chart__legend-item"
              :class="{ 'analysis-chart__legend-item--soft-active': props.activeHealthInsightLabel === item.label }"
              @mouseenter="props.handleHealthInsightActiveChange(item.label)"
              @mouseleave="props.handleHealthInsightActiveChange(null)"
            >
              <span class="analysis-chart__legend-label">
                <i :style="{ backgroundColor: item.color }"></i>
                {{ item.label }}
              </span>
              <strong>{{ props.formatNumber(item.value) }}</strong>
            </article>
          </div>
          <p class="analysis-list__hint">建议优先处理：封面缺失 > 资源失效 > 长期未访问</p>
        </div>

        <div v-else-if="props.activeAnalysisTab === 'longUnvisited'" class="analysis-chart">
          <template v-if="props.analysisChartLoading">
            <div class="analysis-chart__empty">正在读取分析数据</div>
          </template>
          <template v-else>
            <VChart class="analysis-chart__canvas" :option="props.longUnvisitedDistributionChartOption" autoresize />
            <p class="analysis-list__hint">{{ props.longUnvisitedInsightText }}</p>
          </template>
        </div>

        <div v-else-if="props.activeAnalysisTab === 'usage'" class="analysis-chart">
          <template v-if="props.analysisChartLoading">
            <div class="analysis-chart__empty">正在读取分析数据</div>
          </template>
          <template v-else>
            <VChart
              v-if="props.usageInsightItems.length"
              class="analysis-chart__canvas"
              :option="props.usageDistributionChartOption"
              autoresize
            />
            <div v-else class="analysis-chart__empty">近期还没有足够的启动记录</div>
            <p class="analysis-list__hint">{{ props.usageInsightSummaryText }}</p>
          </template>
        </div>

        <div v-else class="analysis-chart">
          <template v-if="props.analysisChartLoading">
            <div class="analysis-chart__empty">正在读取分析数据</div>
          </template>
          <template v-else>
            <VChart class="analysis-chart__canvas" :option="props.addedTrendChartOption" autoresize />
            <p class="analysis-list__hint">{{ props.addedTrendInsightText }}</p>
          </template>
        </div>
      </aside>
    </div>
    <teleport to="body">
      <div
        v-if="props.healthInsightTooltip.visible"
        class="analysis-health-tooltip analysis-health-tooltip--floating"
        :style="{
          left: `${props.healthInsightTooltip.x}px`,
          top: `${props.healthInsightTooltip.y - 14}px`,
          ...props.healthInsightTooltipStyle
        }"
      >
        <strong>{{ props.healthInsightTooltip.label }}</strong>
        <span>{{ props.formatNumber(props.healthInsightTooltip.value) }} 项</span>
        <span>占比 {{ props.healthInsightTooltip.percent.toFixed(1) }}%</span>
      </div>
    </teleport>
  </section>

  <section class="shortcut-grid">
    <article
      v-for="item in props.shortcuts"
      :key="item.label"
      class="shortcut-card"
      :class="toneClass(item.tone)"
    >
      <strong>{{ item.label }}</strong>
      <span>{{ item.value }}</span>
    </article>
  </section>
</template>

<style scoped>
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

.analysis-section__header h2 {
  color: var(--home-text-strong);
  font-size: 17px;
  line-height: 1.2;
  font-weight: 800;
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

.heatmap-card,
.analysis-side-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-color: var(--home-border);
  background: var(--home-panel);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
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

.heatmap-card h2 {
  color: var(--home-text-strong);
  font-size: 17px;
  line-height: 1.2;
  font-weight: 800;
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

.analysis-list__hint {
  margin-top: auto;
  color: var(--home-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

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

.shortcut-card strong {
  color: var(--home-text-strong);
  font-size: 14px;
  font-weight: 800;
}

.shortcut-card span {
  color: var(--home-text);
  font-size: 13px;
  font-weight: 700;
}

.tone-rose {
  color: var(--home-error);
  background: var(--home-error-soft);
}

.tone-purple {
  color: var(--home-primary);
  background: var(--home-primary-soft);
}

.tone-mint {
  color: var(--home-success);
  background: var(--home-success-soft);
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

@media (max-width: 1280px) {
  .analysis-section__body,
  .heatmap-card {
    grid-template-columns: 1fr;
  }

  .shortcut-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .shortcut-grid {
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
}
</style>
