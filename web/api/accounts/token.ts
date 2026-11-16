import { clientFor } from '../_lib/config.js'
import type { CompanyId } from '../_lib/config.js'
import { dbConfigured, eq, select, update } from '../_lib/db.js'
import { refreshAccessToken } from '../_lib/google.js'
import { hostOf, json } from '../_lib/http.js'
import { currentUser } from '../_lib/session.js'
import { open } from '../_lib/vault.js'

/**
 * Hands the browser a one-hour Gmail access token for a mailbox the person may open. The long-lived refresh token never leaves the server.
 * The browser then talks to Gmail directly, so mail does not pass through this server.
 */
export async function GET(req: Request): Promise<Response> {
  if (!hostOf(req) || !dbConfigured()) return json({ error: 'config' }, 503)
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_request' }, 400)
  try {
    const me = await currentUser(req)
    if (!me || !me.id) return json({ error: 'session' }, 401)
    const access = await select('mailbox_access', `user_id=${eq(me.id)}&account_id=${eq(id)}&select=account_id`)
    if (access.length === 0) return json({ error: 'forbidden' }, 403)
    const account = (await select<{ id: string; email: string; company: CompanyId; status: string }>('mail_accounts', `id=${eq(id)}&select=id,email,company,status`))[0]
    const tokenRow = (await select<{ refresh_token_enc: string; revoked_at: string | null }>('mail_tokens', `account_id=${eq(id)}&select=refresh_token_enc,revoked_at`))[0]
    if (!account || !tokenRow || tokenRow.revoked_at) return json({ error: 'reconnect' }, 409)
    const client = clientFor(account.company)
    const refresh = open(tokenRow.refresh_token_enc, account.email)
    if (!client || !refresh) return json({ error: 'reconnect' }, 409)
    const r = await refreshAccessToken({ refreshToken: refresh, ...client })
    if (!r.ok) {
      if (r.revoked) await update('mail_accounts', `id=${eq(id)}`, { status: 'needs_reconnect' })
      return json({ error: r.revoked ? 'reconnect' : 'google' }, r.revoked ? 409 : 502)
    }
    return json({ accessToken: r.accessToken, expiresAt: Date.now() + (r.expiresIn - 60) * 1000, email: account.email })
  } catch {
    return json({ error: 'unavailable' }, 503)
  }
}
