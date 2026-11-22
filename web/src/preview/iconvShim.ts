/**
 * Stand-in for iconv-lite in the browser. The Outlook .msg reader (@kenjiuno/msgreader) needs only `decode`, for text stored
 * in an old Windows code page (cp1252 Western, cp1256 Arabic, ...). The real package reaches for Node's `stream`, which a
 * browser does not have, and the reader failed with "Cannot read properties of undefined (reading 'prototype')". The browser's
 * own TextDecoder knows these code pages.
 */
const ALIAS: Record<string, string> = {
  utf8: 'utf-8',
  utf16le: 'utf-16le',
  ucs2: 'utf-16le',
  'ucs-2': 'utf-16le',
  utf16be: 'utf-16be',
  cp932: 'shift_jis',
  cp936: 'gbk',
  cp949: 'euc-kr',
  cp950: 'big5',
  cp20127: 'us-ascii',
  cp28591: 'iso-8859-1',
  cp65001: 'utf-8',
}

function label(encoding: string): string {
  const e = encoding.toLowerCase().replace(/_/g, '-')
  if (ALIAS[e.replace(/-/g, '')]) return ALIAS[e.replace(/-/g, '')] as string
  const cp = /^(?:cp|windows-?)(\d+)$/.exec(e)
  if (cp) return `windows-${cp[1]}`
  return e
}

function decoderFor(encoding: string): TextDecoder {
  try {
    return new TextDecoder(label(encoding))
  } catch {
    return new TextDecoder('utf-8')
  }
}

export function decode(bytes: ArrayLike<number> | ArrayBuffer, encoding: string): string {
  const u8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes as ArrayLike<number>)
  return decoderFor(encoding).decode(u8)
}

export function encodingExists(encoding: string): boolean {
  try {
    new TextDecoder(label(encoding))
    return true
  } catch {
    return false
  }
}

export function encode(): never {
  throw new Error('Writing .msg files is not supported here')
}

export default { decode, encode, encodingExists }
