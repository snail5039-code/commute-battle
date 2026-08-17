-- 출근 위치 인증 (지오펜스) — 2026-08-17
--
-- 지금까지 사무실 출근은 위치 검증이 없어서 집에서도 출근 버튼이 눌렸습니다. 재택은 승인제로
-- 막았으니(202608170008), 남은 구멍은 "사무실 출근이라고 주장하는데 사무실에 없는" 경우입니다.
--
-- ── 검증 시점 ────────────────────────────────────────────────────────────────
-- 근무시간 산정(202608170007)이 쓰는 시각은 두 개뿐입니다.
--   근무 시작 = 출근(commute) 기록의 도착 시각(end_time)  → attendance_finish
--   근무 종료 = 퇴근(return) 기록의 출발 시각(start_time) → attendance_start
-- 그래서 검증도 이 두 지점에만 겁니다. 출근의 '출발'(집을 나서는 순간)과 퇴근의 '도착'(집에
-- 들어가는 순간)은 사업장 밖이 정상이므로 검사하지 않습니다.
--
-- ── GPS 실패 처리 ────────────────────────────────────────────────────────────
-- 막지 않고 기록하되 location_verified=false와 사유를 남깁니다. 터널·건물 안·권한 거부로
-- 현장에서 출근을 못 하는 사고가 더 크고, 미인증 건은 관리자가 집계에서 확인할 수 있습니다.
-- 판정은 전부 서버에서 합니다. 클라이언트는 좌표와 정확도만 보내고 "가깝다"고 주장할 수 없습니다.

-- ── 1. 사업장 좌표 · 허용 반경 ────────────────────────────────────────────────
alter table public.work_policies
  add column if not exists office_lat double precision,
  add column if not exists office_lng double precision,
  add column if not exists office_label text,
  add column if not exists office_radius_m integer not null default 200,
  -- GPS 정확도가 이 값보다 나쁘면 "반경 안"이라고 판정할 근거가 없습니다.
  add column if not exists location_accuracy_m integer not null default 150;

alter table public.work_policies drop constraint if exists work_policies_office_radius_check;
alter table public.work_policies add constraint work_policies_office_radius_check
  check (office_radius_m between 20 and 5000);
alter table public.work_policies drop constraint if exists work_policies_location_accuracy_check;
alter table public.work_policies add constraint work_policies_location_accuracy_check
  check (location_accuracy_m between 20 and 2000);
-- 좌표는 둘 다 있거나 둘 다 없어야 합니다(한쪽만 있으면 거리 계산이 조용히 틀립니다).
alter table public.work_policies drop constraint if exists work_policies_office_coords_check;
alter table public.work_policies add constraint work_policies_office_coords_check
  check ((office_lat is null) = (office_lng is null)
     and (office_lat is null or office_lat between -90 and 90)
     and (office_lng is null or office_lng between -180 and 180));

-- ── 2. 기록에 남는 위치 판정 결과 ─────────────────────────────────────────────
-- location_verified: true = 반경 안, false = 미인증(확인 필요), null = 검증 대상 아님
--   (사업장 좌표 미설정, 워크스페이스 없는 개인 기록, 재택 기록)
alter table public.commute_records
  add column if not exists location_verified boolean,
  add column if not exists location_status text,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists location_accuracy_m numeric(8, 1),
  add column if not exists location_distance_m numeric(10, 1),
  add column if not exists location_checked_at timestamptz;

alter table public.commute_records drop constraint if exists commute_records_location_status_check;
alter table public.commute_records add constraint commute_records_location_status_check
  check (location_status is null or location_status in
    ('verified', 'out_of_range', 'low_accuracy', 'unavailable', 'denied', 'no_policy'));

-- 관리자 화면이 "미인증만" 훑을 때 쓰는 인덱스입니다.
create index if not exists commute_records_location_unverified_idx
  on public.commute_records (workspace_id, date)
  where location_verified is false;

-- ── 3. 거리 계산 (하버사인) ───────────────────────────────────────────────────
-- PostGIS를 켜지 않고 표준 함수만 씁니다. 수백 m 규모에서 오차는 무시할 수준입니다.
create or replace function public.geo_distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision language sql immutable parallel safe
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

-- ── 4. 판정 (서버에서만) ──────────────────────────────────────────────────────
-- location_denied는 "권한 거부"인지 "신호 없음"인지 구분하는 표시일 뿐이고, 어느 쪽이든
-- 결과는 미인증으로 같습니다. 클라이언트가 이 값으로 판정을 바꿀 수는 없습니다.
create or replace function public.attendance_location_check(
  target_workspace_id uuid,
  lat double precision,
  lng double precision,
  accuracy_m numeric,
  location_denied boolean,
  out verified boolean,
  out status text,
  out distance_m numeric
) language plpgsql stable security definer set search_path = public
as $$
declare policy public.work_policies;
begin
  if target_workspace_id is null then
    verified := null; status := 'no_policy'; return;  -- 워크스페이스에 속하지 않은 개인 기록
  end if;

  select * into policy from public.work_policies where workspace_id = target_workspace_id;
  if policy.office_lat is null then
    verified := null; status := 'no_policy'; return;  -- 관리자가 사업장 좌표를 아직 안 정했습니다
  end if;

  if lat is null or lng is null then
    verified := false;
    status := case when coalesce(location_denied, false) then 'denied' else 'unavailable' end;
    return;
  end if;

  distance_m := round(public.geo_distance_m(policy.office_lat, policy.office_lng, lat, lng)::numeric, 1);

  if accuracy_m is null or accuracy_m > policy.location_accuracy_m then
    verified := false; status := 'low_accuracy'; return;
  end if;

  if distance_m <= policy.office_radius_m then
    verified := true; status := 'verified';
  else
    verified := false; status := 'out_of_range';
  end if;
end $$;

-- ── 5. 퇴근 출발 = 근무 종료 시각 ─────────────────────────────────────────────
-- 이 시각을 검증하지 않으면 집에 도착해서 퇴근을 눌러 근무시간을 늘릴 수 있습니다.
drop function if exists public.attendance_start(text, uuid);
create or replace function public.attendance_start(
  record_type text,
  target_workspace_id uuid default null,
  lat double precision default null,
  lng double precision default null,
  accuracy_m numeric default null,
  location_denied boolean default false
) returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare created public.commute_records;
        loc_verified boolean; loc_status text; loc_distance numeric; keep_coords boolean;
begin
  perform public.attendance_guard_workspace(target_workspace_id);
  if record_type not in ('commute', 'return') then raise exception '출근 또는 퇴근만 시작할 수 있습니다.'; end if;
  if exists (
    select 1 from public.commute_records
    where user_id = auth.uid()::text
      and end_time is null
      and type in ('commute', 'return')
      and date = (now() at time zone 'Asia/Seoul')::date
  ) then
    raise exception '오늘 아직 도착 처리되지 않은 기록이 있습니다.';
  end if;

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
    auth.uid()::text, target_workspace_id, (now() at time zone 'Asia/Seoul')::date, record_type, 'start', now(), false, 0,
    loc_verified, loc_status,
    case when keep_coords then lat end,
    case when keep_coords then lng end,
    case when keep_coords then accuracy_m end,
    loc_distance,
    case when loc_status is not null then now() end
  )
  returning * into created;
  return created;
end $$;

-- ── 6. 출근 도착 = 근무 시작 시각 ─────────────────────────────────────────────
drop function if exists public.attendance_finish(uuid, boolean);
create or replace function public.attendance_finish(
  target_record_id uuid,
  self_on_time boolean default false,
  lat double precision default null,
  lng double precision default null,
  accuracy_m numeric default null,
  location_denied boolean default false
) returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare target public.commute_records; finished timestamptz := now();
        loc_verified boolean; loc_status text; loc_distance numeric; keep_coords boolean;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into target from public.commute_records where id = target_record_id for update;
  if target.id is null or target.user_id <> auth.uid()::text then raise exception '내 기록만 도착 처리할 수 있습니다.'; end if;
  if target.type not in ('commute', 'return') or target.start_time is null then raise exception '이동 중인 기록만 도착 처리할 수 있습니다.'; end if;
  if target.end_time is not null then raise exception '이미 도착 처리된 기록입니다.'; end if;

  -- 퇴근의 '도착'은 집에 들어가는 순간이라 검증 대상이 아닙니다.
  if target.type = 'commute' then
    select verified, status, distance_m into loc_verified, loc_status, loc_distance
    from public.attendance_location_check(target.workspace_id, lat, lng, accuracy_m, location_denied);
  end if;

  keep_coords := loc_status is not null and loc_status <> 'no_policy';

  update public.commute_records set
    end_time = finished,
    commute_subtype = 'arrival',
    duration_minutes = greatest(0, round(extract(epoch from (finished - target.start_time)) / 60))::int,
    is_on_time = coalesce(self_on_time, false),
    exp_gained = case when coalesce(self_on_time, false) then 15 else 10 end,
    location_verified = loc_verified,
    location_status = loc_status,
    location_lat = case when keep_coords then lat end,
    location_lng = case when keep_coords then lng end,
    location_accuracy_m = case when keep_coords then accuracy_m end,
    location_distance_m = loc_distance,
    location_checked_at = case when loc_status is not null then finished end,
    updated_at = finished
  where id = target_record_id
  returning * into target;
  return target;
end $$;

-- ── 7. 관리자 정책 편집에 사업장 위치 추가 ────────────────────────────────────
drop function if exists public.upsert_work_policy(uuid, time, time, integer, integer, integer, integer, time, time);
create or replace function public.upsert_work_policy(
  target_workspace_id uuid,
  new_work_start time,
  new_work_end time,
  new_daily_regular_minutes integer,
  new_weekly_regular_minutes integer,
  new_weekly_limit_minutes integer,
  new_break_minutes integer,
  new_night_start time,
  new_night_end time,
  new_office_lat double precision default null,
  new_office_lng double precision default null,
  new_office_label text default null,
  new_office_radius_m integer default 200,
  new_location_accuracy_m integer default 150
) returns public.work_policies language plpgsql security definer set search_path = public
as $$
declare saved public.work_policies;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  if (new_office_lat is null) <> (new_office_lng is null) then raise exception '사업장 위치는 위도와 경도를 함께 지정해야 합니다.'; end if;

  insert into public.work_policies as p (workspace_id, work_start, work_end, daily_regular_minutes,
    weekly_regular_minutes, weekly_limit_minutes, break_minutes, night_start, night_end,
    office_lat, office_lng, office_label, office_radius_m, location_accuracy_m, updated_at, updated_by)
  values (target_workspace_id, new_work_start, new_work_end, new_daily_regular_minutes,
    new_weekly_regular_minutes, new_weekly_limit_minutes, new_break_minutes, new_night_start, new_night_end,
    new_office_lat, new_office_lng, nullif(btrim(coalesce(new_office_label, '')), ''),
    new_office_radius_m, new_location_accuracy_m, now(), auth.uid())
  on conflict (workspace_id) do update set
    work_start = excluded.work_start,
    work_end = excluded.work_end,
    daily_regular_minutes = excluded.daily_regular_minutes,
    weekly_regular_minutes = excluded.weekly_regular_minutes,
    weekly_limit_minutes = excluded.weekly_limit_minutes,
    break_minutes = excluded.break_minutes,
    night_start = excluded.night_start,
    night_end = excluded.night_end,
    office_lat = excluded.office_lat,
    office_lng = excluded.office_lng,
    office_label = excluded.office_label,
    office_radius_m = excluded.office_radius_m,
    location_accuracy_m = excluded.location_accuracy_m,
    updated_at = now(),
    updated_by = auth.uid()
  returning * into saved;
  return saved;
end $$;

-- ── 8. 집계에 위치 인증 결과 노출 ─────────────────────────────────────────────
-- 202608170008에서 isRemote를 넣은 정의가 파일로 남지 않아 여기서 함께 복원합니다.
create or replace function public.get_attendance_summary(
  target_workspace_id uuid,
  from_date date,
  to_date date,
  target_user_id text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare policy public.work_policies; scope text; days jsonb; weeks jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;
  if to_date < from_date then raise exception '조회 기간이 올바르지 않습니다.'; end if;
  if to_date - from_date > 186 then raise exception '한 번에 6개월까지만 조회할 수 있습니다.'; end if;

  if public.is_chat_workspace_admin(target_workspace_id) then
    scope := target_user_id;
  else
    scope := auth.uid()::text;  -- 일반 구성원은 남의 근태를 볼 수 없습니다.
  end if;

  select * into policy from public.work_policies where workspace_id = target_workspace_id;
  if policy.workspace_id is null then
    insert into public.work_policies (workspace_id) values (target_workspace_id)
    on conflict (workspace_id) do nothing;
    select * into policy from public.work_policies where workspace_id = target_workspace_id;
  end if;

  with base as (
    select r.user_id, r.date,
      min(r.end_time) filter (where r.type = 'commute' and r.end_time is not null) as work_in,
      max(r.start_time) filter (where r.type = 'return' and r.start_time is not null) as work_out,
      bool_or(r.type = 'vacation') as vacation,
      bool_or(r.type = 'sick') as sick,
      bool_or(r.type = 'absence') as absence,
      bool_or(r.type = 'early_leave') as early_leave,
      count(*) filter (where r.type in ('commute', 'return') and r.end_time is null) as open_records,
      -- 위치가 확인되지 않은 출퇴근이 몇 건인지. null(검증 대상 아님)은 세지 않습니다.
      count(*) filter (where r.location_verified is false) as location_unverified,
      max(r.location_distance_m) filter (where r.location_verified is false) as location_max_distance
    from public.commute_records r
    where r.workspace_id = target_workspace_id
      and r.date between from_date and to_date
      and (scope is null or r.user_id = scope)
    group by r.user_id, r.date
  ),
  raw as (
    select b.*,
      case when b.work_in is not null and b.work_out is not null and b.work_out > b.work_in
        then extract(epoch from (b.work_out - b.work_in)) / 60 else null end as raw_minutes,
      (b.date + policy.work_start) at time zone 'Asia/Seoul' as scheduled_in,
      (b.date + policy.work_end) at time zone 'Asia/Seoul' as scheduled_out
    from base b
  ),
  measured as (
    select r.*,
      case
        when r.raw_minutes is null then null
        when r.raw_minutes >= 480 then policy.break_minutes
        when r.raw_minutes >= 240 then least(policy.break_minutes, 30)
        else 0
      end as break_minutes
    from raw r
  ),
  worked as (
    select m.*,
      case when m.raw_minutes is null then null else greatest(0, m.raw_minutes - m.break_minutes) end as worked_minutes,
      extract(isodow from m.date) >= 6 as holiday
    from measured m
  ),
  detailed as (
    select w.*,
      case when w.worked_minutes is null then 0 else greatest(0, w.worked_minutes - policy.daily_regular_minutes) end as overtime_minutes,
      case when w.work_in is null or w.work_out is null then 0 else
        public.overlap_minutes(w.work_in, w.work_out, (w.date + time '00:00') at time zone 'Asia/Seoul', (w.date + policy.night_end) at time zone 'Asia/Seoul')
        + public.overlap_minutes(w.work_in, w.work_out, (w.date + policy.night_start) at time zone 'Asia/Seoul', ((w.date + 1) + policy.night_end) at time zone 'Asia/Seoul')
      end as night_minutes,
      -- 휴일에는 소정근로 시각 자체가 없으므로 지각·조기퇴근을 따지지 않습니다.
      case when w.work_in is null or w.holiday then 0 else greatest(0, extract(epoch from (w.work_in - w.scheduled_in)) / 60) end as late_minutes,
      case when w.work_out is null or w.holiday then 0 else greatest(0, extract(epoch from (w.scheduled_out - w.work_out)) / 60) end as early_out_minutes
    from worked w
  ),
  day_rows as (
    select jsonb_build_object(
        'userId', d.user_id,
        'nickname', coalesce(u.nickname, u.username, '동료'),
        'date', d.date,
        'workIn', d.work_in,
        'workOut', d.work_out,
        'workedMinutes', round(coalesce(d.worked_minutes, 0)),
        'breakMinutes', coalesce(d.break_minutes, 0),
        'overtimeMinutes', round(d.overtime_minutes),
        'nightMinutes', round(d.night_minutes),
        'holidayMinutes', case when d.holiday then round(coalesce(d.worked_minutes, 0)) else 0 end,
        'lateMinutes', round(d.late_minutes),
        'earlyOutMinutes', round(d.early_out_minutes),
        'isHoliday', d.holiday,
        'isRemote', rw.id is not null,
        'locationUnverified', d.location_unverified,
        'locationMaxDistanceM', d.location_max_distance,
        'status', case
          when d.absence then 'absence'
          when d.vacation then 'vacation'
          when d.sick then 'sick'
          when d.work_in is null or d.work_out is null then 'incomplete'
          when d.early_leave then 'early_leave'
          else 'complete' end,
        'openRecords', d.open_records
      ) as item
    from detailed d
    left join public.users u on u.id = d.user_id
    left join public.remote_work_requests rw
      on rw.workspace_id = target_workspace_id and rw.user_id = d.user_id
      and rw.work_date = d.date and rw.status = 'approved'
  )
  select coalesce(jsonb_agg(item order by item->>'date', item->>'nickname'), '[]'::jsonb) into days from day_rows;

  -- 주간 합계는 위에서 만든 일별 결과를 그대로 접습니다(계산식을 두 번 쓰면 언젠가 어긋납니다).
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', w.user_id,
    'nickname', w.nickname,
    'weekStart', w.week_start,
    'workedMinutes', w.worked_minutes,
    -- 연장근로는 1일 8시간 초과 합계와 1주 40시간 초과 중 큰 쪽으로 봅니다.
    'overtimeMinutes', greatest(w.daily_overtime, w.worked_minutes - policy.weekly_regular_minutes, 0),
    'overLimit', w.worked_minutes > policy.weekly_limit_minutes
  ) order by w.week_start, w.nickname), '[]'::jsonb) into weeks
  from (
    select item->>'userId' as user_id,
      item->>'nickname' as nickname,
      date_trunc('week', (item->>'date')::date)::date as week_start,
      sum((item->>'workedMinutes')::numeric) as worked_minutes,
      sum((item->>'overtimeMinutes')::numeric) as daily_overtime
    from jsonb_array_elements(days) as item
    group by 1, 2, 3
  ) w;

  return jsonb_build_object(
    'policy', jsonb_build_object(
      'workspaceId', policy.workspace_id,
      'workStart', policy.work_start,
      'workEnd', policy.work_end,
      'dailyRegularMinutes', policy.daily_regular_minutes,
      'weeklyRegularMinutes', policy.weekly_regular_minutes,
      'weeklyLimitMinutes', policy.weekly_limit_minutes,
      'breakMinutes', policy.break_minutes,
      'nightStart', policy.night_start,
      'nightEnd', policy.night_end,
      'officeLat', policy.office_lat,
      'officeLng', policy.office_lng,
      'officeLabel', policy.office_label,
      'officeRadiusM', policy.office_radius_m,
      'locationAccuracyM', policy.location_accuracy_m,
      'updatedAt', policy.updated_at
    ),
    'scopedToSelf', scope is not null and not public.is_chat_workspace_admin(target_workspace_id),
    'days', days,
    'weeks', weeks
  );
end $$;

-- ── 9. 권한 ──────────────────────────────────────────────────────────────────
-- 판정 함수는 RPC 안에서만 씁니다. 직접 호출하게 두면 "지금 여기가 반경 안인가"를
-- 마음대로 조회하면서 사업장 좌표를 역추적할 수 있습니다.
revoke all on function public.geo_distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.attendance_location_check(uuid, double precision, double precision, numeric, boolean) from public, anon, authenticated;

revoke all on function
  public.attendance_start(text, uuid, double precision, double precision, numeric, boolean),
  public.attendance_finish(uuid, boolean, double precision, double precision, numeric, boolean),
  public.upsert_work_policy(uuid, time, time, integer, integer, integer, integer, time, time, double precision, double precision, text, integer, integer),
  public.get_attendance_summary(uuid, date, date, text)
from public, anon;

grant execute on function
  public.attendance_start(text, uuid, double precision, double precision, numeric, boolean),
  public.attendance_finish(uuid, boolean, double precision, double precision, numeric, boolean),
  public.upsert_work_policy(uuid, time, time, integer, integer, integer, integer, time, time, double precision, double precision, text, integer, integer),
  public.get_attendance_summary(uuid, date, date, text)
to authenticated, service_role;
