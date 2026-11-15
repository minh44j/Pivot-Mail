import type { Attachment } from '../types'
import { formatSize } from '../util'

/**
 * SAMPLE attachment content. The real app will fetch attachment bytes from Gmail.
 * Here every file is generated in the browser so Preview, Download and Copy can be tried.
 */

export type PreviewKind = 'pdf' | 'image' | 'text' | 'none'

export function previewKind(a: Attachment): PreviewKind {
  if (a.mime === 'application/pdf') return 'pdf'
  if (/^image\/(png|jpe?g|gif|webp)$/.test(a.mime)) return 'image'
  if (a.mime === 'text/plain') return 'text'
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

export function mockBytes(a: Attachment): Uint8Array {
  const lines = ['Pivot Mail sample attachment', a.name, formatSize(a.size), 'Sample content for previewing only.']
  if (a.mime === 'application/pdf') return samplePdf(lines)
  return new TextEncoder().encode(lines.join('\n'))
}

export function mockBlob(a: Attachment): Blob {
  return new Blob([mockBytes(a) as BlobPart], { type: a.mime })
}
