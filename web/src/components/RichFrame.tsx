import { useEffect, useRef, useState } from 'react'
import type { RichKind } from '../data/mockfile'

/**
 * Word, Excel, PowerPoint, attached mails, ZIP and TIFF, shown by the sealed preview page (preview.html): a frame with
 * scripts but no origin of its own (sandbox="allow-scripts", never allow-same-origin), so the readers that open a stranger's
 * file cannot reach Pivot Mail, the sign-in or the mail. The file is handed over once the page says it is ready.
 */
export function RichFrame({ kind, bytes, name, onKey }: { kind: RichKind; bytes: Uint8Array; name: string; onKey?: (key: 'Escape' | 'ArrowLeft' | 'ArrowRight') => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading')
  const keyRef = useRef(onKey)
  useEffect(() => {
    keyRef.current = onKey
  })
  useEffect(() => {
    let sent = false
    const onMessage = (e: MessageEvent) => {
      const win = frame.current?.contentWindow
      if (!win || e.source !== win) return
      const d = e.data as { type?: string; state?: string; key?: string } | null
      if (d?.type === 'pm-preview-key') {
        if (d.key === 'Escape' || d.key === 'ArrowLeft' || d.key === 'ArrowRight') keyRef.current?.(d.key)
        return
      }
      if (d?.type !== 'pm-preview-state') return
      if (d.state === 'ready' && !sent) {
        sent = true
        const copy = bytes.slice().buffer
        // The sealed page has no origin that could be named here; the frame only ever holds preview.html (CSP frame-src).
        win.postMessage({ type: 'pm-preview', kind, name, bytes: copy }, '*', [copy])
      } else if (d.state === 'shown') setState('shown')
      else if (d.state === 'failed') setState('failed')
    }
    window.addEventListener('message', onMessage)
    // A preview page that never answers (blocked, or the network gone) is reported instead of loading for ever.
    const t = window.setTimeout(() => setState((s) => (s === 'loading' ? 'failed' : s)), 15000)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(t)
    }
  }, [kind, bytes, name])
  return (
    <div className="rich-wrap">
      {state === 'loading' && (
        <p className="muted rich-note" role="status">
          Loading…
        </p>
      )}
      {state === 'failed' && (
        <p className="muted rich-note" role="status">
          Can't show this file. Try Download.
        </p>
      )}
      <iframe ref={frame} className={`rich-frame${state === 'shown' ? ' on' : ''}`} sandbox="allow-scripts" src="./preview.html" title={`Preview of ${name}`} />
    </div>
  )
}
