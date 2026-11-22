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
export const composeStyle = (style: string): string => safeStyle(style, 'compose')

/**
 * Reading pane only (the mail sits in its own sealed frame): the ordinary layout of newsletters and notifications, i.e. buttons
 * with rounded corners, hidden preview lines, columns that stack on a phone, background pictures. Still nothing that can place
 * content over the app or run code: no positioning, no transforms, no outlines (the warning outline on a misleading link stays).
 */
const FRAME_PROPS = new Set([
  ...COMPOSE_PROPS, 'display', 'float', 'clear', 'background', 'background-image', 'background-position', 'background-size', 'background-repeat',
  'font', 'font-variant', 'max-height', 'min-height', 'letter-spacing', 'word-spacing', 'word-break', 'word-wrap', 'overflow-wrap', 'overflow', 'overflow-x',
  'overflow-y', 'text-transform', 'text-overflow', 'text-shadow', 'box-shadow', 'list-style', 'list-style-type', 'list-style-position', 'box-sizing', 'table-layout',
  'border-spacing', 'opacity', 'visibility', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'mso-hide',
])
const FRAME_FAMILY = /^(border(-(top|right|bottom|left))?(-(width|style|color))?|border(-(top|bottom)-(left|right))?-radius|(margin|padding)(-(top|right|bottom|left))?)$/
const DISPLAY = /^(none|block|inline|inline-block|table|inline-table|table-cell|table-row|table-row-group|table-header-group|table-footer-group|table-caption|table-column|list-item|flex|inline-flex|flow-root)$/i

type StyleMode = 'read' | 'compose' | 'frame'

function safeStyle(style: string, mode: StyleMode = 'read', images = false): string {
  const compose = mode === 'compose'
  const frame = mode === 'frame'
  const out: string[] = []
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    let value = decl.slice(i + 1).trim()
    // "Full window height" (100vh) in the reading frame means the frame's own height, which grows with each measurement: off.
    if (mode === 'frame') value = value.replace(/\b\d+(?:\.\d+)?(?:d|s|l)?vh\b/gi, 'auto')
    // "!important" is checked without, then put back (mobile layouts in newsletters depend on it).
    const important = frame && /!\s*important\s*$/i.test(value)
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim()
    // Excel writes a cell's fill as "background: #FFFF00": a plain colour is kept as background-color (never an image).
    if (compose && prop === 'background' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]{3,20})$/i.test(value)) {
      out.push(`background-color: ${value}`)
      continue
    }
    const allowed = frame ? FRAME_PROPS.has(prop) || FRAME_FAMILY.test(prop) : (compose ? COMPOSE_PROPS : CSS_PROPS).has(prop)
    if (!allowed || !value) continue
    if (prop === 'direction' && !/^(ltr|rtl)$/i.test(value)) continue
    if (prop === 'display' && !DISPLAY.test(value)) continue
    if ((prop === 'font-family' || prop === 'font') && !/^[\w\s,'"./%-]{1,200}$/.test(value)) continue
    if (prop === 'font' && (value.match(/[\d.]+px/gi) ?? []).some((v) => parseFloat(v) > 120)) continue
    // Background pictures: https only, and only when pictures in this mail are shown.
    let probe = value
    if (frame && /^background(-image)?$/.test(prop)) {
      const urls = value.match(/url\s*\(\s*(["']?)([^"')]*)\1\s*\)/gi) ?? []
      if (urls.length > 0 && (!images || !urls.every((u) => /url\s*\(\s*["']?https:\/\/[^\s"'()\\<>]+["']?\s*\)/i.test(u)))) continue
      for (const u of urls) probe = probe.replace(u, '')
    }
    if (/url\s*\(|expression|javascript:|@import|[\\<>]|behavior|binding|var\s*\(|calc\s*\(|attr\s*\(|image-set|element\s*\(/i.test(probe)) continue
    // No negative sizes: a negative margin or padding lets content slide over what is next to it (tight letter spacing is fine).
    if (!(frame && /^(letter|word)-spacing$/.test(prop)) && /(^|[\s(,])-\s*\d/.test(probe)) continue
    if (prop === 'font-size') {
      const m = value.match(/^([\d.]+)(px|pt|em|rem|%)?$/i)
      if (!m) continue
      const n = Number(m[1])
      const px = m[2] === 'pt' ? n * 1.33 : m[2] === 'em' || m[2] === 'rem' ? n * 16 : m[2] === '%' ? (n / 100) * 16 : n
      // A newsletter's headline can be big; 0 is how mail hides the gaps between side-by-side columns.
      const [lo, hi] = frame ? [0, 120] : compose ? [6, 96] : [8, 40]
      if (px > hi || px < lo) continue
    }
    out.push(`${prop}: ${value}${important ? ' !important' : ''}`)
  }
  return out.join('; ')
}

const MAX_CSS = 100_000
const MEDIA = /^[\w\s():,./-]{1,300}$/

/**
 * The mail's own style sheet (its <style> blocks), cut down like an inline style: plain rules and screen-size rules only, each
 * declaration through the same allow-list. Nothing that loads (fonts, imports) and nothing that could close the style block.
 */
function safeSheet(sources: string[], images: boolean): string {
  const text = sources.join('\n').slice(0, MAX_CSS)
  if (!text.trim()) return ''
  const scratch = document.implementation.createHTMLDocument('')
  const el = scratch.createElement('style')
  el.textContent = text
  scratch.head.append(el)
  const sheet = el.sheet
  if (!sheet) return ''
  const rules = (list: CSSRuleList, depth: number): string[] => {
    const out: string[] = []
    for (const r of Array.from(list)) {
      if (r instanceof CSSStyleRule) {
        const sel = r.selectorText
        if (!sel || sel.length > 1000 || /[<>\\]/.test(sel)) continue
        const body = safeStyle(r.style.cssText, 'frame', images)
        if (body) out.push(`${sel}{${body}}`)
      } else if (r instanceof CSSMediaRule && depth === 0) {
        const media = r.media.mediaText
        if (!MEDIA.test(media)) continue
        const inner = rules(r.cssRules, 1)
        if (inner.length) out.push(`@media ${media}{${inner.join('')}}`)
      }
      // @import, @font-face, @keyframes, @supports and the rest: dropped.
    }
    return out
  }
  const css = rules(sheet.cssRules, 0).join('\n')
  // Belt and braces: the sheet is written into a <style> element, which only "</" could end early.
  return /<\//.test(css) ? '' : css
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
  /** The mail's own style sheet, made safe (reading pane only: opts.frame) */
  css: string
}

export interface CleanOptions {
  /**
   * The result is shown on its own in the reading pane's sealed frame: the mail keeps its style sheet, class names and fuller
   * layout. Never for HTML that ends up in the app or in the writing window, where a class name could borrow the app's look.
   */
  frame?: boolean
}

const TOKEN = /^[A-Za-z_-][\w-]{0,63}$/

const MAX = 400_000
/** Pictures carried inside one mail, all together (as text) */
const MAX_PICTURES = 40_000_000

export function sanitizeEmailHtml(input: string, allowImages: boolean, opts: CleanOptions = {}): CleanHtml {
  const frame = opts.frame === true
  // Pictures pasted into a mail (a screenshot) are carried inside it as text, often more than a megabyte each. They are set
  // aside before the size limit, which is for the mail's text and layout: cutting through a picture left the whole message
  // blank (real case: a reply with a pasted screenshot, 2026-11-22).
  const pictures: string[] = []
  const mark = `pm-pic-${Math.random().toString(36).slice(2, 10)}:`
  let room = MAX_PICTURES
  const lifted = input.replace(/(\ssrc\s*=\s*["']?)(data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+)/gi, (all, pre: string, uri: string) => {
    if (uri.length > room) return all
    room -= uri.length
    pictures.push(uri.replace(/\s+/g, ''))
    return `${pre}${mark}${pictures.length - 1}`
  })
  const doc = new DOMParser().parseFromString(`<body>${lifted.slice(0, MAX)}</body>`, 'text/html')
  let blocked = 0
  // Style blocks can sit in the head or anywhere in the body; collected before they are removed below.
  const css = frame ? safeSheet(Array.from(doc.querySelectorAll('style')).map((s) => s.textContent ?? ''), allowImages) : ''

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
        const raw = el.getAttribute('src') ?? ''
        const held = raw.startsWith(mark) ? pictures[Number(raw.slice(mark.length))] : undefined
        const src = held ?? raw
        if (held) el.setAttribute('src', held)
        const alt = el.getAttribute('alt') ?? ''
        const embedded = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)
        const remote = /^https:\/\//i.test(src)
        if (embedded || (remote && allowImages)) {
          const style = frame ? safeStyle(el.getAttribute('style') ?? '', 'frame', allowImages) : ''
          const names = frame ? keepNames(el) : null
          for (const a of Array.from(el.attributes)) if (!['src', 'alt', 'width', 'height', ...(frame ? ['border', 'align'] : [])].includes(a.name)) el.removeAttribute(a.name)
          if (style) el.setAttribute('style', style)
          if (names) setNames(el, names)
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
      const names = frame ? keepNames(el) : { cls: (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => KEEP_CLASSES.has(c)), id: '' }
      const face = frame && tag === 'FONT' ? (el.getAttribute('face') ?? '') : ''
      for (const a of Array.from(el.attributes)) {
        if (!PLAIN_ATTRS.has(a.name)) el.removeAttribute(a.name)
      }
      setNames(el, names)
      if (face && /^[\w\s,'"-]{1,160}$/.test(face)) el.setAttribute('face', face)
      if (style) {
        const s = safeStyle(style, frame ? 'frame' : 'read', allowImages)
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
  return { html: doc.body.innerHTML, blocked, css }
}

/** Class names and id as plain words (frame mode keeps them so the mail's own style sheet applies). */
function keepNames(el: Element): { cls: string[]; id: string } {
  const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => TOKEN.test(c)).slice(0, 20)
  const id = el.getAttribute('id') ?? ''
  return { cls, id: TOKEN.test(id) && !/^pm-/i.test(id) ? id : '' } // (pm-…: the reading pane's own wrapper)
}

function setNames(el: Element, n: { cls: string[]; id: string }): void {
  if (n.cls.length > 0) el.setAttribute('class', n.cls.join(' '))
  if (n.id) el.setAttribute('id', n.id)
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
