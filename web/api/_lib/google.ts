import type { Company } from './config.js'

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'

/** Permissions asked when a mailbox is connected (not at sign-in). gmail.modify covers read, label, archive, trash and send. */
export const MAILBOX_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
]

export function authUrl(p: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string; company: Company; mailbox?: { loginHint?: string } }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: p.mailbox ? MAILBOX_SCOPES.join(' ') : 'openid email profile',
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    hd: p.company.domain, // only a hint for the account chooser; the server checks the result
    prompt: p.mailbox ? 'consent select_account' : 'select_account',
  })
  if (p.mailbox) {
    q.set('access_type', 'offline') // needed to receive a refresh token
    if (p.mailbox.loginHint) q.set('login_hint', p.mailbox.loginHint)
  }
  return `${AUTH}?${q.toString()}`
}

export interface IdClaims {
  iss?: string
  aud?: string
  exp?: number
  nonce?: string
  email?: string
  email_verified?: boolean
  hd?: string
  name?: string
  picture?: string
}

/** The code is exchanged directly with Google over TLS using the client secret, so the id_token comes straight from Google. */
export interface CodeResult {
  claims: IdClaims | null
  refreshToken: string | null
  scope: string
}

export async function exchangeCodeFull(p: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<CodeResult | null> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: p.code,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: p.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: p.verifier,
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { id_token?: string; refresh_token?: string; scope?: string }
  const payload = data.id_token?.split('.')[1]
  if (!payload) return null
  try {
    return { claims: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IdClaims, refreshToken: data.refresh_token ?? null, scope: data.scope ?? '' }
  } catch {
    return null
  }
}

/** Sign-in only needs the identity claims. */
export async function exchangeCode(p: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<IdClaims | null> {
  return (await exchangeCodeFull(p))?.claims ?? null
}

/** Turns a stored refresh token into a one-hour access token. */
export async function refreshAccessToken(p: { refreshToken: string; clientId: string; clientSecret: string }): Promise<{ ok: true; accessToken: string; expiresIn: number } | { ok: false; revoked: boolean }> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: p.refreshToken, client_id: p.clientId, client_secret: p.clientSecret, grant_type: 'refresh_token' }),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
  if (res.ok && data.access_token) return { ok: true, accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 }
  // Logged (Google's short error code only, never a token): a mailbox that silently stops working must show up somewhere.
  console.error(`[pivot-mail] google token refresh failed: ${res.status} ${String(data.error ?? '').slice(0, 60)}`)
  return { ok: false, revoked: data.error === 'invalid_grant' }
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) })
  } catch {
    /* best effort: the token is deleted on our side either way */
  }
}

export type ClaimError = 'token' | 'domain' | 'unverified' | 'expired'

/** Every check that decides whether this person may enter. Pure, so it can be tested. */
export function checkClaims(c: IdClaims | null, o: { clientId: string; nonce: string; company: Company; now?: number }): { ok: true; email: string; name: string; picture?: string } | { ok: false; error: ClaimError } {
  if (!c || (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') || c.aud !== o.clientId || c.nonce !== o.nonce || typeof c.email !== 'string') return { ok: false, error: 'token' }
  if (typeof c.exp !== 'number' || c.exp * 1000 < (o.now ?? Date.now())) return { ok: false, error: 'expired' }
  if (c.email_verified !== true) return { ok: false, error: 'unverified' }
  const email = c.email.toLowerCase()
  // Both the hosted-domain claim and the address itself must belong to this company's Workspace.
  if (c.hd !== o.company.domain || !email.endsWith(`@${o.company.domain}`)) return { ok: false, error: 'domain' }
  return { ok: true, email, name: c.name || email.split('@')[0] || email, picture: c.picture }
}
