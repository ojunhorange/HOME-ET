"use client";

import type { ReactNode } from "react";
import { goalText, type AppState } from "@/lib/app-state";
import { hm, won } from "@/lib/calc";
import { cx } from "@/components/ui/styles";

/**
 * 검사 시작 후 가치관 분석이 끝날 때까지 보여 주는 화면.
 * 1 경로 계산(입력값이라 바로 완료) → 2 생활 목표 분석(진행 중) → 3 자취지수 계산(대기)
 */
export function AnalyzingScreen({ state, name }: { state: AppState; name: string | null }) {
  const c = state.commute;
  const goal = goalText(state);
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-1 py-6 md:py-14" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner size={48} />
        <h1 className="text-[26px] font-bold leading-snug tracking-tight md:text-[32px]">
          {name ? `${name} 님의 통학을 계산하고 있어요` : "통학을 계산하고 있어요"}
        </h1>
      </div>

      <section aria-label="분석 단계" className="flex flex-col gap-3 rounded-sheet border border-glass-border bg-glass p-4 shadow-glass backdrop-glass md:p-7">
        <StageRow state="done" no={1} title="경로 계산">
          <div className="flex flex-wrap gap-2">
            {[`왕복 ${hm(2 * c.oneWayMin)}`, c.transfers === 0 ? "환승 없음" : `환승 ${c.transfers}회`, `왕복 교통비 ${won(c.roundTripFare)}`].map((t) => (
              <span key={t} className="rounded-full bg-surface-strong px-3 py-1.5 text-[13px]">
                {t}
              </span>
            ))}
          </div>
        </StageRow>

        <StageRow state="active" no={2} title="생활 목표 분석">
          <div className="h-2 overflow-hidden rounded-full bg-track">
            <div className="h-full w-[55%] rounded-full bg-accent-fill motion-safe:animate-flow" />
          </div>
          {goal && (
            <p className="rounded-panel border border-glass-border bg-surface-subtle px-4 py-3.5 text-sm leading-relaxed text-fg-sub">“{goal}”</p>
          )}
        </StageRow>

        <StageRow state="wait" no={3} title="자취지수 계산" />
      </section>
    </div>
  );
}

const STATUS = { done: "완료", active: "분석 중", wait: "대기" } as const;

function StageRow({ state, no, title, children }: { state: keyof typeof STATUS; no: number; title: string; children?: ReactNode }) {
  return (
    <div
      className={cx(
        "flex items-start gap-4 rounded-[18px] p-4 md:p-[18px]",
        state === "done" && "border border-glass-border bg-surface-subtle",
        state === "active" && "border border-accent-fill/40 bg-surface/85 shadow-[0_8px_22px_rgb(232_137_77/0.12)]",
        state === "wait" && "opacity-75",
      )}
    >
      <span
        className={cx(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold",
          state === "done" && "bg-primary text-on-primary",
          state === "active" && "bg-accent-soft text-accent",
          state === "wait" && "border-2 border-dashed border-primary/25 text-fg-sub",
        )}
      >
        {state === "done" ? <Check /> : state === "active" ? <Spinner size={18} /> : no}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <b className="text-base">{title}</b>
          <span className={cx("text-[13px]", state === "active" ? "font-bold text-accent" : "text-fg-sub")}>{STATUS[state]}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Spinner({ size }: { size: number }) {
  const big = size > 24;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden className="motion-safe:animate-spin">
      {big && <circle cx="24" cy="24" r="20" stroke="currentColor" strokeOpacity="0.12" strokeWidth="5" className="text-primary" />}
      <path d="M24 4a20 20 0 0 1 20 20" stroke="currentColor" strokeWidth={big ? 5 : 7} strokeLinecap="round" className={big ? "text-accent-strong" : "text-accent"} />
    </svg>
  );
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
