/**
 * Safe display of HTML email.
 *
 * Layers (all of them, because email HTML is hostile by default):
 * 1. Parse with DOMParser, which never runs scripts, then rebuild from an allow-list of tags and attributes.
 * 2. Remote https images load automatically (no button). Only https images load.
 * 3. Links open only http(s), mailto and tel, always in a new tab with noopener/noreferrer.
 * 4. Inline styles are cut down to harmless properties (no positioning, no url()).
 * 5. The result is shown inside a sandboxed iframe with a CSP that blocks scripts, forms and network except https images.
 */

const DROP = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LINK', 'META', 'BASE', 'TITLE', 'HEAD',
  'SVG', 'MATH', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'CANVAS', 'NOSCRIPT', 'TEMPLATE', 'DIALOG', 'PORTAL', 'MAP', 'AREA',
])

export const ALLOWED = new Set([
  'A', 'ABBR', 'ADDRESS', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CENTER', 'CITE', 'CODE', 'COL', 'COLGROUP', 'DD', 'DEL', 'DIV', 'DL', 'DT', 'EM', 'FONT',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'IMG', 'INS', 'LI', 'OL', 'P', 'PRE', 'Q', 'S', 'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'TT', 'U', 'UL',
])

/** Attributes that are safe as they are (all values are plain text, never code). */
export const PLAIN_ATTRS = new Set(['align', 'valign', 'width', 'height', 'colspan', 'rowspan', 'border', 'cellpadding', 'cellspacing', 'dir', 'lang', 'bgcolor', 'color', 'size'])

/**
 * Class names are kept only when they mark quoted history (used to fold it and to style it like Outlook). Any other class could
 * borrow the app's own look when a quote is pasted into the writing window (a fake "Message sent" card, an overlay).
 */
const KEEP_CLASSES = new Set(['gmail_quote', 'gmail_attr', 'gmail_extra', 'gmail_signature', 'yahoo_quoted', 'moz-cite-prefix'])

const CSS_PROPS = new Set([
  'color', 'background-color', 'font-weight', 'font-style', 'font-size', 'text-align', 'text-decoration', 'line-height', 'width', 'max-width',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-collapse', 'vertical-align', 'padding', 'margin', 'white-space',
])

/**
 * Extra properties for text a person writes (pasted from Excel/Word/web, or set with the writing toolbar): fonts, direction
 * (Arabic), indents and cell borders. Same rules otherwise: no url(), no positioning, no negative sizes.
 */
const COMPOSE_PROPS = new Set([
  ...CSS_PROPS, 'font-family', 'direction', 'text-indent', 'height', 'min-width',
  'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'border-color', 'border-style', 'border-width', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color',
])

/** Safe inline style for the writing window (larger fonts allowed: up to 72 pt). */
export const composeStyle = (style: string): string => safeStyle(style, true)

function safeStyle(style: string, compose = false): string {
  const out: string[] = []
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const value = decl.slice(i + 1).trim()
    // Excel writes a cell's fill as "background: #FFFF00": a plain colour is kept as background-color (never an image).
    if (compose && prop === 'background' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]{3,20})$/i.test(value)) {
      out.push(`background-color: ${value}`)
      continue
    }
    if (!(compose ? COMPOSE_PROPS : CSS_PROPS).has(prop)) continue
    if (prop === 'direction' && !/^(ltr|rtl)$/i.test(value)) continue
    if (prop === 'font-family' && !/^[\w\s,'"-]{1,160}$/.test(value)) continue
    if (/url\s*\(|expression|javascript:|@import|[\\<>]|behavior|binding|var\s*\(|calc\s*\(/i.test(value)) continue
    // No negative sizes: a negative margin or padding lets content slide over what is next to it.
    if (/(^|[\s(,])-\s*\d/.test(value)) continue
    if (prop === 'font-size') {
      const m = value.match(/^([\d.]+)(px|pt|em|rem|%)?$/i)
      if (!m) continue
      const n = Number(m[1])
      const px = m[2] === 'pt' ? n * 1.33 : m[2] === 'em' || m[2] === 'rem' ? n * 16 : m[2] === '%' ? (n / 100) * 16 : n
      if (px > (compose ? 96 : 40) || px < (compose ? 6 : 8)) continue
    }
    out.push(`${prop}: ${value}`)
  }
  return out.join('; ')
}

function safeHref(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) ? u.href : null
  } catch {
    return null
  }
}

const hostOf = (s: string): string | null => {
  try {
    return new URL(s).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export interface CleanHtml {
  html: string
  /** Remote images that were not loaded */
  blocked: number
}

const MAX = 400_000

export function sanitizeEmailHtml(input: string, allowImages: boolean): CleanHtml {
  const doc = new DOMParser().parseFromString(`<body>${input.slice(0, MAX)}</body>`, 'text/html')
  let blocked = 0

  // One node at a time; every node is visited once (an email built from thousands of nested unknown tags cannot freeze the app).
  const clean = (parent: Node): void => {
    for (const node of Array.from(parent.childNodes)) cleanNode(node)
  }
  const cleanNode = (node: Node): void => {
    {
      if (node.nodeType === Node.TEXT_NODE) return
      if (node.nodeType !== Node.ELEMENT_NODE) {
        node.parentNode?.removeChild(node) // comments, processing instructions
        return
      }
      const el = node as HTMLElement
      const tag = el.tagName.toUpperCase()
      if (DROP.has(tag)) {
        el.remove()
        return
      }
      if (!ALLOWED.has(tag)) {
        // Unknown wrapper: keep the text and children, lose the element.
        const kids = Array.from(el.childNodes)
        el.replaceWith(...kids)
        for (const k of kids) cleanNode(k)
        return
      }

      if (tag === 'IMG') {
        const src = el.getAttribute('src') ?? ''
        const alt = el.getAttribute('alt') ?? ''
        const embedded = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)
        const remote = /^https:\/\//i.test(src)
        if (embedded || (remote && allowImages)) {
          for (const a of Array.from(el.attributes)) if (!['src', 'alt', 'width', 'height'].includes(a.name)) el.removeAttribute(a.name)
          el.setAttribute('referrerpolicy', 'no-referrer')
          el.setAttribute('loading', 'lazy')
        } else {
          if (/^(https?:|cid:)/i.test(src)) blocked++
          const ph = doc.createElement('span')
          ph.className = 'blocked-img'
          ph.textContent = alt ? `Image: ${alt}` : 'Image'
          el.replaceWith(ph)
        }
        return
      }

      const style = el.getAttribute('style')
      const keepHref = tag === 'A' ? safeHref(el.getAttribute('href') ?? '') : null
      const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => KEEP_CLASSES.has(c))
      for (const a of Array.from(el.attributes)) {
        if (!PLAIN_ATTRS.has(a.name)) el.removeAttribute(a.name)
      }
      if (classes.length > 0) el.setAttribute('class', classes.join(' '))
      if (style) {
        const s = safeStyle(style)
        if (s) el.setAttribute('style', s)
      }
      if (tag === 'A') {
        if (keepHref) {
          el.setAttribute('href', keepHref)
          el.setAttribute('target', '_blank')
          el.setAttribute('rel', 'noopener noreferrer nofollow')
          // Link text that shows one address while pointing at another is a classic phishing trick.
          const shown = (el.textContent ?? '').trim()
          if (/^(https?:\/\/|www\.)/i.test(shown)) {
            const a = hostOf(shown.startsWith('www.') ? `https://${shown}` : shown)
            const b = hostOf(keepHref)
            if (a && b && a !== b) el.setAttribute('data-mismatch', '1')
          }
        } else {
          const kids = Array.from(el.childNodes)
          el.replaceWith(...kids)
          for (const k of kids) cleanNode(k)
          return
        }
      }
      clean(el)
    }
  }
  clean(doc.body)
  // Quoted history reads like Outlook: flush left, no side bar. Gmail, Apple Mail and others draw a bar and indent with inline styles on the blockquote.
  for (const q of Array.from(doc.body.querySelectorAll('blockquote'))) {
    const kept = (q.getAttribute('style') ?? '')
      .split(';')
      .filter((d) => d.trim() && !/^\s*(border|padding|margin)/i.test(d))
      .join(';')
    if (kept) q.setAttribute('style', kept)
    else q.removeAttribute('style')
  }
  return { html: doc.body.innerHTML, blocked }
}

const QUOTE_SELECTOR = 'blockquote, .gmail_quote, .gmail_extra, #divRplyFwdMsg, #appendonsend, .yahoo_quoted, .moz-cite-prefix, div[type="cite"], [data-quote]'

/** Split sanitised HTML into the new text and the quoted history. Nothing is split when the quote is the whole message. */
export function splitQuotedHtml(html: string): { main: string; quoted: string } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const body = doc.body

  let marker: Element | null = body.querySelector(QUOTE_SELECTOR)
  // Outlook: a rule followed by a From:/Sent: header block.
  for (const hr of Array.from(body.querySelectorAll('hr'))) {
    const next = hr.nextElementSibling
    const text = (next?.textContent ?? '').trim().slice(0, 400)
    if (next && /^(from|de|von):/i.test(text) && /(sent|date|envoy|gesendet):/i.test(text)) {
      if (!marker || (hr.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) marker = hr
      break
    }
  }
  if (!marker) return { main: html, quoted: '' }

  // Include the "On … wrote:" line that introduces the quote.
  const prev = marker.previousElementSibling
  if (prev && /^on\s.{5,200}wrote:?$/i.test((prev.textContent ?? '').replace(/\s+/g, ' ').trim())) marker = prev

  const frag = doc.createDocumentFragment()
  let node: Node | null = marker
  while (node && node !== body) {
    const parent: Node | null = node.parentNode
    let cur: Node | null = node
    while (cur) {
      const nxt: Node | null = cur.nextSibling
      frag.appendChild(cur)
      cur = nxt
    }
    node = parent
  }
  if ((body.textContent ?? '').trim() === '') return { main: html, quoted: '' }
  const holder = doc.createElement('div')
  holder.appendChild(frag)
  return { main: body.innerHTML, quoted: holder.innerHTML }
}

/** Plain-text messages: fold from "On … wrote:", "-----Original Message-----", an Outlook header block or a run of "> " lines. */
export function splitQuotedText(text: string): { main: string; quoted: string } {
  const patterns = [/^On\s[\s\S]{5,200}?wrote:\s*$/im, /^-{2,}\s*(Original|Forwarded) Message\s*-{2,}\s*$/im, /^From:\s.*\r?\n(?:Sent|Date):/im, /^(?:>.*\r?\n?){2,}/m]
  let at = -1
  for (const p of patterns) {
    const m = p.exec(text)
    if (m && (at < 0 || m.index < at)) at = m.index
  }
  if (at < 0) return { main: text, quoted: '' }
  const main = text.slice(0, at).replace(/\s+$/, '')
  if (!main.trim()) return { main: text, quoted: '' }
  return { main, quoted: text.slice(at) }
}
