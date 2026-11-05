/**
 * 화면에 보여줄 값·문구를 만드는 순수 함수들.
 * 디자인을 바꿀 때 화면 JSX만 다시 쓰고, 숫자와 문구는 여기서 그대로 가져다 쓰면 됩니다.
 */
import {
  ADJ_MAX, ADJ_MIN, man, sameAdjust, sanitizeAdjust, signed, won, type Verdict, type WeightKey,
} from "./calc";
import { findSchool, type Region, type School } from "./data";
import {
  TERMS, buildSteps, dLabel, googleCalendarUrl, md, parseDate, stepDateText, type Step,
} from "./dday";
import { judgeRegion, judgeSchool, selectedRegion, type AppState } from "./app-state";

export const WEIGHT_LABELS: { key: WeightKey; label: string; hint: string }[] = [
  { key: "money", label: "돈", hint: "자취 비용을 얼마나 무겁게 느끼는지" },
  { key: "time", label: "시간", hint: "되찾은 시간을 얼마나 값지게 쓸지" },
  { key: "body", label: "체력", hint: "통학 피로를 얼마나 신경 쓰는지" },
];

const LEVELS: Record<number, string> = {
  [-3]: "거의 신경 안 씀", [-2]: "덜 중요", [-1]: "조금 덜 중요", 0: "보통", 1: "조금 중요", 2: "중요", 3: "가장 중요",
};
export const levelText = (a: number) => LEVELS[a] ?? "보통";
const pt = (v: number) => `${v.toFixed(1)}점`;

export interface Line { label: string; value: string; total?: boolean }

/** 한 달 기준 비교: 되찾는 것 (V) */
const gainLines = (v: Verdict): Line[] => [
  { label: "시간 가치", value: man(v.timeValue) },
  { label: "체력 가치", value: man(v.bodyValue) },
  { label: "절약 교통비", value: man(v.savedFare) },
  // 돈으로 셀 수 없는 몫이라 합계에 넣지 않음. 옆 "더 드는 돈"과 줄 수를 맞추는 자리이기도 함
  { label: "마음의 여유", value: "" },
  { label: "합계", value: man(v.value), total: true },
];
/** 한 달 기준 비교: 더 드는 돈 (E) */
const costLines = (v: Verdict, r: Region): Line[] => [
  { label: `환산 월세 (${r.name} 중앙값)`, value: man(v.convRent) },
  { label: "관리비", value: man(v.mgmt) },
  { label: "추가 생활비", value: man(v.living) },
  { label: "초기 비용 (중개보수 포함, 2년 분할)", value: man(v.initialMonthly) },
  { label: "합계", value: man(v.extraCost), total: true },
];

// ── ② 리포트 ─────────────────────────────
export function reportModel(state: AppState, name: string | null) {
  const j = judgeSchool(state);
  const { region: bestRegion, v: best } = j.best;
  const recommended = j.recommended;
  const nextLabel = recommended ? "자취 준비하기" : "그래도 자취하기";
  const myHour = Math.round(best.myHourValue);
  const price = Math.round(best.buyBackPrice);
  const scale = Math.max(myHour, price, 1);
  const aiAdj = state.analysis ? sanitizeAdjust(state.analysis) : null;
  const passed = j.rows.filter((r) => r.v.ok).length;

  return {
    title: name ? `${name} 님의 자취지수` : "내 자취지수",
    index: j.index.toFixed(1),
    indexPct: j.index,
    recommended,
    verdict: recommended ? "자취 추천" : "다시 생각해 보기",
    passText: `${findSchool(state.schoolId).name} 주변 ${j.rows.length}곳 중 ${passed}곳 통과`,
    /** 기준선 = 커트라인이 가장 낮은 동네 (여유 V − E 가 가장 큰 동네와 같음: V − E ∝ t̃ − t*) */
    cutoff: { pct: best.cut, text: best.cut.toFixed(1) },
    hasSavedTime: best.savedHours > 0,
    /** 메인 문구: 1시간 차이 × 되찾는 시간 = 한 달 차이 (V − E) */
    summary: {
      hours: `${Math.round(best.savedHours)}시간`,
      perHour: man(Math.abs(myHour - price)),
      perMonth: man(Math.abs(best.value - best.extraCost), 0),
    },
    bars: [
      { label: "내 1시간 가치", value: won(myHour), pct: (myHour / scale) * 100, tone: "primary" as const },
      { label: "자취 1시간 가격", value: won(price), pct: (price / scale) * 100, tone: "accent" as const },
    ],
    basis: `${bestRegion.name} 기준`,
    gains: gainLines(best),
    costs: costLines(best, bestRegion),
    nextLabel,
    /** 동네 점수(커트라인): 내 자취지수가 이 점수 이상이면 그 동네 추천 */
    cutLines: [
      ...[...j.rows].sort((a, b) => a.v.cut - b.v.cut).map(({ region, v }) => ({
        label: `${v.ok ? "✓" : "✗"} ${region.name} · 환산 월세 ${man(v.convRent, 0)}`,
        value: pt(v.cut),
      })),
    ] satisfies Line[],
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
function rentMessage(v: Verdict, region: Region) {
  const median = man(v.convRent, 0);
  const score = `내 자취지수 ${pt(v.index)} ${v.ok ? "≥" : "<"} 동네 점수 ${pt(v.cut)}`;
  if (v.rentCap <= 0)
    return `지금 가치관 기준으로는 ${region.name}에서 어떤 월세를 내도 통학보다 손해예요(${score}). 리포트에서 가치관을 다시 살펴보거나 통학을 이어가는 것도 방법이에요.`;
  if (v.rentCap >= v.convRent * 1.5)
    return `${region.name} 환산 월세 중앙값(${median})보다 상한이 훨씬 높아요(${score}). 시세 안에서 넓게 고를 수 있어요.`;
  if (v.ok)
    return `${region.name} 환산 월세 중앙값(${median})이 상한 안에 들어와요(${score}). 이 지역에서 고르면 통학보다 손해가 아니에요.`;
  return `${region.name} 환산 월세 중앙값(${median})이 상한보다 높아요(${score}). 중앙값보다 싼 방을 찾거나 다른 지역도 같이 비교해 보세요.`;
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
  const v = judgeRegion(state, region);
  const cap = man(Math.max(0, v.rentCap));

  return {
    school,
    region,
    isCustom,
    regions: school.regions,
    /** 지도 알약: 동네별 통과 여부 */
    passed: Object.fromEntries(school.regions.map((rg) => [rg.id, judgeRegion(state, rg).ok])),
    title: name ? `${name} 님의 적정 월세 상한` : "나의 적정 월세 상한",
    capText: cap,
    hasCap: true,
    message: rentMessage(v, region),
    breakdown: [
      { label: "되찾는 시간·체력 가치", value: man(v.timeValue + v.bodyValue) },
      { label: "+ 절약 교통비", value: man(v.savedFare) },
      { label: "− 관리비", value: man(v.mgmt) },
      { label: "− 추가 생활비", value: man(v.living) },
      { label: "− 초기 비용 (중개보수 포함, 2년 분할)", value: man(v.initialMonthly) },
      { label: "환산 월세 상한 (보증금 이자 포함)", value: cap, total: true },
    ] satisfies Line[],
    stats: [
      { label: "학교까지", value: `${region.mode === "도보" ? "도보" : isCustom ? "대중교통" : region.mode} ${region.oneWayMin}분`, note: isCustom ? undefined : region.mode === "도보" ? "(거리로 어림)" : "(Google 경로)" },
      { label: "환산 월세 중앙값", value: man(v.convRent, 0), note: isCustom ? "(월세 + 보증금 이자)" : "(실거래가 1년)" },
      { label: "관리비", value: man(v.mgmt, 0), note: isCustom ? undefined : "(가정)" },
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
