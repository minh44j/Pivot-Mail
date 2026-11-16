import { GET, POST } from '../api/activity.js'
import { signToken } from '../api/_lib/crypto.js'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }

const SECRET = 's'.repeat(40)
process.env.SESSION_SECRET = SECRET
process.env.SUPABASE_URL = 'https://fake.supabase.co'
process.env.SUPABASE_SECRET_KEY = 'sb_secret_x'

type Row = Record<string, any>
const T: Record<string, Row[]> = {
  app_users: [
    { id: 'u-ann', email: 'ann@pivotscl.com', name: 'Ann', company: 'scl', role: 'staff', status: 'active' },
    { id: 'u-boss', email: 'boss@pivotscl.com', name: 'Boss', company: 'scl', role: 'admin', status: 'active' },
  ],
  activity_minutes: [], daily_mail_stats: [],
  mail_accounts: [{ id: '22222222-2222-4222-8222-222222222222', kind: 'personal' }, { id: '33333333-3333-4333-8333-333333333333', kind: 'shared' }, { id: '44444444-4444-4444-8444-444444444444', kind: 'personal' }],
  mailbox_access: [{ user_id: 'u-ann', account_id: '22222222-2222-4222-8222-222222222222' }, { user_id: 'u-ann', account_id: '33333333-3333-4333-8333-333333333333' }],
}
let rpcArgs: any = null
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  const res = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s })
  if (url.pathname.endsWith('/rpc/performance_report')) { rpcArgs = body; return res([{ name: 'Ann', day: body.p_from, sent: 1 }]) }
  const rows = T[url.pathname.split('/').pop()!]!
  const filters = [...url.searchParams.entries()].filter(([, v]) => v.startsWith('eq.'))
  const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === decodeURIComponent(v.slice(3)))
  if (method === 'GET') return res(rows.filter(match))
  if (method === 'POST') {
    const cols = (url.searchParams.get('on_conflict') ?? '').split(',').filter(Boolean)
    const ex = cols.length ? rows.find((r) => cols.every((c) => r[c] === body[c])) : undefined
    if (ex) Object.assign(ex, body); else rows.push({ ...body })
    return res([body], 201)
  }
  return res([], 405)
}) as typeof fetch

const H = 'https://mail.pivotscl.com'
const who = (email: string) => ({ cookie: `__Host-pm_session=${encodeURIComponent(signToken({ email, name: 'N', company: 'scl' }, SECRET, 3600))}` })
const post = (email: string | null, body: unknown, origin: string | null = H) => POST(new Request(H + '/api/activity', { method: 'POST', headers: { ...(email ? who(email) : {}), ...(origin ? { origin } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const get = (email: string | null, qs: string) => GET(new Request(H + '/api/activity?' + qs, { headers: email ? who(email) : {} }))
const today = new Date().toISOString().slice(0, 10)
const old = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
const ACC = '22222222-2222-4222-8222-222222222222'

ok('heartbeat records one active minute for the person', (await post('ann@pivotscl.com', { kind: 'heartbeat' })).status === 200 && T.activity_minutes!.length === 1 && T.activity_minutes![0]!.user_id === 'u-ann')
await post('ann@pivotscl.com', { kind: 'heartbeat' })
ok('two heartbeats in the same minute count once', T.activity_minutes!.length === 1)
ok('minute is server time on a minute boundary', new Date(T.activity_minutes![0]!.minute).getSeconds() === 0)
ok('heartbeat needs sign-in', (await post(null, { kind: 'heartbeat' })).status === 401)
ok('heartbeat from another site is refused', (await post('ann@pivotscl.com', { kind: 'heartbeat' }, 'https://evil.example')).status === 403)

let r = await post('ann@pivotscl.com', { kind: 'stats', stats: [{ accountId: ACC, day: today, sent: 12, received: 41 }] })
ok('own mail counts are stored', (await r.json()).saved === 1 && T.daily_mail_stats![0]!.sent === 12 && T.daily_mail_stats![0]!.received === 41)
await post('ann@pivotscl.com', { kind: 'stats', stats: [{ accountId: ACC, day: today, sent: 15, received: 50 }] })
ok('reporting the same day again updates it', T.daily_mail_stats!.length === 1 && T.daily_mail_stats![0]!.sent === 15)
r = await post('ann@pivotscl.com', { kind: 'stats', stats: [{ accountId: '33333333-3333-4333-8333-333333333333', day: today, sent: 5, received: 5 }] })
ok('a shared mailbox does not count towards a person', (await r.json()).saved === 0)
r = await post('ann@pivotscl.com', { kind: 'stats', stats: [{ accountId: '44444444-4444-4444-8444-444444444444', day: today, sent: 5, received: 5 }] })
ok('a mailbox the person cannot open is ignored', (await r.json()).saved === 0)
r = await post('ann@pivotscl.com', { kind: 'stats', stats: [{ accountId: ACC, day: old, sent: 1, received: 1 }, { accountId: ACC, day: '2099-01-01', sent: 1, received: 1 }, { accountId: ACC, day: today, sent: -3, received: 1 }, { accountId: ACC, day: today, sent: 1.5, received: 1 }, { accountId: ACC, day: today, sent: 1e9, received: 1 }, { accountId: ACC, day: 'nope', sent: 1, received: 1 }] })
ok('old, future, negative, fractional, huge and malformed entries are all ignored', (await r.json()).saved === 0 && T.daily_mail_stats!.length === 1)
ok('unknown kinds are refused', (await post('ann@pivotscl.com', { kind: 'steal' })).status === 400)

ok('staff cannot read the report', (await get('ann@pivotscl.com', `from=${today}&to=${today}`)).status === 403)
ok('the report needs sign-in', (await get(null, `from=${today}&to=${today}`)).status === 401)
let g = await get('boss@pivotscl.com', `from=2026-11-01&to=2026-11-16&tz=Asia/Dubai`)
ok('an administrator gets the report with the requested range and time zone', g.status === 200 && rpcArgs.p_from === '2026-11-01' && rpcArgs.p_to === '2026-11-16' && rpcArgs.p_tz === 'Asia/Dubai')
await get('boss@pivotscl.com', `from=2026-11-01&to=2026-11-16&tz=Not/AZone`)
ok('an unknown time zone falls back to UTC', rpcArgs.p_tz === 'UTC')
ok('bad or reversed or too-long ranges are refused', (await get('boss@pivotscl.com', 'from=x&to=y')).status === 400 && (await get('boss@pivotscl.com', 'from=2026-11-16&to=2026-11-01')).status === 400 && (await get('boss@pivotscl.com', 'from=2025-01-01&to=2026-11-01')).status === 400)

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
