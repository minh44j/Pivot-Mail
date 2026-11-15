import { useState } from 'react'
import type { Account, FolderId, Message } from '../types'
import { ContextMenu } from './ContextMenu'
import { Icon } from './Icon'
import type { IconName, Tone } from './Icon'

export type FolderSel = { accountId: string; kind: 'folder'; id: FolderId } | { accountId: string; kind: 'label'; id: string } | { accountId: string; kind: 'case'; id: string }

const FOLDERS: { id: FolderId; label: string; icon: IconName; tone: Tone }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox', tone: 'blue' },
  { id: 'archive', label: 'Archive', icon: 'archive', tone: 'purple' },
  { id: 'drafts', label: 'Drafts', icon: 'draft', tone: 'gray' },
  { id: 'sent', label: 'Sent', icon: 'send', tone: 'green' },
  { id: 'deleted', label: 'Deleted Items', icon: 'trash', tone: 'red' },
]

interface Props {
  accounts: Account[]
  onAddAccount: () => void
  onRemoveAccount: (id: string) => void
  messages: Message[]
  selection: FolderSel
  folders: Record<string, string[]>
  cases: Record<string, string[]>
  onFolderAction: (accountId: string, action: 'new' | 'rename' | 'delete', name?: string) => void
  onReorder: (accountId: string, name: string, before: string | null) => void
  onSelect: (s: FolderSel) => void
  onDropMessage: (messageIds: string[], target: FolderSel) => void
}

/** All mailboxes stay visible and expandable, Outlook-style: compact rows, counts on the right. */
export function FolderPane({ accounts, onAddAccount, onRemoveAccount, messages, selection, folders, cases, onFolderAction, onReorder, onSelect, onDropMessage }: Props) {
  const [accMenu, setAccMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; accountId: string; name: string } | null>(null)
  const [drag, setDrag] = useState<{ accountId: string; name: string } | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
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
      const ids = e.dataTransfer.getData('application/x-pivot-msg').split(',').filter(Boolean)
      if (ids.length > 0) onDropMessage(ids, target)
    },
  })

  const unread = (accountId: string, folder: FolderId): number => messages.filter((m) => m.accountId === accountId && m.folder === folder && m.unread).length
  const unreadLabel = (accountId: string, label: string): number =>
    messages.filter((m) => m.accountId === accountId && m.folder === 'inbox' && m.unread && m.labels.includes(label)).length
  const drafts = (accountId: string): number => messages.filter((m) => m.accountId === accountId && m.folder === 'drafts').length

  const isActive = (accountId: string, kind: 'folder' | 'label' | 'case', id: string): boolean => selection.accountId === accountId && selection.kind === kind && selection.id === id

  return (
    <nav className="folders" aria-label="Mail folders">
      {accounts.map((a) => {
        const open = !collapsed[a.id]
        return (
          <section key={a.id} className="mailbox" aria-label={a.name}>
            <div className="mailbox-row">
            <button type="button" className="mailbox-head" aria-expanded={open} onClick={() => setCollapsed((c) => ({ ...c, [a.id]: open }))}>
              <span className={`chev${open ? ' open' : ''}`}>
                <Icon name="chevron" size={12} />
              </span>
              <span className="grow">
                <strong>{a.name}</strong>
                <small>{a.email}</small>
              </span>
            </button>
            <button type="button" className="folder-more acc-more" aria-label={`Account options: ${a.name}`} aria-haspopup="menu" onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setAccMenu({ x: r.left, y: r.bottom + 2, id: a.id })
            }}>
              <Icon name="more" size={14} />
            </button>
            </div>
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
                {(folders[a.id] ?? []).map((l) => {
                  const count = unreadLabel(a.id, l)
                  const on = isActive(a.id, 'label', l)
                  const mine = drag?.accountId === a.id
                  return (
                    <li
                      key={l}
                      className={`custom${mine && slot === l ? ' slot' : ''}${drag?.name === l && mine ? ' dragging' : ''}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-pivot-folder', l)
                        e.dataTransfer.effectAllowed = 'move'
                        setDrag({ accountId: a.id, name: l })
                      }}
                      onDragEnd={() => {
                        setDrag(null)
                        setSlot(null)
                      }}
                      onDragOver={(e) => {
                        if (mine && e.dataTransfer.types.includes('application/x-pivot-folder')) {
                          e.preventDefault()
                          setSlot(l)
                        }
                      }}
                      onDrop={(e) => {
                        if (mine && drag && e.dataTransfer.types.includes('application/x-pivot-folder')) {
                          e.preventDefault()
                          onReorder(a.id, drag.name, l)
                          setDrag(null)
                          setSlot(null)
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setMenu({ x: e.clientX, y: e.clientY, accountId: a.id, name: l })
                      }}
                    >
                      <button type="button" className={`folder${on ? ' active' : ''}${over === `${a.id}/label:${l}` ? ' drop' : ''}`} aria-current={on} onClick={() => onSelect({ accountId: a.id, kind: 'label', id: l })} {...dropProps(`${a.id}/label:${l}`, { accountId: a.id, kind: 'label', id: l })}>
                        <Icon name="folder" size={15} tone="blue" />
                        <span className="grow">{l}</span>
                        {count > 0 && <span className="count">{count}</span>}
                      </button>
                      <button type="button" className="folder-more" aria-label={`Folder options: ${l}`} aria-haspopup="menu" onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect()
                        setMenu({ x: r.left, y: r.bottom + 2, accountId: a.id, name: l })
                      }}>
                        <Icon name="more" size={14} />
                      </button>
                    </li>
                  )
                })}
                {drag?.accountId === a.id && (
                  <li
                    className={`slot-end${slot === '\u0000end' ? ' slot' : ''}`}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/x-pivot-folder')) {
                        e.preventDefault()
                        setSlot('\u0000end')
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      onReorder(a.id, drag.name, null)
                      setDrag(null)
                      setSlot(null)
                    }}
                  />
                )}
                <li>
                  <button type="button" className="folder add" onClick={() => onFolderAction(a.id, 'new')}>
                    <Icon name="plus" size={15} tone="green" />
                    <span className="grow">New folder</span>
                  </button>
                </li>
                <li className="case-head">Cases</li>
                {(cases[a.id] ?? []).length === 0 && (
                  <li>
                    <span className="folder disabled">
                      <Icon name="hash" size={15} tone="gray" />
                      <span className="grow">No cases yet</span>
                    </span>
                  </li>
                )}
                {(cases[a.id] ?? []).slice(0, 12).map((c) => {
                  const on = isActive(a.id, 'case', c)
                  const n = messages.filter((m) => m.accountId === a.id && m.unread && m.folder !== 'deleted' && m.subject.includes(c)).length
                  return (
                    <li key={c}>
                      <button type="button" className={`folder${on ? ' active' : ''}`} aria-current={on} onClick={() => onSelect({ accountId: a.id, kind: 'case', id: c })}>
                        <Icon name="hash" size={15} tone={c.startsWith('PT') ? 'teal' : 'purple'} />
                        <span className="grow case-ref">{c}</span>
                        {n > 0 && <span className="count">{n}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
      <button type="button" className="folder add add-account" onClick={onAddAccount}>
        <Icon name="plus" size={15} tone="green" />
        <span className="grow">Add account</span>
      </button>
      {accMenu && (
        <ContextMenu
          x={accMenu.x}
          y={accMenu.y}
          onClose={() => setAccMenu(null)}
          entries={[{ type: 'item', label: 'Remove account…', icon: 'trash', tone: 'red', danger: true, onSelect: () => onRemoveAccount(accMenu.id) }]}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          entries={[
            { type: 'item', label: 'Rename…', icon: 'draft', tone: 'blue', onSelect: () => onFolderAction(menu.accountId, 'rename', menu.name) },
            { type: 'item', label: 'Move up', icon: 'chevron', disabled: (folders[menu.accountId] ?? [])[0] === menu.name, onSelect: () => { const l = folders[menu.accountId] ?? []; const i = l.indexOf(menu.name); onReorder(menu.accountId, menu.name, l[i - 1] ?? null) } },
            { type: 'item', label: 'Move down', icon: 'chevron', disabled: (folders[menu.accountId] ?? []).at(-1) === menu.name, onSelect: () => { const l = folders[menu.accountId] ?? []; const i = l.indexOf(menu.name); onReorder(menu.accountId, menu.name, l[i + 2] ?? null) } },
            { type: 'sep' },
            { type: 'item', label: 'Delete folder…', icon: 'trash', tone: 'red', danger: true, onSelect: () => onFolderAction(menu.accountId, 'delete', menu.name) },
          ]}
        />
      )}
      <p className="preview-note">Preview build · mock data</p>
    </nav>
  )
}
