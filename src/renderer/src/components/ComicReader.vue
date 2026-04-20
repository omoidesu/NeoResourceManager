<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BookOutline, CloseOutline, ChevronBackOutline, ChevronForwardOutline, ImagesOutline, ExpandOutline, ContractOutline } from '@vicons/ionicons5'

const props = withDefaults(defineProps<{
  show: boolean
  imagePaths: string[]
  initialIndex?: number
}>(), {
  initialIndex: 0
})

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'page-change', index: number): void
}>()

type ReadingMode = 'continuous' | 'single'
type FitMode = 'width' | 'contain' | 'custom'

const readingMode = ref<ReadingMode>('continuous')
const fitMode = ref<FitMode>('width')
const currentIndex = ref(0)
const pageSrcMap = ref<Record<string, string>>({})
const thumbSrcMap = ref<Record<string, string>>({})
const pageSizeMap = ref<Record<string, { width: number; height: number }>>({})
const viewerRef = ref<HTMLDivElement | null>(null)
const thumbRefs = ref<HTMLElement[]>([])
const pageRefs = ref<HTMLElement[]>([])
const viewerViewport = ref({ width: 0, height: 0 })
const singleZoomPercent = ref(100)
const isSingleDragging = ref(false)
const singlePanOffset = ref({ x: 0, y: 0 })
const singleDragState = ref({
  lastX: 0,
  lastY: 0,
  moved: false
})
let pageObserver: IntersectionObserver | null = null

const clampIndex = (index: number) => {
  if (!props.imagePaths.length) {
    return 0
  }

  if (index < 0) {
    return 0
  }

  if (index >= props.imagePaths.length) {
    return props.imagePaths.length - 1
  }

  return index
}

const currentImagePath = computed(() => props.imagePaths[currentIndex.value] ?? '')
const currentPageLabel = computed(() => `${currentIndex.value + 1} / ${props.imagePaths.length || 1}`)
const singleStageRef = ref<HTMLDivElement | null>(null)
const singleCanDrag = computed(() => readingMode.value === 'single' && singleZoomPercent.value > 100)

const resetSinglePan = () => {
  singlePanOffset.value = { x: 0, y: 0 }
}

const setThumbRef = (element: unknown, index: number) => {
  if (element instanceof HTMLElement) {
    thumbRefs.value[index] = element
  }
}

const setPageRef = (element: unknown, index: number) => {
  if (element instanceof HTMLElement) {
    pageRefs.value[index] = element
  }
}

const closeReader = () => {
  emit('update:show', false)
}

const clearCache = () => {
  pageSrcMap.value = {}
  thumbSrcMap.value = {}
  pageSizeMap.value = {}
}

const syncFitModeWithReadingMode = (mode: ReadingMode) => {
  fitMode.value = mode === 'continuous' ? 'width' : 'contain'
  resetSinglePan()
  if (mode === 'single') {
    singleZoomPercent.value = 100
  }
}

const loadThumb = async (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim()
  if (!normalizedPath || thumbSrcMap.value[normalizedPath]) {
    return
  }

  try {
    const previewUrl = await window.api.dialog.getImagePreviewUrl(normalizedPath, {
      maxWidth: 240,
      maxHeight: 320,
      fit: 'cover',
      quality: 70
    })
    if (!previewUrl) {
      return
    }

    thumbSrcMap.value = {
      ...thumbSrcMap.value,
      [normalizedPath]: previewUrl
    }
  } catch {
    // ignore thumb loading failure
  }
}

const loadPage = async (filePath: string) => {
  const normalizedPath = String(filePath ?? '').trim()
  if (!normalizedPath || pageSrcMap.value[normalizedPath]) {
    return
  }

  try {
    const imageUrl = await window.api.dialog.getImagePreviewUrl(normalizedPath, {
      maxWidth: 4096,
      maxHeight: 4096,
      fit: 'inside',
      quality: 88
    })
    if (!imageUrl) {
      return
    }

    pageSrcMap.value = {
      ...pageSrcMap.value,
      [normalizedPath]: imageUrl
    }
  } catch {
    // ignore page loading failure
  }
}

const updateViewerViewport = async () => {
  await nextTick()
  const viewerElement = viewerRef.value
  if (!viewerElement) {
    viewerViewport.value = { width: 0, height: 0 }
    return
  }

  viewerViewport.value = {
    width: Math.max(0, viewerElement.clientWidth - 36),
    height: Math.max(0, viewerElement.clientHeight - 36)
  }
}

const preloadThumbs = async () => {
  await Promise.all(props.imagePaths.map((imagePath) => loadThumb(imagePath)))
}

const preloadPagesAround = async (centerIndex: number, radius = 2) => {
  const tasks: Promise<void>[] = []
  const start = Math.max(0, centerIndex - radius)
  const end = Math.min(props.imagePaths.length - 1, centerIndex + radius)

  for (let index = start; index <= end; index += 1) {
    const imagePath = props.imagePaths[index]
    if (imagePath) {
      tasks.push(loadPage(imagePath))
    }
  }

  await Promise.all(tasks)
}

const preloadPagesThrough = async (endIndex: number) => {
  const normalizedEndIndex = clampIndex(endIndex)
  const tasks: Promise<void>[] = []

  for (let index = 0; index <= normalizedEndIndex; index += 1) {
    const imagePath = props.imagePaths[index]
    if (imagePath) {
      tasks.push(loadPage(imagePath))
    }
  }

  await Promise.all(tasks)
}

const waitForContinuousImagesLoaded = async (endIndex: number) => {
  await nextTick()

  const targetIndex = clampIndex(endIndex)
  const waits: Array<Promise<void>> = []

  for (let index = 0; index <= targetIndex; index += 1) {
    const pageElement = pageRefs.value[index]
    if (!pageElement) {
      continue
    }

    const imageElement = pageElement.querySelector('img') as HTMLImageElement | null
    if (!imageElement || imageElement.complete) {
      continue
    }

    waits.push(new Promise<void>((resolve) => {
      const cleanup = () => {
        imageElement.removeEventListener('load', cleanup)
        imageElement.removeEventListener('error', cleanup)
        resolve()
      }

      imageElement.addEventListener('load', cleanup, { once: true })
      imageElement.addEventListener('error', cleanup, { once: true })
    }))
  }

  if (waits.length) {
    await Promise.all(waits)
    await nextTick()
  }
}

const scrollThumbIntoView = async () => {
  await nextTick()
  const activeThumb = thumbRefs.value[currentIndex.value]
  activeThumb?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'nearest'
  })
}

const scrollToPage = async (index: number, behavior: ScrollBehavior = 'smooth') => {
  await nextTick()
  const pageElement = pageRefs.value[index]
  const viewerElement = viewerRef.value

  if (!pageElement || !viewerElement) {
    return
  }

  const top = pageElement.offsetTop - 12
  viewerElement.scrollTo({
    top: Math.max(0, top),
    behavior
  })
}

const resetViewerScrollTop = async (behavior: ScrollBehavior = 'auto') => {
  await nextTick()
  viewerRef.value?.scrollTo({
    top: 0,
    behavior
  })
}

const rebuildObserver = async () => {
  pageObserver?.disconnect()
  pageObserver = null

  if (!props.show || readingMode.value !== 'continuous') {
    return
  }

  await nextTick()
  const viewerElement = viewerRef.value
  const validPages = pageRefs.value.filter(Boolean)

  if (!viewerElement || !validPages.length) {
    return
  }

  pageObserver = new IntersectionObserver((entries) => {
    const visibleEntries = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio)

    const topEntry = visibleEntries[0]
    if (!topEntry) {
      return
    }

    const visibleIndex = pageRefs.value.findIndex((element) => element === topEntry.target)
    if (visibleIndex < 0) {
      return
    }

    currentIndex.value = visibleIndex
    void preloadPagesAround(visibleIndex)
  }, {
    root: viewerElement,
    threshold: [0.25, 0.5, 0.75]
  })

  validPages.forEach((element) => pageObserver?.observe(element))
}

const openAtIndex = async (index: number) => {
  currentIndex.value = clampIndex(index)
  if (readingMode.value === 'continuous') {
    await preloadPagesThrough(currentIndex.value)
  } else {
    await preloadPagesAround(currentIndex.value)
  }
  await scrollThumbIntoView()

  if (readingMode.value === 'continuous') {
    await waitForContinuousImagesLoaded(currentIndex.value)
    await scrollToPage(currentIndex.value, 'auto')
    return
  }

  resetSinglePan()
  if (fitMode.value === 'width') {
    await updateViewerViewport()
    singleZoomPercent.value = widthPresetZoomPercent.value
  }
}

const goPrevious = async () => {
  const nextIndex = clampIndex(currentIndex.value - 1)
  currentIndex.value = nextIndex
  await preloadPagesAround(nextIndex)
  await scrollThumbIntoView()

  if (readingMode.value === 'continuous') {
    await scrollToPage(nextIndex)
    return
  }

  resetSinglePan()
  await resetViewerScrollTop()

  if (fitMode.value === 'width') {
    await updateViewerViewport()
    singleZoomPercent.value = widthPresetZoomPercent.value
  }
}

const goNext = async () => {
  const nextIndex = clampIndex(currentIndex.value + 1)
  currentIndex.value = nextIndex
  await preloadPagesAround(nextIndex)
  await scrollThumbIntoView()

  if (readingMode.value === 'continuous') {
    await scrollToPage(nextIndex)
    return
  }

  resetSinglePan()
  await resetViewerScrollTop()

  if (fitMode.value === 'width') {
    await updateViewerViewport()
    singleZoomPercent.value = widthPresetZoomPercent.value
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.show) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeReader()
    return
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    void goPrevious()
    return
  }

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
    event.preventDefault()
    void goNext()
  }
}

const handleSingleStageClick = async (event: MouseEvent) => {
  const stage = singleStageRef.value
  if (!stage) {
    return
  }

  if (singleDragState.value.moved) {
    singleDragState.value.moved = false
    return
  }

  const { left, width } = stage.getBoundingClientRect()
  const clickRatio = width > 0 ? (event.clientX - left) / width : 0.5

  if (clickRatio <= 0.35) {
    await goPrevious()
    return
  }

  if (clickRatio >= 0.65) {
    await goNext()
  }
}

const handleSingleStageDoubleClick = async (event: MouseEvent) => {
  const stage = singleStageRef.value
  if (!stage) {
    return
  }

  const { left, width } = stage.getBoundingClientRect()
  const clickRatio = width > 0 ? (event.clientX - left) / width : 0.5

  if (clickRatio > 0.35 && clickRatio < 0.65) {
    singleZoomPercent.value = singleZoomPercent.value === 100 ? 200 : 100
    fitMode.value = singleZoomPercent.value === 100 ? 'contain' : 'custom'
    resetSinglePan()
    await resetViewerScrollTop('auto')
  }
}

const handleSingleViewerWheel = async (event: WheelEvent) => {
  if (readingMode.value !== 'single') {
    return
  }

  event.preventDefault()
  const delta = event.deltaY < 0 ? 10 : -10
  const nextZoomPercent = Math.max(100, Math.floor(singleZoomPercent.value + delta))
  singleZoomPercent.value = nextZoomPercent
  fitMode.value = nextZoomPercent === 100 ? 'contain' : 'custom'
}

const handleSingleStageMouseDown = (event: MouseEvent) => {
  if (!singleCanDrag.value || event.button !== 0) {
    return
  }

  isSingleDragging.value = true
  singleDragState.value = {
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false
  }
  event.preventDefault()
}

const handleGlobalMouseMove = (event: MouseEvent) => {
  if (!isSingleDragging.value) {
    return
  }

  const deltaX = event.clientX - singleDragState.value.lastX
  const deltaY = event.clientY - singleDragState.value.lastY
  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
    singleDragState.value.moved = true
  }

  singlePanOffset.value = {
    x: singlePanOffset.value.x + deltaX,
    y: singlePanOffset.value.y + deltaY
  }
  singleDragState.value = {
    ...singleDragState.value,
    lastX: event.clientX,
    lastY: event.clientY
  }
}

const stopSingleDragging = () => {
  if (!isSingleDragging.value) {
    return
  }

  isSingleDragging.value = false
}

const handleSingleImageLoad = async (event: Event) => {
  const imageElement = event.target as HTMLImageElement | null
  const imagePath = currentImagePath.value

  if (imageElement && imagePath) {
    pageSizeMap.value = {
      ...pageSizeMap.value,
      [imagePath]: {
        width: Number(imageElement.naturalWidth ?? 0),
        height: Number(imageElement.naturalHeight ?? 0)
      }
    }
  }

  if (fitMode.value === 'width') {
    await updateViewerViewport()
    singleZoomPercent.value = widthPresetZoomPercent.value
  }
}

const currentSinglePageSize = computed(() => pageSizeMap.value[currentImagePath.value] ?? { width: 0, height: 0 })
const containScale = computed(() => {
  const width = Number(currentSinglePageSize.value.width ?? 0)
  const height = Number(currentSinglePageSize.value.height ?? 0)
  const viewportWidth = Number(viewerViewport.value.width ?? 0)
  const viewportHeight = Number(viewerViewport.value.height ?? 0)

  if (!width || !height || !viewportWidth || !viewportHeight) {
    return 1
  }

  return Math.max(0.01, Math.min(viewportWidth / width, viewportHeight / height))
})

const widthPresetZoomPercent = computed(() => {
  const width = Number(currentSinglePageSize.value.width ?? 0)
  const viewportWidth = Number(viewerViewport.value.width ?? 0)
  const baseContainScale = Number(containScale.value ?? 1)

  if (!width || !viewportWidth || !baseContainScale) {
    return 100
  }

  const widthScale = viewportWidth / width
  return Math.max(100, Math.round((widthScale / baseContainScale) * 100))
})

const singleRenderedSize = computed(() => {
  const width = Number(currentSinglePageSize.value.width ?? 0)
  const height = Number(currentSinglePageSize.value.height ?? 0)
  const baseScale = Number(containScale.value ?? 1)
  const zoomScale = Math.max(1, Number(singleZoomPercent.value ?? 100) / 100)

  if (!width || !height || !baseScale) {
    return { width: 0, height: 0 }
  }

  return {
    width: Math.max(1, Math.round(width * baseScale * zoomScale)),
    height: Math.max(1, Math.round(height * baseScale * zoomScale))
  }
})

const singlePanBounds = computed(() => {
  const renderedWidth = Number(singleRenderedSize.value.width ?? 0)
  const renderedHeight = Number(singleRenderedSize.value.height ?? 0)
  const viewportWidth = Number(viewerViewport.value.width ?? 0)
  const viewportHeight = Number(viewerViewport.value.height ?? 0)

  return {
    minX: renderedWidth > viewportWidth ? viewportWidth - renderedWidth : 0,
    maxX: 0,
    minY: renderedHeight > viewportHeight ? viewportHeight - renderedHeight : 0,
    maxY: 0
  }
})

const singleStageStyle = computed(() => ({
  width: `${Math.max(1, viewerViewport.value.width || 1)}px`,
  minWidth: `${Math.max(1, viewerViewport.value.width || 1)}px`,
  height: `${Math.max(1, viewerViewport.value.height || 1)}px`,
  minHeight: `${Math.max(1, viewerViewport.value.height || 1)}px`
}))

const singleImageStyle = computed(() => {
  const renderedWidth = Number(singleRenderedSize.value.width ?? 0)
  const renderedHeight = Number(singleRenderedSize.value.height ?? 0)
  const viewportWidth = Number(viewerViewport.value.width ?? 0)
  const viewportHeight = Number(viewerViewport.value.height ?? 0)

  if (!renderedWidth || !renderedHeight) {
    return {}
  }

  const bounds = singlePanBounds.value
  const translateX = Math.min(bounds.maxX, Math.max(bounds.minX, singlePanOffset.value.x))
  const translateY = Math.min(bounds.maxY, Math.max(bounds.minY, singlePanOffset.value.y))
  const baseLeft = Math.max(0, Math.floor((viewportWidth - renderedWidth) / 2))
  const baseTop = Math.max(0, Math.floor((viewportHeight - renderedHeight) / 2))

  return {
    width: `${renderedWidth}px`,
    height: `${renderedHeight}px`,
    maxWidth: 'none',
    maxHeight: 'none',
    left: `${baseLeft}px`,
    top: `${baseTop}px`,
    transform: `translate(${translateX}px, ${translateY}px)`
  }
})

watch(
  () => props.show,
  async (visible) => {
    if (!visible) {
      pageObserver?.disconnect()
      pageObserver = null
      clearCache()
      return
    }

    syncFitModeWithReadingMode(readingMode.value)
    await updateViewerViewport()
    currentIndex.value = clampIndex(props.initialIndex)
    await preloadThumbs()
    await preloadPagesAround(currentIndex.value, 3)
    await rebuildObserver()
    await openAtIndex(currentIndex.value)
  },
  { immediate: true }
)

watch(
  () => props.imagePaths,
  async () => {
    pageRefs.value = []
    thumbRefs.value = []
    clearCache()

    if (!props.show) {
      return
    }

    currentIndex.value = clampIndex(currentIndex.value)
    await updateViewerViewport()
    await preloadThumbs()
    await preloadPagesAround(currentIndex.value, 3)
    await rebuildObserver()
    await openAtIndex(currentIndex.value)
  },
  { deep: true }
)

watch(
  () => props.initialIndex,
  async (value) => {
    if (!props.show) {
      return
    }

    await openAtIndex(value)
  }
)

watch(readingMode, async (mode) => {
  if (!props.show) {
    return
  }

  syncFitModeWithReadingMode(mode)
  await updateViewerViewport()
  await rebuildObserver()
  if (mode === 'continuous') {
    await scrollToPage(currentIndex.value, 'auto')
    return
  }

  await resetViewerScrollTop('auto')
})

watch(currentIndex, async (value) => {
  emit('page-change', value)
  await preloadPagesAround(value)
  await scrollThumbIntoView()
})

watch(currentImagePath, async () => {
  await updateViewerViewport()
  resetSinglePan()

  if (readingMode.value === 'single' && fitMode.value === 'width') {
    singleZoomPercent.value = widthPresetZoomPercent.value
  }
})

watch([singleZoomPercent, singlePanBounds], () => {
  const bounds = singlePanBounds.value
  singlePanOffset.value = {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, singlePanOffset.value.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, singlePanOffset.value.y))
  }
})

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  pageObserver?.disconnect()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateViewerViewport)
  window.removeEventListener('mousemove', handleGlobalMouseMove)
  window.removeEventListener('mouseup', stopSingleDragging)
})

onMounted(() => {
  window.addEventListener('resize', updateViewerViewport)
  window.addEventListener('mousemove', handleGlobalMouseMove)
  window.addEventListener('mouseup', stopSingleDragging)
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="comic-reader"
    :mask-closable="true"
    :show-icon="false"
    :bordered="false"
    :closable="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="comic-reader__shell">
      <div class="comic-reader__toolbar">
        <div class="comic-reader__toolbar-main">
          <div class="comic-reader__title">
            <n-icon :component="BookOutline" />
            <span>漫画阅读</span>
          </div>
          <div class="comic-reader__status">{{ currentPageLabel }}</div>
        </div>

        <div class="comic-reader__actions">
          <n-button
            quaternary
            :type="readingMode === 'continuous' ? 'primary' : 'default'"
            @click="readingMode = 'continuous'"
          >
            <template #icon>
              <n-icon :component="ImagesOutline" />
            </template>
            连续阅读
          </n-button>
          <n-button
            quaternary
            :type="readingMode === 'single' ? 'primary' : 'default'"
            @click="readingMode = 'single'"
          >
            单页阅读
          </n-button>
          <n-button
            quaternary
            :type="fitMode === 'width' ? 'primary' : 'default'"
            @click="() => { fitMode = 'width'; if (readingMode === 'single') singleZoomPercent = widthPresetZoomPercent }"
          >
            <template #icon>
              <n-icon :component="ExpandOutline" />
            </template>
            适应宽度
          </n-button>
          <n-button
            quaternary
            :type="fitMode === 'contain' ? 'primary' : 'default'"
            @click="() => { fitMode = 'contain'; singleZoomPercent = 100 }"
          >
            <template #icon>
              <n-icon :component="ContractOutline" />
            </template>
            完整显示
          </n-button>
          <div v-if="readingMode === 'single'" class="comic-reader__zoom">{{ singleZoomPercent }}%</div>
          <n-button quaternary circle @click="goPrevious">
            <template #icon>
              <n-icon :component="ChevronBackOutline" />
            </template>
          </n-button>
          <n-button quaternary circle @click="goNext">
            <template #icon>
              <n-icon :component="ChevronForwardOutline" />
            </template>
          </n-button>
          <n-button quaternary circle @click="closeReader">
            <template #icon>
              <n-icon :component="CloseOutline" />
            </template>
          </n-button>
        </div>
      </div>

      <div class="comic-reader__body">
        <n-scrollbar class="comic-reader__sidebar">
          <div class="comic-reader__thumbs">
            <button
              v-for="(imagePath, index) in imagePaths"
              :key="`${imagePath}-${index}`"
              :ref="(element) => setThumbRef(element, index)"
              type="button"
              class="comic-reader__thumb"
              :class="{ 'comic-reader__thumb--active': index === currentIndex }"
              @click="openAtIndex(index)"
            >
              <img
                v-if="thumbSrcMap[imagePath]"
                :src="thumbSrcMap[imagePath]"
                :alt="`${index + 1}`"
                class="comic-reader__thumb-image"
              />
              <div v-else class="comic-reader__thumb-placeholder">
                <div class="comic-reader__skeleton comic-reader__skeleton--thumb" />
              </div>
              <div class="comic-reader__thumb-index">{{ index + 1 }}</div>
            </button>
          </div>
        </n-scrollbar>

        <div ref="viewerRef" class="comic-reader__viewer">
          <div v-if="readingMode === 'continuous'" class="comic-reader__flow">
            <section
              v-for="(imagePath, index) in imagePaths"
              :key="`${imagePath}-${index}`"
              :ref="(element) => setPageRef(element, index)"
              class="comic-reader__page"
              :class="{ 'comic-reader__page--active': index === currentIndex }"
            >
              <img
                v-if="pageSrcMap[imagePath]"
                :src="pageSrcMap[imagePath]"
                :alt="`${index + 1}`"
                class="comic-reader__page-image"
                :class="{
                  'comic-reader__page-image--fit-width': fitMode === 'width',
                  'comic-reader__page-image--fit-contain': fitMode === 'contain'
                }"
              />
              <div v-else class="comic-reader__page-placeholder">
                <div class="comic-reader__skeleton comic-reader__skeleton--page" />
              </div>
            </section>
          </div>

          <div
            v-else
            ref="singleStageRef"
            class="comic-reader__single"
            :class="{ 'comic-reader__single--draggable': singleCanDrag, 'comic-reader__single--dragging': isSingleDragging }"
            :style="singleStageStyle"
            @click="handleSingleStageClick"
            @dblclick="handleSingleStageDoubleClick"
            @mousedown="handleSingleStageMouseDown"
            @wheel="handleSingleViewerWheel"
          >
            <img
              v-if="currentImagePath && pageSrcMap[currentImagePath]"
              :src="pageSrcMap[currentImagePath]"
              :alt="currentPageLabel"
              class="comic-reader__page-image"
              :style="singleImageStyle"
              @load="handleSingleImageLoad"
            />
            <div v-else class="comic-reader__page-placeholder">
              <div class="comic-reader__skeleton comic-reader__skeleton--page" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
:global(.n-card.n-modal.comic-reader) {
  width: 94vw !important;
  max-width: 1440px;
  border-radius: 22px;
}

.comic-reader :deep(.n-card) {
  background:
    radial-gradient(circle at top left, rgba(62, 98, 83, 0.22), transparent 28%),
    linear-gradient(180deg, rgba(22, 24, 26, 0.98), rgba(14, 15, 17, 0.98));
  backdrop-filter: blur(16px);
}

.comic-reader :deep(.n-card__content) {
  padding: 0;
}

.comic-reader__shell {
  height: min(92vh, 1100px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.comic-reader__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.comic-reader__toolbar-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.comic-reader__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
}

.comic-reader__status {
  font-size: 12px;
  opacity: 0.72;
}

.comic-reader__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.comic-reader__zoom {
  min-width: 56px;
  text-align: center;
  font-size: 12px;
  opacity: 0.78;
}

.comic-reader__body {
  min-height: 0;
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
}

.comic-reader__sidebar {
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.comic-reader__thumbs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.comic-reader__thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  overflow: hidden;
  padding: 0;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.comic-reader__thumb:hover {
  transform: translateY(-1px);
  border-color: rgba(145, 232, 193, 0.45);
}

.comic-reader__thumb--active {
  border-color: rgba(145, 232, 193, 0.88);
  box-shadow: 0 0 0 1px rgba(145, 232, 193, 0.18);
}

.comic-reader__thumb-image,
.comic-reader__thumb-placeholder {
  width: 100%;
  height: 100%;
  display: block;
}

.comic-reader__thumb-image {
  object-fit: cover;
}

.comic-reader__thumb-placeholder {
  padding: 8px;
  box-sizing: border-box;
}

.comic-reader__thumb-index {
  position: absolute;
  right: 8px;
  bottom: 8px;
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.68);
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
}

.comic-reader__viewer {
  min-height: 0;
  overflow: auto;
  padding: 18px;
  scroll-behavior: smooth;
}

.comic-reader__flow {
  width: min(100%, 1040px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.comic-reader__single {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
}

.comic-reader__single--draggable {
  cursor: grab;
}

.comic-reader__single--dragging {
  cursor: grabbing;
}

.comic-reader__page {
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.comic-reader__page--active {
  border-color: rgba(145, 232, 193, 0.22);
}

.comic-reader__page-image {
  display: block;
  margin: 0 auto;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  flex: 0 0 auto;
}

.comic-reader__single > .comic-reader__page-image {
  position: absolute;
  margin: 0;
  transform-origin: top left;
}

.comic-reader__page-image--fit-width {
  width: 100%;
  height: auto;
}

.comic-reader__page-image--fit-contain {
  max-width: 100%;
  max-height: calc(92vh - 180px);
  width: auto;
  height: auto;
}

.comic-reader__page-placeholder {
  min-height: 320px;
  padding: 14px;
  box-sizing: border-box;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.comic-reader__skeleton {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background:
    linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.05) 0%,
      rgba(255, 255, 255, 0.12) 42%,
      rgba(255, 255, 255, 0.05) 100%
    );
  background-size: 220% 100%;
  animation: comic-reader-skeleton 1.35s ease-in-out infinite;
}

.comic-reader__skeleton--thumb {
  border-radius: 10px;
}

.comic-reader__skeleton--page {
  min-height: 320px;
}

@keyframes comic-reader-skeleton {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -20% 0;
  }
}

@media (max-width: 900px) {
  .comic-reader__body {
    grid-template-columns: 1fr;
    grid-template-rows: 116px minmax(0, 1fr);
  }

  .comic-reader__sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .comic-reader__thumbs {
    flex-direction: row;
    padding: 12px 14px;
  }

  .comic-reader__thumb {
    width: 72px;
    flex: 0 0 auto;
  }

  .comic-reader__toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .comic-reader__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
