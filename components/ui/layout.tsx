import type { ReactNode } from "react";
import { cx, styles } from "./styles";

export function Card({
  tone = "default", padding = "md", className, children,
}: {
  tone?: keyof typeof styles.card.tone;
  padding?: keyof typeof styles.card.padding;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx(styles.card.base, styles.card.tone[tone], styles.card.padding[padding], className)}>
      {children}
    </section>
  );
}

/** 카드 제목 + 옆 설명(meta) + 오른쪽 요소(aside) */
export function CardTitle({
  children, meta, aside, size = "md",
}: { children: ReactNode; meta?: ReactNode; aside?: ReactNode; size?: "md" | "lg" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className={cx("font-bold", size === "lg" && "text-xl")}>
        {children}
        {meta && <span className="ml-1.5 text-sm font-normal text-fg-muted">{meta}</span>}
      </h2>
      {aside}
    </div>
  );
}

/** 카드 안쪽 회색 영역 */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx(styles.panel, className)}>{children}</div>;
}

export function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
      <p className="mt-2 text-[15px] text-fg-sub">{sub}</p>
    </div>
  );
}

export function Eyebrow({ tone = "accent", children }: { tone?: "accent" | "primary"; children: ReactNode }) {
  return <p className={cx("text-sm font-semibold", styles.emphasis[tone])}>{children}</p>;
}

export function SectionLabel({ tone, children }: { tone?: "primary" | "accent"; children: ReactNode }) {
  return <h3 className={cx("text-sm font-bold", tone ? styles.emphasis[tone] : "text-fg-sub")}>{children}</h3>;
}

/** 강조 색 텍스트 */
export function Em({ tone = "primary", children }: { tone?: "primary" | "accent"; children: ReactNode }) {
  return <span className={styles.emphasis[tone]}>{children}</span>;
}

/** "라벨 값" 나열 (예: 학교까지 도보 10분 · 월세 중앙값 55만 원) */
export function InlineStats({ items }: { items: { label: ReactNode; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-fg-sub">
      {items.map((it, i) => (
        <span key={i}>
          {it.label} <b className="text-fg">{it.value}</b>
          {it.note && <> {it.note}</>}
        </span>
      ))}
    </div>
  );
}

export function FinePrint({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cx("text-xs leading-relaxed text-fg-muted", className)}>{children}</p>;
}
