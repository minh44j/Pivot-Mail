import { useEffect, useRef, useState } from 'react'
import { CLIENTS, MODES, PLACES, SALESPEOPLE, SCOPES, TRAVEL_CATEGORIES, TRAVEL_CLIENTS } from '../data/refdata'
import type { Mode, Scope, TravelCategory } from '../data/refdata'
import { platform } from '../platform'
import type { NewCase } from '../cases'
import { initials } from '../util'
import { Icon } from './Icon'

const TONES = ['blue', 'purple', 'green', 'orange', 'teal', 'red']

export interface RefAnchor {
  left: number
  right: number
  bottom: number
}

interface Props {
  onClose: () => void
  /** Opens as a panel hanging from this button (wide screens); without it, as a dialog */
  anchor?: RefAnchor | null
  onToast: (m: string) => void
  onNewMail: (subject: string) => void
  /** Signed-in use: numbers are issued by the server and the case is saved for the whole team */
  real?: { company: 'scl' | 'tmc'; onCreate: (c: NewCase) => Promise<{ ok: true; ref: string } | { ok: false; message: string }> }
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

type Company = 'shipping' | 'travel'

/** Shipping numbers are PSyyNNNNN, Travel numbers are PTyyNNNNN. Each has its own preview counter. */
function nextRef(company: Company): string {
  const key = company === 'travel' ? `${SEQ_KEY}.pt` : SEQ_KEY
  const seq = Number(platform.storage.get(key) ?? SEQ_START) + 1
  platform.storage.set(key, String(seq))
  const yy = String(new Date().getFullYear()).slice(-2)
  return `${company === 'travel' ? 'PT' : 'PS'}${yy}${String(seq).padStart(5, '0')}`
}

function readLast(): { ref: string; by: string } | null {
  try {
    const raw = platform.storage.get(LAST_KEY)
    return raw ? (JSON.parse(raw) as { ref: string; by: string }) : null
  } catch {
    return null
  }
}

export function RefGenerator({ onClose, anchor, onToast, onNewMail, real }: Props) {
  const panel = Boolean(anchor) && window.innerWidth >= 900
  const PANEL_W = Math.min(780, window.innerWidth - 16)
  const [company, setCompany] = useState<Company>(real ? (real.company === 'tmc' ? 'travel' : 'shipping') : 'shipping')
  const [existing, setExisting] = useState('')
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState<TravelCategory>('flight')
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

  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // As a panel there is no backdrop: a click anywhere else closes it (the Ref No. button toggles it itself).
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (panel && !box.current?.contains(t) && !t.closest('[data-ref-anchor]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose, panel])
  const left = anchor ? Math.max(8, Math.min(anchor.right - PANEL_W, window.innerWidth - PANEL_W - 8)) : 0
  const top = anchor ? anchor.bottom + 8 : 0

  const places = PLACES[mode]
  const valid = (v: string) => places.some((p) => p.toLowerCase() === v.trim().toLowerCase())
  const canon = (v: string) => places.find((p) => p.toLowerCase() === v.trim().toLowerCase()) ?? v.trim()

  const generate = async () => {
    const e: Record<string, string> = {}
    const travel = company === 'travel'
    if (real) {
      if (client.trim().length < 2) e.client = 'Enter the client'
      if (!travel) {
        if (from.trim().length < 2) e.from = 'Enter where it starts'
        if (to.trim().length < 2) e.to = 'Enter where it goes'
        if (!e.from && !e.to && from.trim().toLowerCase() === to.trim().toLowerCase()) e.to = 'Origin and destination must differ'
      }
      setErrors(e)
      if (Object.keys(e).length > 0 || busy) return
      setBusy(true)
      const details: Record<string, string> = travel
        ? { category }
        : { scope, mode, origin: canon(from), destination: canon(to), cargo: cargo.trim(), salesperson: SALESPEOPLE.find((s) => s.id === sales)?.name ?? '' }
      const res = await real.onCreate({ client: client.trim(), details, notes: notes.trim(), ref: existing.trim() || undefined })
      setBusy(false)
      if (!res.ok) {
        setErrors({ form: res.message })
        return
      }
      const catLabel = TRAVEL_CATEGORIES.find((c) => c.id === category)?.label ?? ''
      setResult({ ref: res.ref, subject: travel ? `[${res.ref}] ${client.trim()} – ${catLabel}` : `[${res.ref}] ${client.trim()} – ${canon(from)} → ${canon(to)}` })
      return
    }
    const clientList = travel ? TRAVEL_CLIENTS : CLIENTS
    if (!client.trim()) e.client = 'Enter the client'
    else if (!clientList.some((c) => c.toLowerCase() === client.trim().toLowerCase())) e.client = 'Choose a client from the list'
    if (!travel) {
      if (!valid(from)) e.from = 'Choose a standard name from the list'
      if (!valid(to)) e.to = 'Choose a standard name from the list'
      if (!e.from && !e.to && from.trim().toLowerCase() === to.trim().toLowerCase()) e.to = 'Origin and destination must differ'
      if (!sales) e.sales = 'Choose the salesperson'
    }
    setErrors(e)
    if (Object.keys(e).length > 0) return

    const ref = nextRef(company)
    const clientName = clientList.find((c) => c.toLowerCase() === client.trim().toLowerCase()) ?? client.trim()
    const catLabel = TRAVEL_CATEGORIES.find((c) => c.id === category)?.label ?? ''
    const subject = travel ? `[${ref}] ${clientName} – ${catLabel}` : `[${ref}] ${clientName} – ${canon(from)} → ${canon(to)}`
    const by = travel ? catLabel : (SALESPEOPLE.find((s) => s.id === sales)?.name ?? '')
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
    setExisting('')
    setErrors({})
  }

  return (
    <div className={`modal-backdrop${panel ? ' panel-mode' : ''}`} onMouseDown={(e) => !panel && e.target === e.currentTarget && onClose()}>
      {panel && anchor && <span className="ref-caret" aria-hidden="true" style={{ left: (anchor.left + anchor.right) / 2 - 8, top: anchor.bottom + 1 }} />}
      <div
        ref={box}
        className={`modal${panel ? ' ref-panel' : ''}`}
        role="dialog"
        aria-modal={!panel}
        aria-labelledby="ref-title"
        style={panel ? { left, top, width: PANEL_W, maxHeight: `calc(100dvh - ${top + 12}px)` } : undefined}
      >
        <div className="modal-head">
          <h2 id="ref-title">Reference number</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        {real ? (
          <p className="notice" role="note">
            <strong>Provisional numbers.</strong> Pivot Mail issues these and shares the case with your team. They are not Pivot OS numbers yet.
          </p>
        ) : (
          <p className="notice" role="note">
            <strong>Preview only.</strong> These numbers are generated in this browser and are not registered in Pivot OS. Do not use them on real jobs.
          </p>
        )}

        {!result && !real && (
          <div className="co-tabs" role="tablist" aria-label="Company">
            {(['shipping', 'travel'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={company === c}
                className={company === c ? 'on' : ''}
                onClick={() => {
                  setCompany(c)
                  setClient('')
                  setErrors({})
                }}
              >
                <Icon name={c === 'shipping' ? 'ship' : 'plane'} size={15} />
                {c === 'shipping' ? 'Pivot Shipping' : 'Pivot Travel'}
              </button>
            ))}
          </div>
        )}

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
        ) : company === 'travel' ? (
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault()
              void generate()
            }}
            noValidate
          >
            <label className="fld">
              <span>Client</span>
              <input ref={first} list="ref-clients-pt" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Start typing a company…" aria-invalid={Boolean(errors.client)} autoComplete="off" />
              <datalist id="ref-clients-pt">
                {TRAVEL_CLIENTS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {errors.client && <em className="err">{errors.client}</em>}
            </label>
            <div className="fld">
              <span id="lbl-cat">Category</span>
              <div className="opts wrap" role="radiogroup" aria-labelledby="lbl-cat">
                {TRAVEL_CATEGORIES.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={category === c.id} className={`opt${category === c.id ? ' on' : ''}`} data-tone={c.tone} onClick={() => setCategory(c.id)}>
                    <Icon name={c.icon} size={16} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="fld half">
              <span>Notes</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the team should know" />
            </label>
            {real && (
              <label className="fld half">
                <span>Existing number (optional)</span>
                <input value={existing} onChange={(e) => setExisting(e.target.value)} placeholder={`Already have one from Pivot OS? Type it here, like PT2600123`} autoComplete="off" />
              </label>
            )}
            {errors.form && (
              <p className="err" role="alert">
                {errors.form}
              </p>
            )}
            <button type="submit" className="btn primary wide" disabled={busy}>
              {busy ? 'Saving…' : existing.trim() ? 'Register case' : 'Generate number'}
            </button>
            {!real && last && (
              <p className="muted last">
                Last issued (preview) <code>{last.ref}</code> · {last.by}
              </p>
            )}
          </form>
        ) : (
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault()
              void generate()
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
                      // Sample place lists differ per mode, so they restart; with free text nothing is lost.
                      if (!real) {
                        setFrom('')
                        setTo('')
                      }
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

            <label className="fld half">
              <span>Cargo (optional)</span>
              <input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="e.g. 2×40HQ machinery, ~46 CBM" />
            </label>
            <label className="fld half">
              <span>Notes for operations (optional)</span>
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

            {real && (
              <label className="fld half">
                <span>Existing number (optional)</span>
                <input value={existing} onChange={(e) => setExisting(e.target.value)} placeholder={`Already have one from Pivot OS? Type it here, like PS2600123`} autoComplete="off" />
              </label>
            )}
            {errors.form && (
              <p className="err" role="alert">
                {errors.form}
              </p>
            )}
            <button type="submit" className="btn primary wide half" disabled={busy}>
              {busy ? 'Saving…' : existing.trim() ? 'Register case' : 'Generate number'}
            </button>
            {!real && last && (
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
