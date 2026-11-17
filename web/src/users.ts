/** Browser side of user management (server: web/api/users). Administrators only. */
export interface PersonRow {
  id: string
  email: string
  name: string
  company: 'scl' | 'tmc'
  role: 'admin' | 'staff'
  /** An address in the server's safety list: stays an administrator */
  roleLocked: boolean
  status: 'invited' | 'active' | 'disabled'
  lastSeenAt: string | null
  createdAt: string
  mailboxes: { email: string; kind: 'personal' | 'shared' }[]
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function call<T>(method: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch('/api/users', { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: false, error: 'unavailable' }
    const data = (await res.json()) as T & { error?: string }
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'unavailable' }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export const fetchPeople = () => call<{ users: PersonRow[]; you: string }>('GET')
export const changePerson = (id: string, change: { role?: 'admin' | 'staff'; status?: 'active' | 'disabled' }) => call<{ ok: true }>('PATCH', { id, ...change })

export const PEOPLE_ERRORS: Record<string, string> = {
  self: 'You cannot change your own role or access. Ask another administrator.',
  locked: 'Cannot change this role here: the person is an administrator in the server settings.',
  last_admin: 'Cannot do that: at least one administrator must remain.',
  forbidden: 'Not allowed: only administrators can do this.',
  session: 'Could not save: please sign in again.',
  not_found: 'Could not find that person.',
  invalid: 'Could not make that change.',
  unavailable: 'Could not save: the service is busy. Please try again in a moment.',
}
