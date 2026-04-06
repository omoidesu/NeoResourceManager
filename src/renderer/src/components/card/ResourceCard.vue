<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import { NIcon } from 'naive-ui'
import {
  CheckmarkCircleOutline,
  CreateOutline,
  FolderOpenOutline,
  HeartDislikeOutline,
  HeartOutline,
  ImageOutline,
  InformationCircleOutline,
  AlertCircleOutline,
  CheckmarkDoneOutline,
  SquareOutline,
  Play,
  Stop,
  TrashOutline
} from '@vicons/ionicons5'

const props = defineProps<{
  resource: any
  categoryName?: string
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
  selected?: boolean
  selectionMode?: boolean
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
  (event: 'open-screenshot-folder', resource: any): void
  (event: 'toggle-favorite', resource: any): void
  (event: 'toggle-completed', resource: any): void
  (event: 'toggle-select', resource: any): void
  (event: 'delete', resource: any): void
  (event: 'delete-files', resource: any): void
}>()

const resourceTags = computed(() => props.resource?.tags ?? [])
const resourceTypes = computed(() => props.resource?.types ?? [])
const resourceAuthors = computed(() => props.resource?.authors ?? [])
const coverPreviewSrc = ref('')
const fileIconSrc = ref('')
const showContextMenu = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const showStopConfirm = ref(false)
let stopClickTimer: ReturnType<typeof setTimeout> | null = null

const normalizeCoverPreviewSource = (coverPath: string) => {
  if (!coverPath) {
    return ''
  }

  if (coverPath.startsWith('//')) {
    return `https:${coverPath}`
  }

  return coverPath
}

const renderMenuIcon = (icon: any) => () => h(NIcon, null, { default: () => h(icon) })
const renderDangerLabel = (label: string) => () => h('span', {
  style: {
    color: '#ff7875',
    fontWeight: 700
  }
}, label)

const contextMenuOptions = computed(() => ([
  {
    label: props.startText || '启动',
    key: 'launch',
    disabled: !canLaunch.value,
    icon: renderMenuIcon(Play)
  },
  ...(props.showMtoolLaunch ? [{
    label: '通过 MTool 启动',
    key: 'mtool-launch',
    disabled: !props.canMtoolLaunch || !canLaunch.value,
    icon: renderMenuIcon(Play)
  }] : []),
  ...(props.showZoneLaunch ? [{
    label: '转区启动',
    key: 'zone-launch',
    disabled: !props.canZoneLaunch || !canLaunch.value,
    icon: renderMenuIcon(Play)
  }] : []),
  ...(props.showAdminLaunch ? [{
    label: '以管理员身份运行',
    key: 'admin-launch',
    disabled: !canLaunch.value,
    icon: renderMenuIcon(AlertCircleOutline)
  }] : []),
  {
    label: '详细信息',
    key: 'detail',
    icon: renderMenuIcon(InformationCircleOutline)
  },
  {
    label: '修改信息',
    key: 'edit',
    icon: renderMenuIcon(CreateOutline)
  },
  {
    label: props.selected ? '取消多选' : '多选',
    key: 'toggle-select',
    icon: renderMenuIcon(props.selected ? CheckmarkDoneOutline : SquareOutline)
  },
  {
    label: props.resource?.ifFavorite ? '取消收藏' : '收藏',
    key: 'toggle-favorite',
    icon: renderMenuIcon(props.resource?.ifFavorite ? HeartDislikeOutline : HeartOutline)
  },
  ...(props.showCompletedToggle ? [{
    label: props.resource?.isCompleted ? '取消已通关' : '已通关',
    key: 'toggle-completed',
    icon: renderMenuIcon(CheckmarkCircleOutline)
  }] : []),
  {
    label: '打开文件夹',
    key: 'open-folder',
    disabled: !Boolean(props.resource?.basePath) || Boolean(props.resource?.missingStatus),
    icon: renderMenuIcon(FolderOpenOutline)
  },
  ...(props.showScreenshotFolder ? [{
    label: '打开截图文件夹',
    key: 'open-screenshot-folder',
    disabled: !Boolean(props.resource?.id),
    icon: renderMenuIcon(ImageOutline)
  }] : []),
  {
    type: 'divider',
    key: 'danger-divider'
  },
  {
    label: renderDangerLabel(`删除${props.categoryName || '资源'}`),
    key: 'delete',
    icon: renderMenuIcon(TrashOutline)
  },
  {
    label: renderDangerLabel('删除本地文件'),
    key: 'delete-files',
    disabled: Boolean(props.resource?.missingStatus) || !Boolean(props.resource?.basePath),
    icon: renderMenuIcon(TrashOutline)
  }
]))

const displayBaseName = computed(() => {
  const fileName = String(props.resource?.fileName ?? props.resource?.filename ?? '')
  if (fileName) {
    return fileName
  }

  const basePath = String(props.resource?.basePath ?? '')
  if (!basePath) {
    return ''
  }

  const normalizedPath = basePath.replace(/\\/g, '/')
  return normalizedPath.split('/').pop() ?? normalizedPath
})

const fallbackExecutableIcon = computed(() => {
  const fileName = displayBaseName.value.toLowerCase()

  if (fileName.endsWith('.exe')) return '🧩'
  if (fileName.endsWith('.html') || fileName.endsWith('.htm')) return '🌐'
  if (fileName.endsWith('.swf')) return '⚡'
  if (fileName.endsWith('.apk')) return '📱'
  if (fileName.endsWith('.bat') || fileName.endsWith('.cmd')) return '⚙'

  return '📄'
})

const normalizedRating = computed(() => {
  const rating = Number(props.resource?.rating ?? -1)

  if (!Number.isFinite(rating) || rating < 0) {
    return 0
  }

  return rating
})

const isRunning = computed(() => Boolean(props.resource?.isRunning))

const launchButtonStyle = computed(() => {
  if (isRunning.value) {
    return {
      '--n-color': '#d03050',
      '--n-color-hover': '#de576d',
      '--n-color-pressed': '#ab1f3f',
      '--n-text-color': '#ffffff',
      '--n-icon-color': '#ffffff'
    }
  }

  return undefined
})

const canLaunch = computed(() => {
  return Boolean(props.resource?.basePath) && !props.resource?.missingStatus && !isRunning.value
})

const canStop = computed(() => {
  return Boolean(props.resource?.isRunning)
})

const handleLaunch = () => {
  if (!canLaunch.value) {
    return
  }

  emit('launch', props.resource)
}

const handleStop = () => {
  if (!canStop.value) {
    return
  }

  emit('stop', props.resource)
}

const clearStopClickTimer = () => {
  if (stopClickTimer) {
    clearTimeout(stopClickTimer)
    stopClickTimer = null
  }
}

const handleStopButtonClick = () => {
  if (!canStop.value) {
    return
  }

  clearStopClickTimer()
  stopClickTimer = setTimeout(() => {
    showStopConfirm.value = true
    stopClickTimer = null
  }, 220)
}

const handleStopButtonDoubleClick = () => {
  if (!canStop.value) {
    return
  }

  clearStopClickTimer()
  showStopConfirm.value = false
  handleStop()
}

const handleConfirmStop = () => {
  showStopConfirm.value = false
  handleStop()
}

const handleShowDetail = () => {
  if (props.selectionMode) {
    emit('toggle-select', props.resource)
    return
  }

  emit('show-detail', props.resource)
}

const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  showContextMenu.value = false
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  requestAnimationFrame(() => {
    showContextMenu.value = true
  })
}

const handleSelectMenu = (key: string) => {
  showContextMenu.value = false

  if (key === 'launch') {
    handleLaunch()
    return
  }

  if (key === 'zone-launch') {
    emit('zone-launch', props.resource)
    return
  }

  if (key === 'admin-launch') {
    emit('admin-launch', props.resource)
    return
  }

  if (key === 'mtool-launch') {
    emit('mtool-launch', props.resource)
    return
  }

  if (key === 'detail') {
    emit('show-detail', props.resource)
    return
  }

  if (key === 'edit') {
    emit('edit', props.resource)
    return
  }

  if (key === 'open-folder') {
    emit('open-folder', props.resource)
    return
  }

  if (key === 'open-screenshot-folder') {
    emit('open-screenshot-folder', props.resource)
    return
  }

  if (key === 'toggle-favorite') {
    emit('toggle-favorite', props.resource)
    return
  }

  if (key === 'toggle-select') {
    emit('toggle-select', props.resource)
    return
  }

  if (key === 'toggle-completed') {
    emit('toggle-completed', props.resource)
    return
  }

  if (key === 'delete') {
    emit('delete', props.resource)
    return
  }

  if (key === 'delete-files') {
    emit('delete-files', props.resource)
  }
}

watch(
  () => props.resource?.coverPath,
  async (coverPath) => {
    if (!coverPath) {
      coverPreviewSrc.value = ''
      return
    }

    const normalizedCoverPath = normalizeCoverPreviewSource(coverPath)
    if (/^https?:\/\//i.test(normalizedCoverPath) || /^data:/i.test(normalizedCoverPath)) {
      coverPreviewSrc.value = normalizedCoverPath
      return
    }

    try {
      coverPreviewSrc.value = (await window.api.dialog.getImagePreviewUrl(coverPath, {
        maxWidth: 520,
        maxHeight: 340,
        fit: 'cover',
        quality: 78
      })) ?? ''
    } catch {
      coverPreviewSrc.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => [props.resource?.basePath, props.resource?.fileName ?? props.resource?.filename ?? ''],
  async ([basePath, fileName]) => {
    if (!basePath) {
      fileIconSrc.value = ''
      return
    }

    try {
      fileIconSrc.value = (await window.api.dialog.getFileIconAsDataUrl(basePath, fileName)) ?? ''
    } catch {
      fileIconSrc.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => props.resource?.isRunning,
  (isRunningNow) => {
    if (!isRunningNow) {
      clearStopClickTimer()
      showStopConfirm.value = false
    }
  }
)

onBeforeUnmount(() => {
  clearStopClickTimer()
})
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

      <div class="resource-card-trigger" @contextmenu="handleContextMenu" @click="handleShowDetail">
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
            />
            <div v-else class="resource-card__cover-placeholder">
              {{ categoryName || '资源' }}
            </div>
          </div>

          <div class="resource-card__header">
            <div class="resource-card__heading">
              <div class="resource-card__title-row">
                <span class="resource-card__title-icon">
                  <img
                    v-if="fileIconSrc"
                    :src="fileIconSrc"
                    :alt="displayBaseName || resource.title"
                    class="resource-card__title-icon-image"
                  />
                  <span v-else>{{ fallbackExecutableIcon }}</span>
                </span>
                <div class="resource-card__title">{{ resource.title }}</div>
              </div>
              <div v-if="displayBaseName" class="resource-card__subtitle resource-card__subtitle--file" :title="resource.basePath">
                {{ displayBaseName }}
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
                    class="resource-card__status-icon resource-card__status-icon--interactive"
                    :color="resource.ifFavorite ? '#f0a020' : 'rgba(255, 255, 255, 0.28)'"
                    @click.stop="emit('toggle-favorite', resource)"
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
                    class="resource-card__status-icon resource-card__status-icon--interactive"
                    :color="resource.isCompleted ? '#2080f0' : 'rgba(255, 255, 255, 0.28)'"
                    @click.stop="emit('toggle-completed', resource)"
                  >
                    <CheckmarkCircleOutline />
                  </n-icon>
                </template>
                {{ resource.isCompleted ? '取消通关' : '标记通关' }}
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

            <div v-if="resourceTypes.length" class="resource-card__meta-line">
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

            <div v-if="resourceTags.length" class="resource-card__meta-line">
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
          v-if="isRunning"
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
          v-else
          type="primary"
          class="resource-card__launch"
          description="启动"
          :disabled="!canLaunch"
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

.resource-card__title-icon-image {
  width: 18px;
  height: 18px;
  object-fit: contain;
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

.resource-card__meta-line :deep(.n-space) {
  flex-wrap: wrap;
  min-width: 0;
  max-height: 54px;
  overflow: hidden;
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
