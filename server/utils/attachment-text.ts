import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'

export type AttachmentTextStatus = 'indexed' | 'empty' | 'unsupported' | 'skipped' | 'failed'

export type AttachmentTextResult = {
  text: string
  status: AttachmentTextStatus
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const MAX_EXTRACTED_CHARACTERS = 200_000
const MAX_ARCHIVE_ENTRIES = 512
const MAX_ARCHIVE_TEXT_BYTES = 1024 * 1024
const MAX_PDF_PAGES = 100

class ExtractionLimitError extends Error {}

function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const codePoint = Number(digits)
      return codePoint > 0 && codePoint <= 0x10FFFF && !(codePoint >= 0xD800 && codePoint <= 0xDFFF)
        ? String.fromCodePoint(codePoint)
        : ' '
    })
    .replace(/&#x([\da-f]+);/gi, (_, digits: string) => {
      const codePoint = Number.parseInt(digits, 16)
      return codePoint > 0 && codePoint <= 0x10FFFF && !(codePoint >= 0xD800 && codePoint <= 0xDFFF)
        ? String.fromCodePoint(codePoint)
        : ' '
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function xmlToText(xml: string) {
  return decodeXmlEntities(xml.replace(/<[^>]*>/g, ' '))
}

function isWantedOfficePart(filename: string, entryName: string) {
  if (filename.toLocaleLowerCase('en-US').endsWith('.docx')) {
    return /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(entryName)
  }

  return /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(entryName)
}

export function isTextExtractableAttachment(filename: string, mimeType: string) {
  const normalizedFilename = filename.toLocaleLowerCase('en-US')
  const normalizedMimeType = mimeType.toLocaleLowerCase('en-US').split(';')[0]?.trim() || ''
  return normalizedMimeType === 'application/pdf' || normalizedFilename.endsWith('.pdf')
    || normalizedMimeType === 'text/plain' || normalizedMimeType === 'text/csv'
    || normalizedFilename.endsWith('.txt') || normalizedFilename.endsWith('.csv')
    || normalizedMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || normalizedFilename.endsWith('.docx')
    || normalizedMimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || normalizedFilename.endsWith('.xlsx')
}

async function extractOfficeParts(data: Uint8Array, filename: string) {
  const wantedParts = new Map<string, string>()
  const tasks: Promise<void>[] = []
  let entryCount = 0
  let totalTextBytes = 0

  const archive = new Unzip((file) => {
    entryCount += 1
    if (entryCount > MAX_ARCHIVE_ENTRIES) throw new ExtractionLimitError('Archive contains too many entries.')
    if (!isWantedOfficePart(filename, file.name)) return
    if (file.originalSize !== undefined && file.originalSize > MAX_ARCHIVE_TEXT_BYTES) {
      throw new ExtractionLimitError('Office XML part exceeds the extraction limit.')
    }

    tasks.push(new Promise<void>((resolve, reject) => {
      const chunks: Uint8Array[] = []
      let partBytes = 0
      file.ondata = (error, chunk, final) => {
        if (error) {
          reject(error)
          return
        }
        partBytes += chunk.byteLength
        totalTextBytes += chunk.byteLength
        if (partBytes > MAX_ARCHIVE_TEXT_BYTES || totalTextBytes > MAX_ARCHIVE_TEXT_BYTES) {
          file.terminate()
          reject(new ExtractionLimitError('Office XML exceeds the extraction limit.'))
          return
        }
        chunks.push(chunk)
        if (final) {
          const bytes = new Uint8Array(partBytes)
          let offset = 0
          for (const part of chunks) {
            bytes.set(part, offset)
            offset += part.byteLength
          }
          wantedParts.set(file.name, decodeText(bytes))
          resolve()
        }
      }

      try {
        file.start()
      } catch (error) {
        reject(error)
      }
    }))
  })
  archive.register(UnzipPassThrough)
  archive.register(UnzipInflate)
  archive.push(data, true)
  await Promise.all(tasks)

  return [...wantedParts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, xml]) => xmlToText(xml))
    .join('\n')
}

function normalizeText(value: string) {
  return value
    .replaceAll('\u0000', ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EXTRACTED_CHARACTERS)
}

async function extractPdfText(data: Uint8Array) {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(data, { maxImageSize: 16_777_216 })
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new ExtractionLimitError('PDF contains too many pages.')
    const extracted = await extractText(pdf, { mergePages: true })
    return Array.isArray(extracted.text) ? extracted.text.join('\n') : extracted.text
  } finally {
    await pdf.loadingTask.destroy()
  }
}

export async function extractAttachmentText(input: {
  filename: string
  mimeType: string
  bytes: Uint8Array
}): Promise<AttachmentTextResult> {
  if (!input.bytes.byteLength) return { text: '', status: 'empty' }
  if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) return { text: '', status: 'skipped' }

  const filename = input.filename.toLocaleLowerCase('en-US')
  const mimeType = input.mimeType.toLocaleLowerCase('en-US').split(';')[0]?.trim() || ''

  try {
    let text: string
    if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
      text = await extractPdfText(input.bytes)
    } else if (mimeType === 'text/plain' || mimeType === 'text/csv' || filename.endsWith('.txt') || filename.endsWith('.csv')) {
      text = decodeText(input.bytes)
    } else if (isTextExtractableAttachment(filename, mimeType)) {
      text = await extractOfficeParts(input.bytes, filename)
    } else {
      return { text: '', status: 'unsupported' }
    }

    const normalizedText = normalizeText(text)
    return normalizedText
      ? { text: normalizedText, status: 'indexed' }
      : { text: '', status: 'empty' }
  } catch (error) {
    return { text: '', status: error instanceof ExtractionLimitError ? 'skipped' : 'failed' }
  }
}
