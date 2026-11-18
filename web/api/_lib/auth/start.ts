import { COMPANIES, clientFor, companyForHost, protocolFor, sessionSecret } from '../config.js'
import type { CompanyId } from '../config.js'
import { setCookie } from '../cookies.js'
import { randomToken, sha256b64url, signToken } from '../crypto.js'
import { authUrl } from '../google.js'
import { OAUTH_COOKIE, hostOf, originOf, redirect, safeNext } from '../http.js'

/** Step 1 of sign-in: remember a one-time state, then send the person to Google. */
export function GET(req: Request): Response {
  const host = hostOf(req)
  const secret = sessionSecret()
  if (!host || !secret) return redirect('/?auth_error=config')

  const url = new URL(req.url)
  const asked = url.searchParams.get('company')
  const company = companyForHost(host) ?? (asked === 'scl' || asked === 'tmc' ? COMPANIES[asked as CompanyId] : null)
  if (!company) return redirect('/?auth_error=company')
  const client = clientFor(company.id)
  if (!client) return redirect('/?auth_error=config')

  const state = randomToken(16)
  const nonce = randomToken(16)
  const verifier = randomToken(32)
  // Desktop app: it sends the hash of a secret only it knows; the finished sign-in is handed back to it (see desktop.ts).
  const desk = url.searchParams.get('desktop')
  const desktop = desk && /^[A-Za-z0-9_-]{43}$/.test(desk) ? desk : undefined
  const cookie = signToken({ typ: 'oauth', state, nonce, verifier, company: company.id, next: safeNext(url.searchParams.get('next')), ...(desktop ? { desktop } : {}) }, secret, 600)

  const location = authUrl({
    clientId: client.clientId,
    redirectUri: `${originOf(host)}/api/auth/google/callback`,
    state,
    nonce,
    challenge: sha256b64url(verifier),
    company,
  })
  return redirect(location, [setCookie(OAUTH_COOKIE, cookie, { path: '/api/auth', maxAge: 600, secure: protocolFor(host) === 'https' })])
}
