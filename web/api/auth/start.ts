import { COMPANIES, clientFor, companyForHost, protocolFor, sessionSecret } from '../_lib/config.js'
import type { CompanyId } from '../_lib/config.js'
import { setCookie } from '../_lib/cookies.js'
import { randomToken, sha256b64url, signToken } from '../_lib/crypto.js'
import { authUrl } from '../_lib/google.js'
import { OAUTH_COOKIE, hostOf, originOf, redirect, safeNext } from '../_lib/http.js'

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
  const cookie = signToken({ typ: 'oauth', state, nonce, verifier, company: company.id, next: safeNext(url.searchParams.get('next')) }, secret, 600)

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
