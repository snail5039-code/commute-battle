-- 부서장이 승인 화면에 들어갈 수 있게 (2026-08-18)
--
-- 0005로 부서장에게 승인 권한을 줬는데, **화면으로 갈 길이 없었다.**
-- `WorkspaceAdminDashboard`가 워크스페이스를 role이 owner·admin인 것만 골라 오기 때문에,
-- role이 member인 부서장은 /admin에서 "관리 가능한 워크스페이스가 없습니다"만 본다.
-- 서버 권한만 있고 쓸 방법이 없으면 기능을 만든 게 아니다.
--
-- 화면이 워크스페이스마다 `list_org`를 불러 `iAmHead`를 확인할 수도 있지만, 워크스페이스 수만큼
-- 왕복이 생긴다. 한 번에 답하는 함수를 둔다.
--
-- **관리자냐 부서장이냐를 나눠서 돌려준다.** 화면이 이 둘을 구분해야 하기 때문이다 —
-- 부서장에게는 승인만 열고 조직·공휴일·마감·근무 정책은 닫아야 한다.

create or replace function public.my_workspace_access()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'role', m.role,
    'isAdmin', m.role in ('owner', 'admin'),
    'isHead', exists (
      select 1 from public.org_departments d
      where d.workspace_id = w.id and d.head_user_id = auth.uid()
    )
  ) order by w.name), '[]'::jsonb) into result
  from public.chat_workspace_members m
  join public.chat_workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid();

  return result;
end $$;

revoke all on function public.my_workspace_access() from public, anon;
grant execute on function public.my_workspace_access() to authenticated, service_role;
