import { update, eq } from '../db.js'
import { hostOf, json, originOf } from '../http.js'
import { currentUser } from '../session.js'

/** Who is signed in. The role and the disabled flag are re-read on every call, so changes take effect at once. */
export async function GET(req: Request): Promise<Response> {
  if (!hostOf(req)) return json({ user: null }, 401)
  try {
    const me = await currentUser(req)
    if (!me) return json({ user: null }, 401)
    return json({ user: { email: me.email, name: me.name, company: me.company, role: me.role, title: me.title } })
  } catch {
    return json({ user: null, error: 'unavailable' }, 503)
  }
}

/** Plain text, one line, at most 60 characters. */
const cleanTitle = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = [...v].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join('').replace(/\s+/g, ' ').trim()
  return t.length <= 60 ? t : null
}

/** A person sets their own job title (display only; roles are never changed here). */
export async function PATCH(req: Request): Promise<Response> {
  const host = hostOf(req)
  if (!host) return json({ error: 'unauthorized' }, 401)
  if (req.headers.get('origin') !== originOf(host)) return json({ error: 'forbidden' }, 403)
  try {
    const me = await currentUser(req)
    if (!me) return json({ error: 'unauthorized' }, 401)
    if (!me.id) return json({ error: 'unavailable' }, 503)
    const body = (await req.json().catch(() => null)) as { title?: unknown } | null
    const title = cleanTitle(body?.title)
    if (title === null) return json({ error: 'invalid' }, 400)
    await update('app_users', `id=${eq(me.id)}`, { title })
    return json({ title })
  } catch {
    return json({ error: 'unavailable' }, 503)
  }
}
