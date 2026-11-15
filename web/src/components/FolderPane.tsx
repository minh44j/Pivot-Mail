import { useState } from 'react'
import type { Account, FolderId, Message } from '../types'
import { Icon } from './Icon'
import type { IconName, Tone } from './Icon'

export type FolderSel = { accountId: string; kind: 'folder'; id: FolderId } | { accountId: string; kind: 'label'; id: string }

const FOLDERS: { id: FolderId; label: string; icon: IconName; tone: Tone }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox', tone: 'blue' },
  { id: 'archive', label: 'Archive', icon: 'archive', tone: 'purple' },
  { id: 'drafts', label: 'Drafts', icon: 'draft', tone: 'gray' },
  { id: 'sent', label: 'Sent', icon: 'send', tone: 'green' },
  { id: 'deleted', label: 'Deleted Items', icon: 'trash', tone: 'red' },
]

interface Props {
  accounts: Account[]
  messages: Message[]
  selection: FolderSel
  labels: string[]
  onSelect: (s: FolderSel) => void
  onDropMessage: (messageId: string, target: FolderSel) => void
}

/** All mailboxes stay visible and expandable, Outlook-style: compact rows, counts on the right. */
export function FolderPane({ accounts, messages, selection, labels, onSelect, onDropMessage }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [over, setOver] = useState<string | null>(null)

  const dropProps = (key: string, target: FolderSel) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('application/x-pivot-msg')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(key)
      }
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setOver(null)
      const id = e.dataTransfer.getData('application/x-pivot-msg')
      if (id) onDropMessage(id, target)
    },
  })

  const unread = (accountId: string, folder: FolderId): number => messages.filter((m) => m.accountId === accountId && m.folder === folder && m.unread).length
  const unreadLabel = (accountId: string, label: string): number =>
    messages.filter((m) => m.accountId === accountId && m.folder === 'inbox' && m.unread && m.labels.includes(label)).length
  const drafts = (accountId: string): number => messages.filter((m) => m.accountId === accountId && m.folder === 'drafts').length

  const isActive = (accountId: string, kind: 'folder' | 'label', id: string): boolean => selection.accountId === accountId && selection.kind === kind && selection.id === id

  return (
    <nav className="folders" aria-label="Mail folders">
      {accounts.map((a) => {
        const open = !collapsed[a.id]
        return (
          <section key={a.id} className="mailbox" aria-label={a.name}>
            <button type="button" className="mailbox-head" aria-expanded={open} onClick={() => setCollapsed((c) => ({ ...c, [a.id]: open }))}>
              <span className={`chev${open ? ' open' : ''}`}>
                <Icon name="chevron" size={12} />
              </span>
              <span className="grow">
                <strong>{a.name}</strong>
                <small>{a.email}</small>
              </span>
            </button>
            {open && (
              <ul className="folder-list">
                {FOLDERS.map((f) => {
                  const count = f.id === 'drafts' ? drafts(a.id) : f.id === 'inbox' ? unread(a.id, 'inbox') : 0
                  const on = isActive(a.id, 'folder', f.id)
                  return (
                    <li key={f.id}>
                      <button type="button" className={`folder${on ? ' active' : ''}${over === `${a.id}/${f.id}` ? ' drop' : ''}`} aria-current={on} onClick={() => onSelect({ accountId: a.id, kind: 'folder', id: f.id })} {...dropProps(`${a.id}/${f.id}`, { accountId: a.id, kind: 'folder', id: f.id })}>
                        <Icon name={f.icon} size={15} tone={f.tone} />
                        <span className="grow">{f.label}</span>
                        {count > 0 && <span className="count">{count}</span>}
                      </button>
                    </li>
                  )
                })}
                {labels.map((l) => {
                  const count = unreadLabel(a.id, l)
                  const on = isActive(a.id, 'label', l)
                  return (
                    <li key={l}>
                      <button type="button" className={`folder${on ? ' active' : ''}${over === `${a.id}/label:${l}` ? ' drop' : ''}`} aria-current={on} onClick={() => onSelect({ accountId: a.id, kind: 'label', id: l })} {...dropProps(`${a.id}/label:${l}`, { accountId: a.id, kind: 'label', id: l })}>
                        <Icon name="folder" size={15} tone="gray" />
                        <span className="grow">{l}</span>
                        {count > 0 && <span className="count">{count}</span>}
                      </button>
                    </li>
                  )
                })}
                <li>
                  <button type="button" className="folder disabled" disabled title="Case folders arrive in Phase 2 with the Reference Generator">
                    <Icon name="lock" size={15} tone="gray" />
                    <span className="grow">Cases</span>
                    <small>Phase 2</small>
                  </button>
                </li>
              </ul>
            )}
          </section>
        )
      })}
      <p className="preview-note">Preview build · mock data</p>
    </nav>
  )
}
