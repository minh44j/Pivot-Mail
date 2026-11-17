import { useEffect, useMemo, useRef, useState } from 'react'
import type { Message } from '../types'
import { sanitizeEmailHtml, splitQuotedHtml, splitQuotedText } from '../mailhtml'

const CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"

const FRAME_CSS = `
html,body{margin:0;padding:0}
body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;overflow-wrap:anywhere;word-break:break-word}
img{max-width:100%;height:auto}
table{max-width:100%;border-collapse:collapse}
a{color:#0a58b8}
a[data-mismatch]{outline:2px solid #d9480f;outline-offset:1px}
blockquote{margin:8px 0;padding-left:10px;border-left:2px solid #d2d2d7;color:#515154}
.blocked-img{display:inline-block;padding:2px 8px;border:1px dashed #b0b0b8;border-radius:4px;color:#6e6e73;font-size:12px}
`

/** Sanitised HTML in a sandboxed iframe: no scripts, no forms, no top navigation, strict CSP. */
function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [h, setH] = useState(60)
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><base target="_blank"><style>${FRAME_CSS}</style></head><body>${html}</body></html>`

  const measure = () => {
    const d = ref.current?.contentDocument
    if (d?.body) setH(Math.max(40, d.documentElement.scrollHeight))
  }
  useEffect(() => {
    const f = ref.current
    if (!f) return
    const t = window.setInterval(measure, 400) // late image loads
    const stop = window.setTimeout(() => window.clearInterval(t), 4000)
    return () => {
      window.clearInterval(t)
      window.clearTimeout(stop)
    }
  }, [html])

  return (
    <iframe
      ref={ref}
      className="html-frame"
      title="Message content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={doc}
      style={{ height: h }}
      onLoad={measure}
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
  return <FullBody msg={msg} />
}

function FullBody({ msg }: { msg: Message }) {
  const [showQuote, setShowQuote] = useState(false)

  const view = useMemo(() => {
    if (msg.html) {
      const clean = sanitizeEmailHtml(msg.html, true)
      return { kind: 'html' as const, blocked: clean.blocked, ...splitQuotedHtml(clean.html) }
    }
    return { kind: 'text' as const, blocked: 0, ...splitQuotedText(msg.body) }
  }, [msg.html, msg.body])

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
