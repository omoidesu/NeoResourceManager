const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'font',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strike',
  'strong',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul'
])

const GLOBAL_ATTRIBUTES = new Set(['class', 'style', 'title'])
const LINK_PROTOCOL_PATTERN = /^(https?:|mailto:|tel:)/i
const SAFE_CLASS_PATTERN = /^[\w\s-]+$/
const SAFE_CSS_PROPERTIES = new Set([
  'background',
  'background-color',
  'border',
  'border-collapse',
  'border-color',
  'border-style',
  'border-width',
  'color',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'left',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-width',
  'min-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'position',
  'right',
  'text-align',
  'text-decoration',
  'top',
  'vertical-align',
  'white-space',
  'width'
])

const isSafeUrl = (value: string) => {
  const normalizedValue = String(value ?? '').trim()
  if (!normalizedValue) {
    return false
  }

  return normalizedValue.startsWith('#')
    || (normalizedValue.startsWith('/') && !normalizedValue.startsWith('//'))
    || LINK_PROTOCOL_PATTERN.test(normalizedValue)
}

const isSafeImageUrl = (value: string) => {
  const normalizedValue = String(value ?? '').trim()
  if (!normalizedValue) {
    return false
  }

  return (normalizedValue.startsWith('/') && !normalizedValue.startsWith('//'))
    || /^https?:/i.test(normalizedValue)
}

const sanitizeStyle = (value: string) => {
  const declarations = String(value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
  const safeDeclarations: string[] = []

  for (const declaration of declarations) {
    const separatorIndex = declaration.indexOf(':')
    if (separatorIndex <= 0) {
      continue
    }

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase()
    const propertyValue = declaration.slice(separatorIndex + 1).trim()
    if (!SAFE_CSS_PROPERTIES.has(property)) {
      continue
    }

    if (/expression\s*\(|url\s*\(|javascript:/i.test(propertyValue)) {
      continue
    }

    safeDeclarations.push(`${property}: ${propertyValue}`)
  }

  return safeDeclarations.join('; ')
}

const sanitizeAttributes = (sourceElement: Element, targetElement: Element) => {
  const tagName = sourceElement.tagName.toLowerCase()

  for (const attribute of Array.from(sourceElement.attributes)) {
    const name = attribute.name.toLowerCase()
    const value = attribute.value

    if (name.startsWith('on')) {
      continue
    }

    if (name === 'href' && tagName === 'a') {
      if (!isSafeUrl(value)) {
        continue
      }

      targetElement.setAttribute('href', value.trim())
      targetElement.setAttribute('target', '_blank')
      targetElement.setAttribute('rel', 'noopener noreferrer')
      continue
    }

    if (name === 'src' && tagName === 'img') {
      if (!isSafeImageUrl(value)) {
        continue
      }

      targetElement.setAttribute('src', value.trim())
      targetElement.setAttribute('loading', 'lazy')
      targetElement.setAttribute('decoding', 'async')
      targetElement.setAttribute('referrerpolicy', 'no-referrer')
      continue
    }

    if (name === 'target' || name === 'rel') {
      continue
    }

    if (name === 'style') {
      const safeStyle = sanitizeStyle(value)
      if (safeStyle) {
        targetElement.setAttribute('style', safeStyle)
      }
      continue
    }

    if (name === 'class') {
      if (SAFE_CLASS_PATTERN.test(value)) {
        targetElement.setAttribute('class', value)
      }
      continue
    }

    if (GLOBAL_ATTRIBUTES.has(name)) {
      targetElement.setAttribute(name, value)
      continue
    }

    if (tagName === 'font' && ['color', 'face', 'size'].includes(name)) {
      targetElement.setAttribute(name, value)
      continue
    }

    if (tagName === 'img' && ['alt', 'width', 'height'].includes(name)) {
      targetElement.setAttribute(name, value)
      continue
    }

    if (tagName === 'table' && ['border', 'cellpadding', 'cellspacing'].includes(name)) {
      targetElement.setAttribute(name, value)
    }
  }
}

const sanitizeNode = (sourceNode: Node, targetDocument: Document): Node | DocumentFragment | null => {
  if (sourceNode.nodeType === Node.TEXT_NODE) {
    return targetDocument.createTextNode(sourceNode.textContent ?? '')
  }

  if (sourceNode.nodeType !== Node.ELEMENT_NODE) {
    return null
  }

  const sourceElement = sourceNode as Element
  const tagName = sourceElement.tagName.toLowerCase()
  const targetChildren = Array.from(sourceElement.childNodes)
    .map((childNode) => sanitizeNode(childNode, targetDocument))
    .filter((childNode): childNode is Node | DocumentFragment => Boolean(childNode))

  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = targetDocument.createDocumentFragment()
    targetChildren.forEach((childNode) => fragment.appendChild(childNode))
    return fragment
  }

  const targetElement = targetDocument.createElement(tagName)
  sanitizeAttributes(sourceElement, targetElement)
  targetChildren.forEach((childNode) => targetElement.appendChild(childNode))
  return targetElement
}

export const sanitizeRichHtml = (value: string) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) {
    return ''
  }

  const template = document.createElement('template')
  template.innerHTML = rawValue
  const output = document.createElement('template')

  Array.from(template.content.childNodes).forEach((childNode) => {
    const sanitizedNode = sanitizeNode(childNode, document)
    if (sanitizedNode) {
      output.content.appendChild(sanitizedNode)
    }
  })

  return output.innerHTML.trim()
}
