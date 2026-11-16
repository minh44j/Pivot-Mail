import { isAllowedHost, protocolFor } from './config.js'

export const SESSION_COOKIE = '__Host-pm_session'
export const OAUTH_COOKIE = 'pm_oauth'
/** 7 days. Shorter is safer, longer is friendlier. Revisit with the security review. */
export const SESSION_SECONDS = 7 * 24 * 3600

export function hostOf(req: Request): string | null {
  const h = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host).split(',')[0]?.trim().toLowerCase() ?? ''
  return isAllowedHost(h) ? h : null
}

export const originOf = (host: string): string => `${protocolFor(host)}://${host}`

export function json(body: unknown, status = 200, headers: Record<string, string | string[]> = {}): Response {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  for (const [k, v] of Object.entries(headers)) for (const x of Array.isArray(v) ? v : [v]) h.append(k, x)
  return new Response(JSON.stringify(body), { status, headers: h })
}

export function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ location, 'cache-control': 'no-store' })
  for (const c of cookies) h.append('set-cookie', c)
  return new Response(null, { status: 302, headers: h })
}

/** Only same-site paths, never an address on another site. */
export function safeNext(next: string | null): string {
  return next && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) ? next : '/'
}
