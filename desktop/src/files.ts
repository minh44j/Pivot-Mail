/** Attachment file names handed to Windows when dragging attachments out of Pivot Mail. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

/** A file name from an email is untrusted: only the name itself (never a path), nothing Windows refuses or reserves. */
export function safeFileName(raw: string): string {
  let name = (raw.split(/[\\/]/).pop() ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 180)
  if (!name) name = 'attachment'
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`
  return name
}

/** "invoice.pdf", "invoice (2).pdf", ... so two attachments with the same name both arrive. */
export function uniqueName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let out = name
  for (let i = 2; used.has(out.toLowerCase()); i++) out = `${stem} (${i})${ext}`
  used.add(out.toLowerCase())
  return out
}
