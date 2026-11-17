import { GET, PATCH } from '../api/auth/session.js'
import { signToken } from '../api/_lib/crypto.js'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }
const SECRET = 's'.repeat(40)
process.env.SESSION_SECRET = SECRET
process.env.SUPABASE_URL = 'https://fake.supabase.co'
process.env.SUPABASE_SECRET_KEY = 'sb_secret_x'
process.env.ADMIN_EMAILS = ''

type Row = Record<string, any>
const users: Row[] = [
  { id: 'u-ann', email: 'ann@pivotscl.com', name: 'Ann', company: 'scl', role: 'staff', status: 'active', title: '' },
  { id: 'u-bob', email: 'bob@pivotscl.com', name: 'Bob', company: 'scl', role: 'staff', status: 'active', title: 'Ticketing Lead' },
]
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const filters = [...url.searchParams.entries()].filter(([, v]) => v.startsWith('eq.'))
  const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === decodeURIComponent(v.slice(3)))
  if ((init?.method ?? 'GET') === 'PATCH') { const hit = users.filter(match); hit.forEach((r) => Object.assign(r, JSON.parse(String(init!.body)))); return new Response(JSON.stringify(hit)) }
  return new Response(JSON.stringify(users.filter(match)))
}) as typeof fetch

const H = 'https://mail.pivotscl.com'
const who = (email: string) => ({ cookie: `__Host-pm_session=${encodeURIComponent(signToken({ email, name: 'N', company: 'scl' }, SECRET, 3600))}` })
const patch = (email: string | null, body: unknown, origin: string | null = H) =>
  PATCH(new Request(H + '/api/auth/session', { method: 'PATCH', headers: { ...(email ? who(email) : {}), ...(origin ? { origin } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }))

let r = await GET(new Request(H + '/api/auth/session', { headers: who('bob@pivotscl.com') }))
ok('the session carries the saved title', (await r.json()).user.title === 'Ticketing Lead')
r = await patch('ann@pivotscl.com', { title: '  Operations   Associate ' })
ok('a person saves their own title, tidied', r.status === 200 && users[0]!.title === 'Operations Associate' && (await r.json()).title === 'Operations Associate')
ok('another person is untouched', users[1]!.title === 'Ticketing Lead')
r = await patch('ann@pivotscl.com', { title: 'x'.repeat(61) })
ok('over 60 characters is refused', r.status === 400 && users[0]!.title === 'Operations Associate')
r = await patch('ann@pivotscl.com', { title: 5 })
ok('not text is refused', r.status === 400)
r = await patch('ann@pivotscl.com', { title: 'a\u0000b\nc' })
ok('control characters are removed', r.status === 200 && users[0]!.title === 'abc')
r = await patch('ann@pivotscl.com', { title: '' })
ok('an empty title clears it', r.status === 200 && users[0]!.title === '')
r = await patch(null, { title: 'x' })
ok('signed out is refused', r.status === 401)
r = await patch('ann@pivotscl.com', { title: 'x' }, 'https://evil.example')
ok('a request from another site is refused', r.status === 403 && users[0]!.title === '')
r = await patch('ann@pivotscl.com', { title: 'x' }, null)
ok('a request without an origin is refused', r.status === 403)
ok('role cannot be changed through this call', (await patch('ann@pivotscl.com', { title: 'Boss', role: 'admin' })).status === 200 && users[0]!.role === 'staff')
console.log(`${pass} pass, ${fail} fail`)
