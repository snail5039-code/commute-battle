-- 중복 출발 차단 범위를 '오늘'로 좁힙니다 (2026-08-17)
--
-- 지난 날짜의 도착 안 된 기록(앱을 닫아서 도착을 못 누른 경우 등)까지 막으면, 그 기록을 정리할
-- 방법이 없는 직원은 새 출근 자체를 못 하게 됩니다. 실제로 이 프로젝트에도 며칠 전 미완료 기록이
-- 남아 있었습니다. 지난 기록은 정정 요청으로 바로잡고, 오늘 진행 중인 기록만 중복을 막습니다.

create or replace function public.attendance_start(record_type text, target_workspace_id uuid default null)
returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare created public.commute_records;
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

  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, is_on_time, exp_gained)
  values (auth.uid()::text, target_workspace_id, (now() at time zone 'Asia/Seoul')::date, record_type, 'start', now(), false, 0)
  returning * into created;
  return created;
end $$;
