import path from 'path'
import { readFile } from 'fs/promises'
import { pathToFileURL } from 'url'
import { BrowserWindow } from 'electron'
import sharp from 'sharp'
import JSZip from 'jszip'

export type NovelFileAnalysis = {
  isbn: string
  coverDataUrl: string
}

const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'epub', 'mobi', 'azw', 'azw3', 'pdf'])
const EMBEDDED_EBOOK_EXTENSIONS = new Set(['epub', 'mobi', 'azw', 'azw3'])
const PDF_COVER_TARGET_WIDTH = 720

const getExtension = (filePath: string) => {
  return path.extname(String(filePath ?? '').trim()).replace(/^\./, '').toLowerCase()
}

export const canAnalyzeNovelFile = (filePath: string) => SUPPORTED_EXTENSIONS.has(getExtension(filePath))

const emptyAnalysis = (): NovelFileAnalysis => ({
  isbn: '',
  coverDataUrl: ''
})

const normalizeZipPath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '')

const resolveZipPath = (basePath: string, href: string) => {
  const normalizedHref = normalizeZipPath(decodeURIComponent(String(href ?? '').trim()))
  if (!normalizedHref) {
    return ''
  }

  const baseDir = normalizeZipPath(path.posix.dirname(normalizeZipPath(basePath)))
  return normalizeZipPath(path.posix.normalize(path.posix.join(baseDir === '.' ? '' : baseDir, normalizedHref)))
}

const decodeXmlText = (value: string) => String(value ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')
  .trim()

const normalizeIsbnText = (value: string) => value.replace(/[\s-]/g, '').toUpperCase()

const isValidIsbnShape = (value: string, requireIsbn13 = false) => {
  if (/^97[89]\d{10}$/.test(value)) {
    return true
  }

  return !requireIsbn13 && /^\d{9}[\dX]$/.test(value)
}

const extractIsbnFromText = (
  text: string,
  options: { requireLabel?: boolean; requireIsbn13?: boolean } = {}
) => {
  const normalizedText = String(text ?? '').trim()
  if (!normalizedText) {
    return ''
  }

  const prefixedText = normalizedText.replace(/^urn:isbn:/i, 'ISBN:')
  const sourceText = options.requireLabel && !/(?:^|[^a-z])isbn(?:-1[03])?\s*[:：]?/i.test(prefixedText)
    ? ''
    : prefixedText

  if (!sourceText) {
    return ''
  }

  const matches = sourceText.match(/[0-9Xx][0-9Xx\s-]{8,24}[0-9Xx]/g) ?? []
  for (const match of matches) {
    const isbn = normalizeIsbnText(match)
    if (isValidIsbnShape(isbn, options.requireIsbn13)) {
      return isbn
    }
  }

  return ''
}

const bufferToDataUrl = (buffer: Buffer, mimeType: string) => {
  if (!buffer.length || !mimeType) {
    return ''
  }

  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

const imageBufferToCoverDataUrl = async (buffer: Buffer) => {
  if (!buffer.length) {
    return ''
  }

  try {
    const resizedBuffer = await sharp(buffer)
      .resize({ width: PDF_COVER_TARGET_WIDTH, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    return bufferToDataUrl(resizedBuffer, 'image/png')
  } catch {
    return ''
  }
}

const readZipText = async (zip: JSZip, zipPath: string) => {
  const file = zip.file(normalizeZipPath(zipPath))
  if (!file) {
    return ''
  }

  return file.async('text')
}

const findPackagePath = async (zip: JSZip) => {
  const containerXml = await readZipText(zip, 'META-INF/container.xml')
  const rootfileMatch = containerXml.match(/<rootfile\b[^>]*\bfull-path=["']([^"']+)["'][^>]*>/i)
  return normalizeZipPath(rootfileMatch?.[1] ?? 'content.opf')
}

const parseAttributes = (value: string) => {
  const attrs: Record<string, string> = {}
  for (const match of String(value ?? '').matchAll(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1].toLowerCase()] = decodeXmlText(match[2])
  }

  return attrs
}

const extractEpubIsbn = (opfXml: string) => {
  const identifierCandidates: Array<{ text: string; requireIsbn13?: boolean }> = []

  for (const match of opfXml.matchAll(/<[^>]*:?identifier\b([^>]*)>([\s\S]*?)<\/[^>]*:?identifier>/gi)) {
    const attrs = parseAttributes(match[1])
    const text = decodeXmlText(match[2])
    const labeled = /isbn/i.test(`${attrs.scheme ?? ''} ${attrs['opf:scheme'] ?? ''} ${attrs['identifier-type'] ?? ''} ${text}`)
    identifierCandidates.push({
      text,
      requireIsbn13: !labeled
    })
  }

  for (const candidate of identifierCandidates) {
    const isbn = extractIsbnFromText(candidate.text, { requireIsbn13: candidate.requireIsbn13 })
    if (isbn) {
      return isbn
    }
  }

  for (const match of opfXml.matchAll(/<(?:[^>]*:?description|[^>]*:?subject|[^>]*:?source)\b[^>]*>([\s\S]*?)<\/[^>]+>/gi)) {
    const isbn = extractIsbnFromText(decodeXmlText(match[1]), { requireLabel: true })
    if (isbn) {
      return isbn
    }
  }

  return ''
}

const findEpubCoverPath = (opfXml: string, packagePath: string) => {
  const manifestItems: Array<{ id: string; href: string; mediaType: string; properties: string }> = []
  for (const match of opfXml.matchAll(/<item\b([^>]*?)\/?>/gi)) {
    const attrs = parseAttributes(match[1])
    if (attrs.href) {
      manifestItems.push({
        id: attrs.id ?? '',
        href: attrs.href,
        mediaType: attrs['media-type'] ?? '',
        properties: attrs.properties ?? ''
      })
    }
  }

  const coverId = opfXml.match(/<meta\b[^>]*\bname=["']cover["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/i)?.[1]
  const coverItem = manifestItems.find((item) => item.id === coverId)
    ?? manifestItems.find((item) => /\bcover-image\b/i.test(item.properties))
    ?? manifestItems.find((item) => /cover/i.test(`${item.id} ${item.href}`) && /^image\//i.test(item.mediaType))

  return coverItem?.href ? resolveZipPath(packagePath, coverItem.href) : ''
}

const analyzeEpubFile = async (filePath: string): Promise<NovelFileAnalysis> => {
  const buffer = await readFile(filePath)
  const zip = await JSZip.loadAsync(buffer)
  const packagePath = await findPackagePath(zip)
  const opfXml = await readZipText(zip, packagePath)
  if (!opfXml) {
    return emptyAnalysis()
  }

  const coverPath = findEpubCoverPath(opfXml, packagePath)
  const coverFile = coverPath ? zip.file(coverPath) : null
  const coverBuffer = coverFile ? await coverFile.async('nodebuffer') : null

  return {
    isbn: extractEpubIsbn(opfXml),
    coverDataUrl: coverBuffer ? await imageBufferToCoverDataUrl(coverBuffer) : ''
  }
}

const readUInt32BE = (buffer: Buffer, offset: number) => {
  if (offset < 0 || offset + 4 > buffer.length) {
    return 0
  }

  return buffer.readUInt32BE(offset)
}

const getPdbRecordOffsets = (buffer: Buffer) => {
  if (buffer.length < 78) {
    return []
  }

  const recordCount = buffer.readUInt16BE(76)
  const offsets: number[] = []
  for (let i = 0; i < recordCount; i += 1) {
    const entryOffset = 78 + i * 8
    if (entryOffset + 4 <= buffer.length) {
      const recordOffset = buffer.readUInt32BE(entryOffset)
      if (recordOffset > 0 && recordOffset < buffer.length) {
        offsets.push(recordOffset)
      }
    }
  }

  return offsets
}

const getRecordBuffer = (buffer: Buffer, offsets: number[], index: number) => {
  const start = offsets[index]
  if (start === undefined) {
    return null
  }

  const end = offsets[index + 1] ?? buffer.length
  return buffer.subarray(start, Math.max(start, end))
}

const decodeMobiText = (buffer: Buffer, encoding: number) => {
  const label = encoding === 65001 ? 'utf-8' : encoding === 1252 ? 'windows-1252' : 'utf-8'
  try {
    return new TextDecoder(label).decode(buffer)
  } catch {
    return buffer.toString('utf8')
  }
}

const parseExth = (record: Buffer, mobiLength: number, encoding: number) => {
  const exthOffset = 16 + mobiLength
  if (exthOffset + 12 > record.length || record.subarray(exthOffset, exthOffset + 4).toString('ascii') !== 'EXTH') {
    return {}
  }

  const exthLength = readUInt32BE(record, exthOffset + 4)
  const count = readUInt32BE(record, exthOffset + 8)
  const end = Math.min(record.length, exthOffset + exthLength)
  const result: Record<string, string | number> = {}
  let offset = exthOffset + 12

  for (let i = 0; i < count && offset + 8 <= end; i += 1) {
    const type = readUInt32BE(record, offset)
    const length = readUInt32BE(record, offset + 4)
    if (length < 8 || offset + length > end) {
      break
    }

    const data = record.subarray(offset + 8, offset + length)
    if (type === 104) {
      result.isbn = decodeMobiText(data, encoding).trim()
    } else if (type === 201) {
      result.coverOffset = data.length >= 4 ? data.readUInt32BE(0) : 0
    } else if (type === 202) {
      result.thumbnailOffset = data.length >= 4 ? data.readUInt32BE(0) : 0
    } else if (type === 121) {
      result.boundary = data.length >= 4 ? data.readUInt32BE(0) : 0xffffffff
    }

    offset += length
  }

  return result
}

const parseMobiHeader = (record: Buffer) => {
  if (record.length < 144 || record.subarray(16, 20).toString('ascii') !== 'MOBI') {
    return null
  }

  const mobiLength = readUInt32BE(record, 20)
  const encoding = readUInt32BE(record, 28)
  const resourceStart = readUInt32BE(record, 108)
  return {
    mobiLength,
    encoding,
    resourceStart,
    exth: parseExth(record, mobiLength, encoding)
  }
}

const analyzeMobiFile = async (filePath: string): Promise<NovelFileAnalysis> => {
  const buffer = await readFile(filePath)
  const offsets = getPdbRecordOffsets(buffer)
  const firstRecord = getRecordBuffer(buffer, offsets, 0)
  const firstHeader = firstRecord ? parseMobiHeader(firstRecord) : null
  if (!firstHeader) {
    return emptyAnalysis()
  }

  const boundary = Number(firstHeader.exth.boundary ?? 0xffffffff)
  const boundaryRecord = Number.isFinite(boundary) && boundary > 0 && boundary < offsets.length
    ? getRecordBuffer(buffer, offsets, boundary)
    : null
  const preferredHeader = boundaryRecord ? parseMobiHeader(boundaryRecord) ?? firstHeader : firstHeader
  const isbn = extractIsbnFromText(String(preferredHeader.exth.isbn ?? firstHeader.exth.isbn ?? ''))
  const coverOffset = Number(preferredHeader.exth.coverOffset ?? preferredHeader.exth.thumbnailOffset ?? firstHeader.exth.coverOffset ?? firstHeader.exth.thumbnailOffset ?? -1)
  const resourceStart = Number(preferredHeader.resourceStart || firstHeader.resourceStart)
  const coverRecord = Number.isFinite(coverOffset) && coverOffset >= 0 && Number.isFinite(resourceStart)
    ? getRecordBuffer(buffer, offsets, resourceStart + coverOffset)
    : null

  return {
    isbn,
    coverDataUrl: coverRecord ? await imageBufferToCoverDataUrl(coverRecord) : ''
  }
}

const analyzePdfFile = async (filePath: string): Promise<NovelFileAnalysis> => {
  const coverDataUrl = await renderPdfCoverWithSharp(filePath) || await renderPdfCoverWithPdfJs(filePath)

  return {
    isbn: '',
    coverDataUrl
  }
}

const renderPdfCoverWithSharp = async (filePath: string) => {
  try {
    const coverBuffer = await sharp(filePath, {
      page: 0,
      pages: 1,
      density: 144
    })
      .resize({ width: PDF_COVER_TARGET_WIDTH, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()

    return bufferToDataUrl(coverBuffer, 'image/png')
  } catch {
    return ''
  }
}

const renderPdfCoverWithPdfJs = async (filePath: string) => {
  let window: BrowserWindow | null = null

  try {
    const pdfModuleUrl = pathToFileURL(require.resolve('pdfjs-dist/build/pdf.mjs')).href
    const pdfWorkerUrl = pathToFileURL(require.resolve('pdfjs-dist/build/pdf.worker.mjs')).href

    window = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
        webSecurity: false,
        offscreen: true
      }
    })

    await window.loadURL('about:blank')

    const dataUrl = await window.webContents.executeJavaScript(`
      (async () => {
        const fs = require('fs')
        const pdfjs = await import(${JSON.stringify(pdfModuleUrl)})
        pdfjs.GlobalWorkerOptions.workerSrc = ${JSON.stringify(pdfWorkerUrl)}

        const sourceBuffer = fs.readFileSync(${JSON.stringify(filePath)})
        const data = new Uint8Array(
          sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength)
        )
        const loadingTask = pdfjs.getDocument({ data })
        const pdfDocument = await loadingTask.promise

        try {
          const page = await pdfDocument.getPage(1)
          const baseViewport = page.getViewport({ scale: 1 })
          const scale = Math.min(2, ${PDF_COVER_TARGET_WIDTH} / baseViewport.width)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)

          const context = canvas.getContext('2d')
          if (!context) {
            return ''
          }

          await page.render({ canvasContext: context, viewport }).promise
          return canvas.toDataURL('image/png')
        } finally {
          await pdfDocument.destroy()
        }
      })()
    `)

    return typeof dataUrl === 'string' ? dataUrl : ''
  } catch {
    return ''
  } finally {
    if (window && !window.isDestroyed()) {
      window.destroy()
    }
  }
}

export const analyzeNovelFile = async (filePath: string): Promise<NovelFileAnalysis> => {
  const normalizedPath = path.normalize(String(filePath ?? '').trim())
  const extension = getExtension(normalizedPath)
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return emptyAnalysis()
  }

  if (extension === 'pdf') {
    return analyzePdfFile(normalizedPath)
  }

  if (extension === 'epub') {
    return analyzeEpubFile(normalizedPath)
  }

  if (EMBEDDED_EBOOK_EXTENSIONS.has(extension)) {
    return analyzeMobiFile(normalizedPath)
  }

  return emptyAnalysis()
}


