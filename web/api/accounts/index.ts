import { dbConfigured, eq, select } from '../_lib/db.js'
import { hostOf, json, logFail } from '../_lib/http.js'
import { currentUser } from '../_lib/session.js'

interface Joined {
  mail_accounts: { id: string; email: string; display_name: string; company: string; kind: string; status: string; sync_window_days: number } | null
}

/** The mailboxes this person may open. */
export async function GET(req: Request): Promise<Response> {
  if (!hostOf(req) || !dbConfigured()) return json({ accounts: [], configured: false })
  try {
    const me = await currentUser(req)
    if (!me || !me.id) return json({ accounts: [] }, 401)
    const rows = await select<Joined>('mailbox_access', `user_id=${eq(me.id)}&select=mail_accounts(id,email,display_name,company,kind,status,sync_window_days)`)
    const accounts = rows
      .map((r) => r.mail_accounts)
      .filter((a): a is NonNullable<Joined['mail_accounts']> => a !== null)
      .map((a) => ({ id: a.id, email: a.email, name: a.display_name || a.email, company: a.company, kind: a.kind, status: a.status, syncWindowDays: a.sync_window_days }))
    return json({ accounts, configured: true })
  } catch (e) {
    logFail('accounts/index', e)
    return json({ accounts: [], error: 'unavailable' }, 503)
  }
}
