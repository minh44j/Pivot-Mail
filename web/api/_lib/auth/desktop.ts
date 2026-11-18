import { protocolFor, sessionSecret } from '../config.js'
import { setCookie } from '../cookies.js'
import { sha256b64url, signToken, verifyToken } from '../crypto.js'
import { SESSION_COOKIE, SESSION_SECONDS, hostOf, json, redirect } from '../http.js'
import { signInUser } from '../users.js'

interface Ticket extends Record<string, unknown> {
  typ?: string
  email: string
  name: string
  company: 'scl' | 'tmc'
  role: 'admin' | 'staff'
  ch: string
}

/**
 * Last step of the desktop app's sign-in. The app posts the two-minute ticket it received from the browser together with its own
 * secret (form fields t and v). Only if the secret matches the hash the sign-in started with does the app's window get a session.
 * POST (not GET) so neither value ends up in any address bar, history or server log.
 */
export async function POST(req: Request): Promise<Response> {
  const host = hostOf(req)
  const secret = sessionSecret()
  if (!host || !secret) return json({ error: 'config' }, 503)
  const form = new URLSearchParams(await req.text().catch(() => ''))
  const t = verifyToken<Ticket>(form.get('t') ?? '', secret)
  const v = form.get('v') ?? ''
  if (!t || t.typ !== 'handoff' || typeof t.ch !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(v) || sha256b64url(v) !== t.ch) return redirect('/?auth_error=state')
  if (typeof t.email !== 'string' || (t.company !== 'scl' && t.company !== 'tmc')) return redirect('/?auth_error=state')
  let role = t.role === 'admin' ? 'admin' : 'staff'
  try {
    // Same checks as a browser sign-in: a person turned off in the meantime is refused.
    const r = await signInUser(t.email, t.company, t.name)
    if (!r.ok) return redirect(`/?auth_error=${r.reason}`)
    if (r.user) role = r.user.role
  } catch {
    return redirect('/?auth_error=unavailable')
  }
  const session = signToken({ typ: 'session', email: t.email, name: t.name, company: t.company, role }, secret, SESSION_SECONDS)
  return redirect('/', [setCookie(SESSION_COOKIE, session, { path: '/', maxAge: SESSION_SECONDS, secure: protocolFor(host) === 'https' })])
}

/** A GET here is never right (the app always posts); answering plainly avoids a confusing blank page. */
export function GET(): Response {
  return redirect('/?auth_error=state')
}
