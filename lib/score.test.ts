// 실행: node lib/score.test.ts — 기획서 p.4 예시 표와 일치해야 함
import assert from "node:assert/strict";
import { score, rebalance, EQUAL_WEIGHTS, type Weights } from "./score.ts";
import { buildSteps, ddayLabel } from "./dday.ts";

const base = {
  commuteRoundTripH: 3,
  transfers: 1,
  fareRoundTrip: 3200,
  daysPerWeek: 5,
  hourlyWage: 10320,
  livingRoundTripH: 20 / 60,
  rent: 550000,
  mgmt: 70000,
  extraLiving: 150000,
  deposit: 10_000_000,
  annualRate: 0.035,
};

const cases: [Weights, number, number][] = [
  [EQUAL_WEIGHTS, 51.3, 58.9],
  [{ money: 0.5, time: 0.3, body: 0.2 }, 36.8, 24.6],
  [{ money: 0.2, time: 0.5, body: 0.3 }, 70.5, 156.5],
];

for (const [weights, idx, cap] of cases) {
  const r = score({ ...base, weights });
  assert.equal(r.index.toFixed(1), idx.toFixed(1), `index ${JSON.stringify(weights)}`);
  assert.equal((r.rentCap / 10000).toFixed(1), cap.toFixed(1), `cap ${JSON.stringify(weights)}`);
}

const w = rebalance({ money: 0.4, time: 0.35, body: 0.25 }, "money", 0.2);
assert.ok(Math.abs(w.money + w.time + w.body - 1) < 1e-9);
assert.ok(Math.abs(w.time / w.body - 0.35 / 0.25) < 1e-9);

// D-day 규칙: 프로토타입 화면 예시 (오늘 1/10, 계약 1/15, 잔금 2/20, 1,000만/55만 → 임대차 신고 대상)
const steps = buildSteps({ today: "2027-01-10", contract: "2027-01-15", balance: "2027-02-20", deposit: 10_000_000, rent: 550_000 });
assert.deepEqual(
  steps.map((x) => [x.key, x.date, ddayLabel("2027-01-10", x.date, x.until)]),
  [
    ["before", "2027-01-10", "오늘"],
    ["contract", "2027-01-15", "D-5"],
    ["report", "2027-02-14", "D-35"],
    ["prebalance", "2027-02-19", "D-40"],
    ["balance", "2027-02-20", "D-41"],
  ],
);
assert.equal(buildSteps({ today: "2027-01-10", contract: "2027-01-15", balance: "2027-02-20", deposit: 5_000_000, rent: 300_000 }).length, 4);

console.log("score + dday: ok");
