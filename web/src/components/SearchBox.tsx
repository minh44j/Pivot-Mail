import { useMemo, useState } from 'react'
import { MOD } from '../shortcuts'
import { suggestContacts } from '../data/contacts'
import { Icon } from './Icon'

const OPERATORS: { op: string; desc: string; needsValue: boolean }[] = [
  { op: 'from:', desc: 'Sender name or address', needsValue: true },
  { op: 'to:', desc: 'Recipient name or address', needsValue: true },
  { op: 'subject:', desc: 'Words in the subject', needsValue: true },
  { op: 'label:', desc: 'Folder label, e.g. Clients', needsValue: true },
  { op: 'has:attachment', desc: 'Has an attachment', needsValue: false },
  { op: 'is:unread', desc: 'Unread only', needsValue: false },
  { op: 'is:flagged', desc: 'Flagged for follow up', needsValue: false },
]

interface Item {
  key: string
  group: string
  label: string
  hint?: string
  /** New full query when chosen */
  next: string
  /** Whole searches (recent, saved) run straight away */
  run: boolean
  icon: 'search' | 'flag' | 'users' | 'hash'
  removeSaved?: string
}

interface Props {
  query: string
  onQuery: (q: string) => void
  recent: string[]
  saved: string[]
  searchAll: boolean
  onSearchAll: (v: boolean) => void
  onCommit: (q: string) => void
  onSave: (q: string) => void
  onRemoveSaved: (q: string) => void
  registerSearch: (el: HTMLInputElement | null) => void
}

export function SearchBox(p: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const items = useMemo<Item[]>(() => {
    const q = p.query
    const head = q.replace(/\S*$/, '')
    const tok = q.slice(head.length)
    const low = tok.toLowerCase()
    const out: Item[] = []
    if (q.trim() === '') {
      for (const r of p.recent.slice(0, 8)) out.push({ key: `r:${r}`, group: 'Recent', label: r, next: r, run: true, icon: 'search' })
      for (const s of p.saved) out.push({ key: `s:${s}`, group: 'Saved searches', label: s, next: s, run: true, icon: 'flag', removeSaved: s })
      if (out.length === 0) for (const o of OPERATORS.slice(0, 4)) out.push({ key: `o:${o.op}`, group: 'Narrow down', label: o.op, hint: o.desc, next: o.op, run: false, icon: 'hash' })
      return out
    }
    const m = /^(from|to):(.*)$/i.exec(tok)
    if (m) {
      for (const c of suggestContacts(m[2] ?? '', [], 5)) out.push({ key: `c:${c.email}`, group: 'People', label: c.name, hint: c.email, next: `${head}${(m[1] ?? '').toLowerCase()}:${c.email} `, run: false, icon: 'users' })
      return out
    }
    if (tok && !tok.includes(':')) {
      for (const o of OPERATORS) if (o.op.startsWith(low) || (o.op.includes(':') && o.op.split(':')[1]?.startsWith(low) && low.length > 2)) out.push({ key: `o:${o.op}`, group: 'Narrow down', label: o.op, hint: o.desc, next: `${head}${o.op}${o.needsValue ? '' : ' '}`, run: false, icon: 'hash' })
    }
    return out
  }, [p.query, p.recent, p.saved])

  const shown = open && items.length > 0
  const choose = (it: Item) => {
    p.onQuery(it.next)
    if (it.run) p.onCommit(it.next)
    setActive(-1)
    document.querySelector<HTMLInputElement>('.tb-search input')?.focus()
  }

  let lastGroup = ''
  return (
    <label className="tb-search">
      <Icon name="search" size={15} />
      <input
        ref={(el) => p.registerSearch(el)}
        type="search"
        value={p.query}
        role="combobox"
        aria-expanded={shown}
        aria-controls="search-suggest"
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setActive(-1)
        }}
        onChange={(e) => {
          p.onQuery(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
            if (p.query) p.onQuery('')
            else {
              e.currentTarget.blur()
              document.querySelector<HTMLElement>('.scroller')?.focus()
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (shown) setActive((a) => (a + 1 >= items.length ? 0 : a + 1))
            else document.querySelector<HTMLElement>('.scroller')?.focus()
          } else if (e.key === 'ArrowUp' && shown) {
            e.preventDefault()
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const it = shown ? items[active] : undefined
            if (it) choose(it)
            else {
              if (p.query.trim()) p.onCommit(p.query.trim())
              setOpen(false)
              document.querySelector<HTMLElement>('.scroller')?.focus()
            }
          } else if (e.key === 'Tab' && shown && active >= 0) {
            e.preventDefault()
            const it = items[active]
            if (it) choose(it)
          }
        }}
        placeholder="Search mail, people, subjects, reference numbers (e.g. PS2600721)…"
        aria-label="Search mail. Try from:, to:, subject:, has:attachment, is:unread"
      />
      <kbd className="tb-kbd" aria-hidden="true">{MOD === "Ctrl" ? "Ctrl K" : `${MOD}K`}</kbd>
      {open && (
        <div className="suggest" id="search-suggest" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? <div className="suggest-head">{it.group}</div> : null
            lastGroup = it.group
            return (
              <div key={it.key}>
                {head}
                <div className={`suggest-item${i === active ? ' on' : ''}`} role="option" aria-selected={i === active}>
                  <button type="button" className="suggest-main" onClick={() => choose(it)}>
                    <Icon name={it.icon} size={14} />
                    <span className="suggest-label">{it.label}</span>
                    {it.hint && <small>{it.hint}</small>}
                  </button>
                  {it.removeSaved && (
                    <button type="button" className="suggest-x" aria-label={`Remove saved search ${it.label}`} onClick={() => p.onRemoveSaved(it.removeSaved as string)}>
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <div className="suggest-foot">
            <div className="seg" role="group" aria-label="Search scope">
              <button type="button" aria-pressed={!p.searchAll} className={!p.searchAll ? 'on' : ''} onClick={() => p.onSearchAll(false)}>
                This folder
              </button>
              <button type="button" aria-pressed={p.searchAll} className={p.searchAll ? 'on' : ''} onClick={() => p.onSearchAll(true)}>
                All folders
              </button>
            </div>
            {p.query.trim() !== '' && !p.saved.includes(p.query.trim()) && (
              <button type="button" className="link" onClick={() => p.onSave(p.query.trim())}>
                Save this search
              </button>
            )}
          </div>
        </div>
      )}
    </label>
  )
}
