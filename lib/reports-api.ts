// 서버 전용: /api/reports 라우트 공통 처리 (인증·설정 확인, 본문 읽기, 오류 응답)
import { authEnabled, currentUid } from "@/auth";
import { migrateState, type AppState } from "./app-state";
import { firebaseEnabled } from "./firebase-env";
import { InvalidReportError, ReportsFullError } from "./reports-repo";
import { MAX_BODY_BYTES, REPORT_ID, type ReportsError } from "./saved-reports";

const STATUS: Record<ReportsError, number> = {
  unauthorized: 401, disabled: 503, full: 409, not_found: 404, invalid: 400, too_large: 413, server: 500,
};

export const fail = (error: ReportsError) => Response.json({ error }, { status: STATUS[error] });

/** 로그인한 사용자 uid, 아니면 바로 돌려줄 오류 응답 */
export async function requireUid(): Promise<{ uid: string } | { res: Response }> {
  if (!authEnabled || !firebaseEnabled) return { res: fail("disabled") };
  const uid = await currentUid();
  return uid ? { uid } : { res: fail("unauthorized") };
}

/** 본문 { input } → 현재 형식 AppState. 크기 제한 넘거나 형식이 틀리면 오류 응답 */
export async function readState(req: Request): Promise<{ state: AppState } | { res: Response }> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { res: fail("too_large") };
  try {
    const state = migrateState((JSON.parse(text) as { input?: unknown })?.input);
    return state ? { state } : { res: fail("invalid") };
  } catch {
    return { res: fail("invalid") };
  }
}

export const validId = (id: string) => REPORT_ID.test(id);

/** 저장소 예외 → 응답 */
export function handleError(e: unknown, where: string) {
  if (e instanceof ReportsFullError) return fail("full");
  if (e instanceof InvalidReportError) return fail("invalid");
  console.error(`[reports] ${where} 실패:`, e instanceof Error ? e.message : e);
  return fail("server");
}
