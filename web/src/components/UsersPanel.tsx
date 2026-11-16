import { useMemo, useState } from 'react'
import { SELF_EMAIL, SHARED_MAILBOXES, seedUsers } from '../data/users'
import type { AppUser, Role } from '../data/users'
import { COMPANIES } from '../data/companies'
import { EMAIL_RE } from '../data/contacts'
import { platform } from '../platform'
import { ConfirmDialog } from './ConfirmDialog'
import { ContextMenu } from './ContextMenu'
import { Icon } from './Icon'

const KEY = 'pm.users'

const isUsers = (v: unknown): v is AppUser[] =>
  Array.isArray(v) && v.every((u) => typeof u === 'object' && u !== null && typeof (u as AppUser).id === 'string' && typeof (u as AppUser).email === 'string' && Array.isArray((u as AppUser).shared))

function load(): AppUser[] {
  try {
    const raw = platform.storage.get(KEY)
    if (raw) {
      const v: unknown = JSON.parse(raw)
      if (isUsers(v)) return v
    }
  } catch {
    /* fall through to the sample list */
  }
  return seedUsers()
}

const company = (email: string) => COMPANIES.find((c) => email.toLowerCase().endsWith(`@${c.domain}`))
const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Never')

type Dlg =
  | { kind: 'invite' }
  | { kind: 'access'; id: string }
  | { kind: 'confirm'; id: string; action: 'remove' | 'disable' }

/** Admin-only user and role management. Preview: stored in this browser; the server will enforce roles. */
export function UsersPanel({ onToast }: { onToast: (m: string) => void }) {
  const [users, setUsersState] = useState<AppUser[]>(load)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [dlg, setDlg] = useState<Dlg | null>(null)

  const setUsers = (next: AppUser[]) => {
    setUsersState(next)
    platform.storage.set(KEY, JSON.stringify(next))
  }
  const update = (id: string, change: Partial<AppUser>) => setUsers(users.map((u) => (u.id === id ? { ...u, ...change } : u)))
  const activeAdmins = users.filter((u) => u.role === 'admin' && u.status === 'active')
  const isLastAdmin = (u: AppUser): boolean => u.role === 'admin' && u.status === 'active' && activeAdmins.length <= 1

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(t)) : users
  }, [users, q])

  const setRole = (u: AppUser, role: Role) => {
    if (u.role === role) return
    if (role === 'staff' && isLastAdmin(u)) return onToast('Keep at least one administrator')
    if (role === 'staff' && u.email === SELF_EMAIL) return onToast('You cannot remove your own administrator role. Ask another administrator.')
    update(u.id, { role })
    onToast(`${u.name} is now ${role === 'admin' ? 'an administrator' : 'staff'}`)
  }

  const act = (u: AppUser, action: 'enable' | 'disable' | 'remove' | 'resend') => {
    if (action === 'resend') return onToast(`Invitation sent again to ${u.email} (preview)`)
    if (action === 'enable') {
      update(u.id, { status: 'active' })
      return onToast(`${u.name} can sign in again`)
    }
    if (u.email === SELF_EMAIL) return onToast('You cannot disable or remove your own account')
    if (isLastAdmin(u)) return onToast('Keep at least one administrator')
    setDlg({ kind: 'confirm', id: u.id, action })
  }

  const counts = {
    active: users.filter((u) => u.status === 'active').length,
    invited: users.filter((u) => u.status === 'invited').length,
    disabled: users.filter((u) => u.status === 'disabled').length,
    admins: activeAdmins.length,
  }
  const target = (id: string) => users.find((u) => u.id === id)
  const menuUser = menu ? target(menu.id) : undefined

  return (
    <section className="card" aria-labelledby="h-users">
      <h2 id="h-users" className="card-title">
        Users and roles
      </h2>
      <p className="muted">
        Who can use Pivot Mail and what they can open. <strong>Administrators</strong> see Staff performance and manage users, shared templates and shared mailboxes. <strong>Staff</strong> use mail only.
      </p>
      <p className="notice" role="note">
        <strong>Preview.</strong> Changes here are saved in this browser only. The real version stores roles on the server and checks them on every request.
      </p>

      <div className="users-bar">
        <span className="users-sum">
          {counts.active} active · {counts.invited} invited · {counts.disabled} disabled · {counts.admins} admin{counts.admins === 1 ? '' : 's'}
        </span>
        <input type="search" className="users-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" />
        <button type="button" className="btn primary" onClick={() => setDlg({ kind: 'invite' })}>
          <Icon name="plus" size={16} /> Invite user
        </button>
      </div>

      <ul className="users-list" aria-label="Users">
        {shown.map((u) => {
          const co = company(u.email)
          return (
            <li key={u.id} className={`user ${u.status}`}>
              <span className="avatar" aria-hidden="true" data-tone={co?.id === 'tmc' ? 'teal' : 'blue'}>
                {u.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div className="user-id">
                <strong>
                  {u.name}
                  {u.email === SELF_EMAIL && <em> (you)</em>}
                </strong>
                <small>{u.email}</small>
              </div>
              <span className={`pill co-${co?.id ?? 'x'}`}>{co?.name.replace('Pivot ', '') ?? 'Other'}</span>
              <div className="seg" role="group" aria-label={`Role for ${u.name}`}>
                <button type="button" className={u.role === 'staff' ? 'on' : ''} aria-pressed={u.role === 'staff'} onClick={() => setRole(u, 'staff')} disabled={u.status === 'disabled'}>
                  Staff
                </button>
                <button type="button" className={u.role === 'admin' ? 'on' : ''} aria-pressed={u.role === 'admin'} onClick={() => setRole(u, 'admin')} disabled={u.status === 'disabled'}>
                  Admin
                </button>
              </div>
              <button type="button" className="link user-access" onClick={() => setDlg({ kind: 'access', id: u.id })} aria-label={`Shared mailboxes for ${u.name}`}>
                {u.shared.length === 0 ? 'No shared mailboxes' : u.shared.map((s) => SHARED_MAILBOXES.find((m) => m.id === s)?.name).join(', ')}
              </button>
              <span className={`status-chip ${u.status}`}>{u.status === 'active' ? `Active · ${when(u.lastActive)}` : u.status === 'invited' ? 'Invited' : 'Disabled'}</span>
              <button
                type="button"
                className="icon-btn user-more"
                style={{ display: 'inline-grid' }}
                aria-label={`Options for ${u.name}`}
                aria-haspopup="menu"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenu({ x: Math.max(8, r.right - 200), y: r.bottom + 4, id: u.id })
                }}
              >
                <Icon name="more" />
              </button>
            </li>
          )
        })}
        {shown.length === 0 && <li className="empty-row">No one matches “{q}”.</li>}
      </ul>

      {menu && menuUser && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          entries={[
            { type: 'item', label: 'Shared mailboxes…', icon: 'inbox', tone: 'blue', onSelect: () => setDlg({ kind: 'access', id: menuUser.id }) },
            ...(menuUser.status === 'invited' ? [{ type: 'item' as const, label: 'Resend invitation', icon: 'send' as const, tone: 'green' as const, onSelect: () => act(menuUser, 'resend') }] : []),
            { type: 'sep' },
            menuUser.status === 'disabled'
              ? { type: 'item', label: 'Enable sign-in', icon: 'check', tone: 'green', onSelect: () => act(menuUser, 'enable') }
              : { type: 'item', label: 'Disable sign-in…', icon: 'lock', tone: 'orange', onSelect: () => act(menuUser, 'disable') },
            { type: 'item', label: 'Remove user…', icon: 'trash', tone: 'red', danger: true, onSelect: () => act(menuUser, 'remove') },
          ]}
        />
      )}

      {dlg?.kind === 'invite' && (
        <InviteDialog
          existing={users.map((u) => u.email.toLowerCase())}
          onClose={() => setDlg(null)}
          onInvite={(u) => {
            setUsers([...users, u])
            setDlg(null)
            onToast(`Invitation sent to ${u.email} (preview)`)
          }}
        />
      )}
      {dlg?.kind === 'access' && target(dlg.id) && (
        <AccessDialog
          user={target(dlg.id) as AppUser}
          onClose={() => setDlg(null)}
          onSave={(shared) => {
            update(dlg.id, { shared })
            setDlg(null)
            onToast('Mailbox access updated')
          }}
        />
      )}
      {dlg?.kind === 'confirm' && target(dlg.id) && (
        <ConfirmDialog
          title={dlg.action === 'remove' ? 'Remove user' : 'Disable sign-in'}
          confirm={dlg.action === 'remove' ? 'Remove user' : 'Disable sign-in'}
          danger
          onClose={() => setDlg(null)}
          onConfirm={() => {
            const u = target(dlg.id) as AppUser
            if (dlg.action === 'remove') setUsers(users.filter((x) => x.id !== u.id))
            else update(u.id, { status: 'disabled' })
            setDlg(null)
            onToast(dlg.action === 'remove' ? `${u.name} removed` : `${u.name} can no longer sign in`)
          }}
        >
          {dlg.action === 'remove'
            ? `${target(dlg.id)?.name} loses access to Pivot Mail. Their Google account and mail are not touched.`
            : `${target(dlg.id)?.name} is signed out and cannot sign in until you enable them again. Nothing is deleted.`}
        </ConfirmDialog>
      )}
    </section>
  )
}

function InviteDialog({ existing, onInvite, onClose }: { existing: string[]; onInvite: (u: AppUser) => void; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [shared, setShared] = useState<string[]>([])
  const [error, setError] = useState('')

  const submit = () => {
    const v = email.trim().toLowerCase()
    if (!EMAIL_RE.test(v)) return setError('Enter a full email address')
    const co = company(v)
    if (!co) return setError('Only @pivottmc.com and @pivotscl.com addresses can be invited')
    if (existing.includes(v)) return setError('This person is already in the list')
    const nm = name.trim() || (v.split('@')[0] ?? v).replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    onInvite({ id: `u-${v}`, name: nm, email: v, role, status: 'invited', shared, lastActive: null })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inv-title"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="modal-head">
          <h2 id="inv-title">Invite user</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <label className="fld">
            <span>Work email</span>
            <input autoFocus type="email" value={email} onChange={(e) => (setEmail(e.target.value), setError(''))} placeholder="name@pivottmc.com or name@pivotscl.com" aria-invalid={Boolean(error)} autoComplete="off" />
            {error && <em className="err">{error}</em>}
          </label>
          <label className="fld">
            <span>Name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </label>
          <div className="fld">
            <span id="lbl-inv-role">Role</span>
            <div className="opts" role="radiogroup" aria-labelledby="lbl-inv-role">
              <button type="button" role="radio" aria-checked={role === 'staff'} className={`opt${role === 'staff' ? ' on' : ''}`} onClick={() => setRole('staff')}>
                Staff
              </button>
              <button type="button" role="radio" aria-checked={role === 'admin'} className={`opt${role === 'admin' ? ' on' : ''}`} data-tone="purple" onClick={() => setRole('admin')}>
                Administrator
              </button>
            </div>
          </div>
          <MailboxChecks value={shared} onChange={setShared} />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              Send invitation
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function MailboxChecks({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="checks">
      <legend>Shared mailboxes</legend>
      {SHARED_MAILBOXES.map((m) => (
        <label key={m.id} className="check">
          <input type="checkbox" checked={value.includes(m.id)} onChange={(e) => onChange(e.target.checked ? [...value, m.id] : value.filter((x) => x !== m.id))} />
          <span>
            {m.name} <small>{m.email}</small>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

function AccessDialog({ user, onSave, onClose }: { user: AppUser; onSave: (s: string[]) => void; onClose: () => void }) {
  const [shared, setShared] = useState(user.shared)
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acc2-title"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(shared)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="modal-head">
          <h2 id="acc2-title">Shared mailboxes · {user.name}</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <p className="muted">Their own mailbox is always theirs. Choose which shared mailboxes they can also open.</p>
          <MailboxChecks value={shared} onChange={setShared} />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" autoFocus>
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
