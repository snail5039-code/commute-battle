-- 조직: 부서와 직급 (2026-08-18)
--
-- 지금까지 워크스페이스 안의 사람은 전부 평평했습니다. 근무시간 집계는 전원을 한 줄로
-- 늘어놓을 뿐이라 "개발팀만 보자"가 안 되고, 명단에도 누가 무슨 일을 하는지 안 나옵니다.
--
-- ── 정한 것 ──────────────────────────────────────────────────────────────────
--
-- 1) 부서는 **평면**입니다. 상위 부서(본부 > 팀)를 두지 않았습니다.
--    계층을 넣으면 순환 방지와 재귀 집계가 따라오는데, 지금 그걸로 모델링할 실제 조직이
--    없습니다. 나중에 필요해지면 `parent_id uuid references org_departments(id)`를 추가하고
--    집계를 재귀로 바꾸면 됩니다. 지금 넣으면 쓰지도 않는 복잡도만 남습니다.
--
-- 2) **직급은 권한이 아닙니다.** `rank`는 화면에 늘어놓는 순서일 뿐이고, 무엇을 볼 수 있고
--    무엇을 승인할 수 있는지는 지금처럼 role(owner/admin/member)이 정합니다.
--    이 둘을 섞으면 "부장이니까 남의 근태를 본다" 같은 규칙이 슬금슬금 생기고,
--    그때부터는 권한이 어디서 오는지 아무도 설명하지 못하게 됩니다.
--
-- 3) 근무시간 집계 함수(`get_attendance_summary`)는 **건드리지 않았습니다.**
--    임금이 걸린 계산이라 손댈 때마다 위험합니다. 화면이 이 RPC로 부서를 따로 받아
--    userId로 맞춰 붙입니다. 결과는 같고 위험은 없습니다.
--
-- 4) 부서를 지워도 사람과 기록은 남습니다(배정만 비워집니다). 조직 개편이
--    근태 기록을 지우는 일이 되면 안 됩니다.
--
-- 5) 이름이 `departments`가 아니라 `org_departments`인 이유:
--    **`public.departments`가 이미 있습니다.** 0100001의 부서 채팅 채널 테이블(전체 공지·개발팀 등
--    5행, `department_messages`가 참조)인데, 앱 코드 어디에서도 더는 참조하지 않습니다
--    (채팅은 `chat_channels`/`chat_messages`로 옮겨갔습니다). 죽은 테이블로 보이지만 지우는 건
--    이 작업의 범위가 아니라서 건드리지 않고 비켜 갔습니다.

-- ── 부서 ──────────────────────────────────────────────────────────────────────
create table if not exists public.org_departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (workspace_id, name)
);

create index if not exists org_departments_workspace_idx on public.org_departments (workspace_id, sort_order, name);

alter table public.org_departments enable row level security;
drop policy if exists "members read org departments" on public.org_departments;
create policy "members read org departments" on public.org_departments
  for select to authenticated using (public.is_chat_workspace_member(workspace_id));
revoke all on public.org_departments from anon, authenticated;
grant select on public.org_departments to authenticated;

-- ── 직급 ──────────────────────────────────────────────────────────────────────
-- rank가 낮을수록 위입니다(대표 1, 부장 2, …). 순서를 매기는 값일 뿐 권한이 아닙니다.
create table if not exists public.org_positions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  rank integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (workspace_id, name)
);

create index if not exists org_positions_workspace_idx on public.org_positions (workspace_id, rank, name);

alter table public.org_positions enable row level security;
drop policy if exists "members read org positions" on public.org_positions;
create policy "members read org positions" on public.org_positions
  for select to authenticated using (public.is_chat_workspace_member(workspace_id));
revoke all on public.org_positions from anon, authenticated;
grant select on public.org_positions to authenticated;

-- ── 배정 ──────────────────────────────────────────────────────────────────────
-- 사람과 조직은 1:1입니다(겸직 없음). 겸직을 넣으려면 별도 테이블이 필요한데,
-- 그건 "근무시간을 부서별로 어떻게 나눠 다는가"라는 훨씬 큰 문제를 먼저 풀어야 합니다.
alter table public.chat_workspace_members
  add column if not exists department_id uuid references public.org_departments(id) on delete set null;
alter table public.chat_workspace_members
  add column if not exists position_id uuid references public.org_positions(id) on delete set null;

-- ── 조회 ──────────────────────────────────────────────────────────────────────
-- 부서·직급·구성원 배정을 한 번에 돌려줍니다. 화면이 셋을 따로 부르면 그 사이에 바뀐
-- 배정이 어긋나 보입니다.
create or replace function public.list_org(target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;

  select jsonb_build_object(
    'departments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'sortOrder', d.sort_order,
        'memberCount', (select count(*) from public.chat_workspace_members m where m.department_id = d.id)
      ) order by d.sort_order, d.name), '[]'::jsonb)
      from public.org_departments d where d.workspace_id = target_workspace_id
    ),
    'positions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'rank', p.rank,
        'memberCount', (select count(*) from public.chat_workspace_members m where m.position_id = p.id)
      ) order by p.rank, p.name), '[]'::jsonb)
      from public.org_positions p where p.workspace_id = target_workspace_id
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'userId', m.user_id,
        'nickname', coalesce(u.nickname, u.username, '동료'),
        'role', m.role,
        'departmentId', m.department_id,
        'departmentName', d.name,
        'positionId', m.position_id,
        'positionName', p.name,
        'positionRank', p.rank
      ) order by coalesce(p.rank, 9999), coalesce(u.nickname, u.username, '동료')), '[]'::jsonb)
      from public.chat_workspace_members m
      left join public.users u on u.id = m.user_id::text
      left join public.org_departments d on d.id = m.department_id
      left join public.org_positions p on p.id = m.position_id
      where m.workspace_id = target_workspace_id
    )
  ) into result;

  return result;
end $$;

-- ── 부서 저장·삭제 ────────────────────────────────────────────────────────────
-- target_id가 null이면 새로 만들고, 있으면 그 부서를 고칩니다.
create or replace function public.save_department(
  target_workspace_id uuid, target_id uuid, new_name text, new_sort_order integer default 0
) returns uuid language plpgsql security definer set search_path = public
as $$
declare saved uuid; clean text;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  clean := btrim(coalesce(new_name, ''));
  if char_length(clean) < 1 or char_length(clean) > 40 then raise exception '부서 이름은 1~40자로 입력해 주세요.'; end if;

  if exists (
    select 1 from public.org_departments d
    where d.workspace_id = target_workspace_id and d.name = clean
      and (target_id is null or d.id <> target_id)
  ) then raise exception '같은 이름의 부서가 이미 있습니다.'; end if;

  if target_id is null then
    insert into public.org_departments (workspace_id, name, sort_order, created_by)
    values (target_workspace_id, clean, coalesce(new_sort_order, 0), auth.uid())
    returning id into saved;
  else
    update public.org_departments set name = clean, sort_order = coalesce(new_sort_order, 0)
    where id = target_id and workspace_id = target_workspace_id
    returning id into saved;
    if saved is null then raise exception '부서를 찾을 수 없습니다.'; end if;
  end if;

  return saved;
end $$;

-- 배정된 사람은 남고 배정만 비워집니다(on delete set null).
create or replace function public.delete_department(target_workspace_id uuid, target_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  delete from public.org_departments where id = target_id and workspace_id = target_workspace_id;
end $$;

-- ── 직급 저장·삭제 ────────────────────────────────────────────────────────────
create or replace function public.save_position(
  target_workspace_id uuid, target_id uuid, new_name text, new_rank integer default 100
) returns uuid language plpgsql security definer set search_path = public
as $$
declare saved uuid; clean text;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  clean := btrim(coalesce(new_name, ''));
  if char_length(clean) < 1 or char_length(clean) > 40 then raise exception '직급 이름은 1~40자로 입력해 주세요.'; end if;

  if exists (
    select 1 from public.org_positions p
    where p.workspace_id = target_workspace_id and p.name = clean
      and (target_id is null or p.id <> target_id)
  ) then raise exception '같은 이름의 직급이 이미 있습니다.'; end if;

  if target_id is null then
    insert into public.org_positions (workspace_id, name, rank, created_by)
    values (target_workspace_id, clean, coalesce(new_rank, 100), auth.uid())
    returning id into saved;
  else
    update public.org_positions set name = clean, rank = coalesce(new_rank, 100)
    where id = target_id and workspace_id = target_workspace_id
    returning id into saved;
    if saved is null then raise exception '직급을 찾을 수 없습니다.'; end if;
  end if;

  return saved;
end $$;

create or replace function public.delete_position(target_workspace_id uuid, target_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  delete from public.org_positions where id = target_id and workspace_id = target_workspace_id;
end $$;

-- ── 구성원 배정 ───────────────────────────────────────────────────────────────
-- 부서·직급을 한 번에 정합니다. null을 넣으면 '미지정'이 됩니다.
-- 다른 워크스페이스의 부서를 붙이지 못하게 여기서 확인합니다 — 외래키만으로는 막지 못합니다.
create or replace function public.assign_member_org(
  target_workspace_id uuid, target_user_id uuid, new_department_id uuid, new_position_id uuid
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;

  if new_department_id is not null and not exists (
    select 1 from public.org_departments d where d.id = new_department_id and d.workspace_id = target_workspace_id
  ) then raise exception '이 워크스페이스의 부서가 아닙니다.'; end if;

  if new_position_id is not null and not exists (
    select 1 from public.org_positions p where p.id = new_position_id and p.workspace_id = target_workspace_id
  ) then raise exception '이 워크스페이스의 직급이 아닙니다.'; end if;

  update public.chat_workspace_members
  set department_id = new_department_id, position_id = new_position_id
  where workspace_id = target_workspace_id and user_id = target_user_id;

  if not found then raise exception '워크스페이스 구성원이 아닙니다.'; end if;
end $$;

-- ── 권한 ──────────────────────────────────────────────────────────────────────
revoke all on function
  public.list_org(uuid),
  public.save_department(uuid, uuid, text, integer),
  public.delete_department(uuid, uuid),
  public.save_position(uuid, uuid, text, integer),
  public.delete_position(uuid, uuid),
  public.assign_member_org(uuid, uuid, uuid, uuid)
from public, anon;

grant execute on function
  public.list_org(uuid),
  public.save_department(uuid, uuid, text, integer),
  public.delete_department(uuid, uuid),
  public.save_position(uuid, uuid, text, integer),
  public.delete_position(uuid, uuid),
  public.assign_member_org(uuid, uuid, uuid, uuid)
to authenticated, service_role;
