import { connectClick, connectUrl } from '../auth'
import { BrandLogo } from './BrandLogo'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { GoogleG } from './SignIn'

interface Props {
  /** First name, for the greeting */
  name: string
  email: string
  company: 'scl' | 'tmc'
  onOther: () => void
}

const hello = (d = new Date()): string => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 17 ? 'Good afternoon' : 'Good evening')

const TRUST: { icon: IconName; title: string; text: string }[] = [
  { icon: 'lock', title: 'Private to you', text: 'Nobody else can open your mailbox, not even an administrator.' },
  { icon: 'send', title: 'Works like Gmail', text: 'You read, send and organise mail here. Everything stays in your Gmail.' },
  { icon: 'close', title: 'Disconnect any time', text: 'Use the ⋯ menu next to your mailbox. Your mail is never touched.' },
]

/**
 * What a signed-in person sees in the main area until their first mailbox is connected.
 * It sits inside the normal app frame (top bar, folder list), so it reads as the same place,
 * not a different page. Signing in proves who they are; connecting is a separate permission
 * Google asks for, so this explains it in three steps and offers one big button.
 */
export function Welcome({ name, email, company, onOther }: Props) {
  const first = name.trim().split(/\s+/)[0] || 'there'
  return (
    <section className="welcome-main" aria-labelledby="wl-title">
      <div className="wl-card">
        <div className="wl-top">
          <BrandLogo size="lg" word={false} />
          <div>
            <p className="wl-hello">{hello()}</p>
            <h1 id="wl-title">Welcome, {first}</h1>
          </div>
        </div>
        <p className="wl-lead">One more step and your mail is here. It takes about 20 seconds.</p>
        <div className="wl-body">
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

          <a className="wl-go" href={connectUrl(company, 'personal')} onClick={connectClick(company, 'personal')}>
            <GoogleG />
            Connect {email}
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
        </div>
      </div>
    </section>
  )
}
