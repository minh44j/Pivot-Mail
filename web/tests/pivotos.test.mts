import { createHmac } from 'node:crypto'
import { GET, POST } from '../api/cases/index.js'
import { signToken } from '../api/_lib/crypto.js'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }

const SECRET = 's'.repeat(40)
const SB = 'https://fake.supabase.co'
process.env.SESSION_SECRET = SECRET
process.env.SUPABASE_URL = SB
process.env.SUPABASE_SECRET_KEY = 'sb_secret_x'
process.env.ADMIN_EMAILS = ''
const OS = 'https://os.example.com'
const LINK = 'L'.repeat(40)
process.env.PIVOT_OS_URL = OS + '/'
process.env.PIVOT_OS_LINK_SECRET = LINK

type Row = Record<string, any>
const T: Record<string, Row[]> = {
  app_users: [
    { id: 'u-ann', email: 'ann@pivotscl.com', name: 'Ann', company: 'scl', role: 'staff', status: 'active' },
    { id: 'u-bob', email: 'bob@pivotscl.com', name: 'Bob', company: 'scl', role: 'staff', status: 'active' },
    { id: 'u-maya', email: 'maya@pivottmc.com', name: 'Maya', company: 'tmc', role: 'staff', status: 'active' },
  ],
  cases: [], audit_log: [],
}
const counters: Record<string, number> = {}
let seq = 0
const osCalls: { method: string; path: string; actor: string; company: string; body: any; valid: boolean }[] = []
let osReply: { status: number; body: any } | null = null
let osN = 891
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.origin === OS) {
    const h = new Headers(init?.headers)
    const method = init?.method ?? 'GET'
    const body = init?.body ? String(init.body) : ''
    const want = createHmac('sha256', LINK).update([h.get('x-pm-timestamp'), method, url.pathname + url.search, (h.get('x-pm-actor') ?? '').toLowerCase(), (h.get('x-pm-company') ?? '').toUpperCase(), body].join('\n')).digest('hex')
    osCalls.push({ method, path: url.pathname + url.search, actor: h.get('x-pm-actor') ?? '', company: h.get('x-pm-company') ?? '', body: body ? JSON.parse(body) : null, valid: want === h.get('x-pm-signature') && Math.abs(Date.now() - Number(h.get('x-pm-timestamp'))) < 60000 })
    const r = osReply ?? { status: 200, body: url.pathname.endsWith('/shipping/mint') ? (osN++, { minted: { ref: 'PS26' + String(osN).padStart(5, '0'), subject: 'PS26' + String(osN).padStart(5, '0') + ' - ACME' } }) : url.pathname.endsWith('/travel/mint') ? { ref: 'PT2600017' } : { results: [{ id: 'c1', name: 'Acme Trading' }] } }
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  const ok2 = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s })
  if (url.pathname.endsWith('/rpc/next_case_ref')) { const k = body.p_company; counters[k] = (counters[k] ?? 90000) + 1; return ok2((k === 'scl' ? 'PS' : 'PT') + '26' + String(counters[k]).padStart(5, '0')) }
  const table = url.pathname.split('/').pop() as string
  const rows = T[table]!
  const filters = [...url.searchParams.entries()].filter(([, v]) => v.startsWith('eq.'))
  const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === decodeURIComponent(v.slice(3)))
  if (method === 'GET') {
    let res = rows.filter(match)
    if (table === 'cases') { res = [...res].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => ({ ...r, opener: (() => { const u = T.app_users!.find((x) => x.id === r.opened_by); return u ? { name: u.name, email: u.email } : null })() })) }
    return ok2(res)
  }
  if (method === 'POST') {
    const row = { ...(table === 'audit_log' ? { id: ++seq } : { id: 'c' + ++seq, created_at: new Date(Date.now() + seq).toISOString(), closed_at: null, status: 'open', notes: '' }), ...body }
    if (table === 'cases' && rows.some((r) => r.ref === row.ref)) return ok2({}, 409)
    rows.push(row); return ok2([row], 201)
  }
  if (method === 'PATCH') { const hit = rows.filter(match); hit.forEach((r) => Object.assign(r, body)); return ok2(hit) }
  return ok2([], 405)
}) as typeof fetch

const H = 'https://mail.pivotscl.com'
const TMC = 'https://mail.pivottmc.com'
const who = (email: string, company: 'scl' | 'tmc') => ({ cookie: `__Host-pm_session=${encodeURIComponent(signToken({ email, name: 'N', company }, SECRET, 3600))}` })
const call = (fn: Function, base: string, method: string, headers: Record<string, string>, body?: unknown, qs = '') =>
  fn(new Request(base + '/api/cases' + qs, { method, headers: { ...headers, ...(method !== 'GET' ? { origin: base } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })) as Promise<Response>
const ann = who('ann@pivotscl.com', 'scl')
const maya = who('maya@pivottmc.com', 'tmc')

// ---- shipping: the number comes from Pivot OS
let r = await call(POST, H, 'POST', ann, { client: 'Acme Trading LLC', details: { scope: 'freight-clearance', mode: 'air', origin: 'Dubai (DXB)', destination: 'Riyadh (RUH)', salesperson: 'Amir' }, notes: 'urgent', os: { clientId: 'c1', originPortId: 'p1', destinationPortId: 'p2', salesEmployeeId: 'e9', evil: 'x' } })
let j = await r.json()
ok('linked: the case takes the number Pivot OS issued', r.status === 201 && j.case.ref === 'PS2600892' && j.case.provisional === false && j.subject === 'PS2600892 - ACME')
const m = osCalls.at(-1)!
ok('the call is signed, for this person and Pivot Shipping', m.valid && m.actor === 'ann@pivotscl.com' && m.company === 'PIVS' && m.method === 'POST' && m.path === '/api/integrations/pivot-mail/shipping/mint')
ok('the form is mapped to Pivot OS words (air → AIR, FULL scope, picked ids kept, notes sent)', m.body.mode === 'AIR' && m.body.scope === 'FULL' && m.body.clientId === 'c1' && m.body.originPortId === 'p1' && m.body.destinationPortId === 'p2' && m.body.salesEmployeeId === 'e9' && m.body.notes === 'urgent' && m.body.evil === undefined)
ok('no number is made locally while linked', !('p_company' in (counters as any)) && Object.keys(counters).length === 0)
ok('the case is saved here with its source', T.cases!.length === 1 && T.cases![0]!.ref_source === 'pivot_os')

r = await call(POST, H, 'POST', ann, { client: 'Clear Co', details: { scope: 'clearance', mode: 'sea', port: 'Jeddah' } })
const m2 = osCalls.at(-1)!
ok('a customs-only job sends the clearance port and no route', r.status === 201 && m2.body.scope === 'CLEARANCE_ONLY' && m2.body.port === 'Jeddah' && m2.body.origin === null)
ok('a customs-only job without a port is refused here', (await call(POST, H, 'POST', ann, { client: 'Clear Co', details: { scope: 'clearance', mode: 'sea' } })).status === 400)

// ---- travel
r = await call(POST, TMC, 'POST', maya, { client: 'Horizon Corporate Travel', details: { category: 'extra' }, notes: 'VIP', os: { clientId: 'c7' } })
j = await r.json()
const m3 = osCalls.at(-1)!
ok('travel: number from Pivot OS, company PIVT, category sent as the service (extra → OTHER)', r.status === 201 && j.case.ref === 'PT2600017' && m3.company === 'PIVT' && m3.path === '/api/integrations/pivot-mail/travel/mint' && m3.body.service === 'OTHER' && m3.body.clientId === 'c7' && m3.body.note === 'VIP')

// ---- failures are explained, nothing is saved
const saved = T.cases!.length
osReply = { status: 422, body: { error: 'Client name is required' } }
r = await call(POST, H, 'POST', ann, { client: 'X1', details: { scope: 'freight', mode: 'sea' } })
ok('Pivot OS says no (422): its sentence is passed on and nothing is saved', r.status === 422 && (await r.json()).message === 'Client name is required' && T.cases!.length === saved)
osReply = { status: 403, body: { error: 'Not allowed.' } }
ok('the person may not mint in Pivot OS (403): refused', (await call(POST, H, 'POST', ann, { client: 'X2', details: { scope: 'freight', mode: 'sea' } })).status === 403)
osReply = { status: 200, body: { minted: { ref: 'junk' } } }
ok('an odd answer is not trusted', (await call(POST, H, 'POST', ann, { client: 'X3', details: { scope: 'freight', mode: 'sea' } })).status === 502 && T.cases!.length === saved)
osReply = null

// ---- registering an existing number never calls Pivot OS
const n = osCalls.length
r = await call(POST, H, 'POST', ann, { client: 'Old Co', ref: 'PS2600555', details: { scope: 'freight', mode: 'sea' } })
ok('an existing number is registered here without asking Pivot OS for a new one', r.status === 201 && osCalls.length === n)

// ---- pick-lists and lookups
r = await call(GET, H, 'GET', ann, undefined, '?directory=client&q=acme')
const g1 = osCalls.at(-1)!
ok('client pick-list: signed GET with the query in the signature', (await r.json()).results[0].id === 'c1' && g1.valid && g1.path === '/api/integrations/pivot-mail/shipping/search?kind=client&q=acme')
ok('ports are a shipping-only list', (await call(GET, TMC, 'GET', maya, undefined, '?directory=port&q=jed')).status === 400)
r = await call(GET, TMC, 'GET', maya, undefined, '?directory=sales&clientId=c7')
ok('travel pick-lists go to the travel endpoint', osCalls.at(-1)!.path === '/api/integrations/pivot-mail/travel/search?kind=sales&q=&clientId=c7' && osCalls.at(-1)!.valid)
r = await call(GET, H, 'GET', ann, undefined, '?lookup=PS2600892,PT2600001,junk')
ok('lookup sends only well-formed numbers', osCalls.at(-1)!.body.refs.join() === 'PS2600892,PT2600001')
ok('the list says the link is on', (await (await call(GET, H, 'GET', ann)).json()).linked === true)
ok('a signed-out caller gets nothing', (await call(GET, H, 'GET', {}, undefined, '?directory=client&q=a')).status === 401)

// ---- link off: unchanged behaviour
delete process.env.PIVOT_OS_URL
const n2 = osCalls.length
r = await call(POST, H, 'POST', ann, { client: 'Local Co', details: { scope: 'freight', mode: 'sea' } })
j = await r.json()
ok('link off: a provisional number is made here and Pivot OS is not called', r.status === 201 && j.case.provisional === true && /^PS26900\d\d$/.test(j.case.ref) && osCalls.length === n2)
ok('link off: pick-lists are not available', (await call(GET, H, 'GET', ann, undefined, '?directory=client&q=a')).status === 404 && (await (await call(GET, H, 'GET', ann)).json()).linked === false)
process.env.PIVOT_OS_URL = 'http://os.example.com'
ok('link off: plain http is not accepted', (await call(GET, H, 'GET', ann, undefined, '?directory=client&q=a')).status === 404)

console.log(`${pass} pass, ${fail} fail`)
