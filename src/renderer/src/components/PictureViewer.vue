<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CopyOutline,
  EyeOutline,
  AddOutline,
  RemoveOutline,
  OpenOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  RefreshOutline,
  TrashOutline
} from '@vicons/ionicons5'
import { notify } from '../utils/notification'
import { useReaderImagePreviewCache } from './reader/useReaderImagePreviewCache'

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
  (event: 'index-change', index: number): void
}>()

const AntDesignRotateRightOutlined = defineComponent({
  name: 'AntDesignRotateRightOutlined',
  setup: () => () => h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 1024 1024'
    },
    [
      h('path', {
        fill: 'currentColor',
        d: 'M480.5 251.2c13-1.6 25.9-2.4 38.8-2.5v63.9c0 6.5 7.5 10.1 12.6 6.1L660 217.6c4-3.2 4-9.2 0-12.3l-128-101c-5.1-4-12.6-.4-12.6 6.1l-.2 64c-118.6.5-235.8 53.4-314.6 154.2c-69.6 89.2-95.7 198.6-81.1 302.4h74.9c-.9-5.3-1.7-10.7-2.4-16.1c-5.1-42.1-2.1-84.1 8.9-124.8c11.4-42.2 31-81.1 58.1-115.8c27.2-34.7 60.3-63.2 98.4-84.3c37-20.6 76.9-33.6 119.1-38.8'
      }),
      h('path', {
        fill: 'currentColor',
        d: 'M880 418H352c-17.7 0-32 14.3-32 32v414c0 17.7 14.3 32 32 32h528c17.7 0 32-14.3 32-32V450c0-17.7-14.3-32-32-32m-44 402H396V494h440z'
      })
    ]
  )
})

const currentIndex = ref(0)
const scale = ref(1)
const rotationDeg = ref(0)
const thumbPreviewCache = useReaderImagePreviewCache({
  maxWidth: 240,
  maxHeight: 160,
  fit: 'cover',
  quality: 72,
  fallbackToFileUrl: true
})
const mainImagePreviewCache = useReaderImagePreviewCache({
  maxWidth: 4096,
  maxHeight: 4096,
  fit: 'inside',
  quality: 90,
  fallbackToFileUrl: true
})
const thumbSrcMap = thumbPreviewCache.srcMap
const fullImageUrlMap = mainImagePreviewCache.srcMap
const stageRef = ref<HTMLDivElement | null>(null)
const mainImageRef = ref<HTMLImageElement | null>(null)
const thumbRefs = ref<HTMLElement[]>([])
const stageCursor = ref<'default' | 'left' | 'right'>('default')
const isStageDragging = ref(false)
const imagePanOffset = ref({ x: 0, y: 0 })
const imageDragState = ref({
  lastX: 0,
  lastY: 0,
  moved: false
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
const hasPrevious = computed(() => props.imagePaths.length > 1)
const hasNext = computed(() => props.imagePaths.length > 1)
const isImageDraggable = computed(() => scale.value > 1 && Boolean(currentImageUrl.value))

const loadThumbPreviewImage = async (filePath: string) => {
  await thumbPreviewCache.load(filePath)
}

const loadMainImage = async (filePath: string) => {
  await mainImagePreviewCache.load(filePath)
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
  thumbPreviewCache.clear()
  mainImagePreviewCache.clear()
}

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

const resetImagePan = () => {
  imagePanOffset.value = { x: 0, y: 0 }
  isStageDragging.value = false
  imageDragState.value = {
    lastX: 0,
    lastY: 0,
    moved: false
  }
}

const resetTransform = () => {
  scale.value = 1
  rotationDeg.value = 0
  resetImagePan()
}

const resetZoom = () => {
  scale.value = 1
  resetImagePan()
}

const rotateClockwise = () => {
  rotationDeg.value = (rotationDeg.value + 90) % 360
  resetImagePan()
}

const zoomIn = () => {
  scale.value = Math.min(4, Number((scale.value + 0.2).toFixed(2)))
}

const zoomOut = () => {
  const nextScale = Math.max(0.4, Number((scale.value - 0.2).toFixed(2)))
  scale.value = nextScale
  if (nextScale <= 1) {
    resetImagePan()
  }
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
  resetTransform()
}

const goNext = () => {
  if (!props.imagePaths.length) {
    return
  }

  currentIndex.value = clampIndex(currentIndex.value + 1)
  resetTransform()
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
  if (imageDragState.value.moved) {
    imageDragState.value.moved = false
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
  if (isImageDraggable.value || isStageDragging.value) {
    stageCursor.value = 'default'
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
  if (isStageDragging.value) {
    return
  }

  stageCursor.value = 'default'
}

const imagePanBounds = computed(() => {
  const stageElement = stageRef.value
  const imageElement = mainImageRef.value
  if (!stageElement || !imageElement || scale.value <= 1) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0
    }
  }

  const isQuarterTurn = Math.abs(rotationDeg.value % 180) === 90
  const renderedWidth = (isQuarterTurn ? imageElement.clientHeight : imageElement.clientWidth) * scale.value
  const renderedHeight = (isQuarterTurn ? imageElement.clientWidth : imageElement.clientHeight) * scale.value
  const overflowX = Math.max(0, renderedWidth - stageElement.clientWidth)
  const overflowY = Math.max(0, renderedHeight - stageElement.clientHeight)

  return {
    minX: -overflowX / 2,
    maxX: overflowX / 2,
    minY: -overflowY / 2,
    maxY: overflowY / 2
  }
})

const clampImagePanOffset = () => {
  const bounds = imagePanBounds.value
  imagePanOffset.value = {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, imagePanOffset.value.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, imagePanOffset.value.y))
  }
}

const handleStageMouseDown = (event: MouseEvent) => {
  if (!isImageDraggable.value || event.button !== 0) {
    return
  }

  isStageDragging.value = true
  stageCursor.value = 'default'
  imageDragState.value = {
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false
  }
  event.preventDefault()
}

const handleGlobalMouseMove = (event: MouseEvent) => {
  if (!isStageDragging.value) {
    return
  }

  const deltaX = event.clientX - imageDragState.value.lastX
  const deltaY = event.clientY - imageDragState.value.lastY
  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
    imageDragState.value.moved = true
  }

  const bounds = imagePanBounds.value
  imagePanOffset.value = {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, imagePanOffset.value.x + deltaX)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, imagePanOffset.value.y + deltaY))
  }
  imageDragState.value = {
    ...imageDragState.value,
    lastX: event.clientX,
    lastY: event.clientY
  }
}

const stopStageDragging = () => {
  if (!isStageDragging.value) {
    return
  }

  isStageDragging.value = false
}

const mainImageStyle = computed(() => ({
  transform: `translate(${imagePanOffset.value.x}px, ${imagePanOffset.value.y}px) rotate(${rotationDeg.value}deg) scale(${scale.value})`
}))

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
      resetTransform()
      clearImageCache()
      return
    }

    currentIndex.value = clampIndex(props.initialIndex)
    resetTransform()
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
    resetTransform()
    void loadMainImage(currentImagePath.value)
    void preloadThumbsAroundCurrent()
    void scrollActiveThumbIntoView()
  }
)

watch(
  () => props.imagePaths,
  () => {
    currentIndex.value = clampIndex(currentIndex.value)
    resetTransform()
    clearImageCache()
    void loadMainImage(currentImagePath.value)
    void preloadThumbsAroundCurrent()
    void scrollActiveThumbIntoView()
  },
  { deep: true }
)

watch(currentIndex, () => {
  emit('index-change', currentIndex.value)
  void loadMainImage(currentImagePath.value)
  void preloadThumbsAroundCurrent()
  void scrollActiveThumbIntoView()
})

watch([scale, currentImageUrl, imagePanBounds], () => {
  if (scale.value <= 1) {
    resetImagePan()
    return
  }

  clampImagePanOffset()
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('mousemove', handleGlobalMouseMove)
  window.addEventListener('mouseup', stopStageDragging)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('mousemove', handleGlobalMouseMove)
  window.removeEventListener('mouseup', stopStageDragging)
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
              <n-button quaternary circle @click="rotateClockwise">
                <template #icon>
                  <n-icon :component="AntDesignRotateRightOutlined" />
                </template>
              </n-button>
            </template>
            顺时针旋转90度
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
          'picture-viewer__stage--draggable': isImageDraggable,
          'picture-viewer__stage--dragging': isStageDragging
        }"
        @wheel="handleWheel"
        @click="handleStageClick"
        @dblclick="handleStageDoubleClick"
        @mousedown="handleStageMouseDown"
        @mousemove="handleStageMouseMove"
        @mouseleave="handleStageMouseLeave"
      >
        <div class="picture-viewer__image-scroll-container">
          <div class="picture-viewer__image-center">
            <img
              v-if="currentImageUrl"
              ref="mainImageRef"
              :src="currentImageUrl"
              :alt="currentImagePath"
              class="picture-viewer__image"
              :style="mainImageStyle"
              draggable="false"
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
            @click="currentIndex = index; resetTransform()"
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
  width: 94vw !important;
  max-width: 1440px;
  border-radius: 15px;
}

.picture-viewer :deep(.n-card) {
  background: rgba(18, 18, 18, 0.94);
  backdrop-filter: blur(14px);
}

.picture-viewer :deep(.n-card__content) {
  padding: 0;
  width: 100%;
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

.picture-viewer__stage--draggable {
  cursor: grab;
}

.picture-viewer__stage--dragging {
  cursor: grabbing;
}

.picture-viewer__image-scroll-container {
  position: absolute;
  inset: 0 14px;
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
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  transition: transform 0.12s ease;
  transform-origin: center center;
  user-select: none;
  -webkit-user-drag: none;
}

.picture-viewer__stage--dragging .picture-viewer__image {
  transition: none;
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
