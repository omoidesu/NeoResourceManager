<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import DashboardCoverWallSection from './DashboardCoverWallSection.vue'
import { useDashboardCoverFeeds } from '../composables/useDashboardCoverFeeds'

type Tone = 'mint' | 'blue' | 'amber' | 'purple' | 'rose' | 'green' | 'slate' | 'cyan' | 'orange' | 'magenta' | 'lime'
type ResourceChipLike = {
  routeId: string
  categoryName: string
  emoji: string
  color: string
  count: number
}

const props = defineProps<{
  categoryOverview: ResourceChipLike[]
  defaultCategoryPillColor: string
  getCategoryEmoji: (item: any, categoryName: string) => string
  getCategoryTone: (categoryName: string, index: number) => Tone
  getToneColor: (tone: Tone) => string
  colorAlpha: (color: string, alpha: number) => string
  formatAddedTime: (value: unknown) => string
  toCssUrlValue: (value: unknown) => string
  homePinnedAddingId: string
  homePinnedCount: number
  homePinnedMaxCount: number
}>()

const emit = defineEmits<{
  (e: 'open-detail', item: any): void
  (e: 'open-resource', item: any): void
  (e: 'pin-home', item: any): void
}>()

const emitRendererTiming = (message: string, meta?: Record<string, unknown>) => {
  window.api?.diagnostics?.logRenderer('info', message, meta)
}

const dashboardDisposed = ref(false)
const categoryOverviewRef = computed(() => props.categoryOverview) as unknown as Ref<ResourceChipLike[]>
let coverWallLoadTimer: number | null = null

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

const {
  coverWallActiveFilter,
  coverWallActiveCategoryId,
  coverWallSearchKeyword,
  coverWallStageRef,
  coverWallLoadMoreRef,
  coverWallStickyRef,
  coverWallStickyStuck,
  coverFilters,
  coverWallActiveSelection,
  currentCoverWallPageState,
  displayedCoverWallItems,
  coverWallVisibleItems,
  coverWallShouldLoadMore,
  coverWallInitialLoading,
  coverWallHoverState,
  coverWallHoveredItem,
  coverWallCategoryFilters,
  loadCoverWallData,
  refreshCoverWallResource,
  updateCoverWallPinnedState,
  handleCoverFilterClick,
  getCoverCardStyle,
  setCoverWallCardRef,
  scheduleCoverWallHoverShow,
  scheduleCoverWallHoverHide,
  getCoverWallHoverMetaLabel,
  getCoverWallStateBadges,
  getCoverWallSummaryText,
  getCoverWallCategoryChipStyle,
  getCoverWallHoverStyle,
  handleCoverWallCategoryClick,
  bindCoverWallStickyEvents,
  getCoverWallBackTopListenTarget,
  cleanupCoverWallFeeds
} = useDashboardCoverFeeds({
  categoryOverview: categoryOverviewRef,
  dashboardDisposed,
  defaultCategoryPillColor: props.defaultCategoryPillColor,
  emitRendererTiming,
  measureDashboardTask,
  toCssUrlValue: props.toCssUrlValue,
  getCategoryEmoji: props.getCategoryEmoji,
  getCategoryTone: props.getCategoryTone,
  getToneColor: props.getToneColor,
  colorAlpha: props.colorAlpha
})

const setCoverWallStageElement = (el: Element | null) => {
  coverWallStageRef.value = el as HTMLElement | null
}

const setCoverWallLoadMoreElement = (el: Element | null) => {
  coverWallLoadMoreRef.value = el as HTMLElement | null
}

const setCoverWallStickyElement = (el: Element | null) => {
  coverWallStickyRef.value = el as HTMLElement | null
}

const handleCoverFilterClickBridge = (filterKey: string) => {
  handleCoverFilterClick(filterKey as any)
}

const applyCoverWallSearchKeyword = (keyword: string) => {
  coverWallActiveFilter.value = 'all'
  coverWallActiveCategoryId.value = ''
  coverWallSearchKeyword.value = String(keyword ?? '').trim()
}

onMounted(() => {
  dashboardDisposed.value = false
  nextTick(() => {
    bindCoverWallStickyEvents()
  })
  coverWallLoadTimer = window.setTimeout(() => {
    coverWallLoadTimer = null
    if (dashboardDisposed.value) {
      return
    }

    emitRendererTiming('dashboard deferred task start', {
      label: 'coverWallData',
      delayMs: 760,
      owner: 'coverWallRuntime'
    })
    void loadCoverWallData()
  }, 760)
})

onBeforeUnmount(() => {
  dashboardDisposed.value = true
  if (coverWallLoadTimer != null) {
    clearTimeout(coverWallLoadTimer)
    coverWallLoadTimer = null
  }
  cleanupCoverWallFeeds()
})

defineExpose({
  refreshCoverWallResource,
  updateCoverWallPinnedState,
  applyCoverWallSearchKeyword
})
</script>

<template>
  <DashboardCoverWallSection
    :cover-wall-sticky-stuck="coverWallStickyStuck"
    :cover-wall-search-keyword="coverWallSearchKeyword"
    :cover-filters="coverFilters"
    :cover-wall-active-selection="coverWallActiveSelection"
    :cover-wall-active-filter="coverWallActiveFilter"
    :cover-wall-active-category-id="coverWallActiveCategoryId"
    :cover-wall-category-filters="coverWallCategoryFilters"
    :cover-wall-initial-loading="coverWallInitialLoading"
    :displayed-cover-wall-items="displayedCoverWallItems"
    :cover-wall-visible-items="coverWallVisibleItems"
    :cover-wall-hover-state="coverWallHoverState"
    :cover-wall-hovered-item="coverWallHoveredItem"
    :cover-wall-should-load-more="coverWallShouldLoadMore"
    :current-cover-wall-page-state="currentCoverWallPageState"
    :get-cover-wall-summary-text="getCoverWallSummaryText"
    :get-cover-wall-category-chip-style="getCoverWallCategoryChipStyle"
    :get-cover-card-style="getCoverCardStyle"
    :get-cover-wall-hover-meta-label="getCoverWallHoverMetaLabel"
    :get-cover-wall-state-badges="getCoverWallStateBadges"
    :get-cover-wall-hover-style="getCoverWallHoverStyle"
    :format-added-time="props.formatAddedTime"
    :set-cover-wall-sticky-ref="setCoverWallStickyElement"
    :set-cover-wall-stage-ref="setCoverWallStageElement"
    :set-cover-wall-load-more-ref="setCoverWallLoadMoreElement"
    :set-cover-wall-card-ref="setCoverWallCardRef"
    :get-cover-wall-back-top-listen-target="getCoverWallBackTopListenTarget"
    :home-pinned-adding-id="props.homePinnedAddingId"
    :home-pinned-count="props.homePinnedCount"
    :home-pinned-max-count="props.homePinnedMaxCount"
    @update:coverWallSearchKeyword="coverWallSearchKeyword = $event"
    @filter-click="handleCoverFilterClickBridge"
    @category-click="handleCoverWallCategoryClick"
    @hover-show="scheduleCoverWallHoverShow"
    @hover-hide="scheduleCoverWallHoverHide"
    @open-detail="emit('open-detail', $event)"
    @open-resource="emit('open-resource', $event)"
    @pin-home="emit('pin-home', $event)"
  />
</template>
