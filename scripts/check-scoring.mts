// 판정식 self-check: 의도한 시나리오(docs/scoring.md 검증 표)와 "점수 비교 = 원 비교" 동치를 확인
// 실행: node scripts/check-scoring.mts   (실패하면 assert 에러)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_COSTS, MIN_WAGE_2026, NEUTRAL, judge, type Adjust, type Place } from "../lib/calc.ts";

type Dong = { dong: string; rent_median: number; median: number };
type Route = { mode: string; oneWayMin: number; summary: string };
const dongs: { schools: Record<string, Dong[]> } = JSON.parse(await readFile("data/school-dongs.json", "utf8"));
const routes: Record<string, Record<string, Route>> = JSON.parse(await readFile("data/school-commute.json", "utf8"));

// lib/app-state.ts placeOf 와 같은 규칙
const place = (school: string, d: Dong): Place => {
  const r = routes[school][d.dong];
  const walk = r.mode === "도보";
  return {
    oneWayMin: r.oneWayMin, transfers: walk ? 0 : r.summary.split("→").length - 1, roundTripFare: walk ? 0 : 3_000,
    convRent: Math.round(d.median * 10_000), rent: Math.round(d.rent_median * 10_000), mgmt: 60_000,
  };
};
const costs = { ...DEFAULT_COSTS, rent: 0, mgmt: 0 };
const persona = (oneWayMin: number) => ({ oneWayMin, transfers: 2, headwayMin: 0, roundTripFare: 4_500, daysPerWeek: 4, hourlyWage: MIN_WAGE_2026 });
const passCount = (min: number, adj: Adjust = NEUTRAL) =>
  Object.entries(dongs.schools).map(([s, rows]) => rows.filter((d) => judge(persona(min), costs, adj, place(s, d)).ok).length);

assert.deepEqual(passCount(70), [0, 0, 0, 0, 0, 0], "70분 보통 → 모든 학교 재고");
assert.ok(passCount(85).every((n) => n >= 1), "85분 보통 → 학교마다 싼 동네는 추천");
assert.deepEqual(passCount(120), [5, 5, 5, 5, 5, 5], "120분 보통 → 전부 추천");

// 자취지수 ≥ 동네 점수 ⇔ V ≥ E (백분위 보간 구간 안에서)
for (const min of [40, 60, 85, 100, 130])
  for (const a of [-3, 0, 3])
    for (const [s, rows] of Object.entries(dongs.schools))
      for (const d of rows) {
        const v = judge(persona(min), costs, { money: a, time: -a, body: 0 }, place(s, d));
        if (v.cutMin > 0 && v.cutMin < 240) assert.equal(v.myMin >= v.cutMin, v.ok, `${min}분 ${s} ${d.dong}`);
      }

console.log("ok", { 85: passCount(85), "85 시간+3 체력+3": passCount(85, { money: 0, time: 3, body: 3 }) });
