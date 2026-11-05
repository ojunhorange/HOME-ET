// 학교별로 직선거리가 가장 가까운 법정동 N개를 골라 단독/다가구 월세 시세를 표로 보는 데모
// 실행: node --env-file=.env.local scripts/rent-nearest-demo.mts [DEAL_YMD] [N]   (기본 202609, 5)
//
// 1) 서울 25개 구 중심을 지오코딩 → 학교에서 GU_RADIUS_KM 안의 구만 후보
// 2) 후보 구의 실거래가(DEAL_YMD) 수집 (페이지 넘김 포함) → 법정동 목록 ("○○동N가"는 하나로 합침)
// 3) 동 이름 지오코딩 → 학교와 거리순 N개
// 캐시: data/raw/sh-rent/*.xml (실거래가 원본), data/geo-cache.json (지오코딩 결과)

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const dealYmd = process.argv[2] ?? "202609";
const N = Number(process.argv[3] ?? 5);
const GU_RADIUS_KM = 6;

const RENT_ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent";
const DATA_KEY = process.env.DATA_GO_KR_KEY;
const GEO_KEY = process.env.GOOGLE_MAPS_SERVER_KEY;
if (!DATA_KEY || !GEO_KEY) throw new Error("DATA_GO_KR_KEY, GOOGLE_MAPS_SERVER_KEY가 필요해요. --env-file=.env.local 로 실행하세요.");

const SEOUL_GU: Record<string, string> = {
  "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구", "11215": "광진구",
  "11230": "동대문구", "11260": "중랑구", "11290": "성북구", "11305": "강북구", "11320": "도봉구",
  "11350": "노원구", "11380": "은평구", "11410": "서대문구", "11440": "마포구", "11470": "양천구",
  "11500": "강서구", "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
  "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구", "11740": "강동구",
};

// lib/data.ts 의 데모 학교 좌표
const SCHOOLS = [
  { name: "고려대학교", lat: 37.5894, lng: 127.0322 },
  { name: "연세대학교", lat: 37.5658, lng: 126.9386 },
  { name: "서울대학교", lat: 37.4599, lng: 126.9519 },
  { name: "한양대학교", lat: 37.5572, lng: 127.0453 },
  { name: "건국대학교", lat: 37.5408, lng: 127.0793 },
  { name: "경희대학교", lat: 37.5964, lng: 127.0525 },
];

type LatLng = { lat: number; lng: number };
const km = (a: LatLng, b: LatLng) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ── 지오코딩 (캐시) ──
const GEO_CACHE = "data/geo-cache.json";
const geoCache: Record<string, (LatLng & { address: string }) | null> = existsSync(GEO_CACHE) ? JSON.parse(await readFile(GEO_CACHE, "utf8")) : {};
let geoCalls = 0;
async function geocode(address: string) {
  if (address in geoCache) return geoCache[address];
  const q = new URLSearchParams({ address, language: "ko", region: "kr", key: GEO_KEY! });
  const j = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${q}`)).json();
  geoCalls++;
  if (j.status !== "OK" && j.status !== "ZERO_RESULTS") throw new Error(`Geocoding ${j.status}: ${j.error_message ?? address}`);
  const r = j.results?.[0];
  geoCache[address] = r ? { ...r.geometry.location, address: r.formatted_address } : null;
  return geoCache[address];
}

// ── 실거래가 (페이지 넘김 + 캐시) ──
let rentCalls = 0;
async function rentXmlPages(lawd: string): Promise<string[]> {
  const pages: string[] = [];
  for (let page = 1; ; page++) {
    const file = `data/raw/sh-rent/${lawd}-${dealYmd}${page > 1 ? `-p${page}` : ""}.xml`;
    let xml: string;
    if (existsSync(file)) xml = await readFile(file, "utf8");
    else {
      const params = new URLSearchParams({ serviceKey: DATA_KEY!, LAWD_CD: lawd, DEAL_YMD: dealYmd, pageNo: String(page), numOfRows: "1000" });
      const res = await fetch(`${RENT_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(20_000) });
      xml = await res.text();
      rentCalls++;
      const code = xml.match(/<resultCode>(.*?)<\/resultCode>/)?.[1];
      if (!res.ok || code !== "000") throw new Error(`${lawd} p${page}: HTTP ${res.status}, resultCode=${code}`);
      await mkdir("data/raw/sh-rent", { recursive: true });
      await writeFile(file, xml);
    }
    pages.push(xml);
    const total = Number(xml.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? 0);
    if (page * 1000 >= total) return pages;
  }
}

type Deal = { gu: string; dong: string; base: string; deposit: number; rent: number; area: number };
const num = (s?: string) => Number((s ?? "").replace(/,/g, "")) || 0;
const parse = (xml: string, gu: string): Deal[] =>
  [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => {
    const t = (n: string) => b.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1]?.trim();
    const dong = t("umdNm") ?? "";
    return { gu, dong, base: dong.replace(/\d+가$/, ""), deposit: num(t("deposit")), rent: num(t("monthlyRent")), area: num(t("totalFloorAr")) };
  });
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// 1) 학교 근처 구 고르기
const guCenter = new Map<string, LatLng>();
for (const [code, gu] of Object.entries(SEOUL_GU)) {
  const g = await geocode(`서울특별시 ${gu}`);
  if (g) guCenter.set(code, g);
}
const nearGu = new Set<string>();
for (const s of SCHOOLS) for (const [code, c] of guCenter) if (km(s, c) <= GU_RADIUS_KM) nearGu.add(code);

// 2) 후보 구 실거래가 → 동 목록
const deals: Deal[] = [];
for (const code of nearGu) for (const xml of await rentXmlPages(code)) deals.push(...parse(xml, SEOUL_GU[code]));
const dongKeys = [...new Set(deals.map((d) => `${d.gu}|${d.base}`))];

// 3) 동 좌표
const dongPos = new Map<string, LatLng & { address: string }>();
for (const k of dongKeys) {
  const [gu, base] = k.split("|");
  const g = await geocode(`서울특별시 ${gu} ${base}`);
  if (g) dongPos.set(k, g);
}
await mkdir("data", { recursive: true });
await writeFile(GEO_CACHE, JSON.stringify(geoCache, null, 1));

// 4) 학교별 최근접 N개 동
const out: Record<string, unknown[]> = {};
for (const s of SCHOOLS) {
  const ranked = [...dongPos].map(([k, p]) => ({ k, p, d: km(s, p) })).sort((a, b) => a.d - b.d).slice(0, N);
  out[s.name] = ranked.map(({ k, p, d }) => {
    const [gu, base] = k.split("|");
    const hit = deals.filter((x) => x.gu === gu && x.base === base);
    const monthly = hit.filter((x) => x.rent > 0);
    return {
      dong: base, gu, km: Number(d.toFixed(2)),
      monthlyDeals: monthly.length, jeonseDeals: hit.length - monthly.length,
      rentMedian: median(monthly.map((x) => x.rent)), depositMedian: median(monthly.map((x) => x.deposit)), areaMedian: median(monthly.map((x) => x.area)),
      legalDongs: [...new Set(hit.map((x) => x.dong))].sort(), lat: Number(p.lat.toFixed(5)), lng: Number(p.lng.toFixed(5)),
    };
  });
}
await writeFile(`data/nearest-dongs-${dealYmd}.json`, JSON.stringify(out, null, 1));

console.log(`후보 구 ${nearGu.size}개: ${[...nearGu].map((c) => SEOUL_GU[c]).join(", ")}`);
console.log(`후보 동 ${dongPos.size}개 · 실거래가 호출 ${rentCalls}회 · 지오코딩 호출 ${geoCalls}회`);
console.log(`결과: data/nearest-dongs-${dealYmd}.json\n`);
for (const [school, rows] of Object.entries(out)) {
  console.log(`■ ${school}`);
  for (const r of rows as { km: number; gu: string; dong: string; monthlyDeals: number; rentMedian: number; depositMedian: number; areaMedian: number; legalDongs: string[] }[])
    console.log(`  ${String(r.km).padStart(5)}km  ${(r.gu + " " + r.dong).padEnd(14)} 월세 ${String(r.monthlyDeals).padStart(3)}건  중앙값 ${String(r.rentMedian).padStart(4)}  보증금 ${r.depositMedian}  면적 ${r.areaMedian}  [${r.legalDongs.join(",")}]`);
}
