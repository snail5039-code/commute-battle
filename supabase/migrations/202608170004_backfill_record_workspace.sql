-- 기존 근태 기록에 소속 워크스페이스 채우기 (2026-08-17)
--
-- 정정 요청은 승인할 관리자를 찾아야 하므로 기록에 workspace_id가 있어야 합니다.
-- 워크스페이스가 정확히 하나인 사용자만 자동으로 채웁니다(여러 곳에 속한 사용자는 어느 회사
-- 근태인지 단정할 수 없어 비워 둡니다).
-- 이 update도 감사 트리거를 타므로 변경 이력에 남습니다.

update public.commute_records r
set workspace_id = single.workspace_id
from (
  -- uuid에는 min() 집계가 없어서 배열의 첫 값을 씁니다(건수가 1인 그룹만 보므로 그 값이 유일합니다).
  select user_id::text as uid, (array_agg(workspace_id))[1] as workspace_id
  from public.chat_workspace_members
  group by user_id
  having count(*) = 1
) single
where r.workspace_id is null and r.user_id = single.uid;
