/**
 * Server-side configuration for sign-in. Secrets come from Vercel environment variables only.
 *
 *   GOOGLE_CLIENT_ID_SCL / GOOGLE_CLIENT_SECRET_SCL   pivotscl.com Workspace
 *   GOOGLE_CLIENT_ID_TMC / GOOGLE_CLIENT_SECRET_TMC   pivottmc.com Workspace
 *   SESSION_SECRET                                    signs the session cookie (32+ random characters)
 *   ADMIN_EMAILS                                      comma-separated administrator addresses (until roles move to the database)
 */
export type CompanyId = 'scl' | 'tmc'

export interface Company {
  id: CompanyId
  name: string
  domain: string
  /** The address this company's staff open */
  host: string
}

export const COMPANIES: Record<CompanyId, Company> = {
  scl: { id: 'scl', name: 'Pivot Shipping', domain: 'pivotscl.com', host: 'mail.pivotscl.com' },
  tmc: { id: 'tmc', name: 'Pivot Travel Management', domain: 'pivottmc.com', host: 'mail.pivottmc.com' },
}

/** Only these addresses may use the sign-in endpoints (guards against forged Host headers). */
const FALLBACK_HOSTS = ['pivot-mail-web.vercel.app']

export function isAllowedHost(host: string): boolean {
  if (Object.values(COMPANIES).some((c) => c.host === host)) return true
  if (FALLBACK_HOSTS.includes(host)) return true
  return /^localhost:\d+$/.test(host) && process.env.VERCEL_ENV !== 'production'
}

export function companyForHost(host: string): Company | null {
  return Object.values(COMPANIES).find((c) => c.host === host) ?? null
}

export function protocolFor(host: string): 'https' | 'http' {
  return host.startsWith('localhost:') ? 'http' : 'https'
}

export function clientFor(id: CompanyId): { clientId: string; clientSecret: string } | null {
  const suffix = id.toUpperCase()
  const clientId = process.env[`GOOGLE_CLIENT_ID_${suffix}`]
  const clientSecret = process.env[`GOOGLE_CLIENT_SECRET_${suffix}`]
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET
  return s && s.length >= 32 ? s : null
}

export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isConfigured(): boolean {
  return sessionSecret() !== null && (clientFor('scl') !== null || clientFor('tmc') !== null)
}
