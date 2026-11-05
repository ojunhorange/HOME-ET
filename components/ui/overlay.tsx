"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx, focusRing, glassBar } from "./styles";

// ── 브라우저 상태 훅 ─────────────────────────────

/** 미디어 쿼리 구독. 서버 렌더에선 false(모바일)로 시작 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 768px)");

/**
 * 화면 키보드가 가린 높이(px). iOS Safari는 키보드가 떠도 레이아웃 뷰포트가 그대로라
 * 하단 고정 버튼이 키보드 뒤로 숨는다 → visualViewport로 가린 만큼 올려 준다.
 * (Android Chrome은 layout의 interactive-widget=resizes-content 덕에 0)
 */
export function useKeyboardInset() {
  return useSyncExternalStore(
    (cb) => {
      const vv = window.visualViewport;
      if (!vv) return () => {};
      vv.addEventListener("resize", cb);
      vv.addEventListener("scroll", cb);
      return () => {
        vv.removeEventListener("resize", cb);
        vv.removeEventListener("scroll", cb);
      };
    },
    () => {
      const vv = window.visualViewport;
      if (!vv) return 0;
      const hidden = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      return hidden > 80 ? hidden : 0; // 주소창 접힘 같은 작은 변화는 무시
    },
    () => 0,
  );
}

// ── 하단 고정 버튼 바 ─────────────────────────────

/**
 * 모바일: 화면 아래에 붙는 버튼 바 (키보드가 뜨면 키보드 위로, 그땐 버튼이 가장자리까지 꽉 참)
 * 데스크톱(md+): 일반 흐름 속 오른쪽 정렬 버튼 줄. desktopClassName으로 바꿀 수 있음
 */
export function ActionBar({
  children, desktopClassName = "md:justify-end md:border-0 md:bg-transparent md:p-0", keyboardAware, stacked,
}: {
  children: ReactNode;
  desktopClassName?: string;
  keyboardAware?: boolean;
  /** 모바일에서 버튼을 위아래로 쌓기 (버튼 2개, 각각 전체 너비) */
  stacked?: boolean;
}) {
  const inset = useKeyboardInset();
  const lifted = keyboardAware && inset > 0;
  return (
    <>
      {/* 고정 바가 가리는 만큼만 자리 확보 (= pt-3 + lg 버튼 54px + pb). 크면 빈 화면에도 스크롤이 생김 */}
      <div
        className={cx(
          "shrink-0 md:hidden",
          // 쌓으면 버튼 하나(54px) + 간격(0.5rem)만큼 더
          stacked
            ? "h-[calc(8.125rem_+_max(0.75rem,env(safe-area-inset-bottom)))]"
            : "h-[calc(4.25rem_+_max(0.75rem,env(safe-area-inset-bottom)))]",
        )}
        aria-hidden
      />
      <div
        style={lifted ? { bottom: inset } : undefined}
        className={cx(
          "fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-glass-border",
          stacked ? "max-md:flex-col" : "max-md:[&>*]:flex-1",
          glassBar,
          lifted ? "p-0 [&_button]:rounded-none" : "px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          "md:static md:z-auto md:backdrop-filter-none",
          desktopClassName,
        )}
      >
        {children}
      </div>
    </>
  );
}

// ── 모달 공통 ─────────────────────────────

/** 열려 있는 동안 Esc로 닫기 + 뒤 페이지 스크롤 잠금 */
function useModalBehavior(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}

// ── 설명 툴팁 (ⓘ 누르면 말풍선) ─────────────────────────────

/**
 * 라벨 옆 작은 ⓘ 버튼. 누르면 그 아래에 설명 말풍선이 뜸 (바깥 클릭·Esc·스크롤하면 닫힘).
 * 말풍선은 body에 portal로 띄워서 카드 경계·쌓임 순서에 잘리지 않음.
 * <label> 안에 있어도 누를 때 연결된 입력으로 포커스가 넘어가지 않게 클릭 기본 동작을 막음.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: PointerEvent) => {
      if (!btn.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [pos, close]);

  const toggle = () => {
    if (pos) return close();
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const margin = 16;
    const width = Math.min(280, window.innerWidth - margin * 2);
    // 버튼 가운데 기준, 화면 밖으로 나가지 않게
    const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, margin), window.innerWidth - margin - width);
    setPos({ top: r.bottom + 8, left, width });
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={!!pos}
        aria-describedby={pos ? tipId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
        className={cx(
          "inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border border-fg-muted/50 align-middle text-[11px] font-bold leading-none text-fg-muted transition hover:border-primary hover:text-primary",
          focusRing,
          pos && "border-primary text-primary",
        )}
      >
        i
      </button>
      {pos &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed z-50 rounded-panel border border-glass-border bg-glass-strong p-3.5 text-sm leading-relaxed text-fg-sub shadow-glass backdrop-glass motion-safe:animate-fade"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

// ── 가운데 모달 ─────────────────────────────

/** 짧은 안내·확인용 가운데 모달. actions = 하단 버튼들 (같은 너비로 나란히) */
export function Dialog({
  open, onClose, title, actions, children,
}: { open: boolean; onClose: () => void; title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  const titleId = useId();
  useModalBehavior(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default bg-scrim motion-safe:animate-fade" />
      <div className="relative w-full max-w-sm rounded-card border border-glass-border bg-glass-strong p-6 shadow-glass backdrop-glass motion-safe:animate-rise">
        <h2 id={titleId} className="text-xl font-bold leading-snug">
          {title}
        </h2>
        {children && <div className="mt-2 text-[15px] leading-relaxed text-fg-sub">{children}</div>}
        {actions && <div className="mt-6 flex gap-2 [&>*]:flex-1">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
