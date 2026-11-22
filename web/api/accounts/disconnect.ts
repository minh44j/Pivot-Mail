import { clientFor } from '../_lib/config.js'
import type { CompanyId } from '../_lib/config.js'
import { dbConfigured, eq, insert, remove, select } from '../_lib/db.js'
import { revokeToken } from '../_lib/google.js'
import { hostOf, json, originOf, logFail } from '../_lib/http.js'
import { currentUser } from '../_lib/session.js'
import { open } from '../_lib/vault.js'

/** Removes a mailbox: revokes the permission at Google, then deletes the stored token and the connection. Mail in Gmail is untouched. */
export async function POST(req: Request): Promise<Response> {
  const host = hostOf(req)
  if (!host || !dbConfigured()) return json({ error: 'config' }, 503)
  const origin = req.headers.get('origin')
  if (!origin || origin !== originOf(host)) return json({ error: 'forbidden' }, 403)
  const body = (await req.json().catch(() => ({}))) as { id?: string }
  const id = body.id ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_request' }, 400)
  try {
    const me = await currentUser(req)
    if (!me || !me.id) return json({ error: 'session' }, 401)
    const access = await select('mailbox_access', `user_id=${eq(me.id)}&account_id=${eq(id)}&select=account_id`)
    if (access.length === 0) return json({ error: 'forbidden' }, 403)
    const account = (await select<{ id: string; email: string; company: CompanyId; created_by: string | null }>('mail_accounts', `id=${eq(id)}&select=id,email,company,created_by`))[0]
    if (!account) return json({ ok: true })
    // The person who connected it, or an administrator, may remove it.
    if (account.created_by !== me.id && me.role !== 'admin') return json({ error: 'forbidden' }, 403)
    const tokenRow = (await select<{ refresh_token_enc: string }>('mail_tokens', `account_id=${eq(id)}&select=refresh_token_enc`))[0]
    const refresh = tokenRow ? open(tokenRow.refresh_token_enc, account.email) : null
    if (refresh && clientFor(account.company)) await revokeToken(refresh)
    await remove('mail_accounts', `id=${eq(id)}`) // cascades to the token and the access rows
    await insert('audit_log', { actor_email: me.email, action: 'account.disconnected', detail: { email: account.email } })
    return json({ ok: true })
  } catch (e) {
    logFail('accounts/disconnect', e)
    return json({ error: 'unavailable' }, 503)
  }
}
