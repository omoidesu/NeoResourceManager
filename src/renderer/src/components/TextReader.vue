<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import {
  BookOutline,
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

const state = ref<ReaderState>('idle')
const content = ref('')
const errorMessage = ref('')
const viewportRef = ref<HTMLDivElement | null>(null)
const progress = ref(0)
const fontSize = ref(16)
const isSeeking = ref(false)
let loadRequestId = 0
let progressTimer: number | null = null

const normalizedFilePath = computed(() => String(props.filePath ?? '').trim())
const fileName = computed(() => normalizedFilePath.value.replace(/\\/g, '/').split('/').pop() ?? '')
const fileExtension = computed(() => String(fileName.value.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase())
const isMarkdown = computed(() => ['md', 'markdown'].includes(fileExtension.value))
const displayTitle = computed(() => props.title || fileName.value || '文本阅读')
const progressText = computed(
  () => `${Math.round(Math.max(0, Math.min(1, progress.value)) * 100)}%`
)
const fontSizeText = computed(() => `${fontSize.value}px`)
const contentStyle = computed(() => ({
  fontSize: `${fontSize.value}px`
}))
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

const resetReader = (): void => {
  clearProgressTimer()
  content.value = ''
  errorMessage.value = ''
  progress.value = Math.max(0, Math.min(1, Number(props.initialProgress ?? 0)))
  state.value = 'idle'
  if (viewportRef.value) {
    viewportRef.value.scrollTop = 0
  }
}

const loadText = async (): Promise<void> => {
  const requestId = ++loadRequestId
  resetReader()

  if (!props.show || !normalizedFilePath.value) {
    return
  }

  state.value = 'loading'

  try {
    const text = await window.api.dialog.readTextFile(normalizedFilePath.value)
    if (requestId !== loadRequestId) {
      return
    }

    if (text === null) {
      throw new Error('无法读取文本文件')
    }

    content.value = text
    state.value = 'ready'
    await restoreProgress()
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
    <div class="text-reader__shell">
      <div class="text-reader__toolbar">
        <div class="text-reader__title">
          <n-icon :component="BookOutline" />
          <span>{{ displayTitle }}</span>
          <span class="text-reader__progress">{{ progressText }}</span>
        </div>
        <div class="text-reader__actions">
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
  background: rgb(24, 25, 28);
}

.text-reader__toolbar {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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

.text-reader__font-tools {
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
  background: rgb(18, 19, 21);
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
  color: #7de8c4;
  text-decoration: none;
}

.text-reader__content--markdown :deep(a:hover) {
  text-decoration: underline;
}

.text-reader__content--markdown :deep(blockquote) {
  padding: 0.9em 1.1em;
  border-left: 3px solid rgba(125, 232, 196, 0.6);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.82);
}

.text-reader__content--markdown :deep(code) {
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.92em;
}

.text-reader__content--markdown :deep(pre) {
  padding: 1em 1.1em;
  border-radius: 8px;
  overflow: auto;
  background: rgba(0, 0, 0, 0.28);
}

.text-reader__content--markdown :deep(pre code) {
  padding: 0;
  background: transparent;
}

.text-reader__content--markdown :deep(hr) {
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
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
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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
