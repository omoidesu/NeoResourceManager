<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import ePub, { type Book, type Contents, type Rendition } from 'epubjs'
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
type EpubLocationPoint = {
  cfi?: string
  percentage?: number
  displayed?: {
    page?: number
    total?: number
  }
}
type EpubLocationLike = {
  start?: EpubLocationPoint
  percentage?: number
}

const state = ref<ReaderState>('idle')
const errorMessage = ref('')
const viewerRef = ref<HTMLDivElement | null>(null)
const progress = ref(0)
const fontSize = ref(18)
const pageLabel = ref('')
const locationsReady = ref(false)
const selectedReaderBackground = ref('')
let book: Book | null = null
let rendition: Rendition | null = null
let loadRequestId = 0
let progressTimer: number | null = null
let pageTurnInProgress = false
let pageTurnCooldownTimer: number | null = null

const appIsDark = inject<ComputedRef<boolean>>('appIsDark', computed(() => true))
const readerBackgroundOptions = [
  '#f6f5f7',
  '#e9e4d0',
  '#e6f1da',
  '#d9e4ef',
  '#0f0d0f',
  '#1a191b',
  '#272627'
]
const darkReaderBackgrounds = new Set(['#0f0d0f', '#1a191b', '#272627'])
const normalizedFilePath = computed(() => String(props.filePath ?? '').trim())
const fileName = computed(() => normalizedFilePath.value.replace(/\\/g, '/').split('/').pop() ?? '')
const displayTitle = computed(() => props.title || fileName.value || 'EPUB 阅读')
const progressText = computed(
  () => `${Math.round(Math.max(0, Math.min(1, progress.value)) * 100)}%`
)
const progressLabel = computed(() => (locationsReady.value ? progressText.value : '进度索引生成中'))
const fontSizeText = computed(() => `${fontSize.value}px`)
const readerBodyBackground = computed(
  () => selectedReaderBackground.value || (appIsDark.value ? '#1a191b' : '#f6f5f7')
)
const isReaderBackgroundDark = computed(() =>
  darkReaderBackgrounds.has(readerBodyBackground.value.toLowerCase())
)
const readerThemeColors = computed(() => {
  if (appIsDark.value) {
    return {
      shellBg: 'rgb(24, 25, 28)',
      bodyBg: readerBodyBackground.value,
      textColor: isReaderBackgroundDark.value ? '#d8dde5' : '#262626',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      linkColor: isReaderBackgroundDark.value ? '#7de8c4' : '#0f8f6f'
    }
  }

  return {
    shellBg: '#f5f5f5',
    bodyBg: readerBodyBackground.value,
    textColor: isReaderBackgroundDark.value ? '#d8dde5' : '#262626',
    borderColor: 'rgba(24, 24, 28, 0.1)',
    linkColor: isReaderBackgroundDark.value ? '#7de8c4' : '#0f8f6f'
  }
})
const readerThemeStyle = computed(() => ({
  '--reader-shell-bg': readerThemeColors.value.shellBg,
  '--reader-body-bg': readerThemeColors.value.bodyBg,
  '--reader-text-color': readerThemeColors.value.textColor,
  '--reader-border-color': readerThemeColors.value.borderColor
}))

const getLocationStart = (location: EpubLocationLike | EpubLocationPoint): EpubLocationPoint => {
  return 'start' in location && location.start ? location.start : location
}

const clearProgressTimer = (): void => {
  if (progressTimer) {
    window.clearTimeout(progressTimer)
    progressTimer = null
  }
}

const clearPageTurnLock = (): void => {
  if (pageTurnCooldownTimer) {
    window.clearTimeout(pageTurnCooldownTimer)
    pageTurnCooldownTimer = null
  }
  pageTurnInProgress = false
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

const resolveLocationProgress = (location: EpubLocationLike | EpubLocationPoint): number => {
  const start = getLocationStart(location)
  const cfi = String(start?.cfi ?? '').trim()
  const locationPercentage = Number(start?.percentage ?? location?.percentage)

  if (book?.locations && cfi) {
    const percentage = Number(book.locations.percentageFromCfi(cfi))
    if (Number.isFinite(percentage)) {
      return Math.max(0, Math.min(1, percentage))
    }
  }

  if (Number.isFinite(locationPercentage)) {
    return Math.max(0, Math.min(1, locationPercentage))
  }

  return progress.value
}

const syncLocation = (location: EpubLocationLike): void => {
  scheduleProgressSave(resolveLocationProgress(location))
  const start = location?.start
  const displayedPage = Number(start?.displayed?.page ?? 0)
  const displayedTotal = Number(start?.displayed?.total ?? 0)
  pageLabel.value =
    displayedPage > 0 && displayedTotal > 0 ? `${displayedPage} / ${displayedTotal}` : ''
}

const applyReaderTheme = (): void => {
  if (!rendition) {
    return
  }

  const colors = readerThemeColors.value
  rendition.themes.default({
    body: {
      color: colors.textColor,
      background: colors.bodyBg,
      'line-height': '1.78',
      'font-size': `${fontSize.value}px`
    },
    a: {
      color: colors.linkColor
    },
    img: {
      'max-width': '100% !important',
      height: 'auto !important'
    },
    p: {
      'line-height': '1.78',
      'white-space': 'normal !important',
      'overflow-wrap': 'anywhere',
      'word-break': 'break-word'
    }
  })
  rendition.themes.fontSize(`${fontSize.value}px`)
}

const handleWheelFlip = (event: WheelEvent): void => {
  if (!props.show || state.value !== 'ready') {
    return
  }

  const absX = Math.abs(event.deltaX)
  const absY = Math.abs(event.deltaY)
  const delta = absY >= absX ? event.deltaY : event.deltaX

  if (Math.abs(delta) < 4) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (delta > 0) {
    void goNext()
    return
  }

  void goPrevious()
}

const prepareContents = (contents: Contents): void => {
  contents.addStylesheetCss(
    `
      html, body {
        scrollbar-width: none !important;
      }
      p, blockquote, li, h1, h2, h3, h4, h5, h6 {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }
      img, svg, video {
        max-width: 100% !important;
        height: auto;
      }
      table, pre {
        max-width: 100% !important;
      }
      ::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    `,
    'neo-epub-reader-constraints'
  )
  contents.document.removeEventListener('wheel', handleWheelFlip)
  contents.document.addEventListener('wheel', handleWheelFlip, { passive: false })
}

const waitForViewerSize = async (host: HTMLDivElement): Promise<void> => {
  for (let index = 0; index < 12; index += 1) {
    if (host.clientWidth > 1 && host.clientHeight > 1) {
      return
    }

    await new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve(undefined))
    })
  }
}

const clearReader = (): void => {
  clearProgressTimer()
  clearPageTurnLock()
  if (rendition) {
    rendition.destroy()
    rendition = null
  }
  if (book) {
    book.destroy()
    book = null
  }
  if (viewerRef.value) {
    viewerRef.value.innerHTML = ''
  }
}

const resetReader = (): void => {
  clearReader()
  state.value = 'idle'
  errorMessage.value = ''
  pageLabel.value = ''
  locationsReady.value = false
  progress.value = Math.max(0, Math.min(1, Number(props.initialProgress ?? 0)))
  fontSize.value = 18
}

const displayInitialLocationForLoad = async (): Promise<void> => {
  if (!book || !rendition) {
    return
  }

  const initialProgress = Math.max(0, Math.min(1, Number(props.initialProgress ?? 0)))
  progress.value = initialProgress

  if (initialProgress > 0) {
    try {
      await book.locations.generate(2400)
      locationsReady.value = true
      const cfi = book.locations.cfiFromPercentage(initialProgress)
      if (cfi) {
        await rendition.display(cfi)
        return
      }
    } catch {
      locationsReady.value = false
    }
  }

  await rendition.display()
}

const generateLocationsInBackground = async (requestId: number): Promise<void> => {
  const currentBook = book
  const currentRendition = rendition
  if (!currentBook || !currentRendition) {
    return
  }

  try {
    await currentBook.locations.generate(2400)
    if (requestId !== loadRequestId || currentBook !== book || currentRendition !== rendition) {
      return
    }

    locationsReady.value = true
    const initialProgress = Math.max(0, Math.min(1, Number(props.initialProgress ?? 0)))
    if (initialProgress > 0 && progress.value <= 0.001) {
      const cfi = currentBook.locations.cfiFromPercentage(initialProgress)
      if (cfi) {
        progress.value = initialProgress
        await currentRendition.display(cfi)
        emitProgress(initialProgress)
      }
      return
    }

    const currentLocation = await currentRendition.currentLocation()
    scheduleProgressSave(resolveLocationProgress(currentLocation))
  } catch {
    locationsReady.value = false
  }
}

const loadEpub = async (): Promise<void> => {
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
      throw new Error('EPUB 阅读器尚未准备好')
    }

    const fileUrl = await window.api.dialog.getFileUrl(normalizedFilePath.value)
    if (requestId !== loadRequestId) {
      return
    }

    let nextBook: Book | null = null
    if (fileUrl) {
      try {
        nextBook = ePub(fileUrl)
        await nextBook.ready
      } catch {
        nextBook?.destroy()
        nextBook = null
      }
    }

    if (!nextBook) {
      const binaryData = await window.api.dialog.readBinaryFile(normalizedFilePath.value)
      if (requestId !== loadRequestId) {
        return
      }

      if (!binaryData) {
        throw new Error('无法读取 EPUB 文件')
      }

      nextBook = ePub(new Uint8Array(binaryData).buffer)
      await nextBook.ready
    }

    if (requestId !== loadRequestId) {
      nextBook.destroy()
      return
    }

    book = nextBook
    await nextTick()
    await waitForViewerSize(host)

    rendition = book.renderTo(host, {
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      flow: 'paginated',
      spread: 'none',
      manager: 'default',
      overflow: 'hidden',
      allowScriptedContent: false
    })
    rendition.spread('none')
    rendition.flow('paginated')
    rendition.hooks.content.register(prepareContents)
    rendition.on('relocated', syncLocation)
    rendition.on('rendered', applyReaderTheme)
    applyReaderTheme()

    await displayInitialLocationForLoad()
    state.value = 'ready'
    if (!locationsReady.value) {
      void generateLocationsInBackground(requestId)
    }
  } catch (error) {
    if (requestId !== loadRequestId) {
      return
    }

    errorMessage.value = error instanceof Error ? error.message : '加载 EPUB 失败'
    state.value = 'error'
  }
}

const turnPage = async (direction: 'previous' | 'next'): Promise<void> => {
  if (
    !rendition ||
    state.value !== 'ready' ||
    pageTurnInProgress ||
    pageTurnCooldownTimer
  ) {
    return
  }

  pageTurnInProgress = true
  try {
    if (direction === 'next') {
      await rendition.next()
    } else {
      await rendition.prev()
    }
  } finally {
    pageTurnInProgress = false
    pageTurnCooldownTimer = window.setTimeout(() => {
      pageTurnCooldownTimer = null
    }, 450)
  }
}

const goPrevious = async (): Promise<void> => {
  await turnPage('previous')
}

const goNext = async (): Promise<void> => {
  await turnPage('next')
}

const decreaseFontSize = (): void => {
  fontSize.value = Math.max(12, fontSize.value - 1)
  applyReaderTheme()
}

const increaseFontSize = (): void => {
  fontSize.value = Math.min(30, fontSize.value + 1)
  applyReaderTheme()
}

const selectReaderBackground = (color: string): void => {
  selectedReaderBackground.value = color
  applyReaderTheme()
}

const handleProgressUpdate = async (nextProgress: number): Promise<void> => {
  const normalizedProgress = Math.max(0, Math.min(1, Number(nextProgress ?? 0)))
  progress.value = normalizedProgress
  if (
    !book ||
    !rendition ||
    state.value !== 'ready' ||
    !locationsReady.value ||
    book.locations.length() <= 0
  ) {
    return
  }

  const cfi = book.locations.cfiFromPercentage(normalizedProgress)
  if (cfi) {
    await rendition.display(cfi)
  }
}

const handleProgressCommit = (): void => {
  emitProgress(progress.value)
}

const closeReader = (): void => {
  emitProgress(progress.value)
  emit('update:show', false)
}

const openWithDefaultApp = async (): Promise<void> => {
  if (!normalizedFilePath.value) {
    return
  }

  await window.api.dialog.openPath(normalizedFilePath.value)
}

const handleResize = (): void => {
  const host = viewerRef.value
  if (!host || !rendition || typeof rendition.resize !== 'function') {
    return
  }

  rendition.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight))
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
    if (event.repeat) {
      return
    }
    void goPrevious()
    return
  }

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
    event.preventDefault()
    if (event.repeat) {
      return
    }
    void goNext()
  }
}

watch(
  () => [props.show, props.filePath],
  () => {
    void loadEpub()
  },
  { immediate: true }
)

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown)
      window.addEventListener('resize', handleResize)
    } else {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('resize', handleResize)
      emitProgress(progress.value)
      loadRequestId += 1
      resetReader()
    }
  },
  { immediate: true }
)

watch(appIsDark, () => {
  selectedReaderBackground.value = ''
  applyReaderTheme()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
  emitProgress(progress.value)
  loadRequestId += 1
  resetReader()
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="epub-reader"
    :mask-closable="true"
    :show-icon="false"
    :bordered="false"
    :closable="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="epub-reader__shell" :style="readerThemeStyle">
      <div class="epub-reader__toolbar">
        <div class="epub-reader__title">
          <n-icon :component="BookOutline" />
          <span>{{ displayTitle }}</span>
          <span class="epub-reader__meta">{{ progressLabel }}</span>
          <span v-if="pageLabel" class="epub-reader__meta">{{ pageLabel }}</span>
        </div>
        <div class="epub-reader__actions">
          <n-button quaternary circle @click="goPrevious">
            <template #icon>
              <n-icon :component="ChevronBackOutline" />
            </template>
          </n-button>
          <div class="epub-reader__palette" aria-label="阅读背景">
            <button
              type="button"
              class="epub-reader__palette-auto"
              :class="{ 'epub-reader__palette-auto--active': !selectedReaderBackground }"
              title="跟随主题"
              @click="selectReaderBackground('')"
            >
              跟随主题
            </button>
            <button
              v-for="color in readerBackgroundOptions"
              :key="color"
              type="button"
              class="epub-reader__palette-button"
              :class="{ 'epub-reader__palette-button--active': color === readerBodyBackground }"
              :style="{ backgroundColor: color }"
              @click="selectReaderBackground(color)"
            />
          </div>
          <div class="epub-reader__font-tools">
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

      <div class="epub-reader__body">
        <div
          ref="viewerRef"
          class="epub-reader__viewer"
          @wheel="handleWheelFlip"
        />
        <div v-if="state === 'loading'" class="epub-reader__state">加载中</div>
        <div v-else-if="state === 'error'" class="epub-reader__state epub-reader__state--error">
          {{ errorMessage }}
        </div>
      </div>

      <div class="epub-reader__footer">
        <n-slider
          :value="progress"
          :min="0"
          :max="1"
          :step="0.001"
          :tooltip="false"
          class="epub-reader__slider"
          @update:value="handleProgressUpdate"
          @dragend="handleProgressCommit"
        />
        <span class="epub-reader__footer-progress">{{ progressLabel }}</span>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
:global(.n-card.n-modal.epub-reader) {
  width: 94vw !important;
  max-width: 1440px;
  border-radius: 8px;
}

.epub-reader :deep(.n-card__content) {
  padding: 0;
}

.epub-reader__shell {
  height: min(90vh, 980px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  color: var(--reader-text-color);
  background: var(--reader-shell-bg);
}

.epub-reader__toolbar {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--reader-border-color);
  box-sizing: border-box;
}

.epub-reader__title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
}

.epub-reader__title span:first-of-type {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.epub-reader__meta {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 500;
  opacity: 0.68;
}

.epub-reader__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.epub-reader__palette {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.epub-reader__palette-button {
  width: 20px;
  height: 20px;
  border: 1px solid var(--reader-border-color);
  border-radius: 6px;
  padding: 0;
  box-sizing: border-box;
  cursor: pointer;
}

.epub-reader__palette-auto {
  height: 24px;
  border: 1px solid var(--reader-border-color);
  border-radius: 6px;
  padding: 0 8px;
  box-sizing: border-box;
  color: var(--reader-text-color);
  background: transparent;
  font-size: 12px;
  line-height: 22px;
  cursor: pointer;
}

.epub-reader__palette-auto--active,
.epub-reader__palette-button--active {
  border-color: rgba(99, 226, 183, 0.9);
  box-shadow: 0 0 0 2px rgba(99, 226, 183, 0.35);
}

.epub-reader__font-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.epub-reader__font-tools span {
  min-width: 44px;
  font-size: 12px;
  text-align: center;
  opacity: 0.72;
}

.epub-reader__body {
  position: relative;
  min-height: 0;
  background: var(--reader-body-bg);
  overflow: hidden;
  contain: layout paint;
}

.epub-reader__state {
  position: absolute;
  inset: 0;
  z-index: 2;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--reader-body-bg);
  font-size: 14px;
  opacity: 0.72;
}

.epub-reader__state--error {
  color: #e88080;
}

.epub-reader__viewer {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  contain: layout paint;
  clip-path: inset(0);
}

.epub-reader__viewer :deep(.epub-container) {
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
}

.epub-reader__viewer :deep(.epub-view),
.epub-reader__viewer :deep(.epub-contents) {
  height: 100% !important;
  overflow: hidden !important;
}

.epub-reader__viewer :deep(iframe) {
  display: block;
  height: 100% !important;
  background: var(--reader-body-bg);
  overflow: hidden !important;
  border: 0;
}

.epub-reader__viewer :deep(.epub-container::-webkit-scrollbar),
.epub-reader__viewer :deep(.epub-view::-webkit-scrollbar),
.epub-reader__viewer :deep(.epub-contents::-webkit-scrollbar),
.epub-reader__viewer :deep(iframe::-webkit-scrollbar) {
  display: none;
  width: 0;
  height: 0;
}

.epub-reader__footer {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  border-top: 1px solid var(--reader-border-color);
  box-sizing: border-box;
}

.epub-reader__slider {
  flex: 1 1 auto;
  min-width: 0;
}

.epub-reader__footer-progress {
  flex: 0 0 auto;
  min-width: 44px;
  font-size: 12px;
  text-align: right;
  opacity: 0.72;
}

@media (max-width: 900px) {
  :global(.n-card.n-modal.epub-reader) {
    width: 94vw !important;
    max-width: 94vw;
  }

  .epub-reader__toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .epub-reader__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
