-- 자정을 넘겨 퇴근하면 근무시간이 0이 되던 버그 (2026-08-17)
--
-- 야근해서 자정을 넘겨 퇴근하면 출근은 어제 date, 퇴근은 오늘 date로 저장됐습니다.
-- get_attendance_summary가 date로 묶으니 어제는 work_out이 없고 오늘은 work_in이 없어서
-- **양쪽 다 '기록 미완료' → 근무시간 0분**이 됩니다. 가장 오래 일한 날이 집계에서 사라집니다.
--
-- 고치는 방향: 기록에 '근무일(work date)' 개념을 넣습니다.
--   출근(commute) = 항상 오늘.
--   퇴근(return)  = 아직 퇴근으로 닫히지 않은 가장 최근 근무일(어제까지). 없으면 오늘.
-- 이렇게 하면 자정을 넘긴 퇴근이 출근한 날에 귀속되어 work_in/work_out이 같은 행에 들어옵니다.
--
-- 집계 쪽 계산식은 손대지 않습니다 — 확인해 보니 이미 자정 넘김을 견딥니다.
--   야간: 두 번째 항이 (date 22:00 ~ date+1 06:00)이라 익일 새벽까지 덮습니다.
--   조기퇴근: scheduled_out - work_out이 음수가 되어 greatest(0, ...)로 0.
--   휴일: 출근한 날 기준이라 토요일 출근 → 일요일 새벽 퇴근이 토요일 휴일근로로 잡힙니다.
--
-- 함께 고치는 회귀: 중복 차단이 'date = 오늘'이었는데, 퇴근 기록의 date가 어제가 되면
-- 그 기록을 못 봐서 퇴근을 두 번 누를 수 있게 됩니다. 차단 범위를 '어제~오늘'로 넓힙니다.
-- 0005가 피하려던 것(며칠 전 잔재가 새 출근을 영구히 막는 것)은 그대로 유지됩니다.

-- ── 1. 근무일 판정 ────────────────────────────────────────────────────────────
create or replace function public.attendance_work_date(target_user_id text, stamped timestamptz)
returns date language plpgsql stable security definer set search_path = public
as $$
declare today date := (stamped at time zone 'Asia/Seoul')::date; open_day date;
begin
  -- 출근 수가 퇴근 수보다 많은 = 아직 퇴근으로 닫히지 않은 근무일. 어제까지만 봅니다
  -- (그보다 오래된 미완결은 정정 요청으로 바로잡을 대상이지, 오늘 퇴근을 끌어갈 근거가 아닙니다).
  select r.date into open_day
  from public.commute_records r
  where r.user_id = target_user_id
    and r.date between today - 1 and today
    and r.type in ('commute', 'return')
  group by r.date
  having count(*) filter (where r.type = 'commute') > count(*) filter (where r.type = 'return')
  order by r.date desc
  limit 1;

  return coalesce(open_day, today);
end $$;

-- ── 2. 출발 기록 ──────────────────────────────────────────────────────────────
drop function if exists public.attendance_start(text, uuid, double precision, double precision, numeric, boolean);
create or replace function public.attendance_start(
  record_type text,
  target_workspace_id uuid default null,
  lat double precision default null,
  lng double precision default null,
  accuracy_m numeric default null,
  location_denied boolean default false
) returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare created public.commute_records; stamped timestamptz := now();
        today date; work_day date; open_record public.commute_records;
        loc_verified boolean; loc_status text; loc_distance numeric; keep_coords boolean;
begin
  perform public.attendance_guard_workspace(target_workspace_id);
  if record_type not in ('commute', 'return') then raise exception '출근 또는 퇴근만 시작할 수 있습니다.'; end if;
  today := (stamped at time zone 'Asia/Seoul')::date;

  -- 자정을 넘긴 퇴근은 어제 날짜로 저장되므로, 중복 확인도 어제까지 봅니다.
  select * into open_record from public.commute_records
  where user_id = auth.uid()::text and end_time is null and type in ('commute', 'return')
    and date between today - 1 and today
  order by start_time desc limit 1;
  if open_record.id is not null then
    raise exception '아직 도착 처리되지 않은 기록이 있습니다(% 기록). 도착을 먼저 눌러 주세요.', open_record.date;
  end if;

  -- 출근은 항상 오늘, 퇴근은 아직 닫히지 않은 근무일에 귀속됩니다.
  work_day := case when record_type = 'return' then public.attendance_work_date(auth.uid()::text, stamped) else today end;

  -- 출근의 '출발'은 집을 나서는 순간이라 사업장 밖이 정상입니다. 퇴근 출발만 검증합니다.
  if record_type = 'return' then
    select verified, status, distance_m into loc_verified, loc_status, loc_distance
    from public.attendance_location_check(target_workspace_id, lat, lng, accuracy_m, location_denied);
  end if;

  -- 지오펜스를 안 쓰는 워크스페이스의 좌표까지 보관할 이유는 없습니다.
  keep_coords := loc_status is not null and loc_status <> 'no_policy';

  insert into public.commute_records (
    user_id, workspace_id, date, type, commute_subtype, start_time, is_on_time, exp_gained,
    location_verified, location_status, location_lat, location_lng, location_accuracy_m,
    location_distance_m, location_checked_at
  )
  values (
    auth.uid()::text, target_workspace_id, work_day, record_type, 'start', stamped, false, 0,
    loc_verified, loc_status,
    case when keep_coords then lat end,
    case when keep_coords then lng end,
    case when keep_coords then accuracy_m end,
    loc_distance,
    case when loc_status is not null then stamped end
  )
  returning * into created;
  return created;
end $$;

-- ── 3. 재택 즉시 기록 ─────────────────────────────────────────────────────────
-- 재택도 자정을 넘겨 퇴근할 수 있습니다. 같은 규칙을 쓰면 재택 승인 확인도 그 근무일로 맞춰집니다.
create or replace function public.attendance_record_instant(record_type text, target_workspace_id uuid default null)
returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare created public.commute_records; stamped timestamptz := now(); work_day date;
begin
  perform public.attendance_guard_workspace(target_workspace_id);
  if record_type not in ('commute', 'return') then raise exception '출근 또는 퇴근만 기록할 수 있습니다.'; end if;

  work_day := case
    when record_type = 'return' then public.attendance_work_date(auth.uid()::text, stamped)
    else (stamped at time zone 'Asia/Seoul')::date end;

  if target_workspace_id is not null and not exists (
    select 1 from public.remote_work_requests
    where workspace_id = target_workspace_id and user_id = auth.uid()::text
      and work_date = work_day and status = 'approved'
  ) then
    raise exception '승인된 재택근무 신청이 없는 날입니다. 재택근무를 먼저 신청해 주세요.';
  end if;

  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time, duration_minutes, is_on_time, exp_gained)
  values (auth.uid()::text, target_workspace_id, work_day, record_type, 'arrival', stamped, stamped, 0, true, 15)
  returning * into created;
  return created;
end $$;

-- ── 4. 권한 ──────────────────────────────────────────────────────────────────
revoke all on function public.attendance_work_date(text, timestamptz) from public, anon, authenticated;
revoke all on function
  public.attendance_start(text, uuid, double precision, double precision, numeric, boolean)
from public, anon;
grant execute on function
  public.attendance_start(text, uuid, double precision, double precision, numeric, boolean)
to authenticated, service_role;
