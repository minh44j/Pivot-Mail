import { adminEmails, sessionSecret } from '../_lib/config.js'
import { parseCookies } from '../_lib/cookies.js'
import { verifyToken } from '../_lib/crypto.js'
import { SESSION_COOKIE, hostOf, json } from '../_lib/http.js'

interface Session extends Record<string, unknown> {
  email: string
  name: string
  company: string
}

/** Who is signed in. Role is re-read from the administrator list on every call, so removing an admin takes effect at once. */
export function GET(req: Request): Response {
  const secret = sessionSecret()
  if (!hostOf(req) || !secret) return json({ user: null }, 401)
  const s = verifyToken<Session>(parseCookies(req.headers.get('cookie'))[SESSION_COOKIE], secret)
  if (!s) return json({ user: null }, 401)
  return json({ user: { email: s.email, name: s.name, company: s.company, role: adminEmails().has(s.email) ? 'admin' : 'staff' } })
}
