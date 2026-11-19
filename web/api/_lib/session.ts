import { sessionSecret } from './config.js'
import { parseCookies } from './cookies.js'
import { verifyToken } from './crypto.js'
import { dbConfigured, eq, select } from './db.js'
import { SESSION_COOKIE } from './http.js'
import { roleFor, signInUser } from './users.js'
import type { AppUser } from './users.js'

export interface Me {
  /** Database id; null only when no database is configured */
  id: string | null
  email: string
  name: string
  company: 'scl' | 'tmc'
  role: 'admin' | 'staff'
  title: string
}

interface Cookie extends Record<string, unknown> {
  typ?: string
  email: string
  name: string
  company: 'scl' | 'tmc'
  iat: number
}

/**
 * Only a real session cookie counts. The one-time sign-in cookie is signed with the same key, so its type is checked
 * (sessions issued before types existed have none, but always carry an email and never a sign-in state).
 */
function isSession(s: Cookie | null): s is Cookie {
  if (!s || typeof s.email !== 'string' || !s.email.includes('@') || (s.company !== 'scl' && s.company !== 'tmc') || typeof s.iat !== 'number') return false
  return s.typ === 'session' || (s.typ === undefined && s.state === undefined)
}

/**
 * The signed-in person, re-checked against the database on every call: a disabled user is refused at once,
 * and a role change takes effect without waiting for the cookie to expire.
 */
export async function currentUser(req: Request): Promise<Me | null> {
  const s = sessionOf(req)
  return s ? userOf(s) : null
}

/** What the session cookie says (who signed in, where, when), checked; null without a valid session. */
export function sessionOf(req: Request): SessionClaims | null {
  const secret = sessionSecret()
  if (!secret) return null
  const s = verifyToken<Cookie>(parseCookies(req.headers.get('cookie'))[SESSION_COOKIE], secret)
  return isSession(s) ? { email: s.email, name: s.name, company: s.company, iat: s.iat } : null
}

export interface SessionClaims {
  email: string
  name: string
  company: 'scl' | 'tmc'
  /** when that sign-in happened (seconds): "sign out of all devices" refuses everything issued before it */
  iat: number
}

/**
 * The person behind a sign-in, re-checked against the database (disabled, signed out everywhere, role changes). Used for the
 * session cookie, and for the desktop app's "Add account" pass, which carries the app's own sign-in (see accounts/connect).
 */
export async function userOf(s: SessionClaims): Promise<Me | null> {
  if (!s || typeof s.email !== 'string' || !s.email.includes('@') || (s.company !== 'scl' && s.company !== 'tmc') || typeof s.iat !== 'number') return null
  if (!dbConfigured()) return { id: null, email: s.email, name: s.name, company: s.company, role: roleFor(s.email), title: '' }
  const row = (await select<AppUser>('app_users', `email=${eq(s.email)}&select=*`))[0]
  // "Sign out of all devices" (or access turned off): sessions issued before that moment no longer count.
  if (row?.sessions_valid_after && s.iat * 1000 < Math.floor(Date.parse(row.sessions_valid_after) / 1000) * 1000) return null
  if (row) return row.status === 'disabled' ? null : { id: row.id, email: row.email, name: row.name || s.name, company: row.company, role: roleFor(row.email, row.role), title: row.title ?? '' }
  const made = await signInUser(s.email, s.company, s.name)
  return made.ok && made.user ? { id: made.user.id, email: made.user.email, name: made.user.name || s.name, company: made.user.company, role: roleFor(made.user.email, made.user.role), title: made.user.title ?? '' } : null
}
