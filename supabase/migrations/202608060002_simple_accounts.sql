alter table public.users add column if not exists username text;
alter table public.users add column if not exists nickname text;

create unique index if not exists users_username_unique_idx
  on public.users (lower(username))
  where username is not null;

alter table public.users drop constraint if exists users_username_format;
alter table public.users add constraint users_username_format
  check (username is null or username ~ '^[a-z0-9_]{4,20}$');

alter table public.users drop constraint if exists users_nickname_format;
alter table public.users add constraint users_nickname_format
  check (nickname is null or char_length(btrim(nickname)) between 2 and 12);
