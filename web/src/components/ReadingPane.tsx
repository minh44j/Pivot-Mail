import { useState } from 'react'
import type { Attachment, Message } from '../types'
import { formatFullDate, initials } from '../util'
import { AttachmentBar } from './AttachmentBar'
import { Icon } from './Icon'
import { MessageBody } from './MessageBody'

interface Props {
  messages: Message[]
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
  onBack: () => void
  onToast: (m: string) => void
  onForwardWith: (files: Attachment[]) => void
  onDelete: () => void
  onFlag: () => void
  onUnread: () => void
  flagged: boolean
  unread: boolean
  onEditDraft: () => void
  onMore: (x: number, y: number) => void
  onReplyTo: (all: boolean, m: Message) => void
  onForwardMsg: (m: Message) => void
  onMoreMsg: (m: Message, x: number, y: number) => void
  banner?: { text: string; actions: { label: string; onClick: () => void }[] }
  /** Shown instead of "Select a message to read" (for example the case page) */
  placeholder?: React.ReactNode
  onPrint?: () => void
  onPopout?: () => void
  /** Side panel (details of the case), shown next to the conversation */
  details?: React.ReactNode
}

export function ReadingPane({ messages, onReply, onReplyAll, onForward, onBack, onToast, onForwardWith, onDelete, onFlag, onUnread, flagged, unread, onEditDraft, onMore, onReplyTo, onForwardMsg, onMoreMsg, banner, placeholder, onPrint, onPopout, details }: Props) {
  const lastId = messages[messages.length - 1]?.id ?? ''
  // Reset expansion when the conversation changes, derived during render (no effect).
  const [state, setState] = useState<{ key: string; open: Set<string> }>({ key: lastId, open: new Set([lastId]) })
  if (state.key !== lastId) setState({ key: lastId, open: new Set([lastId]) })
  const open = state.open
  const setOpen = (fn: (prev: Set<string>) => Set<string>) => setState((s) => ({ ...s, open: fn(s.open) }))

  if (messages.length === 0) {
    return (
      <section className="reader empty-reader" aria-label="Reading pane">
        {placeholder ?? <div className="empty">Select a message to read</div>}
      </section>
    )
  }

  const subject = messages[messages.length - 1]?.subject ?? ''
  const isDraft = messages[messages.length - 1]?.folder === 'drafts'
  return (
    <section className="reader" aria-label="Reading pane">
      <header className="reader-head">
        <button type="button" className="icon-btn only-mobile" onClick={onBack} aria-label="Back to list">
          <Icon name="back" />
        </button>
        <h2>{subject}</h2>
        <div className="reader-actions">
          {/* Reply, Reply all and Forward on the subject row, where the eye already is (Minhaj 2026-11-22; they were at the very
              bottom of the conversation). The words hide when the pane is narrow; the names stay for screen readers. */}
          {!isDraft && (
            <>
              <button type="button" className="ra-reply" onClick={onReply} aria-label="Reply" title="Reply">
                <Icon name="reply" size={16} /> <span className="ra-label">Reply</span>
              </button>
              <button type="button" className="ra-reply" onClick={onReplyAll} aria-label="Reply all" title="Reply all">
                <Icon name="replyAll" size={16} /> <span className="ra-label">Reply all</span>
              </button>
              <button type="button" className="ra-reply" onClick={onForward} aria-label="Forward" title="Forward">
                <Icon name="forward" size={16} /> <span className="ra-label">Forward</span>
              </button>
            </>
          )}
          {isDraft && (
            <button type="button" className="primary" onClick={onEditDraft}>
              <Icon name="draft" size={16} /> Continue editing
            </button>
          )}
          {onPopout && (
            <button type="button" className="ra-icon" onClick={onPopout} aria-label="Open in a new window">
              <Icon name="popout" size={18} />
            </button>
          )}
          {onPrint && (
            <button type="button" className="ra-icon" onClick={onPrint} aria-label="Print">
              <Icon name="print" size={18} />
            </button>
          )}
          {!isDraft && (
            <button
              type="button"
              className="ra-icon"
              aria-label="More actions"
              aria-haspopup="menu"
              onClick={(e) => {
                const b = e.currentTarget.getBoundingClientRect()
                onMore(Math.max(8, b.right - 230), b.bottom + 4)
              }}
            >
              <Icon name="more" size={18} />
            </button>
          )}
          <span className="reader-touch">
            <button type="button" onClick={onDelete} aria-label="Delete">
              <Icon name="trash" size={18} tone="red" />
            </button>
            <button type="button" onClick={onFlag} aria-label={flagged ? 'Remove flag' : 'Flag'} aria-pressed={flagged}>
              <Icon name="flag" size={18} tone="orange" />
            </button>
            <button type="button" onClick={onUnread} aria-label={unread ? 'Mark as read' : 'Mark as unread'}>
              <Icon name="eye" size={18} tone="blue" />
            </button>
          </span>
        </div>
      </header>
      {banner && (
        <div className="reader-banner" role="status">
          <span className="grow">{banner.text}</span>
          {banner.actions.map((x) => (
            <button key={x.label} type="button" className="link" onClick={x.onClick}>
              {x.label}
            </button>
          ))}
        </div>
      )}
      <div className="reader-body">
      <div className="reader-scroll" tabIndex={-1}>
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
                    To: {m.to.map((t) => t.email).join(', ')}
                    {m.cc && m.cc.length > 0 && <> · Cc: {m.cc.map((t) => t.email).join(', ')}</>} · {formatFullDate(m.date)}
                  </small>
                </span>
                {(m.attachments.length > 0 || m.hasAttachments) && <Icon name="clip" size={14} />}
              </button>
              {expanded && (
                <>
                  {messages.length > 1 && !isDraft && (
                    <div className="msg-actions" role="toolbar" aria-label={`Actions for the message from ${m.from.name}`}>
                      <button type="button" data-tone="blue" onClick={() => onReplyTo(false, m)} aria-label={`Reply to ${m.from.name}`}>
                        <Icon name="reply" size={15} /> Reply
                      </button>
                      <button type="button" data-tone="blue" onClick={() => onReplyTo(true, m)} aria-label={`Reply all to ${m.from.name}`}>
                        <Icon name="replyAll" size={15} /> Reply all
                      </button>
                      <button type="button" data-tone="blue" onClick={() => onForwardMsg(m)} aria-label={`Forward the message from ${m.from.name}`}>
                        <Icon name="forward" size={15} /> Forward
                      </button>
                      <button
                        type="button"
                        data-tone="gray"
                        aria-label={`More actions for the message from ${m.from.name}`}
                        aria-haspopup="menu"
                        onClick={(e) => {
                          const b = e.currentTarget.getBoundingClientRect()
                          onMoreMsg(m, Math.max(8, b.right - 230), b.bottom + 4)
                        }}
                      >
                        <Icon name="more" size={15} />
                      </button>
                    </div>
                  )}
                  <AttachmentBar attachments={m.attachments} zipName={`${m.subject} attachments`} onToast={onToast} onForwardWith={onForwardWith} />
                  <MessageBody msg={m} />
                </>
              )}
            </article>
          )
        })}
      </div>
      {details}
      </div>
    </section>
  )
}
