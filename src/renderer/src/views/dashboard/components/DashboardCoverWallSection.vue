<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

type Tone = 'mint' | 'blue' | 'amber' | 'purple' | 'rose' | 'green' | 'slate' | 'cyan' | 'orange' | 'magenta' | 'lime'

const props = defineProps<{
  coverWallStickyStuck: boolean
  coverWallSearchKeyword: string
  coverFilters: Array<any>
  coverWallActiveSelection: { kind: string }
  coverWallActiveFilter: string
  coverWallActiveCategoryId: string
  coverWallCategoryFilters: Array<any>
  coverWallInitialLoading: boolean
  displayedCoverWallItems: Array<any>
  coverWallVisibleItems: Array<any>
  coverWallHoverState: any
  coverWallHoveredItem: any
  coverWallShouldLoadMore: boolean
  currentCoverWallPageState: { loading?: boolean }
  getCoverWallSummaryText: () => string
  getCoverWallCategoryChipStyle: (chip: any, active: boolean) => Record<string, string | undefined>
  getCoverCardStyle: (item: any) => Record<string, string | undefined>
  getCoverWallHoverMetaLabel: (item: any) => string
  getCoverWallStateBadges: (item: any) => string[]
  getCoverWallHoverStyle: () => Record<string, string | undefined>
  formatAddedTime: (value: unknown) => string
  setCoverWallStickyRef: (el: Element | null) => void
  setCoverWallStageRef: (el: Element | null) => void
  setCoverWallLoadMoreRef: (el: Element | null) => void
  setCoverWallCardRef: (id: string, el: Element | null) => void
  getCoverWallBackTopListenTarget: any
  homePinnedAddingId?: string
  homePinnedCount?: number
  homePinnedMaxCount?: number
}>()

const emit = defineEmits<{
  (e: 'update:coverWallSearchKeyword', value: string): void
  (e: 'filter-click', key: string): void
  (e: 'category-click', id: string): void
  (e: 'hover-show', id: string): void
  (e: 'hover-hide', id: string): void
  (e: 'open-detail', item: any): void
  (e: 'open-resource', item: any): void
  (e: 'pin-home', item: any): void
}>()

const toneClass = (tone: Tone) => `tone-${tone}`

const keywordModel = computed({
  get: () => props.coverWallSearchKeyword,
  set: (value: string) => emit('update:coverWallSearchKeyword', value)
})

const setStickyRef = (value: any) => {
  props.setCoverWallStickyRef(value instanceof Element ? value : null)
}

const setStageRef = (value: any) => {
  props.setCoverWallStageRef(value instanceof Element ? value : null)
}

const setLoadMoreRef = (value: any) => {
  props.setCoverWallLoadMoreRef(value instanceof Element ? value : null)
}

const setCardRef = (id: string, value: any) => {
  props.setCoverWallCardRef(id, value instanceof Element ? value : null)
}

const coverWallContextMenuShow = ref(false)
const coverWallContextMenuX = ref(0)
const coverWallContextMenuY = ref(0)
const coverWallContextMenuItem = ref<any>(null)
let coverWallClickTimer: number | null = null

const coverWallContextMenuOptions = computed(() => {
  const item = coverWallContextMenuItem.value
  const isPinned = Boolean(item?.isPinned)
  const isPinning = String(props.homePinnedAddingId ?? '').trim() === String(item?.id ?? '').trim()
  const pinnedCount = Math.max(0, Number(props.homePinnedCount ?? 0))
  const pinnedMaxCount = Math.max(1, Number(props.homePinnedMaxCount ?? 12))
  const isPinnedLimitReached = !isPinned && pinnedCount >= pinnedMaxCount
  return [
    {
      key: 'pin-home',
      label: isPinned ? '已添加' : (isPinning ? '添加中' : (isPinnedLimitReached ? '快速启动已满' : '添加至快速启动')),
      disabled: isPinned || isPinning || isPinnedLimitReached || !String(item?.id ?? '').trim()
    }
  ]
})

const handleCoverWallContextMenu = (event: MouseEvent, item: any) => {
  event.preventDefault()
  coverWallContextMenuItem.value = item
  coverWallContextMenuX.value = event.clientX
  coverWallContextMenuY.value = event.clientY
  coverWallContextMenuShow.value = true
}

const handleCoverWallContextMenuSelect = (key: string | number) => {
  if (
    key === 'pin-home'
    && coverWallContextMenuItem.value
    && !coverWallContextMenuItem.value?.isPinned
    && String(props.homePinnedAddingId ?? '').trim() !== String(coverWallContextMenuItem.value?.id ?? '').trim()
  ) {
    emit('pin-home', coverWallContextMenuItem.value)
  }
  coverWallContextMenuShow.value = false
}

const handleCoverWallCardClick = (item: any) => {
  if (coverWallClickTimer != null) {
    clearTimeout(coverWallClickTimer)
  }
  coverWallClickTimer = window.setTimeout(() => {
    coverWallClickTimer = null
    emit('open-detail', item)
  }, 220)
}

const handleCoverWallCardDoubleClick = (item: any) => {
  if (coverWallClickTimer != null) {
    clearTimeout(coverWallClickTimer)
    coverWallClickTimer = null
  }
  emit('open-resource', item)
}

onBeforeUnmount(() => {
  if (coverWallClickTimer != null) {
    clearTimeout(coverWallClickTimer)
    coverWallClickTimer = null
  }
})
</script>

<template>
  <n-dropdown
    trigger="manual"
    :show="coverWallContextMenuShow"
    :x="coverWallContextMenuX"
    :y="coverWallContextMenuY"
    :options="coverWallContextMenuOptions"
    placement="bottom-start"
    @select="handleCoverWallContextMenuSelect"
    @clickoutside="coverWallContextMenuShow = false"
  >
    <div class="cover-wall-context-anchor" />
  </n-dropdown>
  <section id="home-cover-wall" class="cover-section" :class="{ 'is-stuck': props.coverWallStickyStuck }">
    <div :ref="setStickyRef" class="cover-section__sticky" :class="{ 'is-stuck': props.coverWallStickyStuck }">
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
                  v-model.trim="keywordModel"
                  type="search"
                  placeholder="搜索关键词，分类"
                />
              </label>
            </div>
          </header>

          <div class="cover-filters">
            <button
              v-for="filter in props.coverFilters"
              :key="filter.key"
              type="button"
              class="soft-chip"
              :class="[toneClass(filter.tone as Tone), { 'is-active': props.coverWallActiveSelection.kind === 'status' && props.coverWallActiveFilter === filter.key }]"
              @click="emit('filter-click', filter.key)"
            >
              {{ filter.label }}
            </button>
          </div>

          <div v-if="props.coverWallCategoryFilters.length" class="cover-category-row">
            <button
              v-for="chip in props.coverWallCategoryFilters"
              :key="chip.id"
              type="button"
              class="soft-chip cover-category-chip"
              :class="{ 'is-active': props.coverWallActiveSelection.kind === 'category' && props.coverWallActiveCategoryId === chip.id }"
              :style="props.getCoverWallCategoryChipStyle(chip, props.coverWallActiveSelection.kind === 'category' && props.coverWallActiveCategoryId === chip.id)"
              :disabled="Number(chip.count ?? 0) <= 0"
              @click="emit('category-click', chip.id)"
            >
              <span aria-hidden="true">{{ chip.emoji }}</span>
              {{ chip.label }} {{ chip.count }}
            </button>
          </div>
        </div>

        <div class="cover-summary-row">
          <span>{{ props.getCoverWallSummaryText() }}</span>
        </div>
      </div>
    </div>

    <div v-if="props.coverWallInitialLoading" class="cover-empty">正在整理封面墙</div>
    <div v-else-if="!props.displayedCoverWallItems.length" class="cover-empty">当前筛选下暂时没有可展示的封面</div>
    <div v-else :ref="setStageRef" class="cover-stage">
      <div class="cover-grid">
        <button
          v-for="item in props.coverWallVisibleItems"
          :key="item.id"
          :ref="(el) => setCardRef(item.id, el)"
          type="button"
          class="cover-card"
          :style="props.getCoverCardStyle(item)"
          @mouseenter="emit('hover-show', item.id)"
          @mouseleave="emit('hover-hide', item.id)"
          @focus="emit('hover-show', item.id)"
          @blur="emit('hover-hide', item.id)"
          @click="handleCoverWallCardClick(item)"
          @dblclick="handleCoverWallCardDoubleClick(item)"
          @contextmenu="handleCoverWallContextMenu($event, item)"
        >
          <div class="cover-card__art" :class="{ 'is-fallback': !item.coverUrl }">
            <span class="cover-card__chip">{{ item.categoryEmoji }} {{ item.categoryName }}</span>
            <span v-if="item.missingStatus" class="cover-card__invalid-badge" aria-label="资源失效" title="资源失效">🚫</span>
            <span v-if="!item.coverUrl" class="cover-card__fallback-title">{{ item.title }}</span>
          </div>
        </button>
      </div>

      <div
        v-if="props.coverWallHoverState && props.coverWallHoveredItem"
        class="cover-hover-card"
        :style="props.getCoverWallHoverStyle()"
      >
        <strong>{{ props.coverWallHoveredItem.title }}</strong>
        <p class="cover-hover-card__meta">
          {{ props.coverWallHoveredItem.categoryName }} · {{ props.getCoverWallHoverMetaLabel(props.coverWallHoveredItem) }}
        </p>
        <div v-if="props.getCoverWallStateBadges(props.coverWallHoveredItem).length" class="cover-hover-card__badge-row">
          <span
            v-for="badge in props.getCoverWallStateBadges(props.coverWallHoveredItem)"
            :key="badge"
            class="cover-hover-card__badge cover-hover-card__badge--soft"
          >
            {{ badge }}
          </span>
        </div>
        <p class="cover-hover-card__meta">
          {{ props.coverWallHoveredItem.createTime ? props.formatAddedTime(props.coverWallHoveredItem.createTime) : '最近添加' }}
        </p>
      </div>

      <div
        v-if="props.coverWallShouldLoadMore || props.currentCoverWallPageState.loading"
        :ref="setLoadMoreRef"
        class="cover-stage__loadmore"
      >
        {{ props.currentCoverWallPageState.loading ? '正在加载更多封面...' : '继续下滑加载更多封面' }}
      </div>
      <div v-else class="cover-stage__footer">
        已经到底了
      </div>
    </div>
  </section>

  <n-back-top
    v-if="props.coverWallStickyStuck"
    class="cover-wall-back-top"
    :right="26"
    :bottom="28"
    :visibility-height="0"
    :listen-to="props.getCoverWallBackTopListenTarget"
  />
</template>

<style scoped>
.cover-wall-context-anchor {
  width: 0;
  height: 0;
}

.cover-section {
  position: relative;
  min-width: 0;
  margin-top: 18px;
  padding: 18px;
  border: 1px solid var(--home-border);
  overflow: visible;
  scroll-margin-top: 18px;
  background: var(--home-solid-panel-alt);
  border-radius: 24px;
  background-clip: padding-box;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
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

.cover-filters button {
  cursor: pointer;
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
  margin-bottom: 18px;
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

.cover-card__invalid-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--home-overlay-border);
  border-radius: 999px;
  background: var(--home-overlay-bg);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
  font-size: 16px;
  line-height: 1;
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

.cover-stage__footer {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: auto;
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

.soft-chip.tone-mint.is-active,
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

@media (max-width: 1440px) {
  .cover-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (max-width: 1280px) {
  .cover-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .cover-grid {
    grid-template-columns: 1fr;
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
}
</style>
