# Pivot Mail: security review (Phase 6, hardening)

Date: 2026-11-18. Scope: everything a person or an email can reach: sign-in, sessions, connected mailboxes and their stored
Google permission, company and mailbox access rules, every server endpoint (`web/api`), the database (Supabase project
"Pivot Mail"), the code that cleans incoming email, and the browser security headers.

Method: every server file read in full; database checked live (row security, grants, functions, Supabase security advisor);
dependency audit; each finding reproduced with a test that **fails on the old code** before it was fixed.
⚠️ Verify with specialist: this is a careful in-house review, not a certified penetration test.

## Findings and fixes

| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| 1 | **Critical** | A hostile email could run its own script inside Pivot Mail when someone pressed **Reply** or **Forward**. The email cleaner unwrapped a link with a forbidden address (`javascript:`, `data:`, or none) but never cleaned what was inside it, so an `<img onerror=…>` inside such a link survived. The reading pane was safe (its frame cannot run scripts), but the quoted copy is placed in the writing window, which is part of the app. A script there could ask for the mailbox key and read or send mail as that person. Reproduced on the live version (3 of 4 payloads ran). | Cleaner rewritten so every node is cleaned exactly once, including the contents of unwrapped links. | `xss.js` (browser, 5 checks) |
| 2 | High | No browser security headers. Nothing stopped an injected script from running, and the site could be framed by another site. | `web/vercel.json`: Content-Security-Policy with `script-src 'self'` (no inline scripts, no eval), `frame-ancestors 'none'`, `object-src 'none'`, plus HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, X-Frame-Options. The one inline script (theme) moved to `public/theme.js`. This is a second wall behind finding 1: a planted script is refused even if the cleaner ever fails again. | `csp.js`, and every browser suite run with the policy on (`cspinject.js`): zero violations |
| 3 | High | Reconnecting an existing mailbox overwrote its kind and owner. Anyone who knew a **shared** mailbox's password (today ops@ uses a shared login) could add it as their own "personal" mailbox, become its owner and remove it for everybody. | A mailbox that is already connected keeps its kind and owner; only an administrator may reconnect a shared one; reconnecting is logged as `account.reconnected`. Production checked: 3 mailboxes, none affected. | `tests/accounts.test.mts` (6 checks, fail on old code) |
| 4 | Medium | A hostile email made of thousands of nested unknown tags froze the app (the cleaner re-walked the whole message for every wrapper). | Linear-time cleaning. 4,000 levels now open in under a second. | `xss.js` |
| 5 | Medium | Sessions could not be ended remotely: a copied session cookie stayed valid for 7 days. | "Sign out of all devices" (avatar menu); administrators can sign a person out everywhere (Users and roles); turning a person's access off also ends their sessions, so turning it on again does not revive an old one. Stored as `app_users.sessions_valid_after`. | `tests/hardening.test.mts`, `soa.js`, `people.js` |
| 6 | Medium | The one-time sign-in cookie and the session cookie are signed with the same key and had the same shape, so one could be presented as the other. In production this only produced an error (the database refuses an empty email), but it was not refused on purpose. | Every token now carries its type; a session must be a session with a real company. Sessions from before this release keep working (nobody is signed out). | `tests/hardening.test.mts` (fail on old code) |
| 7 | Low | Class names from emails were kept, so a quoted email could borrow the app's own look in the writing window (a fake "Message sent" card). Negative margins could slide content over neighbours. | Only quote-marker classes kept (`gmail_quote` and similar); negative sizes, `var()` and `calc()` refused in email styles. | `html.js`, `xss.js` |
| 8 | Low | A malformed cookie made the server fail the request instead of treating the person as signed out. | Ignored. | `tests/hardening.test.mts` |
| 9 | Low | A mailbox switched off by an administrator still handed out a Gmail key to anyone with an access row. | Refused. | `tests/accounts.test.mts` |
| 10 | Low | The audit log could be edited or deleted by the server's own key, and removing a mailbox rewrote old audit rows (its link was `ON DELETE SET NULL`). | Database trigger makes the audit log append-only; the mailbox id is kept as plain history. Verified live: an UPDATE is refused. Migration `0006_hardening.sql`. | live check |

## Checked and fine (no change needed)

- **Sign-in (Google)**: code flow with PKCE, state and nonce; issuer, audience, expiry, verified email; both the `hd` claim and the address must match the company's Workspace. Client secret only on the server.
- **Session cookie**: `__Host-` prefix, HttpOnly, Secure, SameSite=Lax, signed (HMAC-SHA256, constant-time compare). Role and disabled status re-read from the database on every request.
- **Stored Google permission**: AES-256-GCM, key only in Vercel, bound to the mailbox address; never returned to the browser; the browser gets one-hour keys only for mailboxes it has an access row for.
- **Changing requests** check the Origin header (blocks other sites); read requests return no CORS headers (other sites cannot read them).
- **Database**: row security on for all 9 tables with no policies; the public keys can read nothing and call no function; functions pin `search_path`. Supabase advisor: only the expected "RLS enabled, no policy" notes.
- **Companies**: cases, Pivot OS lists and numbers are limited server-side to the person's own company and the companies of mailboxes they hold; Pivot OS checks the person's own rights again.
- **Dependencies**: `npm audit --omit=dev`: 0 vulnerabilities. The 5 "high" notes are in the build tool (picomatch via Vite) and never ship to users; update when Vite publishes a fix.

## By design (decisions, not defects)

- Anyone with a company Google account can sign in and starts as Staff (no invite step), as decided.
- Administrators manage people of **both** companies (group-wide administrators).
- Sessions last 7 days; with "Sign out of all devices" that is acceptable.
- Mail bodies stay on each device: in the browser (IndexedDB, up to 4,000 per mailbox) or, in the Windows app, in its own database
  file in the person's Windows profile (`%APPDATA%\Pivot Mail\mail.db`, up to 50,000 per mailbox, for instant search). Both are wiped
  on sign-out and when a different person signs in on the same computer. Only the Pivot Mail page itself can read the app's database
  (not the first-run screen, previews or any other site); the file is protected by the Windows account, like Outlook's own data file.

## Still open

- **Backups**: the Pivot Mail database (people, mailbox connections, cases, audit log) has no automatic backup on the free plan. Losing it means reconnecting every mailbox and losing case notes. Options: upgrade the project, or a nightly backup job (needs a database connection secret in GitHub).
- **Pilot**: 3 staff for 2 weeks (Phase 6).
- The weather in the top bar sends the city name to Open-Meteo (no account, no personal data beyond the city).
