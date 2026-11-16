import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Encrypts Google refresh tokens before they reach the database (AES-256-GCM).
 * The key (TOKEN_ENCRYPTION_KEY, 32 random bytes in base64) lives only in Vercel.
 * The mailbox address is bound to each ciphertext, so a token copied onto another row will not decrypt.
 */
function key(): Buffer | null {
  const k = process.env.TOKEN_ENCRYPTION_KEY
  if (!k) return null
  const b = Buffer.from(k, 'base64')
  return b.length === 32 ? b : null
}

export const vaultReady = (): boolean => key() !== null

export function seal(plain: string, bind: string): string {
  const k = key()
  if (!k) throw new Error('encryption key is not configured')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  c.setAAD(Buffer.from(bind))
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

export function open(sealed: string, bind: string): string | null {
  const k = key()
  const [v, iv, tag, ct] = sealed.split('.')
  if (!k || v !== 'v1' || !iv || !tag || !ct) return null
  try {
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'))
    d.setAAD(Buffer.from(bind))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
