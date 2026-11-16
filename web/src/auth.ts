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

export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
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
  google: { title: 'Google reported a problem', text: 'Please try again in a moment.', denied: false },
}
