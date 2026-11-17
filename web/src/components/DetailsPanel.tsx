import { formatSize } from '../util'
import type { Message } from '../types'
import type { CaseRecord } from '../cases'
import { Icon } from './Icon'

interface Props {
  open: boolean
  onToggle: () => void
  thread: Message[]
  /** Case records from the database (real mode). The preview only knows the reference number. */
  cases?: CaseRecord[]
  onOpenCase: (ref: string) => void
}

const REF = /\bP[ST]\d{7}\b/g

const label = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Facts about the open conversation: its reference number, client, category, status and files. Folds away to a thin rail. */
export function DetailsPanel({ open, onToggle, thread, cases, onOpenCase }: Props) {
  if (!open) {
    return (
      <div className="details closed" role="group" aria-label="Details">
        <button type="button" className="details-rail" onClick={onToggle} aria-expanded="false" aria-label="Show details">
          <Icon name="expand" size={16} />
          <span>Details</span>
        </button>
      </div>
    )
  }

  const refs = [...new Set(thread.flatMap((m) => m.subject.match(REF) ?? []))]
  const main = refs[0]
  const rec = main ? cases?.find((c) => c.ref === main) : undefined
  const files = thread.flatMap((m) => m.attachments)
  const bytes = files.reduce((n, f) => n + f.size, 0)
  const category = rec ? (rec.kind === 'travel' ? label(rec.details.category ?? '') : [label(rec.details.mode ?? ''), label(rec.details.scope ?? '')].filter(Boolean).join(' · ')) : ''

  return (
    <div className="details" role="group" aria-label="Details">
      <div className="details-head">
        <h3>Details</h3>
        <button type="button" className="details-fold" onClick={onToggle} aria-expanded="true" aria-label="Hide details">
          <Icon name="collapse" size={16} />
        </button>
      </div>
      <dl className="details-list">
        <div>
          <dt>Reference</dt>
          <dd>{main ? <span className="ref-chip">{main}</span> : <span className="muted">None in the subject</span>}</dd>
        </div>
        {main && (
          <>
            <div>
              <dt>Client</dt>
              <dd>{rec ? rec.client : <span className="muted">Not recorded</span>}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{category || <span className="muted">Not recorded</span>}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{rec ? <span className={`status-dot ${rec.status}`}>{rec.status === 'open' ? 'Open' : 'Closed'}</span> : <span className="muted">Not recorded</span>}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Attachments</dt>
          <dd>{files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} (${formatSize(bytes)})` : <span className="muted">None</span>}</dd>
        </div>
      </dl>
      {refs.length > 1 && (
        <div className="details-more">
          <small>Also mentioned</small>
          <div className="details-refs">
            {refs.slice(1).map((r) => (
              <button key={r} type="button" className="ref-chip" onClick={() => onOpenCase(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
      {main && (
        <button type="button" className="details-open" onClick={() => onOpenCase(main)}>
          Open case page
        </button>
      )}
    </div>
  )
}
