import { useEffect, useMemo, useState } from 'react'
import { PEOPLE_ERRORS, changePerson, fetchPeople } from '../users'
import type { PersonRow, SharedBox } from '../users'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'

const CO = { scl: 'Shipping', tmc: 'Travel' } as const
const day = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** The people who have signed in: role, access and mailboxes. Real data from the server, administrators only. */
export function RealUsers({ onToast }: { onToast: (m: string) => void }) {
  const [people, setPeople] = useState<PersonRow[] | null>(null)
  const [you, setYou] = useState('')
  const [sharedBoxes, setSharedBoxes] = useState<SharedBox[]>([])
  const [access, setAccess] = useState<PersonRow | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState<{ p: PersonRow; to: 'disabled' | 'active' } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () =>
    void fetchPeople().then((r) => {
      if (r.ok) {
        setPeople(r.data.users)
        setYou(r.data.you)
        setSharedBoxes(r.data.shared ?? [])
        setFailed(null)
      } else setFailed(PEOPLE_ERRORS[r.error] ?? PEOPLE_ERRORS.unavailable ?? 'Could not load the people.')
    })
  useEffect(() => {
    load()
  }, [])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (people ?? []).filter((p) => !t || `${p.name} ${p.email}`.toLowerCase().includes(t))
  }, [people, q])
  const count = useMemo(() => {
    const l = people ?? []
    return { active: l.filter((p) => p.status !== 'disabled').length, off: l.filter((p) => p.status === 'disabled').length, admins: l.filter((p) => p.role === 'admin' && p.status !== 'disabled').length }
  }, [people])

  const apply = async (p: PersonRow, change: { role?: 'admin' | 'staff'; status?: 'active' | 'disabled'; shared?: string[] }, done: string) => {
    setBusy(p.id)
    const r = await changePerson(p.id, change)
    setBusy(null)
    if (!r.ok) return onToast(PEOPLE_ERRORS[r.error] ?? PEOPLE_ERRORS.unavailable ?? 'Could not save.')
    onToast(done)
    load()
  }

  return (
    <section className="card" aria-labelledby="h-users">
      <h2 id="h-users" className="card-title">
        Users and roles
      </h2>
      <p className="muted">
        Everyone with a <strong>pivotscl.com</strong> or <strong>pivottmc.com</strong> account can sign in and starts as Staff. <strong>Administrators</strong> see Staff performance, manage this list, shared templates and shared mailboxes.
        Turn someone off when they leave: they are signed out at once and nothing is deleted.
      </p>

      {failed && (
        <p className="signin-error" role="alert">
          {failed}
        </p>
      )}
      {!people && !failed && (
        <p className="muted" role="status">
          Loading the people…
        </p>
      )}

      {people && (
        <>
          <div className="users-bar">
            <span className="users-sum">
              {count.active} with access · {count.off} turned off · {count.admins} administrator{count.admins === 1 ? '' : 's'}
            </span>
            <input type="search" className="users-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" />
          </div>

          <ul className="users-list" aria-label="Users">
            {shown.map((u) => {
              const me = u.id === you
              const off = u.status === 'disabled'
              const own = u.mailboxes.filter((m) => m.kind === 'personal').length
              const shared = u.mailboxes.filter((m) => m.kind === 'shared')
              return (
                <li key={u.id} className={`user ${off ? 'disabled' : 'active'}`}>
                  <span className="avatar" aria-hidden="true" data-tone={u.company === 'tmc' ? 'teal' : 'blue'}>
                    {u.name
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('') || '?'}
                  </span>
                  <div className="user-id">
                    <strong>
                      {u.name || u.email}
                      {me && <em> (you)</em>}
                    </strong>
                    <small>{u.email}</small>
                  </div>
                  <span className={`pill co-${u.company}`}>{CO[u.company]}</span>
                  <div className="seg" role="group" aria-label={`Role for ${u.name || u.email}`}>
                    <button type="button" className={u.role === 'staff' ? 'on' : ''} aria-pressed={u.role === 'staff'} disabled={off || me || u.roleLocked || busy === u.id} onClick={() => void apply(u, { role: 'staff' }, `${u.name || u.email} is now staff`)}>
                      Staff
                    </button>
                    <button type="button" className={u.role === 'admin' ? 'on' : ''} aria-pressed={u.role === 'admin'} disabled={off || me || busy === u.id} onClick={() => void apply(u, { role: 'admin' }, `${u.name || u.email} is now an administrator`)}>
                      Admin
                    </button>
                  </div>
                  <button type="button" className="link user-access" onClick={() => setAccess(u)} aria-label={`Shared mailboxes for ${u.name || u.email}`} disabled={off}>
                    {own === 0 && shared.length === 0 ? 'No mailbox connected yet' : `${own} own${shared.length > 0 ? ` · shared: ${shared.map((s) => s.email.split('@')[0]).join(', ')}` : ' · no shared mailbox'}`}
                  </button>
                  <span className={`status-chip ${off ? 'disabled' : 'active'}`}>{off ? 'Turned off' : u.lastSeenAt ? `Active · ${day(u.lastSeenAt)}` : 'Never signed in'}</span>
                  <button type="button" className="btn" disabled={me || busy === u.id} onClick={() => (off ? void apply(u, { status: 'active' }, `${u.name || u.email} can sign in again`) : setConfirm({ p: u, to: 'disabled' }))}>
                    {off ? 'Turn on' : 'Turn off'}
                  </button>
                </li>
              )
            })}
            {shown.length === 0 && <li className="empty-row">{people.length === 0 ? 'Nobody has signed in yet.' : `No one matches “${q}”.`}</li>}
          </ul>
        </>
      )}

      {access && (
        <SharedDialog
          person={access}
          boxes={sharedBoxes}
          onClose={() => setAccess(null)}
          onSave={(ids) => {
            const p = access
            setAccess(null)
            void apply(p, { shared: ids }, `Shared mailboxes updated for ${p.name || p.email}`)
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Turn off access"
          confirm="Turn off"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm
            setConfirm(null)
            void apply(c.p, { status: 'disabled' }, `${c.p.name || c.p.email} can no longer sign in`)
          }}
        >
          {confirm.p.name || confirm.p.email} is signed out at once and cannot sign in until you turn them on again. Their mail, their Google account and the cases they opened are not touched.
        </ConfirmDialog>
      )}
    </section>
  )
}

/** Tick the shared mailboxes a person may open. Their own mailbox is always theirs and is not listed. */
function SharedDialog({ person, boxes, onSave, onClose }: { person: PersonRow; boxes: SharedBox[]; onSave: (ids: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>(person.mailboxes.filter((m) => m.kind === 'shared').map((m) => m.id))
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sh-title"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(picked)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="modal-head">
          <h2 id="sh-title">Shared mailboxes · {person.name || person.email}</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <p className="muted">Their own mailbox is always theirs. Choose which shared mailboxes they can also open and work in.</p>
          {boxes.length === 0 ? (
            <p className="notice" role="note">
              There is no shared mailbox yet. Add one from the folder list: <strong>Add account</strong>, then choose <strong>Shared mailbox</strong> and sign in as that mailbox.
            </p>
          ) : (
            <fieldset className="checks">
              <legend>Shared mailboxes</legend>
              {boxes.map((b) => (
                <label key={b.id} className="check">
                  <input type="checkbox" checked={picked.includes(b.id)} onChange={() => toggle(b.id)} />
                  <span>
                    {b.name} <small>{b.email}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" autoFocus disabled={boxes.length === 0}>
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
