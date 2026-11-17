# Database (Supabase project "Pivot Mail")

Project: `acqsbzpynpuqzhzikxoj` · `https://acqsbzpynpuqzhzikxoj.supabase.co` · region ap-south-1 (Mumbai). The first project in Sydney was deleted and replaced; both migrations were re-applied and the security advisor shows only the intended notices.

Migrations are plain SQL in `migrations/`, applied in order. They are already applied to the live project; keep them here so the database can be rebuilt (for example in another region).

| File | What it does |
|---|---|
| `0001_init.sql` | Users, connected mailboxes, encrypted Google tokens, mailbox access, audit log. Row level security on, nothing readable by the public API roles. |
| `0002_harden_functions.sql` | Fixes from the security advisor. |

Only the server (Vercel functions) reads or writes these tables, using the project's secret key. Never put that key in the browser or the repo. No message bodies are stored here.

| File | What it does |
|---|---|
| `0003_cases.sql` | Shared cases (reference, client, details, notes, status) and the atomic provisional number counter (`next_case_ref`, starts at 90001 each year, PS and PT series). |
| `0004_activity.sql` | Active minutes (one row per minute in use, server time), daily mail counts reported by each person's browser, and `performance_report()` for the administrator's page. |
| `0005_user_title.sql` | A job title per person, shown under the name in the top bar. |
