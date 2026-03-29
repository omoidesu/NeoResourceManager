<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Icon, addCollection } from '@iconify/vue'
import mdiIcons from '@iconify-json/mdi/icons.json'

addCollection(mdiIcons)

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  }
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const markdownValue = ref('')
const isMarkdownMode = ref(false)
const textColor = ref('#ffffff')
const backgroundColor = ref('#2a2a2a')
const fontFamily = ref('Arial')
const fontSize = ref('3')
const savedRange = ref<Range | null>(null)
const showLinkModal = ref(false)
const showTableModal = ref(false)
const linkValue = ref('')
const linkTextValue = ref('')
const tableRows = ref(2)
const tableCols = ref(2)
const activeFormats = ref({
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  unorderedList: false,
  orderedList: false,
  justifyLeft: false,
  justifyCenter: false,
  justifyRight: false,
  justifyFull: false
})

const activeButtonStyle = {
  background: 'rgba(99, 226, 183, 0.16)',
  borderColor: 'rgba(99, 226, 183, 0.45)',
  color: '#63e2b7'
}

const getButtonStyle = (active: boolean) => (active ? activeButtonStyle : undefined)

const normalizeHtml = (value: string) => String(value ?? '').trim()

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const decodeHtmlEntities = (value: string) => {
  if (!value) {
    return ''
  }

  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

const htmlToPlainText = (value: string) =>
  decodeHtmlEntities(
    String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  )

const renderInlineMarkdown = (value: string) =>
  value
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')

// Markdown mode stores plain text in the textarea, but the outer form still
// persists HTML so the detail drawer and viewer can render rich content directly.
const markdownToHtml = (value: string) => {
  const escaped = escapeHtml(String(value ?? ''))
  const blocks = escaped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trimEnd())

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      return `<ul>${lines.map((line) => `<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`
    }

    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      return `<ol>${lines.map((line) => `<li>${renderInlineMarkdown(line.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`
    }

    if (lines.every((line) => /^>\s?/.test(line))) {
      return `<blockquote>${lines.map((line) => renderInlineMarkdown(line.replace(/^>\s?/, ''))).join('<br>')}</blockquote>`
    }

    const firstLine = lines[0] ?? ''
    if (/^###\s+/.test(firstLine)) {
      return `<h3>${renderInlineMarkdown(firstLine.replace(/^###\s+/, ''))}</h3>`
    }

    if (/^##\s+/.test(firstLine)) {
      return `<h2>${renderInlineMarkdown(firstLine.replace(/^##\s+/, ''))}</h2>`
    }

    if (/^#\s+/.test(firstLine)) {
      return `<h1>${renderInlineMarkdown(firstLine.replace(/^#\s+/, ''))}</h1>`
    }

    return `<p>${lines.map((line) => renderInlineMarkdown(line)).join('<br>')}</p>`
  }).join('')
}

const fontFamilyOptions = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Times', value: 'Times New Roman' },
  { label: 'Verdana', value: 'Verdana' },
  { label: 'Courier', value: 'Courier New' }
]

const fontSizeOptions = [
  { label: '12', value: '2' },
  { label: '14', value: '3' },
  { label: '18', value: '4' },
  { label: '24', value: '5' },
  { label: '32', value: '6' }
]

const syncEditorContent = (value: string) => {
  if (!editorRef.value) {
    return
  }

  const nextValue = normalizeHtml(value)
  if (editorRef.value.innerHTML !== nextValue) {
    editorRef.value.innerHTML = nextValue
  }
}

const emitEditorContent = () => {
  if (!editorRef.value) {
    return
  }

  emit('update:modelValue', normalizeHtml(editorRef.value.innerHTML))
}

const canClear = computed(() => Boolean(normalizeHtml(props.modelValue)))

// Toolbar clicks move focus away from contenteditable. Cache the current range
// so commands like insert link/table can still apply to the original cursor.
const captureSelection = () => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !editorRef.value) {
    return
  }

  const range = selection.getRangeAt(0)
  const commonNode = range.commonAncestorContainer
  const rootNode = editorRef.value
  const isInsideEditor = commonNode === rootNode || rootNode.contains(commonNode)

  if (isInsideEditor) {
    savedRange.value = range.cloneRange()
  }
}

const restoreSelection = () => {
  if (!savedRange.value) {
    return
  }

  const selection = window.getSelection()
  if (!selection) {
    return
  }

  selection.removeAllRanges()
  selection.addRange(savedRange.value)
}

// Preventing the default mousedown keeps the editor selection alive while the
// user clicks toolbar buttons.
const handleToolbarMouseDown = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (!target) {
    return
  }

  if (target.closest('.n-button')) {
    event.preventDefault()
    restoreSelection()
  }
}

const safeQueryCommandState = (command: string) => {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

const safeQueryCommandValue = (command: string) => {
  try {
    return String(document.queryCommandValue(command) ?? '')
  } catch {
    return ''
  }
}

const updateToolbarState = () => {
  if (isMarkdownMode.value) {
    return
  }

  activeFormats.value = {
    bold: safeQueryCommandState('bold'),
    italic: safeQueryCommandState('italic'),
    underline: safeQueryCommandState('underline'),
    strikeThrough: safeQueryCommandState('strikeThrough'),
    unorderedList: safeQueryCommandState('insertUnorderedList'),
    orderedList: safeQueryCommandState('insertOrderedList'),
    justifyLeft: safeQueryCommandState('justifyLeft'),
    justifyCenter: safeQueryCommandState('justifyCenter'),
    justifyRight: safeQueryCommandState('justifyRight'),
    justifyFull: safeQueryCommandState('justifyFull')
  }

  const nextFontName = safeQueryCommandValue('fontName').replace(/['"]/g, '').trim()
  if (nextFontName) {
    const matchedFont = fontFamilyOptions.find((item) => nextFontName.toLowerCase().includes(String(item.value).toLowerCase()))
    if (matchedFont) {
      fontFamily.value = String(matchedFont.value)
    }
  }

  const nextFontSize = safeQueryCommandValue('fontSize').trim()
  if (nextFontSize && fontSizeOptions.some((item) => item.value === nextFontSize)) {
    fontSize.value = nextFontSize
  }
}

const runCommand = (command: string, value = '') => {
  editorRef.value?.focus()
  restoreSelection()
  document.execCommand(command, false, value)
  emitEditorContent()
  captureSelection()
  updateToolbarState()
}

const applyTextColor = (value: string) => {
  textColor.value = value
  runCommand('foreColor', value)
}

const applyBackgroundColor = (value: string) => {
  backgroundColor.value = value
  runCommand('hiliteColor', value)
}

const applyFontFamily = (value: string | null) => {
  fontFamily.value = value ?? 'Arial'
  runCommand('fontName', fontFamily.value)
}

const applyFontSize = (value: string | null) => {
  fontSize.value = value ?? '3'
  runCommand('fontSize', fontSize.value)
}

const handleInsertLink = () => {
  restoreSelection()
  linkValue.value = ''
  linkTextValue.value = window.getSelection?.()?.toString().trim() ?? ''
  showLinkModal.value = true
}

const handleInsertTable = () => {
  restoreSelection()
  tableRows.value = 2
  tableCols.value = 2
  showTableModal.value = true
}

const confirmInsertLink = async () => {
  const url = linkValue.value.trim()
  const text = linkTextValue.value.trim()
  if (!url) {
    return
  }

  showLinkModal.value = false
  await nextTick()
  if (text) {
    runCommand('insertHTML', `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`)
    return
  }
  runCommand('createLink', url)
}

const confirmInsertTable = async () => {
  const rows = Math.max(1, Number(tableRows.value ?? 2))
  const cols = Math.max(1, Number(tableCols.value ?? 2))
  showTableModal.value = false
  await nextTick()

  const rowHtml = Array.from({ length: rows })
    .map(() => `<tr>${Array.from({ length: cols }).map(() => '<td>&nbsp;</td>').join('')}</tr>`)
    .join('')

  runCommand(
    'insertHTML',
    `<table border="1" style="border-collapse:collapse;width:100%;margin:8px 0;"><tbody>${rowHtml}</tbody></table>`
  )
}

const handleMarkdownInput = (value: string) => {
  markdownValue.value = value
  emit('update:modelValue', normalizeHtml(markdownToHtml(value)))
}

const toggleMarkdownMode = () => {
  isMarkdownMode.value = !isMarkdownMode.value

  if (isMarkdownMode.value) {
    markdownValue.value = htmlToPlainText(props.modelValue)
    return
  }

  emit('update:modelValue', normalizeHtml(markdownToHtml(markdownValue.value)))
  nextTick(() => {
    syncEditorContent(props.modelValue)
    updateToolbarState()
  })
}

const handleClear = () => {
  markdownValue.value = ''
  emit('update:modelValue', '')
  nextTick(() => {
    syncEditorContent('')
  })
}

onMounted(() => {
  syncEditorContent(props.modelValue)
  document.addEventListener('selectionchange', updateToolbarState)
  document.addEventListener('selectionchange', captureSelection)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', updateToolbarState)
  document.removeEventListener('selectionchange', captureSelection)
})

watch(
  () => props.modelValue,
  async (value) => {
    await nextTick()
    if (isMarkdownMode.value) {
      markdownValue.value = htmlToPlainText(value)
    } else {
      syncEditorContent(value)
      updateToolbarState()
    }
  }
)
</script>

<template>
  <div class="rich-text-editor">
    <div class="rich-text-editor__toolbar" @mousedown="handleToolbarMouseDown">
      <n-button-group>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.bold)" title="加粗" @click="runCommand('bold')"><Icon class="rich-text-editor__icon" icon="mdi:format-bold" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.italic)" title="斜体" @click="runCommand('italic')"><Icon class="rich-text-editor__icon" icon="mdi:format-italic" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.underline)" title="下划线" @click="runCommand('underline')"><Icon class="rich-text-editor__icon" icon="mdi:format-underline" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.strikeThrough)" title="删除线" @click="runCommand('strikeThrough')"><Icon class="rich-text-editor__icon" icon="mdi:format-strikethrough-variant" /></n-button>
      </n-button-group>
      <span class="rich-text-editor__divider">|</span>
      <label class="rich-text-editor__color-shell" title="文本颜色">
        <Icon class="rich-text-editor__icon" icon="mdi:format-color-text" />
        <input class="rich-text-editor__color" type="color" :value="textColor" @input="applyTextColor(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="rich-text-editor__color-shell" title="背景颜色">
        <Icon class="rich-text-editor__icon" icon="mdi:format-color-highlight" />
        <input class="rich-text-editor__color" type="color" :value="backgroundColor" @input="applyBackgroundColor(($event.target as HTMLInputElement).value)" />
      </label>
      <n-select size="small" class="rich-text-editor__select rich-text-editor__select--font" :value="fontFamily" :options="fontFamilyOptions" @update:value="applyFontFamily" />
      <n-select size="small" class="rich-text-editor__select rich-text-editor__select--size" :value="fontSize" :options="fontSizeOptions" @update:value="applyFontSize" />
      <n-button-group>
        <n-button quaternary size="small" class="rich-text-editor__button" title="链接" @click="handleInsertLink"><Icon class="rich-text-editor__icon" icon="mdi:link-variant" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" title="引用" @click="runCommand('formatBlock', '<blockquote>')"><Icon class="rich-text-editor__icon" icon="mdi:format-quote-open" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" title="代码" @click="runCommand('insertHTML', '<code>代码</code>')"><Icon class="rich-text-editor__icon" icon="mdi:code-tags" /></n-button>
      </n-button-group>
      <span class="rich-text-editor__divider">|</span>
      <n-button-group>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.unorderedList)" title="无序列表" @click="runCommand('insertUnorderedList')"><Icon class="rich-text-editor__icon" icon="mdi:format-list-bulleted" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.orderedList)" title="有序列表" @click="runCommand('insertOrderedList')"><Icon class="rich-text-editor__icon" icon="mdi:format-list-numbered" /></n-button>
      </n-button-group>
      <span class="rich-text-editor__divider">|</span>
      <n-button-group>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.justifyLeft)" title="左对齐" @click="runCommand('justifyLeft')"><Icon class="rich-text-editor__icon" icon="mdi:format-align-left" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.justifyCenter)" title="居中" @click="runCommand('justifyCenter')"><Icon class="rich-text-editor__icon" icon="mdi:format-align-center" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.justifyRight)" title="右对齐" @click="runCommand('justifyRight')"><Icon class="rich-text-editor__icon" icon="mdi:format-align-right" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(activeFormats.justifyFull)" title="两端对齐" @click="runCommand('justifyFull')"><Icon class="rich-text-editor__icon" icon="mdi:format-align-justify" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" title="增加缩进" @click="runCommand('indent')"><Icon class="rich-text-editor__icon" icon="mdi:format-indent-increase" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" title="减少缩进" @click="runCommand('outdent')"><Icon class="rich-text-editor__icon" icon="mdi:format-indent-decrease" /></n-button>
      </n-button-group>
      <n-button-group>
        <n-button quaternary size="small" class="rich-text-editor__button" title="表格" @click="handleInsertTable"><Icon class="rich-text-editor__icon" icon="mdi:table-large" /></n-button>
        <n-button quaternary size="small" class="rich-text-editor__button" :style="getButtonStyle(isMarkdownMode)" title="Markdown" @click="toggleMarkdownMode"><Icon class="rich-text-editor__icon" icon="mdi:language-markdown-outline" /></n-button>
      </n-button-group>
      <span class="rich-text-editor__divider">|</span>
      <n-button quaternary size="small" class="rich-text-editor__button" title="清除格式" @click="runCommand('removeFormat')"><Icon class="rich-text-editor__icon" icon="mdi:format-clear" /></n-button>
      <n-button quaternary size="small" class="rich-text-editor__button" title="清空" :disabled="!canClear" @click="handleClear"><Icon class="rich-text-editor__icon" icon="mdi:trash-can-outline" /></n-button>
    </div>
    <n-input
      v-if="isMarkdownMode"
      type="textarea"
      :value="markdownValue"
      :placeholder="`${placeholder}（支持 Markdown）`"
      :autosize="{ minRows: 8, maxRows: 14 }"
      @update:value="handleMarkdownInput"
    />
    <div
      v-else
      ref="editorRef"
      class="rich-text-editor__content"
      :class="{ 'rich-text-editor__content--empty': !modelValue }"
      :data-placeholder="placeholder"
      contenteditable="true"
      @input="emitEditorContent"
      @mouseup="captureSelection"
      @keyup="captureSelection"
      @focus="captureSelection"
    />
  </div>
  <n-modal v-model:show="showLinkModal" preset="card" title="插入链接" style="width: 420px;">
    <n-space vertical>
      <n-input v-model:value="linkValue" placeholder="请输入链接地址" />
      <n-input v-model:value="linkTextValue" placeholder="请输入链接文字" />
      <n-space justify="end">
        <n-button @click="showLinkModal = false">取消</n-button>
        <n-button type="primary" :disabled="!linkValue.trim()" @click="confirmInsertLink">确认</n-button>
      </n-space>
    </n-space>
  </n-modal>
  <n-modal v-model:show="showTableModal" preset="card" title="插入表格" style="width: 420px;">
    <n-space vertical>
      <n-grid :cols="2" :x-gap="12">
        <n-form-item-gi label="行数">
          <n-input-number v-model:value="tableRows" :min="1" :max="20" style="width: 100%;" />
        </n-form-item-gi>
        <n-form-item-gi label="列数">
          <n-input-number v-model:value="tableCols" :min="1" :max="10" style="width: 100%;" />
        </n-form-item-gi>
      </n-grid>
      <n-space justify="end">
        <n-button @click="showTableModal = false">取消</n-button>
        <n-button type="primary" @click="confirmInsertTable">确认</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<style scoped>
.rich-text-editor {
  width: 100%;
}

.rich-text-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
}

.rich-text-editor__divider {
  color: rgba(127, 127, 127, 0.75);
}

.rich-text-editor__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.rich-text-editor__color-shell {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border: 1px solid rgba(127, 127, 127, 0.24);
  border-radius: 6px;
  cursor: pointer;
}

.rich-text-editor__color {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.rich-text-editor__select {
  min-width: 88px;
}

.rich-text-editor__select--font {
  width: 108px;
}

.rich-text-editor__select--size {
  width: 76px;
}

.rich-text-editor__content {
  min-height: 160px;
  max-height: 320px;
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid rgba(127, 127, 127, 0.24);
  border-radius: 6px;
  outline: none;
  line-height: 1.7;
  white-space: normal;
  word-break: break-word;
  background: rgba(255, 255, 255, 0.02);
}

.rich-text-editor__content:focus {
  border-color: #63e2b7;
}

.rich-text-editor__content--empty::before {
  content: attr(data-placeholder);
  color: rgba(127, 127, 127, 0.8);
}

.rich-text-editor__content :deep(p) {
  margin: 0 0 0.75em;
}

.rich-text-editor__content :deep(p:last-child) {
  margin-bottom: 0;
}

.rich-text-editor__content :deep(ul),
.rich-text-editor__content :deep(ol) {
  padding-left: 1.4em;
  margin: 0.5em 0;
}

.rich-text-editor__content :deep(a) {
  color: #63e2b7;
}
</style>
