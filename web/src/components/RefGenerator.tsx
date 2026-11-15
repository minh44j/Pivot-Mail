import { useEffect, useRef, useState } from 'react'
import { CLIENTS, MODES, PLACES, SALESPEOPLE, SCOPES } from '../data/refdata'
import type { Mode, Scope } from '../data/refdata'
import { platform } from '../platform'
import { initials } from '../util'
import { Icon } from './Icon'

const TONES = ['blue', 'purple', 'green', 'orange', 'teal', 'red']

interface Props {
  onClose: () => void
  onToast: (m: string) => void
  onNewMail: (subject: string) => void
}

interface Result {
  ref: string
  subject: string
}

/*
  PREVIEW ONLY. The sequence below lives in this browser's storage and is NOT the
  company counter. It starts at 90000 so it can never collide with a real number.
  The real generator (single counter, both companies) is set up in Pivot OS later.
*/
const SEQ_KEY = 'pm.ref.seq'
const LAST_KEY = 'pm.ref.last'
const SEQ_START = 90000

function nextRef(): string {
  const seq = Number(platform.storage.get(SEQ_KEY) ?? SEQ_START) + 1
  platform.storage.set(SEQ_KEY, String(seq))
  const yy = String(new Date().getFullYear()).slice(-2)
  return `PS${yy}${String(seq).padStart(5, '0')}`
}

function readLast(): { ref: string; by: string } | null {
  try {
    const raw = platform.storage.get(LAST_KEY)
    return raw ? (JSON.parse(raw) as { ref: string; by: string }) : null
  } catch {
    return null
  }
}

export function RefGenerator({ onClose, onToast, onNewMail }: Props) {
  const [client, setClient] = useState('')
  const [scope, setScope] = useState<Scope>('freight-clearance')
  const [mode, setMode] = useState<Mode>('sea')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cargo, setCargo] = useState('')
  const [notes, setNotes] = useState('')
  const [sales, setSales] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [last, setLast] = useState(readLast)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const places = PLACES[mode]
  const valid = (v: string) => places.some((p) => p.toLowerCase() === v.trim().toLowerCase())
  const canon = (v: string) => places.find((p) => p.toLowerCase() === v.trim().toLowerCase()) ?? v.trim()

  const generate = () => {
    const e: Record<string, string> = {}
    if (!client.trim()) e.client = 'Enter the client'
    else if (!CLIENTS.some((c) => c.toLowerCase() === client.trim().toLowerCase())) e.client = 'Choose a client from the list'
    if (!valid(from)) e.from = 'Choose a standard name from the list'
    if (!valid(to)) e.to = 'Choose a standard name from the list'
    if (!e.from && !e.to && from.trim().toLowerCase() === to.trim().toLowerCase()) e.to = 'Origin and destination must differ'
    if (!sales) e.sales = 'Choose the salesperson'
    setErrors(e)
    if (Object.keys(e).length > 0) return

    const ref = nextRef()
    const clientName = CLIENTS.find((c) => c.toLowerCase() === client.trim().toLowerCase()) ?? client.trim()
    const subject = `[${ref}] ${clientName} – ${canon(from)} → ${canon(to)}`
    const by = SALESPEOPLE.find((s) => s.id === sales)?.name ?? ''
    platform.storage.set(LAST_KEY, JSON.stringify({ ref, by }))
    setLast({ ref, by })
    setResult({ ref, subject })
  }

  const copy = async (text: string, what: string) => {
    const ok = await platform.copyText(text)
    onToast(ok ? `${what} copied` : 'Copy was blocked by the browser')
  }

  const reset = () => {
    setResult(null)
    setClient('')
    setFrom('')
    setTo('')
    setCargo('')
    setNotes('')
    setSales('')
    setErrors({})
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ref-title">
        <header className="modal-head">
          <h2 id="ref-title">Reference number</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <p className="notice" role="note">
          <strong>Preview only.</strong> These numbers are generated in this browser and are not registered in Pivot OS. Do not use them on real jobs.
        </p>

        {result ? (
          <div className="modal-body">
            <p className="muted">Reference for {client.trim()}</p>
            <div className="ref-out" aria-live="polite">
              {result.ref}
            </div>
            <p className="ref-subject">{result.subject}</p>
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={() => void copy(result.ref, 'Reference')}>
                Copy reference
              </button>
              <button type="button" className="btn" onClick={() => void copy(result.subject, 'Subject')}>
                Copy subject
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onNewMail(result.subject)
                  onClose()
                }}
              >
                New mail with subject
              </button>
            </div>
            <button type="button" className="btn quiet" onClick={reset}>
              Generate another
            </button>
          </div>
        ) : (
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault()
              generate()
            }}
            noValidate
          >
            <label className="fld">
              <span>Client</span>
              <input ref={first} list="ref-clients" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Start typing a company…" aria-invalid={Boolean(errors.client)} autoComplete="off" />
              <datalist id="ref-clients">
                {CLIENTS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {errors.client && <em className="err">{errors.client}</em>}
            </label>

            <div className="fld">
              <span id="lbl-scope">What are we handling?</span>
              <div className="opts" role="radiogroup" aria-labelledby="lbl-scope">
                {SCOPES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={scope === s.id} className={`opt${scope === s.id ? ' on' : ''}`} data-tone={s.tone} onClick={() => setScope(s.id)}>
                    <Icon name={s.icon} size={16} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fld">
              <span id="lbl-mode">Moves by</span>
              <div className="opts" role="radiogroup" aria-labelledby="lbl-mode">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    className={`opt${mode === m.id ? ' on' : ''}`}
                    data-tone={m.tone}
                    onClick={() => {
                      setMode(m.id)
                      setFrom('')
                      setTo('')
                    }}
                  >
                    <Icon name={m.icon} size={16} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fld-row">
              <label className="fld">
                <span>From</span>
                <input list="ref-places" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Port or place" aria-invalid={Boolean(errors.from)} autoComplete="off" />
                {errors.from && <em className="err">{errors.from}</em>}
              </label>
              <label className="fld">
                <span>To</span>
                <input list="ref-places" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Port or place" aria-invalid={Boolean(errors.to)} autoComplete="off" />
                {errors.to && <em className="err">{errors.to}</em>}
              </label>
              <datalist id="ref-places">
                {places.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <label className="fld">
              <span>Cargo and notes (optional)</span>
              <input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="e.g. 2×40HQ machinery, ~46 CBM" />
            </label>
            <label className="fld">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything ops should know" aria-label="Notes for operations" />
            </label>

            <div className="fld">
              <span id="lbl-sales">Salesperson</span>
              <div className="sp-row" role="radiogroup" aria-labelledby="lbl-sales">
                {SALESPEOPLE.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={sales === s.id} className={`sp${sales === s.id ? ' on' : ''}`} onClick={() => setSales(s.id)}>
                    <span className="avatar" data-tone={TONES[s.id.charCodeAt(0) % TONES.length]}>
                      {initials(s.name)}
                    </span>
                    <small>{s.name}</small>
                  </button>
                ))}
              </div>
              {errors.sales && <em className="err">{errors.sales}</em>}
            </div>

            <button type="submit" className="btn primary wide">
              Generate number
            </button>
            {last && (
              <p className="muted last">
                Last issued (preview) <code>{last.ref}</code> · {last.by}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
