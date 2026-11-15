/** Small, dependency-free helpers for the rich-text composer. */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Plain text to HTML: escape and keep line breaks. */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
}

const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LINK', 'META', 'TITLE', 'HEAD'])
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'BLOCKQUOTE', 'A', 'SPAN'])

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
export function sanitizeHtml(html: string): string {
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
      if (!ALLOWED.has(el.tagName)) {
        el.replaceWith(...Array.from(el.childNodes))
        clean(node)
        return
      }
      for (const attr of Array.from(el.attributes)) {
        const keep =
          (el.tagName === 'A' && attr.name === 'href') ||
          (el.tagName === 'DIV' && attr.name === 'data-sig') ||
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

export function signatureHtml(signature: string): string {
  return signature.trim() ? `<div data-sig="1" contenteditable="false"><br>-- <br>${textToHtml(signature.trim())}</div>` : ''
}
