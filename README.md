# 출퇴근 생존일지 (Commute Battle)

매일의 출근과 퇴근을 기록하고, 실제 이동 데이터와 날씨를 바탕으로 더 나은 출발 시각과 경로를 찾는 출퇴근 습관 관리 서비스입니다. 꾸준히 기록하면 캐릭터가 성장하고 배지와 액세서리를 얻을 수 있어 반복적인 출퇴근을 가벼운 게임처럼 이어갈 수 있습니다.

> 배포 주소: [https://commute-battle.vercel.app](https://commute-battle.vercel.app)

## 주요 기능

- **간편 계정과 개인 설정**: 아이디·비밀번호·닉네임으로 가입하고 집/직장 주소, 근무 시각, 요일별 출근·재택·휴무 일정을 설정합니다.
- **출퇴근 기록**: 출발과 도착 시각, 이동 시간, 정시 여부, 날씨, 획득 경험치를 기록합니다. 조퇴와 휴가도 별도로 관리합니다.
- **지도와 경로 추천**: 현재 위치 또는 저장 주소를 기준으로 도보·대중교통 경로를 조회하고, 소요 시간·도보 거리·환승 정보를 비교합니다.
- **날씨 기반 출발 추천**: 최근 이동 시간, 요일, 강수와 바람을 반영해 권장 출발 시각과 안전 여유 시간을 제안합니다.
- **AI 출퇴근 비서**: Gemini가 경로 요약, 기록 기반 코칭, 통계 코멘트와 캐릭터 메시지를 생성합니다. 서버에서 입력 검증·개인정보 마스킹·응답 길이 제한을 적용합니다.
- **성장과 보상**: 기록과 퀘스트로 경험치를 얻어 캐릭터를 진화시키고, 배지와 액세서리를 수집·착용할 수 있습니다.
- **통계와 공유**: 캘린더, 지각률, 평균 이동 시간 등 출퇴근 통계를 확인하고 주간 리캡 카드를 이미지로 저장하거나 공유합니다.
- **커뮤니티**: 공지, 자유게시판, 의견수렴 게시물을 확인하고 로그인 사용자는 글을 작성할 수 있습니다.
- **PWA**: 모바일과 데스크톱에 설치할 수 있으며, 오프라인 안내 화면과 알림 설정을 제공합니다.

## 기술 구성

| 영역 | 기술 |
| --- | --- |
| 프레임워크 | Next.js 16 App Router, React 19, TypeScript |
| 스타일 | Tailwind CSS 4, Lucide React |
| 상태 관리 | Zustand 5 |
| 인증·데이터베이스 | Supabase Auth, PostgreSQL |
| AI | Google Gemini API |
| 지도·경로 | Kakao Maps, ODSAY, TMAP, OSRM 폴백 |
| 날씨 | Open-Meteo |
| 배포 | Vercel (GitHub 연동 자동 배포) |

## 시작하기

### 1. 요구 사항

- Node.js 20 이상 권장
- npm
- Supabase 프로젝트
- Kakao Maps JavaScript 키
- 경로 및 AI 기능을 사용할 경우 ODSAY, TMAP, Google Gemini API 키

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
```

`NEXT_PUBLIC_` 접두사가 붙은 값은 브라우저 번들에서 사용되는 공개 클라이언트 설정입니다. `GEMINI_API_KEY`, `ODSAY_API_KEY`, `TMAP_APP_KEY` 같은 서버 키에는 이 접두사를 붙이지 말고 저장소에도 커밋하지 마세요.

Open-Meteo 날씨 API와 OSRM 폴백은 별도 키 없이 동작합니다. ODSAY 키가 없으면 대중교통 조회가 비활성화되고, TMAP 키가 없거나 호출에 실패하면 가능한 범위에서 OSRM 또는 참고용 예상 경로를 표시합니다. Gemini 키가 없으면 AI 보강 기능만 사용할 수 없습니다.

### 4. Supabase 설정

1. Supabase SQL Editor에서 [`schema.sql`](./schema.sql)을 실행해 기본 테이블을 만듭니다.
2. `supabase/migrations`의 SQL 파일을 파일명 순서대로 실행합니다.
   - `202608060001_community_posts.sql`: 커뮤니티 테이블, RLS 정책, 기본 공지
   - `202608060002_simple_accounts.sql`: 아이디·닉네임 컬럼과 제약 조건
   - `202608080001_quest_claims.sql`: 퀘스트 보상 중복 수령 방지
3. Supabase Authentication에서 Email 로그인을 활성화합니다.
4. 가입 직후 바로 로그인되는 현재 흐름을 사용하려면 이메일 확인(Confirm email)을 비활성화합니다.
5. 배포 환경에서는 허용 URL과 리디렉션 URL에 실제 서비스 도메인을 등록합니다.

앱의 일반 아이디는 내부적으로 `아이디@users.commute-battle.local` 형태의 Supabase Auth 이메일로 변환됩니다. 비밀번호 원문은 앱 테이블에 저장하지 않고 Supabase Auth가 관리합니다.

> 현재 저장소의 SQL은 프로젝트 진행 과정의 기본 스키마와 증분 마이그레이션으로 구성되어 있습니다. 실제 운영 DB의 변경 이력과 차이가 없는지 확인한 뒤 적용하세요. 특히 접근 제어 정책은 배포 전에 서비스 요구사항에 맞게 반드시 검토해야 합니다.

### 5. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다. 지도 기능은 브라우저 위치 권한이 필요할 수 있으며, Kakao Developers 콘솔의 허용 도메인에 `http://localhost:3000`을 등록해야 합니다.

## 사용 흐름

1. 회원가입 후 집과 직장 주소, 기본 출퇴근 시각을 설정합니다.
2. 홈에서 오늘의 근무 형태와 권장 출발 시각을 확인합니다.
3. 이동 화면에서 현재 위치와 목적지 사이의 경로를 조회합니다.
4. 출근을 시작하고 도착 시 기록을 완료해 경험치를 받습니다.
5. 통계·퀘스트·배지 화면에서 누적 기록과 성장 상태를 확인합니다.
6. AI 비서에게 최근 기록에 기반한 피드백을 요청하거나 주간 리캡을 공유합니다.

## 화면 경로

| 경로 | 설명 |
| --- | --- |
| `/` | 소개 화면 또는 로그인 후 대시보드 |
| `/login` | 로그인·회원가입 |
| `/map` | 지도와 이동 경로 조회 |
| `/assistant` | AI 출퇴근 비서 |
| `/badges` | 퀘스트, 배지, 캐릭터 보상 |
| `/stats` | 캘린더와 출퇴근 통계 |
| `/settings` | 주소, 근무 일정, 알림 등 설정 |
| `/community` | 공지·자유게시판·의견수렴 |
| `/install` | PWA 설치 안내 |
| `/guide` | 서비스 사용법 |

## 프로젝트 구조

```text
app/
├─ api/                 # AI, 날씨, 대중교통 서버 API
├─ assistant/           # AI 비서 화면
├─ badges/              # 배지·퀘스트 화면
├─ community/           # 커뮤니티 화면
├─ map/                 # 경로 조회 화면
├─ settings/            # 사용자 설정 화면
└─ stats/               # 통계 화면
components/             # 화면과 공용 React 컴포넌트
lib/                    # 데이터, 통계, 경로, AI, 보상 도메인 로직
public/                 # PWA 아이콘, 서비스 워커, 정적 파일
supabase/migrations/    # Supabase 증분 SQL
schema.sql              # 기본 데이터베이스 스키마
```

핵심 로직은 다음 파일에서 확인할 수 있습니다.

- [`components/CommuteButton.tsx`](./components/CommuteButton.tsx): 출퇴근·조퇴·휴가 기록
- [`components/CommuteMapView.tsx`](./components/CommuteMapView.tsx): 지도, 위치, 경로 UI
- [`app/api/route/transit/route.ts`](./app/api/route/transit/route.ts): ODSAY/TMAP/OSRM 경로 조합
- [`app/api/ai/route.ts`](./app/api/ai/route.ts): Gemini 요청 검증, 캐시, 제한, 응답 처리
- [`lib/stats.ts`](./lib/stats.ts): 출퇴근 통계 계산
- [`lib/quests.ts`](./lib/quests.ts): 퀘스트 조건과 보상

## 명령어

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run build` | 프로덕션 빌드 및 타입 검사 |
| `npm run start` | 빌드 결과를 프로덕션 모드로 실행 |

변경사항을 제출하기 전 아래 검사를 권장합니다.

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## 데이터와 보안 참고

- AI 요청은 서버 라우트를 통해서만 Gemini로 전달하며, 주소와 비밀값을 마스킹하고 허용 필드만 전송합니다.
- AI API에는 요청 크기 제한, IP 기준 요청 제한, 짧은 응답 캐시, 타임아웃이 적용되어 있습니다.
- 근무 일정, 일부 UI 설정, 경로 선호와 장착 액세서리 등은 브라우저 `localStorage`에 저장됩니다. 브라우저 데이터 삭제 또는 다른 기기 사용 시 동기화되지 않을 수 있습니다.
- 커뮤니티에는 RLS가 적용되어 있지만 다른 테이블의 정책 상태는 별도로 점검해야 합니다. 실제 사용자 데이터를 다루기 전 Supabase RLS와 권한을 운영 기준으로 강화하세요.
- 위치와 경로 정보는 민감할 수 있습니다. API 로그, 화면 공유, 커뮤니티 게시물에 정확한 집 주소나 현재 위치가 노출되지 않도록 주의하세요.

## 배포

`master` 브랜치가 GitHub에 푸시되면 연결된 Vercel 프로젝트가 자동으로 배포합니다. Vercel 프로젝트에도 로컬과 같은 환경 변수를 등록하고, 공개 도메인을 Kakao Maps와 Supabase의 허용 목록에 추가해야 합니다.

프로덕션 배포는 GitHub/Vercel 연동을 사용하며 저장소에서 `vercel --prod`를 직접 실행하지 않습니다.

## 라이선스

현재 별도의 라이선스가 명시되어 있지 않습니다. 재사용이나 배포가 필요하다면 저장소 소유자에게 먼저 확인해 주세요.
