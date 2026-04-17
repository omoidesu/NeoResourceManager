<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import 'foliate-js/view.js'
import {
  AddOutline,
  BookOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  CloseOutline,
  OpenOutline,
  RemoveOutline
} from '@vicons/ionicons5'

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
type FoliateViewElement = HTMLElement & {
  open: (file: File | Blob | string) => Promise<void>
  init: (options: { lastLocation?: unknown; showTextStart?: boolean }) => Promise<void>
  prev: () => Promise<void>
  next: () => Promise<void>
  goTo: (target: unknown) => Promise<unknown>
  goToFraction: (fraction: number) => Promise<void>
  close?: () => void
  book?: any
  renderer?: HTMLElement & {
    getContents?: () => Array<{ doc?: Document }>
  }
}

const state = ref<ReaderState>('idle')
const errorMessage = ref('')
const viewerRef = ref<HTMLDivElement | null>(null)
const progress = ref(0)
const fontSize = ref(18)
const pageLabel = ref('')
let view: FoliateViewElement | null = null
let loadRequestId = 0
let progressTimer: number | null = null
let wheelFlipTimer: number | null = null

const normalizedFilePath = computed(() => String(props.filePath ?? '').trim())
const fileName = computed(() => normalizedFilePath.value.replace(/\\/g, '/').split('/').pop() ?? '')
const fileExtension = computed(() => String(fileName.value.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase())
const isKindleFormat = computed(() => ['mobi', 'azw', 'azw3'].includes(fileExtension.value))
const displayTitle = computed(() => props.title || fileName.value || '电子书阅读')
const progressText = computed(() => `${Math.round(Math.max(0, Math.min(1, progress.value)) * 100)}%`)
const fontSizeText = computed(() => `${fontSize.value}px`)

const getMimeType = () => {
  if (fileExtension.value === 'epub') return 'application/epub+zip'
  if (fileExtension.value === 'mobi') return 'application/x-mobipocket-ebook'
  if (fileExtension.value === 'azw' || fileExtension.value === 'azw3') return 'application/vnd.amazon.ebook'
  return 'application/octet-stream'
}

const upsertContentStyle = (doc: Document): void => {
  const head = doc.head
  if (!head) {
    return
  }

  let style = doc.getElementById('neo-ebook-reader-style') as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.id = 'neo-ebook-reader-style'
    head.append(style)
  }

  style.textContent = `
    html, body {
      overflow: hidden !important;
      color: #d8dde5 !important;
      background: #202124 !important;
      font-size: ${fontSize.value}px !important;
      line-height: 1.78 !important;
    }
    body {
      width: auto !important;
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    p, blockquote, li, h1, h2, h3, h4, h5, h6 {
      white-space: normal !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    img, svg, video, table {
      max-width: 100% !important;
      height: auto !important;
    }
    a { color: #7de8c4 !important; }
  `
}

const clearProgressTimer = (): void => {
  if (progressTimer) {
    window.clearTimeout(progressTimer)
    progressTimer = null
  }
}

const clearWheelFlipTimer = (): void => {
  if (wheelFlipTimer) {
    window.clearTimeout(wheelFlipTimer)
    wheelFlipTimer = null
  }
}

const emitProgress = (nextProgress = progress.value): void => {
  const normalizedProgress = Math.max(0, Math.min(1, Number(nextProgress ?? 0)))
  progress.value = normalizedProgress
  emit('progress-change', normalizedProgress)
}

const scheduleProgressSave = (nextProgress: number): void => {
  progress.value = Math.max(0, Math.min(1, Number(nextProgress ?? 0)))
  clearProgressTimer()
  progressTimer = window.setTimeout(() => {
    emitProgress(progress.value)
  }, 400)
}

const handleRelocate = (event: Event): void => {
  const detail = (event as CustomEvent).detail ?? {}
  const nextProgress = Number(detail.fraction ?? progress.value)
  if (Number.isFinite(nextProgress)) {
    scheduleProgressSave(nextProgress)
  }

  const pageItem = detail.pageItem
  pageLabel.value = pageItem?.label ? `第 ${pageItem.label} 页` : ''
}

const handleLoad = (event: Event): void => {
  const doc = (event as CustomEvent).detail?.doc as Document | undefined
  if (!doc) {
    return
  }

  upsertContentStyle(doc)
  doc.addEventListener('wheel', handleWheelFlip, { passive: false })
}

const waitForNextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })

const configureRendererFlow = (targetView: FoliateViewElement): void => {
  const renderer = targetView.renderer
  if (!renderer) {
    return
  }

  if (isKindleFormat.value) {
    const viewerWidth = Math.max(720, Math.floor(viewerRef.value?.clientWidth ?? window.innerWidth))
    renderer.setAttribute('flow', 'scrolled')
    renderer.setAttribute('margin', '48px')
    renderer.setAttribute('max-inline-size', `${viewerWidth}px`)
    return
  }

  renderer.removeAttribute('flow')
  renderer.removeAttribute('margin')
  renderer.removeAttribute('max-inline-size')
}

const applyFontSize = (): void => {
  const currentView = view
  if (!currentView) {
    return
  }

  currentView.style.setProperty('--user-font-size', `${fontSize.value}px`)
  currentView.renderer?.getContents?.().forEach(({ doc }) => {
    if (doc) {
      upsertContentStyle(doc)
    }
  })
}

const clearReader = (): void => {
  clearProgressTimer()
  clearWheelFlipTimer()
  view?.close?.()
  view?.remove()
  view = null
  if (viewerRef.value) {
    viewerRef.value.innerHTML = ''
  }
}

const resetReader = (): void => {
  clearReader()
  state.value = 'idle'
  errorMessage.value = ''
  pageLabel.value = ''
  progress.value = Math.max(0, Math.min(1, Number(props.initialProgress ?? 0)))
  fontSize.value = 18
}

const loadEbook = async (): Promise<void> => {
  const requestId = ++loadRequestId
  resetReader()

  if (!props.show || !normalizedFilePath.value) {
    return
  }

  state.value = 'loading'

  try {
    await nextTick()
    const host = viewerRef.value
    if (!host) {
      throw new Error('电子书阅读器尚未准备好')
    }

    const binaryData = await window.api.dialog.readBinaryFile(normalizedFilePath.value)
    if (requestId !== loadRequestId) {
      return
    }

    if (!binaryData) {
      throw new Error('无法读取电子书文件')
    }

    const bytes = new Uint8Array(binaryData)
    const fileBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const file = new File([fileBuffer], fileName.value || 'book', { type: getMimeType() })
    const nextView = document.createElement('foliate-view') as FoliateViewElement
    nextView.classList.add('ebook-reader__foliate-view')
    nextView.addEventListener('relocate', handleRelocate)
    nextView.addEventListener('load', handleLoad)
    host.replaceChildren(nextView)
    view = nextView

    await nextView.open(file)
    if (requestId !== loadRequestId) {
      nextView.close?.()
      nextView.remove()
      return
    }

    configureRendererFlow(nextView)
    await waitForNextFrame()
    state.value = 'ready'
    await nextTick()
    const initialProgress = Math.max(0, Math.min(1, Number(props.initialProgress ?? 0)))
    if (initialProgress > 0) {
      await nextView.goToFraction(initialProgress)
      emitProgress(initialProgress)
    } else {
      await nextView.goTo(0)
    }
    applyFontSize()
  } catch (error) {
    if (requestId !== loadRequestId) {
      return
    }

    errorMessage.value = error instanceof Error ? error.message : '加载电子书失败'
    state.value = 'error'
  }
}

const goPrevious = async (): Promise<void> => {
  if (view && state.value === 'ready') {
    await view.prev()
  }
}

const goNext = async (): Promise<void> => {
  if (view && state.value === 'ready') {
    await view.next()
  }
}

const decreaseFontSize = (): void => {
  fontSize.value = Math.max(12, fontSize.value - 1)
  applyFontSize()
}

const increaseFontSize = (): void => {
  fontSize.value = Math.min(30, fontSize.value + 1)
  applyFontSize()
}

const handleProgressUpdate = async (nextProgress: number): Promise<void> => {
  const normalizedProgress = Math.max(0, Math.min(1, Number(nextProgress ?? 0)))
  progress.value = normalizedProgress
  if (view && state.value === 'ready') {
    await view.goToFraction(normalizedProgress)
  }
}

const handleProgressCommit = (): void => {
  emitProgress(progress.value)
}

const handleWheelFlip = (event: WheelEvent): void => {
  if (!props.show || state.value !== 'ready') {
    return
  }

  if (isKindleFormat.value) {
    return
  }

  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  if (Math.abs(delta) < 4) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (wheelFlipTimer) {
    return
  }

  wheelFlipTimer = window.setTimeout(() => {
    wheelFlipTimer = null
  }, 260)

  if (delta > 0) {
    void goNext()
    return
  }

  void goPrevious()
}

const closeReader = (): void => {
  emitProgress(progress.value)
  emit('update:show', false)
}

const openWithDefaultApp = async (): Promise<void> => {
  if (normalizedFilePath.value) {
    await window.api.dialog.openPath(normalizedFilePath.value)
  }
}

const handleKeydown = (event: KeyboardEvent): void => {
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

watch(
  () => [props.show, props.filePath],
  () => {
    void loadEbook()
  },
  { immediate: true }
)

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
      emitProgress(progress.value)
      loadRequestId += 1
      resetReader()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  emitProgress(progress.value)
  loadRequestId += 1
  resetReader()
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="ebook-reader"
    :mask-closable="true"
    :show-icon="false"
    :bordered="false"
    :closable="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="ebook-reader__shell">
      <div class="ebook-reader__toolbar">
        <div class="ebook-reader__title">
          <n-icon :component="BookOutline" />
          <span>{{ displayTitle }}</span>
          <span class="ebook-reader__meta">{{ progressText }}</span>
          <span v-if="pageLabel" class="ebook-reader__meta">{{ pageLabel }}</span>
        </div>
        <div class="ebook-reader__actions">
          <n-button quaternary circle @click="goPrevious">
            <template #icon>
              <n-icon :component="ChevronBackOutline" />
            </template>
          </n-button>
          <div class="ebook-reader__font-tools">
            <n-button quaternary circle :disabled="fontSize <= 12" @click="decreaseFontSize">
              <template #icon>
                <n-icon :component="RemoveOutline" />
              </template>
            </n-button>
            <span>{{ fontSizeText }}</span>
            <n-button quaternary circle :disabled="fontSize >= 30" @click="increaseFontSize">
              <template #icon>
                <n-icon :component="AddOutline" />
              </template>
            </n-button>
          </div>
          <n-button quaternary circle @click="goNext">
            <template #icon>
              <n-icon :component="ChevronForwardOutline" />
            </template>
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

      <div class="ebook-reader__body">
        <div v-if="state === 'loading'" class="ebook-reader__state">加载中</div>
        <div v-else-if="state === 'error'" class="ebook-reader__state ebook-reader__state--error">
          {{ errorMessage }}
        </div>
        <div
          v-show="state === 'ready'"
          ref="viewerRef"
          class="ebook-reader__viewer"
          @wheel="handleWheelFlip"
        />
      </div>

      <div class="ebook-reader__footer">
        <n-slider
          :value="progress"
          :min="0"
          :max="1"
          :step="0.001"
          :tooltip="false"
          class="ebook-reader__slider"
          @update:value="handleProgressUpdate"
          @dragend="handleProgressCommit"
        />
        <span class="ebook-reader__footer-progress">{{ progressText }}</span>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
:global(.n-card.n-modal.ebook-reader) {
  width: 94vw !important;
  max-width: 1440px;
  border-radius: 8px;
}

.ebook-reader :deep(.n-card__content) {
  padding: 0;
}

.ebook-reader__shell {
  height: min(90vh, 980px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: rgb(24, 25, 28);
}

.ebook-reader__toolbar {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
}

.ebook-reader__title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
}

.ebook-reader__title span:first-of-type {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ebook-reader__meta {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 500;
  opacity: 0.68;
}

.ebook-reader__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ebook-reader__font-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.ebook-reader__font-tools span {
  min-width: 44px;
  font-size: 12px;
  text-align: center;
  opacity: 0.72;
}

.ebook-reader__body {
  position: relative;
  min-height: 0;
  background: #202124;
}

.ebook-reader__state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  opacity: 0.72;
}

.ebook-reader__state--error {
  color: #e88080;
}

.ebook-reader__viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.ebook-reader__viewer :deep(.ebook-reader__foliate-view) {
  width: 100%;
  height: 100%;
  display: block;
  color: #d8dde5;
  background: #202124;
}

.ebook-reader__viewer :deep(foliate-view) {
  width: 100%;
  height: 100%;
  display: block;
  overflow: hidden;
}

.ebook-reader__viewer :deep(foliate-paginator) {
  width: 100%;
  height: 100%;
}

.ebook-reader__footer {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
}

.ebook-reader__slider {
  flex: 1 1 auto;
  min-width: 0;
}

.ebook-reader__footer-progress {
  flex: 0 0 auto;
  min-width: 44px;
  font-size: 12px;
  text-align: right;
  opacity: 0.72;
}

@media (max-width: 900px) {
  :global(.n-card.n-modal.ebook-reader) {
    width: 94vw !important;
    max-width: 94vw;
  }

  .ebook-reader__toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .ebook-reader__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
