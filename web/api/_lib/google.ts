import type { Company } from './config.js'

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'

export function authUrl(p: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string; company: Company }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    hd: p.company.domain, // only a hint for the account chooser; the server checks the result
    prompt: 'select_account',
  })
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
export async function exchangeCode(p: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<IdClaims | null> {
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
  const data = (await res.json()) as { id_token?: string }
  if (!data.id_token) return null
  const payload = data.id_token.split('.')[1]
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IdClaims
  } catch {
    return null
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
