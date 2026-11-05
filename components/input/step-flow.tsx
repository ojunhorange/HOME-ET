"use client";

import { useEffect, useState } from "react";
import { ActionBar, Button, Dialog, LinkButton, useIsDesktop } from "@/components/ui";
import { cx } from "@/components/ui/styles";
import { HeroEditor, QUESTIONS } from "./questions";
import { OpenReportsButton } from "@/components/reports/report-ui";
import { useReports } from "@/components/reports/reports-context";
import { MAX_REPORTS } from "@/lib/saved-reports";
import { AnswerRow, IntroFeatures, ProgressBar, SideIntro, allValid, type InputFlowProps } from "./shared";
import { Tutorial, tutorialUnseen } from "./tutorial";

const N = QUESTIONS.length;

/** 로그인하고 돌아와서 바로 질문을 시작하라는 표시 (?start=1) */
const START_PARAM = "start";

/** 한 화면에 한 질문. 먼저 시작 화면(서비스 소개 + 기존 리포트 보기 / 검사 시작)을 보여 줌 */
export function StepFlow({ state, update, onSubmit, loading, started, onStart: markStarted }: InputFlowProps) {
  // 이미 다 답하고 검사한 적이 있으면(새로고침·리포트에서 돌아옴) 저장된 답을 보여 주는 확인 화면부터
  const returning = state.analysis !== null && allValid(state);
  const reports = useReports();
  const [askLogin, setAskLogin] = useState(false); // 로그인 안 하고 검사 시작을 누르면: 로그인할지 묻기
  const [idx, setIdx] = useState(returning ? N : 0); // N = 확인 화면
  const [dir, setDir] = useState<1 | -1>(1);
  const [reached, setReached] = useState(returning ? N : 0);
  const [fromReview, setFromReview] = useState(false);
  const desktop = useIsDesktop();
  const [tutorial, setTutorial] = useState(false);

  // 처음 온 사람에게만 사용법 안내를 자동으로 (이어서 하는 사람, 로그인하고 바로 질문으로 돌아온 사람은 건너뜀)
  useEffect(() => {
    if (returning || started || new URL(window.location.href).searchParams.has(START_PARAM) || !tutorialUnseen()) return;
    const t = setTimeout(() => setTutorial(true), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 첫 화면에서 한 번만
  }, []);
  const openTutorial = () => setTutorial(true);


  const begin = () => {
    setAskLogin(false);
    markStarted();
    window.scrollTo({ top: 0 });
  };
  // 저장 기능이 켜져 있는데 로그인 전이면, 저장하려면 로그인이 필요하다고 먼저 알려 줌
  const onStart = () => (reports.enabled && !reports.signedIn ? setAskLogin(true) : begin());

  // '로그인 하기'로 로그인하고 돌아왔으면 시작 화면을 건너뛰고 바로 질문으로
  useEffect(() => {
    if (!reports.signedIn) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(START_PARAM)) return;
    url.searchParams.delete(START_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    markStarted();
  }, [reports.signedIn, markStarted]);

  const isReview = idx === N;
  const q = QUESTIONS[idx];
  const valid = isReview ? allValid(state) : q.valid(state);

  const goTo = (i: number, d: 1 | -1) => {
    setDir(d);
    setIdx(i);
    setReached((r) => Math.max(r, i));
    window.scrollTo({ top: 0 });
  };
  const next = () => {
    if (isReview) return onSubmit();
    if (!valid) return;
    if (fromReview) {
      setFromReview(false);
      goTo(N, 1);
    } else goTo(idx + 1, 1);
  };
  const prev = () => {
    if (fromReview) {
      setFromReview(false);
      return goTo(N, 1);
    }
    if (idx > 0) goTo(idx - 1, -1);
  };
  const edit = (i: number) => {
    setFromReview(isReview);
    goTo(i, -1);
  };

  const progress = (Math.min(idx, N) / N) * 100;
  const canPrev = idx > 0 || fromReview;
  const showList = reached === N && !isReview;

  return (
    <div
      className={cx(
        "flex flex-1 flex-col",
        started && "md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14",
      )}
    >
      {/* 데스크톱: 왼쪽에 소개 + 지금까지 답한 것 */}
      <aside className={cx("hidden", started && "md:block")}>
        <div className="sticky top-24">
          <SideIntro>
            <LinkButton onClick={openTutorial} className="mt-4">
              튜토리얼 보기
            </LinkButton>
          </SideIntro>
          {/* 답 목록은 확인 화면까지 한 번 간 뒤, 항목을 고치러 돌아왔을 때만 (처음 답하는 동안·확인 화면에선 숨김) */}
          {showList && (
            <ol className="mt-8 space-y-0.5 motion-safe:animate-rise" aria-label="질문 목록">
              {QUESTIONS.map((qq, i) => (
                <li key={qq.id}>
                  <AnswerRow size="sm" label={qq.label} value={qq.display(state)} current={i === idx} onClick={() => edit(i)} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>

      {/* 시작 화면. 모바일: 하단 고정 버튼 바, 데스크톱: 가운데 유리 카드 안에 버튼을 위아래로 */}
      {!started && (
        <div className="flex flex-1 flex-col px-5 pt-8 md:mx-auto md:w-full md:max-w-xl md:flex-none md:rounded-sheet md:border md:border-glass-border md:bg-glass md:p-10 md:shadow-glass md:backdrop-glass">
          <SideIntro>
            <div className="mt-6">
              <IntroFeatures />
            </div>
          </SideIntro>
          {/* 소개 맨 아래 (모바일: 하단 고정 바 바로 위, 데스크톱: 시작 버튼들 위) */}
          <Button variant="secondary" size="lg" block onClick={openTutorial} className="mt-6">
            튜토리얼 보기
          </Button>
          {/* 저장 기능이 켜져 있으면 '기존 리포트 보기'(위) + '검사 시작'(아래)을 전체 너비로 쌓음 */}
          <ActionBar desktopClassName="md:mt-6 md:flex-col md:border-0 md:bg-transparent md:p-0" stacked={reports.enabled}>
            <OpenReportsButton />
            {/* 로그인 상태 확인 중엔 잠깐 잠금 (로그인했는데 '로그인할까요' 모달이 뜨지 않게) */}
            <Button size="lg" block onClick={onStart} disabled={reports.authLoading}>
              자취 적합 검사 시작
            </Button>
          </ActionBar>
          <Dialog
            open={askLogin}
            onClose={() => setAskLogin(false)}
            title="로그인을 해야 리포트를 저장할 수 있어요"
            actions={
              <>
                <Button variant="secondary" size="lg" onClick={begin}>
                  그냥 하기
                </Button>
                <Button
                  size="lg"
                  disabled={reports.signingIn}
                  aria-busy={reports.signingIn}
                  onClick={() => reports.signIn(`${window.location.pathname}?${START_PARAM}=1`)}
                >
                  {reports.signingIn ? "이동 중…" : "로그인 하기"}
                </Button>
              </>
            }
          >
            Google로 로그인하면 결과를 {MAX_REPORTS}개까지 저장해 두고 나중에 다시 열어 볼 수 있어요. 로그인 없이도 검사는 할 수 있어요.
          </Dialog>
        </div>
      )}

      {/* 모바일: 배경 위에 바로 (고정 바만 유리), 데스크톱: 큰 유리 시트. 모바일엔 backdrop-filter를 주지 않음 → fixed 하단 바의 기준이 바뀌지 않게 */}
      <section
        className={cx(
          "flex flex-1 flex-col overflow-x-clip md:min-h-[600px] md:rounded-sheet md:border md:border-glass-border md:bg-glass md:shadow-glass md:backdrop-glass",
          !started && "hidden!", // 기본 flex보다 우선하도록 important
        )}
      >
        {/* 상단: 진행률 막대만. 확인 화면에서 항목을 고치러 온 땐 숨김 (막대가 뒤로 가 보여서 헷갈림) */}
        <div className="sticky top-[var(--header-h,0px)] z-10 flex h-12 items-center px-5 bg-glass-bar backdrop-glass md:bg-transparent md:backdrop-filter-none md:static md:h-auto md:rounded-t-sheet md:px-10 md:pt-8">
          <ProgressBar value={progress} className={cx("flex-1", fromReview && "invisible")} />
        </div>

        <div
          key={idx}
          className={cx(
            "flex-1 px-5 md:px-10 md:pt-8 md:pb-10",
            dir > 0 ? "motion-safe:animate-step-next" : "motion-safe:animate-step-prev",
          )}
        >
          {isReview ? (
            <>
              <div className="z-[5] -mx-5 px-5 pt-4 pb-6 bg-glass-bar backdrop-glass md:bg-transparent md:backdrop-filter-none max-md:sticky max-md:top-[calc(var(--header-h,0px)+3rem)] md:mx-0 md:px-0 md:pt-0 md:pb-0">
                <h1 className="text-[26px] font-bold leading-snug tracking-tight md:text-[30px]">이대로 검사할까요?</h1>
                <p className="mt-2 text-[15px] text-fg-sub">고칠 항목을 누르면 바로 바꿀 수 있어요.</p>
              </div>
              <ul className="-mx-5 divide-y divide-border border-y border-border bg-surface/40 md:mx-0 md:mt-6 md:overflow-hidden md:rounded-panel md:border">
                {QUESTIONS.map((qq, i) => (
                  <li key={qq.id}>
                    <AnswerRow label={qq.label} value={qq.display(state)} onClick={() => edit(i)} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              {/* 모바일: 질문 제목은 진행률 막대 아래에 고정, 답(목록·입력)만 스크롤 */}
              <div className="z-[5] -mx-5 px-5 pt-4 pb-6 bg-glass-bar backdrop-glass md:bg-transparent md:backdrop-filter-none max-md:sticky max-md:top-[calc(var(--header-h,0px)+3rem)] md:mx-0 md:px-0 md:pt-0 md:pb-0">
                <p className="text-sm font-semibold text-primary">{q.group}</p>
                <h1 className="mt-1.5 whitespace-pre-line text-[26px] font-bold leading-snug tracking-tight md:text-[30px]">{q.title}</h1>
                {q.sub && <p className="mt-2 text-[15px] leading-relaxed text-fg-sub">{q.sub}</p>}
              </div>
              <div className="pt-2 md:pt-8">
                <HeroEditor
                  q={q}
                  state={state}
                  update={update}
                  autoFocus={desktop} // 모바일은 자동 포커스 X: 화면마다 키보드가 올라오며 하단 바가 들썩임
                  shortcuts={desktop}
                  // 고르는 질문은 골라도 바로 넘어가지 않음 (잘못 눌렀을 때 되돌아오지 않게) → '다음'으로 넘어감
                  onDone={q.kind === "choice" ? undefined : next}
                />
              </div>
            </>
          )}
        </div>

        <ActionBar keyboardAware desktopClassName="md:items-center md:justify-between md:rounded-b-sheet md:border-primary/8 md:bg-transparent md:px-10 md:py-5">
          {/* 모바일: 왼쪽에 좁게 (첫 질문에선 숨겨서 '다음'이 꽉 차게) */}
          <Button
            variant={desktop ? "ghost" : "secondary"}
            size="lg"
            onClick={prev}
            disabled={!canPrev}
            className={cx("max-md:w-24 max-md:flex-none!", !canPrev && "max-md:hidden")}
          >
            이전
          </Button>
          <Button size="lg" onClick={next} disabled={!valid || loading} className="max-md:flex-1 md:min-w-40">
            {isReview ? (loading ? "가치관 분석 중…" : "자취 적합 검사 시작") : fromReview ? "확인" : "다음"}
          </Button>
        </ActionBar>
      </section>
      <Tutorial open={tutorial} onClose={() => setTutorial(false)} />
    </div>
  );
}
