import type { Company } from './config.js'
import type { CompanyId } from './config.js'
import { dbConfigured, insert } from './db.js'
import { exchangeCodeFull, checkClaims } from './google.js'
import { originOf, redirect } from './http.js'
import { currentUser } from './session.js'
import { seal, vaultReady } from './vault.js'


interface Saved {
  state: string
  nonce: string
  verifier: string
  company: CompanyId
  next: string
  kind?: 'personal' | 'shared'
}

/**
 * Second half of "Add account": Google has returned with the mailbox permission. Checks who may connect what, then stores the
 * encrypted refresh token. Nothing about the mail itself is read or stored here.
 */
export async function finishConnect(p: { req: Request; host: string; secure: boolean; code: string; saved: Saved; company: Company; client: { clientId: string; clientSecret: string }; drop: string }): Promise<Response> {
  const fail = (code: string) => redirect(`/?connect_error=${code}`, [p.drop])
  if (!dbConfigured() || !vaultReady()) return fail('config')

  let me
  try {
    me = await currentUser(p.req)
  } catch {
    return fail('unavailable')
  }
  if (!me || !me.id) return fail('session')

  const kind = p.saved.kind === 'shared' ? 'shared' : 'personal'
  if (kind === 'shared' && me.role !== 'admin') return fail('forbidden')

  const result = await exchangeCodeFull({ code: p.code, verifier: p.saved.verifier, clientId: p.client.clientId, clientSecret: p.client.clientSecret, redirectUri: `${originOf(p.host)}/api/auth/google/callback` })
  const check = checkClaims(result?.claims ?? null, { clientId: p.client.clientId, nonce: p.saved.nonce, company: p.company })
  if (!result || !check.ok) return fail(check.ok ? 'token' : check.error)
  if (kind === 'personal' && check.email !== me.email) return fail('mismatch')
  // Google lets people untick permissions on the consent screen; without mail access the connection is useless.
  if (!result.scope.split(' ').includes('https://www.googleapis.com/auth/gmail.modify')) return fail('scope')
  if (!result.refreshToken) return fail('norefresh')

  try {
    const [account] = await insert<{ id: string }>('mail_accounts', { email: check.email, display_name: check.name, company: p.company.id, kind, status: 'active', created_by: me.id }, 'email')
    if (!account) return fail('unavailable')
    await insert('mail_tokens', { account_id: account.id, refresh_token_enc: seal(result.refreshToken, check.email), key_version: 1, scopes: result.scope, granted_by: me.id, revoked_at: null }, 'account_id')
    await insert('mailbox_access', { user_id: me.id, account_id: account.id, granted_by: me.id }, 'user_id,account_id')
    await insert('audit_log', { actor_email: me.email, action: 'account.connected', account_id: account.id, detail: { kind, company: p.company.id } })
  } catch {
    return fail('unavailable')
  }
  return redirect(`/?connected=${encodeURIComponent(check.email)}`, [p.drop])
}
