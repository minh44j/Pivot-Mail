import { useEffect, useRef, useState } from 'react'
import { COMPANIES } from '../data/companies'
import type { CompanyId } from '../data/companies'
import { EMAIL_RE } from '../data/contacts'
import { Icon } from './Icon'

export interface NewAccount {
  email: string
  shared: boolean
  company: CompanyId
}

export type AccountDialogState = { mode: 'add' } | { mode: 'remove'; id: string; name: string; email: string }

interface Props {
  state: AccountDialogState
  existing: string[]
  onAdd: (a: NewAccount) => void
  onRemove: (id: string) => void
  onClose: () => void
}

/** Add account (preview: a mock sign-in) and Remove account confirmation. */
export function AccountDialog({ state, existing, onAdd, onRemove, onClose }: Props) {
  const [company, setCompany] = useState<CompanyId | null>(null)
  const [email, setEmail] = useState('')
  const [shared, setShared] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (company) input.current?.focus()
  }, [company])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const co = COMPANIES.find((c) => c.id === company)

  const connect = () => {
    if (!co) return
    const v = email.trim().toLowerCase()
    if (!EMAIL_RE.test(v)) return setError('Enter a full email address')
    const domain = v.split('@')[1] ?? ''
    if (!COMPANIES.some((c) => c.domain === domain)) return setError('Only @pivottmc.com and @pivotscl.com accounts can be added')
    if (domain !== co.domain) return setError(`This is a ${domain} address. Go back and choose ${COMPANIES.find((c) => c.domain === domain)?.name}.`)
    if (existing.includes(v)) return setError('This account is already added')
    setError('')
    setBusy(true)
    timer.current = window.setTimeout(() => onAdd({ email: v, shared, company: co.id }), 1100)
  }

  const title = state.mode === 'remove' ? 'Remove account' : 'Add account'
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acc-title"
        onSubmit={(e) => {
          e.preventDefault()
          if (state.mode === 'remove') onRemove(state.id)
          else if (co) connect()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <header className="modal-head">
          <h2 id="acc-title">{title}</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">
          {state.mode === 'remove' ? (
            <>
              <p>
                Remove <strong>{state.name}</strong> ({state.email}) from Pivot Mail? Its local copy of the mail on this device is deleted. Nothing is deleted from Google; you can add the account again at any time.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn primary danger" autoFocus>
                  Remove account
                </button>
              </div>
            </>
          ) : !co ? (
            <>
              <p className="muted">Which company is the account in?</p>
              <div className="co-pick" role="group" aria-label="Company">
                {COMPANIES.map((c) => (
                  <button key={c.id} type="button" className="co-card" onClick={() => setCompany(c.id)}>
                    <Icon name={c.id === 'tmc' ? 'plane' : 'ship'} size={20} tone={c.id === 'tmc' ? 'teal' : 'blue'} />
                    <span className="grow">
                      <strong>{c.name}</strong>
                      <small>@{c.domain}</small>
                    </span>
                    <Icon name="chevron" size={14} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="notice" role="note">
                <strong>Preview.</strong> No real Google sign-in happens yet. The mailbox opens empty.
              </p>
              <label className="fld">
                <span>Google account ({co.name})</span>
                <input ref={input} type="email" value={email} onChange={(e) => (setEmail(e.target.value), setError(''))} placeholder={`name@${co.domain}`} aria-invalid={Boolean(error)} autoComplete="off" disabled={busy} />
                {error && <em className="err">{error}</em>}
              </label>
              <div className="fld">
                <span id="lbl-acc-type">This is a</span>
                <div className="opts" role="radiogroup" aria-labelledby="lbl-acc-type">
                  <button type="button" role="radio" aria-checked={!shared} className={`opt${!shared ? ' on' : ''}`} onClick={() => setShared(false)} disabled={busy}>
                    <Icon name="users" size={16} />
                    Personal mailbox
                  </button>
                  <button type="button" role="radio" aria-checked={shared} className={`opt${shared ? ' on' : ''}`} data-tone="purple" onClick={() => setShared(true)} disabled={busy}>
                    <Icon name="inbox" size={16} />
                    Shared mailbox
                  </button>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setCompany(null)} disabled={busy}>
                  Back
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Connecting…' : 'Continue with Google'}
                </button>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
