// 국토교통부 전월세 실거래가 수집 → 동별 학생 원룸 시세 집계
// 대상: 단독/다가구 + 연립/다세대 (오피스텔은 시세 구조가 달라 제외)
//
// 실행: node --env-file=.env.local scripts/collect-rent.mts [옵션]
//   --type sh          수집할 유형: sh = 단독/다가구(기본), rh = 연립/다세대. API마다 공공데이터포털 활용 신청 필요
//   --from YYYYMM      시작 계약 연월 (기본: 최근 12개월의 첫 달)
//   --to YYYYMM        끝 계약 연월   (기본: 지난달)
//   --gu 11290,11230   시군구 코드 목록 (기본: 서울 25개 구)
//   --refresh 2        최근 N개월은 저장본이 있어도 다시 받음 (늦게 신고된 거래 반영, 기본 2)
//   --aggregate-only   API 호출 없이 저장된 정리본으로 집계만 다시 함
//
// 집계 기준 (확정, FILTER): 월세 거래 · 보증금 5,000만 원 이하 · 월세 100만 원 이하
//   · 면적 14㎡(최저주거기준) 이상 ~ 40㎡ 이하 · 반지하 제외(층 정보가 있을 때 층 ≥ 1)
//   시세 = 환산 월세 = 월세 + 보증금 × 3.5% ÷ 12
//
// 저장 (<type> = sh | rh)
//   data/raw/<type>-rent/<시군구>-<연월>-p<페이지>.xml.gz   원본 (git 제외)
//   data/rows/<type>-rent-<연월>.jsonl                      정리본, 한 줄에 거래 1건 (git 제외)
//   data/rent-by-dong.json                                  두 유형 합산 동별 집계 (앱에서 사용)

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";

// 유형별 API와 면적·건물명 필드 (단독/다가구는 계약면적, 나머지는 전용면적)
const TYPES = {
  sh: { label: "단독/다가구", service: "RTMSDataSvcSHRent", area: "totalFloorAr", name: "houseType" },
  rh: { label: "연립/다세대", service: "RTMSDataSvcRHRent", area: "excluUseAr", name: "mhouseNm" },
} as const;

// 확정 집계 기준
export const FILTER = {
  maxDeposit: 5000, // 만 원
  maxRent: 100, // 만 원
  minArea: 14, // ㎡, 1인 가구 최저주거기준
  maxArea: 40, // ㎡, 원룸 범위 상한
  excludeBasement: true, // 층 정보가 있는 연립/다세대만 적용 (단독/다가구는 층 정보 없음)
  depositRate: 0.035, // 환산 월세용 연이율
};
const PAGE_SIZE = 1000;
const KEY = process.env.DATA_GO_KR_KEY;
if (!KEY) throw new Error("DATA_GO_KR_KEY가 없어요. --env-file=.env.local 로 실행하세요.");

export const SEOUL_GU: Record<string, string> = {
  "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구", "11215": "광진구",
  "11230": "동대문구", "11260": "중랑구", "11290": "성북구", "11305": "강북구", "11320": "도봉구",
  "11350": "노원구", "11380": "은평구", "11410": "서대문구", "11440": "마포구", "11470": "양천구",
  "11500": "강서구", "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
  "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구", "11740": "강동구",
};

// ── 옵션 ──
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const type = (arg("type") ?? "sh") as keyof typeof TYPES;
if (!(type in TYPES)) throw new Error(`--type 은 ${Object.keys(TYPES).join(" | ")} 중 하나예요.`);
const T = TYPES[type];
const ENDPOINT = `https://apis.data.go.kr/1613000/${T.service}/get${T.service}`;
const RAW_DIR = `data/raw/${type}-rent`;
const ym = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
const now = new Date();
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const from = arg("from") ?? ym(new Date(lastMonth.getFullYear(), lastMonth.getMonth() - 11, 1));
const to = arg("to") ?? ym(lastMonth);
const guList = (arg("gu") ?? Object.keys(SEOUL_GU).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const refreshMonths = Number(arg("refresh") ?? 2);
const aggregateOnly = process.argv.includes("--aggregate-only");

function monthsBetween(a: string, b: string) {
  const out: string[] = [];
  let y = Number(a.slice(0, 4)), m = Number(a.slice(4));
  const endKey = Number(b);
  while (y * 100 + m <= endKey) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}
const months = monthsBetween(from, to);
// slice(-0)은 "전부"가 되므로 0이면 빈 집합
const refreshSet = new Set(refreshMonths > 0 ? months.slice(-refreshMonths) : []);

// ── 수집 (페이지 넘김, 원본 압축 저장, 이어받기) ──
let calls = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(lawd: string, month: string, page: number): Promise<string> {
  const gz = `${RAW_DIR}/${lawd}-${month}-p${page}.xml.gz`;
  const legacy = `${RAW_DIR}/${lawd}-${month}${page > 1 ? `-p${page}` : ""}.xml`; // 데모 스크립트가 남긴 파일
  if (!refreshSet.has(month)) {
    if (existsSync(gz)) return gunzipSync(await readFile(gz)).toString("utf8");
    if (existsSync(legacy)) return readFile(legacy, "utf8");
  }
  const params = new URLSearchParams({ serviceKey: KEY!, LAWD_CD: lawd, DEAL_YMD: month, pageNo: String(page), numOfRows: String(PAGE_SIZE) });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(30_000) });
      const xml = await res.text();
      calls++;
      const code = xml.match(/<resultCode>(.*?)<\/resultCode>/)?.[1];
      if (code === "22") throw Object.assign(new Error("일일 호출 한도 초과(코드 22). 내일 다시 실행하면 받은 곳부터 이어서 받아요."), { fatal: true });
      if (!res.ok || code !== "000") throw new Error(`HTTP ${res.status}, resultCode=${code}`);
      await mkdir(RAW_DIR, { recursive: true });
      await writeFile(gz, gzipSync(xml));
      await sleep(150); // 서버 부담 줄이기
      return xml;
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal || attempt >= 3) throw new Error(`${lawd} ${month} p${page}: ${(e as Error).message}`);
      await sleep(1000 * attempt);
    }
  }
}

export interface Row {
  type: string; sgg: string; gu: string; dong: string; dongBase: string; houseType: string; name: string;
  ym: string; day: number; deposit: number; rent: number; area: number; floor: number | null; buildYear: number;
  contractType: string; contractTerm: string;
}
const num = (s?: string) => Number((s ?? "").replace(/,/g, "")) || 0;
function parseRows(xml: string, lawd: string, month: string): Row[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => {
    const t = (n: string) => b.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1]?.trim() ?? "";
    const dong = t("umdNm");
    const floor = t("floor");
    return {
      type, sgg: lawd, gu: SEOUL_GU[lawd] ?? lawd, dong, dongBase: dong.replace(/\d+가$/, ""),
      houseType: t("houseType") || T.label, name: t(T.name),
      ym: month, day: num(t("dealDay")), deposit: num(t("deposit")), rent: num(t("monthlyRent")),
      area: num(t(T.area)), floor: floor === "" ? null : Number(floor), // 단독/다가구는 층 정보 없음. 지하는 음수
      buildYear: num(t("buildYear")), contractType: t("contractType"), contractTerm: t("contractTerm"),
    };
  });
}

async function collectMonth(lawd: string, month: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const xml = await fetchPage(lawd, month, page);
    rows.push(...parseRows(xml, lawd, month));
    const total = Number(xml.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? 0);
    if (page * PAGE_SIZE >= total) return rows;
  }
}

// ── 집계 ──
const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)) * 10) / 10;
};
const stats = (vals: number[]) => {
  const s = [...vals].sort((a, b) => a - b);
  return { p25: quantile(s, 0.25), median: quantile(s, 0.5), p75: quantile(s, 0.75) };
};

// ── 1) 수집 (--aggregate-only 면 건너뜀) ──
let stopped: string | null = null;
if (!aggregateOnly) {
  console.log(`수집: ${T.label} 전월세 · ${from} ~ ${to} (${months.length}개월) · 시군구 ${guList.length}개 · 최근 ${refreshSet.size}개월은 새로 받음`);
  await mkdir("data/rows", { recursive: true });
  outer: for (const month of months) {
    const monthRows: Row[] = [];
    for (const lawd of guList) {
      try {
        monthRows.push(...(await collectMonth(lawd, month)));
      } catch (e) {
        stopped = (e as Error).message;
        break outer;
      }
    }
    await writeFile(`data/rows/${type}-rent-${month}.jsonl`, monthRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    console.log(`  ${month}: ${monthRows.length}건`);
  }
  console.log(`API 호출 ${calls}회`);
}

// ── 2) 집계: 저장된 두 유형 정리본을 합쳐 확정 기준으로 동별 시세 ──
const all: Row[] = [];
const present: string[] = [];
for (const t of Object.keys(TYPES) as (keyof typeof TYPES)[]) {
  let found = 0;
  for (const month of months) {
    const f = `data/rows/${t}-rent-${month}.jsonl`;
    if (!existsSync(f)) continue;
    found++;
    for (const line of (await readFile(f, "utf8")).split("\n")) if (line.trim()) all.push({ type: t, ...JSON.parse(line) });
  }
  if (found) present.push(`${TYPES[t].label} ${found}개월`);
}

const conv = (r: Row) => r.rent + (r.deposit * FILTER.depositRate) / 12;
const passes = (r: Row) =>
  r.rent > 0 &&
  r.deposit <= FILTER.maxDeposit &&
  r.rent <= FILTER.maxRent &&
  r.area >= FILTER.minArea &&
  r.area <= FILTER.maxArea &&
  !(FILTER.excludeBasement && r.floor != null && r.floor < 1);
const used = all.filter(passes);

const groups = new Map<string, Row[]>();
for (const r of used) {
  const k = `${r.sgg}|${r.dongBase}`;
  groups.set(k, [...(groups.get(k) ?? []), r]);
}
const dongs = [...groups]
  .map(([k, rows]) => {
    const [sgg, dong] = k.split("|");
    return {
      sgg, gu: SEOUL_GU[sgg] ?? sgg, dong,
      legalDongs: [...new Set(rows.map((r) => r.dong))].sort(),
      count: rows.length, // 집계에 쓴 거래 수
      byType: Object.fromEntries((Object.keys(TYPES) as (keyof typeof TYPES)[]).map((t) => [t, rows.filter((r) => r.type === t).length])),
      convRent: stats(rows.map(conv)), // 환산 월세 (만 원/월) ← 시세 기준값
      rent: stats(rows.map((r) => r.rent)), // 월세 (만 원/월)
      deposit: stats(rows.map((r) => r.deposit)), // 보증금 (만 원)
      area: stats(rows.map((r) => r.area)), // ㎡
      lowSample: rows.length < 100, // 1년 100건 미만은 참고용
    };
  })
  .sort((a, b) => a.sgg.localeCompare(b.sgg) || a.dong.localeCompare(b.dong, "ko"));

const output = {
  meta: {
    source: "국토교통부 단독/다가구·연립/다세대 전월세 실거래가 (공공데이터포털)",
    period: { from, to, months: months.length },
    included: present,
    filter: FILTER,
    units: { convRent: "만 원/월 (월세 + 보증금 × 연이율 ÷ 12)", rent: "만 원/월", deposit: "만 원", area: "㎡" },
    totals: { rows: all.length, used: used.length, dongs: dongs.length },
    generatedAt: new Date().toISOString(),
    complete: stopped === null,
  },
  dongs,
};
await writeFile("data/rent-by-dong.json", JSON.stringify(output, null, 1));

console.log(`집계: ${present.join(" · ")} · 전체 ${all.length.toLocaleString()}건 → 기준 통과 ${used.length.toLocaleString()}건 · 동 ${dongs.length}개`);
console.log(`  기준: 보증금 ≤ ${FILTER.maxDeposit} · 월세 ≤ ${FILTER.maxRent} · ${FILTER.minArea}㎡ ≤ 면적 ≤ ${FILTER.maxArea}㎡ · 반지하 제외 · 환산 연이율 ${(FILTER.depositRate * 100).toFixed(1)}%`);
console.log("결과: data/rent-by-dong.json");
if (stopped) {
  console.error(`⚠ 중간에 멈춤: ${stopped}`);
  process.exitCode = 1;
}
