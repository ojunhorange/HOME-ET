# HOME:ET

서울에서 처음 자취를 고민하는 대학생에게 통학 대비 자취의 실제 가치를 수치로 보여 주고, 적정 월세와 계약 D-day까지 안내하는 서비스입니다.

> **GDGoC DevFest 2026 · Tell the Vision 해커톤 Team 3 「로컬에선 됐는데」의 결과물입니다.**
>
> - 행사: [GDG DevFest 2026 — Tell the Vision](https://gdgoc-devfest-2026.vercel.app/#overview)
> - 주최: GDG on Campus KOREA · YONSEI · SKKU · KAIST 연합
> - Demo Market: 2026년 11월 6일(금), Google for Startups Campus
> - 주제: 첫 자취를 위한 정보 제공 플랫폼 (경제 / 교통 / 주거)
> - 서비스: https://home-et-temp.vercel.app

## 팀 「로컬에선 됐는데」

| 이름 | 학교 | 학과 | GitHub |
| --- | --- | --- | --- |
| 안채연 | KAIST | 전산학부 | [ChaeyeonAhn](https://github.com/ChaeyeonAhn) |
| 오준호 | 고려대학교 | 컴퓨터학과 | [ojunhorange](https://github.com/ojunhorange) |
| 이가영 | 고려대학교 | 컴퓨터학과 | |
| 안호성 | 성균관대학교 | 지능형소프트웨어학과 | |
| 오진우 | 고려대학교 | 스마트보안학부 | |
| 유선우 | 연세대학교 | 경제학과 | |

## 흐름

1. **정보 입력**: 한 화면에 한 질문씩 학교, 본가, 통학 정보, 등교일, 대학생활 목표(칩 + 추가 설명)를 받습니다. 1시간의 기준 시급은 2026 최저임금으로 고정하고, 개인차는 가치관 조정값이 반영합니다. 모바일은 서비스 소개 시작 화면부터 보여 줍니다.
2. **자취 적합 리포트**: Gemini가 few-shot 예시를 보고 생활 목표에서 돈·시간·체력 조정값(0 = 보통, −3 ~ +3)을 뽑고, 선형 자취지수(0~100, 50 = 손익분기)를 계산합니다. 0이 가운데인 슬라이더로 항목마다 따로 바꾸면 바로 재계산되고, 점수가 항목별로 몇 점씩 더하고 빼는지 보여 줍니다.
3. **맞춤 월세 추천**: 자취지수가 50이 되는 월세를 역산해 지역 시세와 비교합니다. 중개보수(법정 상한)를 초기 비용에 넣고, 보증금을 바꾸면 상한이 얼마나 움직이는지도 보여 줍니다.
4. **계약 D-day**: 계약일·잔금일을 기준으로 단계별 할 일과 용어 카드를 보여 주고, 버튼 하나로 로그인한 사람의 Google 캘린더에 단계별 일정을 넣습니다(캘린더 권한은 이 버튼을 누를 때만 요청). 다시 등록하면 기존 일정을 고치고, 로그인을 끈 환경이나 Apple 캘린더용으로 .ics 파일도 받을 수 있습니다.

처음 들어오면 4장짜리 사용법 안내(랜딩 튜토리얼)가 뜨고, 시작 화면의 「사용법 보기」로 다시 열 수 있습니다.

5. **리포트 저장**: Google 로그인 후 리포트를 3개까지 저장하고, '내 리포트'에서 불러와 이어서 고치거나(덮어쓰기·새로 저장) 지울 수 있습니다. 본가 주소와 목표 글도 함께 저장됩니다.

## 개발

```bash
cp .env.example .env.local   # 키는 선택 사항
npm install
npm run dev
```

| 환경 변수 | 용도 | 없으면 |
| --- | --- | --- |
| `GEMINI_API_KEY` | 가치관 조정값 추출 (`/api/weights`, few-shot) | 키워드 기반 대체 분석 |
| `GEMINI_FILE_SEARCH_STORE`, `GEMINI_FILE_SEARCH_API_KEY` | 법령 질문 File Search (`/api/ask`). 저장소는 만든 키의 프로젝트에 묶여서 그 키를 따로 넣음 (없으면 `GEMINI_API_KEY`) | BM25 + Gemini로 대체 |
| `GEMINI_MODEL` | 모델 교체 (기본 `gemini-3.8-flash`) | 기본값 |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google 로그인 (Auth.js) | 로그인 버튼 숨김 |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | 리포트 저장 (Firestore, 서버 전용 서비스 계정). 로그인 env와 함께 있어야 켜짐 | 저장 기능 숨김 |

메인 페이지는 빌드 때 미리 렌더링되므로 **env를 바꾸면 재배포**해야 로그인·저장 버튼이 반영됩니다. Firestore 보안 규칙은 `allow read, write: if false;` (서버 API만 접근).

Google OAuth 리디렉션 URI: `http://localhost:3000/api/auth/callback/google`, `https://<배포 도메인>/api/auth/callback/google`

**Google 캘린더 등록**을 쓰려면 같은 Cloud 프로젝트에서
1. **Google Calendar API**를 사용 설정하고
2. OAuth 동의 화면(데이터 액세스)에 `https://www.googleapis.com/auth/calendar.events` 범위를 추가해요.
   민감한 범위라서 앱 인증 전에는 **테스트 사용자**로 등록한 계정만 허용할 수 있어요(최대 100명).

토큰은 암호화된 세션 쿠키 안에만 두고 브라우저로 보내지 않아요. `/api/calendar`가 서버에서 꺼내 기본 캘린더에 종일 일정으로 넣어요.

## 구조

```
app/globals.css          디자인 토큰 (색·라운드·글꼴)
components/
  ui/                    UI 부품 (Button, Card, Field, Stepper, Badge, Meter, ActionBar, Dialog …)
    styles.ts            부품별 variant 클래스 모음
  input/                 ① 정보 입력: 질문 정의(questions), 한 화면 한 질문 흐름(step-flow)
  screens/               ②~④ 리포트·월세·D-day 화면 (부품 + 레이아웃만 사용)
  shell/header.tsx       로고, 단계 내비, 로그인 버튼, 푸터
  home-et-app.tsx        상태·화면 전환
lib/
  view-models.ts         화면에 보여줄 숫자·문구
  calc.ts                선형 자취지수·월세 상한·중개보수 산출식과 가정값 (명세: docs/metrics.md)
  data.ts                데모 학교·동별 시세 (예시 데이터)
  dday.ts                계약 D-day 규칙, 용어 카드, 캘린더 내보내기
  weights.ts             few-shot 예시, 키워드 대체 분석
  app-state.ts           앱 상태 타입, 기본값, localStorage 저장, 저장값 이전(migrateState)
  saved-reports.ts       저장 리포트 타입·요약·지문 (공용)
  reports-repo.ts        Firestore users/{uid}/reports 읽기·쓰기 (서버)
app/api/weights          Gemini few-shot 가치관 분석
app/api/calendar         계약 D-day를 Google 캘린더에 등록 (단계마다 고정 ID → 다시 누르면 수정)
app/api/reports          리포트 목록·저장·불러오기·덮어쓰기·삭제 (로그인 필요, 3개 제한)
components/reports/      저장 카드, 내 리포트 Dialog, 상태 컨텍스트
```

## 디자인 바꾸기

바꾸려는 범위에 따라 고칠 곳이 달라요. 아래로 갈수록 범위가 넓어요.

1. **색·라운드·글꼴**: `app/globals.css`의 `@theme` 토큰만 고치면 돼요. 컴포넌트에는 hex 값이 없고 `bg-primary`, `text-fg-muted`, `rounded-card` 같은 토큰 이름만 써요.
2. **부품 모양** (버튼 크기, 카드 테두리, 배지 스타일 등): `components/ui/styles.ts`의 variant 맵을 고쳐요.
3. **부품 구조** (예: 슬라이더를 다른 라이브러리로 교체): `components/ui/*`에서 같은 props를 유지한 채 구현만 바꾸면 화면은 그대로예요.
4. **화면 레이아웃 전면 개편**: `components/screens/*`(입력은 `components/input/*`)의 JSX만 다시 쓰면 돼요. 숫자와 문구는 `lib/view-models.ts`가 계산하니까 계산 로직은 손댈 필요가 없어요.
