import type { Company } from './config.js'
import type { CompanyId } from './config.js'
import { dbConfigured, eq, insert, select, update } from './db.js'
import { exchangeCodeFull, checkClaims } from './google.js'
import { originOf, redirect, logFail } from './http.js'
import { currentUser, userOf } from './session.js'
import type { SessionClaims } from './session.js'
import { seal, vaultReady } from './vault.js'


interface Saved {
  state: string
  nonce: string
  verifier: string
  company: CompanyId
  next: string
  kind?: 'personal' | 'shared'
  /** "Add account" started from the desktop app with its pass: the app's sign-in (the browser may have none) */
  as?: SessionClaims
}

/**
 * Second half of "Add account": Google has returned with the mailbox permission. Checks who may connect what, then stores the
 * encrypted refresh token. Nothing about the mail itself is read or stored here.
 */
export async function finishConnect(p: { req: Request; host: string; secure: boolean; code: string; saved: Saved; company: Company; client: { clientId: string; clientSecret: string }; drop: string }): Promise<Response> {
  // Started from the desktop app (its pass): the browser shows a small result page and the person returns to the app.
  const fromApp = !!p.saved.as
  const fail = (code: string) => redirect(fromApp ? `/desktop-account.html#error=${code}` : `/?connect_error=${code}`, [p.drop])
  if (!dbConfigured() || !vaultReady()) return fail('config')

  let me
  try {
    me = p.saved.as ? await userOf(p.saved.as) : await currentUser(p.req)
  } catch (e) {
    logFail('_lib/connect', e)
    return fail('unavailable')
  }
  if (!me || !me.id) return fail('session')

  const kind = p.saved.kind === 'shared' ? 'shared' : 'personal'
  if (kind === 'shared' && me.role !== 'admin') return fail('forbidden')

  const result = await exchangeCodeFull({ code: p.code, verifier: p.saved.verifier, clientId: p.client.clientId, clientSecret: p.client.clientSecret, redirectUri: `${originOf(p.host)}/api/auth/google/callback` })
  const check = checkClaims(result?.claims ?? null, { clientId: p.client.clientId, nonce: p.saved.nonce, company: p.company })
  if (!result || !check.ok) return fail(check.ok ? 'token' : check.error)
  // Google lets people untick permissions on the consent screen; without mail access the connection is useless.
  if (!result.scope.split(' ').includes('https://www.googleapis.com/auth/gmail.modify')) return fail('scope')
  if (!result.refreshToken) return fail('norefresh')

  try {
    // A mailbox that is already connected keeps who it belongs to and what kind it is. Reconnecting only renews the permission and
    // gives the person access. Otherwise anyone who knows a shared mailbox's password could reconnect it as their own "personal"
    // mailbox, become its owner and remove it for everybody.
    const existing = (await select<{ id: string; kind: string; created_by: string | null }>('mail_accounts', `email=${eq(check.email)}&select=id,kind,created_by`))[0]
    if (existing?.kind === 'shared' && me.role !== 'admin') return fail('forbidden')
    let account: { id: string } | undefined
    if (existing) {
      // Only an administrator may turn a personal mailbox into a shared one; nothing turns a shared mailbox back into a personal one here.
      const patch: Record<string, unknown> = { status: 'active' }
      if (kind === 'shared' && existing.kind === 'personal' && me.role === 'admin') patch.kind = 'shared'
      ;[account] = await update<{ id: string }>('mail_accounts', `id=${eq(existing.id)}`, patch)
      if (patch.kind) await insert('audit_log', { actor_email: me.email, action: 'account.made_shared', account_id: existing.id, detail: { email: check.email } })
    } else {
      ;[account] = await insert<{ id: string }>('mail_accounts', { email: check.email, display_name: check.name, company: p.company.id, kind, status: 'active', created_by: me.id })
    }
    if (!account) return fail('unavailable')
    await insert('mail_tokens', { account_id: account.id, refresh_token_enc: seal(result.refreshToken, check.email), key_version: 1, scopes: result.scope, granted_by: me.id, revoked_at: null }, 'account_id')
    await insert('mailbox_access', { user_id: me.id, account_id: account.id, granted_by: me.id }, 'user_id,account_id')
    await insert('audit_log', { actor_email: me.email, action: existing ? 'account.reconnected' : 'account.connected', account_id: account.id, detail: { kind: existing?.kind ?? kind, company: p.company.id, otherAddress: check.email !== me.email } })
  } catch (e) {
    logFail('_lib/connect', e)
    return fail('unavailable')
  }
  return redirect(fromApp ? `/desktop-account.html#added=${encodeURIComponent(check.email)}` : `/?connected=${encodeURIComponent(check.email)}`, [p.drop])
}
