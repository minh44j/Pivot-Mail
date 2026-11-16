-- Linter fixes from the first security check.
alter function public.set_updated_at() set search_path = '';
-- rls_auto_enable is Supabase's own event trigger (it turns row level security on for new tables); it must not be callable through the public API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
