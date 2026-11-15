import type { Account, FolderId, Message } from '../types'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export type FolderSel = { kind: 'folder'; id: FolderId } | { kind: 'label'; id: string }

const FOLDERS: { id: FolderId; label: string; icon: IconName }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'drafts', label: 'Drafts', icon: 'draft' },
  { id: 'sent', label: 'Sent', icon: 'send' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'deleted', label: 'Deleted', icon: 'trash' },
]

interface Props {
  accounts: Account[]
  messages: Message[]
  activeAccountId: string
  selection: FolderSel
  labels: string[]
  onAccount: (id: string) => void
  onSelect: (s: FolderSel) => void
}

export function FolderPane({ accounts, messages, activeAccountId, selection, labels, onAccount, onSelect }: Props) {
  const unreadIn = (accountId: string, folder?: FolderId, label?: string): number =>
    messages.filter((m) => m.accountId === accountId && m.unread && (folder ? m.folder === folder : m.folder === 'inbox' && (!label || m.labels.includes(label)))).length

  return (
    <nav className="folders" aria-label="Mail folders">
      <div className="pane-title">Favourites</div>
      <ul className="folder-list fav">
        {FOLDERS.filter((f) => ['inbox', 'drafts', 'sent'].includes(f.id)).map((f) => {
          const count = f.id === 'inbox' ? unreadIn(activeAccountId, 'inbox') : 0
          const on = selection.kind === 'folder' && selection.id === f.id
          return (
            <li key={f.id}>
              <button type="button" className={`folder${on ? ' active' : ''}`} onClick={() => onSelect({ kind: 'folder', id: f.id })}>
                <Icon name={f.icon} size={16} />
                <span className="grow">{f.label}</span>
                {count > 0 && <span className="count">{count}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="pane-title">Mailboxes</div>
      {accounts.map((a) => {
        const active = a.id === activeAccountId
        const n = unreadIn(a.id, 'inbox')
        return (
          <div key={a.id}>
            <button type="button" className={`account${active ? ' active' : ''}`} onClick={() => onAccount(a.id)} aria-current={active}>
              <Icon name={a.shared ? 'users' : 'inbox'} size={16} />
              <span className="grow">
                <strong>{a.name}</strong>
                <small>{a.email}</small>
              </span>
              {n > 0 && <span className="badge">{n}</span>}
            </button>
            {active && (
              <ul className="folder-list">
                {FOLDERS.map((f) => {
                  const sel = selection.kind === 'folder' && selection.id === f.id
                  const count = f.id === 'inbox' ? unreadIn(a.id, 'inbox') : 0
                  return (
                    <li key={f.id}>
                      <button type="button" className={`folder${sel ? ' active' : ''}`} onClick={() => onSelect({ kind: 'folder', id: f.id })}>
                        <Icon name={f.icon} size={16} />
                        <span className="grow">{f.label}</span>
                        {count > 0 && <span className="count">{count}</span>}
                      </button>
                    </li>
                  )
                })}
                <li className="sub-title">Labels</li>
                {labels.map((l) => {
                  const sel = selection.kind === 'label' && selection.id === l
                  const count = unreadIn(a.id, undefined, l)
                  return (
                    <li key={l}>
                      <button type="button" className={`folder${sel ? ' active' : ''}`} onClick={() => onSelect({ kind: 'label', id: l })}>
                        <Icon name="tag" size={16} />
                        <span className="grow">{l}</span>
                        {count > 0 && <span className="count">{count}</span>}
                      </button>
                    </li>
                  )
                })}
                <li className="sub-title">Cases</li>
                <li>
                  <button type="button" className="folder disabled" disabled title="Case folders arrive in Phase 2 with the Reference Generator">
                    <Icon name="lock" size={16} />
                    <span className="grow">Case folders</span>
                    <small>Phase 2</small>
                  </button>
                </li>
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}
