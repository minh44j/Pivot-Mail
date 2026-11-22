import { sanitizeHtml } from '../richtext'

/**
 * Pasting into the mail being written keeps its formatting, as in Outlook and Gmail (Minhaj 2026-11-22: "tables are not
 * supported in compose pane, when we copy a table and paste it here, it's not showing"). Before, every paste was turned into
 * plain text: tables lost their rows and columns, and colours, bold, links and pictures were lost too.
 */

/**
 * Excel and Word put most of a table's look (cell borders, fills, fonts) in a <style> list at the top of what they copy,
 * addressed by class names (.xl65, .MsoTableGrid). Mail cannot carry such a list, and the cleaner removes class names, so
 * those rules are written onto each element first (in order; an element's own style still wins).
 */
export function inlineClipboardStyles(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const sheets = Array.from(doc.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n')
    .replace(/<!--|-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  if (sheets.trim()) {
    const extra = new Map<Element, string[]>()
    // Plain rules only: "selector, selector { declarations }". @font-face, @page, @media blocks are skipped.
    const flat = sheets.replace(/@[\w-]+[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = (m[2] ?? '').trim()
      if (!decls) continue
      for (const raw of (m[1] ?? '').split(',')) {
        const sel = raw.trim()
        if (!sel || sel.length > 120 || /[:@\\]/.test(sel)) continue
        let hits: Element[] = []
        try {
          hits = Array.from(doc.body.querySelectorAll(sel)).slice(0, 5000)
        } catch {
          continue
        }
        for (const el of hits) extra.set(el, [...(extra.get(el) ?? []), decls])
      }
    }
    for (const [el, list] of extra) el.setAttribute('style', `${list.join(';')};${el.getAttribute('style') ?? ''}`)
  }
  return doc.body.innerHTML
}

/** HTML from the clipboard, ready to be put in the mail: formatting kept, anything unsafe removed. */
export function cleanPastedHtml(html: string): string {
  const out = sanitizeHtml(inlineClipboardStyles(html), { rich: true })
  // Tables pasted from Excel keep their cell borders together (as in Excel), not as double lines.
  const doc = new DOMParser().parseFromString(`<body>${out}</body>`, 'text/html')
  for (const t of Array.from(doc.querySelectorAll('table'))) {
    const s = t.getAttribute('style') ?? ''
    if (!/border-collapse/i.test(s)) t.setAttribute('style', `border-collapse: collapse${s ? `; ${s}` : ''}`)
  }
  return doc.body.innerHTML
}

/** A picture copied to the clipboard (a screenshot, an image copied from a page), as opposed to a file copied in Explorer. */
export const isClipboardPicture = (f: File): boolean => f.type.startsWith('image/') && /^image\.(png|jpe?g|gif|bmp|webp)$/i.test(f.name)

/** A picture as an <img> for the mail (it travels as an inline part: compose.ts extractInlineImages). */
export async function pictureHtml(f: File): Promise<string> {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
  if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(data)) throw new Error('unsupported picture')
  return `<img src="${data}" alt="" style="max-width: 100%">`
}
