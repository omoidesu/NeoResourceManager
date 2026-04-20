<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import MarkdownIt from 'markdown-it'
import {
  BookOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  CloseOutline,
  OpenOutline,
  RemoveOutline,
  AddOutline
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
type TextFileInfo = {
  size: number
  encoding: string
  recommendedChunkSize: number
}
type TextFileChunk = {
  text: string
  offset: number
  nextOffset: number
  fileSize: number
  encoding: string
  hasPrevious: boolean
  hasNext: boolean
}

const LARGE_TEXT_FILE_BYTES = 5 * 1024 * 1024
const DEFAULT_TEXT_CHUNK_BYTES = 512 * 1024
const AUTO_TEXT_ENCODING = 'auto'
const textEncodingOptions = [
  { label: '自动检测', value: AUTO_TEXT_ENCODING },
  { label: 'UTF8', value: 'utf-8' },
  { label: 'UTF16LE', value: 'utf-16le' },
  { label: '简体中文', value: 'gb18030' },
  { label: '繁体中文', value: 'big5' },
  { label: '日语', value: 'shift_jis' },
  { label: '朝鲜语', value: 'euc-kr' },
  { label: '西欧语言', value: 'windows-1252' },
  { label: '中欧语言', value: 'windows-1250' }
]
const textEncodingLabelMap = new Map(textEncodingOptions.map((option) => [option.value, option.label]))

const state = ref<ReaderState>('idle')
const content = ref('')
const errorMessage = ref('')
const viewportRef = ref<HTMLDivElement | null>(null)
const progress = ref(0)
const fontSize = ref(16)
const isSeeking = ref(false)
const selectedReaderBackground = ref('')
const selectedTextEncoding = ref(AUTO_TEXT_ENCODING)
const detectedTextEncoding = ref('')
const pagedFileInfo = ref<TextFileInfo | null>(null)
const currentChunk = ref<TextFileChunk | null>(null)
const pageOffsetHistory = ref<number[]>([])
let loadRequestId = 0
let progressTimer: number | null = null
let pagedNavigationRunning = false
let pendingRestoreProgress: number | null = null
let lastLoadedFilePath = ''

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
const fileExtension = computed(() => String(fileName.value.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase())
const isMarkdown = computed(() => ['md', 'markdown'].includes(fileExtension.value))
const displayTitle = computed(() => props.title || fileName.value || '文本阅读')
const isPagedMode = computed(() => Boolean(pagedFileInfo.value && currentChunk.value))
const progressText = computed(
  () => `${(Math.max(0, Math.min(1, progress.value)) * 100).toFixed(2)}%`
)
const fontSizeText = computed(() => `${fontSize.value}px`)
const textEncodingLabel = computed(() => {
  const selectedLabel = textEncodingLabelMap.get(selectedTextEncoding.value) ?? selectedTextEncoding.value
  if (selectedTextEncoding.value !== AUTO_TEXT_ENCODING) {
    return selectedLabel
  }

  const detectedLabel = textEncodingLabelMap.get(detectedTextEncoding.value) ?? detectedTextEncoding.value
  return detectedLabel ? `自动: ${detectedLabel}` : selectedLabel
})
const contentStyle = computed(() => ({
  fontSize: `${fontSize.value}px`
}))
const readerBodyBackground = computed(
  () => selectedReaderBackground.value || (appIsDark.value ? '#1a191b' : '#f6f5f7')
)
const isReaderBackgroundDark = computed(() =>
  darkReaderBackgrounds.has(readerBodyBackground.value.toLowerCase())
)
const readerThemeStyle = computed(() => {
  if (appIsDark.value) {
    return {
      '--reader-shell-bg': 'rgb(24, 25, 28)',
      '--reader-body-bg': readerBodyBackground.value,
      '--reader-text-color': isReaderBackgroundDark.value ? '#d8dde5' : '#262626',
      '--reader-muted-color': 'rgba(216, 221, 229, 0.68)',
      '--reader-border-color': 'rgba(255, 255, 255, 0.08)',
      '--reader-border-strong-color': 'rgba(255, 255, 255, 0.12)',
      '--reader-link-color': isReaderBackgroundDark.value ? '#7de8c4' : '#0f8f6f',
      '--reader-block-bg': 'rgba(255, 255, 255, 0.04)',
      '--reader-code-bg': 'rgba(255, 255, 255, 0.08)',
      '--reader-pre-bg': 'rgba(0, 0, 0, 0.28)'
    }
  }

  return {
    '--reader-shell-bg': '#f5f5f5',
    '--reader-body-bg': readerBodyBackground.value,
    '--reader-text-color': isReaderBackgroundDark.value ? '#d8dde5' : '#262626',
    '--reader-muted-color': 'rgba(38, 38, 38, 0.62)',
    '--reader-border-color': 'rgba(24, 24, 28, 0.1)',
    '--reader-border-strong-color': 'rgba(24, 24, 28, 0.16)',
    '--reader-link-color': isReaderBackgroundDark.value ? '#7de8c4' : '#0f8f6f',
    '--reader-block-bg': 'rgba(24, 24, 28, 0.04)',
    '--reader-code-bg': 'rgba(24, 24, 28, 0.08)',
    '--reader-pre-bg': 'rgba(24, 24, 28, 0.06)'
  }
})
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
})
const renderedMarkdown = computed(() => (isMarkdown.value ? markdown.render(content.value) : ''))

const clearProgressTimer = (): void => {
  if (progressTimer) {
    window.clearTimeout(progressTimer)
    progressTimer = null
  }
}

const calculateProgress = (): number => {
  if (isPagedMode.value) {
    const viewport = viewportRef.value
    const chunk = currentChunk.value
    if (!chunk || chunk.fileSize <= 0) {
      return 0
    }

    const chunkBytes = Math.max(1, chunk.nextOffset - chunk.offset)
    let chunkScrollProgress = 0
    if (viewport) {
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      chunkScrollProgress = maxScrollTop ? Math.max(0, Math.min(1, viewport.scrollTop / maxScrollTop)) : 0
    }

    return Math.max(0, Math.min(1, (chunk.offset + chunkBytes * chunkScrollProgress) / chunk.fileSize))
  }

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

const scheduleProgressSave = (): void => {
  if (isSeeking.value) {
    return
  }

  progress.value = calculateProgress()
  clearProgressTimer()
  progressTimer = window.setTimeout(() => {
    emitProgress()
  }, 400)
}

const restoreProgress = async (): Promise<void> => {
  await nextTick()
  if (isPagedMode.value) {
    if (viewportRef.value) {
      viewportRef.value.scrollTop = 0
    }
    progress.value = calculateProgress()
    return
  }

  const viewport = viewportRef.value
  if (!viewport) {
    return
  }

  const normalizedProgress = Math.max(0, Math.min(1, Number(props.initialProgress ?? 0)))
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
  viewport.scrollTop = Math.round(maxScrollTop * normalizedProgress)
  progress.value = calculateProgress()
}

const scrollToProgress = async (nextProgress: number): Promise<void> => {
  if (isPagedMode.value) {
    await loadTextChunkByProgress(nextProgress)
    return
  }

  await nextTick()
  const viewport = viewportRef.value
  if (!viewport) {
    return
  }

  const normalizedProgress = Math.max(0, Math.min(1, Number(nextProgress ?? 0)))
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
  viewport.scrollTop = Math.round(maxScrollTop * normalizedProgress)
  progress.value = calculateProgress()
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

const decreaseFontSize = async (): Promise<void> => {
  fontSize.value = Math.max(12, fontSize.value - 1)
  await scrollToProgress(progress.value)
}

const increaseFontSize = async (): Promise<void> => {
  fontSize.value = Math.min(28, fontSize.value + 1)
  await scrollToProgress(progress.value)
}

const selectReaderBackground = (color: string): void => {
  selectedReaderBackground.value = color
}

const getSelectedTextEncoding = (): string | undefined => {
  const normalizedEncoding = String(selectedTextEncoding.value ?? '').trim()
  return normalizedEncoding && normalizedEncoding !== AUTO_TEXT_ENCODING ? normalizedEncoding : undefined
}

const handleTextEncodingChange = (encoding: string): void => {
  selectedTextEncoding.value = String(encoding || AUTO_TEXT_ENCODING)
  pendingRestoreProgress = state.value === 'ready' ? calculateProgress() : progress.value
  void loadText()
}

const waitForPaint = (): Promise<void> =>
  new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })

const scrollViewportToProgress = async (
  scrollProgress: number,
  scrollPosition?: 'start' | 'end'
): Promise<void> => {
  await nextTick()
  await waitForPaint()

  const viewport = viewportRef.value
  if (!viewport) {
    return
  }

  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
  if (Number.isFinite(scrollProgress)) {
    viewport.scrollTop = Math.round(maxScrollTop * Math.max(0, Math.min(1, scrollProgress)))
  } else {
    viewport.scrollTop = scrollPosition === 'end' ? maxScrollTop : 0
  }
  progress.value = calculateProgress()
}

const resetReader = (): void => {
  clearProgressTimer()
  content.value = ''
  errorMessage.value = ''
  progress.value = Math.max(0, Math.min(1, Number(props.initialProgress ?? 0)))
  pagedFileInfo.value = null
  currentChunk.value = null
  pageOffsetHistory.value = []
  detectedTextEncoding.value = ''
  state.value = 'idle'
  if (viewportRef.value) {
    viewportRef.value.scrollTop = 0
  }
}

const getTextChunkSize = (): number => {
  return Math.max(1, Number(pagedFileInfo.value?.recommendedChunkSize ?? DEFAULT_TEXT_CHUNK_BYTES) || DEFAULT_TEXT_CHUNK_BYTES)
}

const normalizeChunkOffset = (offset: number): number => {
  const fileSize = Math.max(0, Number(pagedFileInfo.value?.size ?? currentChunk.value?.fileSize ?? 0))
  if (!fileSize) {
    return 0
  }

  return Math.max(0, Math.min(fileSize - 1, Math.floor(Number(offset ?? 0) || 0)))
}

const loadTextChunkAtOffset = async (
  offset: number,
  options: {
    pushHistory?: boolean
    requestId?: number
    scrollPosition?: 'start' | 'end'
    scrollProgress?: number
  } = {}
): Promise<void> => {
  const requestId = options.requestId ?? loadRequestId
  const previousOffset = currentChunk.value?.offset
  const normalizedOffset = normalizeChunkOffset(offset)
  const chunk = await window.api.dialog.readTextFileChunk(normalizedFilePath.value, {
    offset: normalizedOffset,
    length: getTextChunkSize(),
    encoding: pagedFileInfo.value?.encoding
  })

  if (requestId !== loadRequestId) {
    return
  }

  if (!chunk) {
    throw new Error('无法读取文本分页')
  }

  if (options.pushHistory && typeof previousOffset === 'number' && previousOffset !== chunk.offset) {
    pageOffsetHistory.value = [...pageOffsetHistory.value, previousOffset]
  }

  currentChunk.value = chunk
  content.value = chunk.text
  progress.value = chunk.fileSize > 0 ? Math.max(0, Math.min(1, chunk.offset / chunk.fileSize)) : 0

  if (state.value === 'ready') {
    await scrollViewportToProgress(options.scrollProgress ?? Number.NaN, options.scrollPosition)
  }
}

const loadTextChunkByProgress = async (nextProgress: number): Promise<void> => {
  const fileSize = Math.max(0, Number(pagedFileInfo.value?.size ?? currentChunk.value?.fileSize ?? 0))
  if (!fileSize) {
    return
  }

  const chunkSize = getTextChunkSize()
  const targetOffset = fileSize * Math.max(0, Math.min(1, nextProgress))
  const chunkOffset = Math.max(0, Math.floor(Math.max(0, targetOffset - 1) / chunkSize) * chunkSize)
  const chunkProgress = Math.max(0, Math.min(1, (targetOffset - chunkOffset) / chunkSize))

  pageOffsetHistory.value = []
  await loadTextChunkAtOffset(chunkOffset, {
    pushHistory: false,
    scrollProgress: chunkProgress
  })
}

const goPreviousPage = async (): Promise<void> => {
  const chunk = currentChunk.value
  if (!isPagedMode.value || state.value !== 'ready' || !chunk?.hasPrevious) {
    return
  }

  const previousOffset = pageOffsetHistory.value.at(-1)
  pageOffsetHistory.value = pageOffsetHistory.value.slice(0, -1)
  const fallbackOffset = Math.max(0, chunk.offset - getTextChunkSize())
  await loadTextChunkAtOffset(previousOffset ?? fallbackOffset, {
    pushHistory: false,
    scrollPosition: 'end'
  })
  emitProgress()
}

const goNextPage = async (): Promise<void> => {
  const chunk = currentChunk.value
  if (!isPagedMode.value || state.value !== 'ready' || !chunk?.hasNext) {
    return
  }

  await loadTextChunkAtOffset(chunk.nextOffset, { pushHistory: true })
  emitProgress()
}

const handlePagedWheel = async (event: WheelEvent): Promise<void> => {
  if (!isPagedMode.value || state.value !== 'ready' || pagedNavigationRunning) {
    return
  }

  const viewport = viewportRef.value
  const chunk = currentChunk.value
  if (!viewport || !chunk) {
    return
  }

  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
  const atTop = viewport.scrollTop <= 0
  const atBottom = viewport.scrollTop >= maxScrollTop - 1

  if (event.deltaY < 0 && atTop && chunk.hasPrevious) {
    event.preventDefault()
    pagedNavigationRunning = true
    try {
      await goPreviousPage()
    } finally {
      pagedNavigationRunning = false
    }
    return
  }

  if (event.deltaY > 0 && atBottom && chunk.hasNext) {
    event.preventDefault()
    pagedNavigationRunning = true
    try {
      await goNextPage()
    } finally {
      pagedNavigationRunning = false
    }
  }
}

const loadText = async (): Promise<void> => {
  const requestId = ++loadRequestId
  const targetFilePath = normalizedFilePath.value
  if (targetFilePath !== lastLoadedFilePath) {
    lastLoadedFilePath = targetFilePath
    selectedTextEncoding.value = AUTO_TEXT_ENCODING
    pendingRestoreProgress = null
  }
  const restoreTargetProgress = pendingRestoreProgress
  resetReader()

  if (!props.show || !targetFilePath) {
    return
  }

  state.value = 'loading'

  try {
    const info = await window.api.dialog.getTextFileInfo(targetFilePath)
    if (requestId !== loadRequestId) {
      return
    }

    if (!info) {
      throw new Error('无法读取文本文件')
    }

    detectedTextEncoding.value = info.encoding
    const effectiveEncoding = getSelectedTextEncoding() ?? info.encoding
    const effectiveInfo = {
      ...info,
      encoding: effectiveEncoding
    }
    const initialProgress = Math.max(0, Math.min(1, Number(restoreTargetProgress ?? props.initialProgress ?? 0)))
    pendingRestoreProgress = null

    if (info.size > LARGE_TEXT_FILE_BYTES) {
      pagedFileInfo.value = effectiveInfo
      const chunkSize = getTextChunkSize()
      const targetOffset = info.size * initialProgress
      const chunkOffset = Math.max(0, Math.floor(Math.max(0, targetOffset - 1) / chunkSize) * chunkSize)
      const chunkProgress = Math.max(0, Math.min(1, (targetOffset - chunkOffset) / chunkSize))
      await loadTextChunkAtOffset(chunkOffset, {
        requestId
      })
      if (requestId !== loadRequestId) {
        return
      }

      state.value = 'ready'
      await scrollViewportToProgress(chunkProgress)
      return
    }

    const text = await window.api.dialog.readTextFile(targetFilePath, effectiveEncoding)
    if (requestId !== loadRequestId) {
      return
    }

    if (text === null) {
      throw new Error('无法读取文本文件')
    }

    content.value = text
    state.value = 'ready'
    await scrollToProgress(initialProgress)
  } catch (error) {
    if (requestId !== loadRequestId) {
      return
    }

    errorMessage.value = error instanceof Error ? error.message : '加载文本失败'
    state.value = 'error'
  }
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
    void loadText()
  },
  { immediate: true }
)

watch(
  () => props.initialProgress,
  () => {
    if (props.show && state.value === 'ready' && !isPagedMode.value) {
      void restoreProgress()
    }
  }
)

watch(appIsDark, () => {
  selectedReaderBackground.value = ''
})

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

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  emitProgress()
  loadRequestId += 1
  resetReader()
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="text-reader"
    :mask-closable="true"
    :show-icon="false"
    :bordered="false"
    :closable="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="text-reader__shell" :style="readerThemeStyle">
      <div class="text-reader__toolbar">
        <div class="text-reader__title">
          <n-icon :component="BookOutline" />
          <span>{{ displayTitle }}</span>
          <span class="text-reader__progress">{{ progressText }}</span>
        </div>
        <div class="text-reader__actions">
          <div class="text-reader__encoding">
            <span>{{ textEncodingLabel }}</span>
            <n-select
              :value="selectedTextEncoding"
              :options="textEncodingOptions"
              size="small"
              class="text-reader__encoding-select"
              :consistent-menu-width="false"
              @update:value="handleTextEncodingChange"
            />
          </div>
          <div class="text-reader__palette" aria-label="阅读背景">
            <button
              type="button"
              class="text-reader__palette-auto"
              :class="{ 'text-reader__palette-auto--active': !selectedReaderBackground }"
              title="跟随主题"
              @click="selectReaderBackground('')"
            >
              跟随主题
            </button>
            <button
              v-for="color in readerBackgroundOptions"
              :key="color"
              type="button"
              class="text-reader__palette-button"
              :class="{ 'text-reader__palette-button--active': color === readerBodyBackground }"
              :style="{ backgroundColor: color }"
              @click="selectReaderBackground(color)"
            />
          </div>
          <div class="text-reader__font-tools">
            <n-button quaternary circle :disabled="fontSize <= 12" @click="decreaseFontSize">
              <template #icon>
                <n-icon :component="RemoveOutline" />
              </template>
            </n-button>
            <span>{{ fontSizeText }}</span>
            <n-button quaternary circle :disabled="fontSize >= 28" @click="increaseFontSize">
              <template #icon>
                <n-icon :component="AddOutline" />
              </template>
            </n-button>
          </div>
          <div v-if="isPagedMode" class="text-reader__page-tools">
            <n-button quaternary circle :disabled="!currentChunk?.hasPrevious" @click="goPreviousPage">
              <template #icon>
                <n-icon :component="ChevronBackOutline" />
              </template>
            </n-button>
            <n-button quaternary circle :disabled="!currentChunk?.hasNext" @click="goNextPage">
              <template #icon>
                <n-icon :component="ChevronForwardOutline" />
              </template>
            </n-button>
          </div>
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

      <div class="text-reader__body">
        <div v-if="state === 'loading'" class="text-reader__state">加载中</div>
        <div v-else-if="state === 'error'" class="text-reader__state text-reader__state--error">
          {{ errorMessage }}
        </div>
        <div
          v-show="state === 'ready'"
          ref="viewportRef"
          class="text-reader__viewport"
          @scroll="scheduleProgressSave"
          @wheel="handlePagedWheel"
        >
          <article
            v-if="isMarkdown"
            class="text-reader__content text-reader__content--markdown"
            :style="contentStyle"
            v-html="renderedMarkdown"
          />
          <pre v-else class="text-reader__content" :style="contentStyle">{{ content }}</pre>
        </div>
      </div>

      <div class="text-reader__footer">
        <n-slider
          :value="progress"
          :min="0"
          :max="1"
          :step="0.001"
          :tooltip="false"
          class="text-reader__slider"
          @update:value="handleProgressUpdate"
          @dragend="handleProgressCommit(progress)"
        />
        <span class="text-reader__footer-progress">{{ progressText }}</span>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
:global(.n-card.n-modal.text-reader) {
  width: 94vw !important;
  max-width: 1440px;
  border-radius: 8px;
}

.text-reader :deep(.n-card__content) {
  padding: 0;
}

.text-reader__shell {
  height: min(90vh, 980px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  color: var(--reader-text-color);
  background: var(--reader-shell-bg);
}

.text-reader__toolbar {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--reader-border-color);
  box-sizing: border-box;
}

.text-reader__title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
}

.text-reader__title span:not(.text-reader__progress) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-reader__progress {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 500;
  opacity: 0.68;
}

.text-reader__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-reader__encoding {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.text-reader__encoding span {
  max-width: 94px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  opacity: 0.72;
}

.text-reader__encoding-select {
  width: 112px;
}

.text-reader__palette {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.text-reader__palette-button {
  width: 20px;
  height: 20px;
  border: 1px solid var(--reader-border-color);
  border-radius: 6px;
  padding: 0;
  box-sizing: border-box;
  cursor: pointer;
}

.text-reader__palette-auto {
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

.text-reader__palette-auto--active,
.text-reader__palette-button--active {
  border-color: rgba(99, 226, 183, 0.9);
  box-shadow: 0 0 0 2px rgba(99, 226, 183, 0.35);
}

.text-reader__font-tools,
.text-reader__page-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.text-reader__font-tools span {
  min-width: 38px;
  font-size: 12px;
  text-align: center;
  opacity: 0.72;
}

.text-reader__body {
  position: relative;
  min-height: 0;
  background: var(--reader-body-bg);
}

.text-reader__state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  opacity: 0.72;
}

.text-reader__state--error {
  color: #e88080;
}

.text-reader__viewport {
  width: 100%;
  height: 100%;
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.text-reader__viewport::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.text-reader__content {
  max-width: 1120px;
  min-height: 100%;
  margin: 0 auto;
  padding: 34px 42px 56px;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  line-height: 1.9;
  color: var(--reader-text-color);
}

.text-reader__content--markdown {
  white-space: normal;
}

.text-reader__content--markdown :deep(h1),
.text-reader__content--markdown :deep(h2),
.text-reader__content--markdown :deep(h3),
.text-reader__content--markdown :deep(h4),
.text-reader__content--markdown :deep(h5),
.text-reader__content--markdown :deep(h6) {
  margin: 1.3em 0 0.7em;
  line-height: 1.35;
  font-weight: 700;
}

.text-reader__content--markdown :deep(h1) {
  font-size: 1.9em;
}

.text-reader__content--markdown :deep(h2) {
  font-size: 1.55em;
}

.text-reader__content--markdown :deep(h3) {
  font-size: 1.25em;
}

.text-reader__content--markdown :deep(p),
.text-reader__content--markdown :deep(ul),
.text-reader__content--markdown :deep(ol),
.text-reader__content--markdown :deep(blockquote),
.text-reader__content--markdown :deep(pre),
.text-reader__content--markdown :deep(table) {
  margin: 0 0 1em;
}

.text-reader__content--markdown :deep(ul),
.text-reader__content--markdown :deep(ol) {
  padding-left: 1.6em;
}

.text-reader__content--markdown :deep(li + li) {
  margin-top: 0.3em;
}

.text-reader__content--markdown :deep(a) {
  color: var(--reader-link-color);
  text-decoration: none;
}

.text-reader__content--markdown :deep(a:hover) {
  text-decoration: underline;
}

.text-reader__content--markdown :deep(blockquote) {
  padding: 0.9em 1.1em;
  border-left: 3px solid rgba(125, 232, 196, 0.6);
  background: var(--reader-block-bg);
  color: var(--reader-text-color);
}

.text-reader__content--markdown :deep(code) {
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background: var(--reader-code-bg);
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.92em;
}

.text-reader__content--markdown :deep(pre) {
  padding: 1em 1.1em;
  border-radius: 8px;
  overflow: auto;
  background: var(--reader-pre-bg);
}

.text-reader__content--markdown :deep(pre code) {
  padding: 0;
  background: transparent;
}

.text-reader__content--markdown :deep(hr) {
  border: 0;
  border-top: 1px solid var(--reader-border-strong-color);
  margin: 1.5em 0;
}

.text-reader__content--markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.text-reader__content--markdown :deep(th),
.text-reader__content--markdown :deep(td) {
  padding: 0.6em 0.75em;
  border: 1px solid var(--reader-border-color);
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}

.text-reader__content--markdown :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

.text-reader__footer {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  border-top: 1px solid var(--reader-border-color);
  box-sizing: border-box;
}

.text-reader__slider {
  flex: 1 1 auto;
  min-width: 0;
}

.text-reader__footer-progress {
  flex: 0 0 auto;
  min-width: 44px;
  font-size: 12px;
  text-align: right;
  opacity: 0.72;
}

@media (max-width: 900px) {
  :global(.n-card.n-modal.text-reader) {
    width: 94vw !important;
  }

  .text-reader__toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .text-reader__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .text-reader__content {
    padding: 24px 18px 42px;
  }
}
</style>
