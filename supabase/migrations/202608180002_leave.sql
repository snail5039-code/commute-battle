-- 휴가 신청 · 잔여 관리 (2026-08-18)
--
-- 지금 휴가는 버튼만 누르면 기록됩니다. 재택은 승인제로 바꿨는데(0008) 휴가는 자기신고로
-- 남아 있었습니다. 잔여 개념도 없어서 며칠을 썼는지, 얼마가 남았는지 아무도 모릅니다.
--
-- ── 연차 발생 일수는 자동으로 계산하지 않습니다 ───────────────────────────────
-- 근로기준법의 연차 산정(1년 미만 월 1일, 1년 이상 15일, 3년마다 가산, 회계연도 기준 등)은
-- 법 해석이 들어가고 사업장마다 취업규칙이 다릅니다. 잘못 넣으면 그대로 임금 분쟁이 됩니다.
-- 사용자가 법·제도 항목을 범위에서 제외했으므로, **관리자가 연도별 부여 일수를 입력**하고
-- 시스템은 신청·승인·차감만 정확히 합니다.
--
-- ── 며칠을 쓰는지는 서버가 셉니다 ─────────────────────────────────────────────
-- 주말과 등록된 공휴일(0011)은 빼고 셉니다. 클라이언트가 계산하면 잔여가 어긋납니다.
-- 공휴일 달력이 여기서 두 번째로 쓰입니다.

-- ── 1. 연도별 부여 일수 ───────────────────────────────────────────────────────
create table if not exists public.leave_grants (
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  granted_days numeric(4, 1) not null check (granted_days between 0 and 365),
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (workspace_id, user_id, year)
);

alter table public.leave_grants enable row level security;
drop policy if exists "members read own grant" on public.leave_grants;
create policy "members read own grant" on public.leave_grants
  for select to authenticated using (user_id = auth.uid()::text);
revoke all on public.leave_grants from anon, authenticated;
grant select on public.leave_grants to authenticated;

-- ── 2. 신청 ──────────────────────────────────────────────────────────────────
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  user_id text not null,
  start_date date not null,
  end_date date not null,
  -- 반차는 하루짜리만 됩니다(아래 제약). 오전/오후 구분은 기록에는 남기고 계산은 0.5일로 합니다.
  leave_type text not null default 'annual' check (leave_type in ('annual', 'half_am', 'half_pm')),
  days numeric(4, 1) not null check (days > 0),
  reason text not null check (char_length(btrim(reason)) between 2 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewer_id uuid,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint leave_requests_range check (end_date >= start_date),
  constraint leave_requests_half_single_day check (leave_type = 'annual' or start_date = end_date)
);

create index if not exists leave_requests_workspace_idx
  on public.leave_requests (workspace_id, status, start_date desc);
create index if not exists leave_requests_user_idx
  on public.leave_requests (workspace_id, user_id, start_date desc);

alter table public.leave_requests enable row level security;
drop policy if exists "users read own leave" on public.leave_requests;
create policy "users read own leave" on public.leave_requests
  for select to authenticated using (user_id = auth.uid()::text);
revoke all on public.leave_requests from anon, authenticated;
grant select on public.leave_requests to authenticated;

-- ── 3. 며칠인지 세기 (주말·공휴일 제외) ───────────────────────────────────────
create or replace function public.leave_working_days(
  target_workspace_id uuid, from_date date, to_date date
) returns integer language sql stable security definer set search_path = public
as $fn$
  select count(*)::integer
  from generate_series(from_date, to_date, interval '1 day') day
  where extract(isodow from day) < 6
    and not exists (
      select 1 from public.work_holidays h
      where h.workspace_id = target_workspace_id and h.holiday_date = day::date
    )
$fn$;

-- ── 4. 잔여 ──────────────────────────────────────────────────────────────────
-- 사용일수는 승인된 신청에서 더합니다(신청 중인 건은 '대기'로 따로 보여 줍니다).
create or replace function public.get_leave_balance(
  target_workspace_id uuid, target_year integer, target_user_id text default null
) returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
declare scope text; result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;
  -- 관리자는 전원, 일반 구성원은 자기 것만.
  if public.is_chat_workspace_admin(target_workspace_id) then scope := target_user_id; else scope := auth.uid()::text; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', m.user_id,
    'nickname', coalesce(u.nickname, u.username, '동료'),
    'year', target_year,
    'grantedDays', coalesce(g.granted_days, 0),
    'usedDays', coalesce(used.days, 0),
    'pendingDays', coalesce(waiting.days, 0),
    'remainingDays', coalesce(g.granted_days, 0) - coalesce(used.days, 0),
    'note', g.note
  ) order by coalesce(u.nickname, u.username, '동료')), '[]'::jsonb) into result
  from public.chat_workspace_members m
  left join public.users u on u.id = m.user_id::text
  left join public.leave_grants g
    on g.workspace_id = target_workspace_id and g.user_id = m.user_id::text and g.year = target_year
  left join lateral (
    select sum(r.days) as days from public.leave_requests r
    where r.workspace_id = target_workspace_id and r.user_id = m.user_id::text
      and r.status = 'approved' and extract(year from r.start_date) = target_year
  ) used on true
  left join lateral (
    select sum(r.days) as days from public.leave_requests r
    where r.workspace_id = target_workspace_id and r.user_id = m.user_id::text
      and r.status = 'pending' and extract(year from r.start_date) = target_year
  ) waiting on true
  where m.workspace_id = target_workspace_id
    and (scope is null or m.user_id::text = scope);

  return result;
end $fn$;

create or replace function public.set_leave_grant(
  target_workspace_id uuid, target_user_id text, target_year integer, days numeric, note text default null
) returns void language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  if not exists (select 1 from public.chat_workspace_members where workspace_id = target_workspace_id and user_id::text = target_user_id) then
    raise exception '워크스페이스 구성원이 아닙니다.';
  end if;

  insert into public.leave_grants (workspace_id, user_id, year, granted_days, note, updated_at, updated_by)
  values (target_workspace_id, target_user_id, target_year, days, nullif(btrim(coalesce(note, '')), ''), now(), auth.uid())
  on conflict (workspace_id, user_id, year) do update
    set granted_days = excluded.granted_days, note = excluded.note, updated_at = now(), updated_by = auth.uid();
end $fn$;

-- ── 5. 신청 ──────────────────────────────────────────────────────────────────
create or replace function public.request_leave(
  target_workspace_id uuid, from_date date, to_date date, kind text, reason text
) returns uuid language plpgsql security definer set search_path = public
as $fn$
declare created_id uuid; counted integer; use_days numeric(4, 1);
        granted numeric(4, 1); already numeric(4, 1); today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;
  if kind not in ('annual', 'half_am', 'half_pm') then raise exception '알 수 없는 휴가 종류입니다.'; end if;
  if to_date < from_date then raise exception '종료일이 시작일보다 이릅니다.'; end if;
  if kind <> 'annual' and from_date <> to_date then raise exception '반차는 하루만 신청할 수 있습니다.'; end if;
  if from_date < today - 31 or from_date > today + 365 then raise exception '신청 가능한 날짜 범위를 벗어났습니다.'; end if;
  if char_length(btrim(coalesce(reason, ''))) < 2 then raise exception '사유를 입력해 주세요.'; end if;
  if public.is_attendance_month_closed(target_workspace_id, from_date) then
    raise exception '%은 마감되어 휴가를 신청할 수 없습니다.', to_char(from_date, 'YYYY년 FMMM월');
  end if;

  -- 주말·공휴일은 빼고 셉니다. 전부 휴일이면 쓸 연차가 없습니다.
  counted := public.leave_working_days(target_workspace_id, from_date, to_date);
  if counted = 0 then raise exception '신청한 기간에 근무일이 없습니다(주말·공휴일).'; end if;
  use_days := case when kind = 'annual' then counted else 0.5 end;

  if exists (
    select 1 from public.leave_requests r
    where r.workspace_id = target_workspace_id and r.user_id = auth.uid()::text
      and r.status in ('pending', 'approved')
      and r.start_date <= to_date and r.end_date >= from_date
  ) then
    raise exception '같은 기간에 이미 신청한 휴가가 있습니다.';
  end if;

  -- 잔여를 넘겨 신청하면 승인 단계에서야 문제를 알게 됩니다. 여기서 막습니다.
  select coalesce(g.granted_days, 0) into granted from public.leave_grants g
  where g.workspace_id = target_workspace_id and g.user_id = auth.uid()::text
    and g.year = extract(year from from_date)::integer;
  select coalesce(sum(r.days), 0) into already from public.leave_requests r
  where r.workspace_id = target_workspace_id and r.user_id = auth.uid()::text
    and r.status in ('pending', 'approved') and extract(year from r.start_date) = extract(year from from_date);
  if already + use_days > coalesce(granted, 0) then
    raise exception '남은 연차가 부족합니다. (부여 %일, 사용·대기 %일, 신청 %일)', coalesce(granted, 0), already, use_days;
  end if;

  insert into public.leave_requests (workspace_id, user_id, start_date, end_date, leave_type, days, reason)
  values (target_workspace_id, auth.uid()::text, from_date, to_date, kind, use_days, btrim(reason))
  returning id into created_id;
  return created_id;
end $fn$;

create or replace function public.cancel_leave(target_request_id uuid)
returns void language plpgsql security definer set search_path = public
as $fn$
declare target public.leave_requests;
begin
  select * into target from public.leave_requests where id = target_request_id for update;
  if target.id is null or target.user_id <> auth.uid()::text then raise exception '내 신청만 취소할 수 있습니다.'; end if;
  if target.status <> 'pending' then raise exception '검토 대기 중인 신청만 취소할 수 있습니다. 승인된 휴가는 관리자에게 문의해 주세요.'; end if;
  update public.leave_requests set status = 'cancelled' where id = target_request_id;
end $fn$;

-- ── 6. 승인 ──────────────────────────────────────────────────────────────────
-- 승인하면 그 기간의 근무일마다 휴가 기록을 서버가 만듭니다. 직원이 따로 버튼을 누를 필요가
-- 없고, 눌러서 만들 수 있게 두면 승인 없는 휴가가 다시 생깁니다.
create or replace function public.review_leave(target_request_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = public
as $fn$
declare target public.leave_requests;
begin
  select * into target from public.leave_requests where id = target_request_id for update;
  if target.id is null then raise exception '신청을 찾을 수 없습니다.'; end if;
  if not public.is_chat_workspace_admin(target.workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  if target.status <> 'pending' then raise exception '이미 처리된 신청입니다.'; end if;

  if approve then
    if public.is_attendance_month_closed(target.workspace_id, target.start_date) then
      raise exception '%은 마감되어 승인할 수 없습니다. 마감을 해제한 뒤 처리해 주세요.', to_char(target.start_date, 'YYYY년 FMMM월');
    end if;

    -- 이미 그날 출퇴근 기록이 있으면 휴가와 충돌합니다. 관리자가 보고 판단하도록 막습니다.
    if exists (
      select 1 from public.commute_records r
      where r.user_id = target.user_id and r.workspace_id = target.workspace_id
        and r.date between target.start_date and target.end_date
        and r.type in ('commute', 'return', 'vacation')
    ) then
      raise exception '신청 기간에 이미 출퇴근 또는 휴가 기록이 있습니다. 기록을 먼저 정리해 주세요.';
    end if;

    insert into public.commute_records (user_id, workspace_id, date, type, is_on_time, exp_gained)
    select target.user_id, target.workspace_id, day::date, 'vacation', false, 0
    from generate_series(target.start_date, target.end_date, interval '1 day') day
    where extract(isodow from day) < 6
      and not exists (
        select 1 from public.work_holidays h
        where h.workspace_id = target.workspace_id and h.holiday_date = day::date
      );
  end if;

  update public.leave_requests set
    status = case when approve then 'approved' else 'rejected' end,
    reviewer_id = auth.uid(),
    reviewer_note = nullif(btrim(coalesce(note, '')), ''),
    reviewed_at = now()
  where id = target_request_id;
end $fn$;

-- ── 7. 목록 ──────────────────────────────────────────────────────────────────
create or replace function public.list_leaves(
  target_workspace_id uuid, from_date date, to_date date, only_pending boolean default false
) returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
declare scope text; result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;
  if public.is_chat_workspace_admin(target_workspace_id) then scope := null; else scope := auth.uid()::text; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'userId', r.user_id,
    'nickname', coalesce(u.nickname, u.username, '동료'),
    'startDate', r.start_date,
    'endDate', r.end_date,
    'leaveType', r.leave_type,
    'days', r.days,
    'reason', r.reason,
    'status', r.status,
    'reviewerNote', r.reviewer_note,
    'reviewedAt', r.reviewed_at,
    'createdAt', r.created_at,
    'isMine', r.user_id = auth.uid()::text,
    'selfApproved', r.reviewer_id is not null and r.reviewer_id::text = r.user_id
  ) order by r.start_date desc), '[]'::jsonb) into result
  from public.leave_requests r
  left join public.users u on u.id = r.user_id
  where r.workspace_id = target_workspace_id
    and r.start_date <= to_date and r.end_date >= from_date
    and (scope is null or r.user_id = scope)
    and (not only_pending or r.status = 'pending')
  limit 300;

  return result;
end $fn$;

-- ── 8. 권한 ──────────────────────────────────────────────────────────────────
revoke all on function public.leave_working_days(uuid, date, date) from public, anon, authenticated;
revoke all on function
  public.get_leave_balance(uuid, integer, text),
  public.set_leave_grant(uuid, text, integer, numeric, text),
  public.request_leave(uuid, date, date, text, text),
  public.cancel_leave(uuid),
  public.review_leave(uuid, boolean, text),
  public.list_leaves(uuid, date, date, boolean)
from public, anon;
grant execute on function
  public.get_leave_balance(uuid, integer, text),
  public.set_leave_grant(uuid, text, integer, numeric, text),
  public.request_leave(uuid, date, date, text, text),
  public.cancel_leave(uuid),
  public.review_leave(uuid, boolean, text),
  public.list_leaves(uuid, date, date, boolean)
to authenticated, service_role;
