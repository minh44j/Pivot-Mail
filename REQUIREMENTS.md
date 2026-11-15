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

## Open questions
1. ⚠️ Pivot Travel Management reference form: prefix, fields, format. Also confirm yearly reset, timezone, and how to read the current Pivot OS counter and history for migration.
2. ⚠️ Data residency: DB now stores case metadata. Do message bodies stay on-device only? (Default: yes.)
3. Shared mailbox method: Workspace delegation, Google Group collaborative inbox, or separate accounts?
4. Case lifecycle: statuses (open/pending/closed), ownership, and who may create/merge/split.
5. Drive: one root folder per company, with a subfolder per reference?
