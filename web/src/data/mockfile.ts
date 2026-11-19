import type { Attachment } from '../types'
import { formatSize } from '../util'

/**
 * SAMPLE attachment content. The real app will fetch attachment bytes from Gmail.
 * Here every file is generated in the browser so Preview, Download and Copy can be tried.
 */

export type PreviewKind = 'pdf' | 'image' | 'text' | 'none'

export function previewKind(a: Attachment): PreviewKind {
  // By type, or by the name's ending when the type is unknown (a file attached from the computer often has none).
  const ext = (/\.([a-z0-9]+)$/i.exec(a.name)?.[1] ?? '').toLowerCase()
  if (a.mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (/^image\/(png|jpe?g|gif|webp|bmp)$/.test(a.mime) || /^(png|jpe?g|gif|webp|bmp)$/.test(ext)) return 'image'
  if (/^text\//.test(a.mime) || a.mime === 'application/json' || /^(txt|csv|log|json|md|xml|eml|ics)$/.test(ext)) return 'text'
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
