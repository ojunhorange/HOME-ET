"use client";

import { useEffect, useRef } from "react";
import type { StepNo } from "@/lib/app-state";
import { useAuth } from "@/components/providers";
import { cx, focusRing, glassBar } from "@/components/ui/styles";

export const STEPS: { no: StepNo; label: string }[] = [
  { no: 1, label: "정보 입력" },
  { no: 2, label: "자취 적합 리포트" },
  { no: 3, label: "맞춤 월세 추천" },
  { no: 4, label: "계약 D-day" },
];

/**
 * minimalMobile: 모바일에서 로고(+로그인)만. 질문 화면처럼 자체 진행률이 있을 때 단계 표시가 겹치지 않게
 * hideSteps: 데스크톱 단계 알약 숨김 (시작 화면). 자리는 남겨서 오른쪽 버튼 위치가 그대로
 */
export function Header({
  step, canVisit, onNavigate, onHome, minimalMobile, hideSteps, className,
}: {
  step: StepNo;
  canVisit: (no: StepNo) => boolean;
  onNavigate: (no: StepNo) => void;
  /** 로고: 시작 화면(랜딩)으로 */
  onHome: () => void;
  minimalMobile?: boolean;
  hideSteps?: boolean;
  className?: string;
}) {
  const current = STEPS.find((s) => s.no === step)!;
  const ref = useRef<HTMLElement>(null);

  // 헤더 높이를 --header-h로 공유 (헤더 바로 아래에 붙는 스티키 요소용)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--header-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--header-h");
    };
  }, []);

  return (
    <header ref={ref} className={cx("sticky top-0 z-20 border-b border-glass-border shadow-[0_8px_30px_rgb(20_30_55/0.06)]", glassBar, className)}>
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <button type="button" onClick={onHome} className={cx("shrink-0 rounded-md", focusRing)} aria-label="HOME:ET 처음 화면으로">
          <Logo />
        </button>

        {/* 데스크톱: 단계 알약 */}
        <nav className={cx("hidden min-w-0 flex-1 justify-end gap-1 md:flex", hideSteps && "invisible")} aria-label="단계" aria-hidden={hideSteps || undefined}>
          {STEPS.map(({ no, label }) => (
            <button
              key={no}
              type="button"
              disabled={!canVisit(no)}
              onClick={() => onNavigate(no)}
              aria-current={step === no ? "step" : undefined}
              className={cx(
                "shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40",
                focusRing,
                step === no ? "bg-primary font-bold text-on-primary" : "text-fg-sub hover:bg-surface-muted",
              )}
            >
              {no} {label}
            </button>
          ))}
        </nav>

        {/* 모바일: 지금 단계 이름 */}
        <p className={cx("min-w-0 flex-1 truncate text-right text-[13px] font-semibold text-fg-sub md:hidden", minimalMobile && "invisible")} aria-live="polite">
          <span className="tabular-nums text-primary">{step}/4</span> {current.label}
        </p>
        <AuthButton />
      </div>

      {/* 모바일: 4칸 진행 막대 (누르면 이동) */}
      <nav className={cx("mx-auto flex max-w-6xl gap-1.5 px-4 pb-1 md:hidden", minimalMobile && "hidden")} aria-label="단계">
        {STEPS.map(({ no, label }) => (
          <button
            key={no}
            type="button"
            disabled={!canVisit(no)}
            onClick={() => onNavigate(no)}
            aria-label={`${no}단계 ${label}`}
            aria-current={step === no ? "step" : undefined}
            className={cx("group flex-1 py-2 disabled:cursor-not-allowed", focusRing)}
          >
            <span className={cx("block h-1 rounded-full transition", no <= step ? "bg-primary" : "bg-track", no > step && "group-enabled:bg-primary/25")} />
          </button>
        ))}
      </nav>
    </header>
  );
}

export function Logo() {
  return (
    <span className="font-display text-xl font-semibold tracking-[0.03em] text-primary">
      HOME<span className="text-accent-strong">:</span>ET
    </span>
  );
}

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cx("mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-fg-muted sm:px-6", className)}>
      HOME:ET · 팀 로컬에선 됐는데 · 월세 시세는 국토부 실거래가, 관리비는 가정값이며 산출식은 팀 확정 전 초안이에요. ·{" "}
      <a href="/privacy" className="underline-offset-2 hover:underline">
        개인정보처리방침
      </a>
    </footer>
  );
}

function AuthButton() {
  const auth = useAuth();
  if (!auth.enabled) return null;
  if (auth.status === "loading") return <span className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-surface-muted" aria-hidden />;
  if (auth.status === "authenticated") {
    return (
      <div className="flex shrink-0 items-center gap-2">
        {auth.image && (
          // eslint-disable-next-line @next/next/no-img-element -- Google 프로필 이미지 (외부 도메인)
          <img src={auth.image} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
        )}
        <span className="hidden text-sm font-semibold md:inline">{auth.name}</span>
        <button type="button" onClick={auth.signOut} className={cx("rounded-full px-3 py-2 text-[13px] text-fg-sub hover:bg-surface-muted", focusRing)}>
          로그아웃
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => auth.signIn()}
      disabled={auth.signingIn}
      aria-busy={auth.signingIn}
      className={cx(
        "flex shrink-0 items-center gap-2 rounded-full border border-primary/14 bg-surface/65 px-3.5 py-2 text-[13px] font-semibold hover:bg-surface disabled:opacity-60",
        focusRing,
      )}
    >
      <GoogleMark />
      <span className="hidden sm:inline">Google로 로그인</span>
      <span className="sm:hidden">로그인</span>
    </button>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
