import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const b64url = (buf: Buffer | string): string => Buffer.from(buf).toString('base64url')
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url')
export const sha256b64url = (s: string): string => createHash('sha256').update(s).digest('base64url')

const mac = (data: string, secret: string): string => createHmac('sha256', secret).update(data).digest('base64url')

/** A compact signed token: base64url(JSON).signature. Not encrypted, so never put secrets inside. */
export function signToken(payload: Record<string, unknown>, secret: string, ttlSeconds: number, now = Date.now()): string {
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttlSeconds }))
  return `${body}.${mac(body, secret)}`
}

export function verifyToken<T extends Record<string, unknown>>(token: string | undefined, secret: string, now = Date.now()): T | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const sig = Buffer.from(token.slice(dot + 1))
  const good = Buffer.from(mac(body, secret))
  if (sig.length !== good.length || !timingSafeEqual(sig, good)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number }
    if (typeof p.exp !== 'number' || p.exp * 1000 < now) return null
    return p
  } catch {
    return null
  }
}
