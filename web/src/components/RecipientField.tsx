import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { EMAIL_RE, bareAddress, displayName, suggestContacts } from '../data/contacts'
import { Icon } from './Icon'

interface Props {
  label: string
  /** Comma separated addresses. The text after the last separator is what is still being typed. */
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
  rightSlot?: ReactNode
}

const SEP = /[;,\n]/

const join = (chips: string[], pending: string): string => chips.join(', ') + (chips.length > 0 ? ', ' : '') + pending

/** To, Cc and Bcc: recipient chips plus suggestions from contacts. Works from a plain string so drafts and replies stay simple. */
export function RecipientField({ label, value, onChange, autoFocus, rightSlot }: Props) {
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const [closed, setClosed] = useState(false)
  const [recents, setRecents] = useState(false)

  const { chips, pending } = useMemo(() => {
    const parts = value.split(SEP)
    const last = parts.pop() ?? ''
    return { chips: parts.map((p) => p.trim()).filter(Boolean), pending: last.replace(/^\s+/, '') }
  }, [value])

  const suggestions = useMemo(() => suggestContacts(pending, chips.map(bareAddress)), [pending, chips])
  // Suggestions open while typing, or on ArrowDown for recent contacts. They never cover the message just because the field has focus.
  const open = focused && !closed && suggestions.length > 0 && (pending.trim() !== '' || recents)
  const safeActive = Math.min(active, suggestions.length - 1)

  const setPending = (text: string) => {
    setClosed(false)
    setRecents(false)
    setActive(0)
    if (SEP.test(text)) {
      const tokens = text.split(SEP)
      const rest = tokens.pop() ?? ''
      onChange(join([...chips, ...tokens.map((t) => t.trim()).filter(Boolean)], rest))
    } else onChange(join(chips, text))
  }

  const choose = (email: string) => {
    setRecents(false)
    onChange(join([...chips, email], ''))
    setActive(0)
  }

  const commitPending = () => {
    if (pending.trim()) onChange(join([...chips, pending.trim()], ''))
  }

  return (
    <div className="field recip">
      <label className="field-inner">
        <span>{label}</span>
        <span className="rwrap">
          {chips.map((c, i) => {
            const addr = bareAddress(c)
            const bad = !EMAIL_RE.test(addr)
            return (
              <span key={`${c}-${i}`} className={`rchip${bad ? ' bad' : ''}`}>
                <span>{bad ? c : displayName(addr)}</span>
                {bad && <span className="sr-only"> (not a valid address)</span>}
                <button type="button" aria-label={`Remove ${c}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(join(chips.filter((_, k) => k !== i), pending))}>
                  <Icon name="close" size={10} />
                </button>
              </span>
            )
          })}
          <input
            value={pending}
            autoFocus={autoFocus}
            inputMode="email"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-label={label}
            onChange={(e) => setPending(e.target.value)}
            onFocus={() => {
              setFocused(true)
              setClosed(false)
            }}
            onBlur={() => {
              setFocused(false)
              setRecents(false)
              commitPending()
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text/plain')
              if (SEP.test(text)) {
                e.preventDefault()
                setPending(pending + text)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && suggestions.length > 0) {
                e.preventDefault()
                setClosed(false)
                setRecents(true)
                setActive((a) => Math.min(suggestions.length - 1, a + 1))
              } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if ((e.key === 'Enter' || e.key === 'Tab') && pending.trim()) {
                const pick = open ? suggestions[safeActive] : undefined
                if (pick) {
                  e.preventDefault()
                  choose(pick.email)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  commitPending()
                }
              } else if (e.key === 'Backspace' && !pending && chips.length > 0) {
                e.preventDefault()
                onChange(join(chips.slice(0, -1), ''))
              } else if (e.key === 'Escape' && open) {
                e.preventDefault()
                e.stopPropagation()
                setClosed(true)
              }
            }}
          />
        </span>
      </label>
      {rightSlot}
      {open && (
        <ul className="recip-pop" role="listbox" aria-label={`${label} suggestions`}>
          {suggestions.map((c, i) => (
            <li key={c.email} role="option" aria-selected={i === safeActive} className={i === safeActive ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(c.email)}>
              <span className="avatar">{c.name.slice(0, 1)}</span>
              <span className="grow">
                <strong>{c.name}</strong>
                <small>{c.email}</small>
              </span>
              {c.company && <small>{c.company}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
