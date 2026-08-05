# Commute Battle TODO

## 완료

- [x] ODsay 대중교통 경로와 상세 노선 좌표 연결
- [x] TMAP 보행자 경로를 결합한 하이브리드 경로 API 구현
- [x] 도보 구간이 출발지·도착지 직선이 아닌 실제 도로를 따르도록 수정
- [x] 장거리 이동 시 출발지→역, 철도/버스, 역→도착지 구간 결합
- [x] 지도 우측에 예상 시간, 도보 거리, 교통비, 구간별 안내 패널 추가
- [x] 도보/대중교통 선택 탭 추가
- [x] 도보 선택 시 TMAP 전용 경로 사용
- [x] 대중교통 선택 시 ODsay + TMAP 경로 사용
- [x] 목적지 40m 이내 GPS가 3회 연속 확인되면 자동 도착 완료
- [x] 로컬 API 검증: 도보 236점·69분, 대중교통 91점·24분
- [x] Vercel Production 환경변수 `TMAP_APP_KEY`, `ODSAY_API_KEY` 설정 확인
- [x] 최신 변경 GitHub 푸시 (`8790e82`)

## 다음 확인

- [ ] Vercel에서 `8790e82` 자동 배포 성공 여부 확인
- [ ] 운영 화면에서 도보/대중교통 탭 전환 및 우측 안내 패널 확인
- [ ] 실제 모바일 GPS로 목적지 40m 자동 도착 동작 확인
- [ ] 장거리 철도 구간은 ODsay 제한으로 역 사이 직선 표시되는 점 검토

## 주요 파일

- `app/api/route/transit/route.ts`: ODsay + TMAP 경로 API
- `components/CommuteMapView.tsx`: 지도, 이동수단 선택, 경로 안내, 자동 도착

