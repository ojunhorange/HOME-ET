"use client";
import { useState } from "react";
import Link from "next/link";
import { rebalance, score, won, type Weights } from "@/lib/score";
import { school, toScoreInput, useAppState } from "@/lib/state";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}시간 ${Math.round(min % 60)}분` : `${Math.round(min)}분`);

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 text-sm ${bold ? "mt-2 border-t border-line pt-3 font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function ReportPage() {
  const [s, set] = useAppState();
  const [keep, setKeep] = useState(false);
  const r = score(toScoreInput(s));
  const who = s.name ? `${s.name} 님` : "나";
  const maxBar = Math.max(r.valuePerHour, r.pricePerHour, 1);
  const LABELS: [keyof Weights, string][] = [
    ["money", "돈"],
    ["time", "시간"],
    ["body", "체력"],
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_2.2fr]">
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{who}의 자취지수</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.recommended ? "bg-brand-soft text-brand" : "bg-accent-soft text-accent"}`}>
              {r.recommended ? "자취 추천" : "다시 생각해 보기"}
            </span>
          </div>
          <p className="mt-4 text-6xl font-extrabold tracking-tight">
            {r.index.toFixed(1)}
            <span className="ml-1 text-lg font-normal text-muted">/ 100</span>
          </p>
          <div className="relative mt-4 h-2 rounded-full bg-line">
            <div className={`h-2 rounded-full ${r.recommended ? "bg-brand" : "bg-accent"}`} style={{ width: `${r.index}%` }} />
            <div className="absolute -top-1.5 left-1/2 h-5 w-0.5 bg-ink" />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>통학 유리</span>
            <span>50 = 손익분기</span>
            <span>자취 유리</span>
          </div>
        </section>

        <section className="card">
          <p className="text-xl font-bold leading-relaxed">
            자취는 통학 1시간을 약 <span className="text-accent">{won(r.pricePerHour).replace(" 원", "")} 원</span>에 되사는 셈이에요. 지금 {s.name ? `${s.name} 님은` : "나는"} 1시간을 약{" "}
            <span className="text-brand">{won(r.valuePerHour).replace(" 원", "")} 원</span>어치로 여기고 있어요.
          </p>
          {[
            ["내가 매기는 1시간의 가치", r.valuePerHour, "bg-brand"],
            ["자취로 1시간을 되사는 가격", r.pricePerHour, "bg-accent"],
          ].map(([label, v, color]) => (
            <div key={label as string} className="mt-4">
              <div className="flex justify-between text-sm">
                <span>{label}</span>
                <b>{Math.round(v as number).toLocaleString("ko-KR")}원</b>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-line">
                <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${((v as number) / maxBar) * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="mt-4 text-sm text-muted">
            한 달에 약 {r.savedHours.toFixed(1)}시간을 되찾는 대신 약 {won(r.extraCost)}을 더 써요. 내 1시간의 가치가 자취 가격보다 크면 자취가 이득이에요.
          </p>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2.2fr_1fr]">
        <section className="card">
          <h2 className="font-bold">
            한 달 기준 비교 <span className="text-xs font-normal text-muted">주 {s.daysPerWeek}일 × 4.3주</span>
          </h2>
          <div className="mt-4 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-brand">자취하면 되찾는 것</h3>
              <Row label="통학 시간" value={`${r.savedHours.toFixed(1)}시간`} />
              <Row label="시간 가치" value={won(r.gTime)} />
              <Row label={`피로 회복 시간 (계수 ${r.fatigueFactor.toFixed(2)})`} value={`${r.fatigueHours.toFixed(1)}시간`} />
              <Row label="체력 가치" value={won(r.gBody)} />
              <Row label="합계" value={won(r.gain)} bold />
            </div>
            <div>
              <h3 className="text-sm font-bold text-accent">자취하면 더 드는 돈</h3>
              <Row label="월세 · 관리비" value={won(s.rent + s.mgmt)} />
              <Row label="추가 생활비" value={won(s.extraLiving)} />
              {s.initialCost > 0 && <Row label="초기 비용 (2년 분할)" value={won(r.initialMonthly)} />}
              <Row label="보증금 기회비용" value={won(r.depositInterest)} />
              <Row label="절약 교통비" value={`−${won(r.savedFare)}`} />
              <Row label="합계" value={won(r.extraCost)} bold />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">내 가치관</h2>
            <button className="btn px-3 py-1.5 text-xs" onClick={() => set({ weights: s.aiWeights })}>
              AI 분석값으로
            </button>
          </div>
          {LABELS.map(([k, label]) => (
            <label key={k} className="mt-4 block">
              <div className="flex justify-between text-sm">
                <span>{label}</span>
                <span>{pct(s.weights[k])}</span>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={s.weights[k]} onChange={(e) => set({ weights: rebalance(s.weights, k, +e.target.value) })} />
            </label>
          ))}
          <p className="mt-4 rounded-xl bg-bg p-3 text-xs leading-relaxed text-muted">AI 분석 근거: {s.aiReason || "생활 목표를 입력하면 Gemini가 분석해요."}</p>
        </section>
      </div>

      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <span>
            자취하면 등교일 저녁 <b>+{hm(s.oneWayMin * 2 - school.defaultLivingRoundTripMin)}</b>
          </span>
          <span>
            막차 걱정 없이 학교에 남을 수 있는 날 <b>주 {s.daysPerWeek}일</b>
          </span>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setKeep(true)}>
            통학 유지하기
          </button>
          <Link href="/rent" className="btn-primary">
            {r.recommended ? "자취 준비하기" : "그래도 자취하기"}
          </Link>
        </div>
        {keep && (
          <p className="w-full rounded-xl bg-brand-soft p-3 text-sm text-brand">
            통학을 유지하기로 했어요. 가치관이나 등교일이 바뀌면 슬라이더로 언제든 다시 계산해 볼 수 있어요.
          </p>
        )}
      </section>
    </div>
  );
}
