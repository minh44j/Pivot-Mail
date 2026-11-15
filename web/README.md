# Pivot Mail — web app

Vite + React + TypeScript SPA. Phase 1 UI shell with **mock data** (no Google connection yet).

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build
npm run lint
```

Structure
- `src/platform/` — all browser-specific code (storage, clipboard, notifications, badge). Swap for desktop later.
- `src/components/` — Ribbon, FolderPane, MessageList (virtualised), ReadingPane, AttachmentBar, Composer.
- `src/data/` — mock messages, templates, colour categories.
- See `../ARCHITECTURE.md` and `../REQUIREMENTS.md`.
