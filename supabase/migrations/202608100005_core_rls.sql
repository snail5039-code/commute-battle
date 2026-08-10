-- 개인 출퇴근 데이터는 본인만 직접 접근할 수 있게 보호합니다.
-- 관리자 현황은 003의 SECURITY DEFINER RPC를 통해서만 제한적으로 제공합니다.
alter table public.users enable row level security;
alter table public.commute_records enable row level security;
alter table public.badges enable row level security;

drop policy if exists "users read own profile" on public.users;
create policy "users read own profile" on public.users
  for select to authenticated using (id = auth.uid()::text);
drop policy if exists "users create own profile" on public.users;
create policy "users create own profile" on public.users
  for insert to authenticated with check (id = auth.uid()::text);
drop policy if exists "users update own profile" on public.users;
create policy "users update own profile" on public.users
  for update to authenticated using (id = auth.uid()::text) with check (id = auth.uid()::text);

drop policy if exists "users read own commute records" on public.commute_records;
create policy "users read own commute records" on public.commute_records
  for select to authenticated using (user_id = auth.uid()::text);
drop policy if exists "users create own commute records" on public.commute_records;
create policy "users create own commute records" on public.commute_records
  for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists "users update own commute records" on public.commute_records;
create policy "users update own commute records" on public.commute_records
  for update to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
drop policy if exists "users delete own commute records" on public.commute_records;
create policy "users delete own commute records" on public.commute_records
  for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists "users read own badges" on public.badges;
create policy "users read own badges" on public.badges
  for select to authenticated using (user_id = auth.uid()::text);
drop policy if exists "users create own badges" on public.badges;
create policy "users create own badges" on public.badges
  for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists "users update own badges" on public.badges;
create policy "users update own badges" on public.badges
  for update to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

grant select, insert, update on public.users to authenticated;
grant select, insert, update, delete on public.commute_records to authenticated;
grant select, insert, update on public.badges to authenticated;
revoke all on public.users, public.commute_records, public.badges from anon;

-- 주소 등의 민감한 프로필 필드는 숨기고 같은 워크스페이스 구성원의 표시 이름만 반환합니다.
create or replace function public.get_chat_member_profiles(target_user_ids uuid[])
returns table(id text, nickname text, username text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.nickname, u.username
  from public.users u
  where u.id = any(target_user_ids::text[])
    and (
      public.is_chat_platform_admin()
      or exists (
        select 1
        from public.chat_workspace_members mine
        join public.chat_workspace_members target on target.workspace_id = mine.workspace_id
        where mine.user_id = auth.uid()
          and target.user_id = u.id::uuid
      )
    )
$$;

revoke all on function public.get_chat_member_profiles(uuid[]) from public, anon;
grant execute on function public.get_chat_member_profiles(uuid[]) to authenticated;
