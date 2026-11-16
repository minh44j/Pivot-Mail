import { adminEmails } from './config.js'
import type { CompanyId } from './config.js'
import { dbConfigured, eq, insert, select, update } from './db.js'

export interface AppUser {
  id: string
  email: string
  name: string
  company: CompanyId
  role: 'admin' | 'staff'
  status: 'invited' | 'active' | 'disabled'
}

/** Administrator if the database says so, or the address is in ADMIN_EMAILS (the bootstrap list). */
export const roleFor = (email: string, dbRole?: string): 'admin' | 'staff' => (dbRole === 'admin' || adminEmails().has(email.toLowerCase()) ? 'admin' : 'staff')

export type SignInResult = { ok: true; user: AppUser | null } | { ok: false; reason: 'disabled' | 'invite' }

/**
 * Called after Google confirmed the person. First sign-in creates the user record (set REQUIRE_INVITE=true to refuse people
 * an administrator has not added). Disabled users are refused. Without a database it falls back to the environment list.
 */
export async function signInUser(email: string, company: CompanyId, name: string): Promise<SignInResult> {
  if (!dbConfigured()) return { ok: true, user: null }
  const rows = await select<AppUser>('app_users', `email=${eq(email)}&select=*`)
  const row = rows[0]
  const now = new Date().toISOString()
  if (row) {
    if (row.status === 'disabled') return { ok: false, reason: 'disabled' }
    const role = roleFor(email, row.role)
    const [saved] = await update<AppUser>('app_users', `id=${eq(row.id)}`, { status: 'active', last_seen_at: now, role, ...(row.name ? {} : { name }) })
    return { ok: true, user: saved ?? { ...row, role, status: 'active' } }
  }
  if (process.env.REQUIRE_INVITE === 'true') return { ok: false, reason: 'invite' }
  const [created] = await insert<AppUser>('app_users', { email, name, company, role: roleFor(email), status: 'active', last_seen_at: now })
  return { ok: true, user: created ?? null }
}
