-- Activity for the administrator's performance page.
-- Minutes: one row per minute a person actually had Pivot Mail open and was using it (server time, so it cannot be backdated).
-- Mail counts: sent and received per mailbox per day, measured in the person's own browser from Gmail and reported here.

create table activity_minutes (
  user_id uuid not null references app_users (id) on delete cascade,
  minute timestamptz not null,
  primary key (user_id, minute)
);
create index activity_minutes_minute_idx on activity_minutes (minute);
alter table activity_minutes enable row level security;
revoke all on activity_minutes from anon, authenticated;

create table daily_mail_stats (
  user_id uuid not null references app_users (id) on delete cascade,
  account_id uuid not null references mail_accounts (id) on delete cascade,
  day date not null,
  sent integer not null default 0 check (sent between 0 and 100000),
  received integer not null default 0 check (received between 0 and 100000),
  reported_at timestamptz not null default now(),
  primary key (user_id, account_id, day)
);
alter table daily_mail_stats enable row level security;
revoke all on daily_mail_stats from anon, authenticated;

-- One row per active person per day in the range, in the given time zone.
create or replace function performance_report(p_from date, p_to date, p_tz text)
returns table (user_id uuid, name text, email text, company text, day date, sent integer, received integer, cases integer, active_min integer, first_seen timestamptz, last_seen timestamptz)
language sql
stable
set search_path = ''
as $$
  with days as (
    select g::date as day from generate_series(p_from, p_to, interval '1 day') g
  ),
  act as (
    select m.user_id, (m.minute at time zone p_tz)::date as day, count(*)::int as active_min, min(m.minute) as first_seen, max(m.minute) as last_seen
    from public.activity_minutes m
    where m.minute >= (p_from::timestamp at time zone p_tz) and m.minute < ((p_to + 1)::timestamp at time zone p_tz)
    group by 1, 2
  ),
  ms as (
    select s.user_id, s.day, sum(s.sent)::int as sent, sum(s.received)::int as received
    from public.daily_mail_stats s
    where s.day between p_from and p_to
    group by 1, 2
  ),
  cs as (
    select c.opened_by as user_id, (c.created_at at time zone p_tz)::date as day, count(*)::int as cases
    from public.cases c
    where c.opened_by is not null and c.created_at >= (p_from::timestamp at time zone p_tz) and c.created_at < ((p_to + 1)::timestamp at time zone p_tz)
    group by 1, 2
  )
  select u.id, u.name, u.email, u.company, d.day,
         coalesce(ms.sent, 0), coalesce(ms.received, 0), coalesce(cs.cases, 0), coalesce(act.active_min, 0), act.first_seen, act.last_seen
  from public.app_users u
  cross join days d
  left join ms on ms.user_id = u.id and ms.day = d.day
  left join cs on cs.user_id = u.id and cs.day = d.day
  left join act on act.user_id = u.id and act.day = d.day
  where u.status = 'active'
  order by u.name, d.day
$$;
revoke all on function performance_report(date, date, text) from public, anon, authenticated;
