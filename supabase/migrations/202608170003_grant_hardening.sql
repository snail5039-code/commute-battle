-- 권한 정리 (2026-08-17)
--
-- Supabase는 public 스키마의 새 테이블에 anon/authenticated 앞으로 기본적으로 모든 권한을 부여합니다.
-- RLS가 걸러 주는 것은 select/insert/update/delete 뿐이고 TRUNCATE는 걸러 주지 않습니다.
-- 즉 로그인만 하면 근태 원장(commute_records)을 포함한 18개 테이블을 통째로 비울 수 있는 상태였습니다.

revoke truncate, trigger, references on all tables in schema public from authenticated, anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated, anon;

-- quest_claims는 RLS 자체가 꺼져 있었고 anon에게도 읽기·쓰기·삭제가 열려 있었습니다.
-- 이 테이블이 "퀘스트 보상을 이미 받았는지"를 판단하는 유일한 근거라, 지울 수 있으면 중복 수령이 가능합니다.
alter table public.quest_claims enable row level security;

drop policy if exists "users read own quest claims" on public.quest_claims;
create policy "users read own quest claims" on public.quest_claims
  for select to authenticated using (user_id = auth.uid()::text);
drop policy if exists "users create own quest claims" on public.quest_claims;
create policy "users create own quest claims" on public.quest_claims
  for insert to authenticated with check (user_id = auth.uid()::text);

revoke all on public.quest_claims from anon;
revoke update, delete on public.quest_claims from authenticated;
grant select, insert on public.quest_claims to authenticated;

-- 정책이 없어 접근은 이미 막혀 있었지만, 남은 권한도 정리합니다.
revoke all on public.chat_platform_admins from anon;
