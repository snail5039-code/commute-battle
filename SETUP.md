# 출퇴근 생존일지 개발 현황 & TODO

> 마지막 작업일: **2026-08-18**. 다음 세션 시작할 때 이 파일부터 읽기.
> 이번 세션 상세 기록: [`docs/2026-08-17_근태시스템_전환.md`](docs/2026-08-17_근태시스템_전환.md),
> [`docs/2026-08-17_지오펜스.md`](docs/2026-08-17_지오펜스.md),
> [`docs/2026-08-17_자정넘김과_테스트.md`](docs/2026-08-17_자정넘김과_테스트.md),
> [`docs/2026-08-17_공휴일.md`](docs/2026-08-17_공휴일.md),
> [`docs/2026-08-18_마감과_휴가.md`](docs/2026-08-18_마감과_휴가.md),
> [`docs/2026-08-18_휴가_회귀테스트_편입.md`](docs/2026-08-18_휴가_회귀테스트_편입.md),
> [`docs/2026-08-18_공휴일_자동갱신.md`](docs/2026-08-18_공휴일_자동갱신.md),
> [`docs/2026-08-18_조직_부서직급.md`](docs/2026-08-18_조직_부서직급.md),
> [`docs/2026-08-18_승인라인과_병가.md`](docs/2026-08-18_승인라인과_병가.md),
> [`docs/2026-08-18_전체점검.md`](docs/2026-08-18_전체점검.md)

## 지금 어디까지 왔나

출퇴근 기록 앱 + 워크스페이스 채팅으로 시작했고, 2026-08-17부터 **근태 관리 시스템으로 상용화**하는
방향으로 전환 중이다. 이번 세션에 근태의 토대(기록 신뢰성 → 근무시간 산정 → 재택 승인 → 위치 인증 →
자정 넘김 → 공휴일 → 회귀 테스트)를 깔았다.

| 영역 | 상태 |
|---|---|
| 출퇴근/조퇴/병가/휴가 기록 | 서버 시각으로만 기록, 직원 직접 수정·삭제 불가, 감사 로그 있음 |
| 근태 정정 | 요청 → **관리자 또는 부서장** 승인 (본인 승인 불가) |
| 근무시간 집계 | 소정근로·휴게·연장·야간·휴일·지각, 주 52시간 초과 판정, CSV 내보내기 |
| 재택근무 | 신청 → 관리자 승인, **승인된 날만** 재택 기록 가능 |
| 출근 위치 인증 | 사업장 반경 안에서만 인증. 실패해도 기록은 남기고 '미인증'으로 표시 |
| 자정 넘겨 퇴근 | 출근한 날의 근무로 귀속. 야근한 날이 집계에서 사라지지 않음 |
| 공휴일 | 공공데이터 API·CSV·직접 추가 3경로. **매년 자동 갱신**(관리자가 앱을 열면 서버가 채움) |
| 월 마감 | 마감하면 정정 차단 + 지급 근거 스냅샷. 해제는 사유 필수, 원장에 이력 |
| 휴가·연차 | 신청 → 승인, 승인 시 근무일마다 기록 자동 생성. 잔여 관리(부여 일수는 관리자 입력) |
| 자동 테스트 | `supabase/tests/attendance.sql` **216개 검사** (A~L 구간) |
| 조직(부서·직급) | 부서·직급 배정, 집계를 부서로 걸러 봄. **직급은 권한이 아님** |
| 승인 라인 | 부서장이 자기 부서원의 근태 정정·재택·휴가를 승인. **/admin에 부서장 모드로 입장** |
| 워크스페이스 채팅 | 채널·DM·파일 전송(10MB)·허들(1:1 음성+화면공유) |
| 법·제도 대응 | 사용자 지시로 범위 제외 (상용화 전 노무사·변호사 자문 필요) |

## 배포 정보
- **GitHub**: https://github.com/snail5039-code/commute-battle (public)
- **Vercel**: https://commute-battle.vercel.app (자동 배포됨 — GitHub master에 push하면 Vercel이 알아서 재배포. **직접 `vercel --prod` 실행하지 말 것**, 사용자가 명시적으로 지시한 규칙)
- Supabase 프로젝트: `commute-battle` (조직 snail5039-aiagent)
- 메인 관리자 계정: username `snail2483` (비밀번호·집/직장 주소 등 개인정보는 저장소에 기록하지 않음)

## 로컬 실행
```bash
cd commute-battle
npm install
npm run dev
```
http://localhost:3000

---

## 🚀 다음 세션 이렇게 시작하세요

### 0) 남은 일 한눈에 (2026-08-18 기준)

**형이 해야 하는 것 — 이걸 안 하면 만든 기능이 잠들어 있습니다**

| # | 할 일 | 어디서 | 왜 필요한가 |
|---|---|---|---|
| 1 | **사업장 위치 지정** | /admin → 근무 정책 | 지금 위치 인증이 **꺼져 있음**. 지정해야 켜짐 |
| 2 | **연차 부여 일수 입력** | /admin → 휴가·연차 | 0일이면 아무도 휴가를 신청할 수 없음 |
| 3 | 아래 4)의 체크리스트 | 앱 전체 | 실제 사용 기록이 아직 0건. 합성 데이터로만 검증됨 |

1번은 회사에서 하면 '현재 위치' 버튼 한 번이면 끝납니다.
공휴일은 이제 **손댈 일이 없습니다** — 앱을 열면 알아서 채워집니다.

**제가 할 수 있는 것 (로드맵 순서)**

| # | 할 일 | 상태 |
|---|---|---|
| 1 | 지오펜스 후속(미인증 기록을 화면에서 바로 승인) | 필요해지면 |
| ~~-~~ | ~~승인 라인(부서장)~~ | ✅ 2026-08-18 완료 |
| ~~-~~ | ~~병가 버튼~~ | ✅ 2026-08-18 완료 |
| ~~-~~ | ~~사업장 여러 곳~~ | 🚫 사용자 결정으로 제외 — "사업장은 그냥 한 곳" (2026-08-18) |
| ~~-~~ | ~~조직(부서·직급)~~ | ✅ 2026-08-18 완료 |
| ~~-~~ | ~~공휴일 매년 자동 갱신~~ | ✅ 2026-08-18 완료 |
| ~~-~~ | ~~휴가 케이스를 회귀 테스트에 편입~~ | ✅ 2026-08-18 완료 (85 → 126개) |
| ~~-~~ | ~~급여 시스템 연동 포맷~~ | 🚫 사용자 결정으로 제외 — "급여는 회사마다 다르니 굳이 필요 없을 듯" (2026-08-18) |

**솔직한 의견 (2026-08-18 갱신)**: 로드맵에 남은 것이 사실상 없습니다. 근태 시스템의 뼈대도,
자동화도 다 섰습니다. **지금 가장 큰 문제는 기능이 모자란 게 아니라 실제 사용 기록이 0건이라는
것입니다.** 169개 테스트가 지키는 건 전부 합성 데이터 위에서의 동작입니다.

다음 기능을 더 얹는 것보다 위 표의 1·2번을 하고 **한 달 실제로 써 보는 게** 값어치가 큽니다.
써 보면 반드시 문제가 나오고, 그건 제가 미리 상상해서 만들 수 있는 종류가 아닙니다.

남은 로드맵 두 개도 지금 하기엔 이릅니다 — 승인 라인은 구성원이 1~2명이면 승인할 사람이
자기 자신이고, 사업장 여러 곳은 회사가 한 곳입니다. 둘 다 "필요해지면"이 맞습니다.

### 1) 세션 시작할 때 할 말

가장 무난한 것:

> commute-battle 프로젝트. `SETUP.md` 읽고 이어서 진행해줘.

특정 작업을 콕 집으려면:

> commute-battle 프로젝트. `SETUP.md` 읽고, 조직(부서·직급)부터 진행해줘.
> commute-battle 프로젝트. `SETUP.md` 읽고, 공휴일 자동 갱신부터 해줘.

써 보다 문제가 나왔으면 그냥 증상만 말해도 됩니다:

> commute-battle 프로젝트. `SETUP.md` 읽고. 휴가 승인했는데 기록이 안 생겨.

급여 연동을 하려면 시스템 이름을 같이 알려주세요:

> commute-battle 프로젝트. `SETUP.md` 읽고, 급여 연동 포맷 만들자. 우리는 ○○ 써.


### 2) 로컬 준비

```bash
cd commute-battle
npm run dev
```

- `npm install`은 이미 되어 있습니다. 모듈을 못 찾는 오류가 나면 그때만 다시 실행하세요.
- **마이그레이션 파일 13개 전부 원격 DB에 적용 완료**입니다. 지금 당장 실행할 SQL은 없습니다.
- 배포는 master에 push하면 Vercel이 자동으로 합니다.

### 환경변수

`.env.local`과 Vercel에 모두 들어 있어야 합니다(서버 전용 키는 `NEXT_PUBLIC_` 접두사 없음).

| 이름 | 쓰임 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 접속 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 지도·주소 검색 |
| `GEMINI_API_KEY` | AI 비서·경로 코멘트 |
| `ODSAY_API_KEY` / `TMAP_APP_KEY` | 대중교통 경로 |
| `DATA_GO_KR_API_KEY` | 공휴일([한국천문연구원 특일 정보](https://www.data.go.kr/data/15012690/openapi.do)) — **Decoding 키**를 넣을 것 |

### 테스트 돌리는 법

임금에 영향을 주는 계산은 전부 Postgres 함수 안에 있어서 테스트도 SQL입니다.
`supabase/tests/attendance.sql` 전체를 Supabase SQL Editor에 붙여넣고 실행하거나,
Supabase MCP `execute_sql`에 그대로 넘기면 됩니다.

- 결과는 **예외 메시지**로 나옵니다: `TEST_RESULT: 통과 216 / 실패 0 ✅`
- 마지막에 일부러 예외를 던져 **전부 롤백**되므로 DB에는 아무것도 남지 않습니다.
- 합성 계정·워크스페이스를 트랜잭션 안에서 만들어 쓰므로 실제 데이터에 의존하지 않습니다.
- **근무시간 계산이나 근태 RPC를 고치면 이 파일부터 돌릴 것.** 새 규칙을 넣었으면 케이스도 추가.

`npm test`로 자동화되어 있지는 않습니다(러너가 붙으려면 Postgres 접속 문자열이 필요한데
저장소에 두고 싶지 않은 값입니다). 지금은 수동 실행입니다.

### 3) 지오펜스는 관리자가 사업장을 지정해야 켜집니다 ⚠️

**지금은 사업장 좌표가 비어 있어서 위치 인증이 꺼져 있습니다.** 모든 기록이 '검증 대상 아님'으로 남습니다.

1. /admin → 근무시간 집계 → **근무 정책** 열기
2. '사업장 위치' 지도에서 회사 주소를 검색하거나 지도를 눌러 지정 (또는 회사에서 '현재 위치' 버튼)
3. 허용 반경(기본 200m)과 허용 GPS 오차(기본 150m)를 확인하고 **정책 저장**

지정하면 그 다음 기록부터 인증이 적용됩니다. 다시 끄려면 '위치 인증 끄기'를 누르고 저장하면 됩니다.

### 4) 사용자가 직접 해봐야 하는 검증 (아직 실제 사용 기록이 0건)

새 기능들은 합성 데이터로만 검증했습니다. 실제 계정으로 한 번씩 눌러 봐야 하는 것:

- [ ] 채널에 이미지 1장 + 일반 파일 1개 보내기 → 다른 계정에서 열리는지
- [ ] 허들: 계정 2개로 1:1 통화 + 화면 공유 (브라우저, 그리고 데스크톱 앱)
- [ ] 재택근무 신청 → /admin에서 승인 → 재택 출근 기록 → 집계에 '재택'으로 나오는지
- [ ] 캘린더에서 근태 정정 요청 → /admin에서 승인 → 기록이 바뀌고 이력이 남는지
- [ ] /admin 근무시간 집계에서 CSV 내보내기 → 엑셀에서 한글이 깨지지 않는지
- [ ] **휴가**: /admin에서 연차 부여 일수 입력 → 설정에서 휴가 신청 → /admin 승인 → 그 기간에 휴가 기록이 자동으로 생기는지
- [ ] **위치 인증**: 사업장 지정 후 집에서 출근 도착을 눌러 보기 → '위치 미인증' 배너가 뜨고
      /admin 집계에 미인증으로 잡히는지. 회사에서 눌렀을 땐 아무 경고도 안 떠야 정상
- [ ] **위치 인증**: 브라우저 위치 권한을 끈 상태로 출근 도착 → 기록은 되고 '위치 권한 거부'로 남는지
- [ ] **조직**: /admin에서 부서·직급을 만들고 배정 → 근무시간 집계에 부서 필터와 부서 열이 나오는지
      (관리자 화면은 로그인 뒤에 있어 제가 눌러 보지 못했습니다)
- [ ] **부서장**: 부서에 부서장을 지정 → 그 사람 계정으로 **/admin에 들어가지는지**(부서장 모드),
      자기 부서원의 정정·재택·휴가가 보이고 승인되는지, 다른 부서는 안 보이는지
- [ ] **병가**: 대시보드에서 병가를 누르면 기록되고 집계에 '병가'로 나오는지

문제가 있으면 다음 세션에 "○○ 안 된다"고 하면 됩니다.

### 5) 재논의 대상으로 남겨둔 것

- **자기 승인**: 재택·휴가는 허용(관리자 1명 워크스페이스가 막히므로), 근태 정정은 금지 —
  이렇게 다르게 뒀습니다. 부서장에게도 같은 규칙이 그대로 적용됩니다. 구성원이 늘면 통일할지 결정 필요.
- **실제 운영 전 필수**: 본인 기록의 정정은 남이 승인해야 하므로, 관리자 2명 이상이거나
  부서장이 지정돼 있어야 합니다.
- **미완결 기록은 새 출근을 막습니다.** 0010에서 중복 차단 범위가 '어제~오늘'이 되었기 때문에,
  어제·오늘 도착을 안 찍은 기록이 있으면 새 출근이 시작되지 않습니다(오류 메시지에 날짜가 나옵니다).
  앱에서 '무사 도착'을 눌러 닫거나, 잘못된 기록이면 정정 요청으로 바로잡으세요.
  (2026-08-17: 08-16·08-17 테스트 잔재 2건은 사용자 지시로 삭제했습니다. 감사 로그에 남아 있습니다.)

---

## 🗺 로드맵 (근태 시스템, 법·제도 항목 제외)

1. ~~조직(부서·직급)~~ — **완료**(2026-08-18).
   [`docs/2026-08-18_조직_부서직급.md`](docs/2026-08-18_조직_부서직급.md).
   승인 라인은 아직입니다 — '부서장'을 어떻게 정할지가 "직급은 권한이 아니다"와 어떻게 어울릴지 먼저 정해야 합니다.
2. ~~급여 시스템 연동 포맷~~ — **사용자 결정으로 제외**(2026-08-18). 급여 시스템은 회사마다 달라
   범용 포맷을 만들 실익이 없다고 판단했습니다. 근무시간 집계 CSV로 충분합니다.
3. ~~공휴일 매년 자동 갱신~~ — **완료**(2026-08-18). 관리자가 앱을 열면 서버가 알아서 채웁니다.
   자세한 내용은 [`docs/2026-08-18_공휴일_자동갱신.md`](docs/2026-08-18_공휴일_자동갱신.md).
4. 지오펜스 후속(필요해지면): 미인증 기록을 관리자가 화면에서 바로 승인/반려하는 흐름(지금은 근태
   정정 요청으로 처리), GPS 위치 조작 앱 탐지.
   - **사업장 여러 곳 지원은 확장 과제로 미뤘다** (2026-08-17, 사용자 결정 — "기본적으로 한 회사에만
     출근하니 괜찮다"). 지금은 `work_policies`가 워크스페이스당 1행이라 사업장도 1곳이다. 나중에 늘리려면
     `work_sites` 테이블로 옮기고(현재 한 행을 복사하면 됨) `attendance_location_check`가 가장 가까운
     사업장으로 판정하게 하면 된다. 진짜 결정할 건 기하학이 아니라 **직원이 아무 사업장에서나 찍을 수
     있는지, 사람마다 소속 사업장이 정해지는지**다 — 후자면 아래 조직(부서·직급) 항목과 함께 해야 한다.

### 교대/유연근무제 — 사용자 결정으로 제외 (2026-08-18)
- "교대근무는 제외하고 나머지 진행하자". 실제로 교대 근무를 쓰지 않아서 미룹니다.
- 나중에 필요해지면: 근무 스케줄이 아직 기기 localStorage에 있어서 서버로 올려야 하고,
  그러면 `is_on_time`도 서버 판정으로 바꿀 수 있습니다(지금은 경험치용 자기신고 값).

## 🔲 보류 중인 작은 항목

### ~~병가(sick) 버튼~~ — 2026-08-18 완료
조퇴/병가/휴가 3열이 됐습니다. 병가는 **자기신고**입니다(휴가와 다름) — 아파서 못 나오는 건
그날 아침 일이라 승인을 기다리면 기록이 늦어지고, 연차를 깎지도 않기 때문입니다.
하루 한 번, 휴무일 불가, 퇴근 후 불가.

---

# 지난 세션 기록 (참고용, 아래는 과거 이력)

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

### 마이그레이션 적용 상태 (2026-08-17 확인)
**0001~0009 모두 원격 DB에 적용 완료**다.
`schema.sql`은 초기 스키마라 현재 DB보다 뒤쳐져 있다(예: `start_time`은 이제 `timestamptz`).

⚠️ **파일이 항상 진실은 아니다.** 0008 작업 때 `get_attendance_summary`에 `isRemote`를 넣은 정의가
파일에는 안 남고 DB에만 적용돼 있었다(0009에서 파일로 복원함). 함수를 고치기 전에
`select pg_get_functiondef(...)`로 **라이브 정의를 먼저 확인**할 것.

| 파일 | 내용 |
|---|---|
| `202608170001_chat_attachments.sql` | 채널 파일 첨부 컬럼 + 비공개 버킷 `chat-files` + 정책 |
| `202608170002_attendance_integrity.sql` | 서버 시각 기록 RPC, 감사 로그, 정정 승인, timestamptz 전환 |
| `202608170003_grant_hardening.sql` | TRUNCATE 회수, `quest_claims` RLS |
| `202608170004_backfill_record_workspace.sql` | 기존 기록 38건에 소속 워크스페이스 채움 |
| `202608170005_attendance_start_scope.sql` | 중복 출발 차단을 당일로 한정 |
| `202608170006_attendance_function_grants.sql` | 근태 RPC를 비로그인 호출에서 차단 |
| `202608170007_work_time.sql` | `work_policies` + `get_attendance_summary` |
| `202608170008_remote_work.sql` | 재택 신청·승인 + 재택 기록 제한 |
| `202608170009_geofence.sql` | 사업장 좌표·반경, 출근 도착·퇴근 출발 위치 판정, 집계 노출 |
| `202608170010_overnight_work_date.sql` | 자정 넘긴 퇴근을 출근한 날의 근무로 귀속 |
| `202608170011_holidays.sql` | 공휴일 테이블(`work_holidays`) + 집계에 휴일 반영 |
| `202608180001_monthly_closing.sql` | 월 마감 원장 + 스냅샷, 마감된 달 정정 차단 |
| `202608180002_leave.sql` | 휴가 신청·승인, 연차 부여·잔여, 근무일 계산 |
| `202608180003_holiday_auto_sync.sql` | 공휴일 자동 갱신 원장(`work_holiday_syncs`) + 재시도 주기 판단 |
| `202608180004_org.sql` | 조직: `org_departments`·`org_positions` + 구성원 배정 |
| `202608180005_approval_line.sql` | 부서장 지정 + 승인·조회 함수 7개를 **치환**으로 확장 |
| `202608180006_workspace_access.sql` | `my_workspace_access` — 화면이 관리자/부서장을 구분 |
| `202608180007_head_leave_balance.sql` | 부서장도 부서원의 연차 잔여를 봄(승인 판단에 필요) |

### 테이블과 RLS
`users` / `commute_records` / `badges` / `community_posts` / `quest_claims` /
`chat_*`(워크스페이스·채널·메시지·DM) / `work_policies` / `remote_work_requests` /
`commute_correction_requests` / `commute_record_audits` / `work_holiday_syncs` /
`org_departments` / `org_positions`.

⚠️ **`public.departments`는 우리 조직 테이블이 아니다.** 0100001의 부서 채팅 채널 테이블이고
(`department_messages`가 참조), 앱 코드 어디에서도 더는 참조하지 않는다 — 채팅은
`chat_channels`/`chat_messages`로 옮겨갔다. 조직은 `org_departments`다.
테이블을 새로 만들기 전에 `select to_regclass('public.이름')`으로 확인할 것
(`create table if not exists`는 이름만 같아도 조용히 넘어간다 — 2026-08-18에 여기서 한 번 죽었다).

**RLS는 public 스키마 전 테이블에 켜져 있다**(예전 메모에 "community_posts만 켜져 있음"이라고 적혀
있었지만 지금은 아니다). 특히:

- `commute_records`: authenticated 권한은 **SELECT만**. 쓰기는 `attendance_*` RPC로만.
- `commute_record_audits`: RLS만 켜고 정책 없음 → 정의자 함수 외에는 아무도 못 읽는다.
- TRUNCATE/TRIGGER/REFERENCES는 anon·authenticated에서 회수했다(RLS가 TRUNCATE를 막지 못하므로).
- `commute_records.type`은 `'commute' | 'return' | 'early_leave' | 'vacation' | 'sick' | 'absence'`.

### 주요 파일 위치
| 기능 | 파일 |
|---|---|
| 근태 기록 RPC 클라이언트 · 정정 요청 | `lib/attendance.ts` |
| 위치 인증(좌표 수집·안내 문구) | `lib/geofence.ts` |
| 사업장 위치 지정 지도 | `components/admin/OfficeLocationPicker.tsx` |
| 공휴일(API·CSV 파싱·저장) | `lib/holidays.ts`, `app/api/holidays/route.ts` |
| 공휴일 관리 화면 | `components/admin/HolidayPanel.tsx` |
| 공휴일 자동 갱신(앱 시작 시 조용히) | `components/HolidayAutoSync.tsx`, `lib/holidays.ts`의 `syncHolidaysIfDue` |
| 조직(부서·직급)·부서장 | `lib/org.ts`, `components/admin/OrgPanel.tsx` |
| 역할별 사용법 화면 | `app/guide/page.tsx` (직원·부서장·관리자·FAQ) |
| 월 마감(원장·스냅샷) | `lib/closing.ts`, `components/admin/MonthlyClosingPanel.tsx` |
| 휴가·연차 | `lib/leave.ts`, `components/LeavePanel.tsx`, `components/admin/LeaveAdminPanel.tsx` |
| 근무시간 집계 표시·CSV | `lib/workTime.ts`, `components/AttendanceReport.tsx` |
| 재택 신청·승인 | `lib/remoteWork.ts`, `components/RemoteWorkPanel.tsx` |
| 관리자 화면(정정·재택 승인·집계) | `components/admin/WorkspaceAdminDashboard.tsx` |
| 채팅(채널·파일 전송) | `lib/departmentChat.ts`, `components/chat/DepartmentChat.tsx` |
| 허들(1:1 통화·화면공유) | `lib/huddle.ts`, `components/chat/HuddleBar.tsx` |
| 출퇴근 버튼 · 조퇴/병가/휴가 | `components/CommuteButton.tsx` |
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

## 미해결로 남아 있는 작은 항목
- 배지 진행도가 `badges` 테이블에 저장되지 않고 매번 클라이언트에서 재계산됨 (동작은 정상)
- 미니프로젝트 제출은 2026-08-09에 끝났음 (제출 문서 `../미니프로젝트3_출퇴근전쟁봇.md`는 그 시점 기준)

---

## 작업 규칙 (기억할 것)
- **커밋 메시지는 한국어로.** 본문은 왜(root cause) 위주로 서술 (8/6엔 영어로 썼다가 8/8에 사용자가 직접 한국어로 바꾸라고 교정함 — 처음부터 한국어로 쓸 것)
- **GitHub push까지만** 하고 Vercel은 자동배포에 맡길 것 (수동 `vercel --prod` 금지, 사용자 지시)
- 코드 수정 후 `npx tsc --noEmit` + `npm run lint` + `npm run build` 세 개 다 통과 확인하고 커밋
- **DB 마이그레이션은 파일로 남기고 Supabase MCP `apply_migration`으로 적용**한다(2026-08-17에 사용자가
  이 방식을 선택). 적용 후에는 read-only 쿼리로 결과를 직접 확인할 것.
- **기존 함수를 고치기 전에 `select pg_get_functiondef(...)`로 라이브 정의를 먼저 읽을 것.**
  마이그레이션 파일에 안 남은 변경이 DB에만 있을 수 있다(0008의 `isRemote`가 실제로 그랬다).
- **RPC·정책 검증은 롤백되는 DO 블록으로** 한다 — `do $$ ... raise exception 'TEST_RESULT: %', msg; end $$;`
  마지막에 예외를 던지면 전부 롤백되므로, 실제 데이터 위에서 돌려도 아무것도 남지 않는다.
  사용자 흉내내기는 `perform set_config('request.jwt.claim.sub', '<uuid>', true)`.
- `npm install`은 **샌드박스를 끄고** 실행해야 실제 디스크에 설치된다(샌드박스에서는 성공한 것처럼 보이지만
  dev 서버가 모듈을 못 찾는다). 설치 후에도 Turbopack이 실패한 해석을 캐시하고 있으면 dev 서버를 멈추고
  `.next`를 지운 뒤 다시 띄운다(서버가 떠 있으면 파일이 잠겨 삭제 실패).
- push 후 `vercel ls`로 새 배포가 Ready 될 때까지 기다렸다가 실제 배포 사이트에서 동작 확인 (로컬 dev 서버는 브라우저 세션 캐시 문제로 헷갈릴 때가 많았음)
- 브라우저 자동화 도구가 이 환경에서 가끔 "pane not displayed, not compositing frames" 상태가 됨 → 스크린샷/ResizeObserver가 안 먹힐 수 있으니 `getBoundingClientRect` 같은 레이아웃 기반 값으로 대체 확인
- OneDrive 폴더라 `.next` 빌드 캐시가 파일 잠금(EPERM)을 일으킬 수 있음 → 안되면 보고하고, 명시적 허락 없이 캐시 삭제하지 말 것
- (8/8 해결됨) 예전엔 dev 모드에서도 서비스워커가 등록돼서 코드를 고쳐도 브라우저가 옛 번들을 계속 보여줬음 — 이제 프로덕션에서만 등록되니 이 문제는 더 안 겪어도 됨
- 로그인 필수 화면(대부분)을 로그인 없이 확인해야 할 땐, `components/AppShell.tsx`의 `isLoginPage` 판별에 테스트용 경로를 임시로 추가해 우회하고 mock 데이터로 렌더링 확인한 뒤, 반드시 `git checkout -- components/AppShell.tsx`로 되돌리고 임시 파일도 삭제할 것 (이번 세션 내내 쓴 방법)
