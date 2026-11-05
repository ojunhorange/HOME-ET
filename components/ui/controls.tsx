"use client";

import { useEffect, useState } from "react";
import type {
  AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode,
  SelectHTMLAttributes, TextareaHTMLAttributes,
} from "react";
import { cx, focusRing, styles } from "./styles";

// ── 버튼 ─────────────────────────────
export type ButtonVariant = keyof typeof styles.button.variant;
export type ButtonSize = keyof typeof styles.button.size;

export function Button({
  variant = "primary", size = "md", block, className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(styles.button.base, styles.button.variant[variant], styles.button.size[size], block && "w-full", className)}
    />
  );
}

/** 버튼 모양 링크 (외부 페이지 열기 등) */
export function ButtonAnchor({
  variant = "primary", size = "md", className, ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <a {...props} className={cx(styles.button.base, styles.button.variant[variant], styles.button.size[size], className)} />;
}

export function TextLink({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      className={cx("inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline", focusRing, className)}
    />
  );
}

/** 링크처럼 보이는 버튼 (토글 등 페이지 이동이 아닌 동작) */
export function LinkButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cx("inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline", focusRing, className)}
    />
  );
}

export function Chip({
  selected, dashed, onClick, children,
}: { selected?: boolean; dashed?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(styles.chip.base, selected ? styles.chip.selected : styles.chip.idle, !selected && dashed && styles.chip.dashed)}
    >
      {children}
    </button>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

// ── 폼 ─────────────────────────────
type Tone = keyof typeof styles.control.tone;
type Size = keyof typeof styles.control.size;
const controlClass = (tone: Tone = "default", size: Size = "md", extra?: string) =>
  cx(styles.control.base, styles.control.tone[tone], styles.control.size[size], extra);

/** 라벨 + 입력 + 도움말 */
export function Field({
  label, htmlFor, hint, compact, children,
}: { label: ReactNode; htmlFor?: string; hint?: ReactNode; compact?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className={compact ? styles.miniLabel : styles.label}>
        {label}
      </label>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

type ControlProps = { tone?: Tone; size?: Size };

export function TextInput({ tone, size, className, ...props }: InputHTMLAttributes<HTMLInputElement> & ControlProps) {
  return <input {...props} className={controlClass(tone, size, className)} />;
}

export function Select({ tone, size, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & ControlProps) {
  return <select {...props} className={controlClass(tone, size, cx("appearance-none", className))} />;
}

export function TextArea({ tone, size, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps) {
  return <textarea {...props} className={controlClass(tone, size, cx("resize-y leading-relaxed", className))} />;
}

/**
 * 숫자 입력 + 단위 표시. 보고 있을 땐 천 단위 쉼표, 편집 중엔 원본 숫자.
 * (type="number" 스피너를 피하려고 텍스트 입력 + 숫자 키패드 사용, 빈칸이면 0)
 */
/**
 * 숫자 입력의 공통 동작: 보고 있을 땐 천 단위 쉼표, 편집 중엔 원본 숫자,
 * 포커스하면 전체 선택(바로 덮어쓰기), ↑↓로 step만큼 조정, Enter → onEnter.
 */
function useNumberField({
  value, onChange, step = 1, onEnter,
}: { value: number; onChange: (v: number) => void; step?: number; onEnter?: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const decimals = step < 1;
  const safe = Number.isFinite(value) ? value : 0;
  const shown = draft ?? safe.toLocaleString("ko-KR", { maximumFractionDigits: decimals ? 2 : 0 });

  const props: InputHTMLAttributes<HTMLInputElement> = {
    type: "text",
    inputMode: decimals ? "decimal" : "numeric",
    autoComplete: "off",
    enterKeyHint: onEnter ? "next" : "done",
    value: shown,
    onFocus: (e) => {
      setDraft(String(safe));
      const el = e.currentTarget;
      requestAnimationFrame(() => el.select());
    },
    onBlur: () => setDraft(null),
    onChange: (e) => {
      const raw = e.target.value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, "");
      setDraft(raw);
      const n = raw === "" ? 0 : Number(raw);
      if (Number.isFinite(n)) onChange(n);
    },
    onKeyDown: (e) => {
      if (e.key === "Enter" && onEnter && !e.nativeEvent.isComposing) {
        e.preventDefault();
        onEnter();
        return;
      }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const next = Math.max(0, +(safe + (e.key === "ArrowUp" ? step : -step)).toFixed(2));
      setDraft(String(next));
      onChange(next);
    },
  };
  return { props, shown };
}

type NumberFieldProps = {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
  id?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  "aria-label"?: string;
};

/** 숫자 입력 + 단위 표시 (type="number" 스피너를 피하려고 텍스트 입력 + 숫자 키패드) */
export function NumberInput({ suffix, id, tone, size, autoFocus, "aria-label": ariaLabel, ...field }: NumberFieldProps & ControlProps) {
  const { props } = useNumberField(field);
  return (
    <div className="relative">
      <input
        id={id}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        {...props}
        className={controlClass(tone, size, cx("tabular-nums", suffix && "pr-11"))}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-fg-muted">{suffix}</span>
      )}
    </div>
  );
}

/** 큰 숫자 입력. 단위가 숫자 바로 뒤에 붙고, 하단 선만 있음 (토스 금액 입력 느낌) */
export function HeroNumberInput({ suffix, id, autoFocus, "aria-label": ariaLabel, ...field }: NumberFieldProps) {
  const { props, shown } = useNumberField(field);
  return (
    <label htmlFor={id} className={styles.hero.wrap}>
      <input
        id={id}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        {...props}
        style={{ width: `${Math.max(1, shown.length) + 0.4}ch` }}
        className={styles.hero.number}
      />
      {suffix && <span className={styles.hero.suffix}>{suffix}</span>}
    </label>
  );
}

/** 큰 텍스트 입력 (하단 선만) */
export function HeroTextInput({
  onEnter, className, ...props
}: InputHTMLAttributes<HTMLInputElement> & { onEnter?: () => void }) {
  return (
    <div className={cx(styles.hero.wrap, className)}>
      <input
        type="text"
        enterKeyHint={onEnter ? "next" : "done"}
        {...props}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onEnter();
          }
          props.onKeyDown?.(e);
        }}
        className={styles.hero.text}
      />
    </div>
  );
}

/**
 * − 값 + 스테퍼 (작은 정수 범위용: 주당 등교일 등).
 * 값에 포커스하면 ↑↓·←→로 조정, 숫자키로 바로 지정, Enter → onEnter
 * size="hero": 한 화면 한 질문용 가운데 큰 숫자 / "md": 폼 안 한 줄
 */
export function Stepper({
  value, onChange, min, max, label, unit, prefix, size = "md", autoFocus, onEnter,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
  unit?: string;
  prefix?: string;
  size?: "md" | "hero";
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const hero = size === "hero";
  const btn = cx(
    "grid shrink-0 place-items-center rounded-full border border-border bg-surface text-fg transition hover:bg-surface-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-30",
    focusRing,
    hero ? "h-14 w-14" : "h-10 w-10",
  );
  return (
    <div className={cx("flex items-center", hero ? "justify-center gap-8 py-4" : "justify-between rounded-control bg-surface-muted p-1.5")}>
      <button type="button" className={btn} onClick={() => set(value - 1)} disabled={value <= min} aria-label={`${label} 줄이기`}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path d="M4 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <div
        role="spinbutton"
        tabIndex={0}
        autoFocus={autoFocus}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${prefix ?? ""}${value}${unit ?? ""}`}
        onKeyDown={(e) => {
          const delta = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
          if (delta) {
            e.preventDefault();
            set(value + delta);
          } else if (/^\d$/.test(e.key) && +e.key >= min && +e.key <= max) {
            e.preventDefault();
            onChange(+e.key);
          } else if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        className={cx(
          "flex items-baseline justify-center rounded-control px-2 leading-tight outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
          hero ? "min-w-36 gap-2.5 text-[40px]" : "min-w-20 gap-1.5 text-lg",
        )}
      >
        {/* 숫자와 같은 크기, 굵기·색만 다르게 */}
        {prefix && <span className="font-medium text-fg-muted">{prefix}</span>}
        <span className="font-bold tabular-nums">{value}</span>
        {unit && <span className="font-medium text-fg-muted">{unit}</span>}
      </div>
      <button type="button" className={btn} onClick={() => set(value + 1)} disabled={value >= max} aria-label={`${label} 늘리기`}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path d="M4 9h10M9 4v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/** 추천값 칩 줄. 가로 스크롤 없이 줄바꿈 */
export function QuickChips<T extends string | number>({
  items, value, onSelect, label,
}: { items: { value: T; label: ReactNode }[]; value?: T; onSelect: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {items.map((it) => (
        <Chip key={String(it.value)} selected={it.value === value} onClick={() => onSelect(it.value)}>
          {it.label}
        </Chip>
      ))}
    </div>
  );
}

/**
 * 크게 누르는 선택지. layout="grid"면 2열(데스크톱 4열) 정사각에 가까운 버튼.
 * shortcuts: 숫자키 1~9로 고르기 (데스크톱 한 화면 한 질문에서 사용)
 */
export function OptionList<T extends string | number>({
  options, value, onSelect, label, layout = "list", shortcuts,
}: {
  options: { value: T; label: ReactNode; sub?: ReactNode }[];
  value?: T;
  onSelect: (v: T) => void;
  label: string;
  layout?: "list" | "grid";
  shortcuts?: boolean;
}) {
  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        onSelect(options[n - 1].value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, options, onSelect]);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={layout === "grid" ? "grid grid-cols-2 gap-2.5 md:grid-cols-4" : "space-y-2.5"}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(o.value)}
            className={cx(
              styles.option.base,
              selected ? styles.option.selected : styles.option.idle,
              layout === "grid" && "min-h-18 flex-col items-start justify-center gap-0.5",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-bold">{o.label}</span>
              {o.sub && <span className={cx("block text-sm", selected ? "text-primary/80" : "text-fg-muted")}>{o.sub}</span>}
            </span>
            {layout === "list" && (
              <span className="flex shrink-0 items-center gap-2">
                {shortcuts && (
                  <kbd className="hidden h-6 min-w-6 place-items-center rounded-md border border-border px-1.5 font-sans text-xs text-fg-muted md:grid">
                    {i + 1}
                  </kbd>
                )}
                <CheckMark on={selected} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CheckMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid h-6 w-6 place-items-center rounded-full transition",
        on ? "bg-primary text-on-primary" : "border border-border text-transparent",
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.2 5 8.5l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * 라벨·값이 위에 붙은 슬라이더 (기본 0~100).
 * origin을 주면 그 값에서부터 손잡이까지 채움 → 0 기준 ± 슬라이더 (가운데 눈금 표시)
 */
export function Slider({
  label, value, onChange, display, min = 0, max = 100, step = 1, origin, valueText, sub,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  display?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  origin?: number;
  valueText?: string;
  /** 라벨 줄 아래 작은 설명 */
  sub?: ReactNode;
}) {
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const o = origin ?? min;
  const [from, to] = value >= o ? [at(o), at(value)] : [at(value), at(o)];
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-fg-sub">{label}</span>
        <b className="shrink-0 tabular-nums">{display ?? value}</b>
      </span>
      {sub && <span className="-mt-1.5 mb-2 block text-xs text-fg-muted">{sub}</span>}
      <span className="relative block">
        {origin !== undefined && (
          <span aria-hidden className="pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-muted/40" style={{ left: at(o) }} />
        )}
        <input
          type="range"
          className="ui-slider relative block"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={valueText}
          style={{ ["--from" as string]: from, ["--to" as string]: to }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </span>
    </label>
  );
}
