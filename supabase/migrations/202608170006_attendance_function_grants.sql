-- 근태 RPC를 비로그인 호출에서 아예 막습니다 (2026-08-17)
--
-- Postgres 함수는 기본적으로 PUBLIC에 EXECUTE가 열려 있어서, anon 키만으로도 호출은 됩니다.
-- 함수 안의 검사(로그인·권한)가 막아 주긴 하지만, 애초에 호출 자체를 못 하게 두는 편이 낫습니다.

revoke all on function
  public.attendance_start(text, uuid),
  public.attendance_finish(uuid, boolean),
  public.attendance_record_instant(text, uuid),
  public.attendance_record_event(text, uuid),
  public.request_commute_correction(uuid, timestamptz, timestamptz, text, text),
  public.review_commute_correction(uuid, boolean, text),
  public.list_commute_corrections(uuid, boolean),
  public.get_commute_audit(uuid, text, integer)
from public, anon;

grant execute on function
  public.attendance_start(text, uuid),
  public.attendance_finish(uuid, boolean),
  public.attendance_record_instant(text, uuid),
  public.attendance_record_event(text, uuid),
  public.request_commute_correction(uuid, timestamptz, timestamptz, text, text),
  public.review_commute_correction(uuid, boolean, text),
  public.list_commute_corrections(uuid, boolean),
  public.get_commute_audit(uuid, text, integer)
to authenticated, service_role;
