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

/**
 * Writes a server failure to the Vercel log. Every route used to turn its errors into a quiet "unavailable" answer with
 * nothing logged, so the dashboard showed zero errors whatever happened (audit 2026-11-22). Only the error's kind and
 * message, shortened, with anything shaped like a key or token blanked; never request bodies or headers.
 */
export function logFail(where: string, e: unknown): void {
  const kind = e instanceof Error ? e.name : typeof e
  const msg = (e instanceof Error ? e.message : String(e))
    .replace(/(ya29\.|1\/\/|Bearer\s+|eyJ)[\w.\-/+=]+/g, '$1…')
    .replace(/[A-Za-z0-9_-]{40,}/g, '…')
    .slice(0, 300)
  console.error(`[pivot-mail] ${where} failed: ${kind}: ${msg}`)
}
