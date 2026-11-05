/**
 * 등기사항전부증명서(등기부등본) → 구조화된 사실. 판단(위험 신호)은 lib/registry-rules.ts
 *
 * 입력은 PDF의 글자 조각(쪽·x·y 좌표 포함). 인터넷등기소 등본은 표 칸 위치가 정해져 있어서
 * x 좌표로 순위번호 · 등기목적 · 접수 · 등기원인 · 권리자 및 기타사항 칸을 나눔.
 * 말소는 PDF에서 빨간 줄로만 그어져 글자로는 안 보이므로, "7번근저당권설정등기말소" 같은 말소 기록으로 판단함.
 * docs/registry.md
 */

export interface TextItem {
  page: number;
  x: number;
  y: number; // PDF 좌표: 위로 갈수록 큼
  str: string;
}

export type Section = "갑" | "을";

/** 등기 기록 한 줄 (순위번호 하나) */
export interface Entry {
  section: Section;
  rank: string; // "10", "10-1"(부기)
  purpose: string; // 등기목적: "근저당권설정", "7번근저당권설정등기말소"
  receipt: string; // 접수: "2004년7월12일 제40083호"
  cause: string; // 등기원인: "2004년7월5일 설정계약"
  details: string[]; // 권리자 및 기타사항 (줄 단위)
  cancelled: boolean; // 말소됨 (말소 기록으로 판단)
}

export type RightKind = "근저당" | "전세권" | "임차권" | "지상권" | "기타";

/** 을구의 권리 (부기로 바뀐 내용까지 반영) */
export interface Right {
  rank: string;
  kind: RightKind;
  purpose: string;
  date: string; // 접수일
  amount: number | null; // 채권최고액 / 전세금 / 임차보증금
  holder: string | null; // 근저당권자 / 전세권자 / 임차권자
  cancelled: boolean;
}

export type RiskKind = "가압류" | "압류" | "가처분" | "경매" | "가등기" | "신탁" | "환매" | "기타";

/** 갑구의 소유권 외 기록 (압류·가처분·신탁 등) */
export interface OwnershipFlag {
  rank: string;
  kind: RiskKind;
  purpose: string;
  date: string;
  holder: string | null;
  cancelled: boolean;
}

export interface Owner {
  name: string;
  share: string; // "1/2", 단독이면 "1"
}

export interface RegistryFacts {
  title: string; // "등기사항전부증명서(말소사항 포함)"
  propertyType: string; // 집합건물 / 건물 / 토지
  address: string;
  viewedAt: string | null; // "2026-11-04"
  includesCancelled: boolean;
  owners: Owner[];
  lastTransfer: { date: string; cause: string } | null; // 마지막 소유권 변동
  rights: Right[];
  flags: OwnershipFlag[];
  entries: Entry[];
}

// ── 금액 ─────────────────────────────

const DIGIT: Record<string, number> = { 영: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const SMALL: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };
const BIG: Record<string, number> = { 만: 1e4, 억: 1e8, 조: 1e12 };

/** "금480,000,000원" / "금칠억팔천만원정" / "금3억5천만원" → 원. 못 읽으면 null */
export function parseWon(s: string): number | null {
  const t = s.replace(/[\s,]/g, "").replace(/^금/, "").replace(/원정?$/, "");
  if (/^\d+$/.test(t)) return Number(t);
  if (!/^[0-9영일이삼사오육칠팔구십백천만억조]+$/.test(t)) return null;
  let total = 0, section = 0, num = 0, numStr = "";
  const flushNum = () => {
    if (!numStr) return;
    num = Number(numStr);
    numStr = "";
  };
  for (const ch of t) {
    if (/\d/.test(ch)) numStr += ch;
    else if (ch in DIGIT) num = DIGIT[ch];
    else if (ch in SMALL) {
      flushNum();
      section += (num || 1) * SMALL[ch];
      num = 0;
    } else if (ch in BIG) {
      flushNum();
      total += (section + num || 1) * BIG[ch];
      section = 0;
      num = 0;
    }
  }
  flushNum();
  return total + section + num;
}

// ── 지분 (분수) ─────────────────────────────

type Frac = [number, number];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const norm = ([n, d]: Frac): Frac => {
  const g = gcd(Math.abs(n), Math.abs(d)) || 1;
  return [n / g, d / g];
};
const add = (a: Frac, b: Frac): Frac => norm([a[0] * b[1] + b[0] * a[1], a[1] * b[1]]);
const sub = (a: Frac, b: Frac): Frac => norm([a[0] * b[1] - b[0] * a[1], a[1] * b[1]]);
const fracText = ([n, d]: Frac) => (d === 1 ? String(n) : `${n}/${d}`);

// ── 글자 조각 → 기록 ─────────────────────────────

/** 표 칸 경계 (인터넷등기소 등본 기준, pt) */
const COL = { rank: 75, purpose: 175, receipt: 255, cause: 340 };
const HEADER_WORDS = new Set(["순위번호", "등 기 목 적", "접", "수", "접 수", "등 기 원 인", "권리자 및 기타사항"]);
const isWatermark = (s: string) => /^열\s*람\s*용$/.test(s.trim());
const DATE = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
const isoDate = (s: string) => {
  const m = DATE.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
};

/** 같은 줄(y가 거의 같은) 조각끼리 묶어 x 순서로 이음 */
function lines(items: TextItem[]): string[] {
  const rows: TextItem[][] = [];
  for (const it of items) {
    const row = rows.find((r) => r[0].page === it.page && Math.abs(r[0].y - it.y) < 3);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join(" ").trim()).filter(Boolean);
}

export function parseEntries(all: TextItem[]): { entries: Entry[]; title: string; propertyType: string; address: string; viewedAt: string | null } {
  const items = all
    .filter((i) => i.str.trim() && !isWatermark(i.str))
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  const first = items.filter((i) => i.page === 1);
  const title = first.find((i) => /등기사항.*증명서/.test(i.str))?.str.trim() ?? "";
  const propertyType = first.find((i) => /^-\s*\S+\s*-$/.test(i.str.trim()))?.str.replace(/[-\s]/g, "") ?? "";
  const addressItem = items.find((i) => /^\[(집합건물|건물|토지)\]/.test(i.str.trim()));
  const address = addressItem?.str.replace(/^\[[^\]]+\]\s*/, "").trim() ?? "";
  const viewed = items.find((i) => /열람일시/.test(i.str));
  const viewedAt = viewed ? isoDate(viewed.str) || null : null;

  const entries: Entry[] = [];
  type Draft = { entry: Entry; purpose: TextItem[]; receipt: TextItem[]; cause: TextItem[]; details: TextItem[] };
  let section: Section | null = null;
  let cur: Draft | null = null;
  const close = () => {
    if (!cur) return;
    const join = (xs: TextItem[], sep: string) => lines(xs).join(sep).replace(/\s+/g, sep === "" ? "" : " ").trim();
    cur.entry.purpose = join(cur.purpose, "");
    cur.entry.receipt = join(cur.receipt, " ");
    cur.entry.cause = join(cur.cause, " ");
    cur.entry.details = lines(cur.details);
    entries.push(cur.entry);
    cur = null;
  };

  for (const it of items) {
    const s = it.str.trim();
    // 머리글·바닥글 (주소 줄, 열람일시, 쪽 번호)
    if (it.y > 745 || it.y < 60) continue;
    const next: Section | null | undefined = /소유권에\s*관한\s*사항/.test(s)
      ? "갑"
      : /소유권\s*이외의\s*권리에\s*관한\s*사항/.test(s)
        ? "을"
        : (/전유부분의 건물의 표시|1동의 건물의 표시|대지권/.test(s) && it.x > 150) || /이\s*하\s*여\s*백/.test(s)
          ? null
          : undefined;
    if (next !== undefined) {
      close();
      section = next;
    }
    if (!section || HEADER_WORDS.has(s) || /^【|^】$|^[갑을구]$/.test(s) || /에 관한 사항/.test(s)) continue;

    if (it.x < COL.rank) {
      if (/^\d+(-\d+)?$/.test(s)) {
        close();
        cur = { entry: { section, rank: s, purpose: "", receipt: "", cause: "", details: [], cancelled: false }, purpose: [], receipt: [], cause: [], details: [] };
      }
      continue; // "(전 3)" 같은 옛 번호
    }
    if (!cur) continue;
    if (it.x < COL.purpose) cur.purpose.push(it);
    else if (it.x < COL.receipt) cur.receipt.push(it);
    else if (it.x < COL.cause) cur.cause.push(it);
    else cur.details.push(it);
  }
  close();

  markCancelled(entries);
  return { entries, title, propertyType, address, viewedAt };
}

/** "7번근저당권설정등기말소" → 7번(과 그 부기 7-1, 7-2…)을 말소로 표시 */
function markCancelled(entries: Entry[]) {
  for (const e of entries) {
    const m = /^(\d+(?:-\d+)?)번.*말소$/.exec(e.purpose);
    if (!m) continue;
    const target = m[1];
    for (const t of entries) {
      if (t.section !== e.section) continue;
      if (t.rank === target || (!target.includes("-") && t.rank.startsWith(`${target}-`))) t.cancelled = true;
    }
  }
}

// ── 기록 → 현재 상태 ─────────────────────────────

const LABEL = /^(소유자|공유자|수탁자|위탁자|권리자|근저당권자|전세권자|임차권자|지상권자|채권자|가등기권자|채무자)\s*/;
/** 이름 + 주민·법인등록번호 (뒷자리 가림 포함) */
const HOLDER = /^(.+?)\s+\d{6}-[\d*]{7}/;

function holdersWithShares(details: string[]): { name: string; share: Frac | null }[] {
  const out: { name: string; share: Frac | null }[] = [];
  let pending: Frac | null = null;
  for (const raw of details) {
    const line = raw.replace(LABEL, "");
    const share = /지분\s*(\d+)\s*분의\s*(\d+)/.exec(line);
    if (share) {
      pending = norm([Number(share[2]), Number(share[1])]);
      continue;
    }
    const h = HOLDER.exec(line);
    if (h) {
      out.push({ name: h[1].replace(LABEL, "").trim(), share: pending });
      pending = null;
    }
  }
  return out;
}

/** 권리자 칸에서 "근저당권자 ○○은행 110111-…" 같은 줄의 이름 */
function holderOf(details: string[], label: RegExp): string | null {
  for (const line of details) {
    if (!label.test(line)) continue;
    const rest = line.replace(label, "").trim();
    return (HOLDER.exec(rest)?.[1] ?? rest).trim() || null;
  }
  return null;
}

function amountOf(details: string[]): number | null {
  for (const line of details) {
    const m = /(채권최고액|전세금|임차보증금|보증금)\s*(금\s*[0-9,영일이삼사오육칠팔구십백천만억조]+\s*원정?)/.exec(line);
    if (m) return parseWon(m[2]);
  }
  return null;
}

const rightKind = (purpose: string): RightKind =>
  /근저당/.test(purpose) ? "근저당" : /전세권/.test(purpose) ? "전세권" : /임차권/.test(purpose) ? "임차권" : /지상권/.test(purpose) ? "지상권" : "기타";

const riskKind = (purpose: string, cause: string): RiskKind | null => {
  if (/가압류/.test(purpose)) return "가압류";
  if (/압류/.test(purpose)) return "압류";
  if (/가처분/.test(purpose)) return "가처분";
  if (/경매/.test(purpose)) return "경매";
  if (/가등기/.test(purpose)) return "가등기";
  if (/신탁/.test(purpose) || /신탁/.test(cause)) return "신탁";
  if (/환매/.test(purpose)) return "환매";
  return null;
};

export function toFacts(parsed: ReturnType<typeof parseEntries>): RegistryFacts {
  const { entries } = parsed;
  const live = (e: Entry) => !e.cancelled && !/말소$/.test(e.purpose);

  // 소유자: 소유권 보존·이전으로 새로 정하고, 지분 이전으로 넘겨줌
  let owners = new Map<string, Frac>();
  let lastTransfer: RegistryFacts["lastTransfer"] = null;
  for (const e of entries.filter((x) => x.section === "갑" && live(x))) {
    const holders = holdersWithShares(e.details);
    const whole = /^소유권(보존|이전)$/.test(e.purpose) || /공유자전원지분전부이전/.test(e.purpose);
    const part = /^(\d+)번(.+?)지분(전부|일부)?이전$/.exec(e.purpose);
    if (!whole && !part) continue;
    if (whole) {
      owners = new Map();
      const even: Frac = [1, Math.max(1, holders.length)];
      for (const h of holders) owners.set(h.name, add(owners.get(h.name) ?? [0, 1], h.share ?? even));
    } else if (part) {
      const from = part[2];
      const given = holders.reduce<Frac>((s, h) => add(s, h.share ?? [0, 1]), [0, 1]);
      if (part[3] === "전부" || !owners.has(from)) owners.delete(from);
      else owners.set(from, sub(owners.get(from)!, given));
      for (const h of holders) if (h.share) owners.set(h.name, add(owners.get(h.name) ?? [0, 1], h.share));
    }
    lastTransfer = { date: isoDate(e.receipt), cause: e.cause.replace(DATE, "").trim() };
  }

  // 을구 권리: 설정 기록 + 그 부기(변경·이전)로 금액·권리자 갱신
  const rights: Right[] = [];
  for (const e of entries.filter((x) => x.section === "을")) {
    if (/말소$/.test(e.purpose)) continue;
    const parent = /^(\d+)-\d+$/.exec(e.rank)?.[1];
    if (parent) {
      const r = rights.find((x) => x.rank === parent);
      if (!r) continue;
      if (/변경/.test(e.purpose)) r.amount = amountOf(e.details) ?? r.amount;
      if (/이전/.test(e.purpose)) r.holder = holderOf(e.details, /^(근저당권자|전세권자|임차권자)\s*/) ?? r.holder;
      continue;
    }
    rights.push({
      rank: e.rank,
      kind: rightKind(e.purpose),
      purpose: e.purpose,
      date: isoDate(e.receipt),
      amount: amountOf(e.details),
      holder: holderOf(e.details, /^(근저당권자|전세권자|임차권자|지상권자|권리자)\s*/),
      cancelled: e.cancelled,
    });
  }

  const flags: OwnershipFlag[] = entries
    .filter((e) => e.section === "갑" && !/말소$/.test(e.purpose))
    .flatMap((e) => {
      const kind = riskKind(e.purpose, e.cause);
      if (!kind) return [];
      return [{ rank: e.rank, kind, purpose: e.purpose, date: isoDate(e.receipt), holder: holderOf(e.details, LABEL), cancelled: e.cancelled }];
    });

  return {
    title: parsed.title,
    propertyType: parsed.propertyType,
    address: parsed.address,
    viewedAt: parsed.viewedAt,
    includesCancelled: /말소사항\s*포함/.test(parsed.title),
    owners: [...owners.entries()].filter(([, f]) => f[0] > 0).map(([name, f]) => ({ name, share: fracText(f) })),
    lastTransfer,
    rights,
    flags,
    entries,
  };
}

export const parseRegistry = (items: TextItem[]) => toFacts(parseEntries(items));
