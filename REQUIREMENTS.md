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
- Reference format: ⚠️ undefined. Generator must be: unique, never reused, atomic under concurrent users (DB sequence/transaction per prefix), parseable by regex.

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
1. ⚠️ Reference format and rules (company/department codes, sequence reset, separators).
2. ⚠️ Data residency: DB now stores case metadata. Do message bodies stay on-device only? (Default: yes.)
3. Shared mailbox method: Workspace delegation, Google Group collaborative inbox, or separate accounts?
4. Case lifecycle: statuses (open/pending/closed), ownership, and who may create/merge/split.
5. Drive: one root folder per company, with a subfolder per reference?
