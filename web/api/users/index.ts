import { adminEmails } from '../_lib/config.js'
import { dbConfigured, eq, insert, select, update } from '../_lib/db.js'
import { hostOf, json, originOf } from '../_lib/http.js'
import { roleFor } from '../_lib/users.js'
import { currentUser } from '../_lib/session.js'
import type { Me } from '../_lib/session.js'

/**
 * People who have signed in, for administrators only.
 *   GET    the list (both companies) with role, status, last seen and the mailboxes each person can open
 *   PATCH  { id, role?: 'admin' | 'staff', status?: 'active' | 'disabled' }
 *
 * Rules the server keeps whatever the screen does:
 *  - only an administrator may call either (checked against the database on every call);
 *  - nobody changes their own role or status (ask another administrator);
 *  - the last active administrator can be neither demoted nor disabled;
 *  - an address in ADMIN_EMAILS stays an administrator (that list is the safety net, set in Vercel);
 *  - a disabled person is refused at once: every request re-reads their status (see currentUser).
 */
interface Row {
  id: string
  email: string
  name: string
  company: 'scl' | 'tmc'
  role: 'admin' | 'staff'
  status: 'invited' | 'active' | 'disabled'
  last_seen_at: string | null
  created_at: string
}
interface Access {
  user_id: string
  mail_accounts: { email: string; kind: 'personal' | 'shared' } | null
}

const err = (code: string, status: number) => json({ error: code }, status)

async function guard(req: Request, needOrigin: boolean): Promise<{ me: Me } | Response> {
  const host = hostOf(req)
  if (!host || !dbConfigured()) return err('config', 503)
  if (needOrigin && req.headers.get('origin') !== originOf(host)) return err('forbidden', 403)
  try {
    const me = await currentUser(req)
    if (!me || !me.id) return err('session', 401)
    return me.role === 'admin' ? { me } : err('forbidden', 403)
  } catch {
    return err('unavailable', 503)
  }
}

const locked = (email: string): boolean => adminEmails().has(email.toLowerCase())

export async function GET(req: Request): Promise<Response> {
  const g = await guard(req, false)
  if (g instanceof Response) return g
  try {
    const rows = await select<Row>('app_users', 'select=id,email,name,company,role,status,last_seen_at,created_at&order=created_at.asc&limit=500')
    const access = await select<Access>('mailbox_access', 'select=user_id,mail_accounts(email,kind)&limit=5000')
    const boxes = new Map<string, { email: string; kind: string }[]>()
    for (const a of access) {
      if (!a.mail_accounts) continue
      const list = boxes.get(a.user_id) ?? []
      list.push(a.mail_accounts)
      boxes.set(a.user_id, list)
    }
    return json({
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        company: r.company,
        role: roleFor(r.email, r.role),
        roleLocked: locked(r.email),
        status: r.status,
        lastSeenAt: r.last_seen_at,
        createdAt: r.created_at,
        mailboxes: boxes.get(r.id) ?? [],
      })),
      you: g.me.id,
    })
  } catch {
    return err('unavailable', 503)
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const g = await guard(req, true)
  if (g instanceof Response) return g
  const me = g.me
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof b.id === 'string' ? b.id : ''
  const role = b.role === 'admin' || b.role === 'staff' ? b.role : undefined
  const status = b.status === 'active' || b.status === 'disabled' ? b.status : undefined
  if (!/^[0-9a-f-]{36}$/i.test(id) || (role === undefined && status === undefined) || (b.role !== undefined && role === undefined) || (b.status !== undefined && status === undefined)) return err('invalid', 400)
  if (id === me.id) return err('self', 409)

  try {
    const [target] = await select<Row>('app_users', `id=${eq(id)}&select=id,email,name,company,role,status,last_seen_at,created_at`)
    if (!target) return err('not_found', 404)
    const nowRole = roleFor(target.email, target.role)
    const patch: Record<string, unknown> = {}

    if (role !== undefined && role !== nowRole) {
      if (role === 'staff' && locked(target.email)) return err('locked', 409)
      patch.role = role
    }
    if (status !== undefined && status !== target.status) patch.status = status

    const demoting = patch.role === 'staff'
    const disabling = patch.status === 'disabled'
    if ((demoting || disabling) && nowRole === 'admin' && target.status === 'active') {
      const everyone = await select<Row>('app_users', 'select=id,email,role,status&limit=500')
      const otherAdmins = everyone.filter((u) => u.id !== target.id && u.status === 'active' && roleFor(u.email, u.role) === 'admin')
      if (otherAdmins.length === 0) return err('last_admin', 409)
    }

    if (Object.keys(patch).length > 0) {
      await update('app_users', `id=${eq(id)}`, patch)
      await insert('audit_log', { actor_email: me.email, action: patch.role !== undefined ? 'user.role' : 'user.status', detail: { target: target.email, ...patch } })
    }
    return json({ ok: true })
  } catch {
    return err('unavailable', 503)
  }
}
