-- 근무시간 산정 (2026-08-17)
--
-- 지금까지 기록은 '이동' 시간이었지만, 근무시간은 기존 기록에서 그대로 도출됩니다.
--   근무 시작 = 출근(commute) 기록의 도착 시각(end_time)
--   근무 종료 = 퇴근(return) 기록의 출발 시각(start_time)
--   재택 기록은 start_time = end_time이라 같은 규칙이 그대로 적용됩니다.
--
-- 계산을 서버에 두는 이유: 관리자는 다른 사람 기록을 RLS로 못 읽어서 어차피 RPC가 필요하고,
-- 임금에 영향을 주는 값은 클라이언트가 아니라 한 곳에서만 계산되어야 합니다.
--
-- v1 범위: 소정근로·휴게 차감·연장(일 8시간/주 40시간 중 큰 쪽)·야간(22~06시)·휴일(토·일)·지각·조기퇴근,
--          주 52시간 초과 표시. 공휴일 달력과 교대·유연근무제는 아직 없습니다.

create table if not exists public.work_policies (
  workspace_id uuid primary key references public.chat_workspaces(id) on delete cascade,
  work_start time not null default '09:00',
  work_end time not null default '18:00',
  daily_regular_minutes integer not null default 480 check (daily_regular_minutes between 60 and 720),
  weekly_regular_minutes integer not null default 2400 check (weekly_regular_minutes between 300 and 3600),
  weekly_limit_minutes integer not null default 3120 check (weekly_limit_minutes between 600 and 4200),
  break_minutes integer not null default 60 check (break_minutes between 0 and 240),
  night_start time not null default '22:00',
  night_end time not null default '06:00',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.work_policies enable row level security;
drop policy if exists "members read work policy" on public.work_policies;
create policy "members read work policy" on public.work_policies
  for select to authenticated using (public.is_chat_workspace_member(workspace_id));
revoke all on public.work_policies from anon, authenticated;
grant select on public.work_policies to authenticated;

create or replace function public.overlap_minutes(a_start timestamptz, a_end timestamptz, b_start timestamptz, b_end timestamptz)
returns numeric language sql immutable
as $$ select greatest(0, extract(epoch from (least(a_end, b_end) - greatest(a_start, b_start))) / 60) $$;

create or replace function public.upsert_work_policy(
  target_workspace_id uuid,
  new_work_start time,
  new_work_end time,
  new_daily_regular_minutes integer,
  new_weekly_regular_minutes integer,
  new_weekly_limit_minutes integer,
  new_break_minutes integer,
  new_night_start time,
  new_night_end time
) returns public.work_policies language plpgsql security definer set search_path = public
as $$
declare saved public.work_policies;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;

  insert into public.work_policies as p (workspace_id, work_start, work_end, daily_regular_minutes,
    weekly_regular_minutes, weekly_limit_minutes, break_minutes, night_start, night_end, updated_at, updated_by)
  values (target_workspace_id, new_work_start, new_work_end, new_daily_regular_minutes,
    new_weekly_regular_minutes, new_weekly_limit_minutes, new_break_minutes, new_night_start, new_night_end, now(), auth.uid())
  on conflict (workspace_id) do update set
    work_start = excluded.work_start,
    work_end = excluded.work_end,
    daily_regular_minutes = excluded.daily_regular_minutes,
    weekly_regular_minutes = excluded.weekly_regular_minutes,
    weekly_limit_minutes = excluded.weekly_limit_minutes,
    break_minutes = excluded.break_minutes,
    night_start = excluded.night_start,
    night_end = excluded.night_end,
    updated_at = now(),
    updated_by = auth.uid()
  returning * into saved;
  return saved;
end $$;

-- 기간별 근태 집계. 관리자는 워크스페이스 전체, 일반 구성원은 본인 것만 볼 수 있습니다.
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
      count(*) filter (where r.type in ('commute', 'return') and r.end_time is null) as open_records
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
    select d.user_id, d.date, date_trunc('week', d.date)::date as week_start,
      coalesce(d.worked_minutes, 0) as worked_minutes,
      d.overtime_minutes,
      jsonb_build_object(
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
      'updatedAt', policy.updated_at
    ),
    'scopedToSelf', scope is not null and not public.is_chat_workspace_admin(target_workspace_id),
    'days', days,
    'weeks', weeks
  );
end $$;

revoke all on function public.overlap_minutes(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
revoke all on function
  public.upsert_work_policy(uuid, time, time, integer, integer, integer, integer, time, time),
  public.get_attendance_summary(uuid, date, date, text)
from public, anon;
grant execute on function
  public.upsert_work_policy(uuid, time, time, integer, integer, integer, integer, time, time),
  public.get_attendance_summary(uuid, date, date, text)
to authenticated, service_role;
