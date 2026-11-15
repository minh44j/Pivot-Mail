/**
 * Minimal ZIP writer (stored, no compression) so "Download all" gives one file instead of
 * many separate downloads, which browsers often block.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = (CRC_TABLE[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipFile {
  name: string
  data: Uint8Array
}

/** Remove path characters and make names unique inside the archive. */
function uniqueNames(files: ZipFile[]): string[] {
  const seen = new Map<string, number>()
  return files.map((f) => {
    const clean = [...f.name.replace(/[\\/:*?"<>|]/g, '_')].filter((ch) => ch.charCodeAt(0) >= 32).join('') || 'file'
    const n = (seen.get(clean) ?? 0) + 1
    seen.set(clean, n)
    if (n === 1) return clean
    const dot = clean.lastIndexOf('.')
    return dot > 0 ? `${clean.slice(0, dot)} (${n})${clean.slice(dot)}` : `${clean} (${n})`
  })
}

export function makeZip(files: ZipFile[], now: Date = new Date()): Blob {
  const enc = new TextEncoder()
  const names = uniqueNames(files)
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const parts: BlobPart[] = []
  const central: Uint8Array[] = []
  let offset = 0

  files.forEach((f, i) => {
    const name = enc.encode(names[i] as string)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // stored
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(local.buffer, name, f.data as BlobPart)

    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, time, true)
    c.setUint16(14, date, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, f.data.length, true)
    c.setUint32(24, f.data.length, true)
    c.setUint16(28, name.length, true)
    c.setUint32(42, offset, true)
    const rec = new Uint8Array(46 + name.length)
    rec.set(new Uint8Array(c.buffer), 0)
    rec.set(name, 46)
    central.push(rec)
    offset += 30 + name.length + f.data.length
  })

  const cdSize = central.reduce((a, r) => a + r.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  parts.push(...(central as BlobPart[]), end.buffer)
  return new Blob(parts, { type: 'application/zip' })
}
