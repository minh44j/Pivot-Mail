import type { Attachment } from '../types'
import { formatSize } from '../util'

/**
 * SAMPLE attachment content. The real app will fetch attachment bytes from Gmail.
 * Here every file is generated in the browser so Preview, Download and Copy can be tried.
 */

export type PreviewKind = 'pdf' | 'image' | 'video' | 'audio' | 'text' | RichKind | 'none'
/** Shown by the sealed preview page (public preview.html, src/preview/main.ts). */
export type RichKind = 'word' | 'sheet' | 'slides' | 'mail' | 'outlook' | 'zip' | 'tiff'
export const RICH: ReadonlySet<PreviewKind> = new Set<PreviewKind>(['word', 'sheet', 'slides', 'mail', 'outlook', 'zip', 'tiff'])

/**
 * How an attachment is previewed: by its type, or by the name's ending when the type is unknown or generic (a file attached
 * from the computer often has none, and Gmail often says application/octet-stream). Every common office and mail format has a
 * preview (Minhaj 2026-11-22); the old binary .doc and .ppt formats and HEIC photos have none.
 */
export function previewKind(a: Attachment): PreviewKind {
  const ext = (/\.([a-z0-9]+)$/i.exec(a.name)?.[1] ?? '').toLowerCase()
  const t = a.mime.toLowerCase()
  if (t === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (/^image\/tiff?$/.test(t) || /^tiff?$/.test(ext)) return 'tiff'
  if (/^image\/(png|jpe?g|pjpeg|gif|webp|bmp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(t) || /^(png|jpe?g|jfif|gif|webp|bmp|avif|svg|ico)$/.test(ext)) return 'image'
  if (/wordprocessingml/.test(t) || /^(docx|docm|dotx)$/.test(ext)) return 'word'
  if (/spreadsheetml|ms-excel|opendocument\.spreadsheet|^text\/(csv|tab-separated-values)$/.test(t) || /^(xlsx|xlsm|xlsb|xls|ods|csv|tsv)$/.test(ext)) return 'sheet'
  if (/presentationml/.test(t) || /^(pptx|ppsx|pptm)$/.test(ext)) return 'slides'
  if (t === 'message/rfc822' || ext === 'eml') return 'mail'
  if (t === 'application/vnd.ms-outlook' || ext === 'msg') return 'outlook'
  if (/^application\/(x-)?zip(-compressed)?$/.test(t) || ext === 'zip') return 'zip'
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(t) || /^(mp4|m4v|webm|mov)$/.test(ext)) return 'video'
  if (/^audio\//.test(t) || /^(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/.test(ext)) return 'audio'
  if (/^text\//.test(t) || t === 'application/json' || t === 'application/xml' || /^(txt|log|json|md|xml|ics|vcf|html?)$/.test(ext)) return 'text'
  return 'none'
}

const esc = (s: string): string => s.replace(/[\\()]/g, (c) => `\\${c}`)

/** A tiny valid one-page PDF with a few lines of text. */
function samplePdf(lines: string[]): Uint8Array {
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 60 ${780 - i * 28} Td (${esc(l)}) Tj ET`).join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(out)
}

/** Real attachment bytes, fetched from Gmail once and kept for this session. */
const realBytes = new Map<string, Uint8Array>()

/** Makes sure a real attachment's bytes are available (sample attachments are generated on the spot). */
export async function ensureBytes(a: Attachment): Promise<void> {
  if (realBytes.has(a.id)) return
  // A file just attached in the composer: its own content, read from the computer.
  if (a.file) {
    realBytes.set(a.id, new Uint8Array(await a.file.arrayBuffer()))
    return
  }
  if (!a.source) return
  const { getAttachmentBytes } = await import('../gmail/client')
  realBytes.set(a.id, await getAttachmentBytes(a.source.accountId, a.source.messageId, a.source.attachmentId))
}

export const isReady = (a: Attachment): boolean => (!a.source && !a.file) || realBytes.has(a.id)

export function mockBytes(a: Attachment): Uint8Array {
  const real = realBytes.get(a.id)
  if (real) return real
  const lines = ['Pivot Mail sample attachment', a.name, formatSize(a.size), 'Sample content for previewing only.']
  if (a.mime === 'application/pdf') return samplePdf(lines)
  return new TextEncoder().encode(lines.join('\n'))
}

export function mockBlob(a: Attachment): Blob {
  return new Blob([mockBytes(a) as BlobPart], { type: a.mime })
}
