# 출퇴근전쟁봇 개발 현황 & TODO

> 마지막 작업일: 2026-08-08. 다음 세션 시작할 때 이 파일부터 읽기.

## 배포 정보
- **GitHub**: https://github.com/snail5039-code/commute-battle (public)
- **Vercel**: https://commute-battle.vercel.app (자동 배포됨 — GitHub master에 push하면 Vercel이 알아서 재배포. **직접 `vercel --prod` 실행하지 말 것**, 사용자가 명시적으로 지시한 규칙)
- Supabase 프로젝트: `commute-battle` (조직 snail5039-aiagent)
- 실제 계정: username `snail2483` (home: 대전 유성구 원신흥로100번길, work: 서울 강남구 가로수길)

## 로컬 실행
```bash
cd commute-battle
npm install
npm run dev
```
http://localhost:3000

---

## 🔲 지금 당장 이어서 할 일 (다음 세션에 시작할 것)

### 1. 부서별 채팅 (팝업창) — 사용자가 요청, 설계까지 끝내고 구현은 다음 세션으로 미룸 (2026-08-08)
마감(8/9)이 임박해서 사용자가 "이 정도만 하자, 다음에 추가로 넣자"고 명시적으로 보류 지시함. **설계는 이미 끝났으니 다음 세션엔 바로 구현 시작하면 됨** — 전체 설계 문서: `C:\Users\snail\.claude\plans\happy-chasing-feigenbaum.md` (이 파일이 없어졌으면 아래 요약으로 재구성 가능).

**요약:**
- 부서 이름은 자유 텍스트 (`users.department` 컬럼 신규 추가, `nickname`처럼 2~20자 체크). 고정 목록 아님 — 사용자가 직접 확정함
- 신규 테이블 `department_messages` (department, user_id, author_nickname, content, created_at) — **RLS를 켜야 함** (부서 격리가 이 기능의 핵심이라 꺼두면 의미 없음, `community_posts`처럼 `auth.uid()` 기반 정책). `alter publication supabase_realtime add table` 필요 — 이 앱은 지금까지 Realtime을 한 번도 안 써봤음
- 신규 `lib/departmentChat.ts`: `fetchDepartmentMessages`/`sendDepartmentMessage`/`subscribeToDepartmentMessages` (Realtime 구독)
- 신규 팝업 페이지 `app/chat/page.tsx` — `AppShell.tsx`의 `isLoginPage` 판별에 `/chat` 추가해서 사이드바 없이 채팅만 뜨게 함
- 진입점: `Sidebar.tsx`에 `window.open('/chat', 'department-chat', 'width=380,height=600')` 버튼 (데스크톱만, `NAV_ITEMS`엔 안 넣음 — `Link`로는 팝업이 안 열림)
- 검증 방법(이번 세션에 실제로 썼던 패턴): RLS는 `set local request.jwt.claim.sub`로 특정 사용자 JWT 흉내내서 SQL로 직접 확인, UI는 AppShell 임시 우회 + mock user로 렌더링 후 되돌리기, "다른 사용자 메시지 도착"은 SQL로 직접 insert해서 Realtime이 집어오는지 확인

### 2. 병가(sick) 버튼이 없음 — 사용자가 우선순위 낮춤, 보류
- DB 스키마(`commute_records.type`)는 `'sick'`을 이미 지원하지만, `components/CommuteButton.tsx`의 `recordSimpleEvent` 타입 유니언과 UI 버튼 둘 다 `'early_leave' | 'vacation'`만 있고 병가가 없음
- 사용자가 "병가는 우선 빼자"고 명시적으로 보류 지시함 (2026-08-06) — 나중에 다시 요청하면 조퇴/휴가 옆에 병가 버튼 추가하고 3열 그리드로 조정 (`grid-cols-2` → `grid-cols-3`)

---

## ✅ 8/8 세션에서 고친 것 (버그 15개 + 기능 2개)

### 버그 수정
- **UTC/KST 날짜 불일치** — 여러 파일이 `toISOString().split('T')[0]`(UTC 기준)로 "오늘"을 계산해서, 자정~오전 9시 사이(대부분의 실제 출근 시간)에 기록한 출근이 하루 전 날짜로 저장되던 근본 버그. `lib/date.ts`의 `localDateKey()`로 통일
- `total_commute_arrivals`가 퇴근 시에도 증가하던 버그 (`lib/commuteArrival.ts`)
- 정시 판정이 개인 평균이 빠르면 공식 스케줄보다 더 엄격해지던 버그 → 공식 스케줄 준수는 항상 정시로 인정하게 수정 (`lib/onTime.ts`)
- 안 쓰이는 프로토타입 API 라우트 3개 삭제 (`app/api/commute/start`, `arrive`, `app/api/user/init`)
- **주말에도 출근 버튼이 눌리던 버그의 실체**: 설정 화면이 월~금만 보여줘서 과거에 남은 토/일 override가 안 보이고 못 지워졌음 → 토/일 칸 추가 + 각 요일에 실제 날짜 표시 + `setMode`가 "출근=설정없음"으로 처리하던 지름길 버그도 같이 수정 (`components/SettingsSections.tsx`)
- 알림 설정(카테고리 on/off, 리드타임)이 저장은 되는데 실제 알림 로직이 하나도 안 읽고 있던 버그 → `DepartureRecommendation.tsx`/`CommuteMapView.tsx`에 연결
- 커뮤니티 "비로그인도 읽을 수 있다"는 문구가 실제로는 `AppShell`이 모든 비로그인 접근을 `/login`으로 튕겨서 거짓이었음 → 문구를 실제 동작에 맞게 수정
- 경로 학습 추천이 사실상 죽어있던 버그 — 추천된 기본 경로를 그냥 받아들이면 학습 기록이 전혀 안 쌓였음 (`components/CommuteMapView.tsx`)
- 개발 모드에서 서비스워커가 무조건 등록돼서 캐시가 재컴파일보다 오래 살아남던 문제 (이번 세션 테스트를 계속 방해했던 원인) → `NODE_ENV !== 'production'`이면 등록 안 하게 (`components/PwaRegistration.tsx`)
- GPS 첫 신호가 부정확해 저장된 주소로 폴백할 때, 화면의 "출발 기준" 표시는 안 바뀌던 버그 → 기존 `applyFallback` 재사용 (`components/CommuteMapView.tsx`)
- "목적지 근처 도착" 배너가 GPS 한 번만 튀어도 뜬 뒤 절대 안 사라지던 버그 → 매 GPS 갱신마다 최신 값을 그대로 반영 (`components/CommuteMapView.tsx`)
- AI로 보내기 전 개인정보 마스킹이 지번주소·영문주소를 못 잡던 구멍, 비밀키 마스킹이 대소문자 구분하던 버그, `context` 객체를 통째로 넘겨서 알려지지 않은 필드가 새 나갈 수 있던 구멍 (`lib/aiPayload.ts`)
- **퀘스트 보상이 localStorage에만 저장돼서 시크릿창/다른 기기에서 중복 수령 가능하던 버그** → `quest_claims` 테이블 신설 + `(user_id, claim_key)` 유니크 제약으로 원자적 중복 방지 (`supabase/migrations/202608080001_quest_claims.sql`, `lib/questLedger.ts`)
- **캐릭터 EXP/레벨 저장이 동시 저장 시 한쪽이 사라질 수 있던 버그** → 낙관적 동시성(읽은 값과 다르면 재시도)으로 전환 (`lib/expReward.ts`)

### 기능 추가
- **주간 리캡 공유 카드** — 통계 페이지 + 대시보드에 작은 버튼으로 노출, Canvas API로 이미지 생성해 다운로드/공유 (`lib/weeklyRecapCard.ts`, `components/WeeklyRecapCard.tsx`)
- 미니프로젝트 제출 문서(`../미니프로젝트3_출퇴근전쟁봇.md`) 실제 코드에 맞게 전면 갱신 (배포주소, 기능 목록, 데이터설계, AI 활용, 화면흐름, 기획서 대비 변경점 전부)

### 작업 규칙 변경 (중요)
- **커밋 메시지를 한국어로 쓸 것** — 영어로 계속 썼다가 사용자가 직접 교정함 ("커밋할때 규칙 맞춰서 올려 헷갈려 그리고 한국어로 올리고", 2026-08-08). 아래 "작업 규칙" 섹션도 갱신함

---

## ✅ 8/6 세션 네 번째 라운드 (퀘스트 완료 모달)
- 퀘스트 보상을 받으면 그냥 조용히 버튼만 "수령 완료"로 바뀌던 것 → 완료 축하 모달(퀘스트 이름 + 획득 EXP) 추가 (`components/QuestBoard.tsx`)

---

## ✅ 8/6 세션 세 번째 라운드에서 고친 것 (근무 형태 반영/펫 진화 시각화)

- 설정의 요일별 근무 형태(출근/재택/휴무)가 대시보드 출퇴근 버튼에 실제로 반영되지 않던 문제 (`components/CommuteButton.tsx`)
  - 휴무일: 출근/퇴근/조퇴/휴가 버튼 모두 비활성화 + "오늘은 휴무입니다!" 배너 표시
  - 재택일: "출근"을 누르면 경로 안내 없이 바로 완료 처리(집 컴퓨터 앞에 앉는 순간이 출근이므로 이동 단계가 없음) — `lib/commuteArrival.ts`의 `recordInstantTrip` 추가, start_time=end_time=now로 즉시 기록
- **펫이 진화해도 안 변한다는 피드백**: 사실 두 가지 문제가 겹쳐 있었음
  1. 진화 축하 모달(`EvolutionCelebration.tsx`)이 배지 페이지의 퀘스트 보상 클레임에서만 떴고, 정작 EXP를 가장 많이 얻는 경로인 "무사 도착!"(`recordArrival`)에서는 레벨업/진화를 감지도, 축하도 하지 않았음 → `recordArrival`/`recordInstantTrip`이 `LevelProgress`를 반환하도록 바꾸고, `CommuteButton`에서 레벨업 시 축하 모달을 띄우도록 연결
  2. 캐릭터 아이콘 자체가 4단계 내내 완전히 똑같았음(같은 lucide 아이콘, 같은 색, 코너의 작은 배지만 다름) → `lib/characterStages.ts`에 `STAGE_ICON_SCALE`(단계별 아이콘 크기 0.7→1.18배)과 `STAGE_RING_CLASS`(단계별 링/글로우: 무색 → 초록 → 파랑+글로우 → 금색+강한 글로우)를 추가해 `CharacterIcon`/`CharacterCard`/`PetWidget`/`EvolutionCelebration`에 적용

---

## ✅ 8/6 세션 두 번째 라운드에서 고친 것 (조퇴/휴가/지각/액세서리)

- **모바일에서 박스가 넘친다던 버그의 실체**: 이전 세션에서 못 찾았던 문제가 바로 이것이었음 — `DashBoard.tsx`의 "퇴근 경로 요약" 카드에서 `truncate` 텍스트를 담은 grid 아이템에 `min-w-0`이 없어서, grid 아이템 기본값(`min-width: auto`)이 긴 경로 문자열을 줄이지 않고 화면 밖으로 밀어냄. 그리드 컨테이너와 각 카드에 `min-w-0` 추가로 해결(`components/DashBoard.tsx`)
- 조퇴/휴가에 실제 사용 제한 추가 (`components/CommuteButton.tsx`): 조퇴는 오늘 출근 기록이 있어야 하고 하루 1번, 휴가는 출근 여부 무관하지만 하루 1번+퇴근 이후엔 불가. 조건 미충족 시 버튼 비활성 + 이유 툴팁
- 퇴근 후 다시 출근한 기록(재출근)이 지각률에 잘못 반영되던 문제 → 하루 중 가장 이른 출근 기록만 지각 평가 대상으로 삼도록 수정 (`lib/stats.ts`의 `firstCommutePerDay`). "출근 완료" 건수 집계에는 영향 없음, 지각률/지각건수/평균 지각분에만 적용
- **퀘스트 보상 받기가 항상 실패하던 버그** (사용자 제보): `claimQuestReward`의 "이미 보상받은 기록" 체크가 퀘스트 종류 구분 없이 전역이라, 오늘 daily_commute 보상을 받으면 그 기록을 포함하는 weekly_commutes(5/5 완료)가 영원히 보상 불가 상태가 됐음 → 퀘스트 키별로 네임스페이스 분리 (`lib/quests.ts`)
- 펫 액세서리가 배지 페이지에 해금 여부만 보여주고 실제로는 아무 데도 적용되지 않던 문제 → localStorage 기반 착용/해제 시스템 추가. 배지 페이지에서 해금된 액세서리를 눌러 착용하면 대시보드 캐릭터 카드와 화면을 떠다니는 펫 위젯에 이모지로 실제 표시됨 (`lib/petCatalog.ts`, `components/CharacterIcon.tsx`, `components/CharacterCard.tsx`, `components/PetWidget.tsx`, `app/badges/page.tsx`). 액세서리 7종 → 13종으로 확장

---

## ✅ 오늘(8/6) 세션에서 고친 것

### 지도/경로
- **경로 안내선이 지도에 전혀 안 보이던 근본 원인**: `app/globals.css`의 `img, svg { max-width: 100% }` 리셋이 카카오맵 SDK 내부 오버레이 SVG(0×0px 위치 기준 div 안에 있음)에도 걸려서 `max-width`가 0으로 계산 → 렌더링 폭이 0px로 잘림. `svg` 제거해서 해결 (`img`만 남김)
- 기차/철도 구간이 ODSAY 좌표가 없을 때 직선으로 그려지던 문제 → `enrichRoadReferenceSegments`가 버스만 도로참고선 처리하고 있었음. 기차도 포함하고, TMAP 실패 시 무료 OSRM으로 폴백 추가
- `estimatedOdsayReference`(전체 후보 실패 시 폴백)가 `tmapKey`를 전달받지도 않아 항상 직선이었음 → 보정 로직 연결
- 지도에 "내 위치로 이동" 버튼 추가 (새로고침 없이 마지막 위치로 즉시 이동)

### AI (Gemini)
- **`GEMINI_API_KEY` 환경변수 이름 불일치**로 서버가 키를 못 찾아 항상 503 → 이름 통일, Vercel에도 추가
- **AI 응답이 항상 중간에 끊기던 근본 원인**: `gemini-2.5-flash`가 `maxOutputTokens` 예산을 보이지 않는 "생각(thinking)" 토큰에 다 써버림 (실측: 500개 중 476개를 생각에 쓰고 답변엔 10개만 남음) → `thinkingConfig.thinkingBudget: 0`으로 비활성화, `maxOutputTokens`도 1500으로 상향. 비서/펫 멘트/경로 코멘트 등 전체 AI 기능에 영향 있던 문제였음
- 비서가 이전 대화를 기억 못해서 "그거 추천해줘" 같은 후속 질문에 항상 되묻기만 하던 문제 → 최근 3턴을 히스토리로 같이 전송하도록 수정
- 모델을 `gemini-3.5-flash`로 변경 (API로 직접 존재 확인 후 적용)

### 대시보드
- 즐겨찾기한 퇴근 경로가 "최근 선택 경로" 기록에 항상 밀려서 절대 안 보이던 버그 수정 (`lib/dashboardSummary.ts`) — 즐겨찾기가 있으면 그게 우선
- 출근했으면 출근 버튼이 또 눌리고 퇴근했으면 퇴근이 또 눌리던 문제 → `commuteCount`/`returnCount` 비교로 막음 (하루 여러 번 출퇴근은 그대로 가능)
- 펫 카드/이번달 통계 카드가 옆의 큰 카드(오늘의 근무) 높이에 `h-full`로 강제로 맞춰져서 빈 공간이 크게 남던 문제 → `self-start`로 전환, 그리고 그 옆 칸을 CommuteButton과 분리된 별도 2열 그리드로 재구성해서 빈 공간 최소화
- "빠른 설정"(설정 섹션 바로가기 6개), "커뮤니티 미리보기"(최신 글 3개) 위젯 추가
- 배지 위젯이 캐릭터 카드와 똑같은 펫 이름/레벨/EXP 바를 중복으로 보여주던 것 제거, 배지 개수는 캐릭터 카드 쪽으로 이동
- 캘린더에서 하루 기록이 많으면 페이지 전체가 끝없이 늘어나던 문제 → `getBoundingClientRect`로 캘린더 실측 높이를 읽어서 그만큼만 스크롤되게 수정 (ResizeObserver는 이 환경에서 안 fire해서 못 씀)
- Chrome 줄바꿈이 한글 단어 중간에서 깨지던 문제 → `word-break: keep-all` 전역 적용

---

## 데이터 구조 참고

### 테이블: users / commute_records / badges / community_posts / quest_claims
스키마는 `schema.sql` 참고 (단, 실제 DB는 `username`/`nickname`/`department`(예정) 컬럼 등이 추가돼 있어 파일보다 앞서 있음 — 확실한 건 Supabase에서 직접 확인). `commute_records.type`은 `'commute' | 'return' | 'early_leave' | 'vacation' | 'sick' | 'absence'`. `quest_claims`는 `(user_id, claim_key)` 유니크 제약으로 퀘스트 중복 수령을 막음. RLS는 `community_posts`만 켜져 있고 나머지는 다 꺼짐(부서 채팅 추가 시 `department_messages`는 RLS 켜야 함, 위 "지금 당장 이어서 할 일" 참고).

### 주요 파일 위치
| 기능 | 파일 |
|---|---|
| 출퇴근 버튼 · 조퇴/휴가(병가 추가 예정) | `components/CommuteButton.tsx` |
| 대시보드 그리드 | `components/DashBoard.tsx` |
| 대시보드 요약 로직(퇴근 경로 등) | `lib/dashboardSummary.ts` |
| 지도 · 경로 표시 | `components/CommuteMapView.tsx` |
| 경로 API (ODSAY+TMAP+OSRM) | `app/api/route/transit/route.ts` |
| Gemini AI 라우트 | `app/api/ai/route.ts` |
| 비서 UI | `components/AssistantPanel.tsx` |
| 캐릭터 위젯 UI | `components/PetWidget.tsx` |
| 캘린더 | `components/CalendarView.tsx` |
| 주간 리캡 공유 카드 | `lib/weeklyRecapCard.ts`, `components/WeeklyRecapCard.tsx` |
| 퀘스트 보상 서버 저장 | `lib/questLedger.ts`, `components/QuestBoard.tsx` |
| EXP 동시성 안전 저장 | `lib/expReward.ts` |
| 전역 로그인 가드(팝업 등 예외 처리 지점) | `components/AppShell.tsx` |

---

## ⚠️ 제출 전 반드시 확인 (마감 8/9 일요일 23:59)
- [x] 미니프로젝트 제출 문서(`../미니프로젝트3_출퇴근전쟁봇.md`) 최신 기능 반영해서 갱신 — 8/8에 끝남
- [x] 날씨 API — 실제로는 Open-Meteo 무료 API를 이미 쓰고 있음 (하드코딩 아님, 확인 완료)
- [ ] **Supabase RLS가 `users`/`commute_records`/`badges`/`quest_claims` 4개 테이블 모두 비활성화 상태.** 데모용이면 괜찮지만 신경 쓰인다면 RLS 정책 추가 (`community_posts`는 이미 켜져 있음)
- [ ] 배지 진행도가 `badges` 테이블에 실제로 저장 안 되고 매번 클라이언트에서 재계산됨 (기능은 정상 동작하니 급하지 않음) — 퀘스트 보상은 8/8에 서버 저장으로 옮겼으니 이건 별개 항목
- [ ] 다른 기기/시크릿 창에서 전체 플로우 한 번 더 테스트 (사용자가 직접 할 항목)
- [ ] 스크린샷 2장 이상 (AI 기능 동작 장면 필수) 준비 (사용자가 직접 할 항목)
- [ ] `node_modules` 제외하고 작업폴더 + md 문서 zip 압축 (사용자가 직접 할 항목)

---

## 작업 규칙 (기억할 것)
- **커밋 메시지는 한국어로.** 본문은 왜(root cause) 위주로 서술 (8/6엔 영어로 썼다가 8/8에 사용자가 직접 한국어로 바꾸라고 교정함 — 처음부터 한국어로 쓸 것)
- **GitHub push까지만** 하고 Vercel은 자동배포에 맡길 것 (수동 `vercel --prod` 금지, 사용자 지시)
- 코드 수정 후 `npx tsc --noEmit` + `npm run lint` + `npm run build` 세 개 다 통과 확인하고 커밋
- push 후 `vercel ls`로 새 배포가 Ready 될 때까지 기다렸다가 실제 배포 사이트에서 동작 확인 (로컬 dev 서버는 브라우저 세션 캐시 문제로 헷갈릴 때가 많았음)
- 브라우저 자동화 도구가 이 환경에서 가끔 "pane not displayed, not compositing frames" 상태가 됨 → 스크린샷/ResizeObserver가 안 먹힐 수 있으니 `getBoundingClientRect` 같은 레이아웃 기반 값으로 대체 확인
- OneDrive 폴더라 `.next` 빌드 캐시가 파일 잠금(EPERM)을 일으킬 수 있음 → 안되면 보고하고, 명시적 허락 없이 캐시 삭제하지 말 것
- (8/8 해결됨) 예전엔 dev 모드에서도 서비스워커가 등록돼서 코드를 고쳐도 브라우저가 옛 번들을 계속 보여줬음 — 이제 프로덕션에서만 등록되니 이 문제는 더 안 겪어도 됨
- 로그인 필수 화면(대부분)을 로그인 없이 확인해야 할 땐, `components/AppShell.tsx`의 `isLoginPage` 판별에 테스트용 경로를 임시로 추가해 우회하고 mock 데이터로 렌더링 확인한 뒤, 반드시 `git checkout -- components/AppShell.tsx`로 되돌리고 임시 파일도 삭제할 것 (이번 세션 내내 쓴 방법)
