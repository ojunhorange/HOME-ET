import { fail, handleError, readState, requireUid } from "@/lib/reports-api";
import { createReport, listReports } from "@/lib/reports-repo";

/** 내 리포트 목록 (최신순, 요약만) */
export async function GET() {
  const who = await requireUid();
  if ("res" in who) return who.res;
  try {
    return Response.json({ reports: await listReports(who.uid) });
  } catch (e) {
    return handleError(e, "list");
  }
}

/** 새로 저장. body: { input: AppState }. 이미 3개면 409 { error: "full" } */
export async function POST(req: Request) {
  const who = await requireUid();
  if ("res" in who) return who.res;
  const body = await readState(req);
  if ("res" in body) return body.res;
  if (!body.state.analysis) return fail("invalid"); // 검사(가치관 분석)를 마친 리포트만 저장
  try {
    return Response.json({ report: await createReport(who.uid, body.state) }, { status: 201 });
  } catch (e) {
    return handleError(e, "create");
  }
}
