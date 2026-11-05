// 자취지수 · 동네 점수 판정. 명세: docs/scoring.md
// 모든 금액은 원, 모든 값은 "학기 중 한 달" 기준입니다 (월 등교일 = 주당 등교일 × 4.3, 기획서 기준).

// ── 가치관 조정값: 0 = 보통, −3 ~ +3 정수 ─────────────
// 세 값은 서로 독립이에요 (합을 맞추지 않음). 하나를 올려도 나머지는 그대로.
export type Adjust = { money: number; time: number; body: number };
export type WeightKey = keyof Adjust;
export const ADJ_MIN = -3;
export const ADJ_MAX = 3;
/** 예전(v2) 배수 1 + 0.25·a 의 한 칸. 옛 저장값 변환(fromLegacyWeights)에만 씀 */
const ADJ_STEP = 0.25;
export const NEUTRAL: Adjust = { money: 0, time: 0, body: 0 };

export const clampAdj = (v: number) => Math.max(ADJ_MIN, Math.min(ADJ_MAX, Math.round(Number.isFinite(v) ? v : 0))) || 0; // −0 방지
export const sanitizeAdjust = (a: Partial<Adjust>): Adjust => ({
  money: clampAdj(a.money ?? 0),
  time: clampAdj(a.time ?? 0),
  body: clampAdj(a.body ?? 0),
});
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

/** 자취 후보 동네: 학교까지 통학과 시세 */
export interface Place {
  oneWayMin: number; // 동네 → 학교 편도(분)
  transfers: number; // 동네 → 학교 환승 수
  roundTripFare: number; // 동네 → 학교 왕복 교통비
  convRent: number; // 환산 월세 중앙값 R_d (월세 + 보증금 이자)
  rent: number; // 월세 중앙값 (중개보수 계산용)
  mgmt: number; // 관리비
}

// ── 판정 파라미터 (docs/scoring.md) ─────────────
/** 기본 시간 가중치 c: 통학 1시간 = 최저시급 × 1.35. 70분 재고 · 85분 싼 동네 추천 · 120분 60만 이하 전부 추천을 맞춘 값 */
export const TIME_WEIGHT = 1.35;
/** 가치관 1칸 = 돈 대비 6% (6칸 차이 = 1.42배) */
export const ADJ_BASE = 1.06;

// 통학시간 누적분포 F: 2010 인크루트 대학생 745명 설문을 30분 단위로 보간 (docs/scoring.md 4절)
const F_MIN = [0, 10, 30, 60, 90, 120, 150, 180, 240];
const F_PCT = [0, 3.497, 23.477, 50.45, 73.327, 89.611, 95.605, 98.103, 100];
/** 편도 통학시간(분) → 또래 대학생 백분위 (0~100) */
export function percentile(min: number) {
  if (!(min > 0)) return 0;
  if (min >= 240) return 100;
  const k = F_MIN.findIndex((x) => min < x) - 1;
  return F_PCT[k] + ((F_PCT[k + 1] - F_PCT[k]) * (min - F_MIN[k])) / (F_MIN[k + 1] - F_MIN[k]);
}

export interface Verdict {
  schoolDaysPerMonth: number;
  savedHours: number; // 한 달에 되찾는 통학 시간 H
  timeValue: number; // 시간 가치
  bodyValue: number; // 체력 가치 (피로 계수 반영)
  fatigueHome: number;
  fatiguePlace: number;
  savedFare: number; // 절약 교통비 (음수면 더 듦)
  value: number; // V = 시간 + 체력 + 교통비
  convRent: number; // 환산 월세 R_d
  mgmt: number;
  living: number;
  brokerage: number; // 중개보수 상한 (일시불)
  initialMonthly: number; // (초기 비용 + 중개보수) / 24
  extraCost: number; // E = 환산 월세 + 관리비 + 생활비 + 초기 비용
  ok: boolean; // V ≥ E → 이 동네 추천
  rentCap: number; // 환산 월세 상한 (V − 관리비 − 생활비 − 초기 비용)
  myMin: number; // 가치관을 반영한 체감 통학시간 t̃
  cutMin: number; // 이 동네를 감당하려면 필요한 체감 통학시간 t*
  index: number; // 자취지수 = F(t̃) (동네와 무관)
  cut: number; // 동네 점수(커트라인) = F(t*)
  myHourValue: number; // 내가 매기는 1시간의 가치
  buyBackPrice: number; // 자취로 1시간을 되사는 가격
}

/**
 * 동네 하나에 대한 판정. V ≥ E ⇔ 자취지수 ≥ 동네 점수 ⇔ 1시간 가치 ≥ 되사는 가격 (같은 부등식).
 * k(n) = 시급·c·(1.06^(시간−돈) + 1.06^(체력−돈)·f(n))  : 환승 n번 통학 1시간의 손해
 */
export function judge(c: Commute, cost: LivingCosts, adj: Adjust, p: Place): Verdict {
  const a = sanitizeAdjust(adj);
  const D = Math.max(0, c.daysPerWeek) * WEEKS_PER_MONTH;
  const wt = c.hourlyWage * TIME_WEIGHT;
  const mt = ADJ_BASE ** (a.time - a.money);
  const mb = ADJ_BASE ** (a.body - a.money);
  const f0 = fatigueCoef(c.transfers);
  const fd = fatigueCoef(p.transfers);
  const homeHours = (2 * D * c.oneWayMin) / 60;
  const placeHours = (2 * D * p.oneWayMin) / 60;

  const timeValue = wt * mt * (homeHours - placeHours);
  const bodyValue = wt * mb * (f0 * homeHours - fd * placeHours);
  const savedFare = D * (c.roundTripFare - p.roundTripFare);
  const value = timeValue + bodyValue + savedFare;

  // ponytail: 중개보수는 동네 월세 중앙값 기준으로 고정 (상한 월세에서 다시 풀면 수천 원 차이)
  const brokerage = brokerageFee(cost.deposit, p.rent);
  const initialMonthly = (cost.initialTotal + brokerage) / CONTRACT_MONTHS;
  const extraCost = p.convRent + p.mgmt + cost.living + initialMonthly;

  // 양쪽을 "가치관 보통일 때 본가 통학 1시간의 손해" k0 로 나눠 통학시간 축으로 옮김 → 백분위 점수
  const k0 = wt * (1 + f0);
  const myMin = (c.oneWayMin * (mt + mb * f0)) / (1 + f0);
  const cutMin = D > 0 ? (p.oneWayMin * (mt + mb * fd)) / (1 + f0) + (60 * (extraCost - savedFare)) / (2 * D * k0) : Infinity;
  const savedHours = homeHours - placeHours;

  return {
    schoolDaysPerMonth: D,
    savedHours,
    timeValue,
    bodyValue,
    fatigueHome: f0,
    fatiguePlace: fd,
    savedFare,
    value,
    convRent: p.convRent,
    mgmt: p.mgmt,
    living: cost.living,
    brokerage,
    initialMonthly,
    extraCost,
    ok: value >= extraCost,
    rentCap: value - p.mgmt - cost.living - initialMonthly,
    myMin,
    cutMin,
    index: percentile(myMin),
    cut: percentile(cutMin),
    myHourValue: savedHours > 0 ? (timeValue + bodyValue) / savedHours : 0,
    buyBackPrice: savedHours > 0 ? (extraCost - savedFare) / savedHours : 0,
  };
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
