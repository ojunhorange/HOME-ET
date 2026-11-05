"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { AppState } from "@/lib/app-state";
import type { LivingCosts } from "@/lib/calc";
import { reportModel } from "@/lib/view-models";
import { cx } from "@/components/ui/styles";
import {
  ActionBar, Badge, BigNumber, Button, Card, CardTitle, Dialog, Em, ColumnBars, Field, FinePrint, InfoTip,
  Meter, NumberInput, ScaleLabels, SectionLabel, Slider, StatList, useIsDesktop,
} from "@/components/ui";
import { SaveReportPanel } from "@/components/reports/report-ui";

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
          <Badge tone={tone}>{m.verdict}</Badge>
        </div>
      </div>

      {/* 1행: 자취지수 | 1시간 가격 비교 (반반) */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div ref={scoreRef}>
          <Card className="h-full">
            <CardTitle aside={<Badge tone={tone}>{m.verdict}</Badge>}>{m.title}</CardTitle>
            <div ref={numberRef} className="mt-4">
              <BigNumber value={m.index} unit="/ 100" />
            </div>
            <div className="mt-5 space-y-3">
              <Meter value={m.indexPct} tone={tone} size="sm" marker />
              <ScaleLabels items={["통학 유리", "50 = 손익분기", "자취 유리"]} />
            </div>
            <div className="mt-5">
              <StatList rows={m.indexLines} />
            </div>
          </Card>
        </div>

        <Card>
          {m.hasSavedTime ? (
            <div className="flex h-full flex-col gap-6">
              <p className="text-lg font-bold leading-snug sm:text-xl">
                자취는 통학 1시간을 약 <Em tone="accent">{m.headline.price}</Em>에 되사는 셈이에요. {m.headline.subject} 1시간을 약{" "}
                <Em>{m.headline.myHour}</Em>어치로 여기고 있어요.
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
                      <b className="text-fg">{a.label}</b> · {a.hint}
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

        <Card>
          <CardTitle
            aside={
              <InfoTip label="가정값 계산 기준">
                자취 후 왕복 20분, 한 달 = 주당 등교일 × 4.3일(학기 중 기준), 피로 계수 = 0.15 + 0.1 × 환승 횟수(최대 0.5)로 계산해요.
                <span className="mt-1.5 block">{m.brokerageNote}</span>
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
        <CardTitle>한 달 기준 비교</CardTitle>
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

      <SaveReportPanel />

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

      <ActionBar>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => {
            onStay();
            setStayOpen(true);
          }}
        >
          통학 유지하기
        </Button>
        <Button size="lg" onClick={onGo}>
          {m.nextLabel}
        </Button>
      </ActionBar>
    </div>
  );
}

function Assumptions({ costs, onChange }: { costs: LivingCosts; onChange: (patch: Partial<LivingCosts>) => void }) {
  const fields: { label: string; key: keyof LivingCosts; step: number }[] = [
    { label: "월세 (학교 주변 기본값)", key: "rent", step: 10_000 },
    { label: "관리비", key: "mgmt", step: 10_000 },
    { label: "추가 생활비", key: "living", step: 10_000 },
    { label: "이사·가구가전 (중개보수 제외)", key: "initialTotal", step: 50_000 },
    { label: "보증금", key: "deposit", step: 1_000_000 },
  ];
  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      {fields.map((f) => (
        <Field key={f.key} compact label={f.label} htmlFor={`as-${f.key}`}>
          <NumberInput id={`as-${f.key}`} size="sm" suffix="원" step={f.step} value={costs[f.key]} onChange={(v) => onChange({ [f.key]: v })} />
        </Field>
      ))}
      <Field compact label="보증금 기회비용 연이율" htmlFor="as-rate">
        <NumberInput
          id="as-rate"
          size="sm"
          suffix="%"
          step={0.1}
          value={Math.round(costs.annualRate * 1000) / 10}
          onChange={(v) => onChange({ annualRate: v / 100 })}
        />
      </Field>
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
