import { COMPANIES, clientFor, protocolFor, sessionSecret } from '../_lib/config.js'
import { setCookie } from '../_lib/cookies.js'
import { randomToken, sha256b64url, signToken, verifyToken } from '../_lib/crypto.js'
import { dbConfigured } from '../_lib/db.js'
import { authUrl } from '../_lib/google.js'
import { OAUTH_COOKIE, hostOf, json, originOf, redirect, logFail } from '../_lib/http.js'
import { currentUser, sessionOf, userOf } from '../_lib/session.js'
import type { SessionClaims } from '../_lib/session.js'
import { vaultReady } from '../_lib/vault.js'

/**
 * Starts "Add account": asks Google for permission to read and manage one mailbox.
 * Any signed-in person may connect a personal mailbox in either company, including a second account of their own in the other
 * Workspace: Google's sign-in proves they control it, and only they get access. Only administrators may connect a shared mailbox.
 * The Google project used is the one of the mailbox's Workspace, so both addresses must be registered in both projects.
 */
/**
 * The desktop app's "Add account" pass. The app is signed in inside its own window, but Google's permission page opens in the
 * person's normal browser, which may not be signed in to Pivot Mail (then "Add account" first asked to sign in, always for the
 * website's own company: choosing Pivot Travel Management showed a pivotscl.com Google page). The app asks for a pass with its
 * own sign-in; the pass is good for two minutes, for this one company and kind only, and carries that sign-in (so signing out
 * everywhere, or a disabled account, still refuses it).
 * Only the app itself can ask: a session cookie is needed (SameSite=Lax, so other sites' forms cannot send it) plus a custom
 * header (a cross-site script cannot add one without the server's consent).
 */
export async function POST(req: Request): Promise<Response> {
  const secret = sessionSecret()
  if (!hostOf(req) || !secret) return json({ error: 'config' }, 503)
  if (req.headers.get('x-pivot-desktop') !== '1') return json({ error: 'forbidden' }, 403)
  const s = sessionOf(req)
  let me
  try {
    me = s ? await userOf(s) : null
  } catch (e) {
    logFail('accounts/connect', e)
    return json({ error: 'unavailable' }, 503)
  }
  if (!s || !me) return json({ error: 'session' }, 401)
  let body: { company?: unknown; kind?: unknown } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    /* empty */
  }
  const company = body.company === 'scl' || body.company === 'tmc' ? body.company : null
  const kind = body.kind === 'shared' ? 'shared' : 'personal'
  if (!company) return json({ error: 'company' }, 400)
  if (kind === 'shared' && me.role !== 'admin') return json({ error: 'forbidden' }, 403)
  const t = signToken({ typ: 'connect-pass', company, kind, as: s }, secret, 120)
  return json({ url: `/api/accounts/connect?company=${company}&kind=${kind}&t=${encodeURIComponent(t)}` })
}

export async function GET(req: Request): Promise<Response> {
  const host = hostOf(req)
  const secret = sessionSecret()
  if (!host || !secret) return redirect('/?connect_error=config')
  if (!dbConfigured() || !vaultReady()) return redirect('/?connect_error=config')

  const q0 = new URL(req.url).searchParams
  // The desktop app's pass (see POST) stands for its sign-in, ahead of whoever this browser may be signed in as.
  const pass = verifyToken<{ typ?: string; company?: string; kind?: string; as?: SessionClaims }>(q0.get('t') ?? undefined, secret)
  const asked0 = q0.get('company')
  const passOk = !!pass && pass.typ === 'connect-pass' && pass.company === asked0 && pass.kind === (q0.get('kind') === 'shared' ? 'shared' : 'personal') && !!pass.as
  if (q0.get('t') && !passOk) return redirect('/desktop-account.html#error=expired')
  let me
  try {
    me = passOk ? await userOf(pass.as as SessionClaims) : await currentUser(req)
  } catch (e) {
    logFail('accounts/connect', e)
    return redirect('/?connect_error=unavailable')
  }
  if (passOk && !me) return redirect('/desktop-account.html#error=session')
  // Not signed in here (for example the desktop app opened this in the browser): sign in first, then come straight back.
  if (!me) {
    const u = new URL(req.url)
    return redirect(`/api/auth/start?next=${encodeURIComponent(u.pathname + u.search)}`)
  }

  const q = new URL(req.url).searchParams
  const asked = q.get('company')
  const company = asked === 'scl' || asked === 'tmc' ? COMPANIES[asked] : null
  const client = company ? clientFor(company.id) : null
  if (!company || !client) return redirect('/?connect_error=company')
  const kind = q.get('kind') === 'shared' ? 'shared' : 'personal'
  if (kind === 'shared' && me.role !== 'admin') return redirect('/?connect_error=forbidden')

  const state = randomToken(16)
  const nonce = randomToken(16)
  const verifier = randomToken(32)
  // With a pass, the person travels in the one-time cookie too: the browser itself may have no session when Google returns.
  const cookie = signToken({ typ: 'oauth', state, nonce, verifier, company: company.id, next: '/', purpose: 'connect', kind, ...(passOk ? { as: pass.as } : {}) }, secret, 600)
  const location = authUrl({
    clientId: client.clientId,
    redirectUri: `${originOf(host)}/api/auth/google/callback`,
    state,
    nonce,
    challenge: sha256b64url(verifier),
    company,
    // Suggest the person's own address only when it belongs to the Workspace being connected (a second account is a different address).
    mailbox: { loginHint: kind === 'personal' && me.email.endsWith(`@${company.domain}`) ? me.email : undefined },
  })
  return redirect(location, [setCookie(OAUTH_COOKIE, cookie, { path: '/api/auth', maxAge: 600, secure: protocolFor(host) === 'https' })])
}
