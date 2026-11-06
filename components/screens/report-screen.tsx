"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { AppState } from "@/lib/app-state";
import type { LivingCosts } from "@/lib/calc";
import { reportModel } from "@/lib/view-models";
import { cx } from "@/components/ui/styles";
import {
  ActionBar, Badge, BigNumber, Button, Card, CardTitle, Dialog, Em, ColumnBars, FinePrint, InfoTip,
  Meter, NumberInput, ScaleLabels, SectionLabel, Slider, StatList, useIsDesktop,
} from "@/components/ui";
import { SaveButtons, SaveStatus } from "@/components/reports/report-ui";

export function ReportScreen({
  state, update, name, onStay, onGo,
}: {
  state: AppState;
  update: (patch: Partial<AppState>) => void;
  name: string | null;
  onStay: () => void;
  onGo: () => void;
}) {
  const [stayOpen, setStayOpen] = useState(false);
  const closeStay = useCallback(() => setStayOpen(false), []);
  const m = reportModel(state, name);
  const tone = m.recommended ? "primary" : "accent";
  const scoreRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLDivElement>(null);
  // 모바일: 점수 카드가 통째로 지나가면 / 데스크톱: 카드가 옆 카드 높이만큼 늘어나 늦게 지나가므로 큰 숫자가 지나가면
  const desktop = useIsDesktop();
  const pinned = useScrolledPast(desktop ? numberRef : scoreRef);
  const decisions = (size: "md" | "lg") => (
    <>
      <Button
        variant="secondary"
        size={size}
        onClick={() => {
          onStay();
          setStayOpen(true);
        }}
      >
        통학 유지하기
      </Button>
      <Button size={size} onClick={onGo}>
        {m.nextLabel}
      </Button>
    </>
  );

  return (
    <div className="space-y-5">
      {/* 점수 카드가 헤더 뒤로 지나가면 헤더 바로 아래에 점수만 작게 붙임 → 아래에서 가치관을 바꿀 때 점수 변화가 보임 */}
      <div
        aria-hidden={!pinned}
        className={cx(
          "pointer-events-none fixed inset-x-0 top-[calc(var(--header-h,0px)+0.5rem)] z-10 flex justify-center px-4 transition duration-200",
          pinned ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        )}
      >
        <div className="flex items-center gap-2 rounded-full border border-glass-border bg-glass-bar py-1.5 pl-4 pr-1.5 text-sm shadow-glass backdrop-glass">
          <span className="text-fg-sub">자취지수</span>
          <b className={cx("text-base tabular-nums", tone === "primary" ? "text-primary" : "text-accent")}>{m.index}</b>
          <span className="text-base font-semibold tabular-nums text-fg-sub">/ {m.cutoff.text}</span>
          <Badge tone={tone}>{m.verdict}</Badge>
        </div>
      </div>

      {/* 1행: 자취지수 | 1시간 가격 비교 (반반) */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div ref={scoreRef}>
          {/* 이 화면의 주인공: 다른 카드보다 한 단계 진한 톤 */}
          <Card tone="highlight" className="h-full">
            <CardTitle aside={<Badge tone={tone}>{m.verdict}</Badge>}>{m.title}</CardTitle>
            <div ref={numberRef} className="mt-4">
              <BigNumber value={m.index} unit="/ 100" />
            </div>
            <div className="mt-5 space-y-3">
              <Meter value={m.indexPct} tone={tone} size="sm" marker={m.cutoff.pct} />
              <ScaleLabels items={["통학 유리", "자취 유리"]} />
            </div>
            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <SectionLabel>동네 커트라인</SectionLabel>
                <span className="text-xs text-fg-muted">{m.passText}</span>
              </div>
              <table className="mt-2 w-full text-sm tabular-nums">
                <thead className="text-xs text-fg-muted">
                  <tr>
                    <th className="py-1 text-left font-medium">동네</th>
                    <th className="py-1 text-right font-medium">환산 월세</th>
                    <th className="py-1 text-right font-medium">커트라인</th>
                  </tr>
                </thead>
                <tbody>
                  {m.cutRows.map((r) => (
                    <tr key={r.id} className={cx("border-t border-border", r.ok ? "text-fg" : "text-fg-muted")}>
                      <td className="py-1.5">
                        <span aria-hidden className={cx("mr-1.5", r.ok && "text-primary")}>{r.ok ? "✓" : "✗"}</span>
                        {r.name}
                        <span className="sr-only">{r.ok ? ", 통과" : ", 미달"}</span>
                      </td>
                      <td className="py-1.5 text-right">{r.rent}</td>
                      <td className="py-1.5 text-right font-semibold">{r.cut}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card>
          {m.hasSavedTime ? (
            <div className="flex h-full flex-col gap-6">
              <p className="text-lg font-bold leading-snug sm:text-xl">
                {m.recommended ? (
                  <>
                    <span className="block">한 달에 통학 {m.summary.hours}이 돌아와요.</span>
                    <span className="block">
                      내 기준으로는 시간당 {m.summary.perHour}, 매달 <Em>{m.summary.perMonth}</Em>어치 이득이에요.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block">1시간마다 {m.summary.perHour}씩 비싸게 사는 거예요.</span>
                    <span className="block">
                      한 달이면 약 <Em tone="accent">{m.summary.perMonth}</Em>을 더 내는 셈이에요.
                    </span>
                  </>
                )}
              </p>
              <div className="mt-auto">
                <ColumnBars items={m.bars} />
              </div>
            </div>
          ) : (
            <p className="text-lg font-bold">자취 후 통학 시간이 지금보다 줄지 않아서, 되찾는 시간이 없어요.</p>
          )}
        </Card>
      </div>

      {/* 2행: 가치관 슬라이더 | 가정값 고치기 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle
            aside={
              m.aiAdj && (
                <Button variant="secondary" size="sm" disabled={m.isAiValue} onClick={() => update({ adj: m.aiAdj! })}>
                  AI 분석값으로
                </Button>
              )
            }
          >
            <span className="inline-flex items-center gap-1.5">
              내 가치관
              <InfoTip label="가치관 항목 설명">
                <span className="block space-y-1.5">
                  {m.adjust.map((a) => (
                    <span key={a.key} className="block">
                      <b className="block text-fg">{a.label}</b>
                      {a.hint}
                    </span>
                  ))}
                </span>
              </InfoTip>
            </span>
          </CardTitle>
          <FinePrint className="mt-1">0은 대학생 평균이에요.</FinePrint>
          <div className="mt-5 space-y-6">
            {m.adjust.map((a) => (
              <div key={a.key}>
                <Slider
                  label={<b className="text-fg">{a.label}</b>}
                  display={
                    <>
                      <span className="mr-1.5 font-normal text-fg-sub">{a.level}</span>
                      {a.display}
                    </>
                  }
                  valueText={`${a.display}, ${a.level}`}
                  min={a.min}
                  max={a.max}
                  step={1}
                  origin={0}
                  value={a.value}
                  onChange={(v) => update({ adj: { ...state.adj, [a.key]: v } })}
                />
                <div className="mt-1.5 flex justify-between text-xs text-fg-muted">
                  <span>덜 중요</span>
                  <span>더 중요</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 옆 가치관 카드 높이만큼 늘어나고, 4칸이 남은 높이를 나눠 채움 */}
        <Card className="flex flex-col">
          <CardTitle
            aside={
              <InfoTip label="가정값 항목 설명">
                <span className="block space-y-1.5">
                  {ASSUMPTIONS.map((a) => (
                    <span key={a.key} className="block">
                      <b className="block text-fg">{a.label}</b>
                      {a.hint}
                    </span>
                  ))}
                </span>
              </InfoTip>
            }
          >
            가정값 고치기
          </CardTitle>
          <Assumptions costs={state.costs} onChange={(patch) => update({ costs: { ...state.costs, ...patch } })} />
        </Card>
      </div>

      {/* 3행: 한 달 기준 비교 */}
      <Card>
        <CardTitle meta={m.basis}>한 달 기준 비교</CardTitle>
        <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-10">
          <div className="space-y-2">
            <SectionLabel tone="primary">자취하면 되찾는 것</SectionLabel>
            <StatList rows={m.gains} />
          </div>
          <div className="space-y-2">
            <SectionLabel tone="accent">자취하면 더 드는 돈</SectionLabel>
            <StatList rows={m.costs} />
          </div>
        </div>
      </Card>

      {/* 마무리: 저장 구역 | 결정 구역. 모바일은 결정 버튼만 하단 고정 바로 */}
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
        {/* 저장 구역 */}
        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 font-bold">
                <Badge tone={tone}>{m.verdict}</Badge>
                {m.passText}
              </p>
              <SaveStatus />
            </div>
            <div className="flex gap-2 max-md:[&>*]:flex-1 md:shrink-0">
              <SaveButtons />
            </div>
          </div>
        </Card>
        {/* 결정 구역 (데스크톱 전용, 모바일은 하단 고정 바) */}
        <Card className="hidden md:flex md:items-center">
          <div className="flex gap-2">{decisions("md")}</div>
        </Card>
      </div>

      <Dialog
        open={stayOpen}
        onClose={closeStay}
        title="통학을 유지하기로 했어요"
        actions={
          <>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                closeStay();
                onGo();
              }}
            >
              {m.nextLabel}
            </Button>
            <Button size="lg" onClick={closeStay}>
              확인
            </Button>
          </>
        }
      >
        {m.stayMessage}
      </Dialog>

      <ActionBar desktopClassName="md:hidden">{decisions("lg")}</ActionBar>
    </div>
  );
}

const ASSUMPTIONS: { label: string; hint: string; key: keyof LivingCosts; step: number }[] = [
  { label: "보증금", hint: "중개보수 계산용", key: "deposit", step: 1_000_000 },
  { label: "관리비", hint: "매달 내는 관리비, 모든 동네에 같은 값을 적용", key: "mgmt", step: 10_000 },
  { label: "추가 생활비", hint: "월세 이외의 식비 또는 생활비 등", key: "living", step: 10_000 },
  { label: "이사·가구가전", hint: "이사 비용 및 초기 가구 구매 비용", key: "initialTotal", step: 50_000 },
];

function Assumptions({ costs, onChange }: { costs: LivingCosts; onChange: (patch: Partial<LivingCosts>) => void }) {
  return (
    // 칸 사이만 얇은 선(카드 안에 또 카드를 두지 않음). 칸이 늘어나도 이름은 위, 입력칸은 아래
    <div className="mt-5 grid flex-1 auto-rows-fr grid-cols-2">
      {ASSUMPTIONS.map((f, i) => (
        <div
          key={f.key}
          className={cx(
            "flex min-w-0 flex-col justify-between gap-3 py-4",
            i % 2 === 0 ? "border-r border-border pr-4" : "pl-4",
            i < 2 && "border-b border-border",
          )}
        >
          <label htmlFor={`as-${f.key}`} className="text-sm font-semibold text-fg">
            {f.label}
          </label>
          <NumberInput
            id={`as-${f.key}`}
            tone="inset"
            suffix="원"
            step={f.step}
            value={costs[f.key]}
            onChange={(v) => onChange({ [f.key]: v })}
          />
        </div>
      ))}
    </div>
  );
}

/** 요소가 sticky 헤더 뒤로 완전히 지나갔는지 */
function useScrolledPast(ref: RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
      setPast(el.getBoundingClientRect().bottom < headerH);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [ref]);
  return past;
}
