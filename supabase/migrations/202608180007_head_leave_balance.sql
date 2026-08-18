-- 부서장도 부서원의 연차 잔여를 본다 (2026-08-18)
--
-- 0005에서 부서장에게 휴가 승인을 열면서 `get_leave_balance`를 빠뜨렸다. 그래서 부서장은
-- **잔여를 모르는 채로 승인 버튼을 누르게** 된다. 신청 단계에서 서버가 잔여를 이미 검사하므로
-- 초과 승인이 되지는 않지만, "이 사람 며칠 남았지?"를 볼 수 없으면 승인이 판단이 아니라
-- 통과 도장이 된다. 승인 권한을 준 이유와 맞지 않는다.
--
-- 0005와 같은 자리에 같은 모양으로 넣는다. 판단 규칙이 함수마다 다른 모양이면 다음에 하나를
-- 고칠 때 나머지를 빠뜨린다 — 이번에 이 함수를 빠뜨린 것이 바로 그 예다.
--
-- `scope = auth.uid()::text` 단서도 그대로다. 이게 없으면 부서장을 겸한 관리자가 한 사람을
-- 골라 볼 때 자기 부서원이 딸려 나온다.

create or replace function public.__patch_function(sig text, anchor text, replacement text)
returns void language plpgsql as $$
declare src text; hits integer;
begin
  src := pg_get_functiondef(sig::regprocedure);
  hits := (length(src) - length(replace(src, anchor, ''))) / length(anchor);
  if hits <> 1 then
    raise exception '치환 지점이 1곳이 아닙니다(%곳): % / %', hits, sig, left(anchor, 70);
  end if;
  execute replace(src, anchor, replacement);
end $$;

do $$
begin
  perform public.__patch_function(
    'public.get_leave_balance(uuid,integer,text)',
    'and (scope is null or m.user_id::text = scope)',
    'and (scope is null or m.user_id::text = scope or (scope = auth.uid()::text and public.is_my_department_member(target_workspace_id, m.user_id::text)))');
end $$;

drop function public.__patch_function(text, text, text);
