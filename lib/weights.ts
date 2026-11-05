import { NEUTRAL, clampAdj, type Adjust } from "./calc";

/** 가치관 분석 결과: 0 = 보통 대학생 수준, −3 ~ +3 조정값 */
export interface WeightAnalysis extends Adjust {
  reason: string;
  source: "gemini" | "keyword" | "default";
}

// ── LLM few-shot 예시 ─────────────────────────────
// 0을 기준으로, 글에 근거가 있을 때만 ± 를 준다. 앱의 칩 문장(GOAL_TAGS)과 자유 서술을 섞어서 골랐어요.
export const FEW_SHOT: { goal: string; out: Omit<WeightAnalysis, "source"> }[] = [
  {
    goal: "학점 관리를 제대로 하고 싶어요. 동아리·대외활동을 하고 싶어요. 부모님께 부담을 덜 드리고 싶어요.",
    out: { money: 1, time: 2, body: 0, reason: "“학점 관리”, “동아리·대외활동” → 시간 +2, “부모님께 부담” → 돈 +1" },
  },
  {
    goal: "통학 때문에 너무 피곤해요. 지하철에서 서서 가다 보면 1교시에 졸아요.",
    out: { money: 0, time: 1, body: 3, reason: "“너무 피곤”, “서서 가다 보면 졸아요” → 체력 +3, “1교시” → 시간 +1" },
  },
  {
    goal: "생활비를 최대한 아끼고 싶어요. 용돈이 빠듯해서 월세가 제일 걱정이에요.",
    out: { money: 3, time: 0, body: 0, reason: "“최대한 아끼고”, “용돈이 빠듯”, “월세가 제일 걱정” → 돈 +3" },
  },
  {
    goal: "부모님이 월세는 지원해 주신다고 했어요. 대신 취업 준비랑 인턴에 집중하고 싶어요.",
    out: { money: -2, time: 3, body: 0, reason: "“월세는 지원해 주신다” → 돈 −2, “취업 준비”, “인턴에 집중” → 시간 +3" },
  },
  {
    goal: "알바를 병행해야 해요. 체력은 좋은 편이라 통학 자체는 괜찮아요.",
    out: { money: 1, time: 1, body: -2, reason: "“알바 병행” → 돈 +1·시간 +1, “체력은 좋은 편”, “통학은 괜찮아요” → 체력 −2" },
  },
  {
    goal: "그냥 대학생활 즐겁게 하고 싶어요.",
    out: { money: 0, time: 0, body: 0, reason: "뚜렷한 우선순위가 없어 모두 보통(0)으로 두었어요." },
  },
];

// ── Gemini를 못 쓸 때(키 없음·실패) 쓰는 키워드 기반 대체 분석 ──
const PLUS: Record<keyof Adjust, string[]> = {
  money: ["돈", "부모", "부담", "아끼", "절약", "용돈", "비용", "저축", "생활비", "빚", "대출", "월세", "빠듯"],
  time: ["공부", "학점", "시험", "동아리", "시간", "알바", "취업", "인턴", "준비", "자격증", "프로젝트", "대외활동", "자기계발"],
  body: ["체력", "피곤", "피로", "힘들", "휴식", "잠", "수면", "건강", "지치", "운동", "멀미", "녹초", "졸"],
};
/** "덜 중요하다"는 신호. 하나에 −3 (같은 문장의 "월세" 같은 + 단어를 넘어서도록) */
const MINUS: Record<keyof Adjust, string[]> = {
  money: ["지원해 주", "지원받", "내주신", "돈은 괜찮", "돈 걱정 없", "여유가 있"],
  time: ["시간은 많", "시간 여유", "널널", "공강이 많"],
  body: ["체력은 괜찮", "체력은 좋", "체력이 좋", "안 피곤", "통학은 괜찮", "통학 자체는 괜찮"],
};
const LABEL: Record<keyof Adjust, string> = { money: "돈", time: "시간", body: "체력" };
const KEYS = Object.keys(LABEL) as (keyof Adjust)[];

export function keywordWeights(goal: string): WeightAnalysis {
  const text = goal.trim();
  if (!text) return { ...NEUTRAL, reason: "생활 목표가 비어 있어 모두 보통(0)으로 두었어요.", source: "default" };

  const parts: string[] = [];
  const out = { ...NEUTRAL };
  for (const k of KEYS) {
    const minus = MINUS[k].filter((w) => text.includes(w));
    // "체력은 괜찮" 안의 "체력"처럼 부정 구절에 들어 있는 단어는 + 로 세지 않음
    const plus = PLUS[k].filter((w) => text.includes(w) && !minus.some((m) => m.includes(w)));
    out[k] = clampAdj(plus.length - 3 * minus.length);
    const words = [...plus, ...minus].map((h) => `“${h}”`).join(", ");
    if (out[k] !== 0) parts.push(`${words} → ${LABEL[k]} ${out[k] > 0 ? "+" : "−"}${Math.abs(out[k])}`);
  }
  if (!parts.length) return { ...NEUTRAL, reason: "뚜렷한 우선순위를 찾지 못해 모두 보통(0)으로 두었어요.", source: "default" };
  return { ...out, reason: `키워드 분석: ${parts.join(", ")}`, source: "keyword" };
}
