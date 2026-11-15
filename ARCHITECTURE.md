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
