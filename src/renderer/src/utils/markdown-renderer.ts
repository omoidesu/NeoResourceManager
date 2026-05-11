import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { sanitizeRichHtml } from './rich-content-sanitizer'

type FootnoteDefinition = {
  key: string
  text: string
}

type MarkdownRenderOptions = {
  enableMath?: boolean
  enableMermaid?: boolean
  enableAbc?: boolean
}

const escapeHtml = (value: string) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const createPlaceholder = (type: string, index: number) => `NRM_${type}_${index}_PLACEHOLDER`

const extractFootnotes = (source: string) => {
  const definitions: FootnoteDefinition[] = []
  const content = source
    .split(/\r?\n/)
    .filter((line) => {
      const matchedDefinition = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(line)
      if (!matchedDefinition) {
        return true
      }

      definitions.push({
        key: matchedDefinition[1],
        text: matchedDefinition[2]
      })
      return false
    })
    .join('\n')

  return { content, definitions }
}

const extractMathBlocks = (source: string) => {
  const blocks: string[] = []
  let content = source.replace(/\$\$([\s\S]+?)\$\$/g, (_matched, mathContent: string) => {
    const index = blocks.push(mathContent.trim()) - 1
    return `\n\n${createPlaceholder('MATH_BLOCK', index)}\n\n`
  })

  content = content.replace(/\\begin\{align\}([\s\S]+?)\\end\{align\}/g, (_matched, mathContent: string) => {
    const index = blocks.push(`\\begin{align}${mathContent}\\end{align}`.trim()) - 1
    return `\n\n${createPlaceholder('MATH_BLOCK', index)}\n\n`
  })

  return { content, blocks }
}

const renderMath = (mathContent: string, displayMode: boolean) => {
  try {
    return katex.renderToString(mathContent, {
      displayMode,
      output: 'html',
      throwOnError: false,
      strict: false
    })
  } catch {
    return escapeHtml(mathContent)
  }
}

const renderFallbackMath = (mathContent: string, displayMode: boolean) => (
  displayMode
    ? `<div class="markdown-math-block">${escapeHtml(mathContent)}</div>`
    : `<span class="markdown-math-inline">${escapeHtml(mathContent)}</span>`
)

const restoreMathBlocks = (html: string, blocks: string[], options: MarkdownRenderOptions) =>
  blocks.reduce(
    (result, mathContent, index) =>
      result.replace(
        new RegExp(`<p>${createPlaceholder('MATH_BLOCK', index)}</p>`, 'g'),
        options.enableMath
          ? `<div class="markdown-math-block">${renderMath(mathContent, true)}</div>`
          : renderFallbackMath(mathContent, true)
      ),
    html
  )

const restoreInlineMath = (html: string, options: MarkdownRenderOptions) =>
  html.replace(/\$([^$\n]+)\$/g, (_matched, mathContent: string) => (
    options.enableMath
      ? `<span class="markdown-math-inline">${renderMath(mathContent, false)}</span>`
      : renderFallbackMath(mathContent, false)
  ))

const restoreStandaloneMathLines = (html: string, options: MarkdownRenderOptions) =>
  html.replace(/<p>((?:\\[a-zA-Z]+[\s\S]*?)(?:<br>\s*\\[a-zA-Z]+[\s\S]*?)*)<\/p>/g, (_matched, mathContent: string) => {
    const normalizedMathContent = mathContent.replace(/<br>/g, '\n')
    return options.enableMath
      ? `<div class="markdown-math-block">${renderMath(normalizedMathContent, true)}</div>`
      : renderFallbackMath(normalizedMathContent, true)
  })

const restoreFootnotes = (html: string, definitions: FootnoteDefinition[]) => {
  let footnoteIndex = 0
  let nextHtml = html.replace(/\[\^([^\]]+)]/g, (_matched, key: string) => {
    footnoteIndex += 1
    return `<sup class="markdown-footnote-ref">[${definitions.length ? footnoteIndex : escapeHtml(key)}]</sup>`
  })

  if (!definitions.length) {
    return nextHtml
  }

  const definitionItems = definitions
    .map((definition, index) => (
      `<li><sup>[${index + 1}]</sup> <span>${escapeHtml(definition.text || definition.key)}</span></li>`
    ))
    .join('')

  nextHtml += `<div class="markdown-footnotes"><ol>${definitionItems}</ol></div>`
  return nextHtml
}

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
})

markdown.inline.ruler.before('emphasis', 'mark', (state, silent) => {
  const start = state.pos
  const marker = state.src.slice(start, start + 2)
  if (marker !== '==') {
    return false
  }

  const end = state.src.indexOf('==', start + 2)
  if (end <= start + 2) {
    return false
  }

  if (!silent) {
    const openToken = state.push('mark_open', 'mark', 1)
    openToken.markup = '=='
    const textToken = state.push('text', '', 0)
    textToken.content = state.src.slice(start + 2, end)
    const closeToken = state.push('mark_close', 'mark', -1)
    closeToken.markup = '=='
  }

  state.pos = end + 2
  return true
})

markdown.core.ruler.after('inline', 'task_list', (state) => {
  const tokens = state.tokens
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type !== 'list_item_open') {
      continue
    }

    const paragraphOpen = tokens[index + 1]
    const inlineToken = tokens[index + 2]
    if (paragraphOpen?.type !== 'paragraph_open' || inlineToken?.type !== 'inline') {
      continue
    }

    const matchedTask = /^\[([ xX])\]\s+/.exec(inlineToken.content)
    if (!matchedTask) {
      continue
    }

    const checked = matchedTask[1].toLowerCase() === 'x'
    token.attrJoin('class', 'rich-text-editor-task-item')
    const listOpen = tokens.slice(0, index).reverse().find((item) => item.type === 'bullet_list_open')
    listOpen?.attrJoin('class', 'rich-text-editor-task-list')
    inlineToken.content = inlineToken.content.replace(/^\[[ xX]\]\s+/, '')
    const firstTextChild = inlineToken.children?.find((child) => child.type === 'text')
    if (firstTextChild) {
      firstTextChild.content = firstTextChild.content.replace(/^\[[ xX]\]\s+/, '')
    }
    inlineToken.children?.splice(0, 0, (() => {
      const markerToken = new state.Token('html_inline', '', 0)
      const markerClass = checked ? 'rich-text-editor-task-marker rich-text-editor-task-marker--checked' : 'rich-text-editor-task-marker'
      markerToken.content = `<span class="${markerClass}">${checked ? '✓' : ''}</span>`
      return markerToken
    })())
  }
})

markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0] ?? ''
  if (language.toLowerCase() === 'mermaid') {
    return `<div class="markdown-mermaid mermaid">${escapeHtml(token.content)}</div>`
  }

  if (language.toLowerCase() === 'abc') {
    return `<div class="markdown-abc">${escapeHtml(token.content)}</div>`
  }

  const languageClass = language ? ` language-${escapeHtml(language)}` : ''
  const languageLabel = language ? `<div class="markdown-code-language">${escapeHtml(language)}</div>` : ''
  return `<pre class="markdown-code-block${languageClass}">${languageLabel}<code>${escapeHtml(token.content)}</code></pre>`
}

export const renderMarkdownToHtml = (value: string, options: MarkdownRenderOptions = {}) => {
  const { content: withoutFootnoteDefinitions, definitions } = extractFootnotes(String(value ?? ''))
  const { content, blocks } = extractMathBlocks(withoutFootnoteDefinitions)
  const renderedHtml = markdown.render(content)
  const withMathBlocks = restoreMathBlocks(renderedHtml, blocks, options)
  const withInlineMath = restoreInlineMath(withMathBlocks, options)
  const withStandaloneMath = restoreStandaloneMathLines(withInlineMath, options)
  const withFootnotes = restoreFootnotes(withStandaloneMath, definitions)
  const sanitizedHtml = sanitizeRichHtml(withFootnotes)

  let nextHtml = sanitizedHtml

  if (!options.enableMermaid) {
    nextHtml = nextHtml.replace(/<div class="markdown-mermaid mermaid">([\s\S]*?)<\/div>/g, (_matched, mermaidContent: string) => (
      `<pre class="markdown-code-block language-mermaid"><div class="markdown-code-language">mermaid</div><code>${mermaidContent}</code></pre>`
    ))
  }

  if (!options.enableAbc) {
    nextHtml = nextHtml.replace(/<div class="markdown-abc">([\s\S]*?)<\/div>/g, (_matched, abcContent: string) => (
      `<pre class="markdown-code-block language-abc"><div class="markdown-code-language">abc</div><code>${abcContent}</code></pre>`
    ))
  }

  return nextHtml
}
