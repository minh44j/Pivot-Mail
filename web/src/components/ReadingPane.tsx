import { useState } from 'react'
import type { Attachment, Message } from '../types'
import { formatFullDate, initials } from '../util'
import { AttachmentBar } from './AttachmentBar'
import { Icon } from './Icon'

interface Props {
  messages: Message[]
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
  onBack: () => void
  onToast: (m: string) => void
  onForwardWith: (files: Attachment[]) => void
}

export function ReadingPane({ messages, onReply, onReplyAll, onForward, onBack, onToast, onForwardWith }: Props) {
  const lastId = messages[messages.length - 1]?.id ?? ''
  // Reset expansion when the conversation changes, derived during render (no effect).
  const [state, setState] = useState<{ key: string; open: Set<string> }>({ key: lastId, open: new Set([lastId]) })
  if (state.key !== lastId) setState({ key: lastId, open: new Set([lastId]) })
  const open = state.open
  const setOpen = (fn: (prev: Set<string>) => Set<string>) => setState((s) => ({ ...s, open: fn(s.open) }))

  if (messages.length === 0) {
    return (
      <section className="reader empty-reader" aria-label="Reading pane">
        <div className="empty">Select a message to read</div>
      </section>
    )
  }

  const subject = messages[messages.length - 1]?.subject ?? ''
  return (
    <section className="reader" aria-label="Reading pane">
      <header className="reader-head">
        <button type="button" className="icon-btn only-mobile" onClick={onBack} aria-label="Back to list">
          <Icon name="back" />
        </button>
        <h2>{subject}</h2>
      </header>
      <div className="reader-actions">
        <button type="button" onClick={onReply}>
          <Icon name="reply" size={16} /> Reply
        </button>
        <button type="button" onClick={onReplyAll}>
          <Icon name="replyAll" size={16} /> Reply all
        </button>
        <button type="button" onClick={onForward}>
          <Icon name="forward" size={16} /> Forward
        </button>
      </div>
      <div className="reader-scroll">
        {messages.map((m) => {
          const expanded = open.has(m.id)
          return (
            <article key={m.id} className={`msg${expanded ? ' open' : ''}`}>
              <button
                type="button"
                className="msg-head"
                aria-expanded={expanded}
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev)
                    if (next.has(m.id)) next.delete(m.id)
                    else next.add(m.id)
                    return next
                  })
                }
              >
                <span className="avatar big" aria-hidden="true">
                  {initials(m.from.name)}
                </span>
                <span className="grow">
                  <strong>{m.from.name}</strong> <small>&lt;{m.from.email}&gt;</small>
                  <small className="block">
                    To: {m.to.map((t) => t.email).join(', ')} · {formatFullDate(m.date)}
                  </small>
                </span>
                {m.attachments.length > 0 && <Icon name="clip" size={14} />}
              </button>
              {expanded && (
                <>
                  <AttachmentBar attachments={m.attachments} onToast={onToast} onForwardWith={onForwardWith} />
                  {/* Plain text for now. Real HTML mail will render in a sandboxed iframe after sanitising. */}
                  <div className="msg-body">{m.body}</div>
                </>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
