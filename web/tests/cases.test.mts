import { GET, PATCH, POST } from '../api/cases/index.js'
import { signToken } from '../api/_lib/crypto.js'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }

const SECRET = 's'.repeat(40)
const SB = 'https://fake.supabase.co'
process.env.SESSION_SECRET = SECRET
process.env.SUPABASE_URL = SB
process.env.SUPABASE_SECRET_KEY = 'sb_secret_x'
process.env.ADMIN_EMAILS = ''

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
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
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
const who = (email: string, company: 'scl' | 'tmc') => ({ cookie: `__Host-pm_session=${encodeURIComponent(signToken({ email, name: 'N', company }, SECRET, 3600))}` })
const call = (fn: Function, base: string, method: string, headers: Record<string, string>, body?: unknown, origin = true) =>
  fn(new Request(base + '/api/cases', { method, headers: { ...headers, ...(origin && method !== 'GET' ? { origin: base } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })) as Promise<Response>

const ship = { client: 'Acme Trading LLC', details: { scope: 'freight', mode: 'sea', origin: 'Jebel Ali', destination: 'Rotterdam', cargo: '2x40HQ', salesperson: 'Amir' } }

let r = await call(POST, H, 'POST', who('ann@pivotscl.com', 'scl'), ship)
let j = await r.json()
ok('a shipping case is opened with a generated PS reference', r.status === 201 && j.case.ref === 'PS2690001' && j.case.provisional === true)
ok('shipping details kept, nothing else', j.case.details.origin === 'Jebel Ali' && j.case.details.mode === 'sea' && j.case.kind === 'shipping')
ok('opened by the person', j.case.openedBy.email === 'ann@pivotscl.com')
r = await call(POST, H, 'POST', who('bob@pivotscl.com', 'scl'), ship)
ok('the next case gets the next number', (await r.json()).case.ref === 'PS2690002')
const TMC = 'https://mail.pivottmc.com'
r = await call(POST, TMC, 'POST', who('maya@pivottmc.com', 'tmc'), { client: 'Horizon Corporate Travel', details: { category: 'chauffeur' }, notes: 'VIP pickup' })
j = await r.json()
ok('a travel case uses the PT series and the travel form', j.case.ref === 'PT2690001' && j.case.kind === 'travel' && j.case.details.category === 'chauffeur' && j.case.notes === 'VIP pickup')

ok('missing client refused', (await call(POST, H, 'POST', who('ann@pivotscl.com', 'scl'), { ...ship, client: '  ' })).status === 400)
ok('unknown travel category refused', (await call(POST, TMC, 'POST', who('maya@pivottmc.com', 'tmc'), { client: 'X', details: { category: 'rocket' } })).status === 400)
ok('a route is optional (as in Pivot OS)', (await call(POST, H, 'POST', who('ann@pivotscl.com', 'scl'), { client: 'No route yet', details: { scope: 'freight', mode: 'air' } })).status === 201)
ok('Other is a travel category and the salesperson is kept', await (async () => { const x = await (await call(POST, TMC, 'POST', who('maya@pivottmc.com', 'tmc'), { client: 'Z', details: { category: 'other', salesperson: 'Amir' } })).json(); return x.case?.details.category === 'other' && x.case.details.salesperson === 'Amir' })())
ok('shipping form fields cannot be smuggled into a travel case', (await (await call(POST, TMC, 'POST', who('maya@pivottmc.com', 'tmc'), { client: 'Y', details: { category: 'visa', origin: 'x', evil: 'y' } })).json()).case.details.origin === undefined)
ok('oversized text is cut, not stored whole', (await (await call(POST, H, 'POST', who('ann@pivotscl.com', 'scl'), { ...ship, client: 'A'.repeat(500) })).json()).case.client.length === 160)

// registering an existing number
r = await call(POST, H, 'POST', who('ann@pivotscl.com', 'scl'), { ...ship, ref: 'ps2600123' })
j = await r.json()
ok('an existing Pivot OS number can be registered (case-insensitive)', r.status === 201 && j.case.ref === 'PS2600123' && j.case.provisional === false)
ok('the same number cannot be registered twice', (await call(POST, H, 'POST', who('bob@pivotscl.com', 'scl'), { ...ship, ref: 'PS2600123' })).status === 409)
ok('a number of the wrong series is refused', (await call(POST, H, 'POST', who('ann@pivotscl.com', 'scl'), { ...ship, ref: 'PT2600124' })).status === 400)
ok('malformed numbers are refused', (await call(POST, H, 'POST', who('ann@pivotscl.com', 'scl'), { ...ship, ref: 'PS26-1' })).status === 400)

// visibility
j = await (await call(GET, H, 'GET', who('bob@pivotscl.com', 'scl'))).json()
ok('colleagues of the same company see the case', j.cases.some((c: any) => c.ref === 'PS2690001') && j.cases.every((c: any) => c.company === 'scl'))
ok('newest first', j.cases[0].createdAt === undefined && j.cases[0].openedAt >= j.cases[j.cases.length - 1].openedAt)
j = await (await call(GET, TMC, 'GET', who('maya@pivottmc.com', 'tmc'))).json()
ok('the other company sees only its own cases', j.cases.length === 3 && j.cases.every((c: any) => c.ref.startsWith('PT')))
ok('listing needs sign-in', (await call(GET, H, 'GET', {})).status === 401)

// updates
r = await call(PATCH, H, 'PATCH', who('bob@pivotscl.com', 'scl'), { ref: 'PS2690001', notes: 'Customs hold on 12 Nov', status: 'closed' })
j = await r.json()
ok('a colleague can add notes and close a case', r.status === 200 && j.case.notes.includes('Customs hold') && j.case.status === 'closed' && j.case.closedAt)
r = await call(PATCH, H, 'PATCH', who('bob@pivotscl.com', 'scl'), { ref: 'PS2690001', status: 'open' })
ok('reopening clears the closed time', (await r.json()).case.closedAt === null)
ok('another company cannot touch it (not found)', (await call(PATCH, TMC, 'PATCH', who('maya@pivottmc.com', 'tmc'), { ref: 'PS2690001', notes: 'hack' })).status === 404)
ok('nothing to change is refused', (await call(PATCH, H, 'PATCH', who('bob@pivotscl.com', 'scl'), { ref: 'PS2690001' })).status === 400)
ok('bad reference refused', (await call(PATCH, H, 'PATCH', who('bob@pivotscl.com', 'scl'), { ref: 'x', notes: 'n' })).status === 400)
ok('writes from another site are refused', (await call(POST, H, 'POST', who('ann@pivotscl.com', 'scl'), ship, false)).status === 403)
ok('every case change is audited', T.audit_log!.filter((a) => a.action === 'case.opened').length >= 4 && T.audit_log!.some((a) => a.action === 'case.updated'))

console.log(`${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
