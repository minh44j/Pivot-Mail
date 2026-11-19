import { useEffect, useMemo, useRef, useState } from 'react'
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
  // Follow the content as it changes (pictures arriving, fonts, a wider or narrower window), for as long as it is shown.
  const watch = useRef<ResizeObserver | null>(null)
  const onLoad = () => {
    measure()
    watch.current?.disconnect()
    const d = ref.current?.contentDocument
    const wrap = d?.getElementById('pm-mail')
    const RO = (d?.defaultView as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver
    if (wrap && RO) {
      watch.current = new RO(() => measure())
      watch.current.observe(wrap)
    }
  }
  useEffect(() => () => watch.current?.disconnect(), [])

  return (
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
