-- Anonymous/temp app users are read-only. Authenticated posts are tied to auth.uid().
-- Notices are seeded here; no client UPDATE/DELETE policy is intentionally provided.
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('notice', 'free', 'feedback')),
  title text not null check (char_length(btrim(title)) between 2 and 60),
  content text not null check (char_length(btrim(content)) between 5 and 1200),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_post_author check ((category = 'notice' and author_id is null) or (category in ('free', 'feedback') and author_id is not null))
);
create index if not exists community_posts_category_created_at_idx on public.community_posts (category, created_at desc);
alter table public.community_posts enable row level security;
drop policy if exists "community posts are publicly readable" on public.community_posts;
create policy "community posts are publicly readable" on public.community_posts for select to anon, authenticated using (true);
drop policy if exists "authenticated users create their own posts" on public.community_posts;
create policy "authenticated users create their own posts" on public.community_posts for insert to authenticated with check (category in ('free', 'feedback') and author_id = auth.uid());

insert into public.community_posts (id, category, title, content, author_id, created_at) values
('10000000-0000-4000-8000-000000000001','notice','출퇴근 배틀 커뮤니티에 오신 것을 환영합니다','출퇴근 경험과 유용한 정보를 편안하게 나누는 공간입니다. 서로를 배려하는 표현으로 즐겁게 참여해 주세요.',null,'2026-08-05T00:00:00Z'),
('10000000-0000-4000-8000-000000000002','notice','게시판이 모든 기기에서 공유됩니다','자유게시판과 의견수렴에 작성한 글은 서버에 저장되어 다른 사용자와 공유됩니다.',null,'2026-08-04T00:00:00Z'),
('10000000-0000-4000-8000-000000000003','notice','커뮤니티 이용 기본 안내','개인정보, 정확한 집 주소, 연락처처럼 민감한 정보는 작성하지 마세요. 다른 이용자를 배려해 주세요.',null,'2026-08-03T00:00:00Z'),
('10000000-0000-4000-8000-000000000004','notice','서비스 아이디어를 의견수렴에 남겨주세요','추가되었으면 하는 기능이나 불편했던 점이 있다면 의견수렴 분류에 남겨 주세요.',null,'2026-08-02T00:00:00Z'),
('10000000-0000-4000-8000-000000000005','notice','이동 중에는 안전을 먼저 확인하세요','게시판 확인과 글 작성은 안전한 장소에서 해주세요. 운전 중 스마트폰 사용은 삼가 주세요.',null,'2026-08-01T00:00:00Z')
on conflict (id) do update set title=excluded.title, content=excluded.content, created_at=excluded.created_at;
grant select on public.community_posts to anon, authenticated;
grant insert on public.community_posts to authenticated;
revoke update, delete on public.community_posts from anon, authenticated;
