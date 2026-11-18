import { GET as config } from '../api/_lib/auth/config.js'
import { GET as start } from '../api/_lib/auth/start.js'
import { GET as callback } from '../api/_lib/auth/callback.js'
import { GET as session } from '../api/_lib/auth/session.js'
import { POST as logout } from '../api/_lib/auth/logout.js'
import { safeNext } from '../api/_lib/http.js'
import { signToken, verifyToken } from '../api/_lib/crypto.js'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }
const SECRET = 'x'.repeat(40)
const SCL = 'https://mail.pivotscl.com'
const TMC = 'https://mail.pivottmc.com'
const req = (base: string, path: string, init: RequestInit = {}) => new Request(base + path, init)
const loc = (r: Response) => r.headers.get('location') ?? ''
const cookieOf = (r: Response, name: string) => (r.headers.getSetCookie().find((c) => c.startsWith(name + '=')) ?? '').split(';')[0]?.slice(name.length + 1) ?? ''

// 1. not configured
delete process.env.SESSION_SECRET
let r = config(req(SCL, '/api/auth/config'))
ok('unconfigured reports configured:false', (await r.json()).configured === false)
ok('start without config sends to an error', loc(start(req(SCL, '/api/auth/start'))).includes('auth_error=config'))

// 2. configured
process.env.SESSION_SECRET = SECRET
process.env.GOOGLE_CLIENT_ID_SCL = 'scl-id.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET_SCL = 'scl-secret'
process.env.GOOGLE_CLIENT_ID_TMC = 'tmc-id.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET_TMC = 'tmc-secret'
process.env.ADMIN_EMAILS = 'Boss@pivotscl.com, other@pivottmc.com'
const c1 = await config(req(SCL, '/api/auth/config')).json()
ok('config: configured, company chosen by address', c1.configured === true && c1.company === 'scl' && c1.companies.length === 2)
ok('config exposes no secrets', !JSON.stringify(c1).includes('secret'))
ok('forged host rejected', (await config(req('https://evil.example', '/api/auth/config')).json()).configured === false)

// 3. start
const s1 = start(req(SCL, '/api/auth/start?next=/mail'))
const u = new URL(loc(s1))
ok('start redirects to Google', u.origin === 'https://accounts.google.com')
ok('uses the company client id', u.searchParams.get('client_id') === 'scl-id.apps.googleusercontent.com')
ok('redirect uri is the address opened', u.searchParams.get('redirect_uri') === SCL + '/api/auth/google/callback')
ok('PKCE S256 + state + nonce present', u.searchParams.get('code_challenge_method') === 'S256' && !!u.searchParams.get('state') && !!u.searchParams.get('nonce') && (u.searchParams.get('code_challenge') ?? '').length >= 40)
ok('only identity scopes at sign-in', u.searchParams.get('scope') === 'openid email profile')
ok('domain hint', u.searchParams.get('hd') === 'pivotscl.com')
const setc = s1.headers.getSetCookie()[0] ?? ''
ok('oauth cookie is HttpOnly, Secure, SameSite=Lax, path /api/auth', /HttpOnly/.test(setc) && /Secure/.test(setc) && /SameSite=Lax/.test(setc) && /Path=\/api\/auth/.test(setc))
ok('tmc address uses the tmc client', new URL(loc(start(req(TMC, '/api/auth/start')))).searchParams.get('client_id') === 'tmc-id.apps.googleusercontent.com')
ok('shared address needs a company', loc(start(req('https://pivot-mail-web.vercel.app', '/api/auth/start'))).includes('auth_error=company'))
ok('shared address with company works', new URL(loc(start(req('https://pivot-mail-web.vercel.app', '/api/auth/start?company=tmc')))).searchParams.get('hd') === 'pivottmc.com')
ok('forged host cannot start sign-in', loc(start(req('https://evil.example', '/api/auth/start'))).includes('auth_error=config'))
ok('open redirect blocked', safeNext('//evil.com') === '/' && safeNext('https://evil.com') === '/' && safeNext('/mail?x=1') === '/mail?x=1' && safeNext(null) === '/')

// 4. callback with a mocked Google token endpoint
let idClaims: Record<string, unknown> = {}
const realFetch = globalThis.fetch
globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
  const body = String(init?.body ?? '')
  const payload = Buffer.from(JSON.stringify(idClaims)).toString('base64url')
  return new Response(JSON.stringify({ id_token: `h.${payload}.s`, ok: body.includes('code_verifier=') }), { status: 200 })
}) as typeof fetch

async function run(base: string, company: 'scl' | 'tmc', claims: Partial<Record<string, unknown>>, opts: { state?: string; omitCookie?: boolean } = {}) {
  const startRes = start(req(base, `/api/auth/start?company=${company}&next=/inbox`))
  const g = new URL(loc(startRes))
  const cookie = cookieOf(startRes, 'pm_oauth')
  const clientId = g.searchParams.get('client_id')
  idClaims = { iss: 'https://accounts.google.com', aud: clientId, exp: Math.floor(Date.now() / 1000) + 600, nonce: g.searchParams.get('nonce'), email: `ann@${company === 'scl' ? 'pivotscl' : 'pivottmc'}.com`, email_verified: true, hd: company === 'scl' ? 'pivotscl.com' : 'pivottmc.com', name: 'Ann', ...claims }
  return callback(req(base, `/api/auth/google/callback?code=abc&state=${opts.state ?? g.searchParams.get('state')}`, { headers: opts.omitCookie ? {} : { cookie: `pm_oauth=${encodeURIComponent(cookie)}` } }))
}

let c = await run(SCL, 'scl', {})
ok('good sign-in redirects to next', loc(c) === '/inbox')
const sess = cookieOf(c, '__Host-pm_session')
const sc = c.headers.getSetCookie().find((x) => x.startsWith('__Host-pm_session')) ?? ''
ok('session cookie: HttpOnly Secure Lax, Path=/, no Domain', /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Path=\/;/.test(sc + ';') && !/Domain=/i.test(sc))
ok('oauth cookie cleared', c.headers.getSetCookie().some((x) => x.startsWith('pm_oauth=;') || /pm_oauth=; .*Max-Age=0/.test(x)))
const me = await (await session(req(SCL, '/api/auth/session', { headers: { cookie: `__Host-pm_session=${encodeURIComponent(sess)}` } }))).json()
ok('session returns the person as staff', me.user.email === 'ann@pivotscl.com' && me.user.role === 'staff')
c = await run(SCL, 'scl', { email: 'boss@pivotscl.com' })
const me2 = await (await session(req(SCL, '/api/auth/session', { headers: { cookie: `__Host-pm_session=${encodeURIComponent(cookieOf(c, '__Host-pm_session'))}` } }))).json()
ok('admin list is case-insensitive', me2.user.role === 'admin')
c = await run(TMC, 'tmc', {})
ok('travel company signs in on its own address', loc(c) === '/inbox')

ok('wrong Workspace (hd) refused', loc(await run(SCL, 'scl', { hd: 'gmail.com', email: 'x@gmail.com' })).includes('auth_error=domain'))
ok('right hd but foreign address refused', loc(await run(SCL, 'scl', { email: 'x@evil.com' })).includes('auth_error=domain'))
ok('other company Workspace on this address refused', loc(await run(SCL, 'scl', { hd: 'pivottmc.com', email: 'x@pivottmc.com' })).includes('auth_error=domain'))
ok('unverified email refused', loc(await run(SCL, 'scl', { email_verified: false })).includes('auth_error=unverified'))
ok('wrong audience refused', loc(await run(SCL, 'scl', { aud: 'someone-else' })).includes('auth_error=token'))
ok('wrong nonce refused', loc(await run(SCL, 'scl', { nonce: 'nope' })).includes('auth_error=token'))
ok('wrong issuer refused', loc(await run(SCL, 'scl', { iss: 'https://evil.example' })).includes('auth_error=token'))
ok('expired id token refused', loc(await run(SCL, 'scl', { exp: Math.floor(Date.now() / 1000) - 5 })).includes('auth_error=expired'))
ok('wrong state refused', loc(await run(SCL, 'scl', {}, { state: 'forged' })).includes('auth_error=state'))
ok('missing cookie refused', loc(await run(SCL, 'scl', {}, { omitCookie: true })).includes('auth_error=state'))
ok('company parameter cannot override the address', new URL(loc(start(req(SCL, '/api/auth/start?company=tmc')))).searchParams.get('hd') === 'pivotscl.com')
const cancelled = await callback(req(SCL, '/api/auth/google/callback?error=access_denied'))
ok('cancelling is a friendly error', loc(cancelled).includes('auth_error=cancelled'))
globalThis.fetch = realFetch

// 5. session safety
const good = signToken({ email: 'a@pivotscl.com', name: 'A', company: 'scl' }, SECRET, 3600)
const hdr = (v: string) => ({ headers: { cookie: `__Host-pm_session=${encodeURIComponent(v)}` } })
ok('valid cookie accepted', (await session(req(SCL, '/api/auth/session', hdr(good)))).status === 200)
ok('tampered payload rejected', (await session(req(SCL, '/api/auth/session', hdr('x' + good)))).status === 401)
const [b, sg] = good.split('.')
const forged = Buffer.from(JSON.stringify({ email: 'boss@pivotscl.com', exp: 9999999999 })).toString('base64url') + '.' + sg
ok('forged payload with old signature rejected', (await session(req(SCL, '/api/auth/session', hdr(forged)))).status === 401 && !!b)
ok('signed with another secret rejected', (await session(req(SCL, '/api/auth/session', hdr(signToken({ email: 'a@pivotscl.com' }, 'y'.repeat(40), 3600))))).status === 401)
ok('expired cookie rejected', (await session(req(SCL, '/api/auth/session', hdr(signToken({ email: 'a@pivotscl.com' }, SECRET, 3600, Date.now() - 7200_000))))).status === 401)
ok('no cookie is 401, never cached', (await session(req(SCL, '/api/auth/session'))).status === 401 && (await session(req(SCL, '/api/auth/session'))).headers.get('cache-control') === 'no-store')
ok('verifyToken ignores garbage', verifyToken('...', SECRET) === null && verifyToken(undefined, SECRET) === null)

// 6. logout
const lo = await logout(req(SCL, '/api/auth/logout', { method: 'POST', headers: { origin: SCL } }))
ok('logout clears the cookie', lo.status === 200 && lo.headers.getSetCookie()[0]?.includes('Max-Age=0') === true)
ok('logout from another site refused', (await logout(req(SCL, '/api/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } }))).status === 403)

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
