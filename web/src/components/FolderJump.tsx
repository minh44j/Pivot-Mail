import { useEffect, useMemo, useRef, useState } from 'react'
import type { Account, FolderId } from '../types'
import { Icon } from './Icon'
import type { IconName, Tone } from './Icon'
import type { FolderSel } from './FolderPane'

interface Props {
  mode: 'go' | 'move'
  accounts: Account[]
  folders: Record<string, string[]>
  cases: Record<string, string[]>
  caseNames?: Record<string, string>
  /** Move mode only shows this mailbox. */
  accountId: string
  onPick: (s: FolderSel) => void
  onClose: () => void
}

const FOLDERS: { id: FolderId; label: string; icon: IconName; tone: Tone }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox', tone: 'blue' },
  { id: 'archive', label: 'Archive', icon: 'archive', tone: 'purple' },
  { id: 'drafts', label: 'Drafts', icon: 'draft', tone: 'gray' },
  { id: 'sent', label: 'Sent', icon: 'send', tone: 'green' },
  { id: 'deleted', label: 'Deleted Items', icon: 'trash', tone: 'red' },
  { id: 'snoozed', label: 'Snoozed', icon: 'clock', tone: 'orange' },
  { id: 'scheduled', label: 'Scheduled', icon: 'clock', tone: 'blue' },
]

interface Item {
  sel: FolderSel
  label: string
  sub: string
  icon: IconName
  tone: Tone
}

/** "Go to folder" (Ctrl+Y) and "Move to folder" (Ctrl+Shift+V): type to filter, arrows, Enter. */
export function FolderJump({ mode, accounts, folders, cases, caseNames, accountId, onPick, onClose }: Props) {
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const all = useMemo<Item[]>(() => {
    const out: Item[] = []
    if (mode === 'go' && accounts.length > 1) {
      out.push({ sel: { accountId, kind: 'all', id: 'inbox' }, label: 'All inboxes', sub: `${accounts.length} mailboxes`, icon: 'inbox', tone: 'blue' })
      out.push({ sel: { accountId, kind: 'all', id: 'sent' }, label: 'All sent', sub: `${accounts.length} mailboxes`, icon: 'send', tone: 'green' })
      out.push({ sel: { accountId, kind: 'all', id: 'drafts' }, label: 'All drafts', sub: `${accounts.length} mailboxes`, icon: 'draft', tone: 'gray' })
    }
    for (const a of accounts) {
      if (mode === 'move' && a.id !== accountId) continue
      for (const f of FOLDERS.filter((x) => mode === 'go' || (x.id !== 'snoozed' && x.id !== 'scheduled'))) out.push({ sel: { accountId: a.id, kind: 'folder', id: f.id }, label: f.label, sub: a.email, icon: f.icon, tone: f.tone })
      for (const l of folders[a.id] ?? []) out.push({ sel: { accountId: a.id, kind: 'label', id: l }, label: l, sub: a.email, icon: 'folder', tone: 'gray' })
      if (mode === 'go') for (const c of cases[a.id] ?? []) out.push({ sel: { accountId: a.id, kind: 'case', id: c }, label: caseNames?.[c] ? `${c} · ${caseNames[c]}` : c, sub: `Case · ${a.email}`, icon: 'hash', tone: c.startsWith('PT') ? 'teal' : 'purple' })
    }
    return out
  }, [accounts, folders, cases, caseNames, mode, accountId])

  const items = useMemo(() => {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return words.length > 0 ? all.filter((i) => words.every((w) => `${i.label} ${i.sub}`.toLowerCase().includes(w))) : all
  }, [all, text])

  useEffect(() => input.current?.focus(), [])

  const choose = (i: Item | undefined) => {
    if (!i) return
    onPick(i.sel)
    onClose()
  }

  return (
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal jump"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'go' ? 'Go to folder' : 'Move to folder'}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      >
        <input
          ref={input}
          autoFocus
          className="jump-input"
          value={text}
          placeholder={mode === 'go' ? 'Go to folder…' : 'Move to folder…'}
          aria-label={mode === 'go' ? 'Go to folder' : 'Move to folder'}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(items.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(items[active])
            }
          }}
        />
        <ul className="jump-list" role="listbox" aria-label="Folders">
          {items.length === 0 && <li className="jump-empty">No folder matches</li>}
          {items.map((i, n) => (
            <li key={`${i.sel.accountId}/${i.sel.kind}/${i.sel.id}`} role="option" aria-selected={n === active} className={n === active ? 'on' : ''} onMouseEnter={() => setActive(n)} onClick={() => choose(i)}>
              <Icon name={i.icon} size={15} tone={i.tone} />
              <span>{i.label}</span>
              <small>{i.sub}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
