import { AUTH_ERRORS, startUrl } from '../auth'
import type { AuthConfig } from '../auth'
import { BrandLogo } from './BrandLogo'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface Props {
  config: AuthConfig | null
  /** Error code from the last attempt (?auth_error=…) */
  error: string | null
}

const PILLS: { icon: IconName; text: string }[] = [
  { icon: 'inbox', text: 'Every mailbox in one place' },
  { icon: 'hash', text: 'Reference numbers from Pivot OS' },
  { icon: 'users', text: 'Shared mailboxes for the team' },
]

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

/** A small, calm picture of the inbox: the same colours the real one uses. Decoration only. */
function Showcase() {
  const rows = [
    { w: 64, unread: true, dot: 'c-orange', file: 'packing-list.pdf' },
    { w: 80, unread: true, dot: 'c-green' },
    { w: 52, unread: false },
  ]
  return (
    <div className="si-show" aria-hidden="true">
      <div className="si-mini">
        <div className="si-mini-head">
          <i className="si-mini-dot" />
          <b>Inbox</b>
          <span>3</span>
        </div>
        {rows.map((r, i) => (
          <div className="si-mini-row" key={i}>
            <span className={`si-mini-u${r.unread ? ' on' : ''}`} />
            <div className="si-mini-lines">
              <i style={{ width: `${r.w}%` }} className={r.unread ? 'b' : ''} />
              <i style={{ width: `${r.w - 20}%` }} />
              {r.file && <em>{r.file}</em>}
            </div>
            {r.dot && <span className={`dot ${r.dot}`} />}
          </div>
        ))}
      </div>
      <div className="si-kpi">
        <small>Cases opened this week</small>
        <div>
          <b>38</b>
          <span>▲ 6</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Sign-in. Same layout as Pivot OS: the brand and a short promise on the left, one calm card on the right (the brand moves into the
 * card on phones). Only a real Google Workspace sign-in; there is no preview or demo door.
 */
export function SignIn({ config, error }: Props) {
  const real = config?.configured === true
  const err = error ? (AUTH_ERRORS[error] ?? { title: 'Sign-in failed', text: 'Please try again.', denied: false }) : null
  return (
    <main className="si">
      <section className="si-brand" aria-label="About Pivot Mail">
        <BrandLogo size="lg" />
        <h2>
          Your mail,
          <br />
          at the speed of your work.
        </h2>
        <p className="si-sub">One inbox for Pivot Shipping and Pivot Travel Management, connected to Pivot OS.</p>
        <ul className="si-pills">
          {PILLS.map((p) => (
            <li key={p.text}>
              <Icon name={p.icon} size={15} />
              {p.text}
            </li>
          ))}
        </ul>
        <Showcase />
        <span className="si-place">Riyadh, Kingdom of Saudi Arabia</span>
      </section>

      <section className="si-side">
        <div className="si-card" aria-labelledby="signin-title">
          <div className="si-card-logo">
            <BrandLogo />
          </div>
          <h1 id="signin-title">Welcome back</h1>
          <p className="si-lead">Sign in to your Pivot Workspace to open your mailboxes.</p>

          {err && (
            <p className="si-error" role="alert">
              <strong>{err.title}.</strong> {err.text}
            </p>
          )}

          {real && config.company ? (
            <a className="si-google" href={startUrl()} autoFocus>
              <GoogleG />
              Continue with Google
            </a>
          ) : real ? (
            <div className="si-cos" role="group" aria-label="Choose your company">
              {config.companies.map((c) => (
                <a key={c.id} className="si-google" href={startUrl(c.id)}>
                  <GoogleG />
                  <span>
                    {c.name} <small>@{c.domain}</small>
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <>
              <button type="button" className="si-google" disabled aria-describedby="signin-note">
                <GoogleG />
                Continue with Google
              </button>
              <p id="signin-note" className="si-note">
                Google sign-in is not connected yet.
              </p>
            </>
          )}

          <p className="si-fine">Use your @pivotscl.com or @pivottmc.com work account.</p>

          <footer className="si-foot">
            <span>
              <Icon name="lock" size={13} />
              Encrypted · Internal use only
            </span>
            <a href="mailto:it@pivotscl.com">Need help?</a>
          </footer>
        </div>
      </section>
    </main>
  )
}
