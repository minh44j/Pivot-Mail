export type Problem = 'offline' | 'syncfail' | 'ratelimit' | 'listerror' | 'expired' | 'denied'

export const PROBLEMS: { id: Problem; label: string; hint: string }[] = [
  { id: 'offline', label: 'Offline', hint: 'Banner, sending is held back' },
  { id: 'syncfail', label: 'Sync failed', hint: 'Banner with Retry' },
  { id: 'ratelimit', label: 'Rate limited', hint: 'Google asks us to slow down' },
  { id: 'listerror', label: 'List failed to load', hint: 'Error state with Retry' },
  { id: 'expired', label: 'Session expired', hint: 'Full screen, sign in again' },
  { id: 'denied', label: 'Access denied', hint: 'Account not allowed' },
]
