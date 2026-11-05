import { z } from "zod";
import { authEnabled, readSessionToken } from "@/auth";
import { CALENDAR_SCOPE, STEP_KEYS } from "@/lib/dday";

// 계약 D-day 일정을 로그인한 사람의 기본 Google 캘린더에 넣는다.
// 일정마다 숨은 표시(extendedProperties.private.homeet = 단계 key)를 붙여 두고, 다시 누르면 그 표시로 찾아서 고친다
// → 날짜를 바꾸고 다시 등록해도 새로 쌓이지 않음. 표시로 걸러 찾으니 다른 일정은 읽지 않음.

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TAG = "homeet";

// 예전 버전이 고정 ID로 넣은 일정. 표시가 없어서 찾을 수 없으니 등록할 때 함께 지움 (없으면 404라 무시)
const LEGACY_IDS = ["homeetpre", "homeetcontract", "homeetprebalance", "homeetbalance", "homeetreport"];

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({
  events: z
    .array(
      z.object({
        key: z.enum(STEP_KEYS),
        summary: z.string().max(200),
        description: z.string().max(2000),
        start: Day,
        end: Day,
      }),
    )
    .min(1)
    .max(STEP_KEYS.length),
});

const reauth = () => Response.json({ error: "reauth" }, { status: 401 });

/** 세션 쿠키 속 Google 토큰. 만료됐으면 refresh token으로 이번 요청에 쓸 새 토큰을 받음 */
async function accessToken(req: Request): Promise<string | null> {
  const token = await readSessionToken(req);
  if (!token?.scope?.split(" ").includes(CALENDAR_SCOPE)) return null;
  if (token.accessToken && token.expiresAt && token.expiresAt * 1000 > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function POST(req: Request) {
  if (!authEnabled) return Response.json({ error: "disabled" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const token = await accessToken(req);
  if (!token) return reauth();

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const origin = new URL(req.url).origin;

  const del = (id: string) => fetch(`${API}/${encodeURIComponent(id)}`, { method: "DELETE", headers });

  /** 이 단계 표시가 붙은 일정 ID들 (표시로 걸러서 HOME:ET 일정만 받음) */
  const find = async (key: string): Promise<{ ids: string[] } | { res: Response }> => {
    const url = new URL(API);
    url.searchParams.set("privateExtendedProperty", `${TAG}=${key}`);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("fields", "items(id)");
    const res = await fetch(url, { headers });
    if (!res.ok) return { res };
    const data = (await res.json()) as { items?: { id: string }[] };
    return { ids: (data.items ?? []).map((i) => i.id) };
  };

  const upsert = async (e: z.infer<typeof Body>["events"][number]): Promise<Response> => {
    const found = await find(e.key);
    if ("res" in found) return found.res;
    const [keep, ...dupes] = found.ids;
    await Promise.all(dupes.map(del)); // 예전에 쌓인 같은 단계 일정은 하나만 남김
    const body = JSON.stringify({
      summary: e.summary,
      description: e.description,
      start: { date: e.start },
      end: { date: e.end },
      transparency: "transparent", // 종일 일정이 '바쁨'으로 잡히지 않게
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 15 * 60 }] }, // 전날 오전 9시
      source: { title: "HOME:ET", url: origin },
      extendedProperties: { private: { [TAG]: e.key } },
    });
    return keep
      ? fetch(`${API}/${encodeURIComponent(keep)}`, { method: "PUT", headers, body })
      : fetch(API, { method: "POST", headers, body });
  };

  const sent = new Set<string>(parsed.data.events.map((e) => e.key));
  const results = await Promise.all(parsed.data.events.map(upsert));
  // 이번에 빠진 단계(예: 금액을 낮춰 임대차 신고 대상이 아니게 됨)는 지움 + 예전 고정 ID 일정 정리
  await Promise.all([
    ...STEP_KEYS.filter((k) => !sent.has(k)).map(async (k) => {
      const found = await find(k);
      if ("ids" in found) await Promise.all(found.ids.map(del));
    }),
    ...LEGACY_IDS.map(del),
  ]);

  const bad = results.filter((r) => !r.ok);
  if (bad.length) console.warn("[calendar] google errors", bad.map((r) => r.status));
  if (results.some((r) => r.status === 401 || r.status === 403)) return reauth();
  const failed = results.filter((r) => !r.ok).length;
  if (failed) return Response.json({ error: "google", failed }, { status: 502 });
  return Response.json({ count: results.length });
}
