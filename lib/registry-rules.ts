/**
 * 등기부등본 사실(lib/registry.ts) → 위험 신호. AI 없이 정해진 규칙으로만 판단함.
 * "안전하다"고 말하지 않고, 확인할 신호만 알려 줌. docs/registry.md
 */
import type { RegistryFacts, RiskKind } from "./registry";

/** 올릴 수 있는 등본 PDF 크기. Vercel 함수 요청 본문 한도(4.5MB)보다 작게 (넘으면 우리 안내 대신 Vercel 오류가 뜸) */
export const REGISTRY_MAX_MB = 4;
export const REGISTRY_MAX_BYTES = REGISTRY_MAX_MB * 1024 * 1024;

/** /api/registry 응답 (화면과 서버가 같이 씀) */
export interface RegistryResult {
  /** text = PDF 글자 위치로 읽음, gemini = Gemini 문서 이해로 읽음, text+gemini = 둘 다 읽어 맞춰 봄 */
  source: "text" | "gemini" | "text+gemini";
  facts: Omit<RegistryFacts, "entries">;
  signals: Signal[];
  laws: Record<string, { label: string; url: string }>; // 신호에 붙은 조문 id → 이름·법제처 링크
  differences: string[] | null; // text+gemini일 때 서로 다른 곳 (빈 배열 = 일치)
  canVerify: boolean; // Gemini 교차 검증(mode=verify)을 이어서 할 수 있음
}

/**
 * 두 방식(PDF 글자 판독 · Gemini 문서 이해)으로 읽은 결과 비교.
 * 위험 신호에 영향을 주는 것만 봄: 소유자·지분, 살아 있는 권리(종류·금액), 살아 있는 갑구 기록
 */
export function compareFacts(a: RegistryFacts, b: RegistryFacts): string[] {
  const diffs: string[] = [];
  const owners = (f: RegistryFacts) => f.owners.map((o) => `${o.name.replace(/\s/g, "")} ${o.share}`).sort().join(", ");
  if (owners(a) !== owners(b)) diffs.push("소유자·지분");
  const rights = (f: RegistryFacts) => new Map(f.rights.filter((r) => !r.cancelled).map((r) => [r.rank, `${r.kind} ${r.amount ?? "?"}`]));
  const ra = rights(a), rb = rights(b);
  for (const rank of new Set([...ra.keys(), ...rb.keys()])) if (ra.get(rank) !== rb.get(rank)) diffs.push(`을구 ${rank}번`);
  const flags = (f: RegistryFacts) => new Map(f.flags.filter((x) => !x.cancelled).map((x) => [x.rank, x.kind]));
  const fa = flags(a), fb = flags(b);
  for (const rank of new Set([...fa.keys(), ...fb.keys()])) if (fa.get(rank) !== fb.get(rank)) diffs.push(`갑구 ${rank}번`);
  return diffs;
}

export type Level = "high" | "caution" | "info";

export interface Signal {
  level: Level;
  title: string;
  detail: string;
  laws: string[]; // data/law-chunks.json의 조문 id (화면에서 조문 링크로)
}

export interface RegistryContext {
  today: string; // YYYY-MM-DD
  deposit: number; // 내 보증금
  price: number | null; // 집 매매 시세 (모르면 null)
  landlord: string | null; // 계약하려는 상대(집주인) 이름
}

/** 근저당 채권최고액 + 내 보증금이 시세의 몇 %를 넘으면 위험으로 볼지 (흔히 쓰는 70% 기준) */
export const DEBT_RATIO_HIGH = 0.7;
export const DEBT_RATIO_CAUTION = 0.6;
const STALE_DAYS = 30; // 이보다 오래된 등본은 다시 떼기
const RECENT_TRANSFER_DAYS = 90;

const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const man = (won: number) => `${Math.round(won / 10_000).toLocaleString("ko-KR")}만 원`;
const sameName = (a: string, b: string) => a.replace(/\s/g, "") === b.replace(/\s/g, "");

const FLAG_TEXT: Record<RiskKind, { level: Level; title: string; detail: string }> = {
  경매: { level: "high", title: "경매가 진행 중이에요", detail: "집이 경매로 넘어가는 중이에요. 계약하면 보증금을 돌려받지 못할 수 있어요. 계약을 멈추고 전문가와 상담하세요." },
  압류: { level: "high", title: "압류가 걸려 있어요", detail: "세금 체납 등으로 집이 압류된 상태예요. 경매로 이어질 수 있어요." },
  가압류: { level: "high", title: "가압류가 걸려 있어요", detail: "집주인의 빚 때문에 채권자가 집을 묶어 둔 상태예요. 경매로 이어질 수 있어요." },
  가처분: { level: "high", title: "가처분이 걸려 있어요", detail: "집의 소유권을 두고 다툼이 있다는 뜻이에요. 소유자가 바뀔 수 있어요." },
  가등기: { level: "high", title: "가등기가 있어요", detail: "다른 사람이 소유권을 넘겨받을 권리를 먼저 잡아 둔 상태예요. 나중에 소유자가 바뀌면 보호받지 못할 수 있어요." },
  신탁: { level: "high", title: "신탁된 집이에요", detail: "소유권이 신탁회사(수탁자)에 있어요. 신탁원부를 떼어 보고, 수탁자 동의 없이 위탁자(원래 집주인)와만 계약하면 보호받지 못할 수 있어요." },
  환매: { level: "caution", title: "환매특약이 있어요", detail: "전 주인이 집을 되살 수 있는 약속이 등기돼 있어요. 소유자가 바뀔 수 있어요." },
  기타: { level: "caution", title: "확인이 필요한 갑구 기록이 있어요", detail: "공인중개사에게 이 기록의 뜻을 물어보세요." },
};

export function checkRegistry(f: RegistryFacts, ctx: RegistryContext): Signal[] {
  const out: Signal[] = [];

  // 1. 갑구: 압류·가처분·신탁 등 (말소되지 않은 것만)
  for (const flag of f.flags.filter((x) => !x.cancelled)) {
    const t = FLAG_TEXT[flag.kind];
    out.push({ ...t, detail: `${t.detail} (갑구 ${flag.rank}번 ${flag.purpose}, ${flag.date})`, laws: ["공인중개사법:제25조"] });
  }

  // 2. 을구: 살아 있는 권리
  const live = f.rights.filter((r) => !r.cancelled);
  for (const r of live.filter((x) => x.kind === "임차권")) {
    out.push({
      level: "high",
      title: "임차권등기가 있어요",
      detail: `이전 세입자가 보증금을 돌려받지 못해 임차권을 등기했을 가능성이 커요. (을구 ${r.rank}번${r.amount ? `, 보증금 ${man(r.amount)}` : ""})`,
      laws: ["주택임대차보호법:제3조의3"],
    });
  }
  for (const r of live.filter((x) => x.kind === "전세권")) {
    out.push({
      level: "caution",
      title: "먼저 등기된 전세권이 있어요",
      detail: `내 보증금보다 먼저 돌려받는 전세금${r.amount ? ` ${man(r.amount)}` : ""}이 있어요. (을구 ${r.rank}번)`,
      laws: ["주택임대차보호법:제3조의2"],
    });
  }

  const mortgages = live.filter((x) => x.kind === "근저당");
  if (mortgages.length) {
    const sum = mortgages.reduce((s, r) => s + (r.amount ?? 0), 0);
    const list = mortgages.map((r) => `${r.rank}번 ${r.amount ? man(r.amount) : "금액 확인 필요"}`).join(", ");
    const base = `근저당 ${mortgages.length}건, 채권최고액 합계 ${man(sum)} (${list}). 근저당은 내 보증금보다 먼저 돌려받아요. 채권최고액은 보통 실제 빌린 돈의 120~130%로 잡혀요.`;
    if (ctx.price && ctx.price > 0) {
      const ratio = (sum + ctx.deposit) / ctx.price;
      const pct = Math.round(ratio * 100);
      const level: Level = ratio >= DEBT_RATIO_HIGH ? "high" : ratio >= DEBT_RATIO_CAUTION ? "caution" : "info";
      out.push({
        level,
        title: level === "high" ? `빚 + 보증금이 집값의 ${pct}%예요` : `근저당이 있어요 (빚 + 보증금 = 집값의 ${pct}%)`,
        detail: `${base} 채권최고액 합계와 내 보증금 ${man(ctx.deposit)}을 더하면 시세 ${man(ctx.price)}의 ${pct}%예요.${level === "high" ? " 집이 경매로 넘어가면 보증금을 다 돌려받지 못할 수 있어요." : ""}`,
        laws: ["주택임대차보호법:제3조의2", "주택임대차보호법:제8조"],
      });
    } else {
      out.push({
        level: "caution",
        title: `근저당이 ${mortgages.length}건 있어요`,
        detail: `${base} 집 시세를 넣으면 빚 + 보증금이 집값의 몇 %인지 계산해 드려요.`,
        laws: ["주택임대차보호법:제3조의2", "주택임대차보호법:제8조"],
      });
    }
  }

  // 3. 소유자
  if (f.owners.length === 0) {
    out.push({ level: "caution", title: "소유자를 읽지 못했어요", detail: "갑구의 소유자를 직접 확인해 주세요.", laws: [] });
  } else {
    const names = f.owners.map((o) => `${o.name}${o.share === "1" ? "" : ` (지분 ${o.share})`}`).join(", ");
    if (ctx.landlord?.trim() && !f.owners.some((o) => sameName(o.name, ctx.landlord!))) {
      out.push({
        level: "high",
        title: "계약 상대가 등본의 소유자와 달라요",
        detail: `등본의 소유자는 ${names}예요. 대리인이라면 소유자의 위임장과 인감증명서를 꼭 확인하고, 보증금은 소유자 명의 계좌로 보내세요.`,
        laws: ["공인중개사법:제25조"],
      });
    }
    if (f.owners.length > 1) {
      out.push({
        level: "caution",
        title: `소유자가 ${f.owners.length}명이에요 (공유)`,
        detail: `${names}. 공유자 전원과 계약하거나, 계약하지 않는 공유자의 위임장·인감증명서를 받아야 해요.`,
        laws: [],
      });
    }
  }
  if (f.lastTransfer?.date && days(ctx.today, f.lastTransfer.date) <= RECENT_TRANSFER_DAYS) {
    out.push({
      level: "caution",
      title: "최근에 소유자가 바뀌었어요",
      detail: `${f.lastTransfer.date}에 ${f.lastTransfer.cause || "소유권 이전"}으로 소유자가 바뀌었어요. 새 집주인이 바로 대출을 받지 않는지 잔금 전에 다시 확인하세요.`,
      laws: [],
    });
  }

  // 4. 등본 자체
  if (f.viewedAt && days(ctx.today, f.viewedAt) > STALE_DAYS) {
    out.push({ level: "caution", title: "오래된 등본이에요", detail: `${f.viewedAt}에 뗀 등본이에요. 계약 직전에 다시 떼어 보세요.`, laws: [] });
  }
  if (!f.includesCancelled) {
    out.push({ level: "info", title: "말소사항이 빠진 등본이에요", detail: "지금 살아 있는 기록만 보여요. 과거 기록까지 보려면 '말소사항 포함'으로 다시 떼어 보세요.", laws: [] });
  }
  const cleared = f.rights.filter((r) => r.cancelled && r.kind === "근저당").length;
  if (cleared) {
    out.push({ level: "info", title: `과거 근저당 ${cleared}건은 모두 말소됐어요`, detail: "말소된 기록은 지금 효력이 없어요.", laws: [] });
  }

  if (!out.some((s) => s.level !== "info")) {
    out.unshift({
      level: "info",
      title: "등본에서 찾은 위험 신호가 없어요",
      detail: "그래도 잔금 전날 등본을 다시 떼어 새로 생긴 기록이 없는지 확인하고, 전입신고와 확정일자를 잔금일에 바로 하세요.",
      laws: ["주택임대차보호법:제3조", "주택임대차보호법:제3조의2"],
    });
  }

  const order: Record<Level, number> = { high: 0, caution: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
