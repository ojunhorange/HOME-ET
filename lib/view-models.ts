/**
 * 화면에 보여줄 값·문구를 만드는 순수 함수들.
 * 디자인을 바꿀 때 화면 JSX만 다시 쓰고, 숫자와 문구는 여기서 그대로 가져다 쓰면 됩니다.
 */
import {
  ADJ_MAX, ADJ_MIN, brokerageFee, compute, hours, man, sameAdjust, sanitizeAdjust, signed, won,
  CONTRACT_MONTHS, type LivingCosts, type WeightKey,
} from "./calc";
import { findSchool, type Region, type School } from "./data";
import {
  TERMS, buildSteps, dLabel, googleCalendarUrl, md, parseDate, stepDateText, type Step,
} from "./dday";
import { regionFare, selectedRegion, type AppState } from "./app-state";

export const WEIGHT_LABELS: { key: WeightKey; label: string; hint: string }[] = [
  { key: "money", label: "돈", hint: "자취 비용을 얼마나 무겁게 느끼는지" },
  { key: "time", label: "시간", hint: "되찾은 시간을 얼마나 값지게 쓸지" },
  { key: "body", label: "체력", hint: "통학 피로를 얼마나 신경 쓰는지" },
];

const LEVELS: Record<number, string> = {
  [-3]: "거의 신경 안 씀", [-2]: "덜 중요", [-1]: "조금 덜 중요", 0: "보통", 1: "조금 중요", 2: "중요", 3: "가장 중요",
};
export const levelText = (a: number) => LEVELS[a] ?? "보통";
const pts = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}점`;

export interface Line { label: string; value: string; total?: boolean }

// ── ② 리포트 ─────────────────────────────
export function reportModel(state: AppState, name: string | null) {
  const r = compute(state.commute, state.costs, state.adj);
  const recommended = r.index >= 50;
  const nextLabel = recommended ? "자취 준비하기" : "그래도 자취하기";
  const myHour = Math.round(r.myHourValue);
  const price = Math.round(r.buyBackPrice);
  const scale = Math.max(myHour, price, 1);
  const aiAdj = state.analysis ? sanitizeAdjust(state.analysis) : null;
  const rawIndex = 50 + r.contrib.time + r.contrib.body + r.contrib.money;

  return {
    title: name ? `${name} 님의 자취지수` : "내 자취지수",
    index: r.index.toFixed(1),
    indexPct: r.index,
    recommended,
    verdict: recommended ? "자취 추천" : "다시 생각해 보기",
    hasSavedTime: r.savedHours > 0,
    headline: {
      price: man(price),
      subject: name ? `지금 ${name} 님은` : "지금 내 가치관으로는",
      myHour: man(myHour),
    },
    bars: [
      { label: "내가 매기는 1시간의 가치", value: won(myHour), pct: (myHour / scale) * 100, tone: "primary" as const },
      { label: "자취로 1시간을 되사는 가격", value: won(price), pct: (price / scale) * 100, tone: "accent" as const },
    ],
    gains: [
      { label: "통학 시간 (여유 시간 포함)", value: hours(r.savedHours) },
      { label: "시간 가치", value: man(r.timeValue) },
      { label: `피로 회복 시간 (계수 ${r.fatigue.toFixed(2)})`, value: hours(r.fatigueHours) },
      { label: "체력 가치", value: man(r.bodyValue) },
      { label: "합계", value: man(r.gainTotal), total: true },
    ] satisfies Line[],
    costs: [
      { label: "월세 · 관리비", value: man(r.rentAndMgmt) },
      { label: "추가 생활비", value: man(r.living) },
      { label: "초기 비용 (중개보수 포함)", value: man(r.initialMonthly) },
      { label: "보증금 기회비용 · 절약 교통비", value: man(r.depositCost - r.savedFare) },
      { label: "합계", value: man(r.extraCost), total: true },
    ] satisfies Line[],
    nextLabel,
    /** 자취지수 = 50 + 항목별 점수 (선형식이라 그대로 더하면 돼요) */
    indexLines: [
      { label: "손익분기 기준", value: "50.0점" },
      { label: `시간 가치 ×${r.multipliers.time.toFixed(2)}`, value: pts(r.contrib.time) },
      { label: `체력 가치 ×${r.multipliers.body.toFixed(2)}`, value: pts(r.contrib.body) },
      { label: `추가 비용 ×${r.multipliers.money.toFixed(2)}`, value: pts(r.contrib.money) },
      { label: rawIndex < 0 || rawIndex > 100 ? "자취지수 (0~100으로 자름)" : "자취지수", value: `${r.index.toFixed(1)}점`, total: true },
    ] satisfies Line[],
    brokerageNote: `지금 보증금·월세의 중개보수 법정 상한은 ${man(r.brokerage)}이에요(부가세 별도). 이사·가구가전과 함께 24개월로 나눠 초기 비용에 넣어요.`,
    adjust: WEIGHT_LABELS.map(({ key, label, hint }) => ({
      key,
      label,
      hint,
      value: state.adj[key],
      min: ADJ_MIN,
      max: ADJ_MAX,
      display: signed(state.adj[key]),
      level: levelText(state.adj[key]),
    })),
    aiAdj,
    isAiValue: !!aiAdj && sameAdjust(aiAdj, state.adj),
    stayMessage: `등교일이나 시간표가 바뀌면 다시 계산해 보세요. 마음이 바뀌면 언제든 “${nextLabel}”로 넘어갈 수 있어요.`,
  };
}

// ── ③ 월세 추천 ─────────────────────────────
function rentMessage(cap: number, region: Region) {
  const median = man(region.rentMedian, 0);
  if (!Number.isFinite(cap)) return "상한을 계산할 수 없어요. 리포트의 가치관 조정값을 다시 확인해 주세요.";
  if (cap <= 0)
    return `지금 가치관 기준으로는 ${region.name}에서 어떤 월세를 내도 통학보다 손해예요. 리포트에서 가치관을 다시 살펴보거나 통학을 이어가는 것도 방법이에요.`;
  if (cap >= region.rentMedian * 1.5)
    return `${region.name} 원룸 월세 중앙값(${median})보다 상한이 훨씬 높아요. 시세 안에서 넓게 고를 수 있어요.`;
  if (cap >= region.rentMedian)
    return `${region.name} 원룸 월세 중앙값(${median})이 상한 안에 들어와요. 이 지역에서 고르면 통학보다 손해가 아니에요.`;
  return `${region.name} 원룸 월세 중앙값(${median})이 상한보다 높아요. 중앙값보다 싼 방을 찾거나 다른 지역도 같이 비교해 보세요.`;
}

function mapUrl(school: School, region: Region) {
  const pad = 0.012;
  const minLat = Math.min(region.lat, school.lat) - pad, maxLat = Math.max(region.lat, school.lat) + pad;
  const minLng = Math.min(region.lng, school.lng) - pad, maxLng = Math.max(region.lng, school.lng) + pad;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}&layer=mapnik&marker=${school.lat},${school.lng}`;
}

export function rentModel(state: AppState, name: string | null) {
  const school = findSchool(state.schoolId);
  const region = selectedRegion(state);
  const isCustom = region.id === "custom";
  const costs: LivingCosts = { ...state.costs, rent: region.rentMedian, mgmt: region.mgmtMedian };
  const livingMin = region.oneWayMin * 2;
  const r = compute(state.commute, costs, state.adj, livingMin, regionFare(region));
  const finite = Number.isFinite(r.rentCap);
  const capWon = Math.max(0, r.rentCap);
  const cap = man(capWon);
  // 상한 월세에서의 중개보수로 내역을 다시 맞춤 (중개보수가 월세에 따라 달라짐)
  const initialAtCap = (costs.initialTotal + brokerageFee(costs.deposit, capWon)) / CONTRACT_MONTHS;

  return {
    school,
    region,
    isCustom,
    regions: school.regions,
    title: name ? `${name} 님의 적정 월세 상한` : "나의 적정 월세 상한",
    capText: finite ? cap : "제한 없음",
    hasCap: finite,
    message: rentMessage(r.rentCap, region),
    breakdown: [
      { label: "내 시간·체력 가치 기준 지불 의향", value: man(r.willingness) },
      { label: "− 관리비", value: man(costs.mgmt) },
      { label: "− 추가 생활비", value: man(costs.living) },
      { label: "− 초기 비용 (중개보수 포함, 2년 분할)", value: man(initialAtCap) },
      { label: "− 보증금 기회비용", value: man(r.depositCost) },
      { label: "+ 절약 교통비", value: man(r.savedFare) },
      { label: "월세 상한", value: cap, total: true },
    ] satisfies Line[],
    stats: [
      { label: "학교까지", value: `${region.mode === "도보" ? "도보" : isCustom ? "대중교통" : region.mode} ${region.oneWayMin}분`, note: isCustom ? undefined : region.mode === "도보" ? "(거리로 어림)" : "(Google 경로)" },
      { label: "원룸 월세 중앙값", value: man(region.rentMedian, 0), note: isCustom ? undefined : "(실거래가 1년)" },
      { label: "관리비 중앙값", value: man(region.mgmtMedian, 0), note: isCustom ? undefined : "(가정)" },
    ],
    map: { src: mapUrl(school, region), title: `${school.name} 주변 지도` },
  };
}

// ── ④ 계약 D-day ─────────────────────────────
export type DdayItem = Step & { badge: string; dateText: string; done: boolean; isToday: boolean };

export function ddayModel(state: AppState, today: Date, pickedKey: string | null) {
  const contract = parseDate(state.contract);
  const balance = parseDate(state.balance);
  const valid = !!contract && !!balance && balance.getTime() >= contract.getTime();
  const steps = valid ? buildSteps(today, contract, balance, state.leaseDeposit, state.leaseRent) : [];

  const items: DdayItem[] = steps.map((s) => {
    const badge = dLabel(s, today);
    return { ...s, badge, dateText: stepDateText(s), done: badge === "완료", isToday: badge === "오늘" };
  });
  const current = items.find((s) => s.isToday) ?? items.find((s) => !s.done) ?? items[0];
  const selected = items.find((s) => s.key === pickedKey) ?? current;

  return {
    valid,
    steps,
    items,
    selected: selected
      ? {
          ...selected,
          terms: selected.terms.map((t) => ({ term: t, desc: TERMS[t] })),
          calendarUrl: googleCalendarUrl(selected),
        }
      : null,
    todayText: md(today),
  };
}
