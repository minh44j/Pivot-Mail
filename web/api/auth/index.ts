import { GET as callback } from '../_lib/auth/callback.js'
import { GET as config } from '../_lib/auth/config.js'
import { GET as desktopGet, POST as desktopPost } from '../_lib/auth/desktop.js'
import { POST as logout } from '../_lib/auth/logout.js'
import { GET as session, PATCH as sessionPatch } from '../_lib/auth/session.js'
import { GET as start } from '../_lib/auth/start.js'
import { json } from '../_lib/http.js'

/**
 * Every sign-in address in ONE server function (the free Vercel plan allows 12 functions; these were 5).
 * vercel.json rewrites /api/auth/<route> to this function; the public addresses are unchanged, including the
 * Google redirect address /api/auth/google/callback registered in the Google Cloud projects.
 */
function route(req: Request): string {
  const u = new URL(req.url)
  const fromPath = u.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/+$/, '')
  return fromPath || u.searchParams.get('__route') || ''
}

const notFound = () => json({ error: 'not_found' }, 404)
const notAllowed = () => json({ error: 'method_not_allowed' }, 405)

export async function GET(req: Request): Promise<Response> {
  switch (route(req)) {
    case 'start':
      return start(req)
    case 'google/callback':
      return callback(req)
    case 'session':
      return session(req)
    case 'config':
      return config(req)
    case 'desktop':
      return desktopGet()
    case 'logout':
      return notAllowed()
    default:
      return notFound()
  }
}

export async function POST(req: Request): Promise<Response> {
  const r = route(req)
  if (r === 'logout') return logout(req)
  if (r === 'desktop') return desktopPost(req)
  return r ? notAllowed() : notFound()
}

export async function PATCH(req: Request): Promise<Response> {
  return route(req) === 'session' ? sessionPatch(req) : route(req) ? notAllowed() : notFound()
}
