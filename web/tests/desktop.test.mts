// Desktop app sign-in handoff. The browser signs in with Google; the app gets a two-minute ticket that only works with its own secret.
import { GET as start } from '../api/_lib/auth/start.js'
import { GET as callback } from '../api/_lib/auth/callback.js'
import { GET as session } from '../api/_lib/auth/session.js'
import { POST as redeem } from '../api/_lib/auth/desktop.js'
import { GET as dispatchGet, POST as dispatchPost, PATCH as dispatchPatch } from '../api/auth/index.js'
import { sha256b64url, signToken, randomToken } from '../api/_lib/crypto.js'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }
const SECRET = 'x'.repeat(40)
const SCL = 'https://mail.pivotscl.com'
process.env.SESSION_SECRET = SECRET
process.env.GOOGLE_CLIENT_ID_SCL = 'scl-id.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET_SCL = 'scl-secret'
delete process.env.SUPABASE_URL
const req = (path: string, init: RequestInit = {}) => new Request(SCL + path, init)
const loc = (r: Response) => r.headers.get('location') ?? ''
const cookieOf = (r: Response, name: string) => (r.headers.getSetCookie().find((c) => c.startsWith(name + '=')) ?? '').split(';')[0]?.slice(name.length + 1) ?? ''

let idClaims: Record<string, unknown> = {}
globalThis.fetch = (async () => new Response(JSON.stringify({ id_token: `h.${Buffer.from(JSON.stringify(idClaims)).toString('base64url')}.s` }), { status: 200 })) as typeof fetch

/** The app's side: a secret and its hash, then a full sign-in through the browser. */
async function browserSignIn(challenge: string | null, email = 'ann@pivotscl.com') {
  const s = start(req(`/api/auth/start${challenge ? `?desktop=${challenge}` : ''}`))
  const g = new URL(loc(s))
  idClaims = { iss: 'https://accounts.google.com', aud: 'scl-id.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, nonce: g.searchParams.get('nonce'), email, email_verified: true, hd: 'pivotscl.com', name: 'Ann' }
  const oauth = cookieOf(s, 'pm_oauth')
  return callback(req(`/api/auth/google/callback?code=c&state=${g.searchParams.get('state')}`, { headers: { cookie: `pm_oauth=${oauth}` } }))
}
const ticketOf = (r: Response) => decodeURIComponent((/#t=([^&]+)/.exec(loc(r)) ?? [])[1] ?? '')
const post = (t: string, v: string) => redeem(req('/api/auth/desktop', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ t, v }).toString() }))
const who = async (cookieValue: string) => (await session(req('/api/auth/session', { headers: { cookie: `__Host-pm_session=${cookieValue}` } }))).status

const secret = randomToken(32)
const challenge = sha256b64url(secret)

// ---- the normal path
let r = await browserSignIn(challenge)
const ticket = ticketOf(r)
ok('a sign-in started by the app ends on the hand-back page, with the ticket in the fragment (never sent to a server)', loc(r).startsWith('/desktop-signed-in.html#t=') && ticket.length > 20)
ok('...the browser is signed in too (so "Add account" can finish there)', cookieOf(r, '__Host-pm_session').length > 20)
r = await post(ticket, secret)
const appCookie = cookieOf(r, '__Host-pm_session')
ok('the app trades ticket + its secret for its own session', loc(r) === '/' && appCookie.length > 20 && (await who(appCookie)) === 200)
ok('...a secure, host-only, HttpOnly session cookie', /HttpOnly/.test(r.headers.getSetCookie()[0] ?? '') && /Secure/.test(r.headers.getSetCookie()[0] ?? '') && !/Domain=/i.test(r.headers.getSetCookie()[0] ?? ''))

// ---- what must fail
ok('the ticket without the secret is refused (another program that caught the hand-back link gets nothing)', loc(await post(ticket, '')) === '/?auth_error=state')
ok('the ticket with a wrong secret is refused', loc(await post(ticket, randomToken(32))) === '/?auth_error=state' && cookieOf(await post(ticket, randomToken(32)), '__Host-pm_session') === '')
ok('the ticket itself is not a session', (await who(ticket)) === 401)
const browserCookie = cookieOf(await browserSignIn(null), '__Host-pm_session')
ok('a normal session cannot be traded as a ticket', loc(await post(browserCookie, secret)) === '/?auth_error=state')
const old = signToken({ typ: 'handoff', email: 'ann@pivotscl.com', name: 'Ann', company: 'scl', role: 'staff', ch: challenge }, SECRET, 120, Date.now() - 200_000)
ok('an expired ticket (older than two minutes) is refused', loc(await post(old, secret)) === '/?auth_error=state')
const forged = signToken({ typ: 'handoff', email: 'ann@pivotscl.com', name: 'Ann', company: 'scl', role: 'staff', ch: challenge }, 'y'.repeat(40), 120)
ok('a ticket not signed by the server is refused', loc(await post(forged, secret)) === '/?auth_error=state')
ok('a malformed desktop value at start is ignored (normal browser sign-in)', !loc(await browserSignIn('bad value')).includes('desktop-signed-in'))
ok('a plain browser sign-in still goes back to the app page', loc(await browserSignIn(null)) === '/')

// ---- the single sign-in function answers every old address
ok('dispatcher: /api/auth/start', loc(await dispatchGet(req('/api/auth/start'))).startsWith('https://accounts.google.com'))
ok('dispatcher: /api/auth/session', (await dispatchGet(req('/api/auth/session'))).status === 401)
ok('dispatcher: /api/auth/config', (await (await dispatchGet(req('/api/auth/config'))).json()).configured === true)
ok('dispatcher: rewritten form /api/auth?__route=google/callback reaches the callback', loc(await dispatchGet(req('/api/auth?__route=google/callback'))).includes('auth_error=state'))
ok('dispatcher: POST /api/auth/logout', (await dispatchPost(req('/api/auth/logout', { method: 'POST', headers: { origin: SCL } }))).status === 200)
ok('dispatcher: POST /api/auth/desktop', loc(await dispatchPost(req('/api/auth/desktop', { method: 'POST', body: '' }))) === '/?auth_error=state')
ok('dispatcher: PATCH /api/auth/session needs sign-in', (await dispatchPatch(req('/api/auth/session', { method: 'PATCH', headers: { origin: SCL } }))).status >= 400)
ok('dispatcher: unknown route is 404, wrong method 405', (await dispatchGet(req('/api/auth/nope'))).status === 404 && (await dispatchGet(req('/api/auth/logout'))).status === 405)

// ---- login forgery: a form on another website posting a valid ticket (for the attacker's own account) is refused
{
  const sec2 = randomToken(32)
  const t2 = ticketOf(await browserSignIn(sha256b64url(sec2), 'mallory@pivotscl.com'))
  const forged = (headers: Record<string, string>) => redeem(req('/api/auth/desktop', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ t: t2, v: sec2 }).toString() }))
  const a = await forged({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })
  const b = await forged({ origin: 'https://evil.example' })
  const c = await forged({ 'sec-fetch-site': 'same-site', origin: 'https://other.pivotscl.com' })
  ok('a hand-off posted from another website is refused (no session cookie)', [a, b, c].every((x) => loc(x) === '/?auth_error=state' && !cookieOf(x, '__Host-pm_session')))
  const d = await forged({ 'sec-fetch-site': 'none' })
  ok('...while the app\'s own post (no other site involved) still signs in', loc(d) === '/' && !!cookieOf(d, '__Host-pm_session'))
}

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
