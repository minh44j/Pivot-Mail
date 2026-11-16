import { GET as start } from '../api/auth/start.js'
import { GET as callback } from '../api/auth/google/callback.js'
import { GET as session } from '../api/auth/session.js'
import { GET as connect } from '../api/accounts/connect.js'
import { GET as list } from '../api/accounts/index.js'
import { GET as token } from '../api/accounts/token.js'
import { POST as disconnect } from '../api/accounts/disconnect.js'
import { signToken } from '../api/_lib/crypto.js'
import { open, seal } from '../api/_lib/vault.js'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }

const SECRET = 's'.repeat(40)
const SB = 'https://fake.supabase.co'
const SB_KEY = 'sb_secret_testkey'
process.env.SESSION_SECRET = SECRET
process.env.GOOGLE_CLIENT_ID_SCL = 'scl-id'; process.env.GOOGLE_CLIENT_SECRET_SCL = 'scl-secret'
process.env.GOOGLE_CLIENT_ID_TMC = 'tmc-id'; process.env.GOOGLE_CLIENT_SECRET_TMC = 'tmc-secret'
process.env.ADMIN_EMAILS = 'boss@pivotscl.com'
process.env.SUPABASE_URL = SB
process.env.SUPABASE_SECRET_KEY = SB_KEY
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

// ---------- fake Supabase (PostgREST) ----------
type Row = Record<string, any>
const tables: Record<string, Row[]> = { app_users: [], mail_accounts: [], mail_tokens: [], mailbox_access: [], audit_log: [] }
let seq = 0
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
let wrongKeyCalls = 0

function pg(method: string, url: URL, headers: Headers, body: any): Response {
  if (headers.get('apikey') !== SB_KEY) { wrongKeyCalls++; return new Response('{}', { status: 401 }) }
  const table = url.pathname.split('/').pop() as string
  const rows = tables[table]
  if (!rows) return new Response('{}', { status: 404 })
  const filters = [...url.searchParams.entries()].filter(([k, v]) => v.startsWith('eq.') && k !== 'select')
  const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === decodeURIComponent(v.slice(3)))
  const out = (data: Row[]) => new Response(JSON.stringify(data), { status: 200 })
  if (method === 'GET') {
    let res = rows.filter(match)
    const sel = url.searchParams.get('select') ?? '*'
    if (sel.includes('mail_accounts(')) res = res.map((r) => ({ mail_accounts: tables.mail_accounts.find((a) => a.id === r.account_id) ?? null }))
    return out(res)
  }
  if (method === 'POST') {
    const list = Array.isArray(body) ? body : [body]
    const oc = url.searchParams.get('on_conflict')
    const saved: Row[] = []
    for (const item of list) {
      const cols = oc ? oc.split(',') : []
      const existing = cols.length ? rows.find((r) => cols.every((c) => r[c] === item[c])) : undefined
      if (existing) { Object.assign(existing, item); saved.push(existing); continue }
      const row = { ...(table === 'audit_log' ? { id: ++seq } : table === 'mail_tokens' || table === 'mailbox_access' ? {} : { id: uuid() }), ...item }
      if (table === 'app_users' && rows.some((r) => r.email === row.email)) return new Response('{}', { status: 409 })
      rows.push(row); saved.push(row)
    }
    return out(saved)
  }
  if (method === 'PATCH') { const hit = rows.filter(match); hit.forEach((r) => Object.assign(r, body)); return out(hit) }
  if (method === 'DELETE') {
    const hit = rows.filter(match)
    for (const h of hit) rows.splice(rows.indexOf(h), 1)
    if (table === 'mail_accounts') for (const h of hit) for (const t of ['mail_tokens', 'mailbox_access']) tables[t] = tables[t].filter((r) => r.account_id !== h.id)
    return out(hit)
  }
  return new Response('{}', { status: 405 })
}

// ---------- fake Google ----------
let claims: Record<string, unknown> = {}
let grant: { refresh_token?: string; scope?: string } = {}
let refreshResult: { status: number; body: Record<string, unknown> } = { status: 200, body: { access_token: 'ya29.fresh', expires_in: 3600 } }
const revoked: string[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const headers = new Headers(init?.headers)
  if (url.origin === SB) return pg(init?.method ?? 'GET', url, headers, init?.body ? JSON.parse(String(init.body)) : undefined)
  if (url.href === 'https://oauth2.googleapis.com/token') {
    const p = new URLSearchParams(String(init?.body))
    if (p.get('grant_type') === 'refresh_token') return new Response(JSON.stringify(refreshResult.body), { status: refreshResult.status })
    return new Response(JSON.stringify({ id_token: `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`, ...grant }), { status: 200 })
  }
  if (url.href === 'https://oauth2.googleapis.com/revoke') { revoked.push(new URLSearchParams(String(init?.body)).get('token') ?? ''); return new Response('{}') }
  return realFetch(input as any, init)
}) as typeof fetch

// ---------- helpers ----------
const SCL = 'https://mail.pivotscl.com'
const req = (base: string, path: string, init: RequestInit = {}) => new Request(base + path, init)
const loc = (r: Response) => r.headers.get('location') ?? ''
const cookieOf = (r: Response, name: string) => (r.headers.getSetCookie().find((c) => c.startsWith(name + '=')) ?? '').split(';')[0]?.slice(name.length + 1) ?? ''
const sess = (email: string, company: 'scl' | 'tmc' = 'scl') => ({ headers: { cookie: `__Host-pm_session=${encodeURIComponent(signToken({ email, name: 'N', company }, SECRET, 3600))}` } })

async function signIn(email: string, company: 'scl' | 'tmc' = 'scl', extra: Record<string, unknown> = {}) {
  const s = start(req(SCL, '/api/auth/start?company=' + company))
  const g = new URL(loc(s))
  claims = { iss: 'https://accounts.google.com', aud: g.searchParams.get('client_id'), exp: Math.floor(Date.now() / 1000) + 600, nonce: g.searchParams.get('nonce'), email, email_verified: true, hd: company === 'scl' ? 'pivotscl.com' : 'pivottmc.com', name: 'Ann', ...extra }
  grant = {}
  return callback(req(SCL, `/api/auth/google/callback?code=x&state=${g.searchParams.get('state')}`, { headers: { cookie: `pm_oauth=${encodeURIComponent(cookieOf(s, 'pm_oauth'))}` } }))
}

async function connectMailbox(user: string, mailbox: string, o: { kind?: 'personal' | 'shared'; company?: 'scl' | 'tmc'; scope?: string; refresh?: string | null; hd?: string } = {}) {
  const company = o.company ?? 'scl'
  const c = connect(req(SCL, `/api/accounts/connect?company=${company}&kind=${o.kind ?? 'personal'}`, sess(user)))
  const r = await c
  if (!loc(r).startsWith('https://accounts.google.com')) return { start: r, end: null as Response | null, url: null as URL | null }
  const g = new URL(loc(r))
  claims = { iss: 'https://accounts.google.com', aud: g.searchParams.get('client_id'), exp: Math.floor(Date.now() / 1000) + 600, nonce: g.searchParams.get('nonce'), email: mailbox, email_verified: true, hd: o.hd ?? (company === 'scl' ? 'pivotscl.com' : 'pivottmc.com'), name: 'Mailbox' }
  grant = { scope: o.scope ?? 'openid email profile https://www.googleapis.com/auth/gmail.modify', ...(o.refresh === null ? {} : { refresh_token: o.refresh ?? 'REFRESH-SECRET-1' }) }
  const cb = await callback(req(SCL, `/api/auth/google/callback?code=x&state=${g.searchParams.get('state')}`, { headers: { ...sess(user).headers, cookie: `${sess(user).headers.cookie}; pm_oauth=${encodeURIComponent(cookieOf(r, 'pm_oauth'))}` } }))
  return { start: r, end: cb, url: g }
}

// ================= vault =================
const sealed = seal('rt-123', 'a@pivotscl.com')
ok('vault: ciphertext does not contain the token', !sealed.includes('rt-123'))
ok('vault: round trip', open(sealed, 'a@pivotscl.com') === 'rt-123')
ok('vault: bound to the mailbox (other address cannot open it)', open(sealed, 'b@pivotscl.com') === null)
ok('vault: tampering detected', open(sealed.slice(0, -2) + 'AA', 'a@pivotscl.com') === null)

// ================= sign-in provisioning =================
let r = await signIn('ann@pivotscl.com')
ok('first sign-in creates the user as active staff', loc(r) === '/' && tables.app_users[0]?.status === 'active' && tables.app_users[0]?.role === 'staff')
r = await signIn('boss@pivotscl.com')
ok('admin list gives the admin role in the database', tables.app_users.find((u) => u.email === 'boss@pivotscl.com')?.role === 'admin')
const before = tables.app_users.length
await signIn('ann@pivotscl.com')
ok('second sign-in does not duplicate the user', tables.app_users.length === before)
tables.app_users.find((u) => u.email === 'ann@pivotscl.com')!.status = 'disabled'
r = await signIn('ann@pivotscl.com')
ok('disabled user is refused at sign-in', loc(r).includes('auth_error=disabled'))
const annCookie = sess('ann@pivotscl.com')
ok('disabled user\'s existing cookie stops working at once', (await session(req(SCL, '/api/auth/session', annCookie))).status === 401)
tables.app_users.find((u) => u.email === 'ann@pivotscl.com')!.status = 'active'
ok('re-enabled user works again', (await session(req(SCL, '/api/auth/session', annCookie))).status === 200)
process.env.REQUIRE_INVITE = 'true'
r = await signIn('newbie@pivotscl.com')
ok('REQUIRE_INVITE refuses people nobody added', loc(r).includes('auth_error=invite'))
r = await signIn('ann@pivotscl.com')
ok('...but known users still enter', loc(r) === '/')
delete process.env.REQUIRE_INVITE
tables.app_users.find((u) => u.email === 'ann@pivotscl.com')!.role = 'admin'
ok('role change in the database shows in the session', (await (await session(req(SCL, '/api/auth/session', annCookie))).json()).user.role === 'admin')
tables.app_users.find((u) => u.email === 'ann@pivotscl.com')!.role = 'staff'
ok('database key is sent on every call', wrongKeyCalls === 0)

// ================= connecting a mailbox =================
r = await connect(req(SCL, '/api/accounts/connect?company=scl'))
ok('connect needs a signed-in person', loc(r).includes('connect_error=session'))
r = await connect(req(SCL, '/api/accounts/connect?company=scl&kind=shared', annCookie))
ok('staff cannot connect a shared mailbox', loc(r).includes('connect_error=forbidden'))
let c = await connectMailbox('ann@pivotscl.com', 'ann@pivotscl.com')
const gu = c.url!
ok('asks for mailbox permission with offline access and consent', gu.searchParams.get('access_type') === 'offline' && gu.searchParams.get('prompt')?.includes('consent') === true && gu.searchParams.get('scope')!.includes('gmail.modify'))
ok('login hint is the person for a personal mailbox', gu.searchParams.get('login_hint') === 'ann@pivotscl.com')
ok('connect succeeds', loc(c.end!).startsWith('/?connected='))
const acc = tables.mail_accounts.find((a) => a.email === 'ann@pivotscl.com')
ok('account row created as personal', acc?.kind === 'personal' && acc?.company === 'scl')
const tok = tables.mail_tokens.find((t) => t.account_id === acc!.id)
ok('refresh token stored encrypted only', !!tok && !tok.refresh_token_enc.includes('REFRESH-SECRET-1') && open(tok.refresh_token_enc, 'ann@pivotscl.com') === 'REFRESH-SECRET-1')
ok('access row links person to mailbox', tables.mailbox_access.some((a) => a.account_id === acc!.id))
ok('audit entry written without mail content', tables.audit_log.some((a) => a.action === 'account.connected' && a.actor_email === 'ann@pivotscl.com'))
c = await connectMailbox('ann@pivotscl.com', 'someoneelse@pivotscl.com')
ok('personal mailbox must be the signed-in person', loc(c.end!).includes('connect_error=mismatch'))
c = await connectMailbox('ann@pivotscl.com', 'ann@pivotscl.com', { scope: 'openid email profile' })
ok('unticked Gmail permission is refused', loc(c.end!).includes('connect_error=scope'))
c = await connectMailbox('ann@pivotscl.com', 'ann@pivotscl.com', { refresh: null })
ok('missing refresh token is refused', loc(c.end!).includes('connect_error=norefresh'))
c = await connectMailbox('ann@pivotscl.com', 'ann@gmail.com', { hd: 'gmail.com' })
ok('foreign domain refused', loc(c.end!).includes('connect_error=domain'))
c = await connectMailbox('boss@pivotscl.com', 'ops@pivotscl.com', { kind: 'shared', refresh: 'OPS-REFRESH' })
ok('administrator can connect a shared mailbox', loc(c.end!).startsWith('/?connected=') && tables.mail_accounts.find((a) => a.email === 'ops@pivotscl.com')?.kind === 'shared')
ok('...and it is linked to the administrator only', tables.mailbox_access.filter((a) => a.account_id === tables.mail_accounts.find((x) => x.email === 'ops@pivotscl.com')!.id).length === 1)
c = await connectMailbox('boss@pivotscl.com', 'boss@pivotscl.com', { company: 'tmc', hd: 'pivottmc.com' })
ok('mailbox domain must match the chosen company (tmc project rejects scl address)', loc(c.end!).includes('connect_error=domain'))
const savedKey = process.env.TOKEN_ENCRYPTION_KEY; delete process.env.TOKEN_ENCRYPTION_KEY
r = await connect(req(SCL, '/api/accounts/connect?company=scl', annCookie))
ok('no encryption key: refuses to start', loc(r).includes('connect_error=config'))
process.env.TOKEN_ENCRYPTION_KEY = savedKey

// ================= listing =================
const mine = await (await list(req(SCL, '/api/accounts', annCookie))).json()
ok('list shows only my mailboxes', mine.accounts.length === 1 && mine.accounts[0].email === 'ann@pivotscl.com')
ok('list never contains tokens', !JSON.stringify(mine).toLowerCase().includes('refresh'))
const bossList = await (await list(req(SCL, '/api/accounts', sess('boss@pivotscl.com')))).json()
ok('administrator sees the shared mailbox they connected', bossList.accounts.some((a: any) => a.email === 'ops@pivotscl.com'))
ok('list needs sign-in', (await list(req(SCL, '/api/accounts'))).status === 401)

// ================= access token =================
const annId = acc!.id
let t = await token(req(SCL, `/api/accounts/token?id=${annId}`, annCookie))
let tj = await t.json()
ok('gives a one-hour access token for my mailbox', t.status === 200 && tj.accessToken === 'ya29.fresh' && tj.expiresAt > Date.now())
ok('refresh token never returned', !JSON.stringify(tj).includes('REFRESH'))
ok('response is not cacheable', t.headers.get('cache-control') === 'no-store')
const opsId = tables.mail_accounts.find((a) => a.email === 'ops@pivotscl.com')!.id
ok('no access row means no token', (await token(req(SCL, `/api/accounts/token?id=${opsId}`, annCookie))).status === 403)
ok('bad id rejected', (await token(req(SCL, '/api/accounts/token?id=../../x', annCookie))).status === 400)
ok('token needs sign-in', (await token(req(SCL, `/api/accounts/token?id=${annId}`))).status === 401)
refreshResult = { status: 400, body: { error: 'invalid_grant' } }
t = await token(req(SCL, `/api/accounts/token?id=${annId}`, annCookie))
ok('revoked permission: asks to reconnect and flags the mailbox', t.status === 409 && tables.mail_accounts.find((a) => a.id === annId)?.status === 'needs_reconnect')
refreshResult = { status: 200, body: { access_token: 'ya29.fresh', expires_in: 3600 } }

// ================= disconnect =================
const post = (id: string, cookie: any, origin: string | null = SCL) => disconnect(req(SCL, '/api/accounts/disconnect', { method: 'POST', headers: { ...cookie.headers, ...(origin ? { origin } : {}), 'content-type': 'application/json' }, body: JSON.stringify({ id }) }))
ok('disconnect from another site refused', (await post(annId, annCookie, 'https://evil.example')).status === 403)
ok('disconnect without origin refused', (await post(annId, annCookie, null)).status === 403)
ok('someone without access cannot remove it', (await post(opsId, annCookie)).status === 403)
r = await post(annId, annCookie)
ok('owner can disconnect', r.status === 200 && !tables.mail_accounts.some((a) => a.id === annId))
ok('permission revoked at Google', revoked.includes('REFRESH-SECRET-1'))
ok('token and access rows gone', !tables.mail_tokens.some((x) => x.account_id === annId) && !tables.mailbox_access.some((x) => x.account_id === annId))
ok('audit entry for removal', tables.audit_log.some((a) => a.action === 'account.disconnected'))

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
