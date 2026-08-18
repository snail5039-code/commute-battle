-- 공휴일 자동 갱신 (2026-08-18)
--
-- 0011로 공휴일 달력을 만들었지만 **관리자가 매년 직접 눌러야** 채워졌습니다. 안 누르면 그 해
-- 공휴일이 통째로 비고, 휴일근로 가산과 휴가 일수 계산이 전부 틀어집니다. 사람 손을 타는 자리를
-- 없앱니다.
--
-- 왜 크론이 아니라 '관리자가 앱을 열 때'인가:
--   서버 혼자 돌리려면 서비스 롤 키를 배포 환경에 새로 심어야 합니다. 키가 하나 늘면 그만큼
--   샐 구멍도 늘고, 정작 이 일은 하루에 한 번 이상 할 필요가 없는 일입니다. 관리자는 어차피
--   직원이라 앱을 매일 엽니다. 그때 조용히 채웁니다.
--
-- 언제 무엇을 당겨오는가:
--   올해      — 항상. (비어 있는 채로 굴러가는 일이 없도록 하는 안전망)
--   내년      — 7월부터. 한국천문연구원 특일 정보가 대개 그맘때 다음 해를 공개합니다.
--               연초에 이미 들어와 있으면 "1월 1일에 아무도 안 눌러서 비어 있다"가 아예 안 생깁니다.
--
-- 성공해도 7일마다 다시 확인합니다. **임시공휴일(선거일 등)은 연중에 추가되기 때문**입니다.
-- 한 번 받고 끝내면 그해 중간에 생긴 휴일을 영영 모릅니다.
-- 저장은 overwrite=false로 하므로 관리자가 손본 이름과 자체 휴일은 덮이지 않습니다.

create table if not exists public.work_holiday_syncs (
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  attempted_at timestamptz not null default now(),
  succeeded_at timestamptz,
  imported_count integer not null default 0,
  note text,
  primary key (workspace_id, year)
);

alter table public.work_holiday_syncs enable row level security;
drop policy if exists "members read holiday syncs" on public.work_holiday_syncs;
create policy "members read holiday syncs" on public.work_holiday_syncs
  for select to authenticated using (public.is_chat_workspace_member(workspace_id));
revoke all on public.work_holiday_syncs from anon, authenticated;
grant select on public.work_holiday_syncs to authenticated;

-- ── 지금 당겨와야 하는 해 ─────────────────────────────────────────────────────
-- 관리자가 아니면 **예외가 아니라 빈 배열**을 돌려줍니다. 이 함수는 로그인한 모든 사용자의
-- 앱 시작 시점에 불립니다. 일반 구성원이 앱을 열 때마다 권한 오류를 보면 안 됩니다.
create or replace function public.holiday_sync_due(target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare today date; this_year integer; candidates integer[]; result jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  if not public.is_chat_workspace_admin(target_workspace_id) then return '[]'::jsonb; end if;

  today := (now() at time zone 'Asia/Seoul')::date;
  this_year := extract(year from today)::integer;
  candidates := case when extract(month from today) >= 7
    then array[this_year, this_year + 1] else array[this_year] end;

  select coalesce(jsonb_agg(y order by y), '[]'::jsonb) into result
  from unnest(candidates) y
  where not exists (
    select 1 from public.work_holiday_syncs s
    where s.workspace_id = target_workspace_id and s.year = y
      and s.attempted_at > now() - case
            -- 아직 한 번도 성공한 적 없으면 하루 뒤에 다시. (키가 없거나 API가 죽었을 때
            --  앱을 열 때마다 두드리지 않게 하는 제동)
            when s.succeeded_at is null then interval '1 day'
            -- 성공했어도 7일마다 다시. 임시공휴일이 연중에 추가되기 때문.
            else interval '7 days' end
  );

  return result;
end $$;

-- ── 시도 기록 ─────────────────────────────────────────────────────────────────
-- 가져오기 **전에** 한 번(ok=false로 자리 맡기), 끝나고 한 번 부릅니다.
-- 미리 맡아 두지 않으면, 가져오다 브라우저가 닫혔을 때 attempted_at이 안 남아
-- 다음 접속 때 또 두드립니다. 실패도 제동이 걸려야 합니다.
create or replace function public.record_holiday_sync(
  target_workspace_id uuid, target_year integer, imported integer, ok boolean, note text default null
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  if target_year < 2000 or target_year > 2100 then raise exception '연도가 올바르지 않습니다.'; end if;

  insert into public.work_holiday_syncs as h (workspace_id, year, attempted_at, succeeded_at, imported_count, note)
  values (target_workspace_id, target_year, now(),
          case when ok then now() end,
          greatest(coalesce(imported, 0), 0),
          nullif(btrim(coalesce(note, '')), ''))
  on conflict (workspace_id, year) do update set
    attempted_at = now(),
    -- 실패했다고 지난 성공 기록을 지우지 않습니다. "마지막으로 성공한 게 언제인가"가
    -- 관리자에게 필요한 정보입니다.
    succeeded_at = case when ok then now() else h.succeeded_at end,
    imported_count = case when ok then excluded.imported_count else h.imported_count end,
    note = excluded.note;
end $$;

-- ── 현황 (관리자 화면 표시용) ─────────────────────────────────────────────────
create or replace function public.list_holiday_syncs(target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 구성원이 아닙니다.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'year', s.year,
    'attemptedAt', s.attempted_at,
    'succeededAt', s.succeeded_at,
    'importedCount', s.imported_count,
    'note', s.note
  ) order by s.year desc), '[]'::jsonb) into result
  from public.work_holiday_syncs s
  where s.workspace_id = target_workspace_id;

  return result;
end $$;

-- ── 권한 ──────────────────────────────────────────────────────────────────────
revoke all on function
  public.holiday_sync_due(uuid),
  public.record_holiday_sync(uuid, integer, integer, boolean, text),
  public.list_holiday_syncs(uuid)
from public, anon;

grant execute on function
  public.holiday_sync_due(uuid),
  public.record_holiday_sync(uuid, integer, integer, boolean, text),
  public.list_holiday_syncs(uuid)
to authenticated, service_role;
