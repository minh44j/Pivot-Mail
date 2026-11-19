import { COMPANIES, clientFor, protocolFor, sessionSecret } from '../config.js'
import type { CompanyId } from '../config.js'
import { clearCookie, parseCookies, setCookie } from '../cookies.js'
import { signToken, verifyToken } from '../crypto.js'
import { checkClaims, exchangeCode } from '../google.js'
import { finishConnect } from '../connect.js'
import { roleFor, signInUser } from '../users.js'
import { OAUTH_COOKIE, SESSION_COOKIE, SESSION_SECONDS, hostOf, originOf, redirect } from '../http.js'

interface OauthState extends Record<string, unknown> {
  typ?: string
  state: string
  nonce: string
  verifier: string
  company: CompanyId
  next: string
  /** 'connect' = adding a mailbox for an already signed-in person */
  purpose?: 'signin' | 'connect'
  kind?: 'personal' | 'shared'
  /** sha256 (base64url) of the desktop app's secret, when the sign-in was started by the desktop app */
  desktop?: string
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
  const saved = verifyToken<OauthState>(parseCookies(req.headers.get('cookie'))[OAUTH_COOKIE], secret)
  if (q.get('error')) {
    const why = q.get('error') === 'access_denied' ? 'cancelled' : 'google'
    // "Add account" from the desktop app: the browser shows its small result page (it may not be signed in here).
    if (saved?.typ === 'oauth' && saved.purpose === 'connect' && (saved as { as?: unknown }).as) return redirect(`/desktop-account.html#error=${why}`, [drop])
    return fail(why)
  }

  const code = q.get('code')
  if (!saved || saved.typ !== 'oauth' || !code || q.get('state') !== saved.state) return fail('state')

  const company = COMPANIES[saved.company]
  const client = clientFor(company.id)
  if (!company || !client) return fail('config')
  if (saved.purpose === 'connect') return finishConnect({ req, host, secure, code, saved, company, client, drop })

  // The address the person opened must be this company's address (or the shared fallback address).
  if (host === COMPANIES.scl.host && company.id !== 'scl') return fail('company')
  if (host === COMPANIES.tmc.host && company.id !== 'tmc') return fail('company')

  const claims = await exchangeCode({ code, verifier: saved.verifier, clientId: client.clientId, clientSecret: client.clientSecret, redirectUri: `${originOf(host)}/api/auth/google/callback` })
  const check = checkClaims(claims, { clientId: client.clientId, nonce: saved.nonce, company })
  if (!check.ok) return fail(check.error)

  let role = roleFor(check.email)
  try {
    const result = await signInUser(check.email, company.id, check.name)
    if (!result.ok) return fail(result.reason)
    if (result.user) role = result.user.role
  } catch {
    return fail('unavailable')
  }
  const session = signToken({ typ: 'session', email: check.email, name: check.name, company: company.id, role }, secret, SESSION_SECONDS)
  const browserSession = setCookie(SESSION_COOKIE, session, { path: '/', maxAge: SESSION_SECONDS, secure })
  if (saved.desktop) {
    // The browser is signed in too (so "Add account" can finish there later). The desktop app gets a two-minute ticket that only
    // works together with its own secret; the ticket travels in the address fragment, which browsers never send to any server.
    const ticket = signToken({ typ: 'handoff', email: check.email, name: check.name, company: company.id, role, ch: saved.desktop }, secret, 120)
    return redirect(`/desktop-signed-in.html#t=${encodeURIComponent(ticket)}`, [drop, browserSession])
  }
  return redirect(saved.next, [drop, browserSession])
}
