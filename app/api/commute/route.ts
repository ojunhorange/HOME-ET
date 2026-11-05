import { metroFare } from "@/lib/calc";

// Google Routes API (TRANSIT)로 본가 → 학교 통학 경로 후보를 돌려줌. 한국은 대중교통 경로만 지원됨.
//   walk: 역까지 걸어가서 지하철만 타는 경로 (지하철 → 지하철). 서로 다른 경로 2개까지
//   bus:  가까운 역까지 버스를 타고 그다음 지하철을 타는 경로 (버스 → 지하철). 1개
// 둘 다 없으면 가장 빠른 경로 하나(other). 실패하면 { ok:false }만 보내고 원인은 서버 로그에만 남김.

const MAX_ADDRESS = 200;
const VEHICLE: Record<string, string> = {
  SUBWAY: "지하철", BUS: "버스", INTERCITY_BUS: "시외버스", RAIL: "기차", HEAVY_RAIL: "기차",
  COMMUTER_TRAIN: "전철", TRAM: "트램", SHARE_TAXI: "마을버스",
};
// 통학용 도시철도만 '지하철'로 봄. 일반열차(HEAVY_RAIL: 무궁화·ITX 등)와 KTX·장거리 열차는 제외
// (서해선, GTX-A, 경의중앙선, 우이신설선도 Google에서는 SUBWAY로 옴)
const RAIL = new Set(["SUBWAY", "METRO_RAIL", "LIGHT_RAIL", "MONORAIL", "TRAM", "COMMUTER_TRAIN"]);
const BUS = new Set(["BUS", "INTERCITY_BUS", "TROLLEYBUS", "SHARE_TAXI"]);
const STEP = "routes.legs.steps";
const FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.travelAdvisory.transitFare",
  `${STEP}.travelMode`,
  `${STEP}.staticDuration`,
  `${STEP}.transitDetails.stopCount`,
  `${STEP}.transitDetails.headsign`,
  `${STEP}.transitDetails.stopDetails.departureStop.name`,
  `${STEP}.transitDetails.stopDetails.arrivalStop.name`,
  `${STEP}.transitDetails.transitLine.nameShort`,
  `${STEP}.transitDetails.transitLine.color`,
  `${STEP}.transitDetails.transitLine.textColor`,
  `${STEP}.transitDetails.transitLine.vehicle.type`,
].join(",");

type Step = {
  travelMode: string;
  staticDuration?: string;
  transitDetails?: {
    stopCount?: number;
    headsign?: string;
    stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string } };
    transitLine?: { nameShort?: string; color?: string; textColor?: string; vehicle?: { type?: string } };
  };
};
type Route = { duration: string; distanceMeters?: number; legs: { steps?: Step[] }[]; travelAdvisory?: { transitFare?: { units?: string } } };

/** 화면에 그릴 경로 구간. 이어지는 도보 조각은 하나로 합침 */
export type Segment =
  | { type: "walk"; min: number }
  | { type: "ride"; vehicle: string; line: string; color: string; textColor: string; from: string; to: string; stops: number; min: number; headsign: string };

export interface RouteOption {
  kind: "walk" | "bus" | "other";
  key: string; // 노선 + 탑승역 순서. 같은 경로 판단과 선택 표시용
  oneWayMin: number;
  transfers: number;
  roundTripFare: number;
  summary: string;
  segments: Segment[];
}
export type CommuteResponse = { ok: true; options: RouteOption[] } | { ok: false };

function toSegments(steps: Step[]): Segment[] {
  const out: Segment[] = [];
  for (const s of steps) {
    const sec = parseInt(s.staticDuration ?? "0") || 0;
    const t = s.transitDetails;
    if (s.travelMode !== "TRANSIT" || !t) {
      const last = out.at(-1);
      if (last?.type === "walk") last.min += sec / 60;
      else out.push({ type: "walk", min: sec / 60 });
      continue;
    }
    const line = t.transitLine;
    out.push({
      type: "ride",
      vehicle: VEHICLE[line?.vehicle?.type ?? ""] ?? "대중교통",
      line: line?.nameShort ?? "",
      color: line?.color ?? "#6b7080",
      textColor: line?.textColor ?? "#ffffff",
      from: t.stopDetails?.departureStop?.name ?? "",
      to: t.stopDetails?.arrivalStop?.name ?? "",
      stops: t.stopCount ?? 0,
      min: Math.round(sec / 60),
      headsign: t.headsign ?? "",
    });
  }
  // 1분 미만 도보(같은 역 안 이동 등)는 버리고 나머지는 분 단위로 반올림
  return out.flatMap((g): Segment[] => (g.type === "walk" ? (g.min >= 1 ? [{ ...g, min: Math.round(g.min) }] : []) : [g]));
}

/** 다음 평일 오전 8시(KST) 출발 기준. 1교시 통학 상황을 가정함 */
function nextWeekdayMorning() {
  const d = new Date(Date.now() + 9 * 3600_000); // KST 기준 날짜
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  d.setUTCHours(8 - 9, 0, 0, 0); // 08:00 KST = 전날 23:00 UTC
  return d.toISOString();
}

function toOption(r: Route): RouteOption {
  const steps = r.legs.flatMap((l) => l.steps ?? []);
  const rides = steps.filter((s) => s.travelMode === "TRANSIT");
  const types = rides.map((s) => s.transitDetails?.transitLine?.vehicle?.type ?? "");
  const allRail = (t: string[]) => t.length > 0 && t.every((v) => RAIL.has(v));
  const kind = allRail(types) ? "walk" : BUS.has(types[0]) && allRail(types.slice(1)) ? "bus" : "other";
  const units = Number(r.travelAdvisory?.transitFare?.units);
  const oneWayFare = units > 0 ? units : metroFare((r.distanceMeters ?? 0) / 1000);
  return {
    kind,
    key: rides.map((s) => `${s.transitDetails?.transitLine?.nameShort}@${s.transitDetails?.stopDetails?.departureStop?.name}`).join(">"),
    oneWayMin: Math.round(parseInt(r.duration) / 60),
    transfers: Math.max(0, rides.length - 1),
    roundTripFare: oneWayFare * 2,
    summary: rides
      .map((s) => {
        const line = s.transitDetails?.transitLine;
        return `${VEHICLE[line?.vehicle?.type ?? ""] ?? ""} ${line?.nameShort ?? ""}`.trim();
      })
      .join(" → "),
    segments: toSegments(steps),
  };
}

type LatLng = { lat: number; lng: number };

async function routes(key: string, origin: string, dest: LatLng, railOnly: boolean): Promise<Route[]> {
  const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
      travelMode: "TRANSIT",
      computeAlternativeRoutes: true,
      departureTime: nextWeekdayMorning(),
      languageCode: "ko",
      regionCode: "KR",
      // 지하철만 허용한 요청을 따로 보내야 '역까지 걸어가는' 지하철 경로가 안정적으로 나옴.
      // TRAIN·RAIL은 일반열차(경부선 무궁화 등)까지 허용하므로 넣지 않음
      ...(railOnly && { transitPreferences: { allowedTravelModes: ["SUBWAY", "LIGHT_RAIL"] } }),
    }),
  });
  const j = await r.json();
  if (!r.ok) console.error("commute:", r.status, j.error?.status);
  return r.ok ? (j.routes ?? []) : [];
}

const fail = () => Response.json({ ok: false } satisfies CommuteResponse);

/** body: { origin: 본가 주소 문자열, destination: { lat, lng } 학교 좌표 } */
export async function POST(req: Request) {
  const { origin, destination } = (await req.json().catch(() => ({}))) as { origin?: string; destination?: Partial<LatLng> };
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  const dest = destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng) ? (destination as LatLng) : null;
  if (!key || !origin?.trim() || origin.length > MAX_ADDRESS || !dest) return fail();

  try {
    const [any, railOnly] = await Promise.all([routes(key, origin, dest, false), routes(key, origin, dest, true)]);
    // 완전히 같은 경로(노선 + 갈아타는 역)는 하나로(가장 빠른 것), 시간순 정렬
    const byKey = new Map<string, RouteOption>();
    for (const o of [...any, ...railOnly].map(toOption)) {
      const prev = byKey.get(o.key);
      if (!prev || o.oneWayMin < prev.oneWayMin) byKey.set(o.key, o);
    }
    const all = [...byKey.values()].sort((a, b) => a.oneWayMin - b.oneWayMin || a.transfers - b.transfers);
    if (!all.length) {
      console.error("commute: no route");
      return fail();
    }
    const picked = [...all.filter((o) => o.kind === "walk").slice(0, 2), ...all.filter((o) => o.kind === "bus").slice(0, 1)];
    return Response.json({ ok: true, options: picked.length ? picked : [all[0]] } satisfies CommuteResponse);
  } catch (e) {
    console.error("commute:", (e as Error).name);
    return fail();
  }
}
