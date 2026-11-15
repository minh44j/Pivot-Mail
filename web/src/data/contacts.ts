/** SAMPLE contacts for recipient suggestions. The real list comes from Google Contacts and recent mail. */
export interface Contact {
  name: string
  email: string
  company?: string
}

export const CONTACTS: Contact[] = [
  { name: 'Hana Okafor', email: 'hana@acme-trading.example', company: 'Acme Trading' },
  { name: 'Liam Verhoeven', email: 'liam@bluewave-lines.example', company: 'Bluewave Lines' },
  { name: 'Sara Haddad', email: 'sara@gulfcargo.example', company: 'Gulf Cargo Services' },
  { name: 'Noor Rahman', email: 'noor@skyroutes.example', company: 'Skyroutes' },
  { name: 'Diego Marín', email: 'diego@customs-agent.example', company: 'Customs agent' },
  { name: 'Priya Nair', email: 'priya@horizon-corp.example', company: 'Horizon Corporate' },
  { name: 'Mei Tan', email: 'mei@sunrise-textiles.example', company: 'Sunrise Textiles' },
  { name: 'Omar Aziz', email: 'omar@vertex-machinery.example', company: 'Vertex Machinery' },
  { name: 'Elena Rossi', email: 'elena@orchid-foods.example', company: 'Orchid Foods' },
  { name: 'Accounts Team', email: 'accounts@vendor-finance.example', company: 'Vendor Finance' },
  { name: 'Operations Desk', email: 'ops@pivot.example', company: 'Pivot' },
  { name: 'Ticketing Desk', email: 'ticketing@pivot.example', company: 'Pivot' },
  { name: 'Accounts', email: 'accounts@pivot.example', company: 'Pivot' },
  { name: 'Sales', email: 'sales@pivot.example', company: 'Pivot' },
  { name: 'Your Name', email: 'you@pivot.example', company: 'Pivot' },
]

const norm = (s: string): string => s.toLowerCase()

/** Best matches first: name or email starts with the text, then contains it. Empty text returns the first few contacts as "recent". */
export function suggestContacts(text: string, exclude: string[], limit = 6): Contact[] {
  const taken = new Set(exclude.map(norm))
  const pool = CONTACTS.filter((c) => !taken.has(norm(c.email)))
  const q = norm(text.trim())
  if (!q) return pool.slice(0, limit)
  const score = (c: Contact): number => {
    const n = norm(c.name)
    const e = norm(c.email)
    const co = norm(c.company ?? '')
    if (n.startsWith(q) || e.startsWith(q)) return 0
    if (n.split(/\s+/).some((w) => w.startsWith(q))) return 1
    if (n.includes(q) || e.includes(q)) return 2
    if (co.includes(q)) return 3
    return -1
  }
  return pool
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .slice(0, limit)
    .map((x) => x.c)
}

export const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

/** "Name <a@b.c>" or "a@b.c" to the bare address. */
export function bareAddress(token: string): string {
  const m = token.match(/<([^>]+)>/)
  return (m?.[1] ?? token).trim()
}

export function displayName(address: string): string {
  return CONTACTS.find((c) => norm(c.email) === norm(address))?.name ?? address
}
