import { useState } from 'react'
import type { CaseRecord } from '../cases'
import { TRAVEL_CATEGORIES, SCOPES, MODES } from '../data/refdata'
import { platform } from '../platform'
import { Icon } from './Icon'

interface Props {
  c: CaseRecord
  onSave: (change: { notes?: string; status?: 'open' | 'closed' }) => Promise<boolean>
  onNewMail: (subject: string) => void
  onToast: (m: string) => void
}

/** The case's own page: what it is, who opened it, a shared notes box, and the reference/subject for emails. */
export function CasePanel({ c, onSave, onNewMail, onToast }: Props) {
  const [notes, setNotes] = useState(c.notes)
  const [busy, setBusy] = useState(false)
  const d = c.details
  const title =
    c.kind === 'travel'
      ? (TRAVEL_CATEGORIES.find((x) => x.id === d.category)?.label ?? d.category ?? '')
      : `${d.origin ?? ''} → ${d.destination ?? ''}`
  const subject = `[${c.ref}] ${c.client} – ${title}`
  const when = new Date(c.openedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const copy = async (text: string, what: string) => onToast((await platform.copyText(text)) ? `${what} copied` : 'Copy was blocked by the browser')
  const save = async (change: { notes?: string; status?: 'open' | 'closed' }) => {
    setBusy(true)
    const ok = await onSave(change)
    setBusy(false)
    onToast(ok ? 'Saved' : 'Could not save. Please try again.')
  }

  const rows: [string, string][] =
    c.kind === 'travel'
      ? [['Category', String(title)]]
      : [
          ['Handling', SCOPES.find((x) => x.id === d.scope)?.label ?? d.scope ?? ''],
          ['Moves by', MODES.find((x) => x.id === d.mode)?.label ?? d.mode ?? ''],
          ['Route', `${d.origin ?? ''} → ${d.destination ?? ''}`],
          ...(d.cargo ? ([['Cargo', d.cargo]] as [string, string][]) : []),
          ...(d.salesperson ? ([['Salesperson', d.salesperson]] as [string, string][]) : []),
        ]

  return (
    <section className="case-panel" aria-label={`Case ${c.ref}`}>
      <header className="case-head">
        <div className="grow">
          <h2>
            <span className="case-ref">{c.ref}</span> <span className={`case-status ${c.status}`}>{c.status === 'open' ? 'Open' : 'Closed'}</span>
          </h2>
          <p className="case-client">{c.client}</p>
        </div>
      </header>
      <dl className="case-facts">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div>
          <dt>Opened</dt>
          <dd>
            {when}
            {c.openedBy ? ` by ${c.openedBy.name}` : ''}
          </dd>
        </div>
      </dl>
      {c.provisional && (
        <p className="notice" role="note">
          Provisional number: Pivot OS numbering is not connected yet.
        </p>
      )}
      <div className="case-actions">
        <button type="button" className="btn" onClick={() => void copy(c.ref, 'Reference')}>
          <Icon name="copy" size={16} /> Copy reference
        </button>
        <button type="button" className="btn" onClick={() => void copy(subject, 'Subject')}>
          <Icon name="copy" size={16} /> Copy subject
        </button>
        <button type="button" className="btn primary" onClick={() => onNewMail(subject)}>
          <Icon name="compose" size={16} /> New mail with subject
        </button>
      </div>
      <label className="fld">
        <span>Team notes</span>
        <textarea rows={5} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the team should know about this job" />
      </label>
      <div className="case-actions">
        <button type="button" className="btn" disabled={busy || notes === c.notes} onClick={() => void save({ notes })}>
          Save notes
        </button>
        <button type="button" className="btn quiet" disabled={busy} onClick={() => void save({ status: c.status === 'open' ? 'closed' : 'open' })}>
          {c.status === 'open' ? 'Close case' : 'Reopen case'}
        </button>
      </div>
      <p className="muted">Emails join this case when their subject contains {c.ref}.</p>
    </section>
  )
}
