create table if not exists public.chat_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_workspace_members (
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 30),
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 50 check (max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists chat_workspace_members_user_idx on public.chat_workspace_members (user_id, joined_at);
create index if not exists chat_channels_workspace_idx on public.chat_channels (workspace_id, sort_order);
create index if not exists chat_messages_channel_time_idx on public.chat_messages (channel_id, created_at desc);
create index if not exists chat_workspace_invites_code_idx on public.chat_workspace_invites (code);

create or replace function public.is_chat_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.chat_workspace_members where workspace_id = target_workspace_id and user_id = auth.uid()) $$;

create or replace function public.is_chat_workspace_admin(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.chat_workspace_members where workspace_id = target_workspace_id and user_id = auth.uid() and role in ('owner', 'admin')) $$;

create or replace function public.create_chat_workspace(workspace_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_workspace_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if char_length(btrim(workspace_name)) not between 2 and 40 then raise exception '워크스페이스 이름은 2~40자여야 합니다.'; end if;
  insert into public.chat_workspaces (name, owner_id) values (btrim(workspace_name), auth.uid()) returning id into new_workspace_id;
  insert into public.chat_workspace_members (workspace_id, user_id, role) values (new_workspace_id, auth.uid(), 'owner');
  insert into public.chat_channels (workspace_id, name, slug, description, sort_order) values
    (new_workspace_id, '전체 공지', 'all-company', '워크스페이스 전체 공지와 소식을 공유합니다.', 0),
    (new_workspace_id, '자유 대화', 'general', '멤버들과 자유롭게 이야기합니다.', 10);
  return new_workspace_id;
end $$;

create or replace function public.create_chat_channel(target_workspace_id uuid, channel_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_channel_id uuid; channel_slug text;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '채널 생성 권한이 없습니다.'; end if;
  if char_length(btrim(channel_name)) not between 2 and 30 then raise exception '채널 이름은 2~30자여야 합니다.'; end if;
  channel_slug := 'channel-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into public.chat_channels (workspace_id, name, slug, description, sort_order)
  values (target_workspace_id, btrim(channel_name), channel_slug, btrim(channel_name) || ' 채널입니다.', 100)
  returning id into new_channel_id;
  return new_channel_id;
end $$;

create or replace function public.create_chat_workspace_invite(target_workspace_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare invite_code text;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '초대 권한이 없습니다.'; end if;
  invite_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.chat_workspace_invites (workspace_id, code, created_by) values (target_workspace_id, invite_code, auth.uid());
  return invite_code;
end $$;

create or replace function public.accept_chat_workspace_invite(invite_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare invite_row public.chat_workspace_invites%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into invite_row from public.chat_workspace_invites
    where code = upper(btrim(invite_code)) and expires_at > now() and use_count < max_uses
    for update;
  if invite_row.id is null then raise exception '유효하지 않거나 만료된 초대 코드입니다.'; end if;
  insert into public.chat_workspace_members (workspace_id, user_id, role)
    values (invite_row.workspace_id, auth.uid(), 'member') on conflict do nothing;
  if found then update public.chat_workspace_invites set use_count = use_count + 1 where id = invite_row.id; end if;
  return invite_row.workspace_id;
end $$;

alter table public.chat_workspaces enable row level security;
alter table public.chat_workspace_members enable row level security;
alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_workspace_invites enable row level security;

drop policy if exists "members read chat workspaces" on public.chat_workspaces;
create policy "members read chat workspaces" on public.chat_workspaces for select to authenticated using (public.is_chat_workspace_member(id));
drop policy if exists "members read workspace members" on public.chat_workspace_members;
create policy "members read workspace members" on public.chat_workspace_members for select to authenticated using (public.is_chat_workspace_member(workspace_id));
drop policy if exists "members read chat channels" on public.chat_channels;
create policy "members read chat channels" on public.chat_channels for select to authenticated using (public.is_chat_workspace_member(workspace_id));
drop policy if exists "members read chat messages" on public.chat_messages;
create policy "members read chat messages" on public.chat_messages for select to authenticated using (public.is_chat_workspace_member((select workspace_id from public.chat_channels where id = channel_id)));
drop policy if exists "members send chat messages" on public.chat_messages;
create policy "members send chat messages" on public.chat_messages for insert to authenticated with check (author_id = auth.uid() and public.is_chat_workspace_member((select workspace_id from public.chat_channels where id = channel_id)));
drop policy if exists "admins read workspace invites" on public.chat_workspace_invites;
create policy "admins read workspace invites" on public.chat_workspace_invites for select to authenticated using (public.is_chat_workspace_admin(workspace_id));

grant select on public.chat_workspaces, public.chat_workspace_members, public.chat_channels, public.chat_messages to authenticated;
grant insert on public.chat_messages to authenticated;
grant execute on function public.create_chat_workspace(text), public.create_chat_channel(uuid, text), public.create_chat_workspace_invite(uuid), public.accept_chat_workspace_invite(text) to authenticated;
revoke all on public.chat_workspaces, public.chat_workspace_members, public.chat_channels, public.chat_messages, public.chat_workspace_invites from anon;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
