import { dbConfigured, eq, insert, rpc, select, update } from '../_lib/db.js'
import { hostOf, json, originOf } from '../_lib/http.js'
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
  const origin = short(o.origin, 80)
  const destination = short(o.destination, 80)
  return { scope, mode, origin, destination, cargo: short(o.cargo, 200), salesperson: short(o.salesperson, 60) }
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

export async function GET(req: Request): Promise<Response> {
  const g = await guard(req, false)
  if (g instanceof Response) return g
  try {
    const rows = await select<CaseRow>('cases', `company=${eq(g.me.company)}&select=${COLS}&order=created_at.desc&limit=1000`)
    return json({ cases: rows.map(shape), company: g.me.company })
  } catch {
    return err('unavailable', 503)
  }
}

export async function POST(req: Request): Promise<Response> {
  const g = await guard(req, true)
  if (g instanceof Response) return g
  const me = g.me
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const kind: 'shipping' | 'travel' = me.company === 'scl' ? 'shipping' : 'travel'
  const client = short(b.client, 160)
  const details = cleanDetails(kind, b.details)
  if (!client || !details) return err('invalid', 400)
  const notes = short(b.notes, 4000)

  try {
    let ref = short(b.ref, 12).toUpperCase()
    let source = 'pivot_os'
    if (ref) {
      // Registering a number that already exists (for example one issued in Pivot OS).
      if (!(me.company === 'scl' ? /^PS\d{7}$/ : /^PT\d{7}$/).test(ref)) return err('bad_ref', 400)
      if ((await select('cases', `ref=${eq(ref)}&select=id`)).length > 0) return err('exists', 409)
    } else {
      ref = await rpc<string>('next_case_ref', { p_company: me.company })
      source = 'provisional'
    }
    const [row] = await insert<CaseRow>('cases', { ref, company: me.company, client, kind, details, notes, ref_source: source, opened_by: me.id })
    if (!row) return err('unavailable', 503)
    await insert('audit_log', { actor_email: me.email, action: 'case.opened', detail: { ref, company: me.company, source } })
    return json({ case: shape({ ...row, opener: { name: me.name, email: me.email } }) }, 201)
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
    // Scoped to the person's own company: another company's case simply is not found.
    const rows = await update<CaseRow>('cases', `ref=${eq(ref)}&company=${eq(me.company)}`, patch)
    if (rows.length === 0) return err('not_found', 404)
    await insert('audit_log', { actor_email: me.email, action: 'case.updated', detail: { ref, fields: Object.keys(patch) } })
    const [row] = await select<CaseRow>('cases', `ref=${eq(ref)}&select=${COLS}`)
    return json({ case: row ? shape(row) : null })
  } catch {
    return err('unavailable', 503)
  }
}
