// 학교별 주변 동(data/school-dongs.json) → 학교까지 통학 시간을 Google Routes API(TRANSIT)로 구해 캐시
// 실행: node --env-file=.env.local scripts/school-commute.mts [--refresh]
// 결과: data/school-commute.json  { 학교: { 동: { mode, oneWayMin, summary } } }  (lib/data.ts 가 읽음)
// 이미 캐시된 학교·동은 다시 부르지 않음. --refresh 면 전부 다시 계산
// 출발: 동 중심 좌표, 도착: 학교 좌표, 다음 평일 오전 8시 출발 대중교통 경로 중 가장 빠른 것
// 한국은 Routes API 도보(WALK) 경로가 빈 결과라서, 도보는 직선거리 × 1.3(길 우회) ÷ 4.5km/h 로 어림해
// 대중교통보다 빠르면 도보로 둠

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

const KEY = process.env.GOOGLE_MAPS_SERVER_KEY;
if (!KEY) throw new Error("GOOGLE_MAPS_SERVER_KEY가 필요해요. --env-file=.env.local 로 실행하세요.");

// lib/data.ts 의 학교 좌표
const SCHOOLS: Record<string, { lat: number; lng: number }> = {
  고려대학교: { lat: 37.5894, lng: 127.0322 },
  연세대학교: { lat: 37.5658, lng: 126.9386 },
  서울대학교: { lat: 37.4599, lng: 126.9519 },
  한양대학교: { lat: 37.5572, lng: 127.0453 },
  건국대학교: { lat: 37.5408, lng: 127.0793 },
  경희대학교: { lat: 37.5964, lng: 127.0525 },
};
const RAIL = new Set(["SUBWAY", "METRO_RAIL", "LIGHT_RAIL", "MONORAIL", "TRAM", "COMMUTER_TRAIN"]);

type Mode = "도보" | "버스" | "지하철";
type Transit = { transitMode: Mode; transitMin: number; summary: string };
type Entry = Transit & { mode: Mode; oneWayMin: number };
type Step = { travelMode: string; transitDetails?: { transitLine?: { nameShort?: string; vehicle?: { type?: string } } } };
type Route = { duration: string; legs: { steps?: Step[] }[] };

const OUT = "data/school-commute.json";
const dongs: { schools: Record<string, { dong: string; km: number; lat: number; lng: number }[]> } = JSON.parse(await readFile("data/school-dongs.json", "utf8"));
const cache: Record<string, Record<string, Entry>> = existsSync(OUT) && !process.argv.includes("--refresh") ? JSON.parse(await readFile(OUT, "utf8")) : {};

function nextWeekdayMorning() {
  const d = new Date(Date.now() + 9 * 3600_000); // KST 기준 날짜
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  d.setUTCHours(8 - 9, 0, 0, 0); // 08:00 KST
  return d.toISOString();
}

async function fastest(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Transit> {
  const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json", "X-Goog-Api-Key": KEY!,
      "X-Goog-FieldMask": "routes.duration,routes.legs.steps.travelMode,routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.vehicle.type",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: "TRANSIT", computeAlternativeRoutes: true, departureTime: nextWeekdayMorning(), languageCode: "ko", regionCode: "KR",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Routes ${r.status} ${j.error?.status ?? ""}`);
  const routes: Route[] = j.routes ?? [];
  if (!routes.length) throw new Error("경로 없음");
  const best = routes.reduce((a, b) => (parseInt(b.duration) < parseInt(a.duration) ? b : a));
  const rides = best.legs.flatMap((l) => l.steps ?? []).filter((s) => s.travelMode === "TRANSIT");
  const types = rides.map((s) => s.transitDetails?.transitLine?.vehicle?.type ?? "");
  const mode: Mode = !rides.length ? "도보" : types.some((t) => RAIL.has(t)) ? "지하철" : "버스";
  const summary = rides.length ? rides.map((s) => s.transitDetails?.transitLine?.nameShort ?? "?").join(" → ") : "도보";
  return { transitMode: mode, transitMin: Math.round(parseInt(best.duration) / 60), summary };
}

let calls = 0;
for (const [school, rows] of Object.entries(dongs.schools)) {
  const to = SCHOOLS[school];
  if (!to) throw new Error(`학교 좌표 없음: ${school}`);
  cache[school] ??= {};
  for (const d of rows) {
    let t: Transit | undefined = cache[school][d.dong];
    if (!t?.transitMin) {
      t = await fastest(d, to);
      calls++;
    }
    const { transitMode, transitMin, summary } = t;
    const walkMin = Math.max(5, Math.round(((d.km * 1.3) / 4.5) * 60));
    cache[school][d.dong] = walkMin <= transitMin
      ? { mode: "도보", oneWayMin: walkMin, transitMode, transitMin, summary }
      : { mode: transitMode, oneWayMin: transitMin, transitMode, transitMin, summary };
  }
  // json 에서 빠진 동은 캐시에서도 지움
  for (const dong of Object.keys(cache[school])) if (!rows.some((d) => d.dong === dong)) delete cache[school][dong];
}
await writeFile(OUT, JSON.stringify(cache, null, 1));

console.log(`Routes 호출 ${calls}회 → ${OUT}`);
for (const [school, m] of Object.entries(cache))
  console.log(`■ ${school}  ` + Object.entries(m).map(([dong, e]) => `${dong} ${e.mode} ${e.oneWayMin}분(대중교통 ${e.transitMin}분 ${e.summary})`).join(" / "));
