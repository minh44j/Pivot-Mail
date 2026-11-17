import { GET, PATCH } from '../api/users/index.js'
import { signToken } from '../api/_lib/crypto.js'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }

const SECRET = 's'.repeat(40)
process.env.SESSION_SECRET = SECRET
process.env.SUPABASE_URL = 'https://fake.supabase.co'
process.env.SUPABASE_SECRET_KEY = 'sb_secret_x'
process.env.ADMIN_EMAILS = 'boss@pivotscl.com'

type Row = Record<string, any>
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T: Record<string, Row[]> = {
  app_users: [
    { id: id(1), email: 'boss@pivotscl.com', name: 'Boss', company: 'scl', role: 'admin', status: 'active', last_seen_at: '2026-11-17T08:00:00Z', created_at: '2026-11-01T00:00:00Z' },
    { id: id(2), email: 'adm@pivotscl.com', name: 'Adm', company: 'scl', role: 'admin', status: 'active', last_seen_at: null, created_at: '2026-11-02T00:00:00Z' },
    { id: id(3), email: 'ann@pivotscl.com', name: 'Ann', company: 'scl', role: 'staff', status: 'active', last_seen_at: '2026-11-16T08:00:00Z', created_at: '2026-11-03T00:00:00Z' },
    { id: id(4), email: 'maya@pivottmc.com', name: 'Maya', company: 'tmc', role: 'staff', status: 'active', last_seen_at: null, created_at: '2026-11-04T00:00:00Z' },
  ],
  mailbox_access: [
    { user_id: id(3), mail_accounts: { email: 'ann@pivotscl.com', kind: 'personal' } },
    { user_id: id(3), mail_accounts: { email: 'sales@pivotscl.com', kind: 'shared' } },
  ],
  audit_log: [],
}
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const table = url.pathname.split('/').pop() as string
  const rows = T[table]!
  const filters = [...url.searchParams.entries()].filter(([, v]) => v.startsWith('eq.'))
  const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === decodeURIComponent(v.slice(3)))
  const method = init?.method ?? 'GET'
  if (method === 'GET') return new Response(JSON.stringify(rows.filter(match)))
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if (method === 'POST') { rows.push(body); return new Response(JSON.stringify([body]), { status: 201 }) }
  if (method === 'PATCH') { const hit = rows.filter(match); hit.forEach((r) => Object.assign(r, body)); return new Response(JSON.stringify(hit)) }
  return new Response('[]', { status: 405 })
}) as typeof fetch

const H = 'https://mail.pivotscl.com'
const who = (email: string, company: 'scl' | 'tmc' = 'scl') => ({ cookie: `__Host-pm_session=${encodeURIComponent(signToken({ email, name: 'N', company }, SECRET, 3600))}` })
const get = (headers: Record<string, string>) => GET(new Request(H + '/api/users', { headers }))
const patch = (headers: Record<string, string>, body: unknown, origin: string | null = H) =>
  PATCH(new Request(H + '/api/users', { method: 'PATCH', headers: { ...headers, ...(origin ? { origin } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const row = (n: number) => T.app_users!.find((r) => r.id === id(n))!

let r = await get(who('boss@pivotscl.com'))
let j = await r.json()
ok('an administrator sees everyone, both companies', r.status === 200 && j.users.length === 4 && j.you === id(1))
const ann = j.users.find((u: any) => u.email === 'ann@pivotscl.com')
ok('role, status, last seen and mailboxes are listed', ann.role === 'staff' && ann.status === 'active' && ann.lastSeenAt && ann.mailboxes.length === 2 && ann.mailboxes[1].kind === 'shared')
ok('an address in the safety list is marked locked', j.users.find((u: any) => u.email === 'boss@pivotscl.com').roleLocked === true && ann.roleLocked === false)
ok('staff cannot see the list', (await get(who('ann@pivotscl.com'))).status === 403)
ok('signed out cannot see the list', (await get({})).status === 401)

r = await patch(who('boss@pivotscl.com'), { id: id(3), role: 'admin' })
ok('an administrator promotes staff', r.status === 200 && row(3).role === 'admin')
ok('the change is written to the audit log', T.audit_log!.some((a) => a.action === 'user.role' && a.detail.target === 'ann@pivotscl.com'))
r = await patch(who('boss@pivotscl.com'), { id: id(3), role: 'staff' })
ok('and back', r.status === 200 && row(3).role === 'staff')

r = await patch(who('boss@pivotscl.com'), { id: id(4), status: 'disabled' })
ok('a leaver is disabled', r.status === 200 && row(4).status === 'disabled' && T.audit_log!.some((a) => a.action === 'user.status'))
r = await patch(who('boss@pivotscl.com'), { id: id(4), status: 'active' })
ok('and can be enabled again', r.status === 200 && row(4).status === 'active')

ok('nobody changes themselves', (await patch(who('boss@pivotscl.com'), { id: id(1), status: 'disabled' })).status === 409 && row(1).status === 'active')
ok('an address in the safety list cannot be made staff', (await patch(who('adm@pivotscl.com'), { id: id(1), role: 'staff' })).status === 409 && row(1).role === 'admin')

// administrators looking after each other (the actor is always a second active administrator, so the last one can never be removed)
process.env.ADMIN_EMAILS = ''
row(1).role = 'admin'; row(2).role = 'admin'; row(1).status = 'active'; row(2).status = 'active'
r = await patch(who('adm@pivotscl.com'), { id: id(1), role: 'staff' })
ok('one administrator may demote another, and the actor stays an administrator', r.status === 200 && row(1).role === 'staff' && row(2).role === 'admin')
r = await patch(who('adm@pivotscl.com'), { id: id(2), role: 'staff' })
ok('but cannot demote themselves, so one administrator always remains', r.status === 409 && row(2).role === 'admin')
row(2).status = 'disabled'
ok('a disabled administrator can no longer act at all', (await patch(who('adm@pivotscl.com'), { id: id(3), role: 'admin' })).status === 401 && (await get(who('adm@pivotscl.com'))).status === 401)
row(2).status = 'active'

// bad input and origin
ok('a bad id is refused', (await patch(who('adm@pivotscl.com'), { id: 'x', role: 'admin' })).status === 400)
ok('nothing to change is refused', (await patch(who('adm@pivotscl.com'), { id: id(3) })).status === 400)
ok('an unknown role or status is refused', (await patch(who('adm@pivotscl.com'), { id: id(3), role: 'owner' })).status === 400 && (await patch(who('adm@pivotscl.com'), { id: id(3), status: 'deleted' })).status === 400)
ok('an unknown person is not found', (await patch(who('adm@pivotscl.com'), { id: id(77), role: 'admin' })).status === 404)
ok('another site cannot call it', (await patch(who('adm@pivotscl.com'), { id: id(3), role: 'admin' }, 'https://evil.example')).status === 403 && row(3).role === 'staff')
ok('a call without an origin is refused', (await patch(who('adm@pivotscl.com'), { id: id(3), role: 'admin' }, null)).status === 403)
console.log(`${pass} pass, ${fail} fail`)
