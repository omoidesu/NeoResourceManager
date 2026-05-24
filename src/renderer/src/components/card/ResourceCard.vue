<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon, addCollection } from '@iconify/vue'
import materialSymbolsLightIcons from '@iconify-json/material-symbols-light/icons.json'
import { useResourceCardDisplayState } from './composables/useResourceCardDisplayState'
import { useResourceCardActions } from './composables/useResourceCardActions'
import { useResourceCardContextMenu } from './composables/useResourceCardContextMenu'
import { useResourceCardPerformance } from './composables/useResourceCardPerformance'
import { useResourceCardPreviewAssets } from './composables/useResourceCardPreviewAssets'
import pinnedRibbonUrl from '../../assets/pinned-ribbon.svg'
import {
  AlertCircleOutline,
  CheckmarkCircleOutline,
  HeartOutline,
  Play,
  Stop,
} from '@vicons/ionicons5'

addCollection(materialSymbolsLightIcons)

const props = defineProps<{
  resource: any
  categoryName?: string
  hideTypeLine?: boolean
  authorLabel?: string
  startText?: string
  showZoneLaunch?: boolean
  canZoneLaunch?: boolean
  showAdminLaunch?: boolean
  showMtoolLaunch?: boolean
  canMtoolLaunch?: boolean
  showCover?: boolean
  showScreenshotFolder?: boolean
  showCompletedToggle?: boolean
  showDeleteFiles?: boolean
  showModifyOrder?: boolean
  stopNeedsConfirm?: boolean
  selected?: boolean
  selectionMode?: boolean
  showDefaultAppPlay?: boolean
  defaultAppActionText?: string
  showAddToPlaylist?: boolean
  archiveEnabled?: boolean
}>()
const emit = defineEmits<{
  (event: 'launch', resource: any): void
  (event: 'admin-launch', resource: any): void
  (event: 'stop', resource: any): void
  (event: 'zone-launch', resource: any): void
  (event: 'mtool-launch', resource: any): void
  (event: 'show-detail', resource: any): void
  (event: 'edit', resource: any): void
  (event: 'open-folder', resource: any): void
  (event: 'default-app-play', resource: any): void
  (event: 'add-to-playlist', resource: any): void
  (event: 'open-screenshot-folder', resource: any): void
  (event: 'toggle-favorite', resource: any): void
  (event: 'toggle-completed', resource: any): void
  (event: 'toggle-top', resource: any): void
  (event: 'toggle-home-pin', resource: any): void
  (event: 'toggle-select', resource: any): void
  (event: 'archive', resource: any): void
  (event: 'delete', resource: any): void
  (event: 'delete-files', resource: any): void
  (event: 'modify-order', resource: any): void
}>()

const cardTriggerRef = ref<HTMLElement | null>(null)
const { reportCardMounted, logCardTiming, previewLoadStrategy } = useResourceCardPerformance({
  getResource: () => props.resource,
  getCategoryName: () => String(props.categoryName ?? '').trim()
})

const {
  resourceTags,
  resourceTypes,
  resourceAuthors,
  resourceActors,
  resourceAlbum,
  showAlbumLine,
  isWebsiteCategory,
  completedLabel,
  completedStateLabel,
  favoriteIconColor,
  completedIconColor,
  displayBaseName,
  websiteIsDownloadLink,
  cardSubtitle,
  websitePlaceholderEmoji,
  showFileTypeIcon,
  showNovelFileIcon,
  showNovelMarkdownIcon,
  showAsyncFileIcon,
  novelFileIcon,
  novelFileIconTitle,
  novelPublishInfo,
  videoYearInfo,
  videoCoverProgressText,
  launchActionText,
  showActorLine,
  actorLineLabel,
  fallbackExecutableIcon,
  normalizedRating,
  isRunning
} = useResourceCardDisplayState({
  resource: computed(() => props.resource),
  categoryName: computed(() => String(props.categoryName ?? '').trim()),
  hideTypeLine: computed(() => Boolean(props.hideTypeLine)),
  startText: computed(() => String(props.startText ?? '').trim())
})

const {
  coverPreviewSrc,
  fileIconSrc,
  websiteFaviconSrc,
  showWebsiteCoverPlaceholder,
  showWebsiteEmojiCoverPlaceholder
} = useResourceCardPreviewAssets({
  resource: computed(() => props.resource),
  showCover: computed(() => props.showCover !== false),
  isWebsiteCategory,
  showAsyncFileIcon,
  cardTriggerRef,
  reportCardMounted,
  logCardTiming,
  ...previewLoadStrategy
})
const handleWebsiteFaviconImageError = () => {
  websiteFaviconSrc.value = ''
}
const {
  showStopConfirm,
  launchButtonStyle,
  canLaunch,
  launchButtonHidden,
  canStop,
  stopNeedsConfirm,
  canToggleFavorite,
  canToggleCompleted,
  handleLaunch,
  handleStop,
  handleStopButtonClick,
  handleStopButtonDoubleClick,
  handleConfirmStop,
  handleToggleFavorite,
  handleToggleCompleted,
  handleToggleSelect,
  handleShowDetail,
  handleRunningStateChange
} = useResourceCardActions({
  resource: computed(() => props.resource),
  selectionMode: computed(() => Boolean(props.selectionMode)),
  stopNeedsConfirmProp: computed(() => Boolean(props.stopNeedsConfirm)),
  isWebsiteCategory,
  isRunning,
  onLaunch: (resource) => emit('launch', resource),
  onStop: (resource) => emit('stop', resource),
  onToggleFavorite: (resource) => emit('toggle-favorite', resource),
  onToggleCompleted: (resource) => emit('toggle-completed', resource),
  onToggleSelect: (resource) => emit('toggle-select', resource),
  onShowDetail: (resource) => emit('show-detail', resource)
})
const {
  showContextMenu,
  contextMenuX,
  contextMenuY,
  contextMenuOptions,
  handleContextMenu,
  handleSelectMenu
} = useResourceCardContextMenu({
  resource: computed(() => props.resource),
  categoryName: computed(() => String(props.categoryName ?? '').trim()),
  startText: computed(() => String(props.startText ?? '')),
  selected: computed(() => Boolean(props.selected)),
  showDefaultAppPlay: computed(() => Boolean(props.showDefaultAppPlay)),
  defaultAppActionText: computed(() => String(props.defaultAppActionText ?? '')),
  showAddToPlaylist: computed(() => Boolean(props.showAddToPlaylist)),
  showMtoolLaunch: computed(() => Boolean(props.showMtoolLaunch)),
  canMtoolLaunch: computed(() => Boolean(props.canMtoolLaunch)),
  showZoneLaunch: computed(() => Boolean(props.showZoneLaunch)),
  canZoneLaunch: computed(() => Boolean(props.canZoneLaunch)),
  showAdminLaunch: computed(() => Boolean(props.showAdminLaunch)),
  showModifyOrder: computed(() => Boolean(props.showModifyOrder)),
  showCompletedToggle: computed(() => Boolean(props.showCompletedToggle)),
  showScreenshotFolder: computed(() => Boolean(props.showScreenshotFolder)),
  isWebsiteCategory,
  archiveEnabled: computed(() => Boolean(props.archiveEnabled)),
  completedStateLabel,
  canLaunch,
  canToggleFavorite,
  canToggleCompleted,
  handleLaunch,
  handleToggleFavorite,
  handleToggleCompleted,
  handleToggleTop: () => emit('toggle-top', props.resource),
  handleToggleHomePin: () => emit('toggle-home-pin', props.resource),
  handleToggleSelect,
  onZoneLaunch: (resource) => emit('zone-launch', resource),
  onAdminLaunch: (resource) => emit('admin-launch', resource),
  onMtoolLaunch: (resource) => emit('mtool-launch', resource),
  onShowDetail: (resource) => emit('show-detail', resource),
  onEdit: (resource) => emit('edit', resource),
  onOpenFolder: (resource) => emit('open-folder', resource),
  onModifyOrder: (resource) => emit('modify-order', resource),
  onDefaultAppPlay: (resource) => emit('default-app-play', resource),
  onAddToPlaylist: (resource) => emit('add-to-playlist', resource),
  onOpenScreenshotFolder: (resource) => emit('open-screenshot-folder', resource),
  onArchive: (resource) => emit('archive', resource),
  onDelete: (resource) => emit('delete', resource),
  onDeleteFiles: (resource) => emit('delete-files', resource)
})

watch(
  () => props.resource?.isRunning,
  (isRunningNow) => {
    handleRunningStateChange(isRunningNow)
  }
)
</script>

<template>
  <div class="resource-card-shell">
    <n-dropdown
      trigger="manual"
      :show="showContextMenu"
      :x="contextMenuX"
      :y="contextMenuY"
      :options="contextMenuOptions"
      placement="bottom-start"
      @select="handleSelectMenu"
      @clickoutside="showContextMenu = false"
    >
      <div class="resource-card-dropdown-anchor" />
    </n-dropdown>

      <div ref="cardTriggerRef" class="resource-card-trigger" @contextmenu="handleContextMenu" @click="handleShowDetail">
      <img
        v-if="resource.ifTop"
        :src="pinnedRibbonUrl"
        alt="置顶"
        class="resource-card__pinned-ribbon"
        draggable="false"
      />
      <n-card
        size="small"
        class="resource-card"
        :class="{
          'resource-card--selected': selected,
          'resource-card--compact': showCover === false
        }"
        embedded
      >
          <div class="resource-card__content" :class="{ 'resource-card__content--no-cover': showCover === false }">
            <div v-if="showCover !== false" class="resource-card__cover">
              <img
                v-if="coverPreviewSrc"
                :src="coverPreviewSrc"
                :alt="resource.title"
                class="resource-card__cover-image"
                draggable="false"
              />
              <div
                v-else
                class="resource-card__cover-placeholder"
                :class="{ 'resource-card__cover-placeholder--website': showWebsiteCoverPlaceholder || showWebsiteEmojiCoverPlaceholder }"
              >
                <div v-if="showWebsiteCoverPlaceholder" class="resource-card__website-cover">
                  <div class="resource-card__website-cover-glow" />
                  <div class="resource-card__website-cover-badge">
                    <img
                      :src="websiteFaviconSrc"
                      :alt="resource.title"
                      class="resource-card__website-cover-icon"
                      draggable="false"
                      @error="handleWebsiteFaviconImageError"
                    />
                  </div>
                </div>
                <div v-else-if="showWebsiteEmojiCoverPlaceholder" class="resource-card__website-cover">
                  <div class="resource-card__website-cover-glow" />
                  <div class="resource-card__website-cover-badge resource-card__website-cover-badge--emoji">
                    <span class="resource-card__website-cover-emoji">{{ websitePlaceholderEmoji }}</span>
                  </div>
                </div>
                <template v-else>
                {{ categoryName || '资源' }}
                </template>
              </div>
              <div v-if="videoCoverProgressText" class="resource-card__cover-progress">
                {{ videoCoverProgressText }}
              </div>
            </div>

          <div class="resource-card__header">
            <div class="resource-card__heading">
              <div class="resource-card__title-row">
                <span v-if="showFileTypeIcon" class="resource-card__title-icon">
                  <Icon
                    v-if="showNovelMarkdownIcon"
                    icon="material-symbols-light:markdown-outline-rounded"
                    :title="novelFileIconTitle"
                    class="resource-card__title-icon-svg"
                  />
                  <n-icon v-else-if="showNovelFileIcon" :component="novelFileIcon" :title="novelFileIconTitle" />
                  <img
                    v-else-if="fileIconSrc"
                    :src="fileIconSrc"
                    :alt="displayBaseName || resource.title"
                    class="resource-card__title-icon-image"
                    draggable="false"
                  />
                  <span v-else>{{ fallbackExecutableIcon }}</span>
                </span>
                <span v-else-if="isWebsiteCategory && websiteFaviconSrc" class="resource-card__title-icon">
                  <img
                    :src="websiteFaviconSrc"
                    :alt="resource.title"
                    class="resource-card__title-icon-image resource-card__title-icon-image--favicon"
                    draggable="false"
                    @error="handleWebsiteFaviconImageError"
                  />
                </span>
                <span v-else-if="isWebsiteCategory" class="resource-card__title-icon resource-card__title-icon--emoji">
                  {{ websitePlaceholderEmoji }}
                </span>
                <div class="resource-card__title" :class="{ 'resource-card__title--website': isWebsiteCategory }">{{ resource.title }}</div>
                <span
                  v-if="isWebsiteCategory && websiteIsDownloadLink"
                  class="resource-card__download-badge"
                  title="下载链接"
                >
                  下载
                </span>
              </div>
              <div
                v-if="cardSubtitle"
                class="resource-card__subtitle resource-card__subtitle--file"
                :title="isWebsiteCategory ? cardSubtitle : resource.basePath"
              >
                {{ cardSubtitle }}
              </div>
            </div>
            <div class="resource-card__status">
              <n-popover v-if="resource.missingStatus" trigger="hover">
                <template #trigger>
                  <n-icon
                    size="18"
                    class="resource-card__status-icon"
                    color="#d03050"
                  >
                    <AlertCircleOutline />
                  </n-icon>
                </template>
                资源失效
              </n-popover>
              <n-popover trigger="hover">
                <template #trigger>
                  <n-icon
                    size="18"
                    :class="[
                      'resource-card__status-icon',
                      'resource-card__status-icon--interactive',
                      { 'resource-card__status-icon--disabled': !canToggleFavorite }
                    ]"
                    :color="favoriteIconColor"
                    @click.stop="handleToggleFavorite"
                  >
                    <HeartOutline />
                  </n-icon>
                </template>
                {{ resource.ifFavorite ? '取消收藏' : '收藏' }}
              </n-popover>
              <n-popover v-if="showCompletedToggle" trigger="hover">
                <template #trigger>
                  <n-icon
                    size="18"
                    :class="[
                      'resource-card__status-icon',
                      'resource-card__status-icon--interactive',
                      { 'resource-card__status-icon--disabled': !canToggleCompleted }
                    ]"
                    :color="completedIconColor"
                    @click.stop="handleToggleCompleted"
                  >
                    <CheckmarkCircleOutline />
                  </n-icon>
                </template>
                {{ resource.isCompleted ? `取消${completedLabel}` : `标记${completedLabel}` }}
              </n-popover>
            </div>
          </div>

          <div class="resource-card__meta">
            <div v-if="resourceAuthors.length" class="resource-card__meta-line">
              <span class="resource-card__meta-label">{{ authorLabel || '作者' }}</span>
              <n-space size="small">
                <n-tag
                  v-for="author in resourceAuthors"
                  :key="`${resource.id}-${author.id}`"
                  size="small"
                  :bordered="false"
                  round
                  type="primary"
                >
                  {{ author.name }}
                </n-tag>
              </n-space>
            </div>

            <div v-if="novelPublishInfo" class="resource-card__meta-line">
              <span class="resource-card__meta-label">出版</span>
              <span class="resource-card__meta-text" :title="novelPublishInfo">{{ novelPublishInfo }}</span>
            </div>

            <div v-if="showActorLine" class="resource-card__meta-line resource-card__meta-line--single">
              <span class="resource-card__meta-label">{{ actorLineLabel }}</span>
              <n-space size="small">
                <n-tag
                  v-for="actor in resourceActors"
                  :key="`${resource.id}-${actor.id ?? actor.name}`"
                  size="small"
                  :bordered="false"
                  round
                  type="success"
                >
                  {{ actor.name }}
                </n-tag>
              </n-space>
            </div>

            <div v-if="videoYearInfo" class="resource-card__meta-line">
              <span class="resource-card__meta-label">年份</span>
              <span class="resource-card__meta-text" :title="videoYearInfo">{{ videoYearInfo }}</span>
            </div>

            <div v-if="showAlbumLine" class="resource-card__meta-line">
              <span class="resource-card__meta-label">专辑</span>
              <n-space size="small">
                <n-tag
                  size="small"
                  :bordered="false"
                  round
                  type="success"
                  :title="resourceAlbum"
                >
                  {{ resourceAlbum }}
                </n-tag>
              </n-space>
            </div>

            <div v-if="!hideTypeLine && resourceTypes.length" class="resource-card__meta-line resource-card__meta-line--single">
              <span class="resource-card__meta-label">分类</span>
              <n-space size="small">
                <n-tag
                  v-for="type in resourceTypes"
                  :key="`${resource.id}-${type.id}`"
                  size="small"
                  :bordered="false"
                  round
                  type="warning"
                >
                  {{ type.name }}
                </n-tag>
              </n-space>
            </div>

            <div v-if="resourceTags.length" class="resource-card__meta-line resource-card__meta-line--single">
              <span class="resource-card__meta-label">标签</span>
              <n-space size="small">
                <n-tag
                  v-for="tag in resourceTags.slice(0, 5)"
                  :key="`${resource.id}-${tag.id}`"
                  size="small"
                  :bordered="false"
                  round
                  type="info"
                >
                  {{ tag.name }}
                </n-tag>
                <n-tag v-if="resourceTags.length > 5" size="small" :bordered="false" round>
                  +{{ resourceTags.length - 5 }}
                </n-tag>
              </n-space>
            </div>
          </div>

        </div>
      </n-card>

      <div class="resource-card__bottom-overlay">
        <div class="resource-card__rating-chip">
          <n-rate
            :value="normalizedRating"
            readonly
            allow-half
            size="small"
          />
        </div>

        <n-popconfirm
          v-if="isRunning && stopNeedsConfirm"
          trigger="manual"
          :show="showStopConfirm"
          positive-text="直接关闭"
          negative-text="继续运行"
          @positive-click="handleConfirmStop"
          @negative-click="showStopConfirm = false"
          @clickoutside="showStopConfirm = false"
        >
          <template #trigger>
            <n-float-button
              type="error"
              class="resource-card__launch"
              description="停止"
              :disabled="!canStop"
              :style="launchButtonStyle"
              @click.stop="handleStopButtonClick"
              @dblclick.stop.prevent="handleStopButtonDoubleClick"
            >
              <n-icon>
                <Stop />
              </n-icon>
            </n-float-button>
          </template>
          游戏是否已经保存？
        </n-popconfirm>

        <n-float-button
          v-else-if="isRunning"
          type="error"
          class="resource-card__launch"
          description="停止"
          :disabled="!canStop"
          :style="launchButtonStyle"
          @click.stop="handleStop"
        >
          <n-icon>
            <Stop />
          </n-icon>
        </n-float-button>

        <n-float-button
          v-else-if="!launchButtonHidden"
          type="primary"
          class="resource-card__launch"
          :description="launchActionText"
          @click.stop="handleLaunch()"
        >
          <n-icon>
            <Play />
          </n-icon>
        </n-float-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-card-shell {
  width: 100%;
  min-width: 0;
}

.resource-card-dropdown-anchor {
  position: fixed;
  width: 0;
  height: 0;
  pointer-events: none;
}

.resource-card-trigger {
  width: 100%;
  min-width: 0;
  position: relative;
  cursor: pointer;
}

.resource-card__pinned-ribbon {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  width: 72px;
  height: 72px;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.resource-card {
  width: 100%;
  height: 450px;
  cursor: pointer;
  position: relative;
  border-radius: 15px;
  overflow: hidden;
}

.resource-card--compact {
  height: 250px;
}

.resource-card--selected {
  box-shadow: inset 0 0 0 2px rgba(99, 226, 183, 0.9);
}

.resource-card__content {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  row-gap: 12px;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
}

.resource-card__content--no-cover {
  grid-template-rows: auto minmax(0, 1fr);
  row-gap: 14px;
  padding-top: 6px;
}

.resource-card__cover {
  position: relative;
  width: 100%;
  height: 176px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(127, 127, 127, 0.08);
}

.resource-card__cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  -webkit-user-drag: none;
  user-select: none;
}

.resource-card__cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  opacity: 0.55;
  letter-spacing: 0.04em;
}

.resource-card__cover-placeholder--website {
  opacity: 1;
  color: inherit;
  background:
    radial-gradient(circle at 24% 22%, color-mix(in srgb, currentColor 10%, transparent), transparent 36%),
    radial-gradient(circle at 78% 18%, color-mix(in srgb, currentColor 8%, transparent), transparent 32%),
    linear-gradient(135deg,
      color-mix(in srgb, currentColor 5%, transparent),
      color-mix(in srgb, currentColor 2%, transparent)
    );
}

.resource-card__website-cover {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resource-card__website-cover-glow {
  position: absolute;
  width: 120px;
  height: 120px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  filter: blur(30px);
  opacity: 0.9;
}

.resource-card__website-cover-badge {
  position: relative;
  z-index: 1;
  width: 72px;
  height: 72px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, currentColor 6%, rgba(255, 255, 255, 0.82));
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  box-shadow:
    0 18px 44px color-mix(in srgb, currentColor 14%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.resource-card__website-cover-badge--emoji {
  background: color-mix(in srgb, currentColor 8%, rgba(255, 255, 255, 0.76));
}

.resource-card__website-cover-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  object-fit: cover;
  display: block;
  -webkit-user-drag: none;
  user-select: none;
}

.resource-card__website-cover-emoji {
  font-size: 34px;
  line-height: 1;
}

.resource-card__cover-progress {
  position: absolute;
  right: 10px;
  bottom: 10px;
  max-width: calc(100% - 20px);
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: rgba(255, 255, 255, 0.96);
  font-size: 11px;
  line-height: 1.4;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resource-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.resource-card__heading {
  flex: 1;
  min-width: 0;
}

.resource-card__status {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
}

.resource-card__status-icon {
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.resource-card__status-icon--disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.resource-card__status-icon--interactive {
  cursor: pointer;
}

.resource-card__status-icon--interactive:hover {
  transform: scale(1.08);
}

.resource-card__title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.resource-card__title-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
}

.resource-card__title-icon--emoji {
  font-size: 17px;
}

.resource-card__title-icon-image {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
  -webkit-user-drag: none;
  user-select: none;
}

.resource-card__title-icon-image--favicon {
  border-radius: 4px;
}

.resource-card__title-icon-svg {
  width: 18px;
  height: 18px;
  color: currentColor;
  opacity: 0.72;
  display: block;
}

.resource-card__title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.resource-card__title--website {
  min-height: calc(1.35em * 2);
}

.resource-card__download-badge {
  flex: 0 0 auto;
  align-self: flex-start;
  margin-top: 1px;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.4;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #8a5a00;
  background: rgba(240, 173, 78, 0.22);
  border: 1px solid rgba(240, 173, 78, 0.34);
}

.resource-card__subtitle {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.7;
  word-break: break-word;
}

.resource-card__subtitle--file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card__meta-line {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.resource-card__meta {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.resource-card__meta-line > * {
  min-width: 0;
}

.resource-card__meta-label {
  font-size: 12px;
  opacity: 0.6;
  line-height: 24px;
  white-space: nowrap;
}

.resource-card__meta-text {
  min-width: 0;
  align-self: center;
  font-size: 12px;
  line-height: 1.5;
  color: currentColor;
  opacity: 0.82;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card__meta-line :deep(.n-space) {
  flex-wrap: wrap;
  min-width: 0;
  max-height: 54px;
  overflow: hidden;
}

.resource-card__meta-line--single :deep(.n-space) {
  flex-wrap: nowrap;
  max-height: 24px;
}

.resource-card__meta-line--single :deep(.n-tag) {
  flex: 0 0 auto;
}

.resource-card__bottom-overlay {
  position: absolute;
  left: 16px;
  right: 20px;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 2;
}

.resource-card__rating-chip {
  font-size: 11px;
  line-height: 1;
  opacity: 0.56;
  pointer-events: none;
}

.resource-card__launch {
  position: static !important;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
}
</style>
