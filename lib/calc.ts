// 자취지수 산출식 (선형식). 명세: docs/metrics.md
// 모든 금액은 원, 모든 값은 "학기 중 한 달" 기준입니다 (월 등교일 = 주당 등교일 × 4.3, 기획서 기준).

// ── 가치관 조정값: 0 = 보통, −3 ~ +3 정수 ─────────────
// 세 값은 서로 독립이에요 (합을 맞추지 않음). 하나를 올려도 나머지는 그대로.
export type Adjust = { money: number; time: number; body: number };
export type WeightKey = keyof Adjust;
export const ADJ_MIN = -3;
export const ADJ_MAX = 3;
/** 조정값 1칸 = 그 항목을 25% 더(덜) 무겁게 본다 */
export const ADJ_STEP = 0.25;
export const NEUTRAL: Adjust = { money: 0, time: 0, body: 0 };

export const clampAdj = (v: number) => Math.max(ADJ_MIN, Math.min(ADJ_MAX, Math.round(Number.isFinite(v) ? v : 0))) || 0; // −0 방지
export const sanitizeAdjust = (a: Partial<Adjust>): Adjust => ({
  money: clampAdj(a.money ?? 0),
  time: clampAdj(a.time ?? 0),
  body: clampAdj(a.body ?? 0),
});
/** 조정값 → 배수 m = 1 + 0.25·a  (0.25 ~ 1.75) */
export const multiplier = (a: number) => 1 + ADJ_STEP * a;
export const sameAdjust = (a: Adjust, b: Adjust) => a.money === b.money && a.time === b.time && a.body === b.body;

/** 예전 저장값(합 1 가중치)을 조정값으로: 3w가 예전 식의 배수였으므로 a = (3w − 1) / 0.25 */
export function fromLegacyWeights(w: Partial<Adjust>): Adjust {
  const m = Math.max(0, w.money ?? 0), t = Math.max(0, w.time ?? 0), b = Math.max(0, w.body ?? 0);
  const s = m + t + b;
  if (!Number.isFinite(s) || s <= 0) return NEUTRAL;
  const to = (x: number) => clampAdj((3 * (x / s) - 1) / ADJ_STEP);
  return { money: to(m), time: to(t), body: to(b) };
}

export interface Commute {
  oneWayMin: number; // 본가→학교 편도 소요시간(분)
  transfers: number; // 환승 횟수
  headwayMin: number; // 배차 간격(분) - 대기 여유 시간으로 왕복에 1회 반영
  roundTripFare: number; // 왕복 교통비(원)
  daysPerWeek: number; // 주당 등교일
  hourlyWage: number; // 내 1시간의 기준 시급(원)
}

export interface LivingCosts {
  rent: number; // 월세
  mgmt: number; // 관리비
  living: number; // 추가 생활비 (식비·공과금 등)
  initialTotal: number; // 이사·가구가전 등 초기 비용 (중개보수 제외) → 24개월 분할
  deposit: number; // 보증금
  annualRate: number; // 보증금 기회비용 연이율
}

// ── 팀 확정 전 가정값 ─────────────────────────────
export const MIN_WAGE_2026 = 10_320;
export const WEEKS_PER_MONTH = 4.3; // 한 달 주 수 (기획서). 방학은 반영하지 않음
export const DEFAULT_LIVING_ROUND_TRIP_MIN = 20; // ①: 학교 주변 자취 가정 왕복 20분
export const CONTRACT_MONTHS = 24; // 초기 비용을 나눠 잡는 기간 (주택 임대차 기본 2년)

export const DEFAULT_COSTS: Omit<LivingCosts, "rent" | "mgmt"> = {
  living: 150_000,
  // 팀 기본값 초기 비용 80만(중개보수 포함)을 유지하도록, 기본 계약(보증금 1,000만·월세 55만)의 중개보수 26만을 뺀 값.
  // 중개보수는 brokerageFee()로 따로 계산해 더함
  initialTotal: 540_000,
  deposit: 10_000_000,
  annualRate: 0.035,
};
/** 중개보수를 따로 계산하기 전의 기본값들(165만 → 80만). 저장값이 이 값이면 새 기본값으로 옮김 */
export const LEGACY_INITIAL_TOTALS = [1_650_000, 800_000];

/**
 * 수도권 통합 거리비례 요금(편도, 카드). Google 경로에 요금이 비어 올 때 씀.
 * 10km까지 1,550원, 10~50km 5km마다 +100, 50km 초과 8km마다 +100
 */
// ponytail: 광역버스·GTX 별도 요금 미반영. 해당 경로가 많아지면 탈것 종류별 요금 추가
export function metroFare(km: number) {
  let fare = 1_550;
  if (km > 10) fare += Math.ceil((Math.min(km, 50) - 10) / 5) * 100;
  if (km > 50) fare += Math.ceil((km - 50) / 8) * 100;
  return fare;
}

/** 피로 계수 f: 환승이 많을수록 같은 1시간이 더 지친다 (상한 0.5). */
export function fatigueCoef(transfers: number) {
  return Math.min(0.5, 0.15 + 0.1 * Math.max(0, transfers));
}

// ── 중개보수 (주택 임대차, 서울시 조례 상한요율) ─────────
// 거래금액 = 보증금 + 월세 × 100, 단 5천만 원 미만이면 보증금 + 월세 × 70 (공인중개사법 시행규칙 제20조 ⑤)
// 실제 보수는 상한 안에서 협의하고, 부가세는 별도예요.
const BROKERAGE_BANDS: { below: number; rate: number; cap: number }[] = [
  { below: 50_000_000, rate: 0.005, cap: 200_000 },
  { below: 100_000_000, rate: 0.004, cap: 300_000 },
  { below: 600_000_000, rate: 0.003, cap: Infinity },
  { below: 1_200_000_000, rate: 0.004, cap: Infinity },
  { below: 1_500_000_000, rate: 0.005, cap: Infinity },
  { below: Infinity, rate: 0.006, cap: Infinity },
];

export function brokerageBase(deposit: number, rent: number) {
  const base = deposit + rent * 100;
  return base < 50_000_000 ? deposit + rent * 70 : base;
}

export function brokerageFee(deposit: number, rent: number) {
  const base = Math.max(0, brokerageBase(Math.max(0, deposit), Math.max(0, rent)));
  const band = BROKERAGE_BANDS.find((b) => base < b.below)!;
  return Math.min(band.cap, base * band.rate);
}

// ── 보증금 ↔ 월세 환산 ─────────────────────────────
/** 보증금 기회비용까지 합친 "환산 월세". 보증금·월세 조합이 다른 매물은 이 값이 작은 쪽이 싸요. */
export const effectiveRent = (rent: number, deposit: number, annualRate: number) => rent + (deposit * annualRate) / 12;

export interface Result {
  commuteDailyMin: number;
  savedDailyMin: number;
  schoolDaysPerMonth: number;
  savedHours: number;
  timeValue: number;
  fatigue: number;
  fatigueHours: number;
  bodyValue: number;
  gainTotal: number;
  rentAndMgmt: number;
  living: number;
  brokerage: number; // 중개보수 상한 (일시불)
  initialMonthly: number; // (초기 비용 + 중개보수) / 24
  depositCost: number;
  savedFare: number;
  extraCost: number; // ΔC
  multipliers: Adjust; // m = 1 + 0.25·a
  /** 가치관을 반영한 월 순이득 N = m시간·G시간 + m체력·G체력 − m돈·ΔC (원) */
  net: number;
  /** 정규화 기준 S = G시간 + G체력 + |ΔC| (가치관과 무관) */
  scale: number;
  /** 자취지수 = 50 + 기여 점수 합. 각 항목이 몇 점을 더하고 빼는지 */
  contrib: { time: number; body: number; money: number };
  /** 조정값 1칸이 지수를 몇 점 움직이는지 */
  pointsPerStep: Adjust;
  /** 가치관을 반영한 "내가 낼 의향이 있는 월 금액" W = (m시간·G시간 + m체력·G체력) / m돈 */
  willingness: number;
  index: number; // 0~100, 50 = 손익분기
  myHourValue: number; // 내가 매기는 1시간의 가치
  buyBackPrice: number; // 자취로 1시간을 되사는 가격
  rentCap: number; // 지수가 50이 되는 월세
}

export function compute(
  c: Commute,
  cost: LivingCosts,
  adj: Adjust,
  livingRoundTripMin = DEFAULT_LIVING_ROUND_TRIP_MIN,
  livingRoundTripFare = 0, // 자취 지역에서도 버스·지하철을 타면 그 왕복 요금
): Result {
  const commuteDailyMin = 2 * c.oneWayMin + c.headwayMin;
  const savedDailyMin = Math.max(0, commuteDailyMin - livingRoundTripMin);
  const schoolDaysPerMonth = c.daysPerWeek * WEEKS_PER_MONTH;
  const savedHours = (savedDailyMin / 60) * schoolDaysPerMonth;

  const timeValue = savedHours * c.hourlyWage;
  const fatigue = fatigueCoef(c.transfers);
  const fatigueHours = savedHours * fatigue;
  const bodyValue = fatigueHours * c.hourlyWage;

  const brokerage = brokerageFee(cost.deposit, cost.rent);
  const initialMonthly = (cost.initialTotal + brokerage) / CONTRACT_MONTHS;
  const depositCost = (cost.deposit * cost.annualRate) / 12;
  const savedFare = Math.max(0, c.roundTripFare - livingRoundTripFare) * schoolDaysPerMonth;
  const extraCost = cost.rent + cost.mgmt + cost.living + initialMonthly + depositCost - savedFare;

  // ── 선형 자취지수 ──
  const a = sanitizeAdjust(adj);
  const m: Adjust = { money: multiplier(a.money), time: multiplier(a.time), body: multiplier(a.body) };
  const gain = m.time * timeValue + m.body * bodyValue; // 가치관을 반영한 이득
  const net = gain - m.money * extraCost;
  const scale = timeValue + bodyValue + Math.abs(extraCost);
  const k = scale > 0 ? 50 / scale : 0; // 1원 = k점
  const contrib = { time: k * m.time * timeValue, body: k * m.body * bodyValue, money: -k * m.money * extraCost };
  const index = Math.max(0, Math.min(100, 50 + contrib.time + contrib.body + contrib.money));
  const pointsPerStep: Adjust = {
    time: k * ADJ_STEP * timeValue,
    body: k * ADJ_STEP * bodyValue,
    money: -k * ADJ_STEP * extraCost,
  };

  const willingness = gain / m.money; // m돈 ≥ 0.25 라 항상 유한
  const rentCap = solveRentCap(willingness, cost, depositCost, savedFare);

  return {
    commuteDailyMin,
    savedDailyMin,
    schoolDaysPerMonth,
    savedHours,
    timeValue,
    fatigue,
    fatigueHours,
    bodyValue,
    gainTotal: timeValue + bodyValue,
    rentAndMgmt: cost.rent + cost.mgmt,
    living: cost.living,
    brokerage,
    initialMonthly,
    depositCost,
    savedFare,
    extraCost,
    multipliers: m,
    net,
    scale,
    contrib,
    pointsPerStep,
    willingness,
    index,
    myHourValue: savedHours > 0 ? willingness / savedHours : 0,
    buyBackPrice: savedHours > 0 ? extraCost / savedHours : 0,
    rentCap,
  };
}

/**
 * 지수가 50(N = 0, 즉 ΔC = W)이 되는 월세.
 * 중개보수가 월세에 따라 구간별로 달라지므로, R + 중개보수(R)/24 = 목표값 을 이분법으로 풉니다.
 * (R + 중개보수/24 는 R에 대해 항상 증가)
 */
function solveRentCap(W: number, cost: LivingCosts, depositCost: number, savedFare: number) {
  if (!Number.isFinite(W)) return Infinity;
  const otherInitial = cost.initialTotal / CONTRACT_MONTHS;
  const target = W - cost.mgmt - cost.living - otherInitial - depositCost + savedFare;
  const g = (R: number) => R + brokerageFee(cost.deposit, R) / CONTRACT_MONTHS;
  if (target <= g(0)) return target - brokerageFee(cost.deposit, 0) / CONTRACT_MONTHS; // 0 이하 → "어떤 월세도 손해"
  let lo = 0, hi = target;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) <= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ── 표시용 포맷 ─────────────────────────────
export const man = (won: number, digits = 1) =>
  `${(won / 10_000).toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}만 원`;
export const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
export const hours = (h: number) => `${h.toFixed(1)}시간`;
export const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");
export function hm(min: number) {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}분`;
  return r === 0 ? `${h}시간` : `${h}시간 ${r}분`;
}
