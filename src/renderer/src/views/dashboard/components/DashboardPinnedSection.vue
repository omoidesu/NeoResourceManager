<script setup lang="ts">
import { computed, ref } from 'vue'

type HomePinnedCardLike = {
  id: string
  title: string
  categoryEmoji: string
  meta: string
  missingStatus?: boolean
  [key: string]: unknown
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

const props = defineProps<{
  homePinnedCards: HomePinnedCardLike[]
  homePinnedLoading: boolean
  homePinnedCount: number
  homePinnedMaxCount: number
  homePinnedAddCandidates: HomePinnedAddCandidate[]
  homePinnedAddCandidatesLoading: boolean
  homePinnedAddKeyword: string
  homePinnedAddTotal: number
  homePinnedAddingId: string
  visibleHomePinnedCards: HomePinnedCardLike[]
  homePinnedPageDots: number[]
  homePinnedPage: number
  canMoveHomePinnedPrev: boolean
  canMoveHomePinnedNext: boolean
  homePinnedLaunchingId: string
  homePinnedDeletingId: string
  getHomePinnedCardStyle: (item: any) => Record<string, string | undefined>
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'search', keyword: string): void
  (e: 'jump-cover-wall'): void
  (e: 'move-page', direction: -1 | 1): void
  (e: 'select-page', pageIndex: number): void
  (e: 'open-card', item: any): void
  (e: 'card-keydown', event: KeyboardEvent, item: any): void
  (e: 'remove', item: any): void
  (e: 'launch', item: any): void
  (e: 'pin', item: HomePinnedAddCandidate): void
}>()

const showAddPanel = ref(false)
const addKeyword = ref(props.homePinnedAddKeyword ?? '')
const isSearchingAddCandidates = computed(() => Boolean(props.homePinnedAddKeyword.trim()))
const isHomePinnedLimitReached = computed(() => props.homePinnedCount >= props.homePinnedMaxCount)
const addPanelSummaryText = computed(() => {
  if (!isSearchingAddCandidates.value) {
    return ''
  }

  if (props.homePinnedAddTotal > 15) {
    return `命中 ${props.homePinnedAddTotal} 个资源，结果较多，建议到封面墙继续查找`
  }

  return `命中 ${props.homePinnedAddTotal} 个资源`
})

const getAddCandidateStyle = (item: HomePinnedAddCandidate) => {
  const accent = String(item?.categoryColor ?? '').trim() || '#737373'
  const coverUrl = String(item?.coverUrl ?? '').trim()
  const hasCover = Boolean(coverUrl)
  return {
    '--queue-add-candidate-accent': accent,
    '--queue-add-candidate-cover': hasCover ? `url("${coverUrl.replace(/"/g, '\\"')}")` : 'none',
    borderColor: hasCover ? `color-mix(in srgb, ${accent} 28%, rgba(255,255,255,0.08))` : 'var(--home-overlay-border)',
    background: hasCover ? `color-mix(in srgb, ${accent} 8%, rgba(20,24,29,0.92))` : 'color-mix(in srgb, var(--home-panel-subtle) 72%, #14181d)'
  } as Record<string, string>
}

const openAddPanel = () => {
  showAddPanel.value = true
  emit('add')
}

const closeAddPanel = () => {
  showAddPanel.value = false
  addKeyword.value = ''
  emit('search', '')
}

const clearAddKeyword = () => {
  addKeyword.value = ''
  emit('search', '')
}

const handlePinCandidate = (item: HomePinnedAddCandidate) => {
  emit('pin', item)
}

const handleAddKeywordInput = (event: Event) => {
  const nextKeyword = (event.target as HTMLInputElement | null)?.value ?? ''
  addKeyword.value = nextKeyword
  emit('search', nextKeyword)
}
</script>

<template>
  <aside class="queue-panel">
    <div class="queue-panel__header">
      <h2>{{ showAddPanel ? '添加快速启动' : '快速启动' }}</h2>
      <button
        v-if="showAddPanel"
        type="button"
        class="queue-panel__action queue-panel__action--muted"
        @click="closeAddPanel"
      >
        关闭
      </button>
      <button v-else type="button" class="queue-panel__action" @click="openAddPanel">
        添加
      </button>
    </div>
    <div v-if="showAddPanel" class="queue-add-panel">
      <div class="queue-add-panel__search">
        <label class="queue-add-panel__search-field">
          <span class="queue-add-panel__search-dot" aria-hidden="true"></span>
          <input :value="addKeyword" type="search" placeholder="搜索资源名称、标签、分类" @input="handleAddKeywordInput" />
        </label>
        <button type="button" class="queue-add-panel__clear" @click="clearAddKeyword">清空</button>
      </div>
      <div v-if="addPanelSummaryText" class="queue-add-panel__summary">
        <template v-if="props.homePinnedAddTotal > 15">
          命中 {{ props.homePinnedAddTotal }} 个资源，结果较多，建议到
          <button type="button" class="queue-add-panel__summary-link" @click="emit('jump-cover-wall')">封面墙</button>
          继续查找
        </template>
        <template v-else>
          {{ addPanelSummaryText }}
        </template>
      </div>
      <div v-if="props.homePinnedAddCandidatesLoading" class="queue-add-panel__empty">正在查找可固定资源</div>
      <AppScrollbar v-else-if="props.homePinnedAddCandidates.length" class="queue-add-panel__scroll">
        <div class="queue-add-panel__list">
          <article
            v-for="item in props.homePinnedAddCandidates"
            :key="item.id"
            class="queue-add-panel__item"
            :style="getAddCandidateStyle(item)"
          >
            <span class="queue-add-panel__swatch" aria-hidden="true">{{ item.categoryEmoji || '📁' }}</span>
            <div class="queue-add-panel__copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.meta }}</small>
            </div>
            <n-button
              size="small"
              type="primary"
              secondary
              round
              :loading="props.homePinnedAddingId === item.id"
              :disabled="Boolean(item.isPinned) || isHomePinnedLimitReached"
              @click="handlePinCandidate(item)"
            >
              {{ item.isPinned ? '已添加' : (isHomePinnedLimitReached ? '快速启动已满' : '添加') }}
            </n-button>
          </article>
        </div>
      </AppScrollbar>
      <div v-else class="queue-add-panel__empty">
        {{ isSearchingAddCandidates ? '没有找到匹配的资源' : '最近没有可固定的资源' }}
      </div>
    </div>
    <div v-if="!showAddPanel && props.homePinnedCards.length" class="queue-panel__pager">
      <button
        type="button"
        class="queue-panel__pager-button"
        :disabled="!props.canMoveHomePinnedPrev"
        @click="emit('move-page', -1)"
      >
        ‹
      </button>
      <div class="queue-panel__dots" aria-label="快速启动分页">
        <button
          v-for="pageIndex in props.homePinnedPageDots"
          :key="pageIndex"
          type="button"
          class="queue-panel__dot"
          :class="{ 'queue-panel__dot--active': pageIndex === props.homePinnedPage }"
          :aria-label="`第 ${pageIndex + 1} 页`"
          :aria-current="pageIndex === props.homePinnedPage ? 'true' : undefined"
          @click="emit('select-page', pageIndex)"
        />
      </div>
      <button
        type="button"
        class="queue-panel__pager-button"
        :disabled="!props.canMoveHomePinnedNext"
        @click="emit('move-page', 1)"
      >
        ›
      </button>
    </div>
    <article v-if="!showAddPanel && props.homePinnedLoading && !props.homePinnedCards.length" class="queue-item queue-item--empty">
      <strong>读取中</strong>
      <span>正在整理快速启动内容</span>
    </article>
    <div v-else-if="!showAddPanel && !props.homePinnedCards.length" class="queue-empty-state">
      <div class="queue-empty-state__icon" aria-hidden="true">
        <span class="queue-empty-state__icon-dot queue-empty-state__icon-dot--active"></span>
        <span class="queue-empty-state__icon-dot"></span>
        <span class="queue-empty-state__icon-dot"></span>
        <span class="queue-empty-state__icon-dot"></span>
      </div>
      <strong>还没有快速启动资源</strong>
      <p>把常用的游戏、音声或网站添加到快速启动，之后打开应用就能更快使用它们。</p>
      <button type="button" class="queue-empty-state__action" @click="openAddPanel">
        添加第一个资源
      </button>
    </div>
    <div v-else-if="!showAddPanel" class="queue-pinned-grid">
      <article
        v-for="item in props.visibleHomePinnedCards"
        :key="item.id"
        class="queue-pinned-card"
        :style="props.getHomePinnedCardStyle(item)"
        @click="emit('open-card', item)"
        @keydown="emit('card-keydown', $event, item)"
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
              @positive-click.stop="emit('remove', item)"
            >
              <template #trigger>
                <n-button
                  secondary
                  :loading="props.homePinnedDeletingId === item.id"
                  :disabled="props.homePinnedLaunchingId === item.id"
                  @click.stop
                  @keydown.stop
                >
                  移除
                </n-button>
              </template>
              确认取消固定该资源吗
            </n-popconfirm>
            <n-button
              type="primary"
              secondary
              :loading="props.homePinnedLaunchingId === item.id"
              :disabled="props.homePinnedDeletingId === item.id || Boolean(item.missingStatus)"
              @click.stop="emit('launch', item)"
              @keydown.stop
            >
              打开
            </n-button>
          </n-button-group>
        </div>
      </article>
    </div>
  </aside>
</template>

<style scoped>
.queue-panel {
  display: flex;
  height: 372px;
  min-height: 372px;
  max-height: 372px;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.queue-panel h2 {
  color: var(--home-text-strong);
  font-size: 17px;
  line-height: 1.2;
  font-weight: 800;
}

.queue-panel__header,
.queue-panel__pager {
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

.queue-panel__action--muted {
  color: var(--home-text-muted);
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

.queue-add-panel {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0 0;
  background: transparent;
}

.queue-add-panel__search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px;
  gap: 10px;
}

.queue-add-panel__summary {
  color: var(--home-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.queue-add-panel__summary-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--home-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.queue-add-panel__summary-link:hover {
  text-decoration: underline;
}

.queue-add-panel__summary-link:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--home-primary-focus);
  border-radius: 6px;
}

.queue-add-panel__search-field {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--home-border-subtle);
  border-radius: 14px;
  background: var(--home-solid-panel-strong);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--home-overlay-border) 62%, transparent);
}

.queue-add-panel__search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--home-text-strong);
  font: inherit;
  font-size: 12px;
}

.queue-add-panel__search-field input::placeholder {
  color: var(--home-text-faint);
}

.queue-add-panel__search-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--home-primary);
  flex: 0 0 auto;
}

.queue-add-panel__clear {
  border: 1px solid var(--home-border-subtle);
  border-radius: 14px;
  background: var(--home-secondary-button-bg);
  color: var(--home-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.queue-add-panel__scroll {
  min-height: 0;
  flex: 1;
}

.queue-add-panel__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 6px;
}

.queue-add-panel__item {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--home-overlay-border);
  border-radius: 16px;
  overflow: hidden;
}

.queue-add-panel__item::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(180deg, color-mix(in srgb, var(--home-solid-panel-strong) 62%, transparent) 0%, color-mix(in srgb, var(--home-solid-panel-strong) 80%, transparent) 100%),
    var(--queue-add-candidate-cover, none);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 1;
  pointer-events: none;
}

.queue-add-panel__item > * {
  position: relative;
  z-index: 1;
}

.queue-add-panel__swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--home-panel-subtle) 78%, var(--home-solid-panel-strong));
  color: var(--home-text-strong);
  font-size: 18px;
  line-height: 1;
  border: 1px solid color-mix(in srgb, var(--home-overlay-border) 72%, transparent);
}

.queue-add-panel__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.queue-add-panel__copy strong {
  color: var(--home-text-strong);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-add-panel__copy small {
  color: var(--home-overlay-meta-text);
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-add-panel__empty {
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--home-border-subtle);
  border-radius: 18px;
  background: color-mix(in srgb, var(--home-panel-subtle) 52%, transparent);
  color: var(--home-text-muted);
  font-size: 12px;
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
  filter: brightness(1.04);
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
  .queue-pinned-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .queue-pinned-grid {
    grid-template-columns: 1fr;
  }
}
</style>
