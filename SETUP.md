# 출퇴근전쟁봇 개발 현황 & TODO

> 마지막 작업일: 2026-08-06. 다음 세션 시작할 때 이 파일부터 읽기.

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

## 🔲 지금 당장 이어서 할 일 (이번 세션에서 못 끝낸 것)

### 1. 병가(sick) 버튼이 없음 — 사용자가 우선순위 낮춤, 보류
- DB 스키마(`commute_records.type`)는 `'sick'`을 이미 지원하지만, `components/CommuteButton.tsx`의 `recordSimpleEvent` 타입 유니언과 UI 버튼 둘 다 `'early_leave' | 'vacation'`만 있고 병가가 없음
- 사용자가 "병가는 우선 빼자"고 명시적으로 보류 지시함 (2026-08-06) — 나중에 다시 요청하면 조퇴/휴가 옆에 병가 버튼 추가하고 3열 그리드로 조정 (`grid-cols-2` → `grid-cols-3`)

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

### 테이블: users / commute_records / badges
스키마는 `schema.sql` 참고 (단, 실제 DB는 `username`/`nickname` 컬럼이 추가돼 있어 파일보다 약간 앞서 있음 — 확실한 건 Supabase에서 직접 확인). `commute_records.type`은 `'commute' | 'return' | 'early_leave' | 'vacation' | 'sick' | 'absence'`.

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

---

## ⚠️ 제출 전 반드시 확인 (마감 8/9 일요일 23:59 — 3일 남음)
- [ ] **Supabase RLS가 3개 테이블 모두 비활성화 상태.** 데모용이면 괜찮지만 신경 쓰인다면 RLS 정책 추가
- [ ] 배지 진행도가 `badges` 테이블에 실제로 저장 안 되고 매번 클라이언트에서 재계산됨 (기능은 정상 동작하니 급하지 않음)
- [ ] 날씨 API 실제 연동 필요 여부 확인 (지금은 일부 하드코딩값 사용)
- [ ] 다른 기기/시크릿 창에서 전체 플로우 한 번 더 테스트
- [ ] 미니프로젝트 제출 문서(`미니프로젝트3_출퇴근전쟁봇.md`) 최신 기능 반영해서 갱신
- [ ] 스크린샷 2장 이상 (AI 기능 동작 장면 필수) 준비

---

## 작업 규칙 (기억할 것)
- 커밋 메시지는 영어, 본문에 왜(root cause) 위주로 서술
- **GitHub push까지만** 하고 Vercel은 자동배포에 맡길 것 (수동 `vercel --prod` 금지, 사용자 지시)
- 코드 수정 후 `npx tsc --noEmit` + `npm run lint` + `npm run build` 세 개 다 통과 확인하고 커밋
- push 후 `vercel ls`로 새 배포가 Ready 될 때까지 기다렸다가 실제 배포 사이트에서 동작 확인 (로컬 dev 서버는 브라우저 세션 캐시 문제로 헷갈릴 때가 많았음)
- 브라우저 자동화 도구가 이 환경에서 가끔 "pane not displayed, not compositing frames" 상태가 됨 → 스크린샷/ResizeObserver가 안 먹힐 수 있으니 `getBoundingClientRect` 같은 레이아웃 기반 값으로 대체 확인
- OneDrive 폴더라 `.next` 빌드 캐시가 파일 잠금(EPERM)을 일으킬 수 있음 → 안되면 보고하고, 명시적 허락 없이 캐시 삭제하지 말 것
