interface Props {
  onPreview: () => void
}

/**
 * Sign-in screen. Google login is not connected yet (needs the Workspace OAuth app),
 * so the only working path is the sample-data preview.
 */
export function SignIn({ onPreview }: Props) {
  return (
    <main className="signin">
      <div className="signin-card">
        <span className="mark big" role="img" aria-label="Pivot Mail">
          P
        </span>
        <h1>Pivot Mail</h1>
        <p className="muted">Sign in with your Pivot Workspace account to open your mailboxes.</p>
        <button type="button" className="btn wide" disabled aria-describedby="signin-note">
          Continue with Google
        </button>
        <p id="signin-note" className="signin-note">
          Not connected yet. This preview uses sample data only.
        </p>
        <button type="button" className="btn primary wide" onClick={onPreview} autoFocus>
          Open preview with sample data
        </button>
      </div>
    </main>
  )
}
