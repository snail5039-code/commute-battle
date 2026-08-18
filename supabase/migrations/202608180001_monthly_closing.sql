-- 월 마감(확정) 처리 (2026-08-18)
--
-- 지난달 기록이 정정 요청으로 계속 바뀔 수 있어서 "6월 급여는 이 숫자"라고 못 박을 수가
-- 없었습니다. 급여 담당자가 CSV를 뽑아 간 뒤에 숫자가 바뀌어도 알아챌 방법이 없습니다.
--
-- ── 왜 원장(append-only)인가 ──────────────────────────────────────────────────
-- 마감/해제를 한 행의 status로 다루면 재마감할 때 이전 스냅샷이 덮어써집니다. 급여 근거는
-- "그때 무엇을 보고 지급했는가"라서 지워지면 안 됩니다. 그래서 마감·해제를 각각 한 행으로
-- 쌓고, 현재 상태는 그 달의 마지막 행으로 봅니다. 감사 로그와 같은 철학입니다.
--
-- ── 무엇을 막고 무엇을 막지 않는가 ────────────────────────────────────────────
--   막는다  : 마감된 달의 정정 요청 (요청 시점과 승인 시점 둘 다 확인)
--   안 막는다: 새 기록. 월말 야근이 자정을 넘겨 지난달로 귀속될 수 있고(0010), 그때 퇴근을
--             못 찍게 하면 더 큰 문제가 됩니다. 대신 '마감 후 변경됨'을 관리자 화면에 띄워
--             소급 처리하게 합니다. 스냅샷이 있으니 무엇이 달라졌는지 대조할 수 있습니다.

create table if not exists public.attendance_closings (
  id bigserial primary key,
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  period_month date not null,
  action text not null check (action in ('close', 'reopen')),
  actor_id uuid,
  acted_at timestamptz not null default now(),
  note text,
  -- 마감 시점의 get_attendance_summary 결과. 해제 행에는 없습니다.
  snapshot jsonb,
  constraint attendance_closings_month_start check (extract(day from period_month) = 1),
  constraint attendance_closings_snapshot_pairing check ((action = 'close') = (snapshot is not null))
);

create index if not exists attendance_closings_lookup_idx
  on public.attendance_closings (workspace_id, period_month, acted_at desc, id desc);

alter table public.attendance_closings enable row level security;
-- 스냅샷에는 워크스페이스 전원의 근태가 들어 있어 직접 읽기를 열지 않습니다(RPC로만).
revoke all on public.attendance_closings from anon, authenticated;
revoke all on sequence public.attendance_closings_id_seq from anon, authenticated;

-- ── 현재 상태 ────────────────────────────────────────────────────────────────
create or replace function public.is_attendance_month_closed(target_workspace_id uuid, target_date date)
returns boolean language sql stable security definer set search_path = public
as $fn$
  select coalesce((
    select c.action = 'close'
    from public.attendance_closings c
    where c.workspace_id = target_workspace_id
      and c.period_month = date_trunc('month', target_date)::date
    order by c.acted_at desc, c.id desc
    limit 1
  ), false)
$fn$;

-- ── 마감 ─────────────────────────────────────────────────────────────────────
create or replace function public.close_attendance_month(
  target_workspace_id uuid, target_month date, note text default null
) returns bigint language plpgsql security definer set search_path = public
as $fn$
declare month_start date := date_trunc('month', target_month)::date;
        month_end date; today date := (now() at time zone 'Asia/Seoul')::date;
        snap jsonb; new_id bigint;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  month_end := (month_start + interval '1 month' - interval '1 day')::date;

  -- 진행 중인 달을 마감하면 남은 날의 기록이 전부 '마감 후 변경'으로 쌓입니다.
  if month_end >= today then
    raise exception '%은 아직 끝나지 않았습니다. %부터 마감할 수 있습니다.',
      to_char(month_start, 'YYYY년 FMMM월'), to_char(month_end + 1, 'YYYY-MM-DD');
  end if;
  if public.is_attendance_month_closed(target_workspace_id, month_start) then
    raise exception '%은 이미 마감되었습니다.', to_char(month_start, 'YYYY년 FMMM월');
  end if;

  -- 지급 근거가 될 값을 이 시점 그대로 박제합니다.
  snap := public.get_attendance_summary(target_workspace_id, month_start, month_end, null);

  insert into public.attendance_closings (workspace_id, period_month, action, actor_id, note, snapshot)
  values (target_workspace_id, month_start, 'close', auth.uid(), nullif(btrim(coalesce(note, '')), ''), snap)
  returning id into new_id;
  return new_id;
end $fn$;

-- ── 해제 ─────────────────────────────────────────────────────────────────────
-- 되돌릴 수 있어야 하지만, 왜 되돌렸는지가 남아야 합니다.
create or replace function public.reopen_attendance_month(
  target_workspace_id uuid, target_month date, reason text
) returns bigint language plpgsql security definer set search_path = public
as $fn$
declare month_start date := date_trunc('month', target_month)::date; new_id bigint;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  if not public.is_attendance_month_closed(target_workspace_id, month_start) then
    raise exception '%은 마감된 상태가 아닙니다.', to_char(month_start, 'YYYY년 FMMM월');
  end if;
  if char_length(btrim(coalesce(reason, ''))) < 5 then
    raise exception '마감을 해제하는 사유를 5자 이상 적어 주세요.';
  end if;

  insert into public.attendance_closings (workspace_id, period_month, action, actor_id, note)
  values (target_workspace_id, month_start, 'reopen', auth.uid(), btrim(reason))
  returning id into new_id;
  return new_id;
end $fn$;

-- ── 목록 ─────────────────────────────────────────────────────────────────────
-- changedAfter: 마감 이후에 만들어지거나 바뀐 기록 수. 0이 아니면 스냅샷과 현재가 다릅니다.
create or replace function public.list_attendance_closings(
  target_workspace_id uuid, from_month date, to_month date
) returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
declare result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'month', c.period_month,
    'closed', c.action = 'close',
    'actedAt', c.acted_at,
    'actor', coalesce(u.nickname, u.username, '관리자'),
    'note', c.note,
    'changedAfter', case when c.action = 'close' then (
      select count(*) from public.commute_records r
      where r.workspace_id = target_workspace_id
        and r.date between c.period_month and (c.period_month + interval '1 month' - interval '1 day')::date
        and (r.created_at > c.acted_at or r.updated_at > c.acted_at)
    ) else 0 end
  ) order by c.period_month desc), '[]'::jsonb) into result
  from (
    select distinct on (period_month) *
    from public.attendance_closings
    where workspace_id = target_workspace_id
      and period_month between date_trunc('month', from_month)::date and date_trunc('month', to_month)::date
    order by period_month, acted_at desc, id desc
  ) c
  left join public.users u on u.id = c.actor_id::text;

  return result;
end $fn$;

-- 마감 시점 스냅샷. 전원의 근태가 들어 있어 관리자만 볼 수 있습니다.
create or replace function public.get_closing_snapshot(target_workspace_id uuid, target_month date)
returns jsonb language plpgsql stable security definer set search_path = public
as $fn$
declare snap jsonb;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select c.snapshot into snap from public.attendance_closings c
  where c.workspace_id = target_workspace_id
    and c.period_month = date_trunc('month', target_month)::date
    and c.action = 'close'
  order by c.acted_at desc, c.id desc limit 1;
  if snap is null then raise exception '마감 기록이 없습니다.'; end if;
  return snap;
end $fn$;

-- ── 마감된 달은 정정할 수 없다 ────────────────────────────────────────────────
create or replace function public.request_commute_correction(
  target_record_id uuid,
  new_start timestamptz,
  new_end timestamptz,
  new_type text,
  reason text
) returns uuid language plpgsql security definer set search_path = public
as $fn$
declare target public.commute_records; created_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into target from public.commute_records where id = target_record_id;
  if target.id is null or target.user_id <> auth.uid()::text then raise exception '내 기록만 정정 요청할 수 있습니다.'; end if;
  if target.workspace_id is null then raise exception '워크스페이스에 속한 기록만 정정 요청할 수 있습니다. 관리자에게 초대를 요청해 주세요.'; end if;
  if public.is_attendance_month_closed(target.workspace_id, target.date) then
    raise exception '%은 마감되어 정정할 수 없습니다. 관리자에게 문의해 주세요.', to_char(target.date, 'YYYY년 FMMM월');
  end if;
  if new_start is null and new_end is null and new_type is null then raise exception '바꿀 값을 하나 이상 입력해 주세요.'; end if;
  if new_start is not null and new_end is not null and new_end < new_start then raise exception '도착 시각이 출발 시각보다 이릅니다.'; end if;
  if coalesce(new_start, new_end) > now() + interval '5 minutes' then raise exception '미래 시각으로는 정정할 수 없습니다.'; end if;
  if exists (select 1 from public.commute_correction_requests where record_id = target_record_id and status = 'pending') then
    raise exception '이미 검토 대기 중인 정정 요청이 있습니다.';
  end if;

  insert into public.commute_correction_requests (record_id, user_id, workspace_id, requested_start, requested_end, requested_type, reason)
  values (target_record_id, target.user_id, target.workspace_id, new_start, new_end, new_type, btrim(reason))
  returning id into created_id;
  return created_id;
end $fn$;

-- 요청한 뒤에 마감됐을 수 있으므로 승인 시점에도 확인합니다.
create or replace function public.review_commute_correction(target_request_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = public
as $fn$
declare request public.commute_correction_requests; target public.commute_records;
        next_start timestamptz; next_end timestamptz; next_type text;
begin
  select * into request from public.commute_correction_requests where id = target_request_id for update;
  if request.id is null then raise exception '정정 요청을 찾을 수 없습니다.'; end if;
  if request.status <> 'pending' then raise exception '이미 처리된 요청입니다.'; end if;
  if not public.is_chat_workspace_admin(request.workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  -- 근태 정정은 자기 승인이 되면 통제 장치가 아니게 됩니다.
  if request.user_id = auth.uid()::text then raise exception '본인 기록의 정정은 다른 관리자가 승인해야 합니다.'; end if;

  if approve then
    select * into target from public.commute_records where id = request.record_id for update;
    if target.id is null then raise exception '원본 기록이 삭제되었습니다.'; end if;
    if public.is_attendance_month_closed(request.workspace_id, target.date) then
      raise exception '%은 마감되어 승인할 수 없습니다. 마감을 해제한 뒤 처리해 주세요.', to_char(target.date, 'YYYY년 FMMM월');
    end if;
    next_start := coalesce(request.requested_start, target.start_time);
    next_end := coalesce(request.requested_end, target.end_time);
    next_type := coalesce(request.requested_type, target.type);

    update public.commute_records set
      start_time = next_start,
      end_time = next_end,
      type = next_type,
      duration_minutes = case
        when next_start is not null and next_end is not null
        then greatest(0, round(extract(epoch from (next_end - next_start)) / 60))::int
        else duration_minutes end,
      corrected_at = now(),
      corrected_by = auth.uid(),
      updated_at = now()
    where id = request.record_id;
  end if;

  update public.commute_correction_requests set
    status = case when approve then 'approved' else 'rejected' end,
    reviewer_id = auth.uid(),
    reviewer_note = nullif(btrim(coalesce(note, '')), ''),
    reviewed_at = now()
  where id = target_request_id;
end $fn$;

-- ── 권한 ─────────────────────────────────────────────────────────────────────
revoke all on function public.is_attendance_month_closed(uuid, date) from public, anon, authenticated;
revoke all on function
  public.close_attendance_month(uuid, date, text),
  public.reopen_attendance_month(uuid, date, text),
  public.list_attendance_closings(uuid, date, date),
  public.get_closing_snapshot(uuid, date),
  public.request_commute_correction(uuid, timestamptz, timestamptz, text, text),
  public.review_commute_correction(uuid, boolean, text)
from public, anon;
grant execute on function
  public.close_attendance_month(uuid, date, text),
  public.reopen_attendance_month(uuid, date, text),
  public.list_attendance_closings(uuid, date, date),
  public.get_closing_snapshot(uuid, date),
  public.request_commute_correction(uuid, timestamptz, timestamptz, text, text),
  public.review_commute_correction(uuid, boolean, text)
to authenticated, service_role;
