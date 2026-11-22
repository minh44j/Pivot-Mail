import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CLIENTS, MODES, PLACES, SALESPEOPLE, SCOPES, TRAVEL_CATEGORIES, TRAVEL_CLIENTS } from '../data/refdata'
import type { Mode, Scope, TravelCategory } from '../data/refdata'
import { platform } from '../platform'
import type { NewCase, OsPick } from '../cases'
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
  real?: {
    company: 'scl' | 'tmc'
    /** Every company this person may issue numbers for (their own plus the companies of their mailboxes) */
    companies?: ('scl' | 'tmc')[]
    /** The server is connected to Pivot OS: numbers and pick-lists come from there */
    linked: boolean
    onCreate: (c: NewCase) => Promise<{ ok: true; ref: string; subject: string | null } | { ok: false; message: string }>
    picks: (kind: 'client' | 'port' | 'sales', q: string, clientId?: string | null, company?: 'scl' | 'tmc') => Promise<OsPick[]>
  }
}

interface Result {
  ref: string
  subject: string
  client: string
  entity: string
  badge: string
  subtitle: string
  left: string
  right: string | null
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
  const PANEL_W = Math.min(420, window.innerWidth - 16)
  const [company, setCompany] = useState<Company>(real ? (real.company === 'tmc' ? 'travel' : 'shipping') : 'shipping')
  const coCode: 'scl' | 'tmc' = company === 'travel' ? 'tmc' : 'scl'
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
  const linked = Boolean(real?.linked)
  const picks = real?.picks
  // Pivot OS pick-lists (only when linked): the exact records chosen are sent with the form.
  const [clientId, setClientId] = useState<string | null>(null)
  const [originId, setOriginId] = useState<string | null>(null)
  const [destId, setDestId] = useState<string | null>(null)
  const [clrPort, setClrPort] = useState('Jeddah')
  const [osPeople, setOsPeople] = useState<OsPick[]>([])
  const [clientHits, setClientHits] = useState<OsPick[]>([])
  const [clientOpen, setClientOpen] = useState(false)
  const [portHits, setPortHits] = useState<OsPick[]>([])
  const [portFocus, setPortFocus] = useState<'from' | 'to' | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [last, setLast] = useState(readLast)
  const first = useRef<HTMLInputElement>(null)

  const box = useRef<HTMLDivElement>(null)
  // The caret starts in Client once, when the window opens. It used to be put there again whenever the app around it redrew
  // (a new onClose each time, every few seconds while mail syncs), so typing in From or Details jumped back to Client
  // (Minhaj 2026-11-22).
  useEffect(() => {
    first.current?.focus()
  }, [])
  useEffect(() => {
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
  useEffect(() => {
    if (!linked || !picks) return
    let alive = true
    void picks('sales', '', clientId, coCode).then((r) => {
      if (!alive) return
      setOsPeople(r)
      const s = r.find((x) => x.suggested)
      if (s) setSales(s.id)
    })
    return () => {
      alive = false
    }
  }, [linked, picks, clientId, coCode])
  useEffect(() => {
    if (!linked || !picks || !clientOpen || clientId || client.trim().length < 2) return
    let alive = true
    const t = window.setTimeout(() => void picks('client', client.trim(), null, coCode).then((r) => alive && setClientHits(r)), 250)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [linked, picks, clientOpen, clientId, client, coCode])
  useEffect(() => {
    const q = portFocus === 'from' ? from : portFocus === 'to' ? to : ''
    if (!linked || !picks || !portFocus || q.trim().length < 2) return
    let alive = true
    const t = window.setTimeout(() => void picks('port', q.trim(), null, coCode).then((r) => alive && setPortHits(r)), 250)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [linked, picks, portFocus, from, to, coCode])
  const left = anchor ? Math.max(8, Math.min(anchor.right - PANEL_W, window.innerWidth - PANEL_W - 8)) : 0
  const top = anchor ? anchor.bottom + 8 : 0

  const places = PLACES[mode]
  const canon = (v: string) => places.find((p) => p.toLowerCase() === v.trim().toLowerCase()) ?? v.trim()
  const travel = company === 'travel'
  const ready = client.trim().length >= 2

  const portLabel = (p: OsPick): string => `${p.city ?? p.name} (${p.locode ?? ''})`
  const people: { id: string; name: string; suggested?: boolean }[] = linked ? osPeople : SALESPEOPLE
  const clearanceOnly = !travel && scope === 'clearance'

  /** Only the client is required (and the customs port for a customs-only job). A route is optional, but its two ends must differ. */
  const generate = async () => {
    const e: Record<string, string> = {}
    if (!ready) e.client = 'Enter the client'
    if (clearanceOnly && !clrPort.trim()) e.port = 'Enter the customs port'
    if (!travel && !clearanceOnly && from.trim() && to.trim() && from.trim().toLowerCase() === to.trim().toLowerCase()) e.to = 'Origin and destination must differ'
    setErrors(e)
    if (Object.keys(e).length > 0 || busy) return
    const salesName = people.find((s) => s.id === sales)?.name ?? ''
    const catLabel = TRAVEL_CATEGORIES.find((c) => c.id === category)?.label ?? ''
    const route = !clearanceOnly && from.trim() && to.trim() ? ` – ${canon(from)} → ${canon(to)}` : ''
    const subjectFor = (ref: string, name: string) => (travel ? `[${ref}] ${name} – ${catLabel}` : `[${ref}] ${name}${route}`)
    const show = (ref: string, subject: string, clientName: string) =>
      setResult({
        ref,
        subject,
        client: clientName,
        entity: travel ? 'Pivot Travel Management · Reference' : 'Pivot Shipping · Job',
        badge: travel ? 'Issued' : 'Open',
        subtitle: !real
          ? 'Preview only. This is not a Pivot OS number.'
          : !linked
            ? 'Provisional. Pivot OS does not know this number yet.'
            : travel
              ? 'Use it in the email subject or quote, and save the booking later.'
              : 'Open as an enquiry. Move it on from the case when it progresses.',
        left: travel ? `${catLabel}${notes.trim() ? ` · ${notes.trim().slice(0, 60)}` : ''}` : clearanceOnly ? `${clrPort.trim()} port` : from.trim() && to.trim() ? `${canon(from)} → ${canon(to)}` : 'route TBC',
        right: travel ? salesName || null : clearanceOnly ? 'Customs-only job' : scope === 'freight' ? 'Freight only' : 'Full scope',
      })
    if (real) {
      setBusy(true)
      const details: Record<string, string> = travel
        ? { category, salesperson: salesName }
        : clearanceOnly
          ? { scope, mode: 'sea', port: clrPort.trim(), salesperson: salesName }
          : { scope, mode, origin: canon(from), destination: canon(to), salesperson: salesName }
      const res = await real.onCreate({
        company: coCode,
        client: client.trim(),
        details,
        notes: notes.trim(),
        ref: existing.trim() || undefined,
        os: linked ? { clientId, originPortId: originId, destinationPortId: destId, salesEmployeeId: sales || null } : undefined,
      })
      setBusy(false)
      if (!res.ok) {
        setErrors({ form: res.message })
        return
      }
      show(res.ref, linked && res.subject ? res.subject : subjectFor(res.ref, client.trim()), client.trim())
      return
    }
    const clientList = travel ? TRAVEL_CLIENTS : CLIENTS
    const clientName = clientList.find((c) => c.toLowerCase() === client.trim().toLowerCase()) ?? client.trim()
    const ref = nextRef(company)
    const by = travel ? catLabel : salesName
    platform.storage.set(LAST_KEY, JSON.stringify({ ref, by }))
    setLast({ ref, by })
    show(ref, subjectFor(ref, clientName), clientName)
  }

  const copy = async (text: string, what: string) => {
    const ok = await platform.copyText(text)
    onToast(ok ? `${what} copied` : 'Copy was blocked by the browser')
  }

  const reset = () => {
    setResult(null)
    setClient('')
    setClientId(null)
    setOriginId(null)
    setDestId(null)
    setFrom('')
    setTo('')
    setNotes('')
    setSales('')
    setExisting('')
    setErrors({})
  }

  const salesBlock = (
    <Section icon="user" tone="red" title="Salesperson" hint="Optional.">
      <div className="rg-people" role="radiogroup" aria-label="Salesperson shortcuts">
        {people.map((s) => (
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
          rows={2}
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
          linked ? null : (
            <p className="notice" role="note">
              <strong>Provisional numbers.</strong> Pivot Mail issues these and shares the case with your team. They are not Pivot OS numbers yet.
            </p>
          )
        ) : (
          <p className="notice" role="note">
            <strong>Preview only.</strong> These numbers are generated in this browser and are not registered in Pivot OS. Do not use them on real jobs.
          </p>
        )}

        {!result && (!real || (real.companies?.length ?? 0) > 1) && (
          <div className="co-tabs" role="tablist" aria-label="Company">
            {(['shipping', 'travel'] as const).filter((c) => !real?.companies || real.companies.includes(c === 'travel' ? 'tmc' : 'scl')).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={company === c}
                className={company === c ? 'on' : ''}
                onClick={() => {
                  setCompany(c)
                  setClient('')
                  setClientId(null)
                  setOriginId(null)
                  setDestId(null)
                  setFrom('')
                  setTo('')
                  setSales('')
                  setOsPeople([])
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
          <div className="modal-body rg-pass">
            <svg viewBox="0 0 64 64" className="rg-tick-draw" aria-hidden="true">
              <circle cx="32" cy="32" r="30" fill="none" stroke="#b08d3e" strokeWidth="2.4" />
              <path d="M21 33l8 8 15-16" fill="none" stroke="#b08d3e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="rg-pass-title">Reference issued</div>
            <div className="rg-pass-sub">{result.subtitle}</div>
            <div className="rg-ticket">
              <div className="rg-ticket-top">
                <span>{result.entity}</span>
                <span className="rg-badge">✓ {result.badge}</span>
              </div>
              <div className="ref-out" aria-live="polite">
                {result.ref}
              </div>
              <div className="rg-ticket-client">{result.client}</div>
              <div className="rg-ticket-foot">
                <span>{result.left}</span>
                {result.right && <span className="rg-gold">{result.right}</span>}
              </div>
            </div>
            <p className="ref-subject">{result.subject}</p>
            <button type="button" className="rg-go" onClick={() => void copy(result.ref, 'Reference')}>
              Copy reference number
            </button>
            <button type="button" className="rg-alt" onClick={() => void copy(result.subject, 'Subject')}>
              Copy email subject
            </button>
            <button
              type="button"
              className="rg-alt"
              onClick={() => {
                onNewMail(result.subject)
                onClose()
              }}
            >
              New mail with subject
            </button>
            <button type="button" className="rg-quiet" onClick={reset}>
              {travel ? 'Generate another' : 'Open another job'}
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
              <div className="rg-wrap">
                <input
                  ref={first}
                  className="rg-input"
                  list={linked ? undefined : travel ? 'ref-clients-pt' : 'ref-clients'}
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value)
                    setClientId(null)
                    setClientOpen(true)
                  }}
                  onFocus={() => setClientOpen(true)}
                  onBlur={() => window.setTimeout(() => setClientOpen(false), 160)}
                  placeholder={travel ? 'Start typing a company or person…' : 'Start typing a company…'}
                  aria-label="Client"
                  aria-invalid={Boolean(errors.client)}
                  autoComplete="off"
                />
                {linked && clientOpen && !clientId && clientHits.length > 0 && (
                  <ul className="rg-suggest" role="listbox" aria-label="Clients in Pivot OS">
                    {clientHits.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onMouseDown={() => {
                            setClient(c.name)
                            setClientId(c.id)
                            setClientOpen(false)
                          }}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {linked && clientId && <p className="rg-ok">✓ Matched in the client directory</p>}
              {!linked && (
                <datalist id={travel ? 'ref-clients-pt' : 'ref-clients'}>
                  {(travel ? TRAVEL_CLIENTS : CLIENTS).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              )}
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

                {!clearanceOnly && (
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
                )}

                {clearanceOnly ? (
                  <Section icon="pin" tone="green" title="Clearance port">
                    <input className="rg-input" value={clrPort} onChange={(e) => setClrPort(e.target.value)} placeholder="e.g. Jeddah" aria-label="Clearance port" aria-invalid={Boolean(errors.port)} autoComplete="off" />
                    {errors.port && <em className="err">{errors.port}</em>}
                  </Section>
                ) : (
                  <Section icon="pin" tone="green" title="Route" hint="Optional. Ports use standard names.">
                    <div className="rg-route">
                      {(['from', 'to'] as const).map((w) => {
                        const val = w === 'from' ? from : to
                        const open = linked && portFocus === w && val.trim().length >= 2 && portHits.length > 0
                        return (
                          <div className="rg-wrap" key={w}>
                            <input
                              className="rg-input"
                              list={linked ? undefined : 'ref-places'}
                              value={val}
                              onChange={(e) => {
                                if (w === 'from') {
                                  setFrom(e.target.value)
                                  setOriginId(null)
                                } else {
                                  setTo(e.target.value)
                                  setDestId(null)
                                }
                                setPortFocus(w)
                              }}
                              onFocus={() => setPortFocus(w)}
                              onBlur={() => window.setTimeout(() => setPortFocus((f) => (f === w ? null : f)), 160)}
                              placeholder={w === 'from' ? 'From' : 'To'}
                              aria-label={w === 'from' ? 'From' : 'To'}
                              aria-invalid={w === 'to' && Boolean(errors.to)}
                              autoComplete="off"
                            />
                            {open && (
                              <ul className="rg-suggest" role="listbox" aria-label="Ports in Pivot OS">
                                {portHits.map((p) => (
                                  <li key={p.id}>
                                    <button
                                      type="button"
                                      role="option"
                                      aria-selected={false}
                                      onMouseDown={() => {
                                        if (w === 'from') {
                                          setFrom(portLabel(p))
                                          setOriginId(p.id)
                                        } else {
                                          setTo(portLabel(p))
                                          setDestId(p.id)
                                        }
                                        setPortFocus(null)
                                      }}
                                    >
                                      <span>{p.name}</span> <b>{p.locode}</b> <small>{p.country}</small>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                      {!linked && (
                        <datalist id="ref-places">
                          {places.map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      )}
                    </div>
                    {errors.to && <em className="err">{errors.to}</em>}
                  </Section>
                )}
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
