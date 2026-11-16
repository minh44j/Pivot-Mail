import type { Message } from '../types'
import { Icon } from './Icon'

/** "Show original": the message as plain headers plus its source. Headers are simulated in the preview. */
export function OriginalDialog({ msg, onClose }: { msg: Message; onClose: () => void }) {
  const addr = (p: { name: string; email: string }) => `${p.name} <${p.email}>`
  const head = [
    `Message-ID: <${msg.id}@preview.pivot.example>   (simulated)`,
    `Date: ${new Date(msg.date).toUTCString()}`,
    `From: ${addr(msg.from)}`,
    `To: ${msg.to.map(addr).join(', ')}`,
    ...(msg.cc && msg.cc.length > 0 ? [`Cc: ${msg.cc.map(addr).join(', ')}`] : []),
    `Subject: ${msg.subject}`,
    `Content-Type: ${msg.html ? 'text/html' : 'text/plain'}; charset=UTF-8`,
    ...msg.attachments.map((a) => `X-Attachment: ${a.name} (${a.mime}, ${a.size} bytes)`),
  ].join('\n')
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orig-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="modal-head">
          <h2 id="orig-title">Original message</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close" autoFocus>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <pre className="original" tabIndex={0}>
            {head}
            {'\n\n'}
            {msg.html ?? msg.body}
          </pre>
        </div>
      </div>
    </div>
  )
}
