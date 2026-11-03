// 자취지수 산출식 (기획서 "자취지수 산출식 (초안)" 그대로). 모든 금액은 원, 월 단위.

export type Weights = { money: number; time: number; body: number };

export type ScoreInput = {
  commuteRoundTripH: number; // 본가→학교 왕복 시간
  transfers: number; // 편도 환승 횟수
  fareRoundTrip: number; // 왕복 교통비
  daysPerWeek: number;
  hourlyWage: number;
  livingRoundTripH: number; // 자취 시 왕복 시간
  rent: number;
  mgmt: number; // 관리비
  extraLiving: number; // 추가 생활비
  deposit: number;
  annualRate: number; // 보증금 기회비용 연이율
  initialCost?: number; // 초기 비용(중개수수료·이사·가구), 24개월 분할. 기본 0
  weights: Weights;
};

export const DAYS_PER_MONTH_FACTOR = 4.3;
export const MIN_WAGE_2026 = 10320;

export function score(i: ScoreInput) {
  const D = i.daysPerWeek * DAYS_PER_MONTH_FACTOR;
  const savedHours = Math.max(0, (i.commuteRoundTripH - i.livingRoundTripH) * D);
  const f = Math.min(0.2 + 0.1 * i.transfers, 0.5);
  const gTime = savedHours * i.hourlyWage;
  const gBody = gTime * f;

  const depositInterest = (i.deposit * i.annualRate) / 12;
  const initialMonthly = (i.initialCost ?? 0) / 24;
  const savedFare = i.fareRoundTrip * D;
  const fixedCosts = i.mgmt + i.extraLiving + depositInterest + initialMonthly - savedFare;
  const extraCost = i.rent + fixedCosts;

  const w = i.weights;
  const wMoney = Math.max(w.money, 0.01); // 0이면 상한이 무한대가 되므로 하한을 둠
  const E = 3 * w.time * gTime + 3 * w.body * gBody;
  const K = 3 * wMoney * extraCost;
  const index = K <= 0 ? 100 : E + K === 0 ? 50 : (100 * E) / (E + K);

  const willingness = E / (3 * wMoney); // 내 시간·체력 가치 기준 지불 의향
  return {
    index,
    recommended: index >= 50,
    savedHours,
    fatigueFactor: f,
    fatigueHours: savedHours * f,
    gTime,
    gBody,
    gain: gTime + gBody,
    extraCost,
    depositInterest,
    initialMonthly,
    savedFare,
    willingness,
    rentCap: willingness - fixedCosts,
    valuePerHour: savedHours > 0 ? willingness / savedHours : 0, // 내가 매기는 1시간의 가치
    pricePerHour: savedHours > 0 ? extraCost / savedHours : 0, // 자취로 1시간을 되사는 가격
  };
}

/** 슬라이더 하나를 움직이면 나머지 둘을 기존 비율대로 채워 합 1 유지 */
export function rebalance(w: Weights, key: keyof Weights, value: number): Weights {
  const v = Math.min(1, Math.max(0, value));
  const others = (Object.keys(w) as (keyof Weights)[]).filter((k) => k !== key);
  const rest = others.reduce((s, k) => s + w[k], 0);
  const next = { ...w, [key]: v };
  for (const k of others) next[k] = rest > 0 ? (w[k] / rest) * (1 - v) : (1 - v) / 2;
  return next;
}

export const EQUAL_WEIGHTS: Weights = { money: 1 / 3, time: 1 / 3, body: 1 / 3 };

export const won = (n: number) => `${(n / 10000).toFixed(1)}만 원`;
