# 출퇴근 생존일지 (Commute Battle)

**근태 관리 시스템**입니다. 구성원이 출퇴근을 기록하면 회사 기준(소정근로·휴게·연장·야간·휴일근로·지각)으로 근무시간이 계산되고, 부서장과 관리자가 정정·휴가·재택을 승인하며, 달이 끝나면 급여 지급 근거를 확정합니다. 워크스페이스 채팅과 개인용 기록·통계 기능도 함께 들어 있습니다. 웹, PWA, Windows Electron 앱을 지원합니다.

> 배포 주소: [https://commute-battle.vercel.app](https://commute-battle.vercel.app)
>
> Windows 앱: [Commute Battle v0.1.0 설치 파일](https://github.com/snail5039-code/commute-battle/releases/download/v0.1.0/Commute.Battle.Setup.0.1.0.exe)

## 이 시스템이 지키려는 것 세 가지

1. **기록은 근거가 되어야 합니다.** 시각은 서버 시각으로만 남고, 직원이 직접 고치거나 지울 수 없습니다. 바꾸려면 정정을 요청하고 **다른 사람**이 승인해야 하며, 원래 값과 승인자가 감사 로그에 남습니다. 본인 기록의 정정은 본인이 승인하지 못합니다.
2. **임금에 영향을 주는 계산은 전부 서버(PostgreSQL 함수) 안에 있습니다.** 클라이언트가 계산에 관여하지 않으므로 브라우저를 조작해도 숫자가 바뀌지 않습니다. 그래서 회귀 테스트도 SQL로 작성되어 있습니다(216개).
3. **권한은 어디서 왔는지 설명할 수 있어야 합니다.** 직급은 표시 순서일 뿐 권한이 아닙니다. 승인 권한은 워크스페이스 역할(소유자·관리자)과, 관리자가 부서마다 **명시적으로 지정한 부서장**에게서만 나옵니다.

## 주요 기능

### 근태

- **출퇴근 기록**: 출발과 도착을 각각 기록합니다. 근무시간은 출근 *도착*부터 퇴근 *출발*까지로 봅니다. 조퇴·병가·휴가·결근도 구분해 남습니다.
- **근무시간 집계**: 소정근로, 휴게 자동 차감, 연장, 야간(22:00~06:00), 휴일근로, 지각·조기퇴근을 계산하고 **주 52시간 초과**를 판정합니다. 부서별로 걸러 보고 CSV로 내려받을 수 있습니다.
- **자정을 넘긴 퇴근**: 출근한 날의 근무로 귀속됩니다. 야근한 날이 두 날로 갈라지지 않습니다.
- **근태 정정**: 요청 → 관리자 또는 해당 부서장 승인. 본인 승인은 불가. 변경 이력이 남습니다.
- **출근 위치 인증(지오펜스)**: 사업장 반경과 허용 GPS 오차 안에서만 인증됩니다. 벗어나도 **기록은 남고** '미인증'으로 표시만 됩니다. 출근을 막지 않습니다.
- **공휴일**: 공공데이터포털 특일 정보·CSV·직접 추가 3경로. **관리자가 앱을 열면 그해와 다음 해를 자동으로 채우고**, 연중에 지정되는 임시공휴일도 주기적으로 다시 확인합니다.
- **휴가·연차**: 신청 → 승인, 승인 시 근무일마다 기록 자동 생성. 주말·공휴일은 사용 일수에서 제외. 잔여 초과는 *신청 단계*에서 막습니다. 부여 일수는 관리자가 입력합니다.
- **재택근무**: 신청 → 승인. 승인된 날만 재택으로 기록됩니다.
- **월 마감**: 마감하면 그달의 정정이 막히고 **그 시점의 집계가 스냅샷으로 보관**됩니다. 해제는 사유가 필요하고, 마감·해제 이력은 append-only 원장에 쌓입니다.

### 조직과 승인

- **부서·직급**: 관리자가 만들고 구성원마다 배정합니다. 부서를 지워도 사람과 근태 기록은 남습니다.
- **부서장(승인 라인)**: 부서장은 자기 부서원의 근무시간·연차 잔여를 보고 정정·휴가·재택을 승인합니다. 다른 부서는 목록에도 나오지 않습니다. 조직 편집·연차 부여·공휴일·월 마감·근무 정책은 관리자 전용입니다.
- **관리자 승인**: 관리자 권한 신청을 소유자 또는 다른 관리자가 처리합니다.

### 협업과 개인 기록

- **워크스페이스·채팅**: 초대 코드로 참여, 채널·개인 채팅, 파일 전송(10MB), 1:1 허들(음성·화면 공유), 실시간 알림.
- **지도와 경로**: 도보·대중교통 경로 비교, 날씨를 반영한 권장 출발 시각.
- **AI 출퇴근 비서**: Gemini 기반 코칭·경로 요약. 서버에서 개인정보 마스킹과 허용 필드 검증을 거칩니다.
- **성장과 통계**: 경험치·배지·캐릭터, 캘린더와 지각률 통계, 주간 리캡 이미지 공유.
- **화면 테마**: 화이트·다크·플럼 3종과 고대비·간격·모션 설정.

## 기술 구성

| 영역 | 기술 |
| --- | --- |
| 프레임워크 | Next.js 16 App Router, React 19, TypeScript |
| 스타일 | Tailwind CSS 4, Lucide React |
| 상태 관리 | Zustand 5 |
| 인증·데이터베이스 | Supabase Auth, PostgreSQL |
| 근태 계산 | PostgreSQL 함수 (SECURITY DEFINER) + RLS |
| 실시간 협업 | Supabase Realtime |
| AI | Google Gemini API |
| 지도·경로 | Kakao Maps, ODSAY, TMAP, OSRM 폴백 |
| 날씨 | Open-Meteo |
| 공휴일 | 공공데이터포털 특일 정보(한국천문연구원) |
| 데스크톱 | Electron, electron-builder, NSIS |
| 배포 | Vercel (GitHub 연동 자동 배포), GitHub Releases |

## 시작하기

### 1. 요구 사항

- Node.js 20 이상 권장
- npm
- Supabase 프로젝트
- Kakao Maps JavaScript 키
- 경로·AI·공휴일 기능을 쓰려면 ODSAY, TMAP, Google Gemini, 공공데이터포털 키

### 2. 설치

```bash
git clone https://github.com/snail5039-code/commute-battle.git
cd commute-battle
npm install
```

### 3. 환경 변수

프로젝트 루트에 `.env.local`을 만들고 아래 값을 설정합니다.

```dotenv
# 필수: Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

# 필수: Kakao Maps JavaScript 키
NEXT_PUBLIC_KAKAO_MAP_KEY=YOUR_KAKAO_MAP_JAVASCRIPT_KEY

# 대중교통 경로
ODSAY_API_KEY=YOUR_ODSAY_API_KEY

# 도보 경로 및 경로 선 보정(둘 중 하나, TMAP_APP_KEY 우선)
TMAP_APP_KEY=YOUR_TMAP_APP_KEY
# TMAP_API_KEY=YOUR_TMAP_API_KEY

# AI 기능
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
# 선택: 미설정 시 gemini-3.5-flash
# GEMINI_MODEL=gemini-3.5-flash

# 공휴일 자동 갱신 (공공데이터포털 특일 정보) — Decoding 키를 넣습니다
DATA_GO_KR_API_KEY=YOUR_DATA_GO_KR_DECODING_KEY

# 서버 전용: 회원탈퇴 시 Supabase Auth 계정 삭제
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

`NEXT_PUBLIC_` 접두사가 붙은 값만 브라우저 번들에 들어갑니다. 나머지는 서버 전용이므로 접두사를 붙이지 말고 저장소에도 커밋하지 마세요. 특히 Supabase service role 키는 RLS를 전부 우회하므로 회원탈퇴 서버 API 밖으로 나가면 안 됩니다.

키가 없을 때의 동작: Open-Meteo와 OSRM은 키 없이 동작합니다. ODSAY 키가 없으면 대중교통 조회가 꺼지고, TMAP 키가 없으면 OSRM 또는 참고용 예상 경로로 대체됩니다. Gemini 키가 없으면 AI 보강 기능만 빠집니다. `DATA_GO_KR_API_KEY`가 없으면 공휴일 자동 갱신이 실패로 기록되고 CSV·직접 추가만 쓸 수 있습니다.

### 4. Supabase 설정

`supabase/migrations`의 SQL을 **파일명 순서대로** 실행합니다. 순서를 지키지 않으면 뒤 마이그레이션이 앞에서 만든 테이블·함수를 찾지 못합니다.

| 파일 | 내용 |
| --- | --- |
| `202608060001_community_posts.sql` | 커뮤니티 테이블·RLS·기본 공지 |
| `202608060002_simple_accounts.sql` | 아이디·닉네임 컬럼과 제약 |
| `202608080001_quest_claims.sql` | 퀘스트 보상 중복 수령 방지 |
| `202608100001_department_chat.sql` | 초기 부서 채팅 테이블 *(현재 미사용)* |
| `202608100002_workspaces.sql` | 워크스페이스·채널·초대 |
| `202608100003_admin_location.sql` | 관리자 승인·출퇴근 현황·위치 공유 |
| `202608100004_direct_messages.sql` | 개인 채팅 |
| `202608100005_core_rls.sql` | 개인 데이터 RLS와 제한된 프로필 조회 |
| `202608170001_chat_attachments.sql` | 채팅 파일 첨부와 비공개 버킷 |
| `202608170002_attendance_integrity.sql` | **서버 시각 기록 RPC, 감사 로그, 정정 승인** |
| `202608170003_grant_hardening.sql` | TRUNCATE 회수, 퀘스트 RLS |
| `202608170004_backfill_record_workspace.sql` | 기존 기록에 워크스페이스 채우기 |
| `202608170005_attendance_start_scope.sql` | 중복 출발 차단 범위 조정 |
| `202608170006_attendance_function_grants.sql` | 근태 RPC를 비로그인에서 차단 |
| `202608170007_work_time.sql` | **근무 정책과 근무시간 집계** |
| `202608170008_remote_work.sql` | 재택 신청·승인 |
| `202608170009_geofence.sql` | 출근 위치 인증 |
| `202608170010_overnight_work_date.sql` | 자정 넘긴 퇴근의 근무일 귀속 |
| `202608170011_holidays.sql` | 공휴일 테이블과 집계 반영 |
| `202608180001_monthly_closing.sql` | **월 마감 원장과 스냅샷** |
| `202608180002_leave.sql` | **휴가 신청·승인, 연차 잔여** |
| `202608180003_holiday_auto_sync.sql` | 공휴일 자동 갱신 원장 |
| `202608180004_org.sql` | 조직: 부서·직급과 배정 |
| `202608180005_approval_line.sql` | **부서장 승인 라인** |
| `202608180006_workspace_access.sql` | 화면이 관리자·부서장을 구분 |
| `202608180007_head_leave_balance.sql` | 부서장의 부서원 연차 잔여 조회 |

그리고 Supabase Authentication에서 Email 로그인을 켜고, 현재 가입 흐름을 쓰려면 이메일 확인(Confirm email)을 끕니다. 배포 환경에서는 허용 URL과 리디렉션 URL에 실제 도메인을 등록합니다.

앱의 아이디는 내부적으로 `아이디@users.commute-battle.local` 형태의 Supabase Auth 이메일로 변환됩니다. 비밀번호 원문은 앱 테이블에 저장하지 않습니다.

> `schema.sql`은 **초기 스키마**라 현재 DB보다 뒤쳐져 있습니다(예: `start_time`은 이제 `timestamptz`). 새로 구축할 때는 마이그레이션을 순서대로 실행하는 쪽을 따르세요.

### 5. 개발 서버 실행

```bash
npm run dev
```

## 운영을 시작하는 순서

기능이 있어도 아래를 하지 않으면 잠들어 있습니다.

1. **사람을 워크스페이스에 넣습니다.** `/chat`에서 초대 코드를 만들어 전달하면 상대가 같은 화면에서 참여합니다. **가입만 하고 워크스페이스에 안 들어온 계정은 조직도에 나타나지 않습니다.**
2. **근무 정책과 사업장 위치를 정합니다.** `/admin` → 근무시간 집계 → 근무 정책. 사업장을 지정하기 전까지 위치 인증은 꺼져 있습니다.
3. **부서·직급을 만들고 배정합니다.** `/admin` → 조직.
4. **부서마다 부서장을 지정합니다.** 관리자가 한 명뿐이면 **본인 기록의 정정을 아무도 승인할 수 없습니다.**
5. **연차 부여 일수를 입력합니다.** `/admin` → 휴가·연차. 0일이면 휴가 신청 자체가 되지 않습니다.
6. 매달 말 **월 마감**으로 그달을 확정합니다. 공휴일은 자동으로 채워지므로 손댈 일이 없습니다.

## 화면 경로

| 경로 | 설명 |
| --- | --- |
| `/` | 소개 화면 또는 로그인 후 대시보드 |
| `/login` | 로그인·회원가입 |
| `/map` | 지도와 이동 경로 조회 |
| `/assistant` | AI 출퇴근 비서 |
| `/badges` | 퀘스트, 배지, 캐릭터 보상 |
| `/stats` | 근무 캘린더, 통계, **내 근무시간 집계** |
| `/settings` | 주소·근무 일정·알림·테마, **재택·휴가 신청**, 계정 |
| `/community` | 공지·자유게시판·의견수렴 |
| `/chat` | 워크스페이스·채널 채팅과 초대 |
| `/messages` | 구성원 간 개인 채팅 |
| `/admin` | **근태 승인·집계·조직·공휴일·월 마감** (관리자 전체, 부서장은 자기 부서 승인만) |
| `/install` | PWA 및 Windows 앱 설치 안내 |
| `/guide` | 역할별 사용법 |

## 프로젝트 구조

```text
app/
├─ api/                 # 계정 삭제, AI, 날씨, 대중교통, 공휴일 서버 API
├─ admin/               # 근태 승인·집계·조직 관리
├─ assistant/           # AI 비서 화면
├─ badges/              # 배지·퀘스트 화면
├─ chat/                # 워크스페이스 채널 채팅
├─ community/           # 커뮤니티 화면
├─ install/             # 설치 안내
├─ map/                 # 경로 조회 화면
├─ messages/            # 개인 채팅
├─ settings/            # 설정·재택·휴가 신청
└─ stats/               # 통계와 내 근무시간
components/             # 화면과 공용 React 컴포넌트 (admin/ 아래가 관리자 패널)
desktop/                # Electron 메인 프로세스와 앱 설정
lib/                    # 도메인 로직 (근태, 근무시간, 휴가, 조직, 공휴일, 경로, AI)
public/                 # PWA 아이콘, 서비스 워커, 정적 파일
supabase/
├─ migrations/          # 증분 SQL (위 표 참고)
└─ tests/attendance.sql # 근태 계산 회귀 테스트 216개
schema.sql              # 초기 스키마 (현재 DB보다 뒤쳐짐)
```

근태 쪽 핵심 파일:

- [`supabase/tests/attendance.sql`](./supabase/tests/attendance.sql): 회귀 테스트 216개 (A~L 구간)
- [`lib/attendance.ts`](./lib/attendance.ts): 근태 기록 RPC와 정정 요청
- [`lib/workTime.ts`](./lib/workTime.ts): 근무시간 집계 표시와 CSV
- [`lib/leave.ts`](./lib/leave.ts) · [`lib/remoteWork.ts`](./lib/remoteWork.ts): 휴가·재택
- [`lib/org.ts`](./lib/org.ts): 부서·직급·부서장
- [`lib/holidays.ts`](./lib/holidays.ts): 공휴일과 자동 갱신
- [`lib/closing.ts`](./lib/closing.ts): 월 마감
- [`lib/geofence.ts`](./lib/geofence.ts): 위치 인증
- [`components/CommuteButton.tsx`](./components/CommuteButton.tsx): 출퇴근·조퇴·병가·휴가 버튼
- [`components/admin/WorkspaceAdminDashboard.tsx`](./components/admin/WorkspaceAdminDashboard.tsx): 관리자·부서장 화면

그 밖: [`app/api/route/transit/route.ts`](./app/api/route/transit/route.ts)(경로 조합), [`app/api/ai/route.ts`](./app/api/ai/route.ts)(Gemini 검증·캐시·제한), [`app/api/account/route.ts`](./app/api/account/route.ts)(회원탈퇴), [`lib/stats.ts`](./lib/stats.ts)(통계).

## 명령어

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run build` | 프로덕션 빌드 및 타입 검사 |
| `npm run start` | 빌드 결과를 프로덕션 모드로 실행 |
| `npm run desktop` | Next 개발 서버와 Electron 개발 창 실행 |
| `npm run desktop:dist` | Windows Electron 설치 파일 생성 |

변경사항을 제출하기 전:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

### 근태 회귀 테스트

임금에 영향을 주는 계산이 전부 PostgreSQL 함수 안에 있어서 테스트도 SQL입니다. `npm test`로 자동화되어 있지 않습니다(러너에 DB 접속 문자열이 필요한데 저장소에 두고 싶지 않은 값입니다).

[`supabase/tests/attendance.sql`](./supabase/tests/attendance.sql) 전체를 Supabase SQL Editor에 붙여넣고 실행합니다.

- 결과는 **예외 메시지**로 나옵니다: `TEST_RESULT: 통과 216 / 실패 0 ✅`
- 마지막에 일부러 예외를 던져 **전부 롤백**되므로 DB에는 아무것도 남지 않습니다.
- 합성 계정·워크스페이스를 트랜잭션 안에서 만들어 쓰므로 실제 데이터에 의존하지 않습니다.
- 구간: A 근무시간 · B 자정 넘김 · C 근무일 귀속 · D 기록 RPC · E 위치 인증 · F 권한 · G 공휴일 · H 월 마감 · I 휴가·연차 · J 공휴일 자동 갱신 · K 조직 · L 승인 라인

**근무시간 계산이나 근태 RPC를 고치면 이 파일부터 돌리고, 새 규칙을 넣었으면 케이스도 추가하세요.**

## 데이터와 보안 참고

- **RLS는 public 스키마 전 테이블에 켜져 있습니다.** `commute_records`는 authenticated에 SELECT만 열려 있고 쓰기는 `attendance_*` RPC로만 가능합니다. 감사 로그(`commute_record_audits`)는 정책이 없어 정의자 함수 밖에서는 아무도 읽지 못합니다.
- 근태 판정 함수(위치 인증, 부서장 판정, 마감 여부 등)는 앱에서 직접 호출할 수 없도록 `authenticated`·`anon` 권한을 회수했습니다. 정의자 함수 안에서만 쓰입니다.
- AI 요청은 서버 라우트로만 Gemini에 전달하며 주소·비밀값을 마스킹하고 허용 필드만 보냅니다. 요청 크기 제한, IP 기준 제한, 짧은 캐시, 타임아웃이 걸려 있습니다.
- 근무 일정, 일부 UI 설정, 경로 선호, 장착 액세서리는 브라우저 `localStorage`에 저장됩니다. 기기 간 동기화되지 않습니다.
- 회원탈퇴는 비밀번호를 다시 확인한 뒤 서버 전용 service role 키로 Auth 계정을 삭제합니다. 탈퇴자가 소유한 워크스페이스는 관리자를 우선해 이전하고, 남은 구성원이 없으면 삭제합니다.
- 위치·경로 정보는 민감할 수 있습니다. 로그, 화면 공유, 커뮤니티 게시물에 집 주소나 현재 위치가 노출되지 않도록 주의하세요.

## 배포

`master`에 푸시하면 연결된 Vercel 프로젝트가 자동 배포합니다. 저장소에서 `vercel --prod`를 직접 실행하지 않습니다.

Vercel 프로젝트에도 로컬과 같은 환경 변수를 등록하고, 공개 도메인을 Kakao Maps와 Supabase 허용 목록에 추가해야 합니다. `SUPABASE_SERVICE_ROLE_KEY`는 회원탈퇴 API에 필요하므로 Vercel Environment Variables에도 반드시 등록한 뒤 재배포하세요.

## 데스크톱 앱

```bash
npm run desktop        # Next 개발 서버 + Electron 개발 창
npm run desktop:dist   # Windows 설치 파일 생성 → dist-desktop/
```

설치 파일을 만들기 전 `desktop/app-config.json`의 `appUrl`에 배포된 HTTPS 주소를 넣습니다. 새 버전을 낼 때는 빌드 결과물을 GitHub Release에 첨부하고 `/install` 페이지의 버전·다운로드 주소도 갱신합니다.

## 알려진 한계

- **법·제도 판단은 범위 밖입니다.** 연차 발생 일수 자동 산정, 가산수당 규정, 연차 이월·촉진은 다루지 않습니다. 취업규칙마다 달라 잘못 넣으면 그대로 임금 분쟁이 됩니다. 시스템은 기계장치만 제공하고 숫자는 관리자가 입력합니다. **상용 운영 전에 노무사·변호사 검토가 필요합니다.**
- **교대·유연근무제는 반영되지 않았습니다.** 근무 스케줄이 아직 기기 `localStorage`에 있습니다.
- **사업장은 워크스페이스당 한 곳입니다.** 여러 사업장은 확장 과제로 미뤄 두었습니다.
- **공휴일 자동 갱신은 관리자가 앱을 열 때 돕니다.** 관리자가 오랫동안 접속하지 않으면 갱신도 멈춥니다.
- 배지 진행도는 저장하지 않고 매번 클라이언트에서 다시 계산합니다.
- `public.departments` / `department_messages`는 초기 부서 채팅 시절 테이블로 **현재 코드에서 사용하지 않습니다**. 조직 기능은 `org_departments` / `org_positions`를 씁니다.

## 라이선스

이 저장소에는 별도의 오픈소스 라이선스가 지정되어 있지 않습니다.
