import type { Message } from '../types'
import { getAttachmentBytes } from './client'

type Img = NonNullable<Message['inline']>[string]

const cache = new Map<string, Promise<string | null>>()

const toDataUri = (mime: string, bytes: Uint8Array): string => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(bin)}`
}

/** Only the formats the reader allows are drawn (the sanitiser accepts png, jpeg, gif and webp). */
const SAFE = /^image\/(png|jpe?g|gif|webp)$/i

/** Turns an inline image into a data: address the safe viewer can show. Fetched once per image. */
export function inlineImageUri(img: Img): Promise<string | null> {
  if (!SAFE.test(img.mime)) return Promise.resolve(null)
  const key = img.source ? `${img.source.accountId}/${img.source.messageId}/${img.source.attachmentId}` : (img.data ?? '').slice(0, 64)
  let p = cache.get(key)
  if (!p) {
    p = (async () => {
      try {
        if (img.data) {
          const s = img.data.replace(/-/g, '+').replace(/_/g, '/')
          return `data:${img.mime};base64,${s}${'='.repeat((4 - (s.length % 4)) % 4)}`
        }
        if (!img.source) return null
        return toDataUri(img.mime, await getAttachmentBytes(img.source.accountId, img.source.messageId, img.source.attachmentId))
      } catch {
        cache.delete(key)
        return null
      }
    })()
    cache.set(key, p)
  }
  return p
}
