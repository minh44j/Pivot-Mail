-- Cases: one record per job, shared by the company's staff. Emails join a case by the reference in their subject.
-- Numbers issued here are PROVISIONAL (they start at 90001 each year) until Pivot OS numbering is connected.

create table case_counters (
  company text not null check (company in ('scl', 'tmc')),
  year smallint not null,
  last_no integer not null,
  primary key (company, year)
);
alter table case_counters enable row level security;
revoke all on case_counters from anon, authenticated;

-- Next reference for a company: PS/PT + two-digit year + five digits. Atomic, so two people never get the same number.
create or replace function next_case_ref(p_company text) returns text
language plpgsql
set search_path = ''
as $$
declare
  yy smallint := (extract(year from now())::int % 100);
  n integer;
begin
  if p_company not in ('scl', 'tmc') then
    raise exception 'unknown company';
  end if;
  insert into public.case_counters as c (company, year, last_no)
  values (p_company, yy, 90001)
  on conflict (company, year) do update set last_no = c.last_no + 1
  returning c.last_no into n;
  return (case p_company when 'scl' then 'PS' else 'PT' end) || lpad(yy::text, 2, '0') || lpad(n::text, 5, '0');
end $$;
revoke all on function next_case_ref(text) from public, anon, authenticated;

create table cases (
  id uuid primary key default gen_random_uuid(),
  ref text not null,
  company text not null check (company in ('scl', 'tmc')),
  client text not null check (length(client) between 1 and 160),
  kind text not null check (kind in ('shipping', 'travel')),
  details jsonb not null default '{}'::jsonb,
  notes text not null default '' check (length(notes) <= 4000),
  status text not null default 'open' check (status in ('open', 'closed')),
  ref_source text not null default 'provisional' check (ref_source in ('provisional', 'pivot_os')),
  opened_by uuid references app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint cases_ref_format check ((company = 'scl' and ref ~ '^PS[0-9]{7}$') or (company = 'tmc' and ref ~ '^PT[0-9]{7}$')),
  constraint cases_kind_company check ((company = 'scl' and kind = 'shipping') or (company = 'tmc' and kind = 'travel'))
);
create unique index cases_ref_key on cases (ref);
create index cases_company_created_idx on cases (company, created_at desc);
create index cases_opened_by_idx on cases (opened_by, created_at desc);
create trigger cases_updated before update on cases for each row execute function set_updated_at();
alter table cases enable row level security;
revoke all on cases from anon, authenticated;
