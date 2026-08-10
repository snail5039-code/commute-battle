create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 30),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,30}$'),
  description text not null default '',
  color text not null default '#2563eb',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.department_messages (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists department_messages_channel_time_idx on public.department_messages (department_id, created_at desc);
alter table public.departments enable row level security;
alter table public.department_messages enable row level security;

drop policy if exists "authenticated users read departments" on public.departments;
create policy "authenticated users read departments" on public.departments for select to authenticated using (true);
drop policy if exists "authenticated users read department messages" on public.department_messages;
create policy "authenticated users read department messages" on public.department_messages for select to authenticated using (true);
drop policy if exists "authenticated users send department messages" on public.department_messages;
create policy "authenticated users send department messages" on public.department_messages for insert to authenticated with check (author_id = auth.uid());

grant select on public.departments to authenticated;
grant select, insert on public.department_messages to authenticated;
revoke all on public.departments, public.department_messages from anon;

insert into public.departments (name, slug, description, color, sort_order) values
  ('전체 공지', 'all-company', '전사 소식과 꼭 알아야 할 공지를 공유합니다.', '#2563eb', 0),
  ('개발팀', 'engineering', '제품 개발, 코드 리뷰, 기술 이야기를 나눕니다.', '#7c3aed', 10),
  ('디자인팀', 'design', '디자인 작업과 사용자 경험을 함께 논의합니다.', '#db2777', 20),
  ('마케팅팀', 'marketing', '캠페인, 콘텐츠, 성장 아이디어를 공유합니다.', '#ea580c', 30),
  ('운영팀', 'operations', '일정과 운영 현황, 이슈를 빠르게 공유합니다.', '#059669', 40)
on conflict (slug) do update set name = excluded.name, description = excluded.description, color = excluded.color, sort_order = excluded.sort_order;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'department_messages') then
    alter publication supabase_realtime add table public.department_messages;
  end if;
end $$;
