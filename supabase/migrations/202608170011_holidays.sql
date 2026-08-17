-- 공휴일 달력 (2026-08-17)
--
-- 지금까지 휴일은 토·일 고정이었습니다. 광복절·설날에 일해도 휴일근로 가산이 안 잡히고,
-- 평일 공휴일에 안 나와도 '기록 미완료'로 잡혔습니다.
--
-- 출처를 둘로 둡니다.
--   public_api — 공공데이터포털 특일 정보(한국천문연구원). 음력 휴일과 대체공휴일이 여기서 옵니다.
--   custom     — 창립기념일·단체 연차처럼 회사마다 다른 휴일. 관리자가 직접 넣습니다.
--
-- 공휴일 날짜를 코드에 박아 넣지 않습니다. 설날·추석·부처님오신날은 음력이라 해마다 바뀌고
-- 대체공휴일 규칙도 얽혀 있어서, 잘못 넣으면 그대로 임금 계산에 들어갑니다.
--
-- 워크스페이스별로 행을 둡니다. 같은 공휴일이 회사마다 중복 저장되지만, 그 대신
-- "우리 회사는 그날 정상 근무한다"를 그 행만 지워서 표현할 수 있습니다.

create table if not exists public.work_holidays (
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  holiday_date date not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  source text not null default 'custom' check (source in ('public_api', 'custom')),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (workspace_id, holiday_date)
);

create index if not exists work_holidays_range_idx on public.work_holidays (workspace_id, holiday_date);

alter table public.work_holidays enable row level security;
drop policy if exists "members read holidays" on public.work_holidays;
create policy "members read holidays" on public.work_holidays
  for select to authenticated using (public.is_chat_workspace_member(workspace_id));
revoke all on public.work_holidays from anon, authenticated;
grant select on public.work_holidays to authenticated;

-- ── 저장 ──────────────────────────────────────────────────────────────────────
-- items: [{"date": "2026-08-15", "name": "광복절"}, ...]
-- overwrite=false(공공 API 가져오기)면 이미 있는 날짜는 건드리지 않습니다. 관리자가 직접 손본
-- 이름이나 자체 휴일을 API가 덮어쓰면 안 되기 때문입니다.
create or replace function public.save_work_holidays(
  target_workspace_id uuid,
  items jsonb,
  new_source text default 'custom',
  overwrite boolean default true
) returns integer language plpgsql security definer set search_path = public
as $$
declare saved integer;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  if new_source not in ('public_api', 'custom') then raise exception '알 수 없는 출처입니다.'; end if;
  if jsonb_typeof(items) <> 'array' then raise exception '휴일 목록 형식이 올바르지 않습니다.'; end if;
  if jsonb_array_length(items) > 400 then raise exception '한 번에 400건까지만 저장할 수 있습니다.'; end if;

  with incoming as (
    select (item->>'date')::date as holiday_date, btrim(item->>'name') as name
    from jsonb_array_elements(items) item
    where item->>'date' is not null and char_length(btrim(coalesce(item->>'name', ''))) between 1 and 60
  ),
  merged as (
    insert into public.work_holidays as h (workspace_id, holiday_date, name, source, created_by)
    select target_workspace_id, i.holiday_date, i.name, new_source, auth.uid() from incoming i
    on conflict (workspace_id, holiday_date) do update
      set name = excluded.name, source = excluded.source, created_by = excluded.created_by
      where overwrite
    returning 1
  )
  select count(*) into saved from merged;

  return coalesce(saved, 0);
end $$;

create or replace function public.delete_work_holiday(target_workspace_id uuid, target_date date)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  delete from public.work_holidays where workspace_id = target_workspace_id and holiday_date = target_date;
end $$;

create or replace function public.list_work_holidays(target_workspace_id uuid, from_date date, to_date date)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;
  if to_date < from_date then raise exception '조회 기간이 올바르지 않습니다.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', h.holiday_date, 'name', h.name, 'source', h.source
  ) order by h.holiday_date), '[]'::jsonb) into result
  from public.work_holidays h
  where h.workspace_id = target_workspace_id and h.holiday_date between from_date and to_date;

  return result;
end $$;

-- ── 집계에 반영 ───────────────────────────────────────────────────────────────
-- 휴일 = 토·일 또는 등록된 공휴일. 휴일에는 지각·조기퇴근을 따지지 않고 근무시간이 휴일근로로 잡힙니다.
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

  with hol as (
    select h.holiday_date, h.name
    from public.work_holidays h
    where h.workspace_id = target_workspace_id and h.holiday_date between from_date and to_date
  ),
  base as (
    select r.user_id, r.date,
      min(r.end_time) filter (where r.type = 'commute' and r.end_time is not null) as work_in,
      max(r.start_time) filter (where r.type = 'return' and r.start_time is not null) as work_out,
      bool_or(r.type = 'vacation') as vacation,
      bool_or(r.type = 'sick') as sick,
      bool_or(r.type = 'absence') as absence,
      bool_or(r.type = 'early_leave') as early_leave,
      count(*) filter (where r.type in ('commute', 'return') and r.end_time is null) as open_records,
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
      -- 토·일이거나 등록된 공휴일이면 휴일입니다.
      (extract(isodow from m.date) >= 6 or exists (select 1 from hol where hol.holiday_date = m.date)) as holiday
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
        'holidayName', hol.name,
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
    left join hol on hol.holiday_date = d.date
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

-- ── 권한 ──────────────────────────────────────────────────────────────────────
revoke all on function
  public.save_work_holidays(uuid, jsonb, text, boolean),
  public.delete_work_holiday(uuid, date),
  public.list_work_holidays(uuid, date, date),
  public.get_attendance_summary(uuid, date, date, text)
from public, anon;

grant execute on function
  public.save_work_holidays(uuid, jsonb, text, boolean),
  public.delete_work_holiday(uuid, date),
  public.list_work_holidays(uuid, date, date),
  public.get_attendance_summary(uuid, date, date, text)
to authenticated, service_role;
