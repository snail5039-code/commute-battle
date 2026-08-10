create table if not exists public.chat_platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_admin_requests (
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  primary key (workspace_id, user_id)
);

create table if not exists public.chat_commute_locations (
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision not null check (accuracy_meters >= 0),
  sharing_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.chat_location_access_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.chat_workspaces(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

alter table public.chat_admin_requests enable row level security;
alter table public.chat_commute_locations enable row level security;
alter table public.chat_location_access_logs enable row level security;
alter table public.chat_platform_admins enable row level security;

create or replace function public.is_chat_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.chat_platform_admins where user_id = auth.uid()) $$;

create or replace function public.is_chat_workspace_admin(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_chat_platform_admin() or exists (select 1 from public.chat_workspace_members where workspace_id = target_workspace_id and user_id = auth.uid() and role in ('owner', 'admin')) $$;

drop policy if exists "members read chat workspaces" on public.chat_workspaces;
create policy "members read chat workspaces" on public.chat_workspaces for select to authenticated using (public.is_chat_workspace_member(id) or public.is_chat_platform_admin());
drop policy if exists "members read workspace members" on public.chat_workspace_members;
create policy "members read workspace members" on public.chat_workspace_members for select to authenticated using (public.is_chat_workspace_member(workspace_id) or public.is_chat_platform_admin());
drop policy if exists "members read chat channels" on public.chat_channels;
create policy "members read chat channels" on public.chat_channels for select to authenticated using (public.is_chat_workspace_member(workspace_id) or public.is_chat_platform_admin());
drop policy if exists "members read chat messages" on public.chat_messages;
create policy "members read chat messages" on public.chat_messages for select to authenticated using (public.is_chat_platform_admin() or public.is_chat_workspace_member((select workspace_id from public.chat_channels where id = channel_id)));
drop policy if exists "members send chat messages" on public.chat_messages;
create policy "members send chat messages" on public.chat_messages for insert to authenticated with check (author_id = auth.uid() and (public.is_chat_platform_admin() or public.is_chat_workspace_member((select workspace_id from public.chat_channels where id = channel_id))));

drop policy if exists "requesters and owners read admin requests" on public.chat_admin_requests;
create policy "requesters and owners read admin requests" on public.chat_admin_requests for select to authenticated using (user_id = auth.uid() or public.is_chat_workspace_admin(workspace_id));
drop policy if exists "users read own commute location" on public.chat_commute_locations;
create policy "users read own commute location" on public.chat_commute_locations for select to authenticated using (user_id = auth.uid());
drop policy if exists "admins read location access logs" on public.chat_location_access_logs;
create policy "admins read location access logs" on public.chat_location_access_logs for select to authenticated using (public.is_chat_workspace_admin(workspace_id));

create or replace function public.request_chat_admin(target_workspace_id uuid)
returns void language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 멤버만 신청할 수 있습니다.'; end if;
  insert into public.chat_admin_requests (workspace_id, user_id, status, requested_at, reviewed_at, reviewed_by)
  values (target_workspace_id, auth.uid(), 'pending', now(), null, null)
  on conflict (workspace_id, user_id) do update set status = 'pending', requested_at = now(), reviewed_at = null, reviewed_by = null;
end $$;

create or replace function public.review_chat_admin_request(target_workspace_id uuid, target_user_id uuid, approve boolean)
returns void language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자만 승인 요청을 처리할 수 있습니다.'; end if;
  update public.chat_admin_requests set status = case when approve then 'approved' else 'rejected' end, reviewed_at = now(), reviewed_by = auth.uid()
  where workspace_id = target_workspace_id and user_id = target_user_id and status = 'pending';
  if not found then raise exception '처리할 승인 요청이 없습니다.'; end if;
  if approve then update public.chat_workspace_members set role = 'admin' where workspace_id = target_workspace_id and user_id = target_user_id; end if;
end $$;

create or replace function public.update_chat_commute_location(target_workspace_id uuid, lat double precision, lng double precision, accuracy double precision)
returns void language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_chat_workspace_member(target_workspace_id) then raise exception '워크스페이스 멤버만 위치를 공유할 수 있습니다.'; end if;
  insert into public.chat_commute_locations (workspace_id, user_id, latitude, longitude, accuracy_meters)
  values (target_workspace_id, auth.uid(), lat, lng, greatest(accuracy, 0))
  on conflict (workspace_id, user_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, accuracy_meters = excluded.accuracy_meters, updated_at = now();
end $$;

create or replace function public.stop_chat_commute_location()
returns void language sql security definer set search_path = public
as $$ delete from public.chat_commute_locations where user_id = auth.uid() $$;

create or replace function public.get_chat_admin_dashboard(target_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_chat_workspace_admin(target_workspace_id) then raise exception '관리자 권한이 필요합니다.'; end if;
  delete from public.chat_commute_locations where updated_at < now() - interval '5 minutes';
  insert into public.chat_location_access_logs (workspace_id, viewer_id) values (target_workspace_id, auth.uid());
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'userId', m.user_id, 'role', m.role, 'nickname', coalesce(u.nickname, u.username, '동료'),
      'commuteType', r.type, 'startTime', r.start_time, 'endTime', r.end_time,
      'latitude', l.latitude, 'longitude', l.longitude, 'accuracy', l.accuracy_meters, 'locationUpdatedAt', l.updated_at
    ) order by coalesce(u.nickname, u.username, '동료'))
    from public.chat_workspace_members m
    left join public.users u on u.id = m.user_id::text
    left join lateral (select type, start_time, end_time from public.commute_records where user_id = m.user_id::text and date = (now() at time zone 'Asia/Seoul')::date order by created_at desc limit 1) r on true
    left join public.chat_commute_locations l on l.workspace_id = m.workspace_id and l.user_id = m.user_id
    where m.workspace_id = target_workspace_id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('userId', q.user_id, 'nickname', coalesce(u.nickname, u.username, '동료'), 'requestedAt', q.requested_at) order by q.requested_at)
    from public.chat_admin_requests q left join public.users u on u.id = q.user_id::text where q.workspace_id = target_workspace_id and q.status = 'pending'), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.accept_chat_workspace_invite(invite_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare invite_row public.chat_workspace_invites%rowtype; wants_admin boolean;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into invite_row from public.chat_workspace_invites where code = upper(btrim(invite_code)) and expires_at > now() and use_count < max_uses for update;
  if invite_row.id is null then raise exception '유효하지 않거나 만료된 초대 코드입니다.'; end if;
  insert into public.chat_workspace_members (workspace_id, user_id, role) values (invite_row.workspace_id, auth.uid(), 'member') on conflict do nothing;
  if found then update public.chat_workspace_invites set use_count = use_count + 1 where id = invite_row.id; end if;
  wants_admin := coalesce((auth.jwt() -> 'user_metadata' ->> 'admin_requested')::boolean, false);
  if wants_admin then insert into public.chat_admin_requests (workspace_id, user_id) values (invite_row.workspace_id, auth.uid()) on conflict (workspace_id, user_id) do update set status = 'pending', requested_at = now(); end if;
  return invite_row.workspace_id;
end $$;

grant select on public.chat_admin_requests, public.chat_location_access_logs to authenticated;
grant execute on function public.request_chat_admin(uuid), public.review_chat_admin_request(uuid, uuid, boolean), public.update_chat_commute_location(uuid, double precision, double precision, double precision), public.stop_chat_commute_location(), public.get_chat_admin_dashboard(uuid) to authenticated;
revoke all on public.chat_admin_requests, public.chat_commute_locations, public.chat_location_access_logs from anon;

insert into public.chat_platform_admins (user_id)
select id::uuid from public.users where lower(username) = 'snail2483'
on conflict (user_id) do nothing;
