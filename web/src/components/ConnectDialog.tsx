import { useState } from 'react'
import { COMPANIES } from '../data/companies'
import type { CompanyId } from '../data/companies'
import { connectUrl } from '../auth'
import { BrandLogo } from './BrandLogo'
import { Icon } from './Icon'
import { GoogleG } from './SignIn'

interface Props {
  isAdmin: boolean
  /** Pre-select when reconnecting an existing mailbox */
  initial?: { company: CompanyId; kind: 'personal' | 'shared' }
  onClose: () => void
}

/** Real "Add account": the person chooses which company and what kind of mailbox, then Google asks for permission. */
export function ConnectDialog({ isAdmin, initial, onClose }: Props) {
  const [company, setCompany] = useState<CompanyId | null>(initial?.company ?? null)
  const [kind, setKind] = useState<'personal' | 'shared'>(initial?.kind ?? 'personal')
  const co = COMPANIES.find((c) => c.id === company)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal small cn-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cn-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="modal-head cn-head">
          <BrandLogo word={false} />
          <div className="grow">
            <h2 id="cn-title">Add account</h2>
            <p className="cn-sub">{co ? `A mailbox in ${co.name}` : 'Connect another mailbox to Pivot Mail'}</p>
          </div>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          {!co ? (
            <>
              <p className="cn-q">Which company is the mailbox in?</p>
              <div className="co-pick" role="group" aria-label="Company">
                {COMPANIES.map((c) => (
                  <button key={c.id} type="button" className="co-card" onClick={() => setCompany(c.id)}>
                    <span className="co-ic" data-co={c.id}>
                      <Icon name={c.id === 'tmc' ? 'plane' : 'ship'} size={20} />
                    </span>
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
              <div className="fld">
                <span id="lbl-cn-kind">This is a</span>
                <div className="opts" role="radiogroup" aria-labelledby="lbl-cn-kind">
                  <button type="button" role="radio" aria-checked={kind === 'personal'} className={`opt${kind === 'personal' ? ' on' : ''}`} onClick={() => setKind('personal')}>
                    <Icon name="users" size={16} />
                    Personal mailbox
                  </button>
                  <button type="button" role="radio" aria-checked={kind === 'shared'} className={`opt${kind === 'shared' ? ' on' : ''}`} data-tone="purple" onClick={() => setKind('shared')} disabled={!isAdmin}>
                    <Icon name="inbox" size={16} />
                    Shared mailbox
                  </button>
                </div>
                {!isAdmin && <small>Only administrators can add a shared mailbox.</small>}
              </div>
              <p className="muted">
                Google will ask you to sign in to a <strong>@{co.domain}</strong> account and allow Pivot Mail to read and manage its mail. {kind === 'personal' ? 'It stays private to you. This can be a second account of your own in the other company.' : 'Sign in as the shared mailbox itself.'} You can remove it at any time.
              </p>
              <div className="modal-actions">
                {!initial && (
                  <button type="button" className="btn" onClick={() => setCompany(null)}>
                    Back
                  </button>
                )}
                <a className="si-google" href={connectUrl(co.id, kind)} autoFocus>
                  <GoogleG />
                  Continue with Google
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
