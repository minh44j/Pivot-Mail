import { AUTH_ERRORS, startUrl } from '../auth'
import type { AuthConfig } from '../auth'
import { Icon } from './Icon'

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
    </main>
  )
}
