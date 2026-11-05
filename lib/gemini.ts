/**
 * Gemini 호출 + 예비 모델. 기본 모델이 붐비면(503) 데모 중에도 기능이 통째로 꺼지지 않게
 * 다음 모델로 넘어감. 서버 전용 (API 라우트에서만 import)
 *
 *   GEMINI_MODEL            기본 모델 (기본 gemini-flash-lite-latest)
 *   GEMINI_FALLBACK_MODELS  쉼표로 구분한 예비 모델 (기본 gemini-2.5-flash)
 */
import type { GenerateContentParameters, GenerateContentResponse, GoogleGenAI } from "@google/genai";

export const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
export const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-2.5-flash")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s && s !== PRIMARY_MODEL);

/** 다른 모델로 다시 해 볼 만한 실패: 붐빔·요청 제한·서버 오류·시간 초과·네트워크 */
function retryable(e: unknown) {
  const err = e as { status?: number; name?: string; message?: string };
  if (err.status && [429, 500, 502, 503, 504].includes(err.status)) return true;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  return /fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(err.message));
}

/**
 * 기본 모델 → 예비 모델 순서로 시도. 모델마다 정해진 시간 안에 답이 없으면 다음 모델로.
 * timeoutMs: 모든 모델에 같은 값, 또는 [기본, 예비1, …] 순서의 배열 (모자라면 마지막 값)
 */
export async function generateWithFallback(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, "model">,
  timeoutMs: number | number[],
): Promise<{ res: GenerateContentResponse; model: string }> {
  const models = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  const limits = Array.isArray(timeoutMs) ? timeoutMs : [timeoutMs];
  let last: unknown;
  for (const [i, model] of models.entries()) {
    try {
      const res = await ai.models.generateContent({
        ...params,
        model,
        config: { ...params.config, abortSignal: AbortSignal.timeout(limits[Math.min(i, limits.length - 1)]) },
      });
      return { res, model };
    } catch (e) {
      last = e;
      if (!retryable(e)) throw e;
      console.warn(`[gemini] ${model} 실패(${(e as { status?: number }).status ?? (e as Error).name}), 다음 모델로`);
    }
  }
  throw last;
}
