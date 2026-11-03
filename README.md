# HOME:ET · 첫 집을 만나는 순간

서울 대학생의 첫 자취 판단 도우미. ① 자취 적합 검사 → ② 맞춤 월세 추천 → ③ 계약 D-day 가이드.

## 실행
```bash
npm install
cp .env.example .env.local   # 키는 선택. 없으면 대체 동작으로 실행
npm run dev                  # http://localhost:3000
npm test                     # 기획서 예시 표·D-day 규칙 검증
```

## Google 기술
| 기능 | 기술 | 파일 |
|---|---|---|
| 가치관 가중치 추출 | Gemini API (structured output) | `app/api/weights/route.ts` |
| 통학 시간·환승 | Google Maps Routes API (TRANSIT) | `app/api/commute/route.ts` |
| 본가 주소 자동완성 | Places API (New) | `app/page.tsx` |
| 지역 지도 | Maps JavaScript API | `app/rent/page.tsx` |
| D-day 일정 추가 | Google Calendar 템플릿 링크 | `lib/dday.ts` |
| 배포 | Firebase App Hosting | `apphosting.yaml` |

## 구조
- `lib/score.ts`: 자취지수와 월세 상한 산출식 (기획서 식 + 초기 비용 옵션)
- `lib/dday.ts`: 계약 D-day 규칙과 임대차 신고 판정
- `lib/state.tsx`: 화면 간 상태 (sessionStorage)
- `data/schools.json`: 고려대와 주변 4개 동 (시세는 **예시 데이터**)
- `data/terms.json`: 계약 용어 카드

## 배포
```bash
npm i -g firebase-tools && firebase login
firebase apphosting:secrets:set gemini-api-key     # 그 외 maps-server-key, maps-browser-key
firebase apphosting:backends:create                 # GitHub 저장소 연결 후 push하면 자동 배포
```
