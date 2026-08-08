-- 퀘스트 보상 수령 여부를 localStorage에만 저장하던 것을 서버로 옮긴다.
-- (user_id, claim_key) 유니크 제약이 곧 "이미 받았음"을 원자적으로 보장하는 잠금 역할을 한다 —
-- 시크릿창/다른 기기에서 같은 퀘스트를 다시 클레임해도 두 번째 insert가 그냥 실패한다.
-- 나머지 테이블(users/commute_records/badges)과 마찬가지로 RLS는 켜지 않는다 — 이건 별개로
-- 이미 알려진 이슈이고, 이번 변경의 목적은 보안 강화가 아니라 중복 클레임 방지다.
create table if not exists public.quest_claims (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  claim_key text not null,
  rewarded_record_ids text[] not null default '{}',
  claimed_at timestamptz not null default now(),
  constraint quest_claims_unique unique (user_id, claim_key)
);
create index if not exists quest_claims_user_id_idx on public.quest_claims (user_id);
grant select, insert on public.quest_claims to anon, authenticated;
