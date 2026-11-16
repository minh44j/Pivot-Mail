# Pivot Mail — Requirements (discovery log)

Status: DRAFT. Items marked ⚠️ are unconfirmed.

## Why
- Replace Outlook-on-Google-Workspace for Pivot Travel Management + Pivot Shipping staff.
- Primary problems: **sync issues, speed, workflow gaps**, plus integrated productivity tools.

## Objectives
1. Reliable sync: no missing/duplicated mail, labels, or read-state (incremental `historyId` sync, idempotent writes).
2. Speed: instant open/search from local cache; fast cold start.
3. Workflow: every business email lives in a **case** with a unique **reference**.
4. Familiar UX for Outlook users (low migration friction).
5. Internal only, under 25 staff, Pivot Workspace domain.

## Phasing (confirmed)
- **Phase 1 (now): core mail** — auth, sync, read/send/reply/forward, labels/search/filters, multiple accounts/shared mailboxes, Outlook-like UI.
- **Phase 2 (later, set up in Pivot OS first): Reference Generator, case folders, Drive.** Designs below are kept for reference; do not build yet. Keep hooks in architecture (ribbon slot, case-label namespace `Cases/`).

## v1 scope (mandatory)
| # | Feature | Notes |
|---|---|---|
| 1 | Read, send, reply, forward | Rich-text composer, attachments |
| 2 | Labels, search, filters | Gmail labels as folders; full-text search on local cache |
| 3 | Multiple accounts / shared mailboxes | e.g. shared ops/ticketing addresses, both companies |
| 4 | In-house **Reference Generator** | Format ⚠️ to be defined by Minh |
| 5 | **Case-wise email folders** | One case folder per reference |
| 6 | Google Drive integration | Attachments/documents saved into case folders |

Out of scope for v1: Calendar, Contacts, AI assist, itinerary/shipping-doc automation (revisit v2).

## Case + reference rules (confirmed)
- Matching: **auto-match by reference**. A reference in subject/body links a message to its existing case; mail with no known reference starts a new case.
- Storage: **own database + Gmail labels**. DB holds cases, status, owner, counters. A Gmail label (`Cases/<REF>`) mirrors each case so Gmail stays consistent.
- Reference format: observed from Pivot OS screenshot, last issued `PS2600874` (Shabija Althaf). ⚠️ Inferred, unconfirmed: `PS` + `26` (year) + `00874` (5-digit sequence). Generator must be: unique, never reused, atomic under concurrent users, parseable by regex.

> **Status (UI preview built):** the popup exists in the web app (toolbar "Ref no."), but it uses a **mock counter stored in the browser** (starts at 90000, so preview numbers cannot collide with real ones) and shows a "Preview only" banner. It does not talk to Pivot OS. Real counter, client master, port list and salesperson list come from Pivot OS later. Travel Management form not built (form not provided yet).

## Reference Generator (in-mail popup) — replaces the Pivot OS trip
Today: staff leave the mailbox, open **Pivot OS → Reference Generator**, enter details, get a number. Pivot Mail brings this into a **ribbon button → popup**.

**Popup fields** (mirror Pivot OS Pivot Shipping form):
| Field | Type | Rules |
|---|---|---|
| Client | Autocomplete (company) | Required; must match client master list |
| What are we handling | Single choice: Freight + clearance / Freight only / Clearance only | Required |
| Moves by | Single choice: Sea / Air / Land | Required |
| Route From / To | Autocomplete, standard port names | Required; validate against standard port list (UN/LOCODE ⚠️ confirm) |
| Cargo & notes | Optional text (e.g. "2×40HQ machinery, ~46 CBM") | Optional |
| Salesperson | Single choice (avatar chips) | Required |

**Actions:** `Open job & generate number` → shows reference → **Copy reference** and **Copy subject** buttons (subject = `[<REF>] <client> – <from> → <to>` ⚠️ subject template to confirm). Footer shows "last issued" (reference + who).

**Rules**
- **Decision (confirmed): Pivot Mail replaces the Pivot OS generator and becomes the sole issuer.** Format confirmed as `PS` + YY + 5-digit sequence (e.g. `PS2600874`).
- Cutover plan (must not skip): (1) read the current Pivot OS counter at cutover; (2) freeze Pivot OS generator (read-only); (3) seed Pivot Mail counter at last issued + 1 (`PS2600875` if 874 is still the latest); (4) import historical references so none can be reissued; (5) keep Pivot OS as read-only lookup until verified. Running both generators in parallel is forbidden (duplicate risk).
- Counter rules: one counter per prefix + year; transactional increment; gaps allowed, reuse never; yearly reset at 1 Jan ⚠️ confirm; `YY` taken from server date in Pivot's timezone ⚠️ confirm timezone.
- Both companies supported. Pivot Shipping form is defined above; ⚠️ Pivot Travel Management form, prefix and fields not yet provided.
- Generate button disabled until required fields valid; double-click safe (idempotency key per submit).
- Creating the reference also creates the case record and the `Cases/<REF>` Gmail label.
- Pivot Travel Management uses a different form/format. ⚠️ Not yet provided.
- Popup must work from compose, reading pane, and a blank mailbox state.

### Edge cases to design for
- Reply with edited/stripped subject → fall back to Gmail `threadId` match.
- Forwarded mail carrying a reference → ask staff: link to case or open new case.
- Two references in one thread → flag for manual resolution; never auto-merge silently.
- Reference typo / unknown reference → treat as new case, flag.
- Same message visible in several shared mailboxes → one case, deduplicate on RFC `Message-ID`.
- Label/DB drift (label removed in Gmail) → reconcile job; DB is source of truth for case membership.

## UI (confirmed: Outlook-like)
- Three panes: folder/case tree | message list | reading pane; command bar/toolbar on top.
- Case tree sits beside Gmail labels; reference visible in list rows and reading header.
- Mobile-first responsive: panes collapse to single-column navigation on small screens.
- Keyboard shortcuts, density options, accessible contrast.

## Speed and productivity requirements (core UX principle)
Speed is the main product differentiator. Every design choice is judged against it.

| # | Requirement | How (proposed) | Phase |
|---|---|---|---|
| 1 | **Ultra-fast sync** | Initial sync newest-first (UI usable after first page); then incremental `history.list`; push via `watch` + Pub/Sub; batched `messages.get` (metadata first, bodies lazy); retries with backoff; respect Gmail quota (⚠️ verify per-user limits) | 1 |
| 2 | **Attachments on top (Outlook-style)** | Attachment chips shown above the message body in the reading pane, plus paperclip/preview chips in list rows; metadata from message parts, so no download needed to display | 1 |
| 3 | **Gmail-native search speed** | Local full-text index (IndexedDB now, SQLite FTS later) for cached mail; support Gmail operators (`from:`, `to:`, `has:attachment`, `before:`, `label:`); fall back to Gmail API search for older mail, merged into one result list | 1 |
| 4 | **Case-wise classification** | Case tree shows all emails under a case reference | 2 |
| 5 | **Drag/drop + multi-select attachments + clipboard + right-click actions** | Drag files into composer; marquee/Shift/Ctrl select of attachments; Copy; custom context menu (Open, Save, Copy, Save to Drive, Forward, Attach to new mail). ⚠️ Browser limits: dragging files *out* to the desktop works in Chromium only; copying files to the clipboard is limited (images yes, arbitrary files mostly no). Full support arrives with the desktop wrapper | 1 (web subset) / desktop later |
| 6 | **Built-in templates** | Categories: quotes, client onboarding, marketing, follow-up, etc.; variables (`{{client}}`, `{{sender}}`); insert via ribbon button or `/` shortcut; personal + shared templates; admin manages shared set. Stored in DB (not in Gmail) | 1 |
| 7 | **Colour highlighting** | Colour rules/flags on messages (Outlook "categories" style). Gmail has no per-message colour, so implement as coloured Gmail labels (syncs across devices) ⚠️ confirm vs. local-only colours; optional auto-rules (sender/subject → colour) | 1 |
| 8 | **Maximum Outlook-like structure** | Ribbon (Home/View tabs), folder pane with Favourites, list with sort/group headers (Today/Yesterday), reading pane right/bottom toggle, compact density, Outlook keyboard shortcuts | 1 |

### Performance budgets (proposed ⚠️ confirm; measure in CI)
| Action | Target |
|---|---|
| Cold start to usable inbox (cached) | < 2 s |
| Open message from cache | < 100 ms |
| Local search results | < 150 ms for 100k messages |
| New mail appears after arrival (push) | < 3 s |
| Switch folder/label | < 100 ms |
Techniques: list virtualisation, Web Workers for index/sync, optimistic UI (action shows instantly, reconciles after API), prefetch next message bodies, sanitised HTML rendering in sandboxed iframe.

## Performance Analysis page (admin only — Minh)
Admin-only dashboard inside Pivot Mail. Per-staff metrics:
| Metric | Definition (proposed) | Data source | Phase |
|---|---|---|---|
| Emails sent | Messages sent by the person (via Pivot Mail or Gmail) in period | Gmail API (SENT label, From) + Pivot Mail send log | 1 |
| Emails received | Messages delivered to the person's mailbox in period; exclude spam/trash | Gmail API (INBOX, date) | 1 |
| Cases opened | Cases whose reference was generated by the person | Case DB (`created_by`) | 2 (needs Reference Generator) |
| Average use time | Mean daily *active* time: tab/app focused AND input within last 60 s (⚠️ confirm idle threshold) | Client heartbeat events | 1 |
| First open / last open | Earliest and latest session activity per day (login/first open → last activity) | Session events | 1 |

**Page:** date range (today / 7 / 30 days / custom), staff table with sortable columns, per-person daily detail, export CSV. Mobile-first: table collapses to cards.

**Rules**
- Access: **admin role enforced server-side** (API returns 403 for non-admins; hiding the menu is not security). Single admin: Minh ⚠️ define backup admin.
- Store metrics and event timestamps only — **never message content**.
- Attribution requires **individual logins**. With a shared password/mailbox, sent/received cannot be attributed to a person; Pivot Mail must record the signed-in staff identity on every send.
- Day boundaries and "first/last open" use Pivot's timezone ⚠️ confirm; shared mailboxes counted separately from personal mailboxes.
- Edge cases: multiple tabs/devices (merge intervals, no double-count); laptop sleep (heartbeat gap > threshold ends the session); crash/closed without logout (last heartbeat = end); clock skew (use server time); auto-generated/bounce mail excluded from counts ⚠️ confirm.
- ⚠️ **Employee monitoring law and privacy**: staff should be informed in writing; jurisdiction-specific rules apply (e.g. UAE, India, EU/GDPR). Verify with legal specialist before launch. Avoid using active time as sole performance measure.

## Phase 1 decisions (confirmed)
- Shared mailboxes today use a **shared password/login**. Workspace admin = Minh (can create Internal OAuth app, grant scopes).
- Hosting: **Vercel** (static SPA + small serverless functions for OAuth token exchange / push relay).
- Outlook parity in v1: **conversation threading toggle**, **drafts autosave + per-account signatures**, **desktop notifications + unread badges**. Not in v1: focused/priority sorting (pin/flag/sort by sender may follow).

## Risks (Phase 1)
| Risk | Detail | Mitigation |
|---|---|---|
| Shared password login | No per-user audit trail; password sharing; 2FA/verification codes tied to one person; Google may flag concurrent sign-ins | ⚠️ Recommend migrating shared mailboxes to **delegated access** or a **Google Group collaborative inbox**; treat each shared mailbox as an account in Pivot Mail |
| Gmail API and delegation | Delegates cannot use their own OAuth token to read another user's mailbox via the API; a service account with domain-wide delegation can, but it is highly privileged | ⚠️ Verify with Google docs/specialist. If used: keep key server-side only, restrict scopes, log every access |
| Vercel and mail data | Serverless functions must not log or persist message bodies | Bodies stay in browser cache; functions handle tokens/notifications only |
| Token storage | Refresh tokens are long-lived secrets | Encrypt at rest, server-side only, per-user, revocable |

## Open questions
1. ⚠️ Pivot Travel Management reference form: prefix, fields, format. Also confirm yearly reset, timezone, and how to read the current Pivot OS counter and history for migration.
2. ⚠️ Data residency: DB now stores case metadata. Do message bodies stay on-device only? (Default: yes.)
3. Shared mailbox method: confirm migration from shared password to delegation or Google Group (see Risks).
4. Case lifecycle: statuses (open/pending/closed), ownership, and who may create/merge/split.
5. Drive: one root folder per company, with a subfolder per reference?


## UI build status (preview, sample data)
Built: sign-in, Outlook-style three-pane mail with multi-mailbox sidebar, rich-text composer (formatting, links, lists, Bcc, signature, templates at cursor), message context menu and drag to folder, sync status, Reference popup (mock counter), admin Staff performance page, Settings (general, signatures, templates, colour categories).
Not built: Google sign-in and Gmail sync, safe HTML message viewer, search suggestions, case folders, Drive, real analytics collection, server-side roles.

## Threading and reply format (confirmed direction)
- **Threads:** Gmail `threadId` is the key. A reply must carry the same `threadId` plus `In-Reply-To` and `References` headers and keep the subject (`Re: …`), or Gmail starts a new thread. ⚠️ Verify against Gmail API docs before building send.
- **List:** one row per conversation (newest message, count badge, unread if any unread). Toggle in View menu.
- **Reading pane:** all messages of the thread, oldest first, newest expanded; each has its own sender, To, Cc and date, separated by a rule.
- **Reply / Reply all / Forward:** Reply goes to the sender; Reply all adds everyone on To and Cc except you; Forward starts a new message with the attachments. Subject gets `Re:` / `Fwd:` once.
- **Quoted original (Outlook style, no side bar):** new text first, then signature, then a rule, then a header block (From, Sent, To, Cc, Subject), then the original text. Implemented in the composer (`data-quote` block).
- Later: collapse long quoted history in the reading pane ("show trimmed content"), needs the safe HTML viewer.

## Keyboard shortcuts (built)
Outlook-style shortcuts for search, list navigation, delete/archive/undo, read/flag/category, reply/forward, go-to and move-to folder, composer, and a help dialog (Ctrl+/ or ?). List in `web/src/shortcuts.ts`. Browser-reserved keys (Ctrl+N/T/W) need the desktop wrapper; N and Ctrl+Shift+M are the web alternatives. Forward is Ctrl+J because Ctrl+F is search. ⚠️ Confirm any Outlook shortcuts that differ for your team before the desktop version.

## Smart categories (built, optional)
Filter chips above the message list: Unread, Important, Follow up, Attachments, Today. They are views over the open folder (not folders), combine with AND, and can be switched off in Settings. Important is a per-conversation mark (Ctrl+Shift+1 or right-click); Follow up = flagged. ⚠️ Confirm whether Important should later be suggested automatically.

## Message row design (current)
Sender bold when unread; subject medium weight; preview muted grey; time right aligned; small green dot for unread; flag, important mark, attachment and colour dot shown only when they apply; Delete, Archive, Flag, Read/Unread and More appear only on hover or keyboard focus (hidden on touch screens; the reading pane has Delete, Flag and Read/Unread there).

## Attachments (built, sample files)
Each attachment shows a type icon (PDF, spreadsheet, Word, presentation, HTML, image, archive, text, email) and Preview, Copy and Download buttons; the bar has Download all (one zip) and Download selected. Preview opens PDFs, images and text; other types offer Download. Copy puts PNG images on the clipboard; other types copy the file name only because browsers block file copying (desktop wrapper removes this limit). Icons are original, not vendor logos. Real file bytes come from Gmail later; files here are generated samples.

## Copy email
Right-click a conversation, then Copy email (or Ctrl+C with a message selected and nothing highlighted). Pasting into the composer inserts the From/Sent/To/Cc/Subject block and text, with no side bar; other apps get text/html and text/plain.

## Safe HTML viewer and trimmed history (status: built in preview)
- HTML mail is rebuilt from an allow-list (`web/src/mailhtml.ts`), shown in a sandboxed iframe with a CSP (no scripts, forms or network except https images).
- Remote images are blocked until "Load images" is pressed (tracking protection). Links open in a new tab; non-http(s)/mailto/tel links are removed; links whose text shows a different host are outlined.
- Quoted history (blockquote, Gmail quote, Outlook From/Sent block, "On … wrote:", ">" lines) is folded behind "Show trimmed content".
- ⚠️ Verify with specialist: a security review of the sanitiser is advised before real mail is connected.

## Search suggestions and filters (status: built in preview)
- Dropdown under the search box: recent searches (last 8), saved searches (removable), operator suggestions (from:, to:, subject:, label:, has:attachment, is:unread, is:flagged) and contact suggestions after from:/to:.
- Operators in the query show as removable filter chips above the list.
- Scope toggle: This folder / All folders (all folders excludes Deleted Items, current mailbox only).
- Recent and saved searches are stored per browser (`pm.recent`, `pm.saved`); they will move to the user profile with the real backend.

## Folder management (status: built in preview)
- Custom folders are per mailbox: New folder, Rename, Delete (confirmation), drag to reorder, or Move up/down from the folder menu (right-click or ⋯).
- Rename updates the label on all messages; delete removes only the label, never mail. Names: 1–40 characters, unique per mailbox, no `, / \`, system names reserved.
- Stored per browser (`pm.folders`) for now; Gmail labels will back this when sync is connected. ⚠️ Verify: Gmail uses "/" for nested labels, so nesting is a later decision.

## Problem states (status: built in preview)
- Slim banner under the toolbar: Offline (sending waits, reading and organising continue), Sync failed (Retry), Rate limited (30 s countdown, Retry now).
- List load error with Retry. Full-screen Session expired (Sign in again) and Access denied (Use a different account).
- Settings → Problem states simulates each one for review. Real triggers (network, Gmail API 401/403/429) arrive with the sync layer.
- ⚠️ Verify: Gmail API quota and error codes against Google's current documentation when the sync layer is built.

## Case form and case folders (status: built in preview)
- Reference number dialog has Pivot Shipping and Pivot Travel tabs. Travel: client, category (Flight, Visa, Hotel, Chauffeur, Extra), notes. Format `PT` + year + 5 digits (e.g. PT2600000 pattern); subject `[PT26xxxxx] Client – Category`.
- Preview counters are per browser and start at 90000 (not the company counter; real numbering stays in Pivot OS). ⚠️ Verify: the digit count and year rule with Pivot OS before go-live.
- Cases appear under each mailbox automatically from the reference in the subject (PS or PT). A case shows every message of that mailbox carrying the reference, in any folder except Deleted Items. Ctrl+Y also finds cases.
- Row styling: plain full-width hover (no rounded corners), tick box centred and smaller.

## Add and remove accounts (status: built in preview, mock sign-in)
- Sidebar "Add account": choose the company (pivottmc.com or pivotscl.com), enter the Google address, choose Personal or Shared mailbox. Other domains, wrong-company domains and duplicates are refused with a clear message.
- Remove account (hover the mailbox header, ⋯): deletes the local copy only; Google is untouched. At least one account must remain.
- Preview stores the account list in the browser (`pm.accounts.added`, `pm.accounts.removed`). Real sign-in and encrypted server-side tokens arrive in roadmap phase 1.

## Daily-use batch (status: built in preview)
- **Drafts:** anything typed and closed is kept in Drafts (blank mail leaves nothing). Open a draft with double-click, Enter or "Continue editing". Sent mail appears in Sent.
- **All inboxes:** one combined, mailbox-tagged inbox at the top of the sidebar (Ctrl+Y → "All inboxes"). Replies come from the mailbox the message arrived in.
- **Folder tools:** "Mark all as read" (undo with Ctrl+Z) and "Empty folder" for Deleted Items (confirmation, permanent).
- **Reader More menu:** copy subject, print or save as PDF (Ctrl+P), open in new window (also double-click), show original (headers are simulated in the preview), move, mark, flag.
- **Undo send:** sending is held for 0/5/10/20/30 s (Settings → General, default 10 s) with an Undo bar. ⚠️ Preview only: closing the tab during the delay loses the message; the real version holds it server-side.
- **Send later:** presets or a custom time, Scheduled folder, Cancel send returns it to Drafts, sent automatically when due.
- **Snooze and follow-up:** Snooze… returns mail to the Inbox as unread; Follow up… sets a due date (overdue shows red; Mark complete clears it). Times use the device time zone. ⚠️ Verify: business-hours defaults (08:00 / 17:00) with staff.
- **Fixes found while testing:** composer recipient chips no longer wrap; Ctrl+Y works from the search box; folder jump matches several words.
