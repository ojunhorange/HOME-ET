// Google Routes API (TRANSIT)로 편도 시간·환승 횟수·요금을 계산함. 한국은 대중교통 경로만 지원됨.
// 실패하면 { ok:false }를 반환하고, 화면에서 수동 입력으로 대체함.

// ponytail: 요금이 비어 있으면 수도권 카드 기본요금 1,550원(편도)으로 가정함. 광역버스·거리 비례 요금은 다듬기 단계에서 반영
const DEFAULT_ONE_WAY_FARE = 1550;

/** 다음 평일 오전 8시(KST) 출발 기준. 1교시 통학 상황을 가정함 */
function nextWeekdayMorning() {
  const d = new Date(Date.now() + 9 * 3600_000); // KST 기준 날짜
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  d.setUTCHours(8 - 9, 0, 0, 0); // 08:00 KST = 전날 23:00 UTC
  return d.toISOString();
}

export async function POST(req: Request) {
  const { origin, destination } = (await req.json().catch(() => ({}))) as { origin?: string; destination?: string };
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key || !origin || !destination) return Response.json({ ok: false, error: "missing key or address" });

  try {
    const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.legs.steps.travelMode,routes.travelAdvisory.transitFare",
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        travelMode: "TRANSIT",
        departureTime: nextWeekdayMorning(),
        languageCode: "ko",
        regionCode: "KR",
      }),
    });
    const j = await r.json();
    const route = j.routes?.[0];
    if (!r.ok || !route) return Response.json({ ok: false, error: j.error?.message ?? "no route" });

    const rides = route.legs.flatMap((l: { steps?: { travelMode: string }[] }) => l.steps ?? []).filter((s: { travelMode: string }) => s.travelMode === "TRANSIT").length;
    const fare = route.travelAdvisory?.transitFare;
    const oneWayFare = fare?.units ? Number(fare.units) : DEFAULT_ONE_WAY_FARE;
    return Response.json({
      ok: true,
      oneWayMin: Math.round(parseInt(route.duration) / 60),
      transfers: Math.max(0, rides - 1),
      fareRoundTrip: oneWayFare * 2,
      fareEstimated: !fare?.units,
    });
  } catch (e) {
    console.error("commute:", e);
    return Response.json({ ok: false, error: String(e) });
  }
}
