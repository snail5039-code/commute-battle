-- 재택근무 신청·승인 (2026-08-17)
--
-- 지금까지 '재택' 여부는 기기 localStorage 설정이었습니다. 직원이 스스로 재택으로 바꾸면 이동 없이
-- 출퇴근이 한 번에 기록되니, 위치 검증(지오펜스)을 붙여도 "오늘 재택"이라고 하면 그냥 우회됩니다.
-- 그래서 워크스페이스에 속한 기록은 승인된 재택 신청이 있는 날만 재택으로 기록되게 막습니다.
--
-- 관리자가 자기 신청을 승인하는 것은 막지 않습니다(관리자가 한 명인 워크스페이스가 아예 막히므로).
-- 대신 승인자를 항상 남기고 화면에 '본인 승인'으로 표시합니다. 임금을 직접 바꾸는 근태 정정과 달리
-- 재택 승인은 되돌릴 수 있는 운영 판단이라 이렇게 구분했습니다.

create table if not exists public.remote_work_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  user_id text not null,
  work_date date not null,
  reason text not null check (char_length(btrim(reason)) between 2 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewer_id uuid,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 같은 날짜에 살아 있는 신청은 하나만 둡니다(반려·취소된 건 다시 신청할 수 있게 예외).
create unique index if not exists remote_work_one_active
  on public.remote_work_requests (workspace_id, user_id, work_date)
  where status in ('pending', 'approved');
create index if not exists remote_work_workspace_idx
  on public.remote_work_requests (workspace_id, status, work_date desc);

alter table public.remote_work_requests enable row level security;
drop policy if exists "users read own remote work" on public.remote_work_requests;
create policy "users read own remote work" on public.remote_work_requests
  for select to authenticated using (user_id = auth.uid()::text);
revoke all on public.remote_work_requests from anon, authenticated;
grant select on public.remote_work_requests to authenticated;

create or replace function public.request_remote_work(target_workspace_id uuid, target_date date, reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare created_id uuid; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;
  if target_date < today - 31 or target_date > today + 62 then raise exception '신청 가능한 날짜 범위를 벗어났습니다.'; end if;
  if char_length(btrim(reason)) < 2 then raise exception '사유를 입력해 주세요.'; end if;
  if exists (
    select 1 from public.remote_work_requests
    where workspace_id = target_workspace_id and user_id = auth.uid()::text
      and work_date = target_date and status in ('pending', 'approved')
  ) then
    raise exception '이 날짜에는 이미 신청이 있습니다.';
  end if;

  insert into public.remote_work_requests (workspace_id, user_id, work_date, reason)
  values (target_workspace_id, auth.uid()::text, target_date, btrim(reason))
  returning id into created_id;
  return created_id;
end $$;

create or replace function public.cancel_remote_work(target_request_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare target public.remote_work_requests;
begin
  select * into target from public.remote_work_requests where id = target_request_id for update;
  if target.id is null or target.user_id <> auth.uid()::text then raise exception '내 신청만 취소할 수 있습니다.'; end if;
  if target.status <> 'pending' then raise exception '검토 대기 중인 신청만 취소할 수 있습니다. 승인된 신청은 관리자에게 문의해 주세요.'; end if;
  update public.remote_work_requests set status = 'cancelled' where id = target_request_id;
end $$;

create or replace function public.review_remote_work(target_request_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare target public.remote_work_requests;
begin
  select * into target from public.remote_work_requests where id = target_request_id for update;
  if target.id is null then raise exception '신청을 찾을 수 없습니다.'; end if;
  if not public.is_chat_workspace_admin(target.workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  if target.status not in ('pending', 'approved') then raise exception '이미 처리된 신청입니다.'; end if;

  update public.remote_work_requests set
    status = case when approve then 'approved' else 'rejected' end,
    reviewer_id = auth.uid(),
    reviewer_note = nullif(btrim(coalesce(note, '')), ''),
    reviewed_at = now()
  where id = target_request_id;
end $$;

create or replace function public.list_remote_work(
  target_workspace_id uuid,
  from_date date,
  to_date date,
  only_pending boolean default false
) returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare scope text; result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;
  if public.is_chat_workspace_admin(target_workspace_id) then scope := null; else scope := auth.uid()::text; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'userId', q.user_id,
    'nickname', coalesce(u.nickname, u.username, '동료'),
    'workDate', q.work_date,
    'reason', q.reason,
    'status', q.status,
    'reviewerNote', q.reviewer_note,
    'reviewedAt', q.reviewed_at,
    'createdAt', q.created_at,
    'isMine', q.user_id = auth.uid()::text,
    'selfApproved', q.reviewer_id is not null and q.reviewer_id::text = q.user_id
  ) order by q.work_date desc, coalesce(u.nickname, u.username, '동료')), '[]'::jsonb) into result
  from public.remote_work_requests q
  left join public.users u on u.id = q.user_id
  where q.workspace_id = target_workspace_id
    and q.work_date between from_date and to_date
    and (scope is null or q.user_id = scope)
    and (not only_pending or q.status = 'pending')
  limit 300;

  return result;
end $$;

-- 재택 기록은 승인된 신청이 있는 날만 허용합니다(워크스페이스에 속하지 않은 개인 기록은 예외).
create or replace function public.attendance_record_instant(record_type text, target_workspace_id uuid default null)
returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare created public.commute_records; stamped timestamptz := now(); work_day date;
begin
  perform public.attendance_guard_workspace(target_workspace_id);
  if record_type not in ('commute', 'return') then raise exception '출근 또는 퇴근만 기록할 수 있습니다.'; end if;
  work_day := (stamped at time zone 'Asia/Seoul')::date;

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

revoke all on function
  public.request_remote_work(uuid, date, text),
  public.cancel_remote_work(uuid),
  public.review_remote_work(uuid, boolean, text),
  public.list_remote_work(uuid, date, date, boolean)
from public, anon;
grant execute on function
  public.request_remote_work(uuid, date, text),
  public.cancel_remote_work(uuid),
  public.review_remote_work(uuid, boolean, text),
  public.list_remote_work(uuid, date, date, boolean)
to authenticated, service_role;
