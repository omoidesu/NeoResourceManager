<script setup lang="ts">
type Tone = 'mint' | 'blue' | 'amber' | 'purple' | 'rose' | 'green' | 'slate' | 'cyan' | 'orange' | 'magenta' | 'lime'

type CategoryChip = {
  id: string
  routeId: string
  label: string
  emoji: string
  tone: Tone
  color: string
  backgroundColor: string
}

type RecentFeedLike = {
  id: string
  title: string
  meta: string
  [key: string]: unknown
}

type DashboardStat = {
  label: string
  value: string
}

const props = defineProps<{
  appVersion: string
  categoryOverviewLoading: boolean
  categoryOverview: CategoryChip[]
  searchKeyword: string
  recentFeedsLoading: boolean
  recentFeeds: RecentFeedLike[]
  stats: DashboardStat[]
  getRecentFeedStyle: (feed: any) => Record<string, string | undefined>
}>()

const emit = defineEmits<{
  (e: 'category-click', routeId: string): void
  (e: 'recent-feed-click', feed: RecentFeedLike): void
  (e: 'update:searchKeyword', value: string): void
  (e: 'search', keyword: string): void
}>()

const handleSearchSubmit = () => {
  emit('search', props.searchKeyword)
}
</script>

<template>
  <section class="dashboard-hero-section">
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
                :style="{ color: chip.color, backgroundColor: chip.backgroundColor }"
                @click="emit('category-click', chip.routeId)"
              >
                <span class="soft-chip__emoji" aria-hidden="true">{{ chip.emoji }}</span>
                <span>{{ chip.label }}</span>
              </button>
            </template>
          </div>
        </div>
        <form class="hero-search" @submit.prevent="handleSearchSubmit">
          <label class="hero-search__field">
            <span class="hero-search__dot"></span>
            <input
              :value="props.searchKeyword"
              type="search"
              placeholder="搜索资源名称、标签、分类"
              @input="emit('update:searchKeyword', ($event.target as HTMLInputElement).value)"
            />
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
              @click="emit('recent-feed-click', feed)"
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
  </section>
</template>

<style scoped>
.dashboard-hero-section {
  display: flex;
  flex-direction: column;
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.85fr);
  gap: 16px;
  min-height: 188px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-color: var(--home-border);
  border-radius: 24px;
  background: var(--home-panel);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
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
  margin: 0;
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

.chip-row {
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

.tone-slate {
  background: rgba(148, 163, 184, 0.14);
  color: #cbd5e1;
}

.tone-purple {
  background: rgba(168, 85, 247, 0.14);
  color: #d8b4fe;
}

.tone-cyan {
  background: rgba(34, 211, 238, 0.14);
  color: #a5f3fc;
}

.tone-amber {
  background: rgba(251, 191, 36, 0.14);
  color: #fde68a;
}

.tone-rose {
  background: rgba(244, 63, 94, 0.14);
  color: #fda4af;
}

.tone-green {
  background: rgba(34, 197, 94, 0.14);
  color: #bbf7d0;
}

.tone-blue {
  background: rgba(59, 130, 246, 0.14);
  color: #bfdbfe;
}

.tone-mint {
  background: rgba(16, 185, 129, 0.14);
  color: #a7f3d0;
}

.tone-orange {
  background: rgba(249, 115, 22, 0.14);
  color: #fdba74;
}

.tone-magenta {
  background: rgba(236, 72, 153, 0.14);
  color: #f9a8d4;
}

.tone-lime {
  background: rgba(132, 204, 22, 0.14);
  color: #d9f99d;
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
.hero-search__button {
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

.hero-search__button:hover {
  filter: brightness(1.08);
}

.hero-search__button:disabled {
  cursor: not-allowed;
  filter: saturate(0.85);
  opacity: 0.72;
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

.hero-feed h2 {
  margin: 0;
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.stat-card {
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

.stat-card span {
  color: var(--home-text);
  font-size: 13px;
  font-weight: 700;
}

.stat-card strong {
  color: var(--home-text-strong);
  font-size: 14px;
  font-weight: 800;
}

@media (max-width: 1280px) {
  .hero-card {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .hero-search,
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
