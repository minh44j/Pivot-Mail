import { COMPANIES, adminEmails, clientFor, protocolFor, sessionSecret } from '../../_lib/config.js'
import type { CompanyId } from '../../_lib/config.js'
import { clearCookie, parseCookies, setCookie } from '../../_lib/cookies.js'
import { signToken, verifyToken } from '../../_lib/crypto.js'
import { checkClaims, exchangeCode } from '../../_lib/google.js'
import { OAUTH_COOKIE, SESSION_COOKIE, SESSION_SECONDS, hostOf, originOf, redirect } from '../../_lib/http.js'

interface OauthState extends Record<string, unknown> {
  state: string
  nonce: string
  verifier: string
  company: CompanyId
  next: string
}

/** Step 2: Google sends the person back here with a one-time code. Nothing is trusted until every check passes. */
export async function GET(req: Request): Promise<Response> {
  const host = hostOf(req)
  const secret = sessionSecret()
  if (!host || !secret) return redirect('/?auth_error=config')
  const secure = protocolFor(host) === 'https'
  const drop = clearCookie(OAUTH_COOKIE, { path: '/api/auth', secure })
  const fail = (code: string) => redirect(`/?auth_error=${code}`, [drop])

  const q = new URL(req.url).searchParams
  if (q.get('error')) return fail(q.get('error') === 'access_denied' ? 'cancelled' : 'google')

  const saved = verifyToken<OauthState>(parseCookies(req.headers.get('cookie'))[OAUTH_COOKIE], secret)
  const code = q.get('code')
  if (!saved || !code || q.get('state') !== saved.state) return fail('state')

  const company = COMPANIES[saved.company]
  const client = clientFor(company.id)
  if (!company || !client) return fail('config')
  // The address the person opened must be this company's address (or the shared fallback address).
  if (host === COMPANIES.scl.host && company.id !== 'scl') return fail('company')
  if (host === COMPANIES.tmc.host && company.id !== 'tmc') return fail('company')

  const claims = await exchangeCode({ code, verifier: saved.verifier, clientId: client.clientId, clientSecret: client.clientSecret, redirectUri: `${originOf(host)}/api/auth/google/callback` })
  const check = checkClaims(claims, { clientId: client.clientId, nonce: saved.nonce, company })
  if (!check.ok) return fail(check.error)

  const role = adminEmails().has(check.email) ? 'admin' : 'staff'
  const session = signToken({ email: check.email, name: check.name, company: company.id, role }, secret, SESSION_SECONDS)
  return redirect(saved.next, [drop, setCookie(SESSION_COOKIE, session, { path: '/', maxAge: SESSION_SECONDS, secure })])
}
