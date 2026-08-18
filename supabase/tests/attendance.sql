-- 근태 계산 회귀 테스트 (2026-08-17 도입)
--
-- 실행법: 이 파일 전체를 Supabase SQL Editor에 붙여넣고 실행하거나,
--         Supabase MCP `execute_sql`에 그대로 넘긴다.
--
-- 마지막에 예외를 던져 **전부 롤백**되므로 DB에는 아무것도 남지 않는다. 실제 데이터에도
-- 의존하지 않는다 — 합성 유저·워크스페이스를 트랜잭션 안에서 만들어 쓰고 같이 사라진다.
--
-- 결과는 예외 메시지로 나온다:
--   성공 → "TEST_RESULT: 통과 126 / 실패 0 OK"
--   실패 → 실패한 항목이 '기대=… 실제=…' 형태로 함께 나온다.
--
-- 왜 SQL 테스트인가: 임금에 영향을 주는 계산(근무시간·휴게·연장·야간·휴일·지각·위치 판정)이
-- 전부 Postgres 함수 안에 있다. JS 테스트로는 한 줄도 못 덮는다.
--
-- 구간: A 근무시간 · B 자정 넘김 · C 근무일 귀속 · D 기록 RPC · E 위치 인증 · F 권한 ·
--       G 공휴일 · H 월 마감 · I 휴가·연차
--
-- 케이스를 추가할 때 지킬 것 세 가지 (전부 실제로 당해서 적는다):
--   1) 실패 메시지를 넣을 땐 `array_append(fails, ...)`를 쓴다. `fails || '문자열'`은 리터럴 타입이
--      모호해서 배열 캐스팅 오류로 죽는다 — 통과할 땐 안 보이다가 실패하는 순간 터진다.
--   2) 구간마다 자기 기록을 직접 넣는다. 앞 구간의 픽스처를 물려받으면, 앞에서 지운 순간
--      뒤 구간이 빈 데이터를 보고 엉뚱한 실패를 낸다.
--   3) 날짜를 검사하는 RPC를 덮을 땐 그 RPC가 받는 날짜 범위부터 본다. I 구간(휴가)만 2020년
--      고정일을 못 쓰는 이유가 그것이다 — `request_leave`가 "오늘 -31일 ~ +365일"만 받는다.

do $$
declare
  uid uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();  -- 관리자가 아닌 구성원 (권한 검증용)
  admin2 uuid := gen_random_uuid();   -- 본인 승인 금지 때문에 정정 승인은 다른 관리자가 해야 한다
  closing_record uuid; closing_request uuid; closing_snap jsonb; closing_list jsonb;
  -- I 구간(휴가)은 실행 시점 기준 상대 날짜를 쓴다 — 이유는 해당 구간 주석 참고
  lv_mon date; lv_mon2 date; lv_year integer;
  lv_request uuid; lv_half uuid; lv_pending uuid;
  lv_balance jsonb; lv_list jsonb;
  ws uuid;
  fails text[] := '{}';
  checks int := 0;
  summary jsonb; d jsonb; w jsonb;
  rec public.commute_records;
  loc record;
  today date := (now() at time zone 'Asia/Seoul')::date;
  got text;

  -- 픽스처 날짜 (요일이 고정되어야 휴일 판정을 검증할 수 있어 과거 고정일을 쓴다)
  d1 date := '2020-06-01';  -- 월
  d2 date := '2020-06-02';  -- 화
  d3 date := '2020-06-03';  -- 수, 자정을 넘겨 퇴근
  d4 date := '2020-06-04';  -- 목, 여기에 행이 생기면 안 된다
  d5 date := '2020-06-05';  -- 금, 휴가
  d6 date := '2020-06-06';  -- 토, 휴일
begin
  -- ── 픽스처 ────────────────────────────────────────────────────────────────
  -- 워크스페이스는 auth.users를 참조하므로 계정도 합성으로 만든다. id 외에는 전부 기본값이 있다.
  insert into auth.users (id) values (uid);
  insert into public.users (id, nickname) values (uid::text, '테스트계정') on conflict (id) do nothing;
  insert into public.chat_workspaces (name, owner_id) values ('테스트워크스페이스', uid) returning id into ws;
  insert into public.chat_workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- 소정근로 09:00~18:00, 휴게 60분, 야간 22:00~06:00 (기본값을 명시적으로 고정)
  perform public.upsert_work_policy(ws, '09:00', '18:00', 480, 2400, 3120, 60, '22:00', '06:00',
                                    null, null, null, 200, 150);

  -- ════════════════════════════════════════════════════════════════════════
  -- A. 근무시간 계산 (0007에서 검증했던 케이스를 회귀 테스트로 고정)
  -- ════════════════════════════════════════════════════════════════════════
  -- 근무 시작 = 출근 기록의 도착 시각, 근무 종료 = 퇴근 기록의 출발 시각
  -- 괄호가 중요하다. `date + time at time zone`은 `date + (time at time zone)`으로 파싱되어
  -- 시각이 9시간 밀린다. 반드시 `(date + time) at time zone`으로 묶을 것.
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time) values
    -- 월: 09:00~18:00 (정상)
    (uid::text, ws, d1, 'commute', 'arrival', (d1 + time '08:00') at time zone 'Asia/Seoul', (d1 + time '09:00') at time zone 'Asia/Seoul'),
    (uid::text, ws, d1, 'return',  'arrival', (d1 + time '18:00') at time zone 'Asia/Seoul', (d1 + time '19:00') at time zone 'Asia/Seoul'),
    -- 화: 09:30~23:00 (지각 30분, 야간 60분, 연장 270분)
    (uid::text, ws, d2, 'commute', 'arrival', (d2 + time '08:30') at time zone 'Asia/Seoul', (d2 + time '09:30') at time zone 'Asia/Seoul'),
    (uid::text, ws, d2, 'return',  'arrival', (d2 + time '23:00') at time zone 'Asia/Seoul', (d2 + time '23:40') at time zone 'Asia/Seoul'),
    -- 수: 09:30 출근 → 다음날 01:00 퇴근. **퇴근 기록의 date가 수요일(d3)이어야 한다**
    (uid::text, ws, d3, 'commute', 'arrival', (d3 + time '08:30') at time zone 'Asia/Seoul', (d3 + time '09:30') at time zone 'Asia/Seoul'),
    (uid::text, ws, d3, 'return',  'arrival', (d4 + time '01:00') at time zone 'Asia/Seoul', (d4 + time '02:00') at time zone 'Asia/Seoul'),
    -- 토: 10:00~15:00 (휴일근로, 지각 미적용, 휴게 30분)
    (uid::text, ws, d6, 'commute', 'arrival', (d6 + time '09:00') at time zone 'Asia/Seoul', (d6 + time '10:00') at time zone 'Asia/Seoul'),
    (uid::text, ws, d6, 'return',  'arrival', (d6 + time '15:00') at time zone 'Asia/Seoul', (d6 + time '16:00') at time zone 'Asia/Seoul');
  -- 금: 휴가
  insert into public.commute_records (user_id, workspace_id, date, type) values (uid::text, ws, d5, 'vacation');

  summary := public.get_attendance_summary(ws, d1, '2020-06-07');

  -- A-1. 월 09:00~18:00 → 근무 480분(휴게 60 차감), 연장·야간·지각 0
  select item into d from jsonb_array_elements(summary->'days') item where item->>'date' = d1::text;
  checks := checks + 5;
  if (d->>'workedMinutes')::numeric <> 480 then fails := array_append(fails, format('A-1 근무: 기대=480 실제=%s', d->>'workedMinutes')); end if;
  if (d->>'breakMinutes')::numeric <> 60 then fails := array_append(fails, format('A-1 휴게: 기대=60 실제=%s', d->>'breakMinutes')); end if;
  if (d->>'overtimeMinutes')::numeric <> 0 then fails := array_append(fails, format('A-1 연장: 기대=0 실제=%s', d->>'overtimeMinutes')); end if;
  if (d->>'nightMinutes')::numeric <> 0 then fails := array_append(fails, format('A-1 야간: 기대=0 실제=%s', d->>'nightMinutes')); end if;
  if d->>'status' <> 'complete' then fails := array_append(fails, format('A-1 상태: 기대=complete 실제=%s', d->>'status')); end if;

  -- A-2. 화 09:30~23:00 → 근무 750분, 연장 270분, 야간 60분, 지각 30분
  select item into d from jsonb_array_elements(summary->'days') item where item->>'date' = d2::text;
  checks := checks + 4;
  if (d->>'workedMinutes')::numeric <> 750 then fails := array_append(fails, format('A-2 근무: 기대=750 실제=%s', d->>'workedMinutes')); end if;
  if (d->>'overtimeMinutes')::numeric <> 270 then fails := array_append(fails, format('A-2 연장: 기대=270 실제=%s', d->>'overtimeMinutes')); end if;
  if (d->>'nightMinutes')::numeric <> 60 then fails := array_append(fails, format('A-2 야간: 기대=60 실제=%s', d->>'nightMinutes')); end if;
  if (d->>'lateMinutes')::numeric <> 30 then fails := array_append(fails, format('A-2 지각: 기대=30 실제=%s', d->>'lateMinutes')); end if;

  -- A-3. 토 10:00~15:00 → 휴게 30분(4시간 이상), 휴일근로 270분, 지각 미적용
  select item into d from jsonb_array_elements(summary->'days') item where item->>'date' = d6::text;
  checks := checks + 5;
  if (d->>'workedMinutes')::numeric <> 270 then fails := array_append(fails, format('A-3 근무: 기대=270 실제=%s', d->>'workedMinutes')); end if;
  if (d->>'breakMinutes')::numeric <> 30 then fails := array_append(fails, format('A-3 휴게: 기대=30 실제=%s', d->>'breakMinutes')); end if;
  if (d->>'holidayMinutes')::numeric <> 270 then fails := array_append(fails, format('A-3 휴일: 기대=270 실제=%s', d->>'holidayMinutes')); end if;
  if (d->>'lateMinutes')::numeric <> 0 then fails := array_append(fails, format('A-3 지각(휴일엔 미적용): 기대=0 실제=%s', d->>'lateMinutes')); end if;
  if (d->>'isHoliday')::boolean is not true then fails := array_append(fails, 'A-3 휴일플래그: 기대=true'); end if;

  -- A-4. 휴가
  select item into d from jsonb_array_elements(summary->'days') item where item->>'date' = d5::text;
  checks := checks + 2;
  if d->>'status' <> 'vacation' then fails := array_append(fails, format('A-4 상태: 기대=vacation 실제=%s', d->>'status')); end if;
  if (d->>'workedMinutes')::numeric <> 0 then fails := array_append(fails, format('A-4 근무: 기대=0 실제=%s', d->>'workedMinutes')); end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- B. 자정 넘김 — 이번 수정의 핵심
  -- ════════════════════════════════════════════════════════════════════════
  -- 수 09:30 출근 → 목 01:00 퇴근. 퇴근 기록이 수요일에 귀속되므로 한 행으로 산정되어야 한다.
  select item into d from jsonb_array_elements(summary->'days') item where item->>'date' = d3::text;
  checks := checks + 6;
  if d is null then
    fails := array_append(fails, 'B-1 수요일 행이 없음');
  else
    -- 09:30 → 익일 01:00 = 930분, 휴게 60 차감 = 870분
    if (d->>'workedMinutes')::numeric <> 870 then fails := array_append(fails, format('B-1 근무: 기대=870 실제=%s', d->>'workedMinutes')); end if;
    if (d->>'overtimeMinutes')::numeric <> 390 then fails := array_append(fails, format('B-2 연장: 기대=390 실제=%s', d->>'overtimeMinutes')); end if;
    -- 야간은 22:00~익일 01:00 = 180분
    if (d->>'nightMinutes')::numeric <> 180 then fails := array_append(fails, format('B-3 야간: 기대=180 실제=%s', d->>'nightMinutes')); end if;
    if (d->>'lateMinutes')::numeric <> 30 then fails := array_append(fails, format('B-4 지각: 기대=30 실제=%s', d->>'lateMinutes')); end if;
    -- 퇴근이 소정근로 종료(18:00)보다 늦으므로 조기퇴근은 0이어야 한다(음수가 새면 안 됨)
    if (d->>'earlyOutMinutes')::numeric <> 0 then fails := array_append(fails, format('B-5 조기퇴근: 기대=0 실제=%s', d->>'earlyOutMinutes')); end if;
    if d->>'status' <> 'complete' then fails := array_append(fails, format('B-6 상태: 기대=complete 실제=%s', d->>'status')); end if;
  end if;

  -- B-7. 목요일에는 행이 생기면 안 된다 (예전 버그에서는 여기에 '기록 미완료'가 생겼다)
  checks := checks + 1;
  if exists (select 1 from jsonb_array_elements(summary->'days') item where item->>'date' = d4::text) then
    fails := array_append(fails, 'B-7 목요일에 행이 생김 — 퇴근이 다음 날로 갈라졌다');
  end if;

  -- B-8. 주간 합계 (월~토 근무 2370분, 연장 660분, 52시간 한도 이내)
  select item into w from jsonb_array_elements(summary->'weeks') item where item->>'weekStart' = d1::text;
  checks := checks + 3;
  if (w->>'workedMinutes')::numeric <> 2370 then fails := array_append(fails, format('B-8 주간근무: 기대=2370 실제=%s', w->>'workedMinutes')); end if;
  if (w->>'overtimeMinutes')::numeric <> 660 then fails := array_append(fails, format('B-8 주간연장: 기대=660 실제=%s', w->>'overtimeMinutes')); end if;
  if (w->>'overLimit')::boolean is not false then fails := array_append(fails, 'B-8 주52시간: 기대=false'); end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- C. 근무일 귀속 규칙 (attendance_work_date)
  -- ════════════════════════════════════════════════════════════════════════
  delete from public.commute_records where user_id = uid::text;

  -- C-1. 기록이 없으면 오늘
  checks := checks + 1;
  if public.attendance_work_date(uid::text, now()) <> today then
    fails := array_append(fails, 'C-1 기록 없음: 기대=오늘');
  end if;

  -- C-2. 어제 출근만 있고 닫히지 않았으면 → 어제 (자정 넘김의 핵심)
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time)
  values (uid::text, ws, today - 1, 'commute', 'arrival', now() - interval '17 hours', now() - interval '16 hours');
  checks := checks + 1;
  if public.attendance_work_date(uid::text, now()) <> today - 1 then
    fails := array_append(fails, format('C-2 어제 미완결: 기대=%s 실제=%s', today - 1, public.attendance_work_date(uid::text, now())));
  end if;

  -- C-3. 어제가 닫혔으면 → 오늘
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time)
  values (uid::text, ws, today - 1, 'return', 'arrival', now() - interval '9 hours', now() - interval '8 hours');
  checks := checks + 1;
  if public.attendance_work_date(uid::text, now()) <> today then
    fails := array_append(fails, format('C-3 어제 닫힘: 기대=%s 실제=%s', today, public.attendance_work_date(uid::text, now())));
  end if;

  -- C-4. 어제·오늘 둘 다 열려 있으면 → 오늘 (더 최근 근무일이 이긴다)
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time)
  values (uid::text, ws, today - 1, 'commute', 'arrival', now() - interval '7 hours', now() - interval '6 hours'),
         (uid::text, ws, today,     'commute', 'arrival', now() - interval '3 hours', now() - interval '2 hours');
  checks := checks + 1;
  if public.attendance_work_date(uid::text, now()) <> today then
    fails := array_append(fails, format('C-4 둘 다 열림: 기대=%s 실제=%s', today, public.attendance_work_date(uid::text, now())));
  end if;

  -- C-5. 사흘 전만 열려 있으면 → 오늘 (오래된 잔재가 퇴근을 끌어가면 안 된다)
  delete from public.commute_records where user_id = uid::text;
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time)
  values (uid::text, ws, today - 3, 'commute', 'arrival', now() - interval '72 hours', now() - interval '71 hours');
  checks := checks + 1;
  if public.attendance_work_date(uid::text, now()) <> today then
    fails := array_append(fails, format('C-5 사흘 전 잔재: 기대=%s 실제=%s', today, public.attendance_work_date(uid::text, now())));
  end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- D. 기록 RPC 경로 (중복 차단 · 서버 시각)
  -- ════════════════════════════════════════════════════════════════════════
  delete from public.commute_records where user_id = uid::text;

  rec := public.attendance_start('commute', ws);
  checks := checks + 3;
  if rec.date <> today then fails := array_append(fails, format('D-1 출근 근무일: 기대=%s 실제=%s', today, rec.date)); end if;
  if rec.start_time is null then fails := array_append(fails, 'D-1 출발 시각이 비어 있음'); end if;
  if rec.end_time is not null then fails := array_append(fails, 'D-1 출발 직후엔 도착 시각이 없어야 함'); end if;

  -- D-2. 도착 처리 전에는 새 출발을 막는다
  checks := checks + 1;
  begin
    perform public.attendance_start('return', ws);
    fails := array_append(fails, 'D-2 중복 차단: 예외가 나야 하는데 통과됨');
  exception when others then
    if sqlerrm not like '%도착 처리되지 않은%' then
      fails := array_append(fails, format('D-2 중복 차단: 예상과 다른 오류 %s', sqlerrm));
    end if;
  end;

  -- D-3. 도착 처리하면 이동 시간이 채워진다
  rec := public.attendance_finish(rec.id, true);
  checks := checks + 2;
  if rec.end_time is null then fails := array_append(fails, 'D-3 도착 시각이 안 채워짐'); end if;
  if rec.duration_minutes is null then fails := array_append(fails, 'D-3 이동 시간이 안 채워짐'); end if;

  -- D-4. 사흘 전 미완결 기록은 오늘 출근을 막지 않는다 (0005에서 좁힌 범위 유지)
  delete from public.commute_records where user_id = uid::text;
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time)
  values (uid::text, ws, today - 3, 'commute', 'start', now() - interval '72 hours');
  checks := checks + 1;
  begin
    rec := public.attendance_start('commute', ws);
  exception when others then
    fails := array_append(fails, format('D-4 사흘 전 잔재가 오늘 출근을 막음: %s', sqlerrm));
  end;

  -- ════════════════════════════════════════════════════════════════════════
  -- E. 위치 인증 판정 (지오펜스)
  -- ════════════════════════════════════════════════════════════════════════
  -- 사업장 = 서울시청, 반경 200m, 허용 GPS 오차 150m
  perform public.upsert_work_policy(ws, '09:00', '18:00', 480, 2400, 3120, 60, '22:00', '06:00',
                                    37.566535, 126.977969, '본사', 200, 150);

  -- E-1. 반경 안 (약 30m, 정확도 20m)
  select * into loc from public.attendance_location_check(ws, 37.566800, 126.977969, 20, false);
  checks := checks + 2;
  if loc.verified is not true then fails := array_append(fails, format('E-1 반경 안: 기대=true 실제=%s', loc.verified)); end if;
  if loc.status <> 'verified' then fails := array_append(fails, format('E-1 상태: 기대=verified 실제=%s', loc.status)); end if;

  -- E-2. 반경 밖 (약 1.1km)
  select * into loc from public.attendance_location_check(ws, 37.576535, 126.977969, 20, false);
  checks := checks + 3;
  if loc.verified is not false then fails := array_append(fails, format('E-2 반경 밖: 기대=false 실제=%s', loc.verified)); end if;
  if loc.status <> 'out_of_range' then fails := array_append(fails, format('E-2 상태: 기대=out_of_range 실제=%s', loc.status)); end if;
  if loc.distance_m < 1000 or loc.distance_m > 1200 then fails := array_append(fails, format('E-2 거리: 기대=약 1.1km 실제=%s', loc.distance_m)); end if;

  -- E-3. 반경 안이지만 GPS 정확도가 허용치보다 나쁨 → 인증하지 않는다
  select * into loc from public.attendance_location_check(ws, 37.566800, 126.977969, 400, false);
  checks := checks + 2;
  if loc.verified is not false then fails := array_append(fails, format('E-3 정확도 부족: 기대=false 실제=%s', loc.verified)); end if;
  if loc.status <> 'low_accuracy' then fails := array_append(fails, format('E-3 상태: 기대=low_accuracy 실제=%s', loc.status)); end if;

  -- E-4. 위치 권한 거부 / 신호 없음
  select * into loc from public.attendance_location_check(ws, null, null, null, true);
  checks := checks + 1;
  if loc.status <> 'denied' then fails := array_append(fails, format('E-4 권한 거부: 기대=denied 실제=%s', loc.status)); end if;
  select * into loc from public.attendance_location_check(ws, null, null, null, false);
  checks := checks + 1;
  if loc.status <> 'unavailable' then fails := array_append(fails, format('E-4 신호 없음: 기대=unavailable 실제=%s', loc.status)); end if;

  -- E-5. 사업장 좌표가 없으면 '검증 대상 아님'(null)이지 '미인증'(false)이 아니다
  perform public.upsert_work_policy(ws, '09:00', '18:00', 480, 2400, 3120, 60, '22:00', '06:00',
                                    null, null, null, 200, 150);
  select * into loc from public.attendance_location_check(ws, 37.400000, 127.100000, 10, false);
  checks := checks + 2;
  if loc.verified is not null then fails := array_append(fails, format('E-5 좌표 미설정: 기대=null 실제=%s', loc.verified)); end if;
  if loc.status <> 'no_policy' then fails := array_append(fails, format('E-5 상태: 기대=no_policy 실제=%s', loc.status)); end if;

  -- E-6. 워크스페이스가 없는 개인 기록도 검증 대상이 아니다
  select * into loc from public.attendance_location_check(null, 37.400000, 127.100000, 10, false);
  checks := checks + 1;
  if loc.verified is not null then fails := array_append(fails, format('E-6 개인 기록: 기대=null 실제=%s', loc.verified)); end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- F. 권한 — 판정 함수는 앱에서 직접 호출할 수 없어야 한다
  -- ════════════════════════════════════════════════════════════════════════
  checks := checks + 4;
  if has_function_privilege('authenticated', 'public.attendance_location_check(uuid, double precision, double precision, numeric, boolean)', 'execute')
    then fails := array_append(fails, 'F-1 attendance_location_check가 authenticated에게 열려 있음'); end if;
  if has_function_privilege('anon', 'public.attendance_location_check(uuid, double precision, double precision, numeric, boolean)', 'execute')
    then fails := array_append(fails, 'F-2 attendance_location_check가 anon에게 열려 있음'); end if;
  if has_function_privilege('authenticated', 'public.geo_distance_m(double precision, double precision, double precision, double precision)', 'execute')
    then fails := array_append(fails, 'F-3 geo_distance_m이 authenticated에게 열려 있음'); end if;
  if has_function_privilege('anon', 'public.get_attendance_summary(uuid, date, date, text)', 'execute')
    then fails := array_append(fails, 'F-4 get_attendance_summary가 anon에게 열려 있음'); end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- G. 공휴일 — 등록하면 그날 근무가 휴일근로가 되고 지각을 따지지 않는다
  -- ════════════════════════════════════════════════════════════════════════
  -- C·D 구간이 앞의 기록을 지웠으므로 여기서 쓸 기록을 다시 넣는다.
  -- (테스트끼리 상태를 물려주면 어느 구간이 깨진 건지 알 수 없게 된다)
  delete from public.commute_records where user_id = uid::text;
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time) values
    (uid::text, ws, d2, 'commute', 'arrival', (d2 + time '08:30') at time zone 'Asia/Seoul', (d2 + time '09:30') at time zone 'Asia/Seoul'),
    (uid::text, ws, d2, 'return',  'arrival', (d2 + time '23:00') at time zone 'Asia/Seoul', (d2 + time '23:40') at time zone 'Asia/Seoul'),
    (uid::text, ws, d6, 'commute', 'arrival', (d6 + time '09:00') at time zone 'Asia/Seoul', (d6 + time '10:00') at time zone 'Asia/Seoul'),
    (uid::text, ws, d6, 'return',  'arrival', (d6 + time '15:00') at time zone 'Asia/Seoul', (d6 + time '16:00') at time zone 'Asia/Seoul');

  -- 화요일(d2)은 09:30~23:00 근무라 원래 지각 30분이 잡힌다. 여기를 공휴일로 등록해 본다.
  perform public.save_work_holidays(ws, jsonb_build_array(
    jsonb_build_object('date', d2::text, 'name', '창립기념일')
  ), 'custom', true);

  summary := public.get_attendance_summary(ws, d1, '2020-06-07');
  select item into d from jsonb_array_elements(summary->'days') item where item->>'date' = d2::text;
  checks := checks + 4;
  if (d->>'isHoliday')::boolean is not true then fails := array_append(fails, 'G-1 휴일 플래그: 기대=true'); end if;
  if d->>'holidayName' <> '창립기념일' then fails := array_append(fails, format('G-1 휴일 이름: 기대=창립기념일 실제=%s', d->>'holidayName')); end if;
  -- 근무시간 자체는 그대로고, 그게 휴일근로로 옮겨 잡힌다
  if (d->>'holidayMinutes')::numeric <> 750 then fails := array_append(fails, format('G-2 휴일근로: 기대=750 실제=%s', d->>'holidayMinutes')); end if;
  if (d->>'lateMinutes')::numeric <> 0 then fails := array_append(fails, format('G-3 휴일엔 지각 미적용: 기대=0 실제=%s', d->>'lateMinutes')); end if;

  -- G-4. 공공데이터를 다시 불러와도(overwrite=false) 직접 손본 이름은 덮어쓰지 않는다
  perform public.save_work_holidays(ws, jsonb_build_array(
    jsonb_build_object('date', d2::text, 'name', '공공데이터가 준 다른 이름')
  ), 'public_api', false);
  checks := checks + 1;
  if (select name from public.work_holidays where workspace_id = ws and holiday_date = d2) <> '창립기념일' then
    fails := array_append(fails, 'G-4 overwrite=false인데 기존 이름이 덮어써짐');
  end if;

  -- G-5. 삭제하면 평일로 돌아가고 지각이 다시 계산된다
  perform public.delete_work_holiday(ws, d2);
  summary := public.get_attendance_summary(ws, d1, '2020-06-07');
  select item into d from jsonb_array_elements(summary->'days') item where item->>'date' = d2::text;
  checks := checks + 3;
  if (d->>'isHoliday')::boolean is not false then fails := array_append(fails, 'G-5 삭제 후 휴일 플래그: 기대=false'); end if;
  if (d->>'holidayMinutes')::numeric <> 0 then fails := array_append(fails, format('G-5 삭제 후 휴일근로: 기대=0 실제=%s', d->>'holidayMinutes')); end if;
  if (d->>'lateMinutes')::numeric <> 30 then fails := array_append(fails, format('G-5 삭제 후 지각: 기대=30 실제=%s', d->>'lateMinutes')); end if;

  -- G-6. 주말은 공휴일 등록 없이도 휴일이고, 이름은 비어 있다
  select item into d from jsonb_array_elements(summary->'days') item where item->>'date' = d6::text;
  checks := checks + 2;
  if (d->>'isHoliday')::boolean is not true then fails := array_append(fails, 'G-6 토요일 휴일 플래그: 기대=true'); end if;
  if d->>'holidayName' is not null then fails := array_append(fails, format('G-6 주말 휴일 이름: 기대=없음 실제=%s', d->>'holidayName')); end if;

  -- G-7. 관리자가 아니면 저장할 수 없다
  insert into auth.users (id) values (outsider);
  insert into public.users (id, nickname) values (outsider::text, '일반구성원') on conflict (id) do nothing;
  insert into public.chat_workspace_members (workspace_id, user_id, role) values (ws, outsider, 'member');
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  checks := checks + 1;
  begin
    perform public.save_work_holidays(ws, jsonb_build_array(jsonb_build_object('date', d5::text, 'name', '몰래추가')), 'custom', true);
    fails := array_append(fails, 'G-7 일반 구성원이 공휴일을 저장할 수 있음');
  exception when others then
    if sqlerrm not like '%관리자 권한%' then fails := array_append(fails, format('G-7 예상과 다른 오류: %s', sqlerrm)); end if;
  end;
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- G-8. 공휴일 함수는 anon에게 닫혀 있다
  checks := checks + 2;
  if has_function_privilege('anon', 'public.save_work_holidays(uuid, jsonb, text, boolean)', 'execute')
    then fails := array_append(fails, 'G-8 save_work_holidays가 anon에게 열려 있음'); end if;
  if has_function_privilege('anon', 'public.list_work_holidays(uuid, date, date)', 'execute')
    then fails := array_append(fails, 'G-8 list_work_holidays가 anon에게 열려 있음'); end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- H. 월 마감 — 마감하면 그 달을 못 고치고, 지급 근거가 박제된다
  -- ════════════════════════════════════════════════════════════════════════
  delete from public.commute_records where user_id = uid::text;
  insert into auth.users (id) values (admin2);
  insert into public.users (id, nickname) values (admin2::text, '관리자둘') on conflict (id) do nothing;
  insert into public.chat_workspace_members (workspace_id, user_id, role) values (ws, admin2, 'admin');

  -- 2020-06-15(월) 09:00~18:00 = 근무 480분
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time)
  values (uid::text, ws, '2020-06-15', 'commute', 'arrival', ('2020-06-15'::date + time '08:00') at time zone 'Asia/Seoul', ('2020-06-15'::date + time '09:00') at time zone 'Asia/Seoul')
  returning id into closing_record;
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time)
  values (uid::text, ws, '2020-06-15', 'return', 'arrival', ('2020-06-15'::date + time '18:00') at time zone 'Asia/Seoul', ('2020-06-15'::date + time '19:00') at time zone 'Asia/Seoul');

  -- H-1. 아직 끝나지 않은 달은 마감할 수 없다 (진행 중인 달을 닫으면 남은 날이 전부 '변경'으로 쌓인다)
  checks := checks + 1;
  begin
    perform public.close_attendance_month(ws, date_trunc('month', now())::date, null);
    fails := array_append(fails, 'H-1 진행 중인 달이 마감됨');
  exception when others then
    if sqlerrm not like '%아직 끝나지 않%' then fails := array_append(fails, 'H-1 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- H-2. 마감 전에는 정정 요청이 된다
  checks := checks + 1;
  begin
    closing_request := public.request_commute_correction(closing_record, ('2020-06-15'::date + time '08:50') at time zone 'Asia/Seoul', null, null, '지문인식 오류로 늦게 찍힘');
  exception when others then
    fails := array_append(fails, 'H-2 마감 전 정정 요청 실패: ' || sqlerrm);
  end;

  -- H-3. 마감하면 상태가 바뀌고 스냅샷에 근무 480분이 박제된다
  perform public.close_attendance_month(ws, '2020-06-01', '급여 정산 완료');
  checks := checks + 3;
  if not public.is_attendance_month_closed(ws, '2020-06-20') then fails := array_append(fails, 'H-3 마감 상태가 아님'); end if;
  closing_snap := public.get_closing_snapshot(ws, '2020-06-01');
  if closing_snap is null then fails := array_append(fails, 'H-3 스냅샷 없음');
  elsif (select item->>'workedMinutes' from jsonb_array_elements(closing_snap->'days') item where item->>'date' = '2020-06-15') <> '480'
    then fails := array_append(fails, 'H-3 스냅샷 근무시간이 480이 아님'); end if;
  if jsonb_array_length(closing_snap->'days') <> 1 then fails := array_append(fails, 'H-3 스냅샷 일수가 1이 아님'); end if;

  -- H-4. 마감된 달은 새 정정 요청이 막힌다
  checks := checks + 1;
  begin
    perform public.request_commute_correction(closing_record, ('2020-06-15'::date + time '07:00') at time zone 'Asia/Seoul', null, null, '마감 후 시도');
    fails := array_append(fails, 'H-4 마감된 달에 정정 요청이 통과됨');
  exception when others then
    if sqlerrm not like '%마감되어 정정할 수 없%' then fails := array_append(fails, 'H-4 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- H-5. 마감 전에 넣어둔 대기 요청도 승인이 막힌다 (요청한 뒤에 마감됐을 수 있으므로)
  perform set_config('request.jwt.claim.sub', admin2::text, true);
  checks := checks + 1;
  begin
    perform public.review_commute_correction(closing_request, true, null);
    fails := array_append(fails, 'H-5 마감된 달의 정정이 승인됨');
  exception when others then
    if sqlerrm not like '%마감되어 승인할 수 없%' then fails := array_append(fails, 'H-5 예상과 다른 오류: ' || sqlerrm); end if;
  end;
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- H-6. 중복 마감 불가 / 해제엔 사유가 필요하다
  checks := checks + 2;
  begin
    perform public.close_attendance_month(ws, '2020-06-01', null);
    fails := array_append(fails, 'H-6 이미 마감된 달이 또 마감됨');
  exception when others then
    if sqlerrm not like '%이미 마감%' then fails := array_append(fails, 'H-6 예상과 다른 오류: ' || sqlerrm); end if;
  end;
  begin
    perform public.reopen_attendance_month(ws, '2020-06-01', '짧음');
    fails := array_append(fails, 'H-6 사유 없이 해제됨');
  exception when others then
    if sqlerrm not like '%5자 이상%' then fails := array_append(fails, 'H-6 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- H-7. 해제하면 다시 승인할 수 있고, 원장과 스냅샷은 남는다
  perform public.reopen_attendance_month(ws, '2020-06-01', '누락 기록 발견되어 재정산');
  checks := checks + 4;
  if public.is_attendance_month_closed(ws, '2020-06-01') then fails := array_append(fails, 'H-7 해제 후에도 마감 상태'); end if;
  perform set_config('request.jwt.claim.sub', admin2::text, true);
  begin
    perform public.review_commute_correction(closing_request, true, '확인함');
  exception when others then
    fails := array_append(fails, 'H-7 해제 후에도 승인 실패: ' || sqlerrm);
  end;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  if (select count(*) from public.attendance_closings c where c.workspace_id = ws) <> 2
    then fails := array_append(fails, 'H-7 원장이 2행이 아님(마감+해제)'); end if;
  if (select c.snapshot from public.attendance_closings c where c.workspace_id = ws and c.action = 'close') is null
    then fails := array_append(fails, 'H-7 해제해도 마감 스냅샷은 남아야 한다'); end if;

  -- H-8. 목록에 해제 상태와 사유가 보인다
  closing_list := public.list_attendance_closings(ws, '2020-06-01', '2020-06-01');
  select item into d from jsonb_array_elements(closing_list) item limit 1;
  checks := checks + 2;
  if (d->>'closed')::boolean is not false then fails := array_append(fails, 'H-8 목록이 마감 상태로 나옴'); end if;
  if d->>'note' <> '누락 기록 발견되어 재정산' then fails := array_append(fails, 'H-8 해제 사유가 안 보임'); end if;

  -- H-9. 일반 구성원은 마감할 수 없다
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  checks := checks + 1;
  begin
    perform public.close_attendance_month(ws, '2020-05-01', null);
    fails := array_append(fails, 'H-9 일반 구성원이 마감함');
  exception when others then
    if sqlerrm not like '%관리자 권한%' then fails := array_append(fails, 'H-9 예상과 다른 오류: ' || sqlerrm); end if;
  end;
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- H-10. 마감 함수는 anon에게 닫혀 있고, 내부 판정 함수는 앱에서 직접 못 부른다
  checks := checks + 2;
  if has_function_privilege('anon', 'public.close_attendance_month(uuid, date, text)', 'execute')
    then fails := array_append(fails, 'H-10 close_attendance_month가 anon에게 열려 있음'); end if;
  if has_function_privilege('authenticated', 'public.is_attendance_month_closed(uuid, date)', 'execute')
    then fails := array_append(fails, 'H-10 내부 판정 함수가 authenticated에게 열려 있음'); end if;


  -- ════════════════════════════════════════════════════════════════════════
  -- I. 휴가·연차 — 신청 → 승인 → 기록 자동 생성 → 잔여 차감
  -- ════════════════════════════════════════════════════════════════════════
  -- 이 구간만 날짜를 2020년으로 고정하지 못한다. `request_leave`가 "오늘 -31일 ~ +365일"만
  -- 받기 때문이다(지난 일을 소급 신청해 잔여를 맞추지 못하게 하는 제한). 그래서 실행 시점 기준으로
  -- 다음 주 월~금을 잡는다. 연차 잔여는 연도별이라 한 주가 두 해에 걸치면 검증이 갈라지므로,
  -- 그런 주가 잡히면 한 주 민다.
  delete from public.commute_records where user_id = uid::text;
  delete from public.work_holidays where workspace_id = ws;

  lv_mon := (today + 7) - (extract(isodow from (today + 7))::int - 1);
  if extract(year from lv_mon) <> extract(year from lv_mon + 11) then lv_mon := lv_mon + 14; end if;
  lv_mon2 := lv_mon + 7;
  lv_year := extract(year from lv_mon)::integer;

  -- 수요일을 공휴일로 등록한다. 휴가 일수 계산이 공휴일을 빼는지 보려면 주 안에 하나 있어야 한다.
  perform public.save_work_holidays(ws, jsonb_build_array(
    jsonb_build_object('date', (lv_mon + 2)::text, 'name', '테스트공휴일')
  ), 'custom', true);

  -- I-1. 일반 구성원은 연차를 부여할 수 없다
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  checks := checks + 1;
  begin
    perform public.set_leave_grant(ws, uid::text, lv_year, 15, null);
    fails := array_append(fails, 'I-1 일반 구성원이 연차를 부여함');
  exception when others then
    if sqlerrm not like '%관리자 권한%' then fails := array_append(fails, 'I-1 예상과 다른 오류: ' || sqlerrm); end if;
  end;
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- I-2. 부여하면 잔여에 그대로 보인다 (발생 일수는 계산하지 않고 관리자가 입력한다)
  perform public.set_leave_grant(ws, uid::text, lv_year, 3, '테스트 부여');
  lv_balance := public.get_leave_balance(ws, lv_year, uid::text);
  select item into d from jsonb_array_elements(lv_balance) item limit 1;
  checks := checks + 3;
  if (d->>'grantedDays')::numeric <> 3 then fails := array_append(fails, format('I-2 부여: 기대=3 실제=%s', d->>'grantedDays')); end if;
  if (d->>'usedDays')::numeric <> 0 then fails := array_append(fails, format('I-2 사용: 기대=0 실제=%s', d->>'usedDays')); end if;
  if (d->>'remainingDays')::numeric <> 3 then fails := array_append(fails, format('I-2 잔여: 기대=3 실제=%s', d->>'remainingDays')); end if;

  -- I-3. 잔여를 넘기면 **신청 단계에서** 막는다 (승인 때 알게 되면 이미 늦다)
  checks := checks + 1;
  begin
    perform public.request_leave(ws, lv_mon, lv_mon + 4, 'annual', '잔여 초과 시도');
    fails := array_append(fails, 'I-3 잔여를 넘겨 신청됨');
  exception when others then
    if sqlerrm not like '%남은 연차가 부족%' then fails := array_append(fails, 'I-3 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-4. 근무일 계산: 월~금 5일에서 공휴일(수) 하나를 빼면 4일. 주말만이면 0일
  checks := checks + 2;
  if public.leave_working_days(ws, lv_mon, lv_mon + 4) <> 4
    then fails := array_append(fails, format('I-4 근무일: 기대=4 실제=%s', public.leave_working_days(ws, lv_mon, lv_mon + 4))); end if;
  if public.leave_working_days(ws, lv_mon + 5, lv_mon + 6) <> 0
    then fails := array_append(fails, format('I-4 주말 근무일: 기대=0 실제=%s', public.leave_working_days(ws, lv_mon + 5, lv_mon + 6))); end if;

  -- 이제부터는 잔여를 넉넉히 두고 나머지 규칙을 본다.
  perform public.set_leave_grant(ws, uid::text, lv_year, 10, null);
  if extract(year from lv_mon2 + 1)::integer <> lv_year then
    perform public.set_leave_grant(ws, uid::text, extract(year from lv_mon2 + 1)::integer, 10, null);
  end if;

  -- I-5. 주말·공휴일만 신청하면 쓸 연차가 없다
  checks := checks + 1;
  begin
    perform public.request_leave(ws, lv_mon + 5, lv_mon + 6, 'annual', '주말만 신청');
    fails := array_append(fails, 'I-5 주말만 신청이 통과됨');
  exception when others then
    if sqlerrm not like '%근무일이 없습니다%' then fails := array_append(fails, 'I-5 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-6. 종료일이 시작일보다 이르면 거부
  checks := checks + 1;
  begin
    perform public.request_leave(ws, lv_mon + 3, lv_mon, 'annual', '거꾸로 신청');
    fails := array_append(fails, 'I-6 종료일이 앞선 신청이 통과됨');
  exception when others then
    if sqlerrm not like '%종료일이 시작일보다%' then fails := array_append(fails, 'I-6 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-7. 반차는 하루만 (여러 날 반차는 0.5일로 셀 수가 없다)
  checks := checks + 1;
  begin
    perform public.request_leave(ws, lv_mon, lv_mon + 1, 'half_am', '이틀 반차');
    fails := array_append(fails, 'I-7 여러 날 반차가 통과됨');
  exception when others then
    if sqlerrm not like '%반차는 하루만%' then fails := array_append(fails, 'I-7 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-8. 알 수 없는 휴가 종류 거부 (DB의 type과 달리 신청 종류는 3가지뿐이다)
  checks := checks + 1;
  begin
    perform public.request_leave(ws, lv_mon, lv_mon, 'sick', '병가 신청');
    fails := array_append(fails, 'I-8 알 수 없는 종류가 통과됨');
  exception when others then
    if sqlerrm not like '%알 수 없는 휴가 종류%' then fails := array_append(fails, 'I-8 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-9. 사유는 2자 이상
  checks := checks + 1;
  begin
    perform public.request_leave(ws, lv_mon, lv_mon, 'annual', ' ');
    fails := array_append(fails, 'I-9 사유 없이 신청됨');
  exception when others then
    if sqlerrm not like '%사유를 입력%' then fails := array_append(fails, 'I-9 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-10. 너무 오래된 날짜는 신청할 수 없다 (지난 기록을 휴가로 덮어 잔여를 맞추는 걸 막는다)
  checks := checks + 1;
  begin
    perform public.request_leave(ws, today - 40, today - 40, 'annual', '소급 신청');
    fails := array_append(fails, 'I-10 40일 전 날짜가 신청됨');
  exception when others then
    if sqlerrm not like '%날짜 범위를 벗어났%' then fails := array_append(fails, 'I-10 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-11. 정상 신청 — 월~금이지만 수요일이 공휴일이라 4일로 잡혀야 한다
  --       (지난 세션에 내가 5일로 예상했다가 함수가 맞았던 자리다)
  checks := checks + 2;
  begin
    lv_request := public.request_leave(ws, lv_mon, lv_mon + 4, 'annual', '여름 휴가');
  exception when others then
    fails := array_append(fails, 'I-11 정상 신청 실패: ' || sqlerrm);
  end;
  if (select r.days from public.leave_requests r where r.id = lv_request) <> 4 then
    fails := array_append(fails, format('I-11 일수: 기대=4 실제=%s', (select r.days from public.leave_requests r where r.id = lv_request)));
  end if;

  -- I-12. 같은 기간에 겹쳐 신청할 수 없다
  checks := checks + 1;
  begin
    perform public.request_leave(ws, lv_mon + 3, lv_mon + 4, 'annual', '겹치는 신청');
    fails := array_append(fails, 'I-12 겹치는 기간이 신청됨');
  exception when others then
    if sqlerrm not like '%이미 신청한 휴가%' then fails := array_append(fails, 'I-12 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-13. 대기 중인 신청은 '대기'로만 잡히고 잔여는 아직 깎이지 않는다
  lv_balance := public.get_leave_balance(ws, lv_year, uid::text);
  select item into d from jsonb_array_elements(lv_balance) item limit 1;
  checks := checks + 4;
  if (d->>'grantedDays')::numeric <> 10 then fails := array_append(fails, format('I-13 부여: 기대=10 실제=%s', d->>'grantedDays')); end if;
  if (d->>'pendingDays')::numeric <> 4 then fails := array_append(fails, format('I-13 대기: 기대=4 실제=%s', d->>'pendingDays')); end if;
  if (d->>'usedDays')::numeric <> 0 then fails := array_append(fails, format('I-13 사용: 기대=0 실제=%s', d->>'usedDays')); end if;
  if (d->>'remainingDays')::numeric <> 10 then fails := array_append(fails, format('I-13 잔여: 기대=10 실제=%s', d->>'remainingDays')); end if;

  -- I-14. 일반 구성원은 승인할 수 없다
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  checks := checks + 1;
  begin
    perform public.review_leave(lv_request, true, null);
    fails := array_append(fails, 'I-14 일반 구성원이 휴가를 승인함');
  exception when others then
    if sqlerrm not like '%관리자 권한%' then fails := array_append(fails, 'I-14 예상과 다른 오류: ' || sqlerrm); end if;
  end;
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- I-15. 승인하면 근무일마다 휴가 기록을 **서버가** 만든다.
  --       직원이 버튼으로 만들 수 있게 두면 승인 없는 휴가가 다시 생긴다.
  perform public.review_leave(lv_request, true, '확인함');
  checks := checks + 3;
  if (select count(*) from public.commute_records r
      where r.user_id = uid::text and r.type = 'vacation' and r.date between lv_mon and lv_mon + 4) <> 4
    then fails := array_append(fails, format('I-15 휴가 기록 수: 기대=4 실제=%s',
      (select count(*) from public.commute_records r where r.user_id = uid::text and r.type = 'vacation' and r.date between lv_mon and lv_mon + 4))); end if;
  if exists (select 1 from public.commute_records r where r.user_id = uid::text and r.date = lv_mon + 2)
    then fails := array_append(fails, 'I-15 공휴일에도 휴가 기록이 생김'); end if;
  if exists (select 1 from public.commute_records r where r.user_id = uid::text and r.date in (lv_mon + 5, lv_mon + 6))
    then fails := array_append(fails, 'I-15 주말에도 휴가 기록이 생김'); end if;

  -- I-16. 승인 후에 잔여가 깎인다
  lv_balance := public.get_leave_balance(ws, lv_year, uid::text);
  select item into d from jsonb_array_elements(lv_balance) item limit 1;
  checks := checks + 3;
  if (d->>'usedDays')::numeric <> 4 then fails := array_append(fails, format('I-16 사용: 기대=4 실제=%s', d->>'usedDays')); end if;
  if (d->>'pendingDays')::numeric <> 0 then fails := array_append(fails, format('I-16 대기: 기대=0 실제=%s', d->>'pendingDays')); end if;
  if (d->>'remainingDays')::numeric <> 6 then fails := array_append(fails, format('I-16 잔여: 기대=6 실제=%s', d->>'remainingDays')); end if;

  -- I-17. 이미 처리된 신청은 다시 승인할 수 없다 (두 번 승인되면 기록이 두 벌 생긴다)
  checks := checks + 1;
  begin
    perform public.review_leave(lv_request, true, null);
    fails := array_append(fails, 'I-17 이미 처리된 신청이 다시 승인됨');
  exception when others then
    if sqlerrm not like '%이미 처리된 신청%' then fails := array_append(fails, 'I-17 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-18. 승인된 휴가는 직원이 스스로 취소할 수 없다 (기록이 이미 생겼으므로 관리자가 봐야 한다)
  checks := checks + 1;
  begin
    perform public.cancel_leave(lv_request);
    fails := array_append(fails, 'I-18 승인된 휴가가 취소됨');
  exception when others then
    if sqlerrm not like '%검토 대기 중인 신청만%' then fails := array_append(fails, 'I-18 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-19. 남의 신청은 취소할 수 없다
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  checks := checks + 1;
  begin
    perform public.cancel_leave(lv_request);
    fails := array_append(fails, 'I-19 남의 신청이 취소됨');
  exception when others then
    if sqlerrm not like '%내 신청만%' then fails := array_append(fails, 'I-19 예상과 다른 오류: ' || sqlerrm); end if;
  end;
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- I-20. 그 기간에 이미 출퇴근 기록이 있으면 승인을 막는다 (휴가와 출근이 같은 날 겹치면 안 된다)
  insert into public.commute_records (user_id, workspace_id, date, type, commute_subtype, start_time, end_time)
  values (uid::text, ws, lv_mon2, 'commute', 'arrival',
          (lv_mon2 + time '08:00') at time zone 'Asia/Seoul', (lv_mon2 + time '09:00') at time zone 'Asia/Seoul');
  lv_pending := public.request_leave(ws, lv_mon2, lv_mon2, 'annual', '기록 충돌 확인');
  checks := checks + 1;
  begin
    perform public.review_leave(lv_pending, true, null);
    fails := array_append(fails, 'I-20 출퇴근 기록이 있는 기간이 승인됨');
  exception when others then
    if sqlerrm not like '%이미 출퇴근 또는 휴가 기록%' then fails := array_append(fails, 'I-20 예상과 다른 오류: ' || sqlerrm); end if;
  end;

  -- I-21. 반차는 0.5일
  checks := checks + 2;
  begin
    lv_half := public.request_leave(ws, lv_mon2 + 1, lv_mon2 + 1, 'half_am', '오전 반차');
  exception when others then
    fails := array_append(fails, 'I-21 반차 신청 실패: ' || sqlerrm);
  end;
  if (select r.days from public.leave_requests r where r.id = lv_half) <> 0.5 then
    fails := array_append(fails, format('I-21 반차 일수: 기대=0.5 실제=%s', (select r.days from public.leave_requests r where r.id = lv_half)));
  end if;

  -- I-22. 거절하면 상태만 바뀌고 기록은 생기지 않는다
  perform public.review_leave(lv_half, false, '일정 조율 필요');
  checks := checks + 2;
  if (select r.status from public.leave_requests r where r.id = lv_half) <> 'rejected'
    then fails := array_append(fails, format('I-22 상태: 기대=rejected 실제=%s', (select r.status from public.leave_requests r where r.id = lv_half))); end if;
  if exists (select 1 from public.commute_records r where r.user_id = uid::text and r.date = lv_mon2 + 1)
    then fails := array_append(fails, 'I-22 거절했는데 기록이 생김'); end if;

  -- I-23. 일반 구성원에게는 자기 것만 보인다 (남의 휴가 사유와 잔여가 새 나가면 안 된다)
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  lv_list := public.list_leaves(ws, lv_mon - 30, lv_mon2 + 30, false);
  lv_balance := public.get_leave_balance(ws, lv_year, uid::text);
  checks := checks + 2;
  if jsonb_array_length(lv_list) <> 0
    then fails := array_append(fails, format('I-23 남의 휴가가 보임: %s건', jsonb_array_length(lv_list))); end if;
  if exists (select 1 from jsonb_array_elements(lv_balance) item where item->>'userId' = uid::text)
    then fails := array_append(fails, 'I-23 남의 잔여가 보임'); end if;
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- I-24. 권한 — 신청·승인·부여는 anon에게 닫혀 있고, 일수 계산은 앱에서 직접 못 부른다
  checks := checks + 4;
  if has_function_privilege('anon', 'public.request_leave(uuid, date, date, text, text)', 'execute')
    then fails := array_append(fails, 'I-24 request_leave가 anon에게 열려 있음'); end if;
  if has_function_privilege('anon', 'public.review_leave(uuid, boolean, text)', 'execute')
    then fails := array_append(fails, 'I-24 review_leave가 anon에게 열려 있음'); end if;
  if has_function_privilege('anon', 'public.set_leave_grant(uuid, text, integer, numeric, text)', 'execute')
    then fails := array_append(fails, 'I-24 set_leave_grant가 anon에게 열려 있음'); end if;
  if has_function_privilege('authenticated', 'public.leave_working_days(uuid, date, date)', 'execute')
    then fails := array_append(fails, 'I-24 leave_working_days가 authenticated에게 열려 있음'); end if;

  -- ── 결과 ──────────────────────────────────────────────────────────────────
  if array_length(fails, 1) is null then
    got := format('TEST_RESULT: 통과 %s / 실패 0 ✅', checks);
  else
    got := format('TEST_RESULT: 통과 %s / 실패 %s ❌%s%s',
      checks - array_length(fails, 1), array_length(fails, 1), chr(10), array_to_string(fails, chr(10)));
  end if;

  -- 전부 롤백한다. 이 예외가 곧 결과 리포트다.
  raise exception '%', got;
end $$;
