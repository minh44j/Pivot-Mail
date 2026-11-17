import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CLIENTS, MODES, PLACES, SALESPEOPLE, SCOPES, TRAVEL_CATEGORIES, TRAVEL_CLIENTS } from '../data/refdata'
import type { Mode, Scope, TravelCategory } from '../data/refdata'
import { platform } from '../platform'
import type { NewCase } from '../cases'
import { initials } from '../util'
import { Icon } from './Icon'
import type { IconName } from './Icon'

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
  const PANEL_W = Math.min(640, window.innerWidth - 16)
  const [company, setCompany] = useState<Company>(real ? (real.company === 'tmc' ? 'travel' : 'shipping') : 'shipping')
  const [existing, setExisting] = useState('')
  const [showExisting, setShowExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState<TravelCategory>('flight')
  const [client, setClient] = useState('')
  const [scope, setScope] = useState<Scope>('freight-clearance')
  const [mode, setMode] = useState<Mode>('sea')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
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
  const canon = (v: string) => places.find((p) => p.toLowerCase() === v.trim().toLowerCase()) ?? v.trim()
  const travel = company === 'travel'
  const ready = client.trim().length >= 2

  /** Only the client is required. A route is optional, but its two ends must differ. */
  const generate = async () => {
    const e: Record<string, string> = {}
    if (!ready) e.client = 'Enter the client'
    if (!travel && from.trim() && to.trim() && from.trim().toLowerCase() === to.trim().toLowerCase()) e.to = 'Origin and destination must differ'
    setErrors(e)
    if (Object.keys(e).length > 0 || busy) return
    const salesName = SALESPEOPLE.find((s) => s.id === sales)?.name ?? ''
    const catLabel = TRAVEL_CATEGORIES.find((c) => c.id === category)?.label ?? ''
    const route = from.trim() && to.trim() ? ` – ${canon(from)} → ${canon(to)}` : ''
    const subjectFor = (ref: string, name: string) => (travel ? `[${ref}] ${name} – ${catLabel}` : `[${ref}] ${name}${route}`)
    if (real) {
      setBusy(true)
      const details: Record<string, string> = travel ? { category, salesperson: salesName } : { scope, mode, origin: canon(from), destination: canon(to), salesperson: salesName }
      const res = await real.onCreate({ client: client.trim(), details, notes: notes.trim(), ref: existing.trim() || undefined })
      setBusy(false)
      if (!res.ok) {
        setErrors({ form: res.message })
        return
      }
      setResult({ ref: res.ref, subject: subjectFor(res.ref, client.trim()) })
      return
    }
    const clientList = travel ? TRAVEL_CLIENTS : CLIENTS
    const clientName = clientList.find((c) => c.toLowerCase() === client.trim().toLowerCase()) ?? client.trim()
    const ref = nextRef(company)
    const by = travel ? catLabel : salesName
    platform.storage.set(LAST_KEY, JSON.stringify({ ref, by }))
    setLast({ ref, by })
    setResult({ ref, subject: subjectFor(ref, clientName) })
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
    setNotes('')
    setSales('')
    setExisting('')
    setErrors({})
  }

  const salesBlock = (
    <Section icon="user" tone="red" title="Salesperson" hint="Optional.">
      <div className="rg-select">
        <Icon name="user" size={15} />
        <select value={sales} onChange={(e) => setSales(e.target.value)} aria-label="Salesperson">
          <option value="">Select a salesperson</option>
          {SALESPEOPLE.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Icon name="chevron" size={14} />
      </div>
      <div className="rg-people" role="radiogroup" aria-label="Salesperson shortcuts">
        {SALESPEOPLE.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={sales === s.id} className={`rg-person${sales === s.id ? ' on' : ''}`} onClick={() => setSales(sales === s.id ? '' : s.id)}>
            <span className="avatar" data-tone={TONES[s.id.charCodeAt(0) % TONES.length]}>
              {initials(s.name)}
            </span>
            <small>{s.name}</small>
          </button>
        ))}
      </div>
    </Section>
  )

  const detailsBlock = (
    <Section icon="draft" tone="purple" title="Additional details" hint="Optional. Anything else we should know?">
      <div className="rg-area">
        <textarea
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={travel ? 'e.g. RUH–DXB, 3 pax, 12 Dec' : 'e.g. 2×40HQ machinery, urgent, anything ops should know'}
          aria-label="Additional details"
          rows={3}
        />
        <small aria-hidden="true">{notes.length}/500</small>
      </div>
    </Section>
  )

  const footer = (
    <>
      {real && (
        <div className="rg-existing">
          {showExisting ? (
            <label className="fld">
              <span>Existing number</span>
              <input value={existing} onChange={(e) => setExisting(e.target.value)} placeholder={`Already have one from Pivot OS? Type it here, like ${travel ? 'PTF260123' : 'PS2600123'}`} autoComplete="off" />
            </label>
          ) : (
            <button type="button" className="link" onClick={() => setShowExisting(true)}>
              I already have a number
            </button>
          )}
        </div>
      )}
      {errors.form && (
        <p className="err" role="alert">
          {errors.form}
        </p>
      )}
      <button type="submit" className="rg-go" disabled={busy || !ready}>
        <Icon name="sparkle" size={16} />
        {busy ? 'Saving…' : existing.trim() ? 'Register case' : travel ? 'Generate number' : 'Open job & generate number'}
        <Icon name="arrow" size={16} />
      </button>
      {!real && last && (
        <p className="muted last">
          Last issued (preview) <code>{last.ref}</code> · {last.by}
        </p>
      )}
    </>
  )

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
        ) : (
          <form
            className="modal-body rg-form"
            onSubmit={(e) => {
              e.preventDefault()
              void generate()
            }}
            noValidate
          >
            <Section icon="building" tone="blue" title="Client" hint={travel ? 'Pick from the directory, or just type a name.' : 'Who is this job for?'}>
              <input
                ref={first}
                className="rg-input"
                list={travel ? 'ref-clients-pt' : 'ref-clients'}
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder={travel ? 'Start typing a company or person…' : 'Start typing a company…'}
                aria-label="Client"
                aria-invalid={Boolean(errors.client)}
                autoComplete="off"
              />
              <datalist id={travel ? 'ref-clients-pt' : 'ref-clients'}>
                {(travel ? TRAVEL_CLIENTS : CLIENTS).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {errors.client && <em className="err">{errors.client}</em>}
            </Section>

            {travel ? (
              <Section icon="boxes" tone="blue" title="What is it for?" hint="Select the type of work to get started." plain>
                <div className="rg-cards five" role="radiogroup" aria-label="What is it for?">
                  {TRAVEL_CATEGORIES.map((c) => (
                    <Card key={c.id} on={category === c.id} tone={c.tone} icon={c.icon} title={c.label} text={c.text} onPick={() => setCategory(c.id)} />
                  ))}
                </div>
              </Section>
            ) : (
              <>
                <Section icon="boxes" tone="blue" title="What are we handling?" hint="Select the type of operation to get started." plain>
                  <div className="rg-cards three" role="radiogroup" aria-label="What are we handling?">
                    {SCOPES.map((s) => (
                      <Card key={s.id} on={scope === s.id} tone={s.tone} icon={s.icon} title={s.label} text={s.text} onPick={() => setScope(s.id)} />
                    ))}
                  </div>
                </Section>

                <Section icon="boxes" tone="purple" title="Moves by" plain>
                  <div className="rg-modes" role="radiogroup" aria-label="Moves by">
                    {MODES.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`rg-mode${mode === m.id ? ' on' : ''}`} data-tone={m.tone} onClick={() => setMode(m.id)}>
                        <Icon name={m.icon} size={16} />
                        {m.label}
                      </button>
                    ))}
                  </div>
                </Section>

                <Section icon="pin" tone="green" title="Route" hint="Optional. Ports use standard names.">
                  <div className="rg-route">
                    <input className="rg-input" list="ref-places" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" aria-label="From" autoComplete="off" />
                    <input className="rg-input" list="ref-places" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" aria-label="To" aria-invalid={Boolean(errors.to)} autoComplete="off" />
                    <datalist id="ref-places">
                      {places.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  {errors.to && <em className="err">{errors.to}</em>}
                </Section>
              </>
            )}

            {detailsBlock}
            {salesBlock}
            {footer}
          </form>
        )}
      </div>
    </div>
  )
}

/** One headed block of the form: icon, title, a line of help, then the control. */
function Section(props: { icon: IconName; tone: string; title: string; hint?: string; plain?: boolean; children: ReactNode }) {
  return (
    <div className="rg-sec">
      <div className="rg-h">
        <span className="rg-hi" data-tone={props.tone} aria-hidden="true">
          <Icon name={props.icon} size={15} />
        </span>
        <strong>{props.title}</strong>
      </div>
      {props.hint && <p className="rg-hint">{props.hint}</p>}
      {props.children}
    </div>
  )
}

/** A choice shown as a card: coloured icon, title and a short description. A tick marks the chosen one. */
function Card(props: { on: boolean; tone: string; icon: IconName; title: string; text: string; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={props.on} className={`rg-card${props.on ? ' on' : ''}`} data-tone={props.tone} onClick={props.onPick}>
      {props.on && (
        <span className="rg-tick" aria-hidden="true">
          <Icon name="check" size={12} />
        </span>
      )}
      <span className="rg-ci" aria-hidden="true">
        <Icon name={props.icon} size={20} />
      </span>
      <strong>{props.title}</strong>
      <small>{props.text}</small>
    </button>
  )
}
