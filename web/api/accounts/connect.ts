import { COMPANIES, clientFor, protocolFor, sessionSecret } from '../_lib/config.js'
import { setCookie } from '../_lib/cookies.js'
import { randomToken, sha256b64url, signToken } from '../_lib/crypto.js'
import { dbConfigured } from '../_lib/db.js'
import { authUrl } from '../_lib/google.js'
import { OAUTH_COOKIE, hostOf, originOf, redirect } from '../_lib/http.js'
import { currentUser } from '../_lib/session.js'
import { vaultReady } from '../_lib/vault.js'

/**
 * Starts "Add account": asks Google for permission to read and manage one mailbox.
 * Any signed-in person may connect a personal mailbox in either company, including a second account of their own in the other
 * Workspace: Google's sign-in proves they control it, and only they get access. Only administrators may connect a shared mailbox.
 * The Google project used is the one of the mailbox's Workspace, so both addresses must be registered in both projects.
 */
export async function GET(req: Request): Promise<Response> {
  const host = hostOf(req)
  const secret = sessionSecret()
  if (!host || !secret) return redirect('/?connect_error=config')
  if (!dbConfigured() || !vaultReady()) return redirect('/?connect_error=config')

  let me
  try {
    me = await currentUser(req)
  } catch {
    return redirect('/?connect_error=unavailable')
  }
  if (!me) return redirect('/?connect_error=session')

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
  const cookie = signToken({ state, nonce, verifier, company: company.id, next: '/', purpose: 'connect', kind }, secret, 600)
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
