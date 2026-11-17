-- Job title shown under the person's name in the top bar (set by the person in Settings).
alter table app_users add column if not exists title text not null default '' check (char_length(title) <= 60);
