import { logFail } from './http.js'
import { createHmac } from 'node:crypto'
import type { CompanyId } from './config.js'

/**
 * Link to Pivot OS. Reference numbers, client / port / salesperson lists and case facts come from
 * Pivot OS's own endpoints (/api/integrations/pivot-mail/*), so Pivot Mail never writes into its
 * database and never makes a number of its own.
 *
 *   PIVOT_OS_URL            address of Pivot OS, e.g. https://os.example.com (https only)
 *   PIVOT_OS_LINK_SECRET    the same value as Pivot OS's PIVOT_MAIL_LINK_SECRET (32+ random characters)
 *
 * Both unset: the link is off and Pivot Mail keeps issuing provisional numbers.
 * Every call is signed over the time, method, path and query, the person, the company and the body
 * (see docs/Pivot_Mail_link.md in Pivot OS); Pivot OS checks the person's own permissions.
 */
export interface OsConfig {
  url: string
  secret: string
}

export function osConfig(): OsConfig | null {
  const url = (process.env.PIVOT_OS_URL ?? '').trim().replace(/\/+$/, '')
  const secret = process.env.PIVOT_OS_LINK_SECRET ?? ''
  if (!url || secret.length < 32) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') return null
    return { url: u.origin, secret }
  } catch {
    return null
  }
}

export const osCompany = (c: CompanyId): 'PIVS' | 'PIVT' => (c === 'scl' ? 'PIVS' : 'PIVT')

export const signPayload = (p: { ts: string; method: string; pathAndQuery: string; actor: string; company: string; body: string }): string =>
  [p.ts, p.method.toUpperCase(), p.pathAndQuery, p.actor.trim().toLowerCase(), p.company.trim().toUpperCase(), p.body].join('\n')

export type OsResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string }

/** One signed call. Never throws: a network failure or timeout is an { ok: false } the caller can explain. */
export async function callOs<T>(
  company: CompanyId,
  actorEmail: string,
  method: 'GET' | 'POST',
  path: string,
  o: { query?: Record<string, string>; body?: unknown } = {},
): Promise<OsResult<T>> {
  const cfg = osConfig()
  if (!cfg) return { ok: false, status: 503, message: 'The Pivot OS link is not set up.' }
  const url = new URL(cfg.url + path)
  for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, v)
  const body = method === 'GET' ? '' : JSON.stringify(o.body ?? {})
  const ts = String(Date.now())
  const comp = osCompany(company)
  const signature = createHmac('sha256', cfg.secret).update(signPayload({ ts, method, pathAndQuery: url.pathname + url.search, actor: actorEmail, company: comp, body })).digest('hex')
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-pm-timestamp': ts, 'x-pm-actor': actorEmail.toLowerCase(), 'x-pm-company': comp, 'x-pm-signature': signature },
      body: method === 'GET' ? undefined : body,
      signal: AbortSignal.timeout(9000),
      // Never follow a redirect: Pivot OS redirects a request its sign-in gate does not let through to /login, and following
      // it hands back the sign-in page with status 200, which used to read as a successful, empty answer (2026-11-22: the
      // signature route was missing from Pivot OS's machine-route list and every mailbox silently got "no signatures").
      redirect: 'manual',
    })
    const parsed: unknown = await res.json().catch(() => undefined)
    const data = (parsed && typeof parsed === 'object' ? parsed : {}) as T & { error?: string }
    if (!res.ok) {
      console.error(`[pivot-mail] Pivot OS ${method} ${url.pathname} answered ${res.status}`)
      return { ok: false, status: res.status, message: typeof data.error === 'string' ? data.error : 'Pivot OS did not accept the request.' }
    }
    // A success must carry JSON data; anything else (a web page) is a wrong answer, not an empty one.
    if (!parsed || typeof parsed !== 'object') {
      console.error(`[pivot-mail] Pivot OS ${method} ${url.pathname} answered ${res.status} without JSON`)
      return { ok: false, status: 502, message: 'Pivot OS sent an unexpected answer.' }
    }
    return { ok: true, data }
  } catch (e) {
    logFail(`Pivot OS ${method} ${url.pathname}`, e)
    return { ok: false, status: 502, message: 'Pivot OS could not be reached.' }
  }
}
