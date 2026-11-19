import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { platform } from '../platform'
import { ContextMenu } from './ContextMenu'
import type { MenuEntry } from './ContextMenu'
import type { Message } from '../types'
import { sanitizeEmailHtml, splitQuotedHtml, splitQuotedText } from '../mailhtml'
import { inlineImageUri } from '../gmail/inline'

const CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"

const FRAME_CSS = `
html,body{margin:0;padding:0;height:auto!important;min-height:0!important}
#pm-mail{display:flow-root}
body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;overflow-wrap:anywhere;word-break:break-word}
img{max-width:100%;height:auto}
table{max-width:100%;border-collapse:collapse}
a{color:#0a58b8}
a[data-mismatch]{outline:2px solid #d9480f;outline-offset:1px}
blockquote{margin:0;padding:0;border:0}
.gmail_quote{margin-top:14px;padding-top:10px;border-top:1px solid #d2d2d7}
.blocked-img{display:inline-block;padding:2px 8px;border:1px dashed #b0b0b8;border-radius:4px;color:#6e6e73;font-size:12px}
`

/** Sanitised HTML in a sandboxed iframe: no scripts, no forms, no top navigation, strict CSP. */
function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [h, setH] = useState(60)
  // Mail is written for a white page. In the dark theme it is shown on a white sheet (with some room around the text) rather than guessed into dark colours.
  const dark = document.documentElement.dataset.theme === 'dark'
  // "Full window height" in a mail (100vh) would mean the frame's own height and make it grow with every measurement: off.
  const safe = html.replace(/\b\d+(?:\.\d+)?(?:d|s|l)?vh\b/gi, 'auto')
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><base target="_blank"><style>${FRAME_CSS}${dark ? 'html{background:#fff}body{padding:12px 14px}' : ''}</style></head><body><div id="pm-mail">${safe}</div></body></html>`

  /**
   * The frame is as tall as the mail's own content (a wrapper around it), plus the page's padding. Measuring the frame's page
   * instead (scrollHeight) can never come out smaller than the frame itself, so the frame only ever grew: after "Show trimmed
   * content" and "Hide" it kept the long height, a large blank space before Reply (regression test: scratchpad gap.js).
   */
  const measure = () => {
    const d = ref.current?.contentDocument
    const wrap = d?.getElementById('pm-mail')
    if (!d?.body || !wrap) return
    const cs = d.defaultView?.getComputedStyle(d.body)
    const pad = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom) : 0
    setH(Math.max(40, Math.ceil(wrap.getBoundingClientRect().height + (Number.isFinite(pad) ? pad : 0))))
  }
  // Measured while the mail settles (as before), and again whenever a picture inside finishes loading, however late.
  useEffect(() => {
    const t = window.setInterval(measure, 400)
    const stop = window.setTimeout(() => window.clearInterval(t), 4000)
    return () => {
      window.clearInterval(t)
      window.clearTimeout(stop)
    }
  }, [html])
  // Right-click inside the mail (links, selected text, pictures) and the link a pointer rests on (where it really goes).
  const [menu, setMenu] = useState<{ x: number; y: number; href: string; linkText: string; sel: string; img: string; flagged: boolean; doc: Document } | null>(null)
  const [hover, setHover] = useState<{ href: string; left: number; bottom: number } | null>(null)
  const [copied, setCopied] = useState<{ x: number; y: number; text: string } | null>(null)
  const onLoad = () => {
    measure()
    const f = ref.current
    const d = f?.contentDocument
    d?.addEventListener('load', measure, true) // (capture: image load events do not bubble)
    f?.contentWindow?.addEventListener('resize', measure) // a wider or narrower window or reading pane re-wraps the text
    if (!f || !d) return
    const linkOf = (t: EventTarget | null) => (t instanceof (d.defaultView?.Element ?? Element) ? (t as Element).closest('a[href]') : null) as HTMLAnchorElement | null
    d.addEventListener('contextmenu', (e) => {
      const a = linkOf(e.target)
      const img = e.target instanceof (d.defaultView?.HTMLImageElement ?? HTMLImageElement) ? (e.target as HTMLImageElement).src : ''
      const sel = d.getSelection()?.toString() ?? ''
      e.preventDefault() // the app's own menu: the same in the Windows and Mac apps (which have none) and in a browser
      const r = f.getBoundingClientRect()
      setHover(null)
      setMenu({ x: r.left + e.clientX, y: r.top + e.clientY, href: a?.href ?? '', linkText: (a?.textContent ?? '').trim(), sel, img: /^https?:/.test(img) ? img : '', flagged: !!a?.hasAttribute('data-mismatch'), doc: d })
    })
    d.addEventListener('pointerdown', () => setMenu(null))
    d.addEventListener('mouseover', (e) => {
      const a = linkOf(e.target)
      if (!a) return
      const r = f.getBoundingClientRect()
      setHover({ href: a.href, left: Math.max(8, r.left), bottom: Math.max(8, window.innerHeight - Math.min(r.bottom, window.innerHeight)) })
    })
    d.addEventListener('mouseout', (e) => {
      if (linkOf(e.target) && !linkOf((e as MouseEvent).relatedTarget)) setHover(null)
    })
  }
  const copy = async (text: string) => {
    const at = menu
    setMenu(null)
    const ok = await platform.copyText(text).catch(() => false)
    if (at) {
      setCopied({ x: at.x, y: at.y, text: ok ? 'Copied' : 'Copy was blocked' })
      window.setTimeout(() => setCopied(null), 1400)
    }
  }
  function selectAll(d: Document) {
    setMenu(null)
    if (d.body) {
      d.defaultView?.focus()
      d.getSelection()?.selectAllChildren(d.body)
    }
  }
  const entries = (): MenuEntry[] => {
    if (!menu) return []
    const out: MenuEntry[] = []
    const mail = menu.href.startsWith('mailto:') ? decodeURIComponent(menu.href.slice(7).split('?')[0] ?? '') : ''
    if (mail) {
      out.push({ type: 'head', label: mail })
      out.push({ type: 'item', label: 'Copy email address', icon: 'copy', onSelect: () => void copy(mail) })
    } else if (/^https?:/i.test(menu.href)) {
      let host = ''
      try {
        host = new URL(menu.href).host
      } catch {
        /* shown without */
      }
      // Where the link really goes (a link's text can say one address and go to another).
      out.push({ type: 'head', label: menu.flagged ? `⚠ Goes to ${host} (not what the text says)` : `Goes to ${host}` })
      out.push({ type: 'item', label: 'Open link', icon: 'popout', onSelect: () => {
        setMenu(null)
        window.open(menu.href, '_blank', 'noopener,noreferrer')
      } })
      out.push({ type: 'item', label: 'Copy link address', icon: 'link', onSelect: () => void copy(menu.href) })
      if (menu.linkText && menu.linkText !== menu.href) out.push({ type: 'item', label: 'Copy link text', icon: 'copy', onSelect: () => void copy(menu.linkText) })
    }
    if (menu.img) out.push({ type: 'item', label: 'Copy picture address', icon: 'link', onSelect: () => void copy(menu.img) })
    if (out.length) out.push({ type: 'sep' })
    out.push({ type: 'item', label: 'Copy', icon: 'copy', disabled: !menu.sel, onSelect: () => void copy(menu.sel) })
    const doc = menu.doc
    out.push({ type: 'item', label: 'Select all', onSelect: () => selectAll(doc) })
    return out
  }
  return (
    <>
    <iframe
      ref={ref}
      className="html-frame"
      title="Message content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={doc}
      style={dark ? { height: h, background: '#fff', borderRadius: 10 } : { height: h }}
      onLoad={onLoad}
    />
    {menu && createPortal(<ContextMenu x={menu.x} y={menu.y} entries={entries()} onClose={() => setMenu(null)} />, document.body)}
    {hover &&
      createPortal(
        <div className="link-peek" style={{ left: hover.left, bottom: hover.bottom }} aria-hidden="true">
          {hover.href.length > 120 ? `${hover.href.slice(0, 117)}…` : hover.href}
        </div>,
        document.body,
      )}
    {copied &&
      createPortal(
        <div className="copied-pop" style={{ left: copied.x, top: copied.y }} role="status">
          {copied.text}
        </div>,
        document.body,
      )}
    </>
  )
}

export function MessageBody({ msg }: { msg: Message }) {
  // Real mail: the list only has the first lines until the whole message has been fetched.
  if (msg.loaded === false) {
    return (
      <div className="msg-content">
        <div className="msg-body">{msg.body}</div>
        <p className="muted" role="status">
          Loading the full message…
        </p>
      </div>
    )
  }
  return <FullBody key={msg.id} msg={msg} />
}

function FullBody({ msg }: { msg: Message }) {
  const [showQuote, setShowQuote] = useState(false)

  // Images placed inside the message (cid:) are fetched from Gmail and drawn in place.
  const [inline, setInline] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    const todo = Object.entries(msg.inline ?? {})
    for (const [cid, img] of todo) {
      void inlineImageUri(img).then((uri) => {
        if (alive && uri) setInline((p) => (p[cid] === uri ? p : { ...p, [cid]: uri }))
      })
    }
    return () => {
      alive = false
    }
  }, [msg.inline])

  const view = useMemo(() => {
    if (msg.html) {
      const withImages = msg.html.replace(/(\ssrc\s*=\s*["']?)cid:([^"'\s>]+)/gi, (all, pre: string, cid: string) => {
        const uri = inline[cid.toLowerCase()]
        return uri ? `${pre}${uri}` : all
      })
      const clean = sanitizeEmailHtml(withImages, true)
      return { kind: 'html' as const, blocked: clean.blocked, ...splitQuotedHtml(clean.html) }
    }
    return { kind: 'text' as const, blocked: 0, ...splitQuotedText(msg.body) }
  }, [msg.html, msg.body, inline])

  const hasQuote = view.quoted !== ''
  const full = view.kind === 'html' ? view.main + (showQuote ? view.quoted : '') : ''

  return (
    <div className="msg-content">
      {view.kind === 'html' ? (
        <HtmlFrame html={full} />
      ) : (
        <div className="msg-body">
          {view.main}
          {showQuote && hasQuote && `\n\n${view.quoted}`}
        </div>
      )}
      {hasQuote && (
        <button type="button" className="trim-toggle" aria-expanded={showQuote} onClick={() => setShowQuote((v) => !v)}>
          {showQuote ? 'Hide trimmed content' : 'Show trimmed content'}
        </button>
      )}
    </div>
  )
}
