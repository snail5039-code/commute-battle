-- 승인 라인: 부서장 (2026-08-18)
--
-- 지금까지 근태 정정·재택·휴가 승인은 전부 워크스페이스 관리자만 할 수 있었습니다. 사람이 늘면
-- 관리자 한 명에게 전부 몰리고, 정작 그 사람의 사정을 아는 건 같이 일하는 부서장입니다.
--
-- ── 부서장을 어떻게 정하는가 ─────────────────────────────────────────────────
--
-- **직급에서 유도하지 않습니다.** 0004에서 "직급은 권한이 아니다"라고 정했고, 여기서 '부장이면
-- 부서장'으로 이어 붙이면 그 선이 바로 무너집니다. 관리자가 부서마다 부서장을 **명시적으로
-- 지정**합니다(`org_departments.head_user_id`). 권한은 누가 줬는지 항상 보여야 합니다.
--
-- ── 부서장이 할 수 있는 것 / 없는 것 ─────────────────────────────────────────
--
-- 할 수 있는 것: 자기 부서원의 근태 정정·재택·휴가 승인, 자기 부서원의 근무시간 조회.
--   (승인하려면 봐야 합니다. 보지 않고 누르는 승인은 승인이 아닙니다)
-- 없는 것: 부서·직급 만들기와 배정, 월 마감, 연차 부여, 공휴일, 근무 정책 — 전부 관리자 그대로.
--
-- **자기 기록의 정정은 여전히 승인하지 못합니다.** 부서장이 자기 출퇴근 시각을 스스로 고칠 수
-- 있으면 이 시스템 전체가 의미를 잃습니다. 기존 '본인 승인 금지'를 그대로 둡니다.
--
-- ── 왜 함수 전문을 다시 쓰지 않고 치환하는가 ─────────────────────────────────
--
-- `get_attendance_summary`의 **라이브 정의가 마이그레이션 파일과 다릅니다**(파일에 있는 주석이
-- DB엔 없습니다). 0008의 `isRemote`와 같은 일이 또 있는 것이고, 이 상태에서 파일 내용을 붙여넣으면
-- DB에만 있던 변경이 조용히 날아갑니다.
--
-- 그래서 DB가 `pg_get_functiondef`로 **자기 정의를 읽어** 해당 한 줄만 바꿔 다시 만듭니다.
-- 치환 지점이 정확히 1곳이 아니면 예외를 던지고 멈춥니다 — 조용히 아무것도 안 하는 것보다
-- 시끄럽게 실패하는 편이 낫습니다.

-- ── 1. 부서장 지정 ────────────────────────────────────────────────────────────
alter table public.org_departments
  add column if not exists head_user_id uuid references auth.users(id) on delete set null;

create index if not exists org_departments_head_idx on public.org_departments (workspace_id, head_user_id);

-- ── 2. 판정 함수 ──────────────────────────────────────────────────────────────
-- target_user_id가 '내가 부서장인 부서'에 속해 있는가.
-- exists로 쓰므로 한 사람이 여러 부서의 부서장이어도 그대로 맞습니다.
create or replace function public.is_my_department_member(target_workspace_id uuid, target_user_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.chat_workspace_members m
    join public.org_departments d on d.id = m.department_id
    where m.workspace_id = target_workspace_id
      and m.user_id::text = target_user_id
      and d.workspace_id = target_workspace_id
      and d.head_user_id = auth.uid()
  )
$$;

-- 내가 이 워크스페이스에서 부서장이기는 한가 (목록 화면을 열어 줄지 판단할 때)
create or replace function public.is_department_head(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.org_departments d
    where d.workspace_id = target_workspace_id and d.head_user_id = auth.uid()
  )
$$;

-- 이 사람의 신청을 내가 처리할 수 있는가
create or replace function public.can_review_member(target_workspace_id uuid, target_user_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_chat_workspace_admin(target_workspace_id)
      or public.is_my_department_member(target_workspace_id, target_user_id)
$$;

-- ── 3. 부서장 지정 RPC ────────────────────────────────────────────────────────
create or replace function public.set_department_head(
  target_workspace_id uuid, target_id uuid, new_head_user_id uuid
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;

  -- 부서장은 워크스페이스 구성원이어야 합니다. 그 부서 소속일 필요는 없습니다 —
  -- 한 사람이 여러 팀을 맡거나, 팀 밖에서 관리하는 경우가 실제로 있습니다.
  if new_head_user_id is not null and not exists (
    select 1 from public.chat_workspace_members m
    where m.workspace_id = target_workspace_id and m.user_id = new_head_user_id
  ) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;

  update public.org_departments set head_user_id = new_head_user_id
  where id = target_id and workspace_id = target_workspace_id;

  if not found then raise exception '부서를 찾을 수 없습니다.'; end if;
end $$;

-- ── 4. 조직도에 부서장 표시 ───────────────────────────────────────────────────
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
        'headUserId', d.head_user_id,
        'headNickname', (select coalesce(hu.nickname, hu.username, '동료') from public.users hu where hu.id = d.head_user_id::text),
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
        'positionRank', p.rank,
        'isDepartmentHead', exists (
          select 1 from public.org_departments hd
          where hd.workspace_id = target_workspace_id and hd.head_user_id = m.user_id
        )
      ) order by coalesce(p.rank, 9999), coalesce(u.nickname, u.username, '동료')), '[]'::jsonb)
      from public.chat_workspace_members m
      left join public.users u on u.id = m.user_id::text
      left join public.org_departments d on d.id = m.department_id
      left join public.org_positions p on p.id = m.position_id
      where m.workspace_id = target_workspace_id
    ),
    'iAmHead', public.is_department_head(target_workspace_id)
  ) into result;

  return result;
end $$;

-- ── 5. 기존 함수에 부서장을 끼워 넣기 (치환) ──────────────────────────────────
create or replace function public.__patch_function(sig text, anchor text, replacement text)
returns void language plpgsql as $$
declare src text; hits integer;
begin
  src := pg_get_functiondef(sig::regprocedure);
  hits := (length(src) - length(replace(src, anchor, ''))) / length(anchor);
  if hits <> 1 then
    raise exception '치환 지점이 1곳이 아닙니다(%곳): % / %', hits, sig, left(anchor, 70);
  end if;
  execute replace(src, anchor, replacement);
end $$;

do $$
declare
  -- '나 자신으로 좁혀진 경우에만' 부서원까지 넓힙니다. 이 단서가 없으면, 부서장을 겸한
  -- 관리자가 한 사람을 골라 볼 때 자기 부서원까지 딸려 나옵니다.
  widen_r constant text :=
    'and (scope is null or r.user_id = scope or (scope = auth.uid()::text and public.is_my_department_member(target_workspace_id, r.user_id)))';
  widen_q constant text :=
    'and (scope is null or q.user_id = scope or (scope = auth.uid()::text and public.is_my_department_member(target_workspace_id, q.user_id)))';
  head_msg constant text := '관리자 또는 해당 부서의 부서장만 처리할 수 있습니다.';
begin
  -- (a) 근무시간 집계: 부서장은 자기 부서원의 근무시간을 본다
  perform public.__patch_function(
    'public.get_attendance_summary(uuid,date,date,text)',
    'and (scope is null or r.user_id = scope)',
    widen_r);

  -- (b) 휴가 목록
  perform public.__patch_function(
    'public.list_leaves(uuid,date,date,boolean)',
    'and (scope is null or r.user_id = scope)',
    widen_r);

  -- (c) 재택 목록
  perform public.__patch_function(
    'public.list_remote_work(uuid,date,date,boolean)',
    'and (scope is null or q.user_id = scope)',
    widen_q);

  -- (d) 근태 정정 목록: 원래 관리자만 열 수 있었다. 부서장도 열되 자기 부서 것만 보인다.
  perform public.__patch_function(
    'public.list_commute_corrections(uuid,boolean)',
    'if not public.is_chat_workspace_admin(target_workspace_id) then raise exception ''관리자 권한이 필요합니다.''; end if;',
    'if not (public.is_chat_workspace_admin(target_workspace_id) or public.is_department_head(target_workspace_id)) then raise exception ''관리자 또는 부서장 권한이 필요합니다.''; end if;');
  perform public.__patch_function(
    'public.list_commute_corrections(uuid,boolean)',
    'and (include_reviewed or q.status = ''pending'')',
    'and (include_reviewed or q.status = ''pending'')
      and (public.is_chat_workspace_admin(target_workspace_id) or public.is_my_department_member(target_workspace_id, q.user_id))');

  -- (e) 승인 세 곳. 본인 승인 금지(근태 정정)는 그 아래 줄에 그대로 남아 있다.
  perform public.__patch_function(
    'public.review_commute_correction(uuid,boolean,text)',
    'if not public.is_chat_workspace_admin(request.workspace_id) then raise exception ''관리자 권한이 필요합니다.''; end if;',
    'if not public.can_review_member(request.workspace_id, request.user_id) then raise exception ''' || head_msg || '''; end if;');

  perform public.__patch_function(
    'public.review_remote_work(uuid,boolean,text)',
    'if not public.is_chat_workspace_admin(target.workspace_id) then raise exception ''관리자 권한이 필요합니다.''; end if;',
    'if not public.can_review_member(target.workspace_id, target.user_id) then raise exception ''' || head_msg || '''; end if;');

  perform public.__patch_function(
    'public.review_leave(uuid,boolean,text)',
    'if not public.is_chat_workspace_admin(target.workspace_id) then raise exception ''관리자 권한이 필요합니다.''; end if;',
    'if not public.can_review_member(target.workspace_id, target.user_id) then raise exception ''' || head_msg || '''; end if;');
end $$;

drop function public.__patch_function(text, text, text);

-- ── 6. 권한 ───────────────────────────────────────────────────────────────────
-- 판정 함수는 앱에서 직접 부를 일이 없습니다(정의자 함수 안에서만 씁니다).
-- is_department_head만 화면이 '부서장 메뉴를 보여줄지' 정하는 데 씁니다 —
-- 그건 list_org의 iAmHead로 내보내므로 여기서도 닫아 둡니다.
revoke all on function
  public.is_my_department_member(uuid, text),
  public.is_department_head(uuid),
  public.can_review_member(uuid, text)
from public, anon, authenticated;

revoke all on function public.set_department_head(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_department_head(uuid, uuid, uuid) to authenticated, service_role;
