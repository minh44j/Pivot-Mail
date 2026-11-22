import { ALLOWED as RICH_TAGS, PLAIN_ATTRS, composeStyle, sanitizeEmailHtml } from './mailhtml'

/** Small, dependency-free helpers for the rich-text composer. */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Plain text to HTML: escape and keep line breaks. */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
}

const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LINK', 'META', 'TITLE', 'HEAD'])
// Tables too: official signatures (Pivot OS) are laid out with them; only their structure is kept (attributes are removed
// like everywhere else; styles only inside a signature).
const ALLOWED = new Set(['HR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'BLOCKQUOTE', 'A', 'SPAN', 'TABLE', 'TBODY', 'TR', 'TD'])

export function safeUrl(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^(https?:|mailto:)/i.test(v)) {
    try {
      const u = new URL(v)
      return u.href
    } catch {
      return null
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null // javascript:, data:, etc.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`
  try {
    return new URL(`https://${v}`).href
  } catch {
    return null
  }
}

/** The few text styles a signature may carry (what an Outlook-style toolbar produces). Nothing else survives. */
export function sigStyle(style: string): string {
  const out: string[] = []
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const v = decl.slice(i + 1).trim()
    if (prop === 'color' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]{3,20})$/i.test(v)) out.push(`color: ${v}`)
    else if (prop === 'font-family' && /^[\w\s,'"-]{1,120}$/.test(v)) out.push(`font-family: ${v}`)
    else if (prop === 'font-size' && /^\d{1,2}(\.\d+)?(px|pt)$/.test(v) && parseFloat(v) >= 6 && parseFloat(v) <= 48) out.push(`font-size: ${v}`)
    else if (prop === 'font-weight' && /^(bold|normal|[1-9]00)$/.test(v)) out.push(`font-weight: ${v}`)
    else if (prop === 'font-style' && /^(italic|normal)$/.test(v)) out.push(`font-style: ${v}`)
    else if (prop === 'text-decoration' && /^(underline|none|line-through)( solid)?$/.test(v)) out.push(`text-decoration: ${v}`)
    else if (prop === 'text-align' && /^(left|right|center|justify)$/.test(v)) out.push(`text-align: ${v}`)
  }
  return out.join('; ')
}

/**
 * Allow-list sanitiser for draft restore and any HTML we did not generate ourselves.
 * `rich`: the writing window (Minhaj 2026-11-22: tables, colours, fonts, pictures, Arabic direction must survive a paste and a
 * saved draft): the reading pane's tag list and safe-style rules (plus fonts, direction, indents), pictures anywhere, the
 * table and direction attributes. Without it: the small set the signature editor uses.
 */
export function sanitizeHtml(html: string, opts: { images?: boolean; rich?: boolean } = {}): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const clean = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) continue
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove()
        continue
      }
      const el = child as HTMLElement
      if (DROP.has(el.tagName.toUpperCase())) {
        el.remove()
        continue
      }
      if (el.tagName === 'DIV' && el.hasAttribute('data-quote')) {
        // The quoted message keeps its own layout (tables, images, colours), cleaned by the same rules as the reading pane.
        const inner = sanitizeEmailHtml(el.innerHTML, true).html
        for (const attr of Array.from(el.attributes)) if (attr.name !== 'data-quote') el.removeAttribute(attr.name)
        el.innerHTML = inner
        continue
      }
      // Pictures: only inside a signature (or when the caller is the signature editor, or the writing window). Embedded or https
      // sources only.
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') ?? ''
        const okSrc = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(src) || /^https:\/\//i.test(src)
        if (!okSrc || !(opts.images || opts.rich || el.closest('[data-sig]'))) {
          el.remove()
          continue
        }
        const w = (el.getAttribute('width') ?? '').replace(/[^0-9]/g, '').slice(0, 4)
        const h = (el.getAttribute('height') ?? '').replace(/[^0-9]/g, '').slice(0, 4)
        const alt = el.getAttribute('alt') ?? ''
        const imgStyle = opts.rich ? composeStyle(el.getAttribute('style') ?? '') : ''
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
        el.setAttribute('src', src)
        if (imgStyle) el.setAttribute('style', imgStyle)
        if (w) el.setAttribute('width', w)
        if (h) el.setAttribute('height', h)
        el.setAttribute('alt', alt.slice(0, 120))
        continue
      }
      if (!(opts.rich ? RICH_TAGS : ALLOWED).has(el.tagName)) {
        el.replaceWith(...Array.from(el.childNodes))
        clean(node)
        return
      }
      const inSig = Boolean(opts.images) || Boolean(el.closest('[data-sig]'))
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === 'style' && opts.rich && !inSig && el.tagName !== 'BR') {
          const s = composeStyle(attr.value)
          if (s) el.setAttribute('style', s)
          else el.removeAttribute('style')
          continue
        }
        if (opts.rich && PLAIN_ATTRS.has(attr.name) && /^[\w\s#%.,-]{0,40}$/.test(attr.value)) continue
        if (attr.name === 'style' && inSig && el.tagName !== 'BR') {
          const s = sigStyle(attr.value)
          if (s) el.setAttribute('style', s)
          else el.removeAttribute('style')
          continue
        }
        const keep =
          (el.tagName === 'A' && attr.name === 'href') ||
          (el.tagName === 'DIV' && (attr.name === 'data-sig' || attr.name === 'data-quote')) ||
          (el.tagName === 'DIV' && attr.name === 'contenteditable' && attr.value === 'false')
        if (!keep) el.removeAttribute(attr.name)
      }
      if (el.tagName === 'A') {
        const href = safeUrl(el.getAttribute('href') ?? '')
        if (href) {
          el.setAttribute('href', href)
          el.setAttribute('rel', 'noopener noreferrer')
          el.setAttribute('target', '_blank')
        } else {
          el.replaceWith(...Array.from(el.childNodes))
          clean(node)
          return
        }
      }
      clean(el)
    }
  }
  clean(doc.body)
  return doc.body.innerHTML
}

/** Visible text of an HTML body, signature excluded. Used to detect an "empty" message. */
export function bodyText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  doc.querySelectorAll('[data-sig]').forEach((n) => n.remove())
  return (doc.body.textContent ?? '').trim()
}

/** A signature is plain text, or (when it has pictures or formatting) HTML marked with this prefix. */
export const SIG_HTML = '<!--pm-html-->'
export const isHtmlSignature = (s: string): boolean => s.startsWith(SIG_HTML)

/** The signature as HTML for the editor / composer (always cleaned). */
export function signatureBody(signature: string): string {
  return isHtmlSignature(signature) ? sanitizeHtml(signature.slice(SIG_HTML.length), { images: true }) : textToHtml(signature.trim())
}

/** The signature's text only (first line used as the sender's name in templates). */
export function signatureText(signature: string): string {
  if (!isHtmlSignature(signature)) return signature
  const doc = new DOMParser().parseFromString(`<body>${signature.slice(SIG_HTML.length).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n')}</body>`, 'text/html')
  return (doc.body.textContent ?? '').replace(/^\s+/, '')
}

export function signatureHtml(signature: string): string {
  const body = signatureBody(signature)
  const hasContent = isHtmlSignature(signature) ? /<img\b/i.test(body) || signatureText(signature).trim() !== '' : signature.trim() !== ''
  return hasContent ? `<div data-sig="1" contenteditable="false"><br>-- <br>${body}</div>` : ''
}

/** Plain text of an HTML body (line breaks kept), for previews and plain-text copies. */
export function htmlToPlain(html: string, keepAll = false): string {
  const doc = new DOMParser().parseFromString(`<body>${html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|tr|h[1-6])>/gi, '\n')}</body>`, 'text/html')
  if (!keepAll) doc.querySelectorAll('[data-quote],[data-sig]').forEach((n) => n.remove())
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
