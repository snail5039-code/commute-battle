create table if not exists public.chat_direct_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_low::text < user_high::text),
  unique (workspace_id, user_low, user_high)
);

create table if not exists public.chat_direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_direct_threads(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists chat_direct_messages_thread_time_idx on public.chat_direct_messages (thread_id, created_at desc);

create or replace function public.is_direct_thread_participant(target_thread_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.chat_direct_threads where id = target_thread_id and auth.uid() in (user_low, user_high)) $$;

create or replace function public.start_direct_thread(target_workspace_id uuid, target_user_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare low_user uuid; high_user uuid; thread_id uuid;
begin
  if auth.uid() is null or auth.uid() = target_user_id then raise exception '상대방을 선택해 주세요.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 멤버만 개인 채팅을 시작할 수 있습니다.'; end if;
  if not exists (select 1 from public.chat_workspace_members where workspace_id = target_workspace_id and user_id = target_user_id) then raise exception '같은 워크스페이스 멤버가 아닙니다.'; end if;
  if auth.uid()::text < target_user_id::text then low_user := auth.uid(); high_user := target_user_id; else low_user := target_user_id; high_user := auth.uid(); end if;
  insert into public.chat_direct_threads (workspace_id, user_low, user_high) values (target_workspace_id, low_user, high_user)
  on conflict (workspace_id, user_low, user_high) do update set workspace_id = excluded.workspace_id returning id into thread_id;
  return thread_id;
end $$;

alter table public.chat_direct_threads enable row level security;
alter table public.chat_direct_messages enable row level security;
drop policy if exists "participants read direct threads" on public.chat_direct_threads;
create policy "participants read direct threads" on public.chat_direct_threads for select to authenticated using (auth.uid() in (user_low, user_high));
drop policy if exists "participants read direct messages" on public.chat_direct_messages;
create policy "participants read direct messages" on public.chat_direct_messages for select to authenticated using (public.is_direct_thread_participant(thread_id));
drop policy if exists "participants send direct messages" on public.chat_direct_messages;
create policy "participants send direct messages" on public.chat_direct_messages for insert to authenticated with check (author_id = auth.uid() and public.is_direct_thread_participant(thread_id));

grant select on public.chat_direct_threads, public.chat_direct_messages to authenticated;
grant insert on public.chat_direct_messages to authenticated;
grant execute on function public.start_direct_thread(uuid, uuid) to authenticated;
revoke all on public.chat_direct_threads, public.chat_direct_messages from anon;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_direct_messages') then
    alter publication supabase_realtime add table public.chat_direct_messages;
  end if;
end $$;
