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
  email: string
  name: string
  company: 'scl' | 'tmc'
}

/**
 * The signed-in person, re-checked against the database on every call: a disabled user is refused at once,
 * and a role change takes effect without waiting for the cookie to expire.
 */
export async function currentUser(req: Request): Promise<Me | null> {
  const secret = sessionSecret()
  if (!secret) return null
  const s = verifyToken<Cookie>(parseCookies(req.headers.get('cookie'))[SESSION_COOKIE], secret)
  if (!s) return null
  if (!dbConfigured()) return { id: null, email: s.email, name: s.name, company: s.company, role: roleFor(s.email), title: '' }
  const row = (await select<AppUser>('app_users', `email=${eq(s.email)}&select=*`))[0]
  if (row) return row.status === 'disabled' ? null : { id: row.id, email: row.email, name: row.name || s.name, company: row.company, role: roleFor(row.email, row.role), title: row.title ?? '' }
  const made = await signInUser(s.email, s.company, s.name)
  return made.ok && made.user ? { id: made.user.id, email: made.user.email, name: made.user.name || s.name, company: made.user.company, role: roleFor(made.user.email, made.user.role), title: made.user.title ?? '' } : null
}
