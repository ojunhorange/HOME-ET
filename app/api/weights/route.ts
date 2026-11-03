import { GoogleGenAI } from "@google/genai";

// 생활 목표 → 돈·시간·체력 가중치(합 1) + 근거. 어떤 실패든 각 1/3 기본값으로 응답 (기획서 ① 처리 2)
const FALLBACK = { money: 1 / 3, time: 1 / 3, body: 1 / 3, reason: "AI 분석을 사용할 수 없어 기본값(각 1/3)을 사용했어요.", source: "default" };

const PROMPT = `너는 서울에서 첫 자취를 고민하는 대학생의 글을 읽고, 자취 판단에서 세 가지를 얼마나 중요하게 여기는지 가중치로 바꾼다.
- money: 돈을 아끼고 싶은 마음 (월세 부담, 부모님 부담, 저축)
- time: 되찾은 시간을 쓰고 싶은 마음 (공부, 학점, 동아리, 알바, 대외활동)
- body: 체력·피로 회복을 원하는 마음 (통학 피로, 수면, 건강, 휴식)
세 값은 0~1이고 합은 1이다. 글에 근거가 없으면 1/3에 가깝게 둔다.
reason은 한 줄로, 원문 표현을 큰따옴표로 인용하고 화살표로 항목을 잇는다. 예: "부모님께 부담은 덜 드리고 싶어요" → 돈, "학점 관리" → 시간
학생의 글:
`;

export async function POST(req: Request) {
  const { goal } = (await req.json().catch(() => ({}))) as { goal?: string };
  if (!process.env.GEMINI_API_KEY || !goal?.trim()) return Response.json(FALLBACK);

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-flash-latest",
      contents: PROMPT + goal.slice(0, 1000),
      config: {
        abortSignal: AbortSignal.timeout(8000),
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            money: { type: "number" },
            time: { type: "number" },
            body: { type: "number" },
            reason: { type: "string" },
          },
          required: ["money", "time", "body", "reason"],
        },
      },
    });
    const j = JSON.parse(res.text ?? "");
    const vals = [j.money, j.time, j.body].map((v) => Math.max(0, Number(v) || 0));
    const sum = vals[0] + vals[1] + vals[2];
    if (!(sum > 0)) return Response.json(FALLBACK);
    return Response.json({ money: vals[0] / sum, time: vals[1] / sum, body: vals[2] / sum, reason: String(j.reason), source: "gemini" });
  } catch (e) {
    console.error("weights:", e);
    return Response.json(FALLBACK);
  }
}
