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
| 5 ✅ (partly) | Pivot features | Postgres for roles, case metadata, performance analytics (admin only); real Reference Generator against Pivot OS; Drive attachments | Pivot OS API access; Travel and Shipping number rules confirmed | Cases auto-file from references; admin analytics show real activity |
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


## Phase 2b status: real read-only mail (built, waiting for the first live test)
- **What you see:** your real Inbox, Sent, Drafts, Deleted Items, Archive (mail with no Inbox/Sent/Draft/Trash label), Gmail labels as folders, and cases found from references in subjects. Spam is never shown.
- **Loading:** the newest 90 days per folder (each mailbox's window, 90 by default). The list fills in as headers arrive; opening a conversation fetches the full thread. The browser talks to Gmail directly with a one-hour key from our server.
- **Search:** typed searches go to Gmail itself (any age), scoped to the folder, or to all folders with the All folders switch; Gmail operators (from:, to:, subject:, has:attachment, is:unread, label:) work as typed.
- **Attachments:** the paperclip shows in the list before opening; preview, copy and download fetch the real file from Gmail.
- **Local copy:** fetched mail is kept in this browser (IndexedDB, up to 4,000 messages per mailbox) so the list opens instantly and survives a reload; it is deleted on sign-out and when a mailbox is removed.
- **Read-only on purpose:** delete, archive, flag, mark read, move, colours, snooze, follow-up, folders and sending show "Real mail is read-only for now". Nothing is written to Gmail. Opening a message does **not** mark it read.
- **Known limits (interim, until the change-tracking and write phases):** changes made in Gmail itself to mail older than the newest 100 per folder appear after a manual refresh of that folder or a search; inline images inside message bodies show as placeholders; unread counts in the sidebar count loaded mail only; scheduled and snoozed folders do not exist for real mail.
- Tests: `npm run test:api` (126 checks including MIME parsing) and a 41-check browser run against a pretend Gmail (folders, labels, threads, attachment bytes, search, expired key, rate limit, offline cache).
- **Next (phase 3):** write actions: mark read, archive, delete, flag, labels, send, reply, drafts, with undo.


## Phase 3 status: writing to real mail (built, waiting for the first live test)
- **Changes to mail:** open (marks read), mark read/unread, flag (star), important, archive, delete (Trash), move to Inbox/Archive/Deleted Items or a label. Each is shown at once, sent to Gmail, and put back with a message if Gmail refuses. **Ctrl+Z** takes a change back in Gmail too (up to 30 steps). Conversation-level actions use Gmail's thread operations, so a whole conversation moves together as in Gmail.
- **Sending:** send, reply, reply all, forward (with the original's attachments), Cc/Bcc, files you attach, signature. Replies join the conversation (thread id plus In-Reply-To and References). The Undo-send delay applies; if Gmail refuses, the message opens again exactly as written. A send is never repeated automatically after a server error (it might have gone out).
- **Drafts:** closing the composer saves a Gmail draft (updated, not duplicated, when edited again); Discard deletes it; drafts made in Gmail open for editing.
- **Folders:** new, rename and delete work as Gmail labels (deleting a folder never deletes mail). Gmail has no folder order, so reordering is off.
- **Not possible with Gmail's API or this permission, so switched off for real mail:** Empty Deleted Items (permanent delete needs a broader permission; Gmail empties Trash itself after 30 days), Send later, Snooze, Follow-up dates and Pivot colour categories (they will come back as Pivot features backed by the database).
- **Limits to know:** sending over about 4 MB uses Gmail's upload endpoint (⚠️ verify with a real 10 MB attachment); the 25 MB Gmail limit is checked before sending; drafts are saved when the composer closes, not while typing; "mark all as read" covers the loaded 90 days; marking unread or starring affects the newest message of a conversation, like Gmail.
- Tests: `npm run test:api` (161 checks incl. 30 for building the email) and a 42-check browser run against a pretend Gmail (every action, undo, failure rollback, send with attachment, reply threading, drafts, labels).
- **Next:** fast sync (Gmail change tracking and push) so changes made elsewhere show within seconds, then the Pivot features (cases from the database, performance analytics, Reference Generator link).


## Phase 4 status: fast sync (built, waiting for the first live test)
- **How:** every 15 s while Pivot Mail is open (60 s when the tab is hidden), the browser asks Gmail "what changed since my saved point" (Gmail's history). Quiet checks cost one small call per mailbox. Returning to the window or reconnecting checks at once.
- **What shows within a cycle:** new mail (with a desktop alert if notifications are on, not for mail you sent), mail read/starred/moved/trashed/deleted on your phone or in Gmail, new replies inside the conversation on screen, and Gmail's own Inbox unread number in the sidebar and the app badge.
- **Safe by design:** a change you just made here is not flipped back by an older answer; if Gmail no longer remembers the saved point (after about a week away), the open folder is read again from scratch; after three failed checks a banner with Retry appears and clears itself when Gmail is back, with growing waits meanwhile. The saved point lives with the local copy and is deleted on sign-out.
- **Not real-time push:** the delay is up to about 15 s. True push (Google Pub/Sub into a server function and a live channel to the browser) needs extra Google and server setup and is only worth it if 15 s is too slow in practice. ⚠️ Verify: Gmail's quotas for polling 25 mailboxes against Google's current limits (the load is small: about 4 calls per minute per open mailbox).
- **Fixed on the way:** when a reply arrived, the open conversation closed itself (the row's newest message changed); the conversation now stays selected.
- Tests: 21-check browser run against a pretend Gmail with a change feed (new mail, alerts, read, star, trash, delete, new reply in the open conversation, Gmail unread count, stale-update guard, focus check, expired history, outage and recovery).
- **Pivot features built:** cases stored in the database per company (provisional numbers from 90001 until Pivot OS numbering is connected; existing numbers can be registered; case page with team notes). Administrator performance page on real activity: active minutes (server-recorded heartbeat, only while the app is in use), cases opened (database), mail sent and received (counted in each person's browser from their own mailbox and reported; ⚠️ advisory, can be spoofed; shared mailboxes excluded).
- **Still open:** Pivot OS number integration and PS/PT number rules (⚠️ confirm with Pivot OS owner), Drive attachments, staff notice for activity tracking (⚠️ verify with legal specialist; UAE, India, EU rules differ).

- **Design pass (UI v2):** top bar with search (Ctrl/⌘+K), notifications bell, settings and an avatar menu with a greeting; command bar (Reply, Reply all, Forward, Archive, Delete, Mark as read, Flag, Move to, More, Ref No., Templates); green New mail button; folders hide from the menu button; foldable Cases and Business Workspace groups; message cards with Reply / Reply all / Forward under the message; foldable Details panel (reference, client, category, status, attachments) from the case database; attachment cards with a menu and Download all (n). Left out on purpose: Rules, help, app grid, favourites, Focused/Other, tags, People card, second flag, Junk, Outbox.

- **Pivot OS link (built, off until switched on):** Pivot Mail asks Pivot OS for reference numbers, pick-lists (clients, ports, salespeople) and case facts through signed endpoints added to Pivot OS (branch `claude/pivot-mail-link`). The Ref No. form and the "Reference issued" card now match Pivot OS. See `PIVOT_OS_LINK.md` for the steps to switch it on. ⚠️ Not yet tested against the live Pivot OS.

- **People and access (built):** administrators see everyone who has signed in, switch roles, turn access off or on, and choose which shared mailboxes each person can open (Settings → Users and roles). All rules are kept by the server and written to the audit log. Everyone with a company Google account can sign in and starts as Staff; there is no invite step.
