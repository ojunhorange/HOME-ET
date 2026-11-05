import { fail, handleError, readState, requireUid, validId } from "@/lib/reports-api";
import { deleteReport, getReport, updateReport } from "@/lib/reports-repo";

type Ctx = { params: Promise<{ id: string }> };

/** 하나 불러오기 (input 포함) */
export async function GET(_req: Request, { params }: Ctx) {
  const who = await requireUid();
  if ("res" in who) return who.res;
  const { id } = await params;
  if (!validId(id)) return fail("not_found");
  try {
    const report = await getReport(who.uid, id);
    return report ? Response.json({ report }) : fail("not_found");
  } catch (e) {
    return handleError(e, "get");
  }
}

/** 덮어쓰기. body: { input: AppState } */
export async function PUT(req: Request, { params }: Ctx) {
  const who = await requireUid();
  if ("res" in who) return who.res;
  const { id } = await params;
  if (!validId(id)) return fail("not_found");
  const body = await readState(req);
  if ("res" in body) return body.res;
  if (!body.state.analysis) return fail("invalid");
  try {
    const report = await updateReport(who.uid, id, body.state);
    return report ? Response.json({ report }) : fail("not_found");
  } catch (e) {
    return handleError(e, "update");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const who = await requireUid();
  if ("res" in who) return who.res;
  const { id } = await params;
  if (!validId(id)) return fail("not_found");
  try {
    return (await deleteReport(who.uid, id)) ? new Response(null, { status: 204 }) : fail("not_found");
  } catch (e) {
    return handleError(e, "delete");
  }
}
