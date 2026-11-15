import logoLockup from '../assets/brand/logo-lockup.png'

interface Props {
  onPreview: () => void
}

/* ---- artwork pieces (original, drawn in code; brand palette from the logo) ---- */

function waves(y: number, width: number): string {
  const n = Math.ceil(width / 60) + 2
  return `M-30 ${y} q30 -14 60 0${' t60 0'.repeat(n)}`
}

/** Container ship, drawn upward from its waterline at (0, 0). Width 180. */
function Ship() {
  const tops = ['#ffffff', '#b8f3df', '#02b789', '#ffffff', '#b8f3df']
  const upper = ['#02b789', '#ffffff', '#b8f3df', '#ffffff']
  return (
    <g className="art-bob">
      {tops.map((c, i) => (
        <rect key={`a${i}`} x={14 + i * 24} y={-18} width="22" height="16" rx="2" fill={c} />
      ))}
      {upper.map((c, i) => (
        <rect key={`b${i}`} x={26 + i * 24} y={-36} width="22" height="16" rx="2" fill={c} />
      ))}
      <rect x="142" y="-46" width="30" height="44" rx="3" fill="#fff" />
      <rect x="148" y="-40" width="18" height="6" rx="1.5" fill="#162328" opacity="0.75" />
      <rect x="148" y="-30" width="18" height="6" rx="1.5" fill="#162328" opacity="0.55" />
      <path d="M0 -2 H180 L160 28 H20 Z" fill="#162328" />
      <path d="M6 6 H174" stroke="#02b789" strokeWidth="3" />
    </g>
  )
}

/** Plane, nose pointing up at (0, 0). Rotate to the heading + 90 degrees. */
function Plane() {
  return (
    <g className="art-fly">
      <path d="M0 -16 L3 -5 L21 4 L21 9 L3 6 L2 15 L8 19 L8 21 L0 19.5 L-8 21 L-8 19 L-2 15 L-3 6 L-21 9 L-21 4 L-3 -5 Z" fill="#fff" />
    </g>
  )
}

function Pin({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="15" fill="#fff" opacity="0.2" />
      <circle cx={x} cy={y} r="7" fill="#fff" />
    </g>
  )
}

function Globe({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g fill="none" stroke="#fff" strokeOpacity="0.13" strokeWidth="1.3">
      <circle cx={cx} cy={cy} r={r} />
      <circle cx={cx} cy={cy} r={r * 0.72} />
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.38} />
      <ellipse cx={cx} cy={cy} rx={r * 0.38} ry={r} />
      <path d={`M${cx - r} ${cy}H${cx + r}`} />
    </g>
  )
}

function Lights({ pts }: { pts: [number, number, number, number][] }) {
  return (
    <g fill="#fff">
      {pts.map(([x, y, r, o]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} opacity={o} />
      ))}
    </g>
  )
}

function Sea({ y, w, h, lines }: { y: number; w: number; h: number; lines: number[] }) {
  return (
    <g>
      <rect y={y} width={w} height={h} fill="url(#sea)" />
      <g fill="none" stroke="#fff" strokeOpacity="0.26" strokeWidth="1.6" strokeLinecap="round">
        {lines.map((ly) => (
          <path key={ly} d={waves(ly, w)} />
        ))}
      </g>
    </g>
  )
}

const SEA_DEF = (
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#0b1a1f" stopOpacity="0" />
      <stop offset="1" stopColor="#0b1a1f" stopOpacity="0.8" />
    </linearGradient>
  </defs>
)

function ArtDesktop() {
  return (
    <svg className="art-svg desk" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {SEA_DEF}
      <Globe cx={1130} cy={300} r={300} />
      <Lights
        pts={[
          [120, 110, 2.2, 0.5],
          [310, 220, 1.6, 0.4],
          [520, 90, 1.8, 0.45],
          [760, 160, 2.4, 0.4],
          [1330, 80, 1.8, 0.4],
          [1390, 420, 1.4, 0.35],
          [70, 400, 1.6, 0.35],
          [220, 480, 2, 0.4],
        ]}
      />
      <path d="M312 596 C 300 100, 500 -100, 1230 170" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="2.2" strokeDasharray="2 11" strokeLinecap="round" />
      <Pin x={312} y={596} />
      <Pin x={1230} y={170} />
      <g transform="translate(935 82) rotate(103) scale(1.9)">
        <Plane />
      </g>
      <Sea y={690} w={1440} h={210} lines={[745, 800, 858]} />
      <g transform="translate(120 650) scale(1.45)">
        <Ship />
      </g>
    </svg>
  )
}

function ArtMobile() {
  return (
    <svg className="art-svg mob" viewBox="0 0 480 330" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
      {SEA_DEF}
      <Globe cx={350} cy={100} r={170} />
      <Lights
        pts={[
          [60, 40, 2, 0.5],
          [150, 100, 1.6, 0.4],
          [250, 20, 1.8, 0.45],
          [455, 200, 1.6, 0.35],
          [30, 190, 1.6, 0.35],
        ]}
      />
      <path d="M150 222 C 190 130, 320 80, 405 56" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
      <Pin x={150} y={222} />
      <Pin x={405} y={56} />
      <g transform="translate(322 90) rotate(66) scale(1.5)">
        <Plane />
      </g>
      <Sea y={282} w={480} h={48} lines={[300, 318]} />
      <g transform="translate(40 262)">
        <Ship />
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
 * Sign-in screen. One brand-gradient canvas with artwork, and a white sheet with a curved edge
 * (bottom sheet on phones, floating card on larger screens).
 * Google login is not connected yet (needs the Workspace OAuth app), so the only working path
 * is the sample-data preview.
 */
export function SignIn({ onPreview }: Props) {
  return (
    <main className="signin">
      <ArtDesktop />
      <ArtMobile />
      <MiniInbox />

      <div className="signin-hero">
        <h2>Your mail, at the speed of your work.</h2>
      </div>

      <section className="signin-panel" aria-labelledby="signin-title">
        <img className="logo-lockup" src={logoLockup} alt="Pivot Mail" />
        <h1 id="signin-title">Sign in</h1>
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
