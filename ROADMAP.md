# Pivot Mail: Google setup checklist and route map

Status: UI preview complete (sample data). Next: real Google login and Gmail sync.
⚠️ Verify with specialist: Google Cloud/Workspace console names, scope classification and quotas change. Check each against Google's current documentation at the time.

## A. Checklist (Workspace super admin)

| # | Step | Where | Notes |
|---|------|-------|-------|
| 0 ✅ | Workspace layout (decided) | Decision | pivottmc.com and pivotscl.com are **two** Workspaces. Decision: **two Internal Cloud projects**, one per Workspace, two OAuth Client IDs. The app picks the Client ID from the email domain. Steps 1 to 7 are done once in each Workspace. |
| 1 | Create Cloud project "Pivot Mail" under the company organisation | console.cloud.google.com | Use a company admin account, not a personal Gmail. Enable billing only if Pub/Sub is used later (⚠️ verify free tier). |
| 2 | Enable APIs: Gmail API, People API, Cloud Pub/Sub API (later: Drive API) | APIs & Services → Library | Drive is for the later Google Drive integration. |
| 3 | OAuth consent screen: user type **Internal** | APIs & Services → OAuth consent screen | App name Pivot Mail, support email, logo from `brand/`. Internal skips Google's public verification (⚠️ verify). |
| 4 | Add scopes | Consent screen → Data access | `openid`, `email`, `profile`, `gmail.modify` (read, label, archive, trash), `gmail.send`, `contacts.readonly` or directory read (suggestions). Later: `drive.file`. Avoid the broad `mail.google.com` scope. |
| 5 | Create OAuth client: **Web application** | Credentials | Authorised JavaScript origins and redirect URIs: `https://pivot-mail-web.vercel.app` (plus the custom domain later, plus `http://localhost:5173` for development). |
| 6 | Put the client **secret** in Vercel environment variables, never in chat or the repo | Vercel → pivot-mail-web → Settings → Environment Variables | Share only the Client ID with me. |
| 7 | Allow the app for staff | Admin console → Security → API controls → App access control | Mark Pivot Mail as trusted if third-party access is restricted. |
| 8 | Shared mailboxes (ops@, ticketing@) | Decision | Today they use a shared login. Options: (a) staff sign in to the shared account themselves, (b) Gmail delegation, (c) a service account with domain-wide delegation (strongest, needs admin approval and a careful scope list). Recommendation: (b) delegation, because it keeps individual audit trails. |
| 9 | Pub/Sub topic and push subscription (phase 4) | Cloud Pub/Sub | Grant publish rights to `gmail-api-push@system.gserviceaccount.com`. Endpoint: a Vercel serverless function. |
| 10 | Pick the first-sync window | Decision | 90 days, 1 year or everything. Affects first-load time and local storage. |
| 11 | Send me | Hand-over | Client ID, the final domain, the Workspace layout answer (step 0), the shared-mailbox choice (step 8), the sync window (step 10). |

## B. Route map

| Phase | Goal | What gets built | Needs from you | Done when |
|-------|------|-----------------|----------------|-----------|
| 0 ✅ | UI preview | Whole interface on sample data: list, reading pane, threads, composer, search, multi-select, folders, cases, templates, colours, shortcuts, problem states, reference generator (preview) | n/a | You approve the UI |
| 1 | Real login | Google sign-in, serverless token exchange on Vercel, session cookie, company-domain allow-list, admin vs staff role | Checklist steps 0 to 7 | Staff sign in with Workspace accounts; non-staff get "Access denied" |
| 2 | Read-only mail | First sync, labels as folders, threads, attachments on demand, local index (IndexedDB) for instant search, HTML viewer on real mail | Step 10 | Your real inbox opens fast and search is instant |
| 3 | Write actions | Send, reply, forward, drafts autosave synced, read/flag/archive/delete/move/labels, undo, offline queue | None | Everything done in the app shows in Gmail and back |
| 4 | Fast sync | `historyId` incremental sync, Pub/Sub push, real offline/expired/rate-limit states, desktop notifications and unread badge | Step 9 | New mail arrives within seconds; sync failures recover by themselves |
| 5 | Pivot features | Postgres for roles, case metadata, performance analytics (admin only); real Reference Generator against Pivot OS; Drive attachments | Pivot OS API access; Travel and Shipping number rules confirmed | Cases auto-file from references; admin analytics show real activity |
| 6 | Hardening | Security review (HTML sanitiser, OAuth, storage), accessibility and keyboard audit, backups, pilot with 3 staff for 2 weeks | Pilot users | No blocking issues from the pilot |
| 7 | Rollout and desktop | Roll out to all staff on the web; then Tauri or Electron wrapper, code-signing, auto-update | Apple and Windows developer accounts (⚠️ verify current costs) | Installers for Windows and Mac |

### Multiple accounts (design)
- An **account** is one Google sign-in (a person or a shared mailbox) on one of the two domains. A **mailbox** is what shows in the sidebar.
- "Add account" opens Google sign-in for the matching company; the token is stored per account, server-side and encrypted, and the sidebar gains that mailbox.
- Only `@pivottmc.com` and `@pivotscl.com` addresses are accepted. Remove account signs out and deletes that account's local copy.
- Shared mailboxes are added the same way (delegation, or signing in to the shared account).

### Rules that run through every phase
- Message bodies stay on the device; the server holds only account, role, case and analytics metadata.
- Each phase ships to the live site behind a preview flag, so the sample-data preview stays available until phase 3 is trusted.
- Deleting mail uses Gmail Trash (recoverable) and is never permanent by default.

### Open decisions
1. ~~One or two Workspace organisations~~ Decided: two (pivottmc.com, pivotscl.com), two Internal projects.
2. Shared-mailbox method (step 8).
3. First-sync window (step 10).
4. Reference number rules: digit count and year for PS and PT, confirmed with Pivot OS.


## Phase 1 status: real sign-in (built, waiting for the first live test)
- Server: `web/api/auth/*` (Vercel functions): `start`, `google/callback`, `session`, `logout`, `config`. Authorization-code flow with PKCE, state and nonce; the Google client secret never reaches the browser.
- Checks before anyone enters: Google's `hd` claim and the email domain must both match the company; the email must be verified; issuer, audience, nonce and expiry are checked. Each company address uses its own Client ID.
- Session: signed, HttpOnly, Secure, SameSite=Lax, host-only cookie (`__Host-` prefix), 7 days. Role comes from `ADMIN_EMAILS`.
- Sign-in asks only for identity (`openid email profile`). The Gmail and contacts scopes are requested when mailboxes are connected in phase 2, together with encrypted token storage.
- Mail is still sample data after sign-in. The UI says who is signed in; staff cannot reach administrator pages.
- Tests: `npm run test:api` (44 checks against a mocked Google), `npm run check:api` (types).
- ⚠️ Verify with specialist: security review of the sign-in code before staff use it (cookie lifetime, CSRF on future write endpoints, logging).


## Phase 2a status: connecting real mailboxes (built, waiting for the first live test)
- **Add account (real):** the person picks the company and Personal or Shared (shared: administrators only), Google asks for mailbox permission, and the server stores the **encrypted** refresh token in Supabase (AES-256-GCM, key only in Vercel, ciphertext bound to the mailbox address). A personal mailbox must be the signed-in person's own account.
- **Access:** `mailbox_access` links people to mailboxes; every token request checks it. Disabled users are refused at once; roles come from the database (ADMIN_EMAILS bootstraps the first administrators).
- **Gmail key:** the server mints a one-hour access token; the browser calls Gmail directly, so mail never passes through or rests on our server. The sidebar now reads each mailbox's real message count from Gmail.
- **Remove / reconnect:** revokes the permission at Google and deletes the stored token; a revoked permission shows "Reconnect needed".
- Real people see only their own mailboxes (no sample mail). The preview keeps its sample data.
- Tests: `npm run test:api` (93 checks: sign-in provisioning, connect rules, encryption, token minting, disconnect).
- **Next (phase 2b):** read-only mail: first sync (90 days), local index, message list and reading pane from Gmail, then older mail by live Gmail search.
