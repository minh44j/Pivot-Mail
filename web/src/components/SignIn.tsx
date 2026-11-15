interface Props {
  onPreview: () => void
}

/** Original artwork: route arcs between a ship and a plane over a soft blue gradient. */
function Artwork() {
  return (
    <svg className="art-svg" viewBox="0 0 640 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a3a9e" />
          <stop offset="0.55" stopColor="#0a5fd6" />
          <stop offset="1" stopColor="#1a8cff" />
        </linearGradient>
        <radialGradient id="glow" cx="0.8" cy="0.15" r="0.7">
          <stop offset="0" stopColor="#7fd0ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7fd0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a4fc0" stopOpacity="0" />
          <stop offset="1" stopColor="#06286b" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="640" height="760" fill="url(#sky)" />
      <rect width="640" height="760" fill="url(#glow)" />

      {/* globe lines */}
      <g fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="1.2">
        <circle cx="470" cy="250" r="230" />
        <circle cx="470" cy="250" r="170" />
        <ellipse cx="470" cy="250" rx="230" ry="90" />
        <ellipse cx="470" cy="250" rx="90" ry="230" />
        <path d="M240 250H700" />
      </g>

      {/* stars / lights */}
      <g fill="#fff">
        {[
          [70, 80, 2.2, 0.5],
          [150, 150, 1.6, 0.4],
          [260, 60, 1.8, 0.45],
          [350, 130, 2.4, 0.5],
          [560, 70, 1.8, 0.4],
          [600, 180, 1.4, 0.35],
          [40, 260, 1.6, 0.35],
          [120, 330, 2, 0.4],
        ].map(([cx, cy, r, o]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity={o} />
        ))}
      </g>

      {/* route arc: ship (origin) to plane (destination) */}
      <path d="M157 512 C 200 360, 400 250, 560 150" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
      <circle cx="157" cy="512" r="7" fill="#fff" />
      <circle cx="157" cy="512" r="14" fill="#fff" opacity="0.22" />
      <circle cx="560" cy="150" r="7" fill="#fff" />
      <circle cx="560" cy="150" r="14" fill="#fff" opacity="0.22" />

      {/* plane */}
      <g className="art-plane" transform="translate(405 245) rotate(-38) scale(1.5)">
        <path d="M0 -16 L3 -5 L21 4 L21 9 L3 6 L2 15 L8 19 L8 21 L0 19.500 L-8 21 L-8 19 L-2 15 L-3 6 L-21 9 L-21 4 L-3 -5 Z" fill="#fff" />
      </g>

      {/* sea */}
      <rect y="560" width="640" height="200" fill="url(#sea)" />
      <g fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.6" strokeLinecap="round">
        <path d="M-10 640 q30 -14 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" />
        <path d="M-40 676 q30 -14 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" />
        <path d="M-10 714 q30 -14 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" />
      </g>

      {/* container ship */}
      <g className="art-ship" transform="translate(40 560)">
        <g>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={`a${i}`} x={14 + i * 24} y={-18} width="22" height="16" rx="2" fill={['#ffffff', '#cfe6ff', '#ffffff', '#9fd0ff', '#ffffff'][i]} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <rect key={`b${i}`} x={26 + i * 24} y={-36} width="22" height="16" rx="2" fill={['#cfe6ff', '#ffffff', '#9fd0ff', '#cfe6ff'][i]} />
          ))}
          <rect x="142" y="-44" width="30" height="42" rx="3" fill="#fff" />
          <rect x="148" y="-38" width="18" height="6" rx="1.500" fill="#0a5fd6" opacity="0.7" />
          <rect x="148" y="-28" width="18" height="6" rx="1.500" fill="#0a5fd6" opacity="0.5" />
          <path d="M0 -2 H180 L160 28 H20 Z" fill="#0a2f78" />
          <path d="M6 6 H174" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
        </g>
      </g>
    </svg>
  )
}

function MiniInbox() {
  return (
    <div className="art-card" aria-hidden="true">
      <div className="art-card-head">
        <span className="dot c-blue" />
        <b>Inbox</b>
        <i />
      </div>
      {[
        { w: 62, c: 'c-orange', unread: true, att: true },
        { w: 78, c: 'c-green', unread: true, att: false },
        { w: 54, c: '', unread: false, att: false },
      ].map((r, i) => (
        <div className="art-row" key={i}>
          <span className={`art-udot${r.unread ? ' on' : ''}`} />
          <div className="art-lines">
            <i style={{ width: `${r.w}%` }} />
            <i style={{ width: `${r.w - 18}%` }} />
            {r.att && <em>packing-list.pdf</em>}
          </div>
          {r.c && <span className={`dot ${r.c}`} />}
        </div>
      ))}
    </div>
  )
}

/**
 * Sign-in screen. Google login is not connected yet (needs the Workspace OAuth app),
 * so the only working path is the sample-data preview.
 */
export function SignIn({ onPreview }: Props) {
  return (
    <main className="signin">
      <section className="signin-art">
        <Artwork />
        <div className="art-copy">
          <span className="mark" role="img" aria-label="Pivot Mail">
            P
          </span>
          <h2>
            Your mail, at the
            <br />
            speed of your work.
          </h2>
          <p>One calm inbox for every Pivot mailbox, built for the travel and shipping teams.</p>
        </div>
        <MiniInbox />
      </section>

      <section className="signin-panel">
        <div className="signin-card">
          <span className="mark big" role="img" aria-label="Pivot Mail">
            P
          </span>
          <h1>Sign in</h1>
          <p className="muted lead">Use your Pivot Workspace account to open your mailboxes.</p>

          <button type="button" className="btn wide google" disabled aria-describedby="signin-note">
            Continue with Google
          </button>
          <p id="signin-note" className="signin-note">
            Google sign-in is not connected yet.
          </p>

          <div className="or" role="separator">
            <span>or</span>
          </div>

          <button type="button" className="btn primary wide" onClick={onPreview} autoFocus>
            Open preview with sample data
          </button>
          <p className="signin-note">Sample data only. No real mail is read or stored.</p>
        </div>
        <footer className="signin-foot">
          <span>Pivot Travel Management</span>
          <span aria-hidden="true">·</span>
          <span>Pivot Shipping</span>
          <span aria-hidden="true">·</span>
          <span>Internal use only</span>
        </footer>
      </section>
    </main>
  )
}
