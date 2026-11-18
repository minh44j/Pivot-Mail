// Security review, 2026-11-18: each check names the problem it guards against.
import { GET as session } from '../api/auth/session.js'
import { POST as logout } from '../api/auth/logout.js'
import { PATCH as usersPatch } from '../api/users/index.js'
import { signToken } from '../api/_lib/crypto.js'
import { parseCookies } from '../api/_lib/cookies.js'

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
    { id: id(1), email: 'boss@pivotscl.com', name: 'Boss', company: 'scl', role: 'admin', status: 'active', sessions_valid_after: null },
    { id: id(3), email: 'ann@pivotscl.com', name: 'Ann', company: 'scl', role: 'staff', status: 'active', sessions_valid_after: null },
  ],
  audit_log: [],
}
let inserts = 0
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const table = url.pathname.split('/').pop() as string
  const rows = T[table] ?? []
  const filters = [...url.searchParams.entries()].filter(([, v]) => v.startsWith('eq.'))
  const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === decodeURIComponent(v.slice(3)))
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if (method === 'GET') return new Response(JSON.stringify(rows.filter(match)))
  if (method === 'POST') { if (table === 'app_users') inserts++; rows.push(body); return new Response(JSON.stringify([body]), { status: 201 }) }
  if (method === 'PATCH') { const hit = rows.filter(match); hit.forEach((r) => Object.assign(r, body)); return new Response(JSON.stringify(hit)) }
  return new Response('[]', { status: 405 })
}) as typeof fetch

const H = 'https://mail.pivotscl.com'
const cookie = (token: string) => ({ cookie: `__Host-pm_session=${encodeURIComponent(token)}` })
const sess = (email: string, extra: Record<string, unknown> = {}, now = Date.now()) => cookie(signToken({ typ: 'session', email, name: 'N', company: 'scl', ...extra }, SECRET, 3600, now))
const who = async (headers: Record<string, string>) => (await session(new Request(H + '/api/auth/session', { headers }))).status

// ---- 1. a sign-in step cookie must never pass as a session (both are signed with the same key)
const oauthCookie = signToken({ typ: 'oauth', state: 's', nonce: 'n', verifier: 'v', company: 'scl', next: '/' }, SECRET, 600)
ok('the one-time sign-in cookie is refused as a session', (await who(cookie(oauthCookie))) === 401)
const legacyOauth = signToken({ state: 's', nonce: 'n', verifier: 'v', company: 'scl', next: '/' }, SECRET, 600)
ok('...also one from before cookie types existed', (await who(cookie(legacyOauth))) === 401)
ok('...and it did not create a stray user on the way', inserts === 0)
ok('a real session works', (await who(sess('ann@pivotscl.com'))) === 200)
ok('a session from before cookie types existed (no type, has an email) still works: nobody is signed out by this release', (await who(cookie(signToken({ email: 'ann@pivotscl.com', name: 'N', company: 'scl' }, SECRET, 3600)))) === 200)
ok('a signed token with a made-up company is refused', (await who(sess('ann@pivotscl.com', { company: 'xyz' }))) === 401)

// ---- 2. a malformed cookie header must not crash the request
let threw = false
try { parseCookies('a=%E0%A4%A; __Host-pm_session=%') } catch { threw = true }
ok('a malformed cookie value is ignored, not a crash', !threw)
ok('...and the request is answered (signed out), not a server error', (await who({ cookie: '__Host-pm_session=%E0%A4%A' })) === 401)

// ---- 3. "sign out of all devices"
const old = sess('ann@pivotscl.com', {}, Date.now() - 60_000)
ok('before: an older session of Ann works', (await who(old)) === 200)
const out = (headers: Record<string, string>, body: unknown, origin: string | null = H) =>
  logout(new Request(H + '/api/auth/logout', { method: 'POST', headers: { ...headers, ...(origin ? { origin } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }))
let r = await out(sess('ann@pivotscl.com', {}, Date.now() - 30_000), { everywhere: true }, null)
ok('"everywhere" without the app\'s own origin is refused (another site cannot trigger it)', r.status === 403)
r = await out(sess('ann@pivotscl.com', {}, Date.now() - 30_000), { everywhere: true })
ok('"sign out of all devices" works from the app', r.status === 200 && (r.headers.get('set-cookie') ?? '').includes('Max-Age=0'))
ok('...every older session of that person is refused now (another computer, a copied cookie)', (await who(old)) === 401)
ok('...it is in the audit log', T.audit_log!.some((a) => a.action === 'session.signout_all' && a.actor_email === 'ann@pivotscl.com'))
await new Promise((res) => setTimeout(res, 1100))
ok('...signing in again afterwards gives a working session', (await who(sess('ann@pivotscl.com'))) === 200)
ok('...and other people are not affected', (await who(sess('boss@pivotscl.com', {}, Date.now() - 60_000))) === 200)
r = await out(sess('ann@pivotscl.com'), {})
ok('a plain sign-out still only clears this browser', r.status === 200)

// ---- 4. an administrator turning access off also ends the person's sessions; or signs them out on purpose
const before = sess('ann@pivotscl.com', {}, Date.now() - 5_000)
const admin = (body: unknown) => usersPatch(new Request(H + '/api/users', { method: 'PATCH', headers: { ...sess('boss@pivotscl.com'), origin: H, 'content-type': 'application/json' }, body: JSON.stringify(body) }))
r = await admin({ id: id(3), signOut: true })
ok('an administrator can sign a person out everywhere', r.status === 200 && (await who(before)) === 401)
ok('...logged', T.audit_log!.some((a) => a.action === 'user.signout_all'))
await new Promise((res) => setTimeout(res, 1100))
const fresh = sess('ann@pivotscl.com')
ok('...a session made after that works', (await who(fresh)) === 200)
await new Promise((res) => setTimeout(res, 1100))
await admin({ id: id(3), status: 'disabled' })
await admin({ id: id(3), status: 'active' })
ok('turning access off and on again does not bring a session from before back to life', (await who(fresh)) === 401)

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
