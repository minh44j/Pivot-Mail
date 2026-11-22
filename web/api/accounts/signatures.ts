import { dbConfigured, eq, select } from '../_lib/db.js'
import { hostOf, json, logFail } from '../_lib/http.js'
import { callOs, osConfig } from '../_lib/pivotos.js'
import { currentUser } from '../_lib/session.js'

interface Joined {
  mail_accounts: { id: string; email: string } | null
}

export interface OsSignaturePerson {
  empId: string
  name: string
  mine: boolean
  options: { key: string; label: string; html: string }[]
}

/**
 * The official e-mail signature of each mailbox this person may open, from Pivot OS (the same signature its shared
 * /signature page hands out). Pivot Mail applies it to new mail, replies and forwards, so nobody has to paste it in.
 * Only the person's own mailboxes are asked about; Pivot OS checks the person too (signed link).
 */
export async function GET(req: Request): Promise<Response> {
  if (!hostOf(req) || !dbConfigured()) return json({ signatures: {}, configured: false })
  if (!osConfig()) return json({ signatures: {}, configured: false })
  try {
    const me = await currentUser(req)
    if (!me || !me.id) return json({ signatures: {} }, 401)
    const rows = await select<Joined>('mailbox_access', `user_id=${eq(me.id)}&select=mail_accounts(id,email)`)
    const mine = rows.map((r) => r.mail_accounts).filter((a): a is NonNullable<Joined['mail_accounts']> => a !== null)
    if (mine.length === 0) return json({ signatures: {}, configured: true })
    const r = await callOs<{ mailboxes?: { email?: string; people?: OsSignaturePerson[] }[] }>(me.company, me.email, 'POST', '/api/integrations/pivot-mail/signature', {
      body: { mailboxes: mine.map((a) => a.email) },
    })
    if (!r.ok) return json({ signatures: {}, configured: true, error: r.message }, r.status === 404 ? 200 : 502)
    const byEmail = new Map((r.data.mailboxes ?? []).map((m) => [String(m.email ?? '').toLowerCase(), m.people ?? []]))
    const signatures: Record<string, OsSignaturePerson[]> = {}
    for (const a of mine) {
      const people = (byEmail.get(a.email.toLowerCase()) ?? [])
        .filter((p) => p && typeof p.empId === 'string' && Array.isArray(p.options))
        .map((p) => ({
          empId: String(p.empId).slice(0, 20),
          name: String(p.name ?? '').slice(0, 120),
          mine: p.mine === true,
          options: p.options
            .filter((o) => o && typeof o.html === 'string' && o.html.length < 60_000)
            .slice(0, 8)
            .map((o) => ({ key: String(o.key ?? '').slice(0, 40), label: String(o.label ?? '').slice(0, 80), html: o.html })),
        }))
        .filter((p) => p.options.length > 0)
      if (people.length > 0) signatures[a.id] = people
    }
    return json({ signatures, configured: true })
  } catch (e) {
    logFail('accounts/signatures', e)
    return json({ signatures: {}, error: 'unavailable' }, 503)
  }
}
