/** Browser side of cases (server: web/api/cases). */
export interface CaseRecord {
  id: string
  ref: string
  company: 'scl' | 'tmc'
  client: string
  kind: 'shipping' | 'travel'
  details: Record<string, string>
  notes: string
  status: 'open' | 'closed'
  /** true until Pivot OS numbering is connected */
  provisional: boolean
  openedAt: string
  closedAt: string | null
  openedBy: { name: string; email: string } | null
}

export interface NewCase {
  /** which company the number is for (defaults to the person's own; the server checks they may use it) */
  company?: 'scl' | 'tmc'
  client: string
  details: Record<string, string>
  notes?: string
  /** an existing number to register instead of generating one */
  ref?: string
  /** Linked to Pivot OS: the exact records the person picked (their ids in Pivot OS) */
  os?: { clientId?: string | null; originPortId?: string | null; destinationPortId?: string | null; salesEmployeeId?: string | null }
}

/** A row of a Pivot OS pick-list (clients, ports, salespeople). Only the fields the form shows. */
export interface OsPick {
  id: string
  name: string
  /** ports */
  locode?: string
  city?: string | null
  country?: string
  /** ports: SEAPORT | AIRPORT | INLAND (Pivot OS) */
  kind?: string
  /** salespeople: the client's own rep */
  suggested?: boolean
}

/** What Pivot OS knows about a reference number (read-only). */
export interface OsFacts {
  ref: string
  client: string
  status?: string
  mode?: string
  direction?: string
  origin?: string | null
  destination?: string | null
  service?: string
  salesperson?: string | null
  note?: string | null
  notes?: string | null
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string; message?: string; ref?: string }

async function call<T>(method: string, body?: unknown, qs = ''): Promise<Result<T>> {
  try {
    const res = await fetch('/api/cases' + qs, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: false, error: 'unavailable' }
    const data = (await res.json()) as T & { error?: string; message?: string; ref?: string }
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'unavailable', message: data.message, ref: data.ref }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function fetchCasesInfo(): Promise<{ cases: CaseRecord[]; linked: boolean; companies: ('scl' | 'tmc')[] } | null> {
  const r = await call<{ cases: CaseRecord[]; linked?: boolean; company?: 'scl' | 'tmc'; companies?: ('scl' | 'tmc')[] }>('GET')
  return r.ok ? { cases: r.data.cases, linked: r.data.linked === true, companies: r.data.companies ?? (r.data.company ? [r.data.company] : []) } : null
}

export const openCase = (c: NewCase) => call<{ case: CaseRecord; subject: string | null }>('POST', c)

/** Pivot OS pick-lists, when the link is on. Failures give an empty list (the form still works with typed text). */
export async function fetchPicks(kind: 'client' | 'port' | 'sales', q: string, clientId?: string | null, company?: 'scl' | 'tmc', mode?: 'sea' | 'air' | 'land'): Promise<OsPick[]> {
  const qs = `?directory=${kind}&q=${encodeURIComponent(q)}${clientId ? `&clientId=${encodeURIComponent(clientId)}` : ''}${company ? `&company=${company}` : ''}${kind === 'port' && mode ? `&mode=${mode}` : ''}`
  const r = await call<{ results: OsPick[] }>('GET', undefined, qs)
  return r.ok ? r.data.results : []
}

/** What Pivot OS knows about these numbers. */
export async function fetchOsFacts(refs: string[]): Promise<OsFacts[]> {
  if (refs.length === 0) return []
  const r = await call<{ results: OsFacts[] }>('GET', undefined, `?lookup=${encodeURIComponent(refs.join(','))}`)
  return r.ok ? r.data.results : []
}
export const updateCase = (ref: string, change: { notes?: string; status?: 'open' | 'closed' }) => call<{ case: CaseRecord }>('PATCH', { ref, ...change })

export const CASE_ERRORS: Record<string, string> = {
  invalid: 'Check the form: the client and the details are required.',
  bad_ref: 'That number does not look right. It should be like PS2600123 (Shipping) or PT2600123 (Travel).',
  exists: 'That number is already registered as a case.',
  session: 'Please sign in again.',
  forbidden: 'This request was refused.',
  not_found: 'That case was not found.',
  config: 'Cases are not set up yet. Ask your administrator.',
  os: 'Pivot OS could not be reached. Try again in a moment.',
  not_linked: 'The Pivot OS link is not switched on.',
  unavailable: 'The service is busy. Please try again in a moment.',
}
