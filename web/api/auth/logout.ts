import { protocolFor } from '../_lib/config.js'
import { clearCookie } from '../_lib/cookies.js'
import { SESSION_COOKIE, hostOf, json, originOf } from '../_lib/http.js'

/** POST only, and only from the app's own address (blocks other sites from signing people out). */
export function POST(req: Request): Response {
  const host = hostOf(req)
  if (!host) return json({ ok: false }, 400)
  const origin = req.headers.get('origin')
  if (origin && origin !== originOf(host)) return json({ ok: false }, 403)
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE, { path: '/', secure: protocolFor(host) === 'https' }) })
}
