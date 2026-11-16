import { hostOf, json } from '../_lib/http.js'
import { currentUser } from '../_lib/session.js'

/** Who is signed in. The role and the disabled flag are re-read on every call, so changes take effect at once. */
export async function GET(req: Request): Promise<Response> {
  if (!hostOf(req)) return json({ user: null }, 401)
  try {
    const me = await currentUser(req)
    if (!me) return json({ user: null }, 401)
    return json({ user: { email: me.email, name: me.name, company: me.company, role: me.role } })
  } catch {
    return json({ user: null, error: 'unavailable' }, 503)
  }
}
