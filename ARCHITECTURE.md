# Pivot Mail — Architecture

Internal Google Workspace mail client for Pivot staff.
Phase 1: web app (PWA). Phase 2: same codebase wrapped as a desktop app (Tauri preferred, Electron fallback).

## Decisions

| Area | Decision | Reason |
|---|---|---|
| Audience | Internal only (Pivot Workspace domain) | OAuth user type "Internal": no Google verification / CASA |
| Client | Vite + React + TypeScript SPA (`web/`) | Static build drops straight into Tauri/Electron; no SSR dependency |
| Mail API | Gmail API (REST) — not IMAP | Incremental sync via `historyId`, native labels, fewer sync conflicts |
| Sync model | Incremental: `users.history.list` from last `historyId`; full resync only on `404` (expired history) | Core fix for sync reliability |
| Push | Gmail `watch` → Cloud Pub/Sub → small relay → client | Real-time updates without polling |
| Local cache | IndexedDB (web) → SQLite (desktop) behind one storage interface | Offline reading, fast search |
| Auth | OAuth 2.0 Authorization Code + PKCE | Works for web now and desktop (loopback redirect) later |

| Case database | Postgres (e.g. Supabase) holding cases, references, status, owner, atomic counters | Confirmed in discovery; see `REQUIREMENTS.md`. Message bodies stay on-device (⚠️ confirm) |
| Reference Generator | Server-side, transactional counter per prefix; client never generates IDs | Uniqueness under concurrency |
| Case linking | Reference regex → else Gmail `threadId` → else new case; dedupe on `Message-ID` | Auto-match by reference |
| Drive | Drive API, per-reference case folders | v1 integration |
| UI | Outlook-like three-pane, mobile-first collapse | Confirmed |

Requirements, scope and open questions live in `REQUIREMENTS.md`.

## Desktop-ready rules (apply from day one)

1. No browser-only APIs outside `src/platform/` — wrap storage, notifications, file save, deep links behind interfaces.
2. No server-side rendering; app must run from static files.
3. Relative asset paths; no hard-coded origin URLs (config via env).
4. Auth redirect URI configurable (web URL now, `http://127.0.0.1:<port>` loopback for desktop).
5. Keyboard-first UX; no reliance on browser chrome (back button, tabs).

## Open items

- ⚠️ Data residency: confirm whether mail content may be cached server-side or must stay on-device only. Default until confirmed: **on-device only**; relay forwards change notifications (historyId), never message bodies.
- Google Cloud project + Internal OAuth consent screen (Workspace admin required).
- Hosting target for static app + relay.

## Phase 1 hosting and security (confirmed: Vercel)
- Static SPA on Vercel; serverless functions only for OAuth code exchange, token refresh, and Pub/Sub push relay.
- No message bodies pass through or persist on the server. No body logging.
- Refresh tokens encrypted at rest, per user.
- Shared mailboxes: see `REQUIREMENTS.md` Risks (⚠️ shared password is not recommended).

## Analytics / admin (requirements in `REQUIREMENTS.md`)
- Client sends lightweight events (session start, heartbeat every ~30 s while active, session end) with signed-in user ID; stored in the Postgres DB (metadata only).
- Sent/received counts come from Gmail API metadata aggregation (server job, daily), not message bodies.
- `/admin/performance` route + API protected by server-side role check; roles table (`admin`, `staff`).
- Cases-opened metric activates when Phase 2 case DB exists.

## Speed architecture (see `REQUIREMENTS.md`)
- Sync engine runs in a Web Worker (later: Rust/Tauri side), writes to local store; UI reads only from local store (never waits on network).
- Search: local FTS index + Gmail-operator parser; remote fallback merged by `Message-ID`.
- Optimistic mutations queue (archive, label, colour, read) with retry and conflict resolution against `historyId`.
- Templates and colour rules are Pivot Mail data (DB); colours mirrored to Gmail labels.
- Context menus, drag/drop and clipboard live behind `src/platform/` so desktop can swap in native implementations.

## Brand assets
- Source logo: `brand/logo-original.png` (supplied). Web cuts with transparent background live in `web/src/assets/brand/` (`logo-lockup.png`, `logo-mark.png`) and favicons in `web/public/`.
- Brand colours sampled from the logo: navy `#162328`, green `#02b789` (tokens `--brand-navy`, `--brand-green`). Green on white is ~2.6:1, so it is for fills and graphics, not text. UI accent is still system blue.
- Raster logo is 1309 px wide: fine for the toolbar and sign-in. A vector (SVG) version is needed for large print or very large displays.
