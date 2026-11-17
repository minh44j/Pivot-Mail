import type { ReactNode } from 'react'
import { Icon } from './Icon'

export type NoticeKind = 'success' | 'error' | 'info' | 'progress'

export interface Notice {
  id: number
  kind: NoticeKind
  text: string
  action?: { label: string; onClick: () => void }
}

interface Props {
  notices: Notice[]
  onDismiss: (id: number) => void
  /** A card that stays while something is in progress (sending) */
  lead?: ReactNode
}

/** Status cards for what just happened (sent, draft saved, not sent, synced). Errors are announced at once and stay until dismissed or they time out. */
export function Notices({ notices, onDismiss, lead }: Props) {
  if (notices.length === 0 && !lead) return null
  return (
    <div className="notices" aria-live="polite">
      {lead}
      {notices.map((n) => (
        <div key={n.id} className={`status-card ${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
          <span className="status-card-icon" aria-hidden="true">
            {n.kind === 'progress' ? <span className="spinner" /> : <Icon name={n.kind === 'success' ? 'check' : n.kind === 'error' ? 'important' : 'bell'} size={16} />}
          </span>
          <span className="status-card-text">{n.text}</span>
          {n.action && (
            <button
              type="button"
              className="status-card-action"
              onClick={() => {
                n.action?.onClick()
                onDismiss(n.id)
              }}
            >
              {n.action.label}
            </button>
          )}
          {n.kind !== 'progress' && (
            <button type="button" className="status-card-x" aria-label="Dismiss" onClick={() => onDismiss(n.id)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
