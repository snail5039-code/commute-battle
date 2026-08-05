# 출퇴근전쟁봇 개발 가이드

## 1. 필수 설정

### Supabase 프로젝트 생성
1. [supabase.com](https://supabase.com)에서 로그인 / 회원가입
2. "New Project" → 프로젝트 이름 입력 (예: commute-battle)
3. 생성되면 URL과 API Key 복사

### 환경변수 설정
`.env.local` 파일에 다음 값들 입력:

```
NEXT_PUBLIC_SUPABASE_URL=YOUR_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
NEXT_PUBLIC_GEMINI_API_KEY=YOUR_GEMINI_KEY
```

**키 찾는 법:**
- Supabase: Settings → API
- Gemini: [Google AI Studio](https://aistudio.google.com)

---

## 2. Supabase 테이블 생성

Supabase Dashboard → SQL Editor에서 아래 스크립트 실행:

```sql
-- users 테이블
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  home_address TEXT,
  work_address TEXT,
  character_level INT DEFAULT 1,
  character_exp INT DEFAULT 0,
  character_stage TEXT DEFAULT 'alg',
  total_commute_starts INT DEFAULT 0,
  total_commute_arrivals INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- commute_records 테이블
CREATE TABLE commute_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('commute', 'early_leave', 'vacation', 'sick', 'absence')),
  commute_subtype TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration_minutes INT,
  is_on_time BOOLEAN DEFAULT FALSE,
  weather_condition TEXT,
  exp_gained INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date, type)
);

-- badges 테이블
CREATE TABLE badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  badge_name TEXT NOT NULL,
  progress_current INT DEFAULT 0,
  progress_total INT,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, badge_name)
);

-- 인덱스
CREATE INDEX idx_commute_records_user_date ON commute_records(user_id, date);
CREATE INDEX idx_badges_user ON badges(user_id);
```

---

## 3. 로컬 실행

```bash
cd commute-battle
npm install
npm run dev
```

http://localhost:3000 에서 접근

---

## 4. 주요 기능 체크리스트

### MVP (1차) — 완료
- [x] 주소 초기 설정 모달
- [x] 대시보드 (캐릭터, EXP, 달력)
- [x] 출근/퇴근 버튼 → Gemini 경로 안내
- [x] 도착 기록 (EXP 획득, 레벨업, 진화)
- [x] 조퇴/휴가 기록
- [x] 배지 페이지 (진행도 실시간 계산)
- [x] 통계 페이지 (월간 리포트)
- [x] 설정 페이지 (주소 수정, 로그아웃)
- [x] 기본 로그인 페이지 (Supabase Auth, 선택사항)
- [x] 사이드바 레이아웃

### Phase 2 (시간 있을 때)
- [ ] 정시 판정 로직 (현재는 항상 false — 최근 10회 평균 비교 필요)
- [ ] 배지 진행도를 badges 테이블에 실제로 저장 (현재는 매번 클라이언트에서 계산)
- [ ] 기록 수정/삭제 UI
- [ ] 캐릭터가 지도에서 움직이는 애니메이션

### Phase 3 (나중에)
- [ ] GPS 자동감지
- [ ] 실시간 지연 감지
- [ ] 캐릭터 선톡 (백그라운드 스케줄)
- [ ] 날씨 API 통합 (현재는 하드코딩된 맑음/0mm)

### ⚠️ 배포 전 확인 필요
- [ ] Supabase RLS(Row Level Security)가 3개 테이블 모두 비활성화 상태 — 지금은 익명 anon key로 아무나 모든 사용자 데이터를 읽고 쓸 수 있음. 로그인 기능을 실제로 쓰거나 배포하기 전에 RLS 정책을 추가해야 함

---

## 5. API 라우트

| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/api/user/init` | POST | 첫 사용자 설정 |
| `/api/commute/start` | POST | 출발 기록 |
| `/api/commute/arrive` | POST | 도착 기록 |

---

## 6. 주의사항

- 로컬 개발 중 localStorage에 userId 저장 (임시 방식)
- 실제 배포 시 Supabase Auth 추가 필요
- Gemini API는 요청 제한 있으니 무료 티어로 테스트

---

**다음: Supabase 테이블 생성 → 로컬 테스트**
