"use client";

import { useCallback, useEffect, useState } from "react";
import { cx } from "@/components/ui/styles";
import { INITIAL, STORAGE_KEY, goalText, loadState, saveState, type AppState, type StepNo } from "@/lib/app-state";
import { NEUTRAL, sanitizeAdjust } from "@/lib/calc";
import { findSchool } from "@/lib/data";
import { addDays, startOfDay, toInput } from "@/lib/dday";
import type { WeightAnalysis } from "@/lib/weights";
import { StepFlow } from "./input/step-flow";
import { useAuth } from "./providers";
import { MyReportsDialog } from "./reports/report-ui";
import { ReportsProvider, clearSavedRef } from "./reports/reports-context";
import { AnalyzingScreen } from "./screens/analyzing-screen";
import { DdayScreen } from "./screens/dday-screen";
import { RentScreen } from "./screens/rent-screen";
import { ReportScreen } from "./screens/report-screen";
import { Footer, Header } from "./shell/header";
import { Assistant } from "./assistant/assistant";

/** 분석 중 화면을 최소한 보여 주는 시간 */
const MIN_ANALYZING_MS = 1200;

/** 상태·흐름만 담당. 화면 모양은 input/·screens/, 부품은 ui/ 에 있어요. */
export function HomeEtApp() {
  const [state, setState] = useState<AppState>(INITIAL);
  const [today, setToday] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false); // 시작 화면(소개)을 지났는지
  const [runId, setRunId] = useState(0); // 검사(가치관 분석)를 새로 할 때마다 +1
  const markStarted = useCallback(() => setStarted(true), []);
  const auth = useAuth();
  const name = auth.status === "authenticated" ? auth.name : null;

  // 마운트 후 저장된 상태 복원 + 날짜 기본값 (서버 렌더와 어긋나지 않게 클라이언트에서만)
  useEffect(() => {
    const now = startOfDay(new Date());
    const params = new URLSearchParams(window.location.search);
    // 로그아웃하고 돌아옴: 이 기기에 남은 입력(본가 주소·목표 글 등)과 저장 리포트 연결을 비우고 시작 화면으로
    // (공용 기기에서 다음 사람에게 이전 결과가 보이지 않게)
    const loggedOut = params.has("logout");
    if (loggedOut) {
      clearSavedRef();
      params.delete("logout");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    }
    const saved = loggedOut ? INITIAL : (loadState(STORAGE_KEY) ?? INITIAL);
    const contract = saved.contract || toInput(addDays(now, 5));
    const balance = saved.balance || toInput(addDays(now, 41));
    // 시작 화면에서 로그인하고 돌아온 경우(?reports=1 목록 열기, ?start=1 검사 시작)엔
    // 마지막으로 보던 단계(리포트 등)를 복원하지 않고 시작 화면에서 이어 감
    const fromLanding = params.has("reports") || params.has("start");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 전용 값(sessionStorage, 오늘 날짜)으로 초기화
    setToday(now);
    setState({ ...saved, contract, balance, ...(fromLanding && { step: 1 as const }) });
  }, []);

  useEffect(() => {
    if (today) saveState(state);
  }, [state, today]);

  const update = useCallback(
    (patch: Partial<AppState>) =>
      setState((s) => {
        const next = { ...s, ...patch };
        // 단계를 옮기면 지금까지 가 본 가장 먼 단계를 기억 → 상단 메뉴로 그 단계까지 오갈 수 있음
        if (patch.step) next.maxStep = Math.max(s.maxStep, patch.step) as StepNo;
        // 대학생활 목표가 바뀌면 예전 가치관 분석은 무효 → 다시 검사해야 리포트가 열림
        // (안 그러면 상단 메뉴로 리포트에 갔을 때 바꾸기 전 분석이 그대로 보임)
        if (s.analysis && goalText(next) !== goalText(s)) {
          next.analysis = null;
          next.maxStep = 1;
        }
        return next;
      }),
    [],
  );
  const go = (step: StepNo) => {
    update({ step });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const analyze = async () => {
    setLoading(true);
    setRunId((n) => n + 1);
    window.scrollTo({ top: 0 });
    const t0 = Date.now();
    try {
      const res = await fetch("/api/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goalText(state) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const analysis = (await res.json()) as WeightAnalysis;
      // 새로 검사하면 맞춤 월세 추천은 학교에서 가장 가까운 동부터 보여 줌 (예전에 고른 동은 초기화)
      const nearest = findSchool(state.schoolId).regions[0];
      update({ analysis, adj: sanitizeAdjust(analysis), decision: null, regionId: nearest.id, leaseRent: nearest.rentMedian });
    } catch {
      update({
        analysis: { ...NEUTRAL, reason: "분석 서버에 연결하지 못해 모두 보통(0)으로 두었어요.", source: "default" },
        adj: NEUTRAL,
      });
    } finally {
      // 분석이 금방 끝나도 분석 중 화면이 깜빡이고 사라지지 않게 잠깐은 보여 줌
      const rest = MIN_ANALYZING_MS - (Date.now() - t0);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      setLoading(false);
      go(2);
    }
  };

  // 저장된 리포트 열기: 그 입력으로 통째로 바꾸고 리포트 화면으로
  const loadReport = useCallback((s: AppState) => {
    setState(s);
    window.scrollTo({ top: 0 });
  }, []);

  const ready = state.analysis !== null;
  // 모바일 입력 화면: 로고 헤더만 두고 푸터 없이 꽉 찬 화면 (한 화면 한 질문)
  const onInput = state.step === 1 && !loading;
  const analyzing = state.step === 1 && loading;

  return (
    <ReportsProvider state={state} ready={today !== null} onLoad={loadReport} runId={runId}>
      {/* 상단 메뉴로는 한 번 가 본 단계까지만. 처음 가는 단계는 각 화면의 버튼(검사 시작 → 그래도 자취하기 → 계약 일정 등록)으로만 */}
      <Header
        step={state.step}
        canVisit={(no) => no <= state.maxStep && (no === 1 || ready)}
        onNavigate={go}
        onHome={() => {
          // 로고: 입력은 그대로 두고 시작 화면(소개 + 기존 리포트 보기 / 검사 시작)으로
          setStarted(false);
          go(1);
        }}
        minimalMobile={onInput}
        hideSteps={onInput && !started}
      />
      <main
        className={cx(
          "mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:py-12",
          // 남은 높이를 질문 화면에 넘겨서 화면 높이를 넘지 않게
          onInput && "max-md:flex max-md:flex-col max-md:p-0",
          // 계약 D-day는 데스크톱에서 스크롤 없이 한 화면에 들어가게 위아래 여백을 줄임
          state.step === 4 && "lg:pt-6 lg:pb-3",
        )}
      >
        {analyzing && <AnalyzingScreen state={state} name={name} />}
        {onInput && (
          <StepFlow
            // 저장값을 복원한 뒤 한 번 다시 만들어서, 복원된 답 기준으로 진행 상태(확인 화면부터 등)를 잡게 함
            key={today ? "restored" : "initial"}
            state={state}
            update={update}
            onSubmit={analyze}
            loading={loading}
            started={started}
            onStart={markStarted}
          />
        )}
        {state.step === 2 && ready && (
          <ReportScreen
            state={state}
            update={update}
            name={name}
            onStay={() => update({ decision: "stay" })}
            onGo={() => {
              update({ decision: null });
              go(3);
            }}
          />
        )}
        {state.step === 3 && ready && <RentScreen state={state} update={update} name={name} onBack={() => go(2)} onNext={() => go(4)} />}
        {state.step === 4 && ready && today && <DdayScreen state={state} update={update} today={today} onBack={() => go(3)} />}
      </main>
      {/* 계약 D-day는 데스크톱에서 한 화면에 들어가게 푸터 아래 여백을 줄임 */}
      <Footer className={cx(onInput && "max-md:hidden", state.step === 4 && "lg:pb-4")} />
      <MyReportsDialog />
      {/* 오른쪽 아래 도우미 (등본 확인·특약 물어보기). 입력·분석 중 화면에서는 숨김 */}
      {ready && state.step >= 2 && <Assistant deposit={state.leaseDeposit} />}
    </ReportsProvider>
  );
}
