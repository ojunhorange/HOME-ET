"use client";

import type { ReactNode } from "react";
import type { AppState } from "@/lib/app-state";
import { cx, focusRing } from "@/components/ui/styles";
import { Eyebrow } from "@/components/ui";
import { QUESTIONS } from "./questions";

export interface InputFlowProps {
  state: AppState;
  update: (patch: Partial<AppState>) => void;
  onSubmit: () => void;
  loading: boolean;
  /** 시작 화면(소개)을 지났는지. 헤더 단계 표시도 이걸로 숨김 → 상위(HomeEtApp)가 가짐 */
  started: boolean;
  onStart: () => void;
}

export const allValid = (s: AppState) => QUESTIONS.every((q) => q.valid(s));

/** 데스크톱 왼쪽 소개 (모바일에선 숨김) */
export function SideIntro({ children }: { children?: ReactNode }) {
  return (
    <div>
      <Eyebrow>서울 대학생을 위한 첫 자취 판단 도우미</Eyebrow>
      <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
        첫 자취,
        <br />
        해도 될까?
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
        통학으로 잃는 시간과 체력을 돈으로 바꿔서, 자취가 나에게 얼마나 이득인지 보여 드릴게요.
      </p>
      {children}
    </div>
  );
}

const FEATURES = [
  { title: "자취 적합 리포트", sub: "통학 시간과 체력을 돈으로 바꿔 자취지수를 계산해요." },
  { title: "맞춤 월세 상한", sub: "내 가치관에서 손해 보지 않는 월세를 알려 드려요." },
  { title: "계약 D-day", sub: "계약금부터 확정일자까지 할 일을 날짜별로 챙겨요." },
];

/** 이렇게 알려 드려요: 결과 화면 3개 미리보기 (모바일 시작 화면) */
export function IntroFeatures() {
  return (
    <ol className="space-y-3" aria-label="검사하면 알 수 있는 것">
      {FEATURES.map((f, i) => (
        <li key={f.title} className="flex gap-3.5 rounded-panel bg-surface-muted p-4">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-bold text-primary">{i + 1}</span>
          <span>
            <span className="block text-[15px] font-bold">{f.title}</span>
            <span className="mt-0.5 block text-sm leading-relaxed text-fg-sub">{f.sub}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 답한 항목 목록 한 줄 (누르면 그 질문으로) */
export function AnswerRow({
  label, value, onClick, current, disabled, size = "md",
}: { label: string; value: string; onClick?: () => void; current?: boolean; disabled?: boolean; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={current ? "step" : undefined}
      className={cx(
        "group flex w-full items-center gap-3 text-left transition disabled:cursor-default",
        size === "md" ? "min-h-14 px-5 py-3" : "min-h-11 rounded-control px-3 py-2",
        current ? "bg-primary-soft" : "enabled:hover:bg-surface-muted",
        focusRing,
      )}
    >
      <span className={cx("shrink-0", size === "md" ? "w-28 text-[15px]" : "w-24 text-[13px]", current ? "font-semibold text-primary" : "text-fg-sub")}>
        {label}
      </span>
      <span className={cx("min-w-0 flex-1 truncate text-right font-semibold", size === "md" ? "text-[15px]" : "text-[13px]", disabled && "text-fg-muted")}>
        {value}
      </span>
      {!disabled && <Chevron />}
    </button>
  );
}

export function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-fg-muted">
      <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1 overflow-hidden rounded-full bg-track", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${value}%` }} />
    </div>
  );
}
