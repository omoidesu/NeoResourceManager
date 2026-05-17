<script setup lang="ts">
import { computed, unref } from 'vue'
import {
  CheckmarkOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  CopyOutline,
  EyeOutline,
  FolderOpenOutline,
  Play,
  Reload,
  Stop,
  TrashOutline
} from '@vicons/ionicons5'
import BangumiDirectory from '../../../components/BangumiDirectory.vue'
import { sanitizeRichHtml } from '../../../utils/rich-content-sanitizer'
import type { DetailLogItem, ResourceDetailDrawerProps } from '../component-contracts'

const props = defineProps<ResourceDetailDrawerProps>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'update:showDeleteScreenshotConfirm', value: boolean): void
}>()

const unwrapMaybeRef = <T>(value: T): T => unref(value) as T

const categorySettingsSafe = computed(() => unwrapMaybeRef(props.categorySettings) ?? {})
const detailStoresSafe = computed(() => unwrapMaybeRef(props.detailStores) ?? [])
const detailMetaItemsSafe = computed(() => unwrapMaybeRef(props.detailMetaItems) ?? [])
const detailStatsTextSafe = computed(() => unwrapMaybeRef(props.detailStatsText) ?? {
  firstAccess: '首次访问',
  lastAccess: '最后访问',
  accessCount: '访问次数',
  totalRuntime: '总时长'
})
const detailScreenshotPathsSafe = computed(() => unwrapMaybeRef(props.detailScreenshotPaths) ?? [])
const detailGalleryItemsSafe = computed(() => unwrapMaybeRef(props.detailGalleryItems) ?? [])
const detailAudioTreeSafe = computed(() => unwrapMaybeRef(props.detailAudioTree) ?? [])
const detailLogsSafe = computed(() => unwrapMaybeRef(props.detailLogs) ?? [])
const visibleDetailLogsSafe = computed(() => unwrapMaybeRef(props.visibleDetailLogs) ?? [])
const selectedDetailDescriptionHtml = computed(() => sanitizeRichHtml(String(props.selectedDetailResource?.description ?? '')))
const detailAudioContextMenuPositionSafe = computed(() => unwrapMaybeRef(props.detailAudioContextMenuPosition) ?? { x: 0, y: 0 })
const detailAudioContextMenuOptionsSafe = computed(() => unwrapMaybeRef(props.detailAudioContextMenuOptions) ?? [])
const detailPreviewSectionTitleSafe = computed(() => unwrapMaybeRef(props.detailPreviewSectionTitle) ?? '')
const detailGallerySectionTitleSafe = computed(() => unwrapMaybeRef(props.detailGallerySectionTitle) ?? '')
const detailDirectorySectionTitleSafe = computed(() => unwrapMaybeRef(props.detailDirectorySectionTitle) ?? '')
const detailDirectoryEmptyTextSafe = computed(() => unwrapMaybeRef(props.detailDirectoryEmptyText) ?? '暂无目录内容')
const detailEmptyLogDescriptionSafe = computed(() => unwrapMaybeRef(props.detailEmptyLogDescription) ?? '暂无日志')
const detailLogModeLabelSafe = computed(() => unwrapMaybeRef(props.detailLogModeLabel) ?? '启动方式')
const detailLogDurationLabelSafe = computed(() => unwrapMaybeRef(props.detailLogDurationLabel) ?? '运行时长')
const detailReadingProgressTextSafe = computed(() => unwrapMaybeRef(props.detailReadingProgressText) ?? '暂无')
const detailPlaybackProgressTextSafe = computed(() => unwrapMaybeRef(props.detailPlaybackProgressText) ?? '暂无')
const detailWebsitePlaceholderEmojiSafe = computed(() => unwrapMaybeRef(props.detailWebsitePlaceholderEmoji) ?? '🌐')
const detailWebsiteCoverPlaceholderTextSafe = computed(() => unwrapMaybeRef(props.detailWebsiteCoverPlaceholderText) ?? '暂无站点信息')
const detailOpenFolderTextSafe = computed(() => unwrapMaybeRef(props.detailOpenFolderText) ?? '打开资源文件夹')
const openCategoryButtonTextSafe = computed(() => unwrapMaybeRef(props.openCategoryButtonText) ?? '打开对应分类')
const detailDisplayPathSafe = computed(() => unwrapMaybeRef(props.detailDisplayPath) ?? '')
const currentScreenshotIndexSafe = computed(() => Number(props.currentScreenshotIndex ?? 0))
const launchButtonTextSafe = computed(() => {
  const fallback = String(props.startText ?? '').trim() || '启动'
  const hasResumeProgress = detailPlaybackProgressTextSafe.value !== '暂无' && Boolean(detailPlaybackProgressTextSafe.value)
  const usesPlaybackTerms = Boolean(props.detailIsAudio || props.detailIsAsmr || props.isVideoCategory)

  return usesPlaybackTerms && hasResumeProgress ? '继续播放' : fallback
})
const launchButtonHidden = computed(() => Boolean(props.selectedDetailResource?.missingStatus))


const formatDateTimeSafe = (value: unknown) => {
  if (typeof props.formatDateTime === 'function') {
    return props.formatDateTime(value as string | number | Date | null | undefined)
  }
  if (value === null || value === undefined || value === '') {
    return '暂无'
  }
  return String(value)
}

const formatDurationSafe = (value: unknown) => {
  if (typeof props.formatDuration === 'function') {
    return props.formatDuration(value as number | null | undefined)
  }
  if (value === null || value === undefined || value === '') {
    return '暂无'
  }
  return String(value)
}

const formatLaunchModeSafe = (launchMode: unknown, usePlayTerms = false) => {
  if (typeof props.formatLaunchMode === 'function') {
    return props.formatLaunchMode(launchMode as string | null | undefined, usePlayTerms)
  }
  return String(launchMode ?? (usePlayTerms ? '普通播放' : '普通启动'))
}

const formatLogEndTimeSafe = (value: unknown) => {
  if (typeof props.formatLogEndTime === 'function') {
    return props.formatLogEndTime(value as string | number | Date | null | undefined)
  }
  if (value === null || value === undefined || value === '') {
    return '进行中'
  }
  return String(value)
}

const formatLogDurationSafe = (value: DetailLogItem) => {
  if (typeof props.formatLogDuration === 'function') {
    return props.formatLogDuration(value)
  }
  return '暂无'
}

const getRatingEmojiSafe = (value: unknown) => {
  if (typeof props.getRatingEmoji === 'function') {
    return props.getRatingEmoji(value)
  }
  return ''
}

const handleCopyTextSafe = (value: string, label?: string) => props.handleCopyText?.(value, label)
const handleOpenStoreWebsiteSafe = (url?: string) => {
  if (!url) {
    return
  }

  return props.handleOpenStoreWebsite?.(url)
}
const handleOpenPictureViewerSafe = (target?: number | string) => props.handleOpenPictureViewer?.(target)
const handleLoadMoreLogsSafe = () => props.handleLoadMoreLogs?.()
const handleOpenCategorySafe = (resource: typeof props.selectedDetailResource) => resource && props.handleOpenCategory?.(resource)
const handleEditResourceSafe = (resource: typeof props.selectedDetailResource) => resource && props.handleEditResource?.(resource)
const handleOpenVideoOrderDialogSafe = (resource: typeof props.selectedDetailResource) => resource && props.handleOpenVideoOrderDialog?.(resource)
</script>

<template>
  <n-drawer
    :show="props.show"
    placement="right"
    :width="props.width"
    @update:show="(value) => emit('update:show', value)"
  >
    <n-drawer-content closable>
      <template #header>
        <div class="detail-drawer__header-title">
          <img
            v-if="props.detailIsWebsite && props.detailWebsiteFaviconSrc"
            :src="props.detailWebsiteFaviconSrc"
            :alt="props.selectedDetailResource?.title || `${props.categoryName}详情`"
            class="detail-drawer__header-icon"
          />
          <span v-else-if="props.detailIsWebsite" class="detail-drawer__header-icon detail-drawer__header-icon--emoji">
            {{ detailWebsitePlaceholderEmojiSafe }}
          </span>
          <span>{{ props.selectedDetailResource?.title || `${props.categoryName}详情` }}</span>
        </div>
      </template>
      <div class="detail-drawer__resize-handle" @mousedown.prevent="props.handleDetailDrawerResizeStart" />
      <AppScrollbar
        :content-style="{ paddingRight: '16px' }"
        style="max-height: 100%;"
      >
        <div
          v-if="props.selectedDetailResource"
          class="detail-drawer"
          :class="{ 'detail-drawer--software': props.detailIsSoftware }"
        >
          <div class="detail-drawer__cover">
            <img
              v-if="props.detailCoverPreviewSrc"
              :src="props.detailCoverPreviewSrc"
              :alt="props.selectedDetailResource.title"
              class="detail-drawer__cover-image"
            />
            <div
              v-else
              class="detail-drawer__cover-placeholder"
              :class="{ 'detail-drawer__cover-placeholder--website': props.detailIsWebsite }"
            >
              <template v-if="props.detailIsWebsite">
                <div class="detail-drawer__website-cover">
                  <div class="detail-drawer__website-cover-glow" />
                  <div class="detail-drawer__website-cover-badge">
                    <img
                      v-if="props.detailWebsiteFaviconSrc"
                      :src="props.detailWebsiteFaviconSrc"
                      :alt="props.selectedDetailResource.title"
                      class="detail-drawer__website-cover-icon"
                    />
                    <span v-else class="detail-drawer__website-cover-emoji">{{ detailWebsitePlaceholderEmojiSafe }}</span>
                  </div>
                  <span class="detail-drawer__website-cover-text">{{ detailWebsiteCoverPlaceholderTextSafe }}</span>
                </div>
              </template>
              <template v-else>
                暂无封面
              </template>
            </div>
          </div>

          <div class="detail-drawer__section">
            <div class="detail-drawer__section-title">基本信息</div>
            <div class="detail-drawer__grid">
              <div class="detail-drawer__item">
                <span class="detail-drawer__label">标题</span>
                <span class="detail-drawer__value">{{ props.selectedDetailResource.title || '暂无' }}</span>
              </div>
              <div v-if="!props.detailIsWebsite" class="detail-drawer__item">
                <span class="detail-drawer__label">文件名</span>
                <span class="detail-drawer__value">{{ props.selectedDetailResource.fileName || '暂无' }}</span>
              </div>
              <div v-if="!props.detailIsWebsite" class="detail-drawer__item">
                <span class="detail-drawer__label">{{ categorySettingsSafe.authorText || '作者' }}</span>
                <span class="detail-drawer__value">
                  {{ (props.selectedDetailResource.authors ?? []).map((item: any) => item.name).join('、') || '暂无' }}
                </span>
              </div>
              <div v-if="props.detailIsManga" class="detail-drawer__item">
                <span class="detail-drawer__label">汉化者</span>
                <span class="detail-drawer__value">{{ props.selectedDetailResource.multiImageMeta?.translator || '暂无' }}</span>
              </div>
              <div class="detail-drawer__item">
                <span class="detail-drawer__label">评分</span>
                <div class="detail-drawer__rating">
                  <div class="detail-drawer__rating-main">
                    <n-rate
                      :value="props.detailRatingDraft"
                      allow-half
                      clearable
                      @update:value="props.handleRatingUpdate"
                    />
                    <n-button
                      v-if="props.hasPendingRatingChange"
                      type="primary"
                      ghost
                      circle
                      size="tiny"
                      class="detail-drawer__rating-submit"
                      @click="props.handleSubmitRating"
                    >
                      <template #icon>
                        <n-icon :component="CheckmarkOutline" />
                      </template>
                    </n-button>
                  </div>
                  <span class="detail-drawer__rating-text">
                    <template v-if="props.ratingComment">
                      {{ props.ratingComment }} {{ getRatingEmojiSafe(props.detailRatingDraft) }}
                    </template>
                    <template v-else-if="Number(props.detailRatingDraft) === 0">
                      区 {{ getRatingEmojiSafe(props.detailRatingDraft) }}
                    </template>
                  </span>
                </div>
              </div>
              <div
                v-if="!props.detailIsWebsite"
                class="detail-drawer__item"
                :class="{ 'detail-drawer__item--full': props.detailIsAsmr }"
              >
                <span class="detail-drawer__label">分类</span>
                <div class="detail-drawer__tag-list">
                  <n-tag
                    v-for="type in props.selectedDetailResource.types ?? []"
                    :key="`${props.selectedDetailResource.id}-type-${type.id}`"
                    type="warning"
                  >
                    {{ type.name }}
                  </n-tag>
                  <span v-if="!(props.selectedDetailResource.types ?? []).length" class="detail-drawer__value">暂无</span>
                </div>
              </div>
              <div
                v-if="!props.detailIsWebsite"
                class="detail-drawer__item"
                :class="{ 'detail-drawer__item--full': props.detailIsAsmr }"
              >
                <span class="detail-drawer__label">标签</span>
                <div class="detail-drawer__tag-list">
                  <n-tag
                    v-for="tag in props.selectedDetailResource.tags ?? []"
                    :key="`${props.selectedDetailResource.id}-tag-${tag.id}`"
                    type="info"
                  >
                    {{ tag.name }}
                  </n-tag>
                  <span v-if="!(props.selectedDetailResource.tags ?? []).length" class="detail-drawer__value">暂无</span>
                </div>
              </div>
              <div v-if="!props.detailIsWebsite" class="detail-drawer__item detail-drawer__item--full">
                <span class="detail-drawer__label">路径</span>
                <div class="detail-drawer__path-row">
                  <span class="detail-drawer__value detail-drawer__value--path">{{ detailDisplayPathSafe || '暂无' }}</span>
                  <n-button type="primary" ghost class="detail-drawer__path-button" @click="props.handleOpenDetailResourcePath">
                    <template #icon>
                      <n-icon :component="FolderOpenOutline" />
                    </template>
                  </n-button>
                </div>
              </div>
              <div
                v-if="!props.detailIsWebsite && !props.detailIsSoftware && !props.detailIsManga && detailStoresSafe.length"
                class="detail-drawer__item detail-drawer__item--full"
              >
                <span class="detail-drawer__label">贩售网站</span>
                <div class="detail-drawer__store-list">
                  <button
                    v-for="storeItem in detailStoresSafe"
                    :key="`${props.selectedDetailResource.id}-detail-store-${storeItem.id}`"
                    type="button"
                    class="detail-drawer__store-button"
                    :disabled="!storeItem.url"
                    @click="handleOpenStoreWebsiteSafe(storeItem.url)"
                  >
                    <img
                      v-if="storeItem.icon"
                      :src="storeItem.icon"
                      :alt="storeItem.name"
                      class="detail-drawer__store-icon"
                    />
                    <span v-else class="detail-drawer__store-fallback">{{ storeItem.name.slice(0, 1) }}</span>
                    <span class="detail-drawer__store-name">{{ storeItem.name }}</span>
                  </button>
                </div>
              </div>
              <div
                v-for="metaItem in detailMetaItemsSafe"
                :key="`${props.selectedDetailResource.id}-meta-${metaItem.label}`"
                class="detail-drawer__item"
                :class="{ 'detail-drawer__item--full': props.detailIsSoftware || metaItem.full }"
              >
                <span class="detail-drawer__label">{{ metaItem.label }}</span>
                <div v-if="metaItem.copyValue" class="detail-drawer__path-row">
                  <span
                    class="detail-drawer__value detail-drawer__value--path"
                    :class="{ 'detail-drawer__value--clamp-3': metaItem.clampLines === 3 }"
                  >
                    {{ metaItem.value }}
                  </span>
                  <n-button
                    type="primary"
                    ghost
                    class="detail-drawer__path-button"
                    @click="handleCopyTextSafe(metaItem.copyValue, metaItem.label)"
                  >
                    <template #icon>
                      <n-icon :component="CopyOutline" />
                    </template>
                  </n-button>
                </div>
                <span
                  v-else-if="metaItem.icon"
                  class="detail-drawer__value detail-drawer__meta-with-icon"
                  :class="{ 'detail-drawer__value--multiline': props.detailIsSoftware }"
                >
                  <img :src="metaItem.icon" :alt="metaItem.value" class="detail-drawer__meta-icon" />
                  <span v-if="!(props.detailIsWebsite && metaItem.label === '站点图标')">{{ metaItem.value }}</span>
                </span>
                <span
                  v-else
                  class="detail-drawer__value"
                  :class="{ 'detail-drawer__value--multiline': props.detailIsSoftware }"
                >
                  {{ metaItem.value }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="props.hasDetailDescription" class="detail-drawer__section">
            <div class="detail-drawer__section-title">描述</div>
            <div class="detail-drawer__item detail-drawer__item--full">
              <div class="detail-drawer__description-box" :style="props.detailDescriptionBoxStyle">
                <AppScrollbar class="detail-drawer__description-scrollbar">
                  <slot name="description-content">
                    <div
                      class="detail-drawer__value detail-drawer__value--description detail-drawer__value--rich rich-markdown-content"
                      v-html="selectedDetailDescriptionHtml"
                    />
                  </slot>
                </AppScrollbar>
              </div>
            </div>
          </div>

          <div class="detail-drawer__section">
            <div class="detail-drawer__section-title">统计信息</div>
            <div class="detail-drawer__grid">
              <div class="detail-drawer__item">
                <span class="detail-drawer__label">{{ detailStatsTextSafe.firstAccess }}</span>
                <span class="detail-drawer__value">{{ formatDateTimeSafe(props.detailStats?.firstAccessTime) }}</span>
              </div>
              <div class="detail-drawer__item">
                <span class="detail-drawer__label">{{ detailStatsTextSafe.lastAccess }}</span>
                <span class="detail-drawer__value">{{ formatDateTimeSafe(props.detailStats?.lastAccessTime) }}</span>
              </div>
              <div class="detail-drawer__item">
                <span class="detail-drawer__label">{{ detailStatsTextSafe.accessCount }}</span>
                <span class="detail-drawer__value">{{ Number(props.detailStats?.accessCount ?? 0) }}</span>
              </div>
              <div v-if="props.detailShowTotalRuntime" class="detail-drawer__item">
                <span class="detail-drawer__label">{{ detailStatsTextSafe.totalRuntime }}</span>
                <span class="detail-drawer__value">{{ formatDurationSafe(props.detailStats?.totalRuntime) }}</span>
              </div>
              <div class="detail-drawer__item">
                <span class="detail-drawer__label">添加日期</span>
                <span class="detail-drawer__value">{{ formatDateTimeSafe(props.selectedDetailResource.createTime) }}</span>
              </div>
              <div v-if="props.detailIsManga || props.detailIsNovel" class="detail-drawer__item">
                <span class="detail-drawer__label">阅读进度</span>
                <span class="detail-drawer__value">{{ detailReadingProgressTextSafe }}</span>
              </div>
              <div v-if="props.detailIsAsmr || props.detailIsAudio || props.isVideoCategory" class="detail-drawer__item">
                <span class="detail-drawer__label">播放进度</span>
                <span class="detail-drawer__value">{{ detailPlaybackProgressTextSafe }}</span>
              </div>
            </div>
          </div>

          <div v-if="!props.detailIsSoftware && !props.detailIsManga && detailScreenshotPathsSafe.length" class="detail-drawer__section">
            <div class="detail-drawer__section-title">{{ detailPreviewSectionTitleSafe }}</div>
            <div class="detail-drawer__screenshot" @click="handleOpenPictureViewerSafe()">
              <img
                v-if="props.detailScreenshotPreviewSrc"
                :src="props.detailScreenshotPreviewSrc"
                :alt="props.selectedDetailResource.title"
                class="detail-drawer__screenshot-image"
              />
              <div class="detail-drawer__screenshot-mask">
                <n-icon :component="EyeOutline" size="28" />
              </div>
            </div>
            <div class="detail-drawer__screenshot-actions">
              <n-button quaternary @click="props.handlePreviousScreenshot">
                <template #icon>
                  <n-icon :component="ChevronBackOutline" />
                </template>
              </n-button>
              <div class="detail-drawer__screenshot-index">
                {{ currentScreenshotIndexSafe + 1 }} / {{ detailScreenshotPathsSafe.length }}
              </div>
              <n-button quaternary @click="props.handleNextScreenshot">
                <template #icon>
                  <n-icon :component="ChevronForwardOutline" />
                </template>
              </n-button>
              <n-popconfirm
                v-if="!props.detailIsManga"
                :show="props.showDeleteScreenshotConfirm"
                @update:show="(value) => emit('update:showDeleteScreenshotConfirm', value)"
                @positive-click="props.handleDeleteCurrentScreenshot"
                positive-text="删除！"
                negative-text="手滑了"
                :positive-button-props="{ type: 'error' }"
              >
                <template #trigger>
                  <n-button quaternary type="error">
                    <template #icon>
                      <n-icon :component="TrashOutline" />
                    </template>
                    删除截图
                  </n-button>
                </template>
                确认删除当前截图吗？
              </n-popconfirm>
              <n-button quaternary @click="props.handleOpenDetailScreenshotFolder">
                <template #icon>
                  <n-icon :component="FolderOpenOutline" />
                </template>
                {{ props.detailIsManga ? '打开漫画文件夹' : '打开截图文件夹' }}
              </n-button>
            </div>
          </div>

          <div v-if="props.detailIsManga && detailGalleryItemsSafe.length" class="detail-drawer__section">
            <div class="detail-drawer__section-title">{{ detailGallerySectionTitleSafe }}</div>
            <div class="detail-drawer__gallery">
              <button
                v-for="galleryItem in detailGalleryItemsSafe"
                :key="`${props.selectedDetailResource.id}-gallery-${galleryItem.index}`"
                type="button"
                class="detail-drawer__gallery-item"
                @click="handleOpenPictureViewerSafe(galleryItem.index)"
              >
                <img
                  v-if="galleryItem.url"
                  :src="galleryItem.url"
                  :alt="`${props.selectedDetailResource.title}-${galleryItem.index + 1}`"
                  class="detail-drawer__gallery-image"
                  loading="lazy"
                />
                <div v-else class="detail-drawer__gallery-placeholder">加载中</div>
                <div class="detail-drawer__gallery-index">{{ galleryItem.index + 1 }}</div>
              </button>
            </div>
          </div>

          <div v-else-if="props.detailIsAsmr" class="detail-drawer__section">
            <div class="detail-drawer__section-title">{{ detailDirectorySectionTitleSafe }}</div>
            <div v-if="props.detailAudioTreeLoading" class="detail-directory-loading">
              <n-spin size="small" :show="props.detailAudioTreeLoading">
                <template #icon>
                  <n-icon>
                    <Reload />
                  </n-icon>
                </template>
                <div class="detail-directory-loading__indicator" />
              </n-spin>
              <span>正在读取目录...</span>
            </div>
            <n-empty v-else-if="!detailAudioTreeSafe.length" :description="detailDirectoryEmptyTextSafe" />
            <template v-else>
              <n-tree
                block-line
                expand-on-click
                :data="detailAudioTreeSafe"
                :render-label="props.renderAudioTreeLabel"
                :render-suffix="props.renderAudioTreeSuffix"
                class="detail-audio-tree"
              />
              <n-dropdown
                trigger="manual"
                :show="props.detailAudioContextMenuVisible"
                :x="detailAudioContextMenuPositionSafe.x"
                :y="detailAudioContextMenuPositionSafe.y"
                placement="bottom-start"
                :options="detailAudioContextMenuOptionsSafe"
                :on-clickoutside="props.closeDetailAudioContextMenu"
                @select="props.handleSelectDetailAudioContextMenu"
              />
            </template>
          </div>

          <div v-else-if="props.isVideoFolderCategory" class="detail-drawer__section">
            <div class="detail-drawer__section-title">{{ detailDirectorySectionTitleSafe }}</div>
            <div v-if="props.detailAudioTreeLoading" class="detail-directory-loading">
              <n-spin size="small" :show="props.detailAudioTreeLoading">
                <template #icon>
                  <n-icon>
                    <Reload />
                  </n-icon>
                </template>
                <div class="detail-directory-loading__indicator" />
              </n-spin>
              <span>正在读取目录...</span>
            </div>
            <n-empty v-else-if="!detailAudioTreeSafe.length" :description="detailDirectoryEmptyTextSafe" />
            <template v-else>
              <BangumiDirectory
                :nodes="detailAudioTreeSafe"
                @play="props.handleAudioTreePlay"
                @item-contextmenu="props.handleOpenAudioTreeContextMenu"
              />
              <n-dropdown
                trigger="manual"
                :show="props.detailAudioContextMenuVisible"
                :x="detailAudioContextMenuPositionSafe.x"
                :y="detailAudioContextMenuPositionSafe.y"
                placement="bottom-start"
                :options="detailAudioContextMenuOptionsSafe"
                :on-clickoutside="props.closeDetailAudioContextMenu"
                @select="props.handleSelectDetailAudioContextMenu"
              />
            </template>
          </div>

          <div v-else-if="props.detailShowLogs" class="detail-drawer__section">
            <div class="detail-drawer__section-title">{{ detailGallerySectionTitleSafe }}</div>
              <n-empty v-if="!detailLogsSafe.length" :description="detailEmptyLogDescriptionSafe" />
            <n-infinite-scroll
              v-else
              class="detail-drawer__logs-scroll"
              :distance="8"
              @load="handleLoadMoreLogsSafe"
            >
              <div class="detail-drawer__logs">
                <div
                  v-for="(logItem, index) in visibleDetailLogsSafe"
                  :key="`${props.selectedDetailResource.id}-${index}-${logItem.startTime}`"
                  class="detail-drawer__log"
                >
                  <div class="detail-drawer__log-row">
                    <span class="detail-drawer__log-label">{{ detailLogModeLabelSafe }}</span>
                    <span class="detail-drawer__log-value">{{ formatLaunchModeSafe(logItem.launchMode, props.isVideoCategory) }}</span>
                  </div>
                  <div class="detail-drawer__log-row">
                    <span class="detail-drawer__log-label">开始时间</span>
                    <span class="detail-drawer__log-value">{{ formatDateTimeSafe(logItem.startTime) }}</span>
                  </div>
                  <div class="detail-drawer__log-row">
                    <span class="detail-drawer__log-label">结束时间</span>
                    <span class="detail-drawer__log-value">{{ formatLogEndTimeSafe(logItem.endTime) }}</span>
                  </div>
                  <div class="detail-drawer__log-row">
                    <span class="detail-drawer__log-label">{{ detailLogDurationLabelSafe }}</span>
                    <span class="detail-drawer__log-value">{{ formatLogDurationSafe(logItem) }}</span>
                  </div>
                </div>
              </div>
              <div v-if="props.hasMoreDetailLogs" class="detail-drawer__logs-more">
                <n-button quaternary size="small" @click="handleLoadMoreLogsSafe">展示更多</n-button>
              </div>
              <div v-if="props.noMore">
                <div class="detail-drawer__logs-finish">没有更多了 🤪</div>
              </div>
            </n-infinite-scroll>
          </div>

          <n-float-button
            v-if="!launchButtonHidden"
            :type="props.selectedDetailResource?.isRunning ? 'error' : 'primary'"
            class="detail-drawer__launch"
            :description="props.selectedDetailResource?.isRunning ? '停止' : launchButtonTextSafe"
            @click="props.handleDetailLaunchAction"
          >
            <n-icon>
              <component :is="props.selectedDetailResource?.isRunning ? Stop : Play" />
            </n-icon>
          </n-float-button>
        </div>
      </AppScrollbar>
      <template #footer>
        <div class="detail-drawer__footer">
          <n-space justify="start">
            <n-button
              v-if="props.showOpenCategoryButton"
              :disabled="!props.selectedDetailResource"
              @click="handleOpenCategorySafe(props.selectedDetailResource)"
            >
              {{ openCategoryButtonTextSafe }}
            </n-button>
            <n-button :disabled="!props.selectedDetailResource" @click="handleEditResourceSafe(props.selectedDetailResource)">
              编辑信息
            </n-button>
            <n-button
              v-if="props.isVideoFolderCategory"
              :disabled="!props.selectedDetailResource"
              @click="handleOpenVideoOrderDialogSafe(props.selectedDetailResource)"
            >
              修改顺序
            </n-button>
            <n-button :disabled="!props.selectedDetailResource" @click="props.handleOpenDetailResourcePath">
              {{ detailOpenFolderTextSafe }}
            </n-button>
          </n-space>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.detail-drawer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 72px;
}

.detail-drawer__cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
}

.detail-drawer__cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.detail-drawer__cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
}

.detail-drawer__cover-placeholder--website {
  opacity: 1;
}

.detail-drawer__website-cover {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background:
    radial-gradient(circle at top, rgba(99, 226, 183, 0.18), transparent 48%),
    linear-gradient(160deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
}

.detail-drawer__website-cover-glow {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 180px;
  height: 180px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(99, 226, 183, 0.22), transparent 68%);
  filter: blur(18px);
}

.detail-drawer__website-cover-badge {
  position: relative;
  z-index: 1;
  width: 72px;
  height: 72px;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
}

.detail-drawer__website-cover-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.detail-drawer__website-cover-emoji {
  font-size: 30px;
  line-height: 1;
}

.detail-drawer__website-cover-text {
  position: relative;
  z-index: 1;
  font-size: 13px;
  letter-spacing: 0.04em;
  opacity: 0.72;
}

.detail-drawer__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-drawer__section-title {
  font-size: 15px;
  font-weight: 600;
}

.detail-drawer__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-drawer__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.08);
}

.detail-drawer__item--full {
  grid-column: 1 / -1;
}

.detail-drawer__label,
.detail-drawer__log-label {
  font-size: 12px;
  opacity: 0.6;
}

.detail-drawer__value,
.detail-drawer__log-value {
  font-size: 13px;
  line-height: 1.5;
}

.detail-drawer__header-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.detail-drawer__header-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: cover;
}

.detail-drawer__header-icon--emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.detail-drawer__meta-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.detail-drawer__meta-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex: 0 0 auto;
}

.detail-drawer__value--path {
  word-break: break-all;
  flex: 1;
  min-width: 0;
}

.detail-drawer__value--clamp-3 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.detail-drawer__value--multiline {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.detail-drawer__value--description {
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-drawer__description-box {
  height: 400px;
  overflow: hidden;
}

.detail-drawer__description-scrollbar {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 100%;
  box-sizing: border-box;
  padding-right: 6px;
}

.detail-drawer__path-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.detail-drawer__path-button {
  margin-left: auto;
  flex: 0 0 auto;
}

.detail-drawer__resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  width: 10px;
  height: 100%;
  cursor: ew-resize;
  z-index: 5;
}

.detail-drawer__tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-drawer__store-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.detail-drawer__store-button {
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.detail-drawer__store-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.detail-drawer__store-icon,
.detail-drawer__store-fallback {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.detail-drawer__store-fallback {
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.14);
  font-size: 12px;
}

.detail-drawer__store-name {
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}

.detail-drawer__footer {
  width: 100%;
  padding-top: 8px;
}

.detail-drawer__tag-list :deep(.n-tag) {
  border-radius: 0;
}

.detail-drawer__rating {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-drawer__rating-main {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.detail-drawer__rating-text {
  font-size: 13px;
  line-height: 1.4;
}

.detail-drawer__rating-submit {
  margin-left: auto;
  flex: 0 0 auto;
}

.detail-drawer__logs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-drawer__logs-scroll {
  max-height: 420px;
}

.detail-drawer__gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.detail-audio-tree {
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.06);
  padding: 10px 12px;
}

.detail-audio-tree__label {
  display: block;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
}

.detail-audio-tree__file {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.detail-audio-tree__file-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-audio-tree__video-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
}

.detail-audio-tree__video-cover--empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(216, 221, 229, 0.42);
}

.detail-audio-tree__video-cover-shell {
  position: relative;
  width: 150px;
  height: 60px;
  flex: 0 0 auto;
}

.detail-audio-tree__video-cover-index {
  position: absolute;
  top: 50%;
  left: 50%;
  min-width: 28px;
  transform: translate(-50%, -50%);
}

.detail-directory-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 72px;
}

.detail-directory-loading__indicator {
  width: 18px;
  height: 18px;
}

.detail-audio-tree__subtitle-badge {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(99, 226, 183, 0.16);
}

.detail-audio-tree__file-subtitle {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.46);
}

.detail-audio-tree__action-button {
  appearance: none;
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.detail-audio-tree__action-button--play {
  background: rgb(99, 226, 183);
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(99, 226, 183, 0.24);
}

.detail-audio-tree__action-button:hover {
  background: rgb(125, 232, 196);
  transform: translateY(-1px) scale(1.06);
  box-shadow: 0 6px 14px rgba(99, 226, 183, 0.34);
}

.detail-audio-tree__action-button:active {
  transform: scale(0.95);
  box-shadow: 0 2px 8px rgba(99, 226, 183, 0.24);
}

.detail-audio-tree__action-icon {
  width: 11px;
  height: 11px;
}

.detail-audio-tree :deep(.n-tree-node-content) {
  width: 100%;
}

.detail-audio-tree :deep(.n-tree-node-content__text) {
  min-width: 0;
  flex: 1 1 auto;
  white-space: normal;
}

.detail-audio-tree :deep(.n-tree-node-wrapper) {
  width: 100%;
}

.detail-audio-tree :deep(.n-tree-node-switcher--hide) {
  width: 0 !important;
  min-width: 0 !important;
  margin-right: 0 !important;
  padding: 0 !important;
}

.detail-audio-tree :deep(.n-tree-node-content__suffix) {
  flex: 0 0 auto;
  margin-left: 12px;
  display: inline-flex;
  align-items: flex-start;
}

.detail-drawer__gallery-item {
  position: relative;
  padding: 0;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  aspect-ratio: 3 / 4;
}

.detail-drawer__gallery-image,
.detail-drawer__gallery-placeholder {
  width: 100%;
  height: 100%;
  display: block;
}

.detail-drawer__gallery-image {
  object-fit: cover;
}

.detail-drawer__gallery-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.detail-drawer__gallery-index {
  position: absolute;
  right: 8px;
  bottom: 8px;
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  font-size: 11px;
  text-align: center;
}

.detail-drawer__screenshot {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  cursor: pointer;
}

.detail-drawer__screenshot-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.detail-drawer__screenshot-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.detail-drawer__screenshot:hover .detail-drawer__screenshot-mask {
  opacity: 1;
}

.detail-drawer__screenshot-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-drawer__screenshot-index {
  min-width: 56px;
  font-size: 12px;
  opacity: 0.65;
  text-align: center;
}

.detail-drawer__log {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.08);
}

.detail-drawer__log-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.detail-drawer__logs-more,
.detail-drawer__logs-finish {
  display: flex;
  justify-content: center;
  padding-top: 12px;
}

.detail-drawer__logs-finish {
  font-size: 12px;
  opacity: 0.6;
}

.detail-drawer__launch {
  position: fixed !important;
  right: 12px;
  bottom: 12px;
  z-index: 2100;
}
</style>
