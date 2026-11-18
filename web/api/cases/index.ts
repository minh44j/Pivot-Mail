import { dbConfigured, eq, insert, rpc, select, update } from '../_lib/db.js'
import { hostOf, json, originOf } from '../_lib/http.js'
import { callOs, osConfig } from '../_lib/pivotos.js'
import { currentUser } from '../_lib/session.js'
import type { Me } from '../_lib/session.js'

/**
 * Cases: one record per job, shared by the company's staff. Staff see and change the cases of their own company only.
 * GET lists, POST opens (generates a provisional number, or registers one that already exists), PATCH updates notes/status.
 */

interface CaseRow {
  id: string
  ref: string
  company: string
  client: string
  kind: string
  details: Record<string, unknown>
  notes: string
  status: string
  ref_source: string
  created_at: string
  closed_at: string | null
  opener?: { name: string; email: string } | null
}

const COLS = 'id,ref,company,client,kind,details,notes,status,ref_source,created_at,closed_at,opener:app_users!cases_opened_by_fkey(name,email)'

const shape = (r: CaseRow) => ({
  id: r.id,
  ref: r.ref,
  company: r.company,
  client: r.client,
  kind: r.kind,
  details: r.details,
  notes: r.notes,
  status: r.status,
  provisional: r.ref_source === 'provisional',
  openedAt: r.created_at,
  closedAt: r.closed_at,
  openedBy: r.opener ? { name: r.opener.name, email: r.opener.email } : null,
})

// oxlint-disable-next-line no-control-regex
const short = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '')

/** Only the fields each form has, trimmed and limited. */
function cleanDetails(kind: 'shipping' | 'travel', d: unknown): Record<string, string> | null {
  const o = (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown>
  if (kind === 'travel') {
    const category = short(o.category, 20)
    if (!['flight', 'hotel', 'visa', 'chauffeur', 'other', 'extra'].includes(category)) return null
    return { category, salesperson: short(o.salesperson, 60) }
  }
  const scope = short(o.scope, 30)
  const mode = short(o.mode, 10)
  if (!['freight-clearance', 'freight', 'clearance'].includes(scope) || !['sea', 'air', 'land'].includes(mode)) return null
  if (scope === 'clearance' && !short(o.port, 120)) return null
  const origin = short(o.origin, 120)
  const destination = short(o.destination, 120)
  const port = short(o.port, 120)
  return { scope, mode, origin, destination, ...(port ? { port } : {}), cargo: short(o.cargo, 200), salesperson: short(o.salesperson, 60) }
}

const err = (code: string, status: number) => json({ error: code }, status)

async function guard(req: Request, needOrigin: boolean): Promise<{ me: Me } | Response> {
  const host = hostOf(req)
  if (!host || !dbConfigured()) return err('config', 503)
  if (needOrigin && req.headers.get('origin') !== originOf(host)) return err('forbidden', 403)
  try {
    const me = await currentUser(req)
    return me && me.id ? { me } : err('session', 401)
  } catch {
    return err('unavailable', 503)
  }
}

type Co = 'scl' | 'tmc'

/**
 * The companies this person may work in: their own, plus the company of every active mailbox they have been given.
 * The server decides this, never the browser. (Pivot OS still checks the person's own rights there.)
 */
async function companiesOf(me: Me): Promise<Co[]> {
  const set = new Set<Co>([me.company])
  if (me.id) {
    const rows = await select<{ mail_accounts: { company: string; status: string } | null }>('mailbox_access', `user_id=${eq(me.id)}&select=mail_accounts(company,status)`)
    for (const r of rows) if (r.mail_accounts && r.mail_accounts.status === 'active' && (r.mail_accounts.company === 'scl' || r.mail_accounts.company === 'tmc')) set.add(r.mail_accounts.company)
  }
  return [...set]
}

/** The company asked for, if the person may use it; otherwise their own. */
const pickCompany = (me: Me, allowed: Co[], asked: unknown): Co => ((asked === 'scl' || asked === 'tmc') && allowed.includes(asked) ? asked : me.company)

const inList = (cs: Co[]): string => `in.(${cs.join(',')})`

const OS_SERVICE: Record<string, string> = { flight: 'FLIGHT', hotel: 'HOTEL', visa: 'VISA', chauffeur: 'CHAUFFEUR', other: 'OTHER', extra: 'OTHER' }
const OS_SCOPE: Record<string, string> = { 'freight-clearance': 'FULL', freight: 'FREIGHT_ONLY', clearance: 'CLEARANCE_ONLY' }
const OS_MODE: Record<string, string> = { sea: 'SEA', air: 'AIR', land: 'LND' }

const id80 = (v: unknown): string | null => {
  const t = short(v, 80)
  return t || null
}

export async function GET(req: Request): Promise<Response> {
  const g = await guard(req, false)
  if (g instanceof Response) return g
  const q = new URL(req.url).searchParams
  try {
    const allowed = await companiesOf(g.me)
    const co = pickCompany(g.me, allowed, q.get('company'))
    const kind = me_kind(co)
    // Pick-lists from Pivot OS (client, port, salesperson). Only when the link is on.
    const dir = q.get('directory')
    if (dir) {
      if (!osConfig()) return err('not_linked', 404)
      if (!['client', 'port', 'sales'].includes(dir) || (dir === 'port' && kind !== 'shipping')) return err('invalid', 400)
      const query: Record<string, string> = { kind: dir, q: short(q.get('q'), 80) }
      const cid = short(q.get('clientId'), 80)
      if (cid) query.clientId = cid
      const r = await callOs<{ results: unknown[] }>(co, g.me.email, 'GET', `/api/integrations/pivot-mail/${kind}/search`, { query })
      return r.ok ? json({ results: r.data.results ?? [] }) : json({ error: 'os', message: r.message }, r.status === 403 ? 403 : 502)
    }
    // What Pivot OS knows about some numbers (for the Details panel).
    const lookup = q.get('lookup')
    if (lookup) {
      if (!osConfig()) return err('not_linked', 404)
      const refs = lookup.split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^P[ST]\d{7}$/.test(x)).slice(0, 20)
      if (refs.length === 0) return json({ results: [] })
      // PS numbers belong to Shipping, PT numbers to Travel: each is asked in its own company, if the person may use it.
      const results: unknown[] = []
      let failed = false
      for (const c of allowed) {
        const mine = refs.filter((x) => x.startsWith(c === 'scl' ? 'PS' : 'PT'))
        if (mine.length === 0) continue
        const r = await callOs<{ results: unknown[] }>(c, g.me.email, 'POST', '/api/integrations/pivot-mail/lookup', { body: { refs: mine } })
        if (r.ok) results.push(...(r.data.results ?? []))
        else failed = true
      }
      return failed && results.length === 0 ? json({ results: [], error: 'os' }) : json({ results })
    }
    const rows = await select<CaseRow>('cases', `company=${inList(allowed)}&select=${COLS}&order=created_at.desc&limit=1000`)
    return json({ cases: rows.map(shape), company: g.me.company, companies: allowed, linked: osConfig() !== null })
  } catch {
    return err('unavailable', 503)
  }
}

const me_kind = (company: string): 'shipping' | 'travel' => (company === 'scl' ? 'shipping' : 'travel')

export async function POST(req: Request): Promise<Response> {
  const g = await guard(req, true)
  if (g instanceof Response) return g
  const me = g.me
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

  try {
    const co = pickCompany(me, await companiesOf(me), b.company)
    const kind: 'shipping' | 'travel' = co === 'scl' ? 'shipping' : 'travel'
    const client = short(b.client, 160)
    const details = cleanDetails(kind, b.details)
    if (!client || !details) return err('invalid', 400)
    const notes = short(b.notes, 4000)

    let ref = short(b.ref, 12).toUpperCase()
    let source = 'pivot_os'
    let issued: { ref: string; subject?: string } | null = null
    if (ref) {
      // Registering a number that already exists (for example one issued in Pivot OS).
      if (!(co === 'scl' ? /^PS\d{7}$/ : /^PT\d{7}$/).test(ref)) return err('bad_ref', 400)
      if ((await select('cases', `ref=${eq(ref)}&select=id`)).length > 0) return err('exists', 409)
    } else if (osConfig()) {
      // Linked: the number is taken from Pivot OS's own counter, through Pivot OS's own functions.
      const os = (typeof b.os === 'object' && b.os !== null ? b.os : {}) as Record<string, unknown>
      const d = details
      const r =
        kind === 'shipping'
          ? await callOs<{ minted: { ref: string; subject: string } }>(co, me.email, 'POST', '/api/integrations/pivot-mail/shipping/mint', {
              body: {
                clientName: client,
                clientId: id80(os.clientId),
                mode: OS_MODE[d.mode ?? ''] ?? 'SEA',
                scope: OS_SCOPE[d.scope ?? ''] ?? 'FULL',
                port: d.port || null,
                origin: d.origin || null,
                destination: d.destination || null,
                originPortId: id80(os.originPortId),
                destinationPortId: id80(os.destinationPortId),
                notes,
                salesEmployeeId: id80(os.salesEmployeeId),
              },
            })
          : await callOs<{ ref: string }>(co, me.email, 'POST', '/api/integrations/pivot-mail/travel/mint', {
              body: { clientName: client, clientId: id80(os.clientId), service: OS_SERVICE[d.category ?? ''] ?? '', note: notes, salesEmployeeId: id80(os.salesEmployeeId) },
            })
      if (!r.ok) return json({ error: 'os', message: r.message }, r.status === 403 ? 403 : r.status === 422 ? 422 : 502)
      const data = r.data as { minted?: { ref: string; subject: string }; ref?: string }
      ref = (data.minted?.ref ?? data.ref ?? '').toUpperCase()
      if (!/^P[ST]\d{7}$/.test(ref)) return json({ error: 'os', message: 'Pivot OS answered with an unexpected number.' }, 502)
      issued = { ref, subject: data.minted?.subject }
    } else {
      ref = await rpc<string>('next_case_ref', { p_company: co })
      source = 'provisional'
    }
    let row: CaseRow | undefined
    try {
      ;[row] = await insert<CaseRow>('cases', { ref, company: co, client, kind, details, notes, ref_source: source, opened_by: me.id })
    } catch {
      row = undefined
    }
    if (!row) {
      // The number exists in Pivot OS but could not be saved here: say so, with the number, so nothing is lost.
      return json({ error: 'unavailable', ref: issued?.ref }, 503)
    }
    await insert('audit_log', { actor_email: me.email, action: 'case.opened', detail: { ref, company: co, source } })
    return json({ case: shape({ ...row, opener: { name: me.name, email: me.email } }), subject: issued?.subject ?? null }, 201)
  } catch {
    return err('unavailable', 503)
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const g = await guard(req, true)
  if (g instanceof Response) return g
  const me = g.me
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ref = short(b.ref, 12).toUpperCase()
  if (!/^P[ST]\d{7}$/.test(ref)) return err('bad_ref', 400)
  const patch: Record<string, unknown> = {}
  if (typeof b.notes === 'string') patch.notes = short(b.notes, 4000)
  if (b.status === 'open' || b.status === 'closed') {
    patch.status = b.status
    patch.closed_at = b.status === 'closed' ? new Date().toISOString() : null
  }
  if (Object.keys(patch).length === 0) return err('invalid', 400)
  try {
    // Scoped to the companies the person may use: another company's case simply is not found.
    const rows = await update<CaseRow>('cases', `ref=${eq(ref)}&company=${inList(await companiesOf(me))}`, patch)
    if (rows.length === 0) return err('not_found', 404)
    await insert('audit_log', { actor_email: me.email, action: 'case.updated', detail: { ref, fields: Object.keys(patch) } })
    const [row] = await select<CaseRow>('cases', `ref=${eq(ref)}&select=${COLS}`)
    return json({ case: row ? shape(row) : null })
  } catch {
    return err('unavailable', 503)
  }
}
