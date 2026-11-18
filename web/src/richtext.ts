import { sanitizeEmailHtml } from './mailhtml'

/** Small, dependency-free helpers for the rich-text composer. */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Plain text to HTML: escape and keep line breaks. */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
}

const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LINK', 'META', 'TITLE', 'HEAD'])
const ALLOWED = new Set(['HR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'BLOCKQUOTE', 'A', 'SPAN'])

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

/** Allow-list sanitiser for draft restore and any HTML we did not generate ourselves. */
export function sanitizeHtml(html: string, opts: { images?: boolean } = {}): string {
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
      // Pictures: only inside a signature (or when the caller is the signature editor). Embedded or https sources only.
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') ?? ''
        const okSrc = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(src) || /^https:\/\//i.test(src)
        if (!okSrc || !(opts.images || el.closest('[data-sig]'))) {
          el.remove()
          continue
        }
        const w = (el.getAttribute('width') ?? '').replace(/[^0-9]/g, '').slice(0, 4)
        const h = (el.getAttribute('height') ?? '').replace(/[^0-9]/g, '').slice(0, 4)
        const alt = el.getAttribute('alt') ?? ''
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
        el.setAttribute('src', src)
        if (w) el.setAttribute('width', w)
        if (h) el.setAttribute('height', h)
        el.setAttribute('alt', alt.slice(0, 120))
        continue
      }
      if (!ALLOWED.has(el.tagName)) {
        el.replaceWith(...Array.from(el.childNodes))
        clean(node)
        return
      }
      for (const attr of Array.from(el.attributes)) {
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
