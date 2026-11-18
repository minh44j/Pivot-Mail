import { Icon } from './Icon'

interface BannerProps {
  kind: 'offline' | 'syncfail' | 'ratelimit'
  detail?: string
  /** Real mail: changes and sending need a connection (nothing is queued) */
  real?: boolean
  last: Date
  seconds: number
  busy: boolean
  onRetry: () => void
}

/** One slim banner under the toolbar. Polite live region so screen readers hear it once. */
export function StatusBanner({ kind, detail, real, last, seconds, busy, onRetry }: BannerProps) {
  const time = last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const text =
    kind === 'offline'
      ? real
        ? 'You are offline. You can keep reading the mail on this device. Moving, deleting and sending need a connection, so do those once you are back online.'
        : 'You are offline. You can keep reading and organising. Changes sync when you reconnect, and sending waits until then.'
      : kind === 'syncfail'
        ? `Couldn't sync with Google${detail ? ` (${detail})` : ''}. Showing mail from ${time}.`
        : `Google is limiting requests. Sync is paused and retries automatically in ${seconds}s.`
  return (
    <div className={`status-banner ${kind}`} role="status" aria-live="polite">
      <Icon name={kind === 'offline' ? 'lock' : kind === 'ratelimit' ? 'bell' : 'important'} size={16} />
      <span className="grow">{text}</span>
      {kind !== 'offline' && (
        <button type="button" className="link" onClick={onRetry} disabled={busy}>
          {busy ? 'Retrying…' : kind === 'ratelimit' ? 'Retry now' : 'Retry'}
        </button>
      )}
    </div>
  )
}

interface ScreenProps {
  kind: 'expired' | 'denied'
  account: string
  onAction: () => void
}

/** Full-screen account problems. Wording says what happened, what is safe, and the next step. */
export function StatusScreen({ kind, account, onAction }: ScreenProps) {
  return (
    <main className="status-screen">
      <div className="status-card" role="alert">
        <span className={`status-icon ${kind}`} aria-hidden="true">
          <Icon name={kind === 'expired' ? 'lock' : 'important'} size={26} />
        </span>
        {kind === 'expired' ? (
          <>
            <h1>Your session has expired</h1>
            <p>For security, Pivot Mail signs you out after a period away. Nothing was lost: drafts and unsent changes on this device are kept.</p>
            <button type="button" className="btn primary" onClick={onAction}>
              Sign in again
            </button>
          </>
        ) : (
          <>
            <h1>Access denied</h1>
            <p>
              {account} is not allowed to use Pivot Mail. Sign in with your Pivot Google Workspace account, or ask your administrator to add you.
            </p>
            <button type="button" className="btn primary" onClick={onAction}>
              Use a different account
            </button>
          </>
        )}
      </div>
    </main>
  )
}
