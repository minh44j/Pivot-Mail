/** Browser side of sign-in. The server lives in web/api/auth. */
export interface AuthCompany {
  id: 'scl' | 'tmc'
  name: string
  domain: string
}
export interface AuthConfig {
  configured: boolean
  /** Set when this address belongs to one company, so the person is not asked */
  company: 'scl' | 'tmc' | null
  companies: AuthCompany[]
}
export interface AuthUser {
  email: string
  name: string
  company: string
  role: 'admin' | 'staff'
  title?: string
}

/** The preview and local development have no server: anything that is not JSON counts as "no sign-in here". */
async function getJson<T>(url: string): Promise<{ status: number; data: T } | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } })
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return null
    return { status: res.status, data: (await res.json()) as T }
  } catch {
    return null
  }
}

export async function fetchAuthConfig(): Promise<AuthConfig | null> {
  const r = await getJson<AuthConfig>('/api/auth/config')
  return r && r.status === 200 ? r.data : null
}

export async function fetchSession(): Promise<AuthUser | null> {
  const r = await getJson<{ user: AuthUser | null }>('/api/auth/session')
  return r && r.status === 200 ? r.data.user : null
}

/** Saves the person's own job title. Returns the saved text, or null when it could not be saved. */
export async function saveTitle(title: string): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/session', { method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ title }) })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null
    return ((await res.json()) as { title?: string }).title ?? null
  } catch {
    return null
  }
}

/** everywhere: also ends this person's sessions on every other computer and phone. */
export async function signOut(everywhere = false): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ everywhere }) })
  } catch {
    /* the cookie simply expires */
  }
}

export const startUrl = (company?: string): string => `/api/auth/start${company ? `?company=${company}` : ''}`

/** What each error code from the server means for the person. Kept vague on purpose where detail would help an attacker. */
export const AUTH_ERRORS: Record<string, { title: string; text: string; denied: boolean }> = {
  domain: { title: 'Access denied', text: 'That account is not part of this company\'s Google Workspace. Sign in with your Pivot work account.', denied: true },
  unverified: { title: 'Access denied', text: 'Google could not confirm that email address.', denied: true },
  cancelled: { title: 'Sign-in cancelled', text: 'You closed the Google sign-in. Try again when you are ready.', denied: false },
  state: { title: 'Sign-in expired', text: 'The sign-in took too long or was opened in another tab. Please start again.', denied: false },
  expired: { title: 'Sign-in expired', text: 'Please start again.', denied: false },
  token: { title: 'Sign-in failed', text: 'Google\'s answer could not be checked. Please try again.', denied: false },
  company: { title: 'Choose your company', text: 'This address does not tell us which company you belong to. Choose it below.', denied: false },
  config: { title: 'Sign-in is not available', text: 'Sign-in is not set up on this address yet. Ask your administrator.', denied: false },
  disabled: { title: 'Access denied', text: 'Your access has been turned off. Ask your administrator.', denied: true },
  invite: { title: 'Access denied', text: 'Your account has not been added yet. Ask your administrator to invite you.', denied: true },
  unavailable: { title: 'Sign-in is busy', text: 'Please try again in a moment.', denied: false },
  google: { title: 'Google reported a problem', text: 'Please try again in a moment.', denied: false },
}

/* ---------- connected mailboxes ---------- */
export interface AuthAccount {
  id: string
  email: string
  name: string
  company: 'scl' | 'tmc'
  kind: 'personal' | 'shared'
  status: 'active' | 'needs_reconnect' | 'disabled'
  syncWindowDays: number
}

export async function fetchAccounts(): Promise<AuthAccount[] | null> {
  const r = await getJson<{ accounts: AuthAccount[]; configured?: boolean }>('/api/accounts')
  return r && r.status === 200 && r.data.configured !== false ? r.data.accounts : null
}

/** One person's official signature choices for a mailbox (from Pivot OS; a shared desk can have several people). */
export interface OsSignaturePerson {
  empId: string
  name: string
  mine: boolean
  options: { key: string; label: string; html: string }[]
}

/** The official signature of each of this person's mailboxes, by mailbox id ({} when Pivot OS is not linked or not reached). */
export async function fetchOsSignatures(): Promise<Record<string, OsSignaturePerson[]>> {
  const r = await getJson<{ signatures?: Record<string, OsSignaturePerson[]> }>('/api/accounts/signatures')
  return r && r.status === 200 && r.data.signatures && typeof r.data.signatures === 'object' ? r.data.signatures : {}
}

export const connectUrl = (company: 'scl' | 'tmc', kind: 'personal' | 'shared'): string => `/api/accounts/connect?company=${company}&kind=${kind}`

/**
 * Clicking "Add account". In the desktop app, Google's permission page opens in the person's normal browser, which may not be
 * signed in to Pivot Mail (it then asked to sign in first, always for this website's own company: choosing Pivot Travel
 * Management showed a pivotscl.com Google page). So the app's page first asks for a two-minute pass carrying its sign-in and
 * opens the address with the pass. In a browser tab the ordinary link is used (that browser is the one signed in).
 */
let connectStartedAt = 0
/** "Add account" was started from this window in the last 15 minutes: the app reloads its mailboxes when it comes back. */
export const connectPending = (): boolean => Date.now() - connectStartedAt < 15 * 60_000
export const connectSettled = (): void => {
  connectStartedAt = 0
}

export function connectClick(company: 'scl' | 'tmc', kind: 'personal' | 'shared') {
  return (e: { preventDefault(): void }) => {
    if (typeof window === 'undefined' || !(window as unknown as { pivotDesktop?: unknown }).pivotDesktop) return
    e.preventDefault()
    connectStartedAt = Date.now()
    void (async () => {
      let to = connectUrl(company, kind)
      try {
        const res = await fetch('/api/accounts/connect', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pivot-desktop': '1' }, body: JSON.stringify({ company, kind }) })
        const r = (await res.json().catch(() => null)) as { url?: unknown } | null
        if (res.ok && r && typeof r.url === 'string' && r.url.startsWith('/api/accounts/connect?')) to = r.url
      } catch {
        /* the ordinary link */
      }
      window.location.href = to // the app opens it in the browser
    })()
  }
}

export async function disconnectAccount(id: string): Promise<boolean> {
  try {
    const res = await fetch('/api/accounts/disconnect', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
    return res.ok
  } catch {
    return false
  }
}

export interface GmailAccess {
  accessToken: string
  /** ms since 1970 */
  expiresAt: number
}

/** A one-hour Gmail key for a mailbox. The browser then talks to Gmail directly, so mail does not pass through our server. */
export async function fetchGmailAccess(accountId: string): Promise<GmailAccess | { error: string }> {
  const r = await getJson<GmailAccess & { error?: string }>(`/api/accounts/token?id=${encodeURIComponent(accountId)}`)
  if (!r) return { error: 'unavailable' }
  if (r.status === 200 && r.data.accessToken) return { accessToken: r.data.accessToken, expiresAt: r.data.expiresAt }
  return { error: r.data.error ?? 'unavailable' }
}

export interface GmailProfile {
  messagesTotal: number
  threadsTotal: number
}

export async function fetchGmailProfile(accessToken: string): Promise<GmailProfile | null> {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return null
    const d = (await res.json()) as GmailProfile
    return typeof d.messagesTotal === 'number' ? d : null
  } catch {
    return null
  }
}

export const CONNECT_ERRORS: Record<string, string> = {
  session: 'Please sign in again, then add the mailbox.',
  forbidden: 'Only administrators can add a shared mailbox.',
  domain: 'That account does not belong to the company you chose.',
  scope: 'Mail access was not allowed. Tick every permission on Google\'s screen and try again.',
  norefresh: 'Google did not give lasting access. Remove Pivot Mail from your Google account\'s connected apps and try again.',
  company: 'Choose which company the mailbox belongs to.',
  config: 'Mailbox connection is not set up yet. Ask your administrator.',
  unavailable: 'The service is busy. Please try again in a moment.',
  state: 'The connection expired. Please start again.',
  token: 'Google\'s answer could not be checked. Please try again.',
  expired: 'The connection expired. Please start again.',
  unverified: 'Google could not confirm that address.',
  cancelled: 'Connection cancelled.',
}
