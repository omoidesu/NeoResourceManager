<script setup lang="ts">
type NextPlayCardLike = {
  id: string
  title: string
  categoryName: string
  categoryEmoji: string
  reason: string
  coverUrl?: string
  missingStatus?: boolean
  [key: string]: unknown
}

const props = defineProps<{
  nextPlayLoading: boolean
  nextPlayVisible: NextPlayCardLike[]
  nextPlayHero: NextPlayCardLike | null
  nextPlayMiniCards: NextPlayCardLike[]
  nextPlayLaunchingId: string
  getNextPlayCardStyle: (item: any) => Record<string, string | undefined>
  getNextPlayActionLabel: (categoryName: string) => string
}>()

const emit = defineEmits<{
  (e: 'swap'): void
  (e: 'open-detail', item: any): void
  (e: 'launch', item: any): void
  (e: 'promote', itemId: string): void
}>()
</script>

<template>
  <section class="next-play-section">
    <header class="next-play-section__header">
      <h2>接下来看看</h2>
      <button type="button" class="next-play-section__swap" @click="emit('swap')">
        换一组
      </button>
    </header>
    <div v-if="props.nextPlayLoading && !props.nextPlayVisible.length" class="next-play-empty">
      正在整理下一批想玩的资源
    </div>
    <div v-else-if="!props.nextPlayHero" class="next-play-empty">
      暂无推荐_(:з)∠)_
    </div>
    <div v-else class="next-play-layout">
      <article
        class="next-play-hero"
        :style="props.getNextPlayCardStyle(props.nextPlayHero)"
        @click="emit('open-detail', props.nextPlayHero)"
      >
        <div class="next-play-hero__surface">
          <small class="next-play-hero__meta">
            {{ props.nextPlayHero.categoryEmoji }} {{ props.nextPlayHero.categoryName }}
          </small>
          <div class="next-play-card__copy">
            <strong>{{ props.nextPlayHero.title }}</strong>
            <small>{{ props.nextPlayHero.reason }}</small>
          </div>
          <button
            type="button"
            class="next-play-hero__action next-play-hero__action--primary"
            :disabled="props.nextPlayLaunchingId === props.nextPlayHero.id || Boolean(props.nextPlayHero.missingStatus)"
            @click.stop="emit('launch', props.nextPlayHero)"
          >
            {{ props.nextPlayLaunchingId === props.nextPlayHero.id ? '打开中' : props.getNextPlayActionLabel(props.nextPlayHero.categoryName) }}
          </button>
        </div>
      </article>
      <div class="next-play-mini-grid">
        <button
          v-for="item in props.nextPlayMiniCards"
          :key="item.id"
          type="button"
          class="next-play-mini-card"
          :style="props.getNextPlayCardStyle(item)"
          @click="emit('promote', item.id)"
        >
          <small>{{ item.categoryEmoji }} {{ item.categoryName }}</small>
          <strong>{{ item.title }}</strong>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.next-play-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 18px;
  padding: 18px;
  border-radius: 24px;
  background: var(--home-panel);
}

.next-play-section h2 {
  color: var(--home-text-strong);
  font-size: 17px;
  line-height: 1.2;
  font-weight: 800;
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
  min-height: 236px;
  min-width: 0;
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
  line-height: 1.3;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

@media (max-width: 1280px) {
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
}

@media (max-width: 720px) {
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
}
</style>
