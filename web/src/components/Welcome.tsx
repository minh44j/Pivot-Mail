import logoLockup from '../assets/brand/logo-lockup.png'
import { connectUrl } from '../auth'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface Props {
  /** First name, for the greeting */
  name: string
  email: string
  company: 'scl' | 'tmc'
  onOther: () => void
  onSignOut: () => void
}

const hello = (d = new Date()): string => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 17 ? 'Good afternoon' : 'Good evening')

/** Little cards that drift around the centre badge. Decoration only. */
const ORBIT: { icon: IconName; tone: string; label: string }[] = [
  { icon: 'ship', tone: 'a', label: 'Shipping' },
  { icon: 'plane', tone: 'b', label: 'Travel' },
  { icon: 'clip', tone: 'c', label: 'Attachments' },
  { icon: 'hash', tone: 'd', label: 'Reference numbers' },
]

const TRUST: { icon: IconName; title: string; text: string }[] = [
  { icon: 'lock', title: 'Private to you', text: 'Nobody else can open your mailbox, not even an administrator.' },
  { icon: 'send', title: 'Works like Gmail', text: 'You read, send and organise mail here. Everything stays in your Gmail.' },
  { icon: 'close', title: 'Disconnect any time', text: 'Use the ⋯ menu next to your mailbox. Your mail is never touched.' },
]

/**
 * The first screen for someone who has signed in but not yet connected a mailbox.
 * Signing in proves who they are; connecting is a separate permission Google asks for, so this
 * screen explains it in three steps and offers one big button.
 */
export function Welcome({ name, email, company, onOther, onSignOut }: Props) {
  const first = name.trim().split(/\s+/)[0] || 'there'
  return (
    <main className="welcome" aria-labelledby="wl-title">
      <div className="wl-canvas" aria-hidden="true">
        <span className="wl-glow g1" />
        <span className="wl-glow g2" />
        <div className="wl-orbit">
          {ORBIT.map((o, i) => (
            <span key={o.label} className={`wl-chip ${o.tone}`} style={{ ['--i' as string]: i }}>
              <Icon name={o.icon} size={20} />
            </span>
          ))}
          <span className="wl-ring r1" />
          <span className="wl-ring r2" />
          <span className="wl-core">
            <Icon name="inbox" size={38} />
          </span>
        </div>
      </div>

      <section className="wl-sheet">
        <img className="logo-lockup" src={logoLockup} alt="Pivot Mail" />
        <p className="wl-hello">{hello()}</p>
        <h1 id="wl-title">Welcome, {first}</h1>
        <p className="wl-lead">One more step and your mail is here. It takes about 20 seconds.</p>

        <ol className="wl-steps">
          <li className="done">
            <span className="wl-dot" aria-hidden="true">
              <Icon name="check" size={14} />
            </span>
            <span>
              <strong>Signed in</strong>
              <small>{email}</small>
            </span>
          </li>
          <li className="now" aria-current="step">
            <span className="wl-dot" aria-hidden="true">
              2
            </span>
            <span>
              <strong>Connect your mailbox</strong>
              <small>Google asks once for permission to show your mail here.</small>
            </span>
          </li>
          <li>
            <span className="wl-dot" aria-hidden="true">
              3
            </span>
            <span>
              <strong>Your inbox opens</strong>
              <small>Your latest mail loads first, older mail follows.</small>
            </span>
          </li>
        </ol>

        <a className="wl-go" href={connectUrl(company, 'personal')}>
          <span className="wl-g" aria-hidden="true">
            G
          </span>
          Connect {email}
          <Icon name="arrow" size={18} />
        </a>
        <button type="button" className="wl-link" onClick={onOther}>
          Connect a different or shared mailbox
        </button>

        <ul className="wl-trust" aria-label="What to expect">
          {TRUST.map((t) => (
            <li key={t.title}>
              <span className="wl-ti" aria-hidden="true">
                <Icon name={t.icon} size={16} />
              </span>
              <span>
                <strong>{t.title}</strong>
                <small>{t.text}</small>
              </span>
            </li>
          ))}
        </ul>

        <p className="wl-foot">
          Not {first}?{' '}
          <button type="button" className="wl-link inline" onClick={onSignOut}>
            Sign out
          </button>
        </p>
      </section>
    </main>
  )
}
