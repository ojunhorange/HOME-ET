import type { ReactNode } from "react";
import { cx, focusRing, styles } from "./styles";

export type BadgeTone = keyof typeof styles.badge.tone;

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return <span className={cx(styles.badge.base, styles.badge.tone[tone], className)}>{children}</span>;
}

/** 큰 숫자 + 단위 (자취지수, 월세 상한) */
export function BigNumber({
  value, unit, tone, size = "xl",
}: { value: ReactNode; unit?: ReactNode; tone?: "primary" | "accent"; size?: "lg" | "xl" }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span
        className={cx(
          "font-bold tracking-tight tabular-nums",
          size === "xl" ? "text-6xl" : "text-4xl sm:text-5xl",
          tone && styles.emphasis[tone],
        )}
      >
        {value}
      </span>
      {unit && <span className={cx("text-fg-muted", size === "xl" ? "text-lg" : "text-sm")}>{unit}</span>}
    </p>
  );
}

/** 가로 막대 (marker = 50% 위치 기준선) */
export function Meter({
  value, tone = "primary", size = "md", marker,
}: { value: number; tone?: keyof typeof styles.meter.fill; size?: keyof typeof styles.meter.size; marker?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cx(styles.meter.track, styles.meter.size[size])} aria-hidden>
      <div className={cx("h-full rounded-full transition-all", styles.meter.fill[tone])} style={{ width: `${Math.max(2, pct)}%` }} />
      {marker && <div className={styles.meter.marker} />}
    </div>
  );
}

/** 라벨·값이 위에 붙은 막대 */
export function LabeledMeter({
  label, value, pct, tone,
}: { label: ReactNode; value: ReactNode; pct: number; tone?: keyof typeof styles.meter.fill }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-fg-sub">{label}</span>
        <b className="tabular-nums">{value}</b>
      </div>
      <Meter value={pct} tone={tone} />
    </div>
  );
}

/** 세로 막대 비교 (값은 막대 위, 라벨은 막대 아래). pct = 가장 큰 값 기준 0~100 */
export function ColumnBars({
  items,
}: { items: { label: ReactNode; value: ReactNode; pct: number; tone?: keyof typeof styles.meter.fill }[] }) {
  return (
    <div className="flex items-end justify-center gap-6 sm:gap-10" aria-hidden>
      {items.map((it, i) => (
        <div key={i} className="flex w-24 flex-col items-center sm:w-28">
          <b className="mb-2 text-sm tabular-nums">{it.value}</b>
          <div className="flex h-40 w-14 items-end overflow-hidden rounded-xl bg-track sm:h-48 sm:w-16">
            <div
              className={cx("w-full rounded-xl transition-[height] duration-300", styles.meter.fill[it.tone ?? "primary"])}
              style={{ height: `${Math.max(3, Math.min(100, it.pct))}%` }}
            />
          </div>
          <span className="mt-2.5 text-center text-xs leading-snug text-fg-sub">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ScaleLabels({ items }: { items: ReactNode[] }) {
  return (
    <div className="flex justify-between text-xs text-fg-muted">
      {items.map((it, i) => (
        <span key={i}>{it}</span>
      ))}
    </div>
  );
}

/** 금액 표의 한 줄. total = 합계 줄(위에 구분선) */
export function StatRow({ label, value, total }: { label: ReactNode; value: ReactNode; total?: boolean }) {
  const row = (
    <div className={cx("flex items-baseline justify-between gap-4 py-1.5 text-sm", total ? "font-bold text-fg" : "text-fg-sub")}>
      <span>{label}</span>
      <span className={cx("tabular-nums", total ? "text-[15px]" : "text-fg")}>{value}</span>
    </div>
  );
  return total ? <div className="mt-2 border-t border-border pt-2">{row}</div> : row;
}

export function StatList({ rows }: { rows: { label: ReactNode; value: ReactNode; total?: boolean }[] }) {
  return (
    <div>
      {rows.map((r, i) => (
        <StatRow key={i} {...r} />
      ))}
    </div>
  );
}

export function Callout({ tone = "primary", className, children }: { tone?: keyof typeof styles.callout.tone; className?: string; children: ReactNode }) {
  return <div className={cx(styles.callout.base, styles.callout.tone[tone], className)}>{children}</div>;
}

export function TermCard({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="rounded-panel border border-border bg-surface-subtle p-4">
      <p className="font-bold text-primary">{term}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-sub">{children}</p>
    </div>
  );
}

/** 타임라인 한 칸 (선택 가능) */
/**
 * 타임라인 한 줄. 오른쪽 chevron으로 펼칠 수 있음을 표시
 * 모바일: 아래 방향(펼치면 위로 뒤집힘) = 바로 아래에 설명이 펼쳐짐 / 데스크톱(lg): 오른쪽 방향 = 옆 패널에 열림
 */
export function TimelineItem({
  badge, badgeTone, title, sub, selected, expanded, done, onSelect,
}: {
  badge: ReactNode; badgeTone: BadgeTone; title: ReactNode; sub: ReactNode;
  selected?: boolean; expanded?: boolean; done?: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "step" : undefined}
      aria-expanded={expanded}
      className={cx(
        "flex w-full items-center gap-4 rounded-panel border p-3 text-left transition",
        focusRing,
        !selected
          ? "border-border hover:bg-surface-muted"
          : expanded === false
            ? "border-border hover:bg-surface-muted lg:border-primary/50 lg:bg-primary-soft/70" // 모바일에서 접으면 강조 해제 (데스크톱은 옆 패널에 열려 있으니 유지)
            : "border-primary/50 bg-primary-soft/70",
      )}
    >
      <Badge tone={badgeTone} className="h-9 w-15 shrink-0 rounded-lg px-0! text-sm">
        {badge}
      </Badge>
      <span className="min-w-0 flex-1">
        <span className={cx("block text-[15px] font-bold", done && "text-fg-muted line-through")}>{title}</span>
        <span className="block text-sm text-fg-muted">{sub}</span>
      </span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden
        className={cx(
          "mr-1 shrink-0 transition-transform duration-200 lg:-rotate-90",
          !selected ? "text-fg-muted" : expanded === false ? "text-fg-muted lg:text-primary" : "text-primary",
          expanded && "rotate-180",
        )}
      >
        <path d="m4.5 7 4.5 4.5L13.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
