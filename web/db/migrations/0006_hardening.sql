-- Security review, 2026-11-18.

-- 1. "Sign out of all devices": sessions are signed cookies, so the server cannot delete them. Instead every session issued
--    before this moment is refused. Set by "Sign out of all devices", and when an administrator turns a person's access off.
alter table app_users add column if not exists sessions_valid_after timestamptz;

-- 2. The audit log is append-only: no update or delete, whoever asks (the server's own key included).
--    Its link to mail_accounts used ON DELETE SET NULL, i.e. removing a mailbox rewrote old audit rows (and would now be refused).
--    The id is kept as plain history instead: the record of what happened to a removed mailbox stays intact.
alter table audit_log drop constraint if exists audit_log_account_id_fkey;
create or replace function audit_log_append_only() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only';
end $$;
drop trigger if exists audit_log_no_change on audit_log;
create trigger audit_log_no_change before update or delete on audit_log for each row execute function audit_log_append_only();
revoke all on function audit_log_append_only() from public, anon, authenticated;

-- 3. Trigger helpers are not callable by the public roles (tidy-up; a trigger function cannot do anything when called directly).
revoke all on function set_updated_at() from public, anon, authenticated;
