/**
 * Attachment preview for Word, Excel, PowerPoint, attached mails (.eml, Outlook .msg), ZIP and TIFF (Minhaj 2026-11-22:
 * "I need all preview"). The files come from anyone who mails Pivot, so this page runs in a sealed frame
 * (<iframe sandbox="allow-scripts">, no allow-same-origin): it has its own empty origin, no cookies, no storage, no access to
 * Pivot Mail or its mail. A fault in one of the readers (one has had a cross-site scripting flaw) stays in here.
 * The file arrives once, from the page that opened this frame; this page only ever answers "shown" or "failed".
 */
import './preview.css'

export type RichKind = 'word' | 'sheet' | 'slides' | 'mail' | 'outlook' | 'zip' | 'tiff'

interface Job {
  type: 'pm-preview'
  kind: RichKind
  name: string
  bytes: ArrayBuffer
}

const out = document.getElementById('out') as HTMLElement
const MAX_ROWS = 2000
const MAX_PAGES = 30

function tell(state: 'shown' | 'failed', detail = ''): void {
  // The opener's origin cannot be named from inside the sealed frame; the message carries no data, only the outcome.
  window.parent.postMessage({ type: 'pm-preview-state', state, detail }, '*')
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

const size = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/* ---------------------------------------------------------------- Word (.docx) */
async function word(bytes: ArrayBuffer): Promise<void> {
  const { renderAsync } = await import('docx-preview')
  const box = el('div', 'docx-box')
  out.replaceChildren(box)
  await renderAsync(bytes, box, undefined, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, useBase64URL: true, renderHeaders: true, renderFooters: true, renderFootnotes: true })
}

/* ---------------------------------------------------------------- Excel (.xlsx .xls .xlsm .xlsb .ods .csv .tsv) */
async function sheet(bytes: ArrayBuffer, name: string): Promise<void> {
  const XLSX = await import('xlsx')
  const isText = /\.(csv|tsv|txt)$/i.test(name)
  // Text files are read as UTF-8 (Arabic names in a CSV stay readable); spreadsheets as they are.
  const wb = isText ? XLSX.read(new TextDecoder().decode(bytes), { type: 'string', sheetRows: MAX_ROWS + 1, raw: false, FS: /\.tsv$/i.test(name) ? '\t' : undefined }) : XLSX.read(new Uint8Array(bytes), { type: 'array', sheetRows: MAX_ROWS + 1, cellDates: true })
  const tabs = el('div', 'tabs')
  tabs.setAttribute('role', 'tablist')
  const view = el('div', 'sheet-view')
  const show = (i: number) => {
    const sheetName = wb.SheetNames[i] ?? ''
    const ws = wb.Sheets[sheetName]
    tabs.querySelectorAll('button').forEach((b, n) => b.setAttribute('aria-selected', String(n === i)))
    view.replaceChildren()
    if (!ws || !ws['!ref']) {
      view.append(el('p', 'note', 'This sheet is empty.'))
      return
    }
    const range = XLSX.utils.decode_range(ws['!ref'])
    // The library writes every cell's text escaped; the table is then styled here.
    view.innerHTML = XLSX.utils.sheet_to_html(ws, { header: '', footer: '', editable: false })
    const table = view.querySelector('table')
    if (table) {
      table.className = 'grid'
      // Column letters on top and row numbers on the left, as in Excel.
      const head = document.createElement('thead')
      const tr = document.createElement('tr')
      tr.append(el('th', 'corner'))
      for (let c = range.s.c; c <= range.e.c; c++) tr.append(el('th', undefined, XLSX.utils.encode_col(c)))
      head.append(tr)
      table.prepend(head)
      table.querySelectorAll('tbody tr').forEach((row, n) => row.prepend(el('th', 'rownum', String(range.s.r + n + 1))))
    }
    if (range.e.r >= MAX_ROWS) view.append(el('p', 'note', `First ${MAX_ROWS} rows. Download to see all.`))
  }
  wb.SheetNames.forEach((n, i) => {
    const b = el('button', undefined, n)
    b.type = 'button'
    b.setAttribute('role', 'tab')
    b.addEventListener('click', () => show(i))
    tabs.append(b)
  })
  out.replaceChildren(...(wb.SheetNames.length > 1 ? [tabs] : []), view)
  show(0)
}

/* ---------------------------------------------------------------- PowerPoint (.pptx) */
async function slides(bytes: ArrayBuffer): Promise<void> {
  const { init } = await import('pptx-preview')
  const box = el('div', 'pptx-box')
  out.replaceChildren(box)
  const width = Math.min(1100, Math.max(320, out.clientWidth - 32))
  const viewer = init(box, { width, height: Math.round((width * 9) / 16) })
  await viewer.preview(bytes)
}

/* ---------------------------------------------------------------- attached mail (.eml and Outlook .msg) */
interface MailView {
  subject: string
  from: string
  to: string
  cc: string
  date: string
  html: string | null
  text: string
  attachments: { name: string; size: number }[]
}

function showMail(m: MailView): void {
  const head = el('header', 'mail-head')
  head.append(el('h1', undefined, m.subject || '(no subject)'))
  const rows: [string, string][] = [
    ['From', m.from],
    ['To', m.to],
    ['Cc', m.cc],
    ['Date', m.date],
  ]
  const dl = el('dl')
  for (const [k, v] of rows) if (v) dl.append(el('dt', undefined, k), el('dd', undefined, v))
  head.append(dl)
  if (m.attachments.length > 0) {
    const ul = el('ul', 'mail-files')
    for (const a of m.attachments) ul.append(el('li', undefined, `📎 ${a.name} · ${size(a.size)}`))
    head.append(ul)
  }
  // The mail's own content in a frame of its own with scripts, forms and pop-ups all off (only its size is read from here).
  const body = el('iframe', 'mail-body')
  body.setAttribute('sandbox', 'allow-same-origin')
  body.setAttribute('title', 'Mail content')
  body.srcdoc = m.html ?? `<pre style="white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;margin:0">${m.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)}</pre>`
  body.addEventListener('load', () => {
    // As tall as its content, so the whole preview scrolls as one page.
    const d = body.contentDocument
    if (d?.documentElement) body.style.height = `${Math.max(200, d.documentElement.scrollHeight + 16)}px`
  })
  out.replaceChildren(head, body)
}

const who = (p: { name?: string; address?: string } | undefined): string => (p ? (p.name ? `${p.name} <${p.address ?? ''}>` : (p.address ?? '')) : '')

async function eml(bytes: ArrayBuffer): Promise<void> {
  const { default: PostalMime } = await import('postal-mime')
  const m = await PostalMime.parse(bytes)
  // Pictures inside the mail (cid:) are shown from the mail's own parts.
  let html = m.html ?? null
  if (html) {
    for (const a of m.attachments) {
      if (!a.contentId || typeof a.content === 'string') continue
      const b64 = btoa(Array.from(new Uint8Array(a.content), (c) => String.fromCharCode(c)).join(''))
      html = html.split(`cid:${a.contentId.replace(/^<|>$/g, '')}`).join(`data:${a.mimeType};base64,${b64}`)
    }
  }
  showMail({
    subject: m.subject ?? '',
    from: who(m.from),
    to: (m.to ?? []).map(who).join(', '),
    cc: (m.cc ?? []).map(who).join(', '),
    date: m.date ? new Date(m.date).toLocaleString() : '',
    html,
    text: m.text ?? '',
    // Pictures that are part of the mail's own content (cid:) are not listed as attachments, as in Outlook.
    attachments: m.attachments.filter((a) => !(a.contentId && (m.html ?? '').includes(`cid:${a.contentId.replace(/^<|>$/g, '')}`))).map((a) => ({ name: a.filename ?? 'attachment', size: typeof a.content === 'string' ? a.content.length : a.content.byteLength })),
  })
}

async function outlook(bytes: ArrayBuffer): Promise<void> {
  // An older-style (CommonJS) package: the class arrives one level deeper in the browser build.
  const mod = (await import('@kenjiuno/msgreader')) as unknown as { default: typeof import('@kenjiuno/msgreader').default | { default: typeof import('@kenjiuno/msgreader').default } }
  const MsgReader = 'default' in mod.default ? mod.default.default : mod.default
  const d = new MsgReader(bytes).getFileData()
  const list = (kind: 'to' | 'cc') => (d.recipients ?? []).filter((r) => (r.recipType ?? 'to') === kind).map((r) => (r.name && r.email && r.name !== r.email ? `${r.name} <${r.email}>` : (r.email ?? r.name ?? ''))).join(', ')
  const html = d.bodyHtml ?? (d.html ? new TextDecoder().decode(d.html) : null)
  showMail({
    subject: d.subject ?? '',
    from: d.senderName ? `${d.senderName}${d.senderEmail ? ` <${d.senderEmail}>` : ''}` : (d.senderEmail ?? ''),
    to: list('to'),
    cc: list('cc'),
    date: d.messageDeliveryTime ? new Date(d.messageDeliveryTime).toLocaleString() : (d.creationTime ? new Date(d.creationTime).toLocaleString() : ''),
    html,
    text: d.body ?? '',
    attachments: (d.attachments ?? []).map((a) => ({ name: a.fileName ?? a.name ?? 'attachment', size: a.contentLength ?? 0 })),
  })
}

/* ---------------------------------------------------------------- ZIP: what is inside */
async function zip(bytes: ArrayBuffer): Promise<void> {
  const { default: JSZip } = await import('jszip')
  const z = await JSZip.loadAsync(bytes)
  const files = Object.values(z.files).filter((f) => !f.dir)
  const table = el('table', 'grid zip')
  const head = el('tr')
  head.append(el('th', undefined, 'Name'), el('th', undefined, 'Size'), el('th', undefined, 'Date'))
  table.append(head)
  for (const f of files.slice(0, 1000)) {
    const r = el('tr')
    const sz = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
    r.append(el('td', undefined, f.name), el('td', undefined, sz !== undefined ? size(sz) : ''), el('td', undefined, f.date.toLocaleDateString()))
    table.append(r)
  }
  out.replaceChildren(el('p', 'note', `${files.length} file${files.length === 1 ? '' : 's'} inside. Download to open them.`), table)
}

/* ---------------------------------------------------------------- TIFF (scanned documents) */
async function tiff(bytes: ArrayBuffer, name: string): Promise<void> {
  const UTIF = await import('utif2')
  const pages = UTIF.decode(bytes)
  const box = el('div', 'pages')
  for (const [n, ifd] of pages.slice(0, MAX_PAGES).entries()) {
    UTIF.decodeImage(bytes, ifd)
    const w = (ifd as unknown as { width: number }).width
    const h = (ifd as unknown as { height: number }).height
    if (!w || !h) continue
    const canvas = el('canvas', 'page')
    canvas.width = w
    canvas.height = h
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', `${name}, page ${n + 1}`)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    ctx.putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(ifd)), w, h), 0, 0)
    box.append(canvas)
  }
  if (!box.childElementCount) throw new Error('no pages')
  out.replaceChildren(box)
  if (pages.length > MAX_PAGES) out.append(el('p', 'note', `First ${MAX_PAGES} of ${pages.length} pages. Download to see all.`))
}

const RENDER: Record<RichKind, (b: ArrayBuffer, name: string) => Promise<void>> = { word, sheet, slides, mail: eml, outlook, zip, tiff }

let done = false
window.addEventListener('message', (e: MessageEvent) => {
  // Only the page that opened this frame, only once.
  if (done || e.source !== window.parent) return
  const job = e.data as Partial<Job> | null
  if (!job || job.type !== 'pm-preview' || !(job.bytes instanceof ArrayBuffer) || !job.kind || !(job.kind in RENDER)) return
  done = true
  RENDER[job.kind](job.bytes, String(job.name ?? '')).then(
    () => tell('shown'),
    (err: unknown) => {
      console.warn('Preview failed:', err)
      out.replaceChildren(el('p', 'note', "Can't show this file. Try Download."))
      tell('failed', err instanceof Error ? err.message.slice(0, 200) : '')
    },
  )
})
// Esc and the arrow keys belong to the preview window around this page (close, previous, next attachment): pass them on
// once the person has clicked into the document (only the key's name; nothing else leaves this page).
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const t = e.target as HTMLElement | null
  if (e.key !== 'Escape' && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
  window.parent.postMessage({ type: 'pm-preview-key', key: e.key }, '*')
})
// Ready to receive the file.
window.parent.postMessage({ type: 'pm-preview-state', state: 'ready' }, '*')
