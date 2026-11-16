import { STAFF } from './performance'

/** SAMPLE user directory (fictional). The real list comes from the two Workspaces plus Pivot Mail's own role table. */
export type Role = 'admin' | 'staff'
export type UserStatus = 'active' | 'invited' | 'disabled'

export interface AppUser {
  id: string
  name: string
  email: string
  role: Role
  status: UserStatus
  /** Shared mailboxes this person can open (account ids). Their own mailbox is always theirs. */
  shared: string[]
  /** ISO time of the last activity, null if never signed in */
  lastActive: string | null
}

export const SHARED_MAILBOXES = [
  { id: 'ops', name: 'Operations', email: 'ops@pivotscl.com', domain: 'pivotscl.com' },
  { id: 'ticketing', name: 'Ticketing', email: 'ticketing@pivottmc.com', domain: 'pivottmc.com' },
] as const

export const SELF_EMAIL = 'you@pivottmc.com'

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')

export function seedUsers(): AppUser[] {
  const hour = 3_600_000
  const base = new Date('2026-11-16T09:00:00Z').getTime()
  const users: AppUser[] = [{ id: 'u0', name: 'Your Name', email: SELF_EMAIL, role: 'admin', status: 'active', shared: ['ops', 'ticketing'], lastActive: new Date(base).toISOString() }]
  STAFF.forEach((s, i) => {
    const travel = s.role.includes('Travel')
    const shipping = s.role.includes('Shipping') || s.role.includes('Shared')
    const domain = travel && !shipping ? 'pivottmc.com' : 'pivotscl.com'
    users.push({
      id: `u${i + 1}`,
      name: s.name,
      email: `${slug(s.name)}@${domain}`,
      role: i === 6 ? 'admin' : 'staff',
      status: i === 8 ? 'invited' : i === 9 ? 'disabled' : 'active',
      shared: domain === 'pivottmc.com' ? ['ticketing'] : ['ops'],
      lastActive: i === 8 ? null : new Date(base - (i * 5 + 1) * hour).toISOString(),
    })
  })
  return users
}
