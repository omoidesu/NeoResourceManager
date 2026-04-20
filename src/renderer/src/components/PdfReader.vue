<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import {
  BookOutline,
  CloseOutline,
  OpenOutline,
  RemoveOutline,
  AddOutline,
  ExpandOutline
} from '@vicons/ionicons5'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const props = withDefaults(
  defineProps<{
    show: boolean
    filePath: string
    title?: string
    initialProgress?: number
  }>(),
  {
    title: '',
    initialProgress: 0
  }
)

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'progress-change', progress: number): void
}>()

type ReaderState = 'idle' | 'loading' | 'ready' | 'error'
type FitMode = 'custom' | 'width'
type ReaderScrollBehavior = 'auto' | 'smooth'
type PageEntry = {
  pageNumber: number
  wrapper: HTMLDivElement
  baseWidth: number
  baseHeight: number
  canvas: HTMLCanvasElement | null
  renderTask: RenderTask | null
  renderedZoom: number
  renderingZoom: number
}

const state = ref<ReaderState>('idle')
const errorMessage = ref('')
const viewportRef = ref<HTMLDivElement | null>(null)
const pagesRef = ref<HTMLDivElement | null>(null)
const thumbRefs = ref<HTMLElement[]>([])
const progress = ref(0)
const zoom = ref(1.2)
const fitMode = ref<FitMode>('width')
const isSeeking = ref(false)
const currentPageNumber = ref(1)
const pageCount = ref(0)
let pdfDocument: PDFDocumentProxy | null = null
let pageEntries: PageEntry[] = []
let loadRequestId = 0
let progressTimer: number | null = null
let renderFrame: number | null = null
let renderQueueRunning = false
let renderQueuePending = false
let thumbObserver: IntersectionObserver | null = null
const renderedThumbs = new Set<number>()
const renderingThumbs = new Set<number>()

const appIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))
const normalizedFilePath = computed(() => String(props.filePath ?? '').trim())
const fileName = computed(() => normalizedFilePath.value.replace(/\\/g, '/').split('/').pop() ?? '')
const displayTitle = computed(() => props.title || fileName.value || 'PDF 阅读')
const progressText = computed(
  () => `${Math.round(Math.max(0, Math.min(1, progress.value)) * 100)}%`
)
const pageCountText = computed(() => (pageCount.value > 0 ? `${pageCount.value} 页` : ''))
const zoomText = computed(() => `${Math.round(zoom.value * 100)}%`)
const readerThemeStyle = computed(() => {
  if (appIsDark.value) {
    return {
      '--reader-shell-bg': 'rgb(24, 25, 28)',
      '--reader-body-bg': '#202124',
      '--reader-text-color': '#d8dde5',
      '--reader-muted-color': 'rgba(216, 221, 229, 0.5)',
      '--reader-border-color': 'rgba(255, 255, 255, 0.08)',
      '--reader-border-subtle-color': 'rgba(255, 255, 255, 0.06)',
      '--reader-surface-color': 'rgba(255, 255, 255, 0.03)',
      '--reader-page-placeholder-bg': 'rgba(255, 255, 255, 0.06)',
      '--reader-shadow-color': 'rgba(0, 0, 0, 0.18)'
    }
  }

  return {
    '--reader-shell-bg': '#f5f5f5',
    '--reader-body-bg': '#eceff3',
    '--reader-text-color': '#262626',
    '--reader-muted-color': 'rgba(38, 38, 38, 0.54)',
    '--reader-border-color': 'rgba(24, 24, 28, 0.12)',
    '--reader-border-subtle-color': 'rgba(24, 24, 28, 0.1)',
    '--reader-surface-color': 'rgba(255, 255, 255, 0.72)',
    '--reader-page-placeholder-bg': 'rgba(255, 255, 255, 0.92)',
    '--reader-shadow-color': 'rgba(24, 24, 28, 0.14)'
  }
})

const setThumbRef = (element: unknown, pageNumber: number): void => {
  if (element instanceof HTMLElement) {
    thumbRefs.value[pageNumber - 1] = element
  }
}

const clearProgressTimer = (): void => {
  if (progressTimer) {
    window.clearTimeout(progressTimer)
    progressTimer = null
  }
}

const cancelRenderFrame = (): void => {
  if (renderFrame !== null) {
    window.cancelAnimationFrame(renderFrame)
    renderFrame = null
  }
}

const cancelPageRenders = (): void => {
  pageEntries.forEach((entry) => {
    if (entry.renderTask) {
      entry.renderTask.cancel()
      entry.renderTask = null
      entry.renderingZoom = 0
    }
  })
}

const clearPageEntries = (): void => {
  cancelRenderFrame()
  cancelPageRenders()
  pageEntries = []
  thumbRefs.value = []
  renderedThumbs.clear()
  renderingThumbs.clear()
  thumbObserver?.disconnect()
  thumbObserver = null
  renderQueueRunning = false
  renderQueuePending = false
}

const clearPdfDocument = (): void => {
  clearPageEntries()
  if (pdfDocument) {
    void pdfDocument.destroy()
    pdfDocument = null
  }
}

const calculateProgress = (): number => {
  const viewport = viewportRef.value
  if (!viewport) {
    return 0
  }

  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
  if (!maxScrollTop) {
    return 0
  }

  return Math.max(0, Math.min(1, viewport.scrollTop / maxScrollTop))
}

const emitProgress = (): void => {
  const nextProgress = calculateProgress()
  progress.value = nextProgress
  emit('progress-change', nextProgress)
}

const syncCurrentPageNumber = (): void => {
  const viewport = viewportRef.value
  if (!viewport || !pageEntries.length) {
    currentPageNumber.value = 1
    return
  }

  const viewportRect = viewport.getBoundingClientRect()
  const midpoint =
    viewportRect.top + Math.min(viewport.clientHeight * 0.35, viewport.clientHeight / 2)
  let closestPageNumber = currentPageNumber.value
  let closestDistance = Number.POSITIVE_INFINITY

  pageEntries.forEach((entry) => {
    const rect = entry.wrapper.getBoundingClientRect()
    const distance = Math.abs(rect.top - midpoint)
    if (distance < closestDistance) {
      closestDistance = distance
      closestPageNumber = entry.pageNumber
    }
  })

  currentPageNumber.value = closestPageNumber
}

const scheduleProgressSave = (): void => {
  scheduleVisiblePageRender()
  syncCurrentPageNumber()

  if (isSeeking.value) {
    return
  }

  progress.value = calculateProgress()
  clearProgressTimer()
  progressTimer = window.setTimeout(() => {
    emitProgress()
  }, 400)
}

const scrollToProgress = async (nextProgress: number): Promise<void> => {
  await nextTick()
  const viewport = viewportRef.value
  if (!viewport) {
    return
  }

  const normalizedProgress = Math.max(0, Math.min(1, Number(nextProgress ?? 0)))
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
  viewport.scrollTop = Math.round(maxScrollTop * normalizedProgress)
  progress.value = calculateProgress()
  syncCurrentPageNumber()
  scheduleVisiblePageRender()
}

const restoreProgress = async (): Promise<void> => {
  await scrollToProgress(Math.max(0, Math.min(1, Number(props.initialProgress ?? 0))))
}

const handleProgressUpdate = (nextProgress: number): void => {
  isSeeking.value = true
  progress.value = Math.max(0, Math.min(1, Number(nextProgress ?? 0)))
  void scrollToProgress(progress.value)
}

const handleProgressCommit = (nextProgress: number): void => {
  isSeeking.value = false
  progress.value = Math.max(0, Math.min(1, Number(nextProgress ?? 0)))
  void scrollToProgress(progress.value).then(() => {
    emitProgress()
  })
}

const waitForPaint = (): Promise<void> => {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

const getFitWidthZoom = (): number => {
  const viewport = viewportRef.value
  if (!viewport || !pageEntries.length) {
    return zoom.value
  }

  const widestPage = Math.max(...pageEntries.map((entry) => entry.baseWidth), 1)
  const fallbackWidth = viewport.closest('.pdf-reader__reading-area')?.clientWidth ?? 0
  const viewportWidth = Math.max(viewport.clientWidth, fallbackWidth - 136)
  const availableWidth = Math.max(240, viewportWidth - 48)
  return Math.max(0.5, Math.min(3, Number((availableWidth / widestPage).toFixed(2))))
}

const createPageShells = async (requestId: number, pdf: PDFDocumentProxy): Promise<void> => {
  const host = pagesRef.value
  if (!host) {
    throw new Error('PDF 阅读器尚未准备好')
  }

  clearPageEntries()
  host.innerHTML = ''
  pageCount.value = pdf.numPages

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (requestId !== loadRequestId) {
      return
    }

    const page = await pdf.getPage(pageNumber)
    const baseViewport = page.getViewport({ scale: 1 })
    const wrapper = document.createElement('div')

    wrapper.className = 'pdf-reader__page-shell'
    wrapper.style.width = `${Math.floor(baseViewport.width * zoom.value)}px`
    wrapper.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`
    wrapper.dataset.pageNumber = String(pageNumber)
    wrapper.textContent = `第 ${pageNumber} 页`

    pageEntries.push({
      pageNumber,
      wrapper,
      baseWidth: baseViewport.width,
      baseHeight: baseViewport.height,
      canvas: null,
      renderTask: null,
      renderedZoom: 0,
      renderingZoom: 0
    })
    host.append(wrapper)

    if (pageNumber % 12 === 0) {
      await waitForPaint()
    }
  }
}

const renderThumb = async (requestId: number, pageNumber: number): Promise<void> => {
  const pdf = pdfDocument
  const thumbElement = thumbRefs.value[pageNumber - 1]
  if (!pdf || !thumbElement || renderedThumbs.has(pageNumber) || renderingThumbs.has(pageNumber)) {
    return
  }

  renderingThumbs.add(pageNumber)

  try {
    const page = await pdf.getPage(pageNumber)
    if (requestId !== loadRequestId) {
      return
    }

    const baseViewport = page.getViewport({ scale: 1 })
    const thumbWidth = 92
    const thumbScale = thumbWidth / Math.max(1, baseViewport.width)
    const viewport = page.getViewport({ scale: thumbScale })
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    canvas.width = Math.floor(viewport.width * pixelRatio)
    canvas.height = Math.floor(viewport.height * pixelRatio)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    canvas.className = 'pdf-reader__thumb-canvas'
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    await page.render({ canvasContext: context, viewport }).promise

    if (requestId !== loadRequestId) {
      return
    }

    const previewElement = thumbElement.querySelector('.pdf-reader__thumb-preview')
    previewElement?.replaceChildren(canvas)
    renderedThumbs.add(pageNumber)
  } catch {
    // ignore thumbnail render failure
  } finally {
    renderingThumbs.delete(pageNumber)
  }
}

const scrollCurrentThumbIntoView = async (): Promise<void> => {
  await nextTick()
  const thumb = thumbRefs.value[currentPageNumber.value - 1]
  thumb?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'nearest'
  })
}

const rebuildThumbObserver = async (requestId: number): Promise<void> => {
  thumbObserver?.disconnect()
  thumbObserver = null

  if (!props.show || state.value !== 'ready') {
    return
  }

  await nextTick()
  const validThumbs = thumbRefs.value.filter(Boolean)
  if (!validThumbs.length) {
    return
  }

  thumbObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return
        }

        const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber ?? 0)
        if (pageNumber > 0) {
          void renderThumb(requestId, pageNumber)
        }
      })
    },
    {
      root: null,
      rootMargin: '300px 0px',
      threshold: 0.01
    }
  )

  validThumbs.forEach((thumb) => thumbObserver?.observe(thumb))
}

const isRenderCancelError = (error: unknown): boolean => {
  return error instanceof Error && error.name === 'RenderingCancelledException'
}

const applyEntryZoom = (entry: PageEntry): void => {
  entry.wrapper.style.width = `${Math.floor(entry.baseWidth * zoom.value)}px`
}

const renderPageEntry = async (requestId: number, entry: PageEntry): Promise<void> => {
  const pdf = pdfDocument
  if (!pdf || requestId !== loadRequestId) {
    return
  }

  const targetZoom = zoom.value
  if (entry.renderedZoom === targetZoom || entry.renderingZoom === targetZoom) {
    return
  }

  if (entry.renderTask) {
    entry.renderTask.cancel()
    entry.renderTask = null
  }

  entry.renderingZoom = targetZoom

  try {
    const page: PDFPageProxy = await pdf.getPage(entry.pageNumber)
    if (requestId !== loadRequestId || entry.renderingZoom !== targetZoom) {
      return
    }

    const viewport = page.getViewport({ scale: targetZoom })
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('无法创建 PDF 页面画布')
    }

    canvas.width = Math.floor(viewport.width * pixelRatio)
    canvas.height = Math.floor(viewport.height * pixelRatio)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    canvas.className = 'pdf-reader__page'
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

    const renderTask = page.render({ canvasContext: context, viewport })
    entry.renderTask = renderTask
    await renderTask.promise

    if (requestId !== loadRequestId || entry.renderingZoom !== targetZoom) {
      return
    }

    entry.wrapper.replaceChildren(canvas)
    entry.canvas = canvas
    entry.renderedZoom = targetZoom
  } catch (error) {
    if (!isRenderCancelError(error)) {
      throw error
    }
  } finally {
    if (entry.renderingZoom === targetZoom) {
      entry.renderingZoom = 0
      entry.renderTask = null
    }
  }
}

const getVisiblePageEntries = (): PageEntry[] => {
  const viewport = viewportRef.value
  if (!viewport) {
    return []
  }

  const viewportRect = viewport.getBoundingClientRect()
  const buffer = Math.max(600, viewport.clientHeight * 1.5)
  const top = viewportRect.top - buffer
  const bottom = viewportRect.bottom + buffer

  return pageEntries.filter((entry) => {
    const rect = entry.wrapper.getBoundingClientRect()
    return rect.bottom >= top && rect.top <= bottom
  })
}

const renderVisiblePages = async (): Promise<void> => {
  if (state.value !== 'ready') {
    return
  }
  if (renderQueueRunning) {
    renderQueuePending = true
    return
  }

  const requestId = loadRequestId
  renderQueueRunning = true
  renderQueuePending = false

  try {
    for (const entry of getVisiblePageEntries()) {
      if (requestId !== loadRequestId || state.value !== 'ready') {
        return
      }

      await renderPageEntry(requestId, entry)
    }
  } catch (error) {
    if (requestId === loadRequestId && !isRenderCancelError(error)) {
      errorMessage.value = error instanceof Error ? error.message : '渲染 PDF 页面失败'
      state.value = 'error'
    }
  } finally {
    renderQueueRunning = false
    if (renderQueuePending && requestId === loadRequestId && state.value === 'ready') {
      renderQueuePending = false
      scheduleVisiblePageRender()
    }
  }
}

const scheduleVisiblePageRender = (): void => {
  if (renderFrame !== null) {
    return
  }

  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = null
    void renderVisiblePages()
  })
}

const resetReader = (): void => {
  clearProgressTimer()
  clearPdfDocument()
  errorMessage.value = ''
  pageCount.value = 0
  currentPageNumber.value = 1
  progress.value = Math.max(0, Math.min(1, Number(props.initialProgress ?? 0)))
  zoom.value = 1.2
  fitMode.value = 'width'
  state.value = 'idle'
  if (pagesRef.value) {
    pagesRef.value.innerHTML = ''
  }
  if (viewportRef.value) {
    viewportRef.value.scrollTop = 0
  }
}

const loadPdf = async (): Promise<void> => {
  const requestId = ++loadRequestId
  resetReader()

  if (!props.show || !normalizedFilePath.value) {
    return
  }

  state.value = 'loading'

  try {
    const fileUrl = await window.api.dialog.getFileUrl(normalizedFilePath.value)
    if (requestId !== loadRequestId) {
      return
    }

    let document: PDFDocumentProxy | null = null
    if (fileUrl) {
      try {
        document = await getDocument({ url: fileUrl }).promise
      } catch {
        document = null
      }
    }

    if (!document) {
      const binaryData = await window.api.dialog.readBinaryFile(normalizedFilePath.value)
      if (requestId !== loadRequestId) {
        return
      }

      if (!binaryData) {
        throw new Error('无法读取 PDF 文件')
      }

      document = await getDocument({ data: new Uint8Array(binaryData) }).promise
    }

    if (requestId !== loadRequestId) {
      void document.destroy()
      return
    }

    pdfDocument = document
    await createPageShells(requestId, document)
    if (requestId !== loadRequestId) {
      return
    }

    state.value = 'ready'
    await nextTick()
    await waitForPaint()
    zoom.value = getFitWidthZoom()
    pageEntries.forEach((entry) => {
      applyEntryZoom(entry)
    })
    await restoreProgress()
    syncCurrentPageNumber()
    await rebuildThumbObserver(requestId)
    scheduleVisiblePageRender()
  } catch (error) {
    if (requestId !== loadRequestId) {
      return
    }

    errorMessage.value = error instanceof Error ? error.message : '加载 PDF 失败'
    state.value = 'error'
  }
}

const rerenderWithProgress = async (nextZoom: number): Promise<void> => {
  if (!pdfDocument || state.value !== 'ready') {
    zoom.value = nextZoom
    return
  }

  const previousProgress = calculateProgress()
  zoom.value = nextZoom
  cancelPageRenders()
  pageEntries.forEach((entry) => {
    applyEntryZoom(entry)
    entry.renderedZoom = 0
    entry.canvas = null
    entry.wrapper.textContent = `第 ${entry.pageNumber} 页`
  })

  await scrollToProgress(previousProgress)
  scheduleVisiblePageRender()
}

const decreaseZoom = async (): Promise<void> => {
  fitMode.value = 'custom'
  await rerenderWithProgress(Math.max(0.5, Number((zoom.value - 0.1).toFixed(2))))
}

const increaseZoom = async (): Promise<void> => {
  fitMode.value = 'custom'
  await rerenderWithProgress(Math.min(2.4, Number((zoom.value + 0.1).toFixed(2))))
}

const fitWidth = async (): Promise<void> => {
  fitMode.value = 'width'
  await rerenderWithProgress(getFitWidthZoom())
}

const scrollToPageNumber = async (
  pageNumber: number,
  behavior: ReaderScrollBehavior = 'smooth'
): Promise<void> => {
  await nextTick()
  const viewport = viewportRef.value
  const entry = pageEntries[pageNumber - 1]
  if (!viewport || !entry) {
    return
  }

  isSeeking.value = true
  currentPageNumber.value = entry.pageNumber
  viewport.scrollTo({
    top: Math.max(0, entry.wrapper.offsetTop - 18),
    behavior
  })
  window.setTimeout(
    () => {
      progress.value = calculateProgress()
      emitProgress()
      isSeeking.value = false
      scheduleVisiblePageRender()
    },
    behavior === 'smooth' ? 260 : 0
  )
}

const closeReader = (): void => {
  emitProgress()
  emit('update:show', false)
}

const openWithDefaultApp = async (): Promise<void> => {
  if (!normalizedFilePath.value) {
    return
  }

  await window.api.dialog.openPath(normalizedFilePath.value)
}

const handleResize = (): void => {
  if (props.show && state.value === 'ready' && fitMode.value === 'width') {
    void fitWidth()
  }
}

const handleKeydown = (event: KeyboardEvent): void => {
  if (!props.show) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeReader()
  }
}

watch(
  () => [props.show, props.filePath],
  () => {
    void loadPdf()
  },
  { immediate: true }
)

watch(
  () => props.initialProgress,
  () => {
    if (props.show && state.value === 'ready') {
      void restoreProgress()
    }
  }
)

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
      emitProgress()
      loadRequestId += 1
      resetReader()
    }
  },
  { immediate: true }
)

watch(currentPageNumber, () => {
  void scrollCurrentThumbIntoView()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
  emitProgress()
  loadRequestId += 1
  resetReader()
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="pdf-reader"
    :mask-closable="true"
    :show-icon="false"
    :bordered="false"
    :closable="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="pdf-reader__shell" :style="readerThemeStyle">
      <div class="pdf-reader__toolbar">
        <div class="pdf-reader__title">
          <n-icon :component="BookOutline" />
          <span>{{ displayTitle }}</span>
          <span v-if="pageCountText" class="pdf-reader__meta">{{ pageCountText }}</span>
          <span class="pdf-reader__meta">{{ progressText }}</span>
        </div>
        <div class="pdf-reader__actions">
          <div class="pdf-reader__zoom-tools">
            <n-button quaternary circle :disabled="zoom <= 0.5" @click="decreaseZoom">
              <template #icon>
                <n-icon :component="RemoveOutline" />
              </template>
            </n-button>
            <span>{{ zoomText }}</span>
            <n-button quaternary circle :disabled="zoom >= 2.4" @click="increaseZoom">
              <template #icon>
                <n-icon :component="AddOutline" />
              </template>
            </n-button>
          </div>
          <n-button
            quaternary
            :type="fitMode === 'width' ? 'primary' : 'default'"
            @click="fitWidth"
          >
            <template #icon>
              <n-icon :component="ExpandOutline" />
            </template>
            适应宽度
          </n-button>
          <n-button quaternary circle @click="openWithDefaultApp">
            <template #icon>
              <n-icon :component="OpenOutline" />
            </template>
          </n-button>
          <n-button quaternary circle @click="closeReader">
            <template #icon>
              <n-icon :component="CloseOutline" />
            </template>
          </n-button>
        </div>
      </div>

      <div class="pdf-reader__body">
        <div v-if="state === 'loading'" class="pdf-reader__state">加载中</div>
        <div v-else-if="state === 'error'" class="pdf-reader__state pdf-reader__state--error">
          {{ errorMessage }}
        </div>
        <div v-show="state === 'ready'" class="pdf-reader__reading-area">
          <n-scrollbar class="pdf-reader__sidebar">
            <div class="pdf-reader__thumbs">
              <button
                v-for="pageNumber in pageCount"
                :key="pageNumber"
                :ref="(element) => setThumbRef(element, pageNumber)"
                type="button"
                class="pdf-reader__thumb"
                :class="{ 'pdf-reader__thumb--active': pageNumber === currentPageNumber }"
                :data-page-number="pageNumber"
                @click="scrollToPageNumber(pageNumber)"
              >
                <div class="pdf-reader__thumb-preview">
                  <span>第 {{ pageNumber }} 页</span>
                </div>
                <div class="pdf-reader__thumb-index">{{ pageNumber }}</div>
              </button>
            </div>
          </n-scrollbar>
          <div ref="viewportRef" class="pdf-reader__viewport" @scroll="scheduleProgressSave">
            <div ref="pagesRef" class="pdf-reader__pages" />
          </div>
        </div>
      </div>

      <div class="pdf-reader__footer">
        <n-slider
          :value="progress"
          :min="0"
          :max="1"
          :step="0.001"
          :tooltip="false"
          class="pdf-reader__slider"
          @update:value="handleProgressUpdate"
          @dragend="handleProgressCommit(progress)"
        />
        <span class="pdf-reader__footer-progress">{{ progressText }}</span>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
:global(.n-card.n-modal.pdf-reader) {
  width: 94vw !important;
  max-width: 1440px;
  border-radius: 8px;
}

.pdf-reader :deep(.n-card__content) {
  padding: 0;
}

.pdf-reader__shell {
  height: min(90vh, 980px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  color: var(--reader-text-color);
  background: var(--reader-shell-bg);
}

.pdf-reader__toolbar {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--reader-border-color);
  box-sizing: border-box;
}

.pdf-reader__title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
}

.pdf-reader__title span:first-of-type {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-reader__meta {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 500;
  opacity: 0.68;
}

.pdf-reader__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pdf-reader__zoom-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.pdf-reader__zoom-tools span {
  min-width: 44px;
  font-size: 12px;
  text-align: center;
  opacity: 0.72;
}

.pdf-reader__body {
  position: relative;
  min-height: 0;
  background: var(--reader-body-bg);
}

.pdf-reader__state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  opacity: 0.72;
}

.pdf-reader__state--error {
  color: #e88080;
}

.pdf-reader__reading-area {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
}

.pdf-reader__sidebar {
  min-height: 0;
  border-right: 1px solid var(--reader-border-subtle-color);
}

.pdf-reader__sidebar :deep(.n-scrollbar-rail) {
  display: none;
}

.pdf-reader__sidebar :deep(.n-scrollbar-container) {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.pdf-reader__sidebar :deep(.n-scrollbar-container::-webkit-scrollbar) {
  display: none;
  width: 0;
  height: 0;
}

.pdf-reader__thumbs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.pdf-reader__thumb {
  position: relative;
  width: 100%;
  min-height: 128px;
  border: 1px solid var(--reader-border-color);
  border-radius: 8px;
  overflow: hidden;
  padding: 0;
  background: var(--reader-surface-color);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.pdf-reader__thumb:hover {
  transform: translateY(-1px);
  border-color: rgba(145, 232, 193, 0.45);
}

.pdf-reader__thumb--active {
  border-color: rgba(145, 232, 193, 0.88);
  box-shadow: 0 0 0 1px rgba(145, 232, 193, 0.18);
}

.pdf-reader__thumb-preview {
  width: 100%;
  min-height: 128px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  box-sizing: border-box;
  color: var(--reader-muted-color);
  font-size: 12px;
}

.pdf-reader__thumb-preview :deep(.pdf-reader__thumb-canvas) {
  max-width: 100%;
  height: auto !important;
  display: block;
  background: #fff;
}

.pdf-reader__thumb-index {
  position: absolute;
  right: 8px;
  bottom: 8px;
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.68);
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
}

.pdf-reader__viewport {
  width: 100%;
  height: 100%;
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.pdf-reader__viewport::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.pdf-reader__pages {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 24px;
  box-sizing: border-box;
}

.pdf-reader__pages :deep(.pdf-reader__page-shell) {
  max-width: 100%;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--reader-muted-color);
  font-size: 12px;
  background: var(--reader-page-placeholder-bg);
  box-shadow: 0 8px 24px var(--reader-shadow-color);
  overflow: hidden;
}

.pdf-reader__pages :deep(.pdf-reader__page) {
  max-width: 100%;
  height: auto !important;
  display: block;
  background: #fff;
}

.pdf-reader__footer {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  border-top: 1px solid var(--reader-border-color);
  box-sizing: border-box;
}

.pdf-reader__slider {
  flex: 1 1 auto;
  min-width: 0;
}

.pdf-reader__footer-progress {
  flex: 0 0 auto;
  min-width: 44px;
  font-size: 12px;
  text-align: right;
  opacity: 0.72;
}

@media (max-width: 900px) {
  :global(.n-card.n-modal.pdf-reader) {
    width: 94vw !important;
  }

  .pdf-reader__toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .pdf-reader__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .pdf-reader__pages {
    padding: 18px;
  }

  .pdf-reader__reading-area {
    grid-template-columns: 1fr;
    grid-template-rows: 116px minmax(0, 1fr);
  }

  .pdf-reader__sidebar {
    border-right: none;
    border-bottom: 1px solid var(--reader-border-subtle-color);
  }

  .pdf-reader__thumbs {
    flex-direction: row;
    padding: 12px 14px;
  }

  .pdf-reader__thumb {
    width: 72px;
    min-height: 92px;
    flex: 0 0 auto;
  }

  .pdf-reader__thumb-preview {
    min-height: 92px;
  }
}
</style>
