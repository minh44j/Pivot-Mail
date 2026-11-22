/** SAMPLE contacts for the demo. Signed in, the list is the person's own (setContactPool): people from their mail, then their
 * company directory and Google contacts. */
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

// Signed in, suggestions come from the person's own contacts. Before 2026-11-22 they always came from the sample list above,
// so the To box offered made-up people and real colleagues never appeared.
let pool: Contact[] | null = null
/** The person's own contacts (null: the sample list, for the demo). */
export function setContactPool(list: Contact[] | null): void {
  pool = list
}
const poolNow = (): Contact[] => pool ?? CONTACTS
export const hasContactPool = (): boolean => pool !== null

/** Automatic senders nobody writes to. */
const ROBOT = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|alerts?|newsletter|news|marketing|calendar-notification)([+._-]|@)/i

interface MailLike {
  folder: string
  from: { name: string; email: string }
  to: { name: string; email: string }[]
  cc?: { name: string; email: string }[]
  date: string
}

/**
 * The people in the person's own mail, most used first: someone they wrote to counts more than someone who wrote to them, and
 * recent mail more than old mail. Their own addresses and automatic senders (no-reply, notifications) are left out.
 */
export function contactsFromMail(messages: readonly MailLike[], mine: readonly string[], now = Date.now()): Contact[] {
  const own = new Set(mine.map(norm))
  const seen = new Map<string, { name: string; email: string; score: number }>()
  const add = (p: { name: string; email: string } | undefined, weight: number, at: number) => {
    if (!p?.email) return
    const email = p.email.trim()
    const key = norm(email)
    if (own.has(key) || !EMAIL_RE.test(email) || ROBOT.test(email)) return
    const ageDays = Math.max(0, (now - at) / 86_400_000)
    const w = weight / (1 + ageDays / 30)
    const name = p.name && norm(p.name) !== key && !p.name.includes('@') ? p.name.trim() : ''
    const had = seen.get(key)
    if (had) {
      had.score += w
      if (!had.name && name) had.name = name
    } else seen.set(key, { name, email, score: w })
  }
  for (const m of messages) {
    const at = Date.parse(m.date) || now
    if (m.folder === 'sent') for (const p of [...m.to, ...(m.cc ?? [])]) add(p, 3, at)
    else {
      add(m.from, 1, at)
      for (const p of m.cc ?? []) add(p, 0.3, at)
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.score - a.score)
    .map((c) => ({ name: c.name || c.email.split('@')[0]!, email: c.email, company: c.email.split('@')[1] }))
}

/** One list without repeats: the first source wins (its order is kept). */
export function mergeContacts(...lists: readonly (readonly Contact[])[]): Contact[] {
  const seen = new Set<string>()
  const out: Contact[] = []
  for (const list of lists)
    for (const c of list) {
      const k = norm(c.email)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(c)
    }
  return out
}

/** Best matches first: name or email starts with the text, then contains it. Empty text returns the first few contacts as "recent". */
export function suggestContacts(text: string, exclude: string[], limit = 6): Contact[] {
  const taken = new Set(exclude.map(norm))
  const pool = poolNow().filter((c) => !taken.has(norm(c.email)))
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
  return poolNow().find((c) => norm(c.email) === norm(address))?.name ?? address
}
