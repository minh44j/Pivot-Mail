-- Pivot Mail: first database schema (phase 1 and 2).
-- Holds only identity, access, connection and audit data. Message bodies are never stored here.
-- Every table is locked to the server (row level security on, no policies, no grants to the public roles).

create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- People who may use Pivot Mail (replaces the ADMIN_EMAILS variable once filled).
create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  company text not null check (company in ('scl', 'tmc')),
  role text not null default 'staff' check (role in ('admin', 'staff')),
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_lower check (email = lower(email)),
  constraint app_users_email_domain check (
    (company = 'scl' and email like '%@pivotscl.com') or (company = 'tmc' and email like '%@pivottmc.com')
  )
);
create unique index app_users_email_key on app_users (email);
create trigger app_users_updated before update on app_users for each row execute function set_updated_at();

-- A Google mailbox connected to Pivot Mail (a person's own mailbox or a shared one such as ops@).
create table mail_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null default '',
  company text not null check (company in ('scl', 'tmc')),
  kind text not null default 'personal' check (kind in ('personal', 'shared')),
  status text not null default 'active' check (status in ('active', 'needs_reconnect', 'disabled')),
  -- how much mail is indexed on the device: 90 days by default, up to 365 (older mail is searched live in Gmail)
  sync_window_days integer not null default 90 check (sync_window_days between 30 and 365),
  created_by uuid references app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_accounts_email_lower check (email = lower(email)),
  constraint mail_accounts_email_domain check (
    (company = 'scl' and email like '%@pivotscl.com') or (company = 'tmc' and email like '%@pivottmc.com')
  )
);
create unique index mail_accounts_email_key on mail_accounts (email);
create trigger mail_accounts_updated before update on mail_accounts for each row execute function set_updated_at();

-- Google refresh tokens. The token is encrypted by the server (AES-256-GCM) before it is written; the key is never in the database.
create table mail_tokens (
  account_id uuid primary key references mail_accounts (id) on delete cascade,
  refresh_token_enc text not null,
  key_version integer not null default 1,
  scopes text not null default '',
  granted_by uuid references app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);
create trigger mail_tokens_updated before update on mail_tokens for each row execute function set_updated_at();

-- Who may open which mailbox (a person's own mailbox is added automatically; shared ones are granted by an administrator).
create table mailbox_access (
  user_id uuid not null references app_users (id) on delete cascade,
  account_id uuid not null references mail_accounts (id) on delete cascade,
  granted_by uuid references app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, account_id)
);
create index mailbox_access_account_idx on mailbox_access (account_id);

-- Who did what, mainly on shared mailboxes. Append-only by convention; no personal mail content.
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_email text not null,
  action text not null,
  account_id uuid references mail_accounts (id) on delete set null,
  detail jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on audit_log (at desc);
create index audit_log_account_idx on audit_log (account_id, at desc);

-- Lock everything to the server: row level security on with no policies, and no rights for the public API roles.
alter table app_users enable row level security;
alter table mail_accounts enable row level security;
alter table mail_tokens enable row level security;
alter table mailbox_access enable row level security;
alter table audit_log enable row level security;

revoke all on app_users, mail_accounts, mail_tokens, mailbox_access, audit_log from anon, authenticated;
revoke all on function set_updated_at() from anon, authenticated;
