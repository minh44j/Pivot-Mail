export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

interface CookieOptions {
  maxAge?: number
  path?: string
  /** false only for http://localhost development */
  secure?: boolean
}

export function setCookie(name: string, value: string, o: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`, 'HttpOnly', 'SameSite=Lax']
  if (o.secure !== false) parts.push('Secure')
  if (o.maxAge !== undefined) parts.push(`Max-Age=${o.maxAge}`)
  return parts.join('; ')
}

export const clearCookie = (name: string, o: CookieOptions = {}): string => setCookie(name, '', { ...o, maxAge: 0 })
