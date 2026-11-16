# Database (Supabase project "Pivot Mail")

Project: `acqsbzpynpuqzhzikxoj` · `https://acqsbzpynpuqzhzikxoj.supabase.co` · region ap-south-1 (Mumbai). The first project in Sydney was deleted and replaced; both migrations were re-applied and the security advisor shows only the intended notices.

Migrations are plain SQL in `migrations/`, applied in order. They are already applied to the live project; keep them here so the database can be rebuilt (for example in another region).

| File | What it does |
|---|---|
| `0001_init.sql` | Users, connected mailboxes, encrypted Google tokens, mailbox access, audit log. Row level security on, nothing readable by the public API roles. |
| `0002_harden_functions.sql` | Fixes from the security advisor. |

Only the server (Vercel functions) reads or writes these tables, using the project's secret key. Never put that key in the browser or the repo. No message bodies are stored here.
