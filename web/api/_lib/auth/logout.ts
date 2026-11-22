import { protocolFor } from '../config.js'
import { clearCookie } from '../cookies.js'
import { dbConfigured, eq, insert, update } from '../db.js'
import { SESSION_COOKIE, hostOf, json, originOf, logFail } from '../http.js'
import { currentUser } from '../session.js'

/**
 * POST only, and only from the app's own address (blocks other sites from signing people out).
 * Body { everywhere: true }: also ends every other session of this person (other computers, phones, a copied cookie).
 */
export async function POST(req: Request): Promise<Response> {
  const host = hostOf(req)
  if (!host) return json({ ok: false }, 400)
  const origin = req.headers.get('origin')
  if (origin && origin !== originOf(host)) return json({ ok: false }, 403)
  const drop = { 'set-cookie': clearCookie(SESSION_COOKIE, { path: '/', secure: protocolFor(host) === 'https' }) }
  const body = (await req.json().catch(() => ({}))) as { everywhere?: unknown }
  if (body.everywhere === true) {
    // Ending other sessions changes data, so the origin must be present and ours (not only "not someone else's").
    if (origin !== originOf(host) || !dbConfigured()) return json({ ok: false }, 403)
    try {
      const me = await currentUser(req)
      if (!me || !me.id) return json({ ok: false, error: 'session' }, 401, drop)
      await update('app_users', `id=${eq(me.id)}`, { sessions_valid_after: new Date().toISOString() })
      await insert('audit_log', { actor_email: me.email, action: 'session.signout_all', detail: {} })
    } catch (e) {
      logFail('_lib/auth/logout', e)
      return json({ ok: false, error: 'unavailable' }, 503)
    }
  }
  return json({ ok: true }, 200, drop)
}
