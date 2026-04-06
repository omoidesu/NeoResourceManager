<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CopyOutline, EyeOutline, AddOutline, RemoveOutline, OpenOutline, ChevronBackOutline, ChevronForwardOutline, RefreshOutline, TrashOutline } from '@vicons/ionicons5'
import { notify } from '../utils/notification'

const props = withDefaults(defineProps<{
  show: boolean
  imagePaths: string[]
  initialIndex?: number
  scrollMode?: string
  allowDelete?: boolean
}>(), {
  initialIndex: 0,
  scrollMode: 'zoom',
  allowDelete: true
})

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'delete-image', payload: { filePath: string; index: number }): void
}>()

const currentIndex = ref(0)
const scale = ref(1)
const fitScale = ref(1)
const thumbSrcMap = ref<Record<string, string>>({})
const fullImageUrlMap = ref<Record<string, string>>({})
const stageRef = ref<HTMLDivElement | null>(null)
const imageScrollContainerRef = ref<HTMLDivElement | null>(null)
const imageElementRef = ref<HTMLImageElement | null>(null)
const thumbRefs = ref<HTMLElement[]>([])
const stageCursor = ref<'default' | 'left' | 'right' | 'grab' | 'grabbing'>('default')
const isDragging = ref(false)
const dragState = ref({
  startX: 0,
  startY: 0,
  scrollLeft: 0,
  scrollTop: 0
})

const clampIndex = (index: number) => {
  if (!props.imagePaths.length) {
    return 0
  }

  if (index < 0) {
    return props.imagePaths.length - 1
  }

  if (index >= props.imagePaths.length) {
    return 0
  }

  return index
}

const currentImagePath = computed(() => props.imagePaths[currentIndex.value] ?? '')
const currentImageUrl = computed(() => fullImageUrlMap.value[currentImagePath.value] ?? '')
const effectiveScale = computed(() => Number((fitScale.value * scale.value).toFixed(4)))
const hasPrevious = computed(() => props.imagePaths.length > 1)
const hasNext = computed(() => props.imagePaths.length > 1)

const loadThumbPreviewImage = async (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim()
  if (!normalizedPath || thumbSrcMap.value[normalizedPath]) {
    return
  }

  try {
    const previewUrl = await window.api.dialog.getImagePreviewUrl(normalizedPath, {
      maxWidth: 240,
      maxHeight: 160,
      fit: 'cover',
      quality: 72
    })
    if (!previewUrl) {
      return
    }

    thumbSrcMap.value = {
      ...thumbSrcMap.value,
      [normalizedPath]: previewUrl
    }
  } catch {
    // ignore preview load failure and keep fallback state
  }
}

const loadMainImage = async (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim()
  if (!normalizedPath || fullImageUrlMap.value[normalizedPath]) {
    return
  }

  try {
    const imageUrl = await window.api.dialog.readImageAsDataUrl(normalizedPath)
    if (!imageUrl) {
      return
    }

    fullImageUrlMap.value = {
      ...fullImageUrlMap.value,
      [normalizedPath]: imageUrl
    }
  } catch {
    // ignore full image load failure and keep fallback state
  }
}

const preloadThumbsAroundCurrent = async (radius = 8) => {
  const tasks: Promise<void>[] = []
  const start = Math.max(0, currentIndex.value - radius)
  const end = Math.min(props.imagePaths.length - 1, currentIndex.value + radius)

  for (let index = start; index <= end; index += 1) {
    const imagePath = props.imagePaths[index]
    if (imagePath) {
      tasks.push(loadThumbPreviewImage(imagePath))
    }
  }

  await Promise.all(tasks)
}

const clearImageCache = () => {
  thumbSrcMap.value = {}
  fullImageUrlMap.value = {}
}

const getScrollbarContainer = () => imageScrollContainerRef.value

const setThumbRef = (element: unknown, index: number) => {
  if (!(element instanceof HTMLElement)) {
    return
  }

  thumbRefs.value[index] = element
}

const scrollActiveThumbIntoView = async () => {
  await nextTick()
  const activeThumb = thumbRefs.value[currentIndex.value]
  if (!activeThumb) {
    return
  }

  activeThumb.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'center'
  })
}

const closeViewer = () => {
  emit('update:show', false)
}

const resetZoom = () => {
  scale.value = 1
  updateFitScale()
  void nextTick(() => {
    const container = getScrollbarContainer()
    if (!container) {
      return
    }

    container.scrollLeft = 0
    container.scrollTop = 0
  })
}

const zoomIn = () => {
  scale.value = Math.min(4, Number((scale.value + 0.2).toFixed(2)))
}

const zoomOut = () => {
  scale.value = Math.max(0.4, Number((scale.value - 0.2).toFixed(2)))
}

const toggleZoom = () => {
  if (scale.value > 1) {
    resetZoom()
    return
  }

  scale.value = 2
}

const goPrevious = () => {
  if (!props.imagePaths.length) {
    return
  }

  currentIndex.value = clampIndex(currentIndex.value - 1)
  resetZoom()
}

const goNext = () => {
  if (!props.imagePaths.length) {
    return
  }

  currentIndex.value = clampIndex(currentIndex.value + 1)
  resetZoom()
}

const handleWheel = (event: WheelEvent) => {
  if (!props.show || !props.imagePaths.length) {
    return
  }

  event.preventDefault()

  if (props.scrollMode === 'scroll') {
    if (event.deltaY > 0) {
      goNext()
    } else if (event.deltaY < 0) {
      goPrevious()
    }
    return
  }

  if (event.deltaY > 0) {
    zoomOut()
  } else if (event.deltaY < 0) {
    zoomIn()
  }
}

const handleThumbWheel = (event: WheelEvent) => {
  if (!props.show || !props.imagePaths.length) {
    return
  }

  event.preventDefault()

  if (event.deltaY > 0 || event.deltaX > 0) {
    goNext()
  } else if (event.deltaY < 0 || event.deltaX < 0) {
    goPrevious()
  }
}

const handleStageClick = (event: MouseEvent) => {
  if (isDragging.value) {
    return
  }

  const stage = event.currentTarget as HTMLDivElement | null
  if (!stage) {
    closeViewer()
    return
  }

  const { left, width } = stage.getBoundingClientRect()
  const clickRatio = width > 0 ? (event.clientX - left) / width : 0.5

  if (clickRatio <= 0.32) {
    goPrevious()
    return
  }

  if (clickRatio >= 0.68) {
    goNext()
    return
  }
}

const handleStageDoubleClick = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  toggleZoom()
}

const updateStageCursor = (event?: MouseEvent) => {
  if (isDragging.value) {
    stageCursor.value = 'grabbing'
    return
  }

  if (effectiveScale.value > 1) {
    stageCursor.value = 'grab'
    return
  }

  if (!event || !stageRef.value) {
    stageCursor.value = 'default'
    return
  }

  const { left, width } = stageRef.value.getBoundingClientRect()
  const ratio = width > 0 ? (event.clientX - left) / width : 0.5

  if (ratio <= 0.32) {
    stageCursor.value = 'left'
    return
  }

  if (ratio >= 0.68) {
    stageCursor.value = 'right'
    return
  }

  stageCursor.value = 'default'
}

const handleStageMouseMove = (event: MouseEvent) => {
  updateStageCursor(event)
}

const handleStageMouseLeave = () => {
  if (!isDragging.value) {
    stageCursor.value = 'default'
  }
}

const handleStageMouseDown = (event: MouseEvent) => {
  if (effectiveScale.value <= 1) {
    return
  }

  const container = getScrollbarContainer()
  if (!container) {
    return
  }

  isDragging.value = true
  dragState.value = {
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: container.scrollLeft,
    scrollTop: container.scrollTop
  }
  stageCursor.value = 'grabbing'
  event.preventDefault()
}

const handleGlobalMouseMove = (event: MouseEvent) => {
  if (!isDragging.value) {
    return
  }

  const container = getScrollbarContainer()
  if (!container) {
    return
  }

  const deltaX = event.clientX - dragState.value.startX
  const deltaY = event.clientY - dragState.value.startY

  container.scrollLeft = dragState.value.scrollLeft - deltaX
  container.scrollTop = dragState.value.scrollTop - deltaY
}

const stopDragging = () => {
  if (!isDragging.value) {
    return
  }

  isDragging.value = false
  stageCursor.value = effectiveScale.value > 1 ? 'grab' : 'default'
}

const updateFitScale = () => {
  const stageElement = stageRef.value
  const imageElement = imageElementRef.value

  if (!stageElement || !imageElement) {
    fitScale.value = 1
    return
  }

  const stageWidth = Math.max(1, stageElement.clientWidth - 28)
  const stageHeight = Math.max(1, stageElement.clientHeight)
  const naturalWidth = Number(imageElement.naturalWidth ?? 0)
  const naturalHeight = Number(imageElement.naturalHeight ?? 0)

  if (!naturalWidth || !naturalHeight) {
    fitScale.value = 1
    return
  }

  fitScale.value = Math.max(0.1, Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight))
}

const handleImageLoad = () => {
  updateFitScale()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.show) {
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goPrevious()
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    goNext()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeViewer()
  }
}

const handleOpenWithDefaultApp = async () => {
  const imagePath = currentImagePath.value
  if (!imagePath) {
    return
  }

  try {
    const message = await window.api.dialog.openPath(imagePath)
    if (message) {
      notify('error', '打开图片', message)
      return
    }

    notify('success', '打开图片', '已使用默认程序打开图片')
  } catch (error) {
    notify('error', '打开图片', error instanceof Error ? error.message : '打开图片失败')
  }
}

const handleCopyImage = async () => {
  const imagePath = currentImagePath.value
  if (!imagePath) {
    return
  }

  try {
    const message = await window.api.dialog.copyImageToClipboard(imagePath)
    if (message) {
      notify('error', '复制图片', message)
      return
    }

    notify('success', '复制图片', '图片已复制到剪贴板')
  } catch (error) {
    notify('error', '复制图片', error instanceof Error ? error.message : '复制图片失败')
  }
}

const handleDeleteImage = () => {
  if (!props.allowDelete) {
    return
  }

  const filePath = currentImagePath.value
  if (!filePath) {
    return
  }

  emit('delete-image', {
    filePath,
    index: currentIndex.value
  })
}

watch(
  () => props.show,
  (visible) => {
    if (!visible) {
      clearImageCache()
      return
    }

    currentIndex.value = clampIndex(props.initialIndex)
    resetZoom()
    void loadMainImage(currentImagePath.value)
    void preloadThumbsAroundCurrent()
    void scrollActiveThumbIntoView()
  },
  { immediate: true }
)

watch(
  () => props.initialIndex,
  (value) => {
    if (!props.show) {
      return
    }

    currentIndex.value = clampIndex(value)
    resetZoom()
    void loadMainImage(currentImagePath.value)
    void preloadThumbsAroundCurrent()
    void scrollActiveThumbIntoView()
  }
)

watch(
  () => props.imagePaths,
  () => {
    currentIndex.value = clampIndex(currentIndex.value)
    clearImageCache()
    void loadMainImage(currentImagePath.value)
    void preloadThumbsAroundCurrent()
    void scrollActiveThumbIntoView()
  },
  { deep: true }
)

watch(currentIndex, () => {
  void loadMainImage(currentImagePath.value)
  void preloadThumbsAroundCurrent()
  void scrollActiveThumbIntoView()
  updateFitScale()
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('mousemove', handleGlobalMouseMove)
  window.addEventListener('mouseup', stopDragging)
  window.addEventListener('resize', updateFitScale)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('mousemove', handleGlobalMouseMove)
  window.removeEventListener('mouseup', stopDragging)
  window.removeEventListener('resize', updateFitScale)
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="picture-viewer"
    :mask-closable="true"
    :show-icon="false"
    :bordered="false"
    :closable="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="picture-viewer__shell">
      <div class="picture-viewer__toolbar" @click.stop>
        <div class="picture-viewer__toolbar-left">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle :disabled="!hasPrevious" @click="goPrevious">
                <template #icon>
                  <n-icon :component="ChevronBackOutline" />
                </template>
              </n-button>
            </template>
            上一张
          </n-tooltip>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle :disabled="!hasNext" @click="goNext">
                <template #icon>
                  <n-icon :component="ChevronForwardOutline" />
                </template>
              </n-button>
            </template>
            下一张
          </n-tooltip>
        </div>
        <div class="picture-viewer__toolbar-right">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle @click="zoomOut">
                <template #icon>
                  <n-icon :component="RemoveOutline" />
                </template>
              </n-button>
            </template>
            缩小
          </n-tooltip>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle @click="resetZoom">
                <template #icon>
                  <n-icon :component="RefreshOutline" />
                </template>
              </n-button>
            </template>
            重置缩放
          </n-tooltip>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle @click="zoomIn">
                <template #icon>
                  <n-icon :component="AddOutline" />
                </template>
              </n-button>
            </template>
            放大
          </n-tooltip>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle @click="handleCopyImage">
                <template #icon>
                  <n-icon :component="CopyOutline" />
                </template>
              </n-button>
            </template>
            复制图片
          </n-tooltip>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle @click="handleOpenWithDefaultApp">
                <template #icon>
                  <n-icon :component="OpenOutline" />
                </template>
              </n-button>
            </template>
            默认程序打开
          </n-tooltip>
          <n-tooltip v-if="props.allowDelete" trigger="hover">
            <template #trigger>
              <n-button quaternary circle @click="handleDeleteImage">
                <template #icon>
                  <n-icon :component="TrashOutline" />
                </template>
              </n-button>
            </template>
            删除截图
          </n-tooltip>
        </div>
      </div>

      <div
        ref="stageRef"
        class="picture-viewer__stage"
        :class="{
          'picture-viewer__stage--cursor-left': stageCursor === 'left',
          'picture-viewer__stage--cursor-right': stageCursor === 'right',
          'picture-viewer__stage--cursor-grab': stageCursor === 'grab',
          'picture-viewer__stage--cursor-grabbing': stageCursor === 'grabbing'
        }"
        @wheel="handleWheel"
        @click="handleStageClick"
        @dblclick="handleStageDoubleClick"
        @mousemove="handleStageMouseMove"
        @mouseleave="handleStageMouseLeave"
        @mousedown="handleStageMouseDown"
      >
        <div ref="imageScrollContainerRef" class="picture-viewer__image-scroll-container">
          <div class="picture-viewer__image-center">
            <img
              ref="imageElementRef"
              v-if="currentImageUrl"
              :src="currentImageUrl"
              :alt="currentImagePath"
              class="picture-viewer__image"
              :style="{ transform: `scale(${effectiveScale})` }"
              draggable="false"
              @load="handleImageLoad"
            />
            <div v-else class="picture-viewer__empty">
              <n-icon :component="EyeOutline" size="26" />
              <span>暂无图片</span>
            </div>
          </div>
        </div>
      </div>

      <div class="picture-viewer__meta" @click.stop>
        <div class="picture-viewer__index">{{ currentIndex + 1 }} / {{ imagePaths.length }}</div>
        <div class="picture-viewer__path">{{ currentImagePath }}</div>
      </div>

      <n-scrollbar x-scrollable class="picture-viewer__thumbs-scrollbar" @wheel="handleThumbWheel">
        <div class="picture-viewer__thumbs" @click.stop>
          <div
            v-for="(imagePath, index) in imagePaths"
            :key="`${imagePath}-${index}`"
            :ref="(element) => setThumbRef(element, index)"
            class="picture-viewer__thumb"
            :class="{ 'picture-viewer__thumb--active': index === currentIndex }"
            @click="currentIndex = index; resetZoom()"
          >
            <img v-if="thumbSrcMap[imagePath]" :src="thumbSrcMap[imagePath]" :alt="imagePath" class="picture-viewer__thumb-image" />
            <div v-else class="picture-viewer__thumb-placeholder">加载中</div>
          </div>
        </div>
      </n-scrollbar>
    </div>
  </n-modal>
</template>

<style scoped>
:global(.n-card.n-modal.picture-viewer) {
  width: 80vw !important;
  max-width: 80vw;
  border-radius: 15px;
}

.picture-viewer :deep(.n-card) {
  background: rgba(18, 18, 18, 0.94);
  backdrop-filter: blur(14px);
}

.picture-viewer :deep(.n-card__content) {
  padding: 0;
  width: 80vw;
}

.picture-viewer__shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: 14px;
  height: min(88vh, 960px);
}

.picture-viewer__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 0;
}

.picture-viewer__toolbar-left,
.picture-viewer__toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.picture-viewer__stage {
  position: relative;
  min-height: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 0;
  cursor: pointer;
}

.picture-viewer__stage--cursor-left {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M17 6L9 14l8 8' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 14 14, w-resize;
}

.picture-viewer__stage--cursor-right {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M11 6l8 8-8 8' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 14 14, e-resize;
}

.picture-viewer__stage--cursor-grab {
  cursor: grab;
}

.picture-viewer__stage--cursor-grabbing {
  cursor: grabbing;
}

.picture-viewer__image-scroll-container {
  position: absolute;
  inset: 0 14px;
  overflow: auto;
  min-height: 0;
  min-width: 0;
}

.picture-viewer__image-scroll-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  min-width: 0;
}

.picture-viewer__image-center {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.picture-viewer__image {
  max-width: none;
  max-height: none;
  object-fit: contain;
  transition: transform 0.12s ease;
  transform-origin: center center;
  user-select: none;
  -webkit-user-drag: none;
}

.picture-viewer__empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  opacity: 0.68;
}

.picture-viewer__meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 14px;
  min-width: 0;
}

.picture-viewer__index {
  font-size: 12px;
  opacity: 0.68;
}

.picture-viewer__path {
  font-size: 12px;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picture-viewer__thumbs-scrollbar {
  width: 100%;
}

.picture-viewer__thumbs {
  display: flex;
  gap: 10px;
  padding: 0 14px 14px;
  width: max-content;
}

.picture-viewer__thumb {
  flex: 0 0 auto;
  width: 96px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.picture-viewer__thumb:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.18);
}

.picture-viewer__thumb--active {
  border-color: rgba(99, 226, 183, 0.92);
  box-shadow: 0 0 0 1px rgba(99, 226, 183, 0.25);
}

.picture-viewer__thumb-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.picture-viewer__thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: 0.56;
}
</style>
