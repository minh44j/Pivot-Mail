/**
 * Garbled characters such as "youâ€™re" (Minhaj, 2026-11-23: "Why there's unwanted characters?").
 *
 * The apostrophe ’ is three bytes in UTF-8 (E2 80 99). Read with the old Western Windows table (cp1252) they show as the
 * three characters â € ™. It happens when text passes through something that guessed the wrong table: a document or web
 * page copied from, or a mail whose sender labelled UTF-8 text as Western. Two defences:
 * - reading: a mail labelled Western whose bytes are in fact valid UTF-8 is read as UTF-8 (mime.ts, utf8Instead);
 * - writing: text pasted or about to be sent is repaired here, so a client never receives "â€™". The person is told.
 */

/** cp1252 bytes 0x80–0x9F as Unicode (the rest of 0xA0–0xFF are the same numbers in Unicode). */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}
const byteOf = (ch: string): number | null => {
  const c = ch.codePointAt(0) ?? 0
  if (c >= 0x80 && c <= 0xff) return c // includes the five bytes cp1252 leaves undefined (0x81, 0x8d, 0x8f, 0x90, 0x9d)
  return CP1252[c] ?? null
}
const CONT = '\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™'
/** A lead byte (Â–ô) followed by the continuation bytes a UTF-8 character of that length needs, as cp1252 shows them. */
const RUN = new RegExp(`[\\u00c2-\\u00df][${CONT}]|[\\u00e0-\\u00ef][${CONT}]{2}|[\\u00f0-\\u00f4][${CONT}]{3}`, 'g')
const strict = new TextDecoder('utf-8', { fatal: true })

/** Repairs garbled characters in text. `fixed` counts the repairs (0: nothing changed). */
export function fixMojibake(text: string): { text: string; fixed: number } {
  let fixed = 0
  const out = text.replace(RUN, (run) => {
    const bytes: number[] = []
    for (const ch of run) {
      const b = byteOf(ch)
      if (b === null) return run
      bytes.push(b)
    }
    try {
      const s = strict.decode(new Uint8Array(bytes))
      // Exactly one real character, and not a control one: otherwise it was ordinary text that only looked like a run.
      if ([...s].length !== 1 || (s.codePointAt(0) ?? 0) < 0xa0) return run
      fixed++
      return s
    } catch {
      return run
    }
  })
  return { text: out, fixed }
}

/** The same repair over HTML: the text between tags only, never a tag or an attribute value. */
export function fixMojibakeHtml(html: string): { html: string; fixed: number } {
  let fixed = 0
  const parts = html.split(/(<[^>]*>)/)
  for (let i = 0; i < parts.length; i += 2) {
    const r = fixMojibake(parts[i] ?? '')
    if (r.fixed > 0) {
      parts[i] = r.text
      fixed += r.fixed
    }
  }
  return { html: fixed > 0 ? parts.join('') : html, fixed }
}

/** Bytes that are valid UTF-8 and contain at least one multi-byte character: Western labelling would garble them. */
export function looksUtf8(bytes: Uint8Array): boolean {
  let multi = false
  for (const b of bytes) if (b >= 0x80) {
    multi = true
    break
  }
  if (!multi) return false
  try {
    strict.decode(bytes)
    return true
  } catch {
    return false
  }
}
