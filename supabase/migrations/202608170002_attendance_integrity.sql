-- 근태 기록 신뢰성 (2026-08-17)
--
-- 기록이 임금 근거가 되려면 "직원이 원하는 값을 넣을 수 있는 상태"여서는 안 됩니다. 이 마이그레이션은
--   1) 시각을 서버(Postgres now())만 찍게 하고
--   2) 직원이 자기 기록을 직접 insert/update/delete 하지 못하게 막고 (RPC로만 기록)
--   3) 모든 변경을 감사 로그에 남기고
--   4) 잘못된 기록은 "정정 요청 → 다른 관리자 승인"으로만 바뀌게 합니다.
--
-- 함께 고치는 버그: start_time/end_time이 timestamp(타임존 없음)인데 앱이 UTC 문자열을 넣고
-- 브라우저는 그 값을 현지 시각으로 읽어서, 모든 시각이 9시간 밀려 보이고 이동 시간이 약 540분씩
-- 부풀려져 있었습니다. 컬럼을 timestamptz로 바꾸고 기존 duration_minutes를 다시 계산합니다.

-- ── 1. 스키마 정합성 ──────────────────────────────────────────────────────────
-- 앱은 예전부터 type='return'을 넣고 있었지만 초기 스키마 제약에는 빠져 있었습니다.
alter table public.commute_records drop constraint if exists commute_records_type_check;
alter table public.commute_records add constraint commute_records_type_check
  check (type in ('commute', 'return', 'early_leave', 'vacation', 'sick', 'absence'));

-- 기존 값은 UTC 벽시계로 저장돼 있으므로 UTC로 해석해 변환합니다.
-- 이미 timestamptz로 바뀐 뒤 이 파일을 다시 실행하면 시각이 반대로 밀리므로, 현재 타입을 보고 한 번만 바꿉니다.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'commute_records' and column_name = 'start_time') = 'timestamp without time zone' then
    alter table public.commute_records
      alter column start_time type timestamptz using start_time at time zone 'UTC',
      alter column end_time type timestamptz using end_time at time zone 'UTC',
      alter column created_at type timestamptz using created_at at time zone 'UTC',
      alter column updated_at type timestamptz using updated_at at time zone 'UTC';

    -- 9시간이 섞여 들어간 과거 이동 시간을 실제 값으로 되돌립니다(평균 568분 → 실제 약 28분).
    update public.commute_records
    set duration_minutes = greatest(0, round(extract(epoch from (end_time - start_time)) / 60))::int
    where start_time is not null and end_time is not null;
  end if;
end $$;

alter table public.commute_records add column if not exists workspace_id uuid references public.chat_workspaces(id) on delete set null;
alter table public.commute_records add column if not exists server_recorded_at timestamptz not null default now();
alter table public.commute_records add column if not exists corrected_at timestamptz;
alter table public.commute_records add column if not exists corrected_by uuid;

create index if not exists commute_records_workspace_date_idx on public.commute_records (workspace_id, date);

-- ── 2. 감사 로그 (append-only) ────────────────────────────────────────────────
create table if not exists public.commute_record_audits (
  id bigserial primary key,
  record_id uuid not null,
  user_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid,
  before jsonb,
  after jsonb,
  logged_at timestamptz not null default now()
);

create index if not exists commute_record_audits_record_idx on public.commute_record_audits (record_id, logged_at desc);
create index if not exists commute_record_audits_user_idx on public.commute_record_audits (user_id, logged_at desc);

create or replace function public.log_commute_record_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.commute_record_audits (record_id, user_id, action, actor_id, before, after)
  values (
    coalesce(new.id, old.id),
    coalesce(new.user_id, old.user_id),
    lower(tg_op),
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists commute_records_audit on public.commute_records;
create trigger commute_records_audit
after insert or update or delete on public.commute_records
for each row execute function public.log_commute_record_change();

-- 감사 로그는 정책이 없는 상태로 RLS를 켜서, security definer 함수 외에는 아무도 못 읽고 못 씁니다.
alter table public.commute_record_audits enable row level security;
revoke all on public.commute_record_audits from authenticated, anon;
revoke all on sequence public.commute_record_audits_id_seq from authenticated, anon;

-- ── 3. 직접 쓰기 차단 ─────────────────────────────────────────────────────────
drop policy if exists "users create own commute records" on public.commute_records;
drop policy if exists "users update own commute records" on public.commute_records;
drop policy if exists "users delete own commute records" on public.commute_records;
revoke insert, update, delete on public.commute_records from authenticated;
grant select on public.commute_records to authenticated;

-- ── 4. 기록 RPC (시각은 여기서만 만들어집니다) ─────────────────────────────────
create or replace function public.attendance_guard_workspace(target_workspace_id uuid)
returns void language plpgsql stable security definer set search_path = public
as $$ begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if target_workspace_id is not null and not public.is_chat_workspace_member(target_workspace_id) then
    raise exception '해당 워크스페이스의 구성원이 아닙니다.';
  end if;
end $$;

create or replace function public.attendance_start(record_type text, target_workspace_id uuid default null)
returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare created public.commute_records;
begin
  perform public.attendance_guard_workspace(target_workspace_id);
  if record_type not in ('commute', 'return') then raise exception '출근 또는 퇴근만 시작할 수 있습니다.'; end if;
  if exists (
    select 1 from public.commute_records
    where user_id = auth.uid()::text and end_time is null and type in ('commute', 'return')
  ) then
    raise exception '아직 도착 처리되지 않은 기록이 있습니다.';
  end if;

  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, is_on_time, exp_gained)
  values (auth.uid()::text, target_workspace_id, (now() at time zone 'Asia/Seoul')::date, record_type, 'start', now(), false, 0)
  returning * into created;
  return created;
end $$;

-- self_on_time은 사내 근무 스케줄이 아직 서버에 없어서 클라이언트가 계산한 값입니다.
-- 캐릭터 경험치(게임 요소) 전용이며 근태 판정 근거로 쓰지 않습니다.
create or replace function public.attendance_finish(target_record_id uuid, self_on_time boolean default false)
returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare target public.commute_records; finished timestamptz := now();
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into target from public.commute_records where id = target_record_id for update;
  if target.id is null or target.user_id <> auth.uid()::text then raise exception '내 기록만 도착 처리할 수 있습니다.'; end if;
  if target.type not in ('commute', 'return') or target.start_time is null then raise exception '이동 중인 기록만 도착 처리할 수 있습니다.'; end if;
  if target.end_time is not null then raise exception '이미 도착 처리된 기록입니다.'; end if;

  update public.commute_records set
    end_time = finished,
    commute_subtype = 'arrival',
    duration_minutes = greatest(0, round(extract(epoch from (finished - target.start_time)) / 60))::int,
    is_on_time = coalesce(self_on_time, false),
    exp_gained = case when coalesce(self_on_time, false) then 15 else 10 end,
    updated_at = finished
  where id = target_record_id
  returning * into target;
  return target;
end $$;

-- 재택근무는 이동이 없어 출발·도착을 나누지 않습니다.
create or replace function public.attendance_record_instant(record_type text, target_workspace_id uuid default null)
returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare created public.commute_records; stamped timestamptz := now();
begin
  perform public.attendance_guard_workspace(target_workspace_id);
  if record_type not in ('commute', 'return') then raise exception '출근 또는 퇴근만 기록할 수 있습니다.'; end if;

  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time, duration_minutes, is_on_time, exp_gained)
  values (auth.uid()::text, target_workspace_id, (stamped at time zone 'Asia/Seoul')::date, record_type, 'arrival', stamped, stamped, 0, true, 15)
  returning * into created;
  return created;
end $$;

create or replace function public.attendance_record_event(record_type text, target_workspace_id uuid default null)
returns public.commute_records language plpgsql security definer set search_path = public
as $$
declare created public.commute_records;
begin
  perform public.attendance_guard_workspace(target_workspace_id);
  if record_type not in ('early_leave', 'vacation', 'sick', 'absence') then raise exception '조퇴·휴가·병가·결근만 기록할 수 있습니다.'; end if;

  insert into public.commute_records (user_id, workspace_id, date, type, is_on_time, exp_gained)
  values (auth.uid()::text, target_workspace_id, (now() at time zone 'Asia/Seoul')::date, record_type, false, 0)
  returning * into created;
  return created;
end $$;

-- ── 5. 정정 요청 · 승인 ───────────────────────────────────────────────────────
create table if not exists public.commute_correction_requests (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.commute_records(id) on delete cascade,
  user_id text not null,
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  requested_start timestamptz,
  requested_end timestamptz,
  requested_type text check (requested_type is null or requested_type in ('commute', 'return', 'early_leave', 'vacation', 'sick', 'absence')),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists commute_correction_one_pending
  on public.commute_correction_requests (record_id) where status = 'pending';
create index if not exists commute_correction_workspace_idx
  on public.commute_correction_requests (workspace_id, status, created_at desc);

alter table public.commute_correction_requests enable row level security;
drop policy if exists "users read own correction requests" on public.commute_correction_requests;
create policy "users read own correction requests" on public.commute_correction_requests
  for select to authenticated using (user_id = auth.uid()::text);
revoke all on public.commute_correction_requests from authenticated, anon;
grant select on public.commute_correction_requests to authenticated;

create or replace function public.request_commute_correction(
  target_record_id uuid,
  new_start timestamptz,
  new_end timestamptz,
  new_type text,
  reason text
) returns uuid language plpgsql security definer set search_path = public
as $$
declare target public.commute_records; created_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into target from public.commute_records where id = target_record_id;
  if target.id is null or target.user_id <> auth.uid()::text then raise exception '내 기록만 정정 요청할 수 있습니다.'; end if;
  if target.workspace_id is null then raise exception '워크스페이스에 속한 기록만 정정 요청할 수 있습니다. 관리자에게 초대를 요청해 주세요.'; end if;
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
end $$;

create or replace function public.review_commute_correction(target_request_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = public
as $$
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
end $$;

create or replace function public.list_commute_corrections(target_workspace_id uuid, include_reviewed boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select coalesce(jsonb_agg(item order by item->>'createdAt' desc), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', q.id,
      'recordId', q.record_id,
      'userId', q.user_id,
      'nickname', coalesce(u.nickname, u.username, '동료'),
      'status', q.status,
      'reason', q.reason,
      'createdAt', q.created_at,
      'reviewedAt', q.reviewed_at,
      'reviewerNote', q.reviewer_note,
      'requestedStart', q.requested_start,
      'requestedEnd', q.requested_end,
      'requestedType', q.requested_type,
      'currentDate', r.date,
      'currentType', r.type,
      'currentStart', r.start_time,
      'currentEnd', r.end_time,
      'isMine', q.user_id = auth.uid()::text
    ) as item
    from public.commute_correction_requests q
    left join public.commute_records r on r.id = q.record_id
    left join public.users u on u.id = q.user_id
    where q.workspace_id = target_workspace_id
      and (include_reviewed or q.status = 'pending')
    order by q.created_at desc
    limit 200
  ) rows;
  return result;
end $$;

create or replace function public.get_commute_audit(target_workspace_id uuid, target_user_id text default null, max_rows integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', a.id, 'recordId', a.record_id, 'userId', a.user_id, 'action', a.action,
      'actorId', a.actor_id, 'loggedAt', a.logged_at,
      'beforeStart', a.before->>'start_time', 'afterStart', a.after->>'start_time',
      'beforeEnd', a.before->>'end_time', 'afterEnd', a.after->>'end_time',
      'beforeType', a.before->>'type', 'afterType', a.after->>'type'
    ) as item
    from public.commute_record_audits a
    where exists (
        select 1 from public.chat_workspace_members m
        where m.workspace_id = target_workspace_id and m.user_id::text = a.user_id
      )
      and (target_user_id is null or a.user_id = target_user_id)
    order by a.logged_at desc
    limit least(greatest(max_rows, 1), 500)
  ) rows;
  return result;
end $$;

-- ── 6. 권한 ──────────────────────────────────────────────────────────────────
-- log_commute_record_change는 트리거 전용이라 직접 호출하면 오류가 납니다. 권한을 건드리면
-- 트리거 자체가 막힐 수 있어 기본값을 그대로 둡니다.
revoke all on function public.attendance_guard_workspace(uuid) from public, anon;
grant execute on function
  public.attendance_start(text, uuid),
  public.attendance_finish(uuid, boolean),
  public.attendance_record_instant(text, uuid),
  public.attendance_record_event(text, uuid),
  public.request_commute_correction(uuid, timestamptz, timestamptz, text, text),
  public.review_commute_correction(uuid, boolean, text),
  public.list_commute_corrections(uuid, boolean),
  public.get_commute_audit(uuid, text, integer)
to authenticated;
