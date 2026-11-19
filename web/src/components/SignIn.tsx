import { AUTH_ERRORS, startUrl } from '../auth'
import type { AuthConfig } from '../auth'
import { Icon } from './Icon'
import { desktop } from '../desktop'
import { DOWNLOADS, thisComputer } from '../downloads'

interface Props {
  config: AuthConfig | null
  /** Error code from the last attempt (?auth_error=…) */
  error: string | null
}

/** The Google "G", in Google's own colours (the sign-in button is a Google action). */
export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.3-4 6.8-9.9 6.8-16.9z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

const SHIP = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 15l1.6 4.2a2 2 0 0 0 1.9 1.3h11a2 2 0 0 0 1.9-1.3L21 15H3z" />
    <path d="M5 15V9h14v6" />
    <path d="M9 9V5h6v4" />
    <path d="M12 5V3" />
  </svg>
)
const PLANE = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  </svg>
)
const ARROW = (
  <svg className="si-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

/** Fallback names, used when the server's list is not available (preview, sign-in not connected yet). */
const COMPANIES = [
  { id: 'scl' as const, name: 'Pivot Shipping', domain: 'pivotscl.com' },
  { id: 'tmc' as const, name: 'Pivot Travel Management', domain: 'pivottmc.com' },
]

/** One company button: its picture (a ship / a plane), its name, and "Continue with Google". */
function CompanyButton({ id, name, domain, href, autoFocus }: { id: 'scl' | 'tmc'; name: string; domain: string; href?: string; autoFocus?: boolean }) {
  const inner = (
    <>
      <span className={`si-tile ${id}`}>{id === 'tmc' ? PLANE : SHIP}</span>
      <span className="si-txt">
        <b>{name}</b>
        <small>
          <GoogleG size={14} />
          <span>
            Continue with Google <i>·</i> <span className="si-dom">@{domain}</span>
          </span>
        </small>
      </span>
      {ARROW}
    </>
  )
  return href ? (
    <a className="si-co" data-co={id} href={href} autoFocus={autoFocus}>
      {inner}
    </a>
  ) : (
    <button type="button" className="si-co" data-co={id} disabled aria-disabled="true" aria-describedby="signin-note">
      {inner}
    </button>
  )
}

/**
 * Sign-in: the same card as the Windows app's sign-in window (logo over a soft glow, "Welcome back", one button per company
 * with "Continue with Google"), floating in the middle of the page; full screen on phones. Only a real Google Workspace
 * sign-in; there is no preview or demo door.
 */
/** "Download the desktop app": Windows and Mac, like the store buttons on other services. Hidden inside the app itself. */
function DesktopDownloads() {
  if (desktop()) return null
  const mine = thisComputer()
  const items = [
    {
      os: 'windows' as const,
      name: 'Windows',
      href: DOWNLOADS.windows,
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id="si-dl-win" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3ccbf4" />
              <stop offset="1" stopColor="#0a6fd6" />
            </linearGradient>
          </defs>
          <path fill="url(#si-dl-win)" d="M0 0h11.377v11.372H0zM12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zM12.623 12.623H24V24H12.623z" />
        </svg>
      ),
    },
    {
      os: 'mac' as const,
      name: 'macOS',
      href: DOWNLOADS.mac,
      icon: (
        <svg width="27" height="27" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
        </svg>
      ),
    },
  ]
  // The visitor's own computer first.
  if (mine === 'mac') items.reverse()
  return (
    <section className="si-dl" aria-labelledby="si-dl-title">
      <h2 id="si-dl-title">Download the desktop app</h2>
      <div className="si-dl-row">
        {items.map((d) => (
          <a key={d.os} className={`si-dl-btn${d.os === mine ? ' mine' : ''}`} href={d.href} download data-os={d.os} aria-label={`Download Pivot Mail for ${d.os === 'mac' ? 'Mac' : 'Windows'}`}>
            {d.icon}
            <span>
              <small>Download for</small>
              {d.name}
            </span>
          </a>
        ))}
      </div>
      <p className="si-dl-note">Windows 10 and 11 · macOS 12 or newer · Apple silicon and Intel</p>
    </section>
  )
}

export function SignIn({ config, error }: Props) {
  const real = config?.configured === true
  const err = error ? (AUTH_ERRORS[error] ?? { title: 'Sign-in failed', text: 'Please try again.', denied: false }) : null
  const list = real && config.companies.length > 0 ? config.companies : COMPANIES
  // An address that belongs to one company only shows that company.
  const shown = real && config.company ? list.filter((c) => c.id === config.company) : list
  return (
    <main className="si">
      <div className="si-bg" aria-hidden="true">
        <span className="si-glow g1" />
        <span className="si-glow g2" />
        <span className="si-glow g3" />
        <span className="si-dots" />
      </div>
      <div className="si-stack">
        <section className="si-card" aria-labelledby="signin-title">
          <div className="si-hero" aria-hidden="true">
            <span className="si-glow g1" />
            <span className="si-glow g2" />
            <span className="si-dots" />
          </div>
          <header className="si-head">
            <img className="si-logo" src="/icon-192.png" alt="" width={72} height={72} draggable={false} />
            <span className="si-word">
              <b>Pivot</b> Mail
            </span>
          </header>
          <div className="si-sheet">
            <h1 id="signin-title">Welcome back</h1>
            <p className="si-lead">Sign in with your Pivot work account.</p>
            {err && (
              <div className="si-error" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16.5v.01" />
                </svg>
                <span>
                  <b>{err.title}</b>
                  {err.text}
                </span>
              </div>
            )}
            <div role="group" aria-label="Choose your company">
              {shown.map((c, i) => (
                <CompanyButton key={c.id} id={c.id} name={c.name} domain={c.domain} href={real ? (config.company ? startUrl() : startUrl(c.id)) : undefined} autoFocus={real && shown.length === 1 && i === 0} />
              ))}
            </div>
            {!real && (
              <p id="signin-note" className="si-note">
                Google sign-in is not connected yet.
              </p>
            )}
          </div>
          <footer className="si-foot">
            <span>
              <Icon name="lock" size={13} />
              Encrypted · Internal use only
            </span>
            <a href="mailto:it@pivotscl.com">Need help?</a>
          </footer>
        </section>
        <DesktopDownloads />
      </div>
    </main>
  )
}
