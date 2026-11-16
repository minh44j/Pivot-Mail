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
  client: string
  details: Record<string, string>
  notes?: string
  /** an existing number to register instead of generating one */
  ref?: string
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function call<T>(method: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch('/api/cases', { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: false, error: 'unavailable' }
    const data = (await res.json()) as T & { error?: string }
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'unavailable' }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function fetchCases(): Promise<CaseRecord[] | null> {
  const r = await call<{ cases: CaseRecord[] }>('GET')
  return r.ok ? r.data.cases : null
}

export const openCase = (c: NewCase) => call<{ case: CaseRecord }>('POST', c)
export const updateCase = (ref: string, change: { notes?: string; status?: 'open' | 'closed' }) => call<{ case: CaseRecord }>('PATCH', { ref, ...change })

export const CASE_ERRORS: Record<string, string> = {
  invalid: 'Check the form: the client and the details are required.',
  bad_ref: 'That number does not look right. It should be like PS2600123 (Shipping) or PT2600123 (Travel).',
  exists: 'That number is already registered as a case.',
  session: 'Please sign in again.',
  forbidden: 'This request was refused.',
  not_found: 'That case was not found.',
  config: 'Cases are not set up yet. Ask your administrator.',
  unavailable: 'The service is busy. Please try again in a moment.',
}
