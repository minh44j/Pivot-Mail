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
/** How long each card stays (kept in step with App's timers): problems linger, a card with an action waits for the click. */
const lifeOf = (n: Notice): number => (n.kind === 'error' ? 9 : n.action ? 7 : 3.5)

export function Notices({ notices, onDismiss, lead }: Props) {
  if (notices.length === 0 && !lead) return null
  /** Closing slides the card away first, then removes it. */
  const close = (el: HTMLElement | null, id: number) => {
    el?.closest('.status-card')?.classList.add('out')
    window.setTimeout(() => onDismiss(id), 180)
  }
  return (
    <div className="notices" aria-live="polite">
      {lead}
      {notices.map((n) => (
        <div key={n.id} className={`status-card ${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'} style={{ ['--life' as string]: `${lifeOf(n)}s` }}>
          <span className="status-card-icon" aria-hidden="true">
            {n.kind === 'progress' ? <span className="spinner" /> : <Icon name={n.kind === 'success' ? 'check' : n.kind === 'error' ? 'important' : 'bell'} size={16} />}
          </span>
          <span className="status-card-text">{n.text}</span>
          {n.action && (
            <button
              type="button"
              className="status-card-action"
              onClick={(e) => {
                n.action?.onClick()
                close(e.currentTarget, n.id)
              }}
            >
              {n.action.label}
            </button>
          )}
          {n.kind !== 'progress' && (
            <button type="button" className="status-card-x" aria-label="Dismiss" onClick={(e) => close(e.currentTarget, n.id)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
