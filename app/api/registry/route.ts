// 등기부등본 PDF → 구조화(lib/registry.ts) → 위험 신호(lib/registry-rules.ts). docs/registry.md
//
// ① 글자가 있는 PDF(인터넷등기소 열람·발급본): unpdf로 글자 위치를 뽑아 표 칸으로 나눔. 키 없이 동작, 몇 초
// ② Gemini 문서 이해: PDF를 그대로 넣어 등기 기록을 JSON으로 뽑음 (GEMINI_API_KEY 필요, 10~30초)
//
// mode=text (기본): ①만 해서 바로 돌려줌. 글자가 없는 스캔본이면 ②로 읽음
// mode=verify: ①과 ②를 둘 다 해서 소유자·살아 있는 권리를 서로 맞춰 봄(교차 검증)
// 화면은 text로 결과부터 보여 주고 verify를 따로 불러, Gemini가 느리거나 붐벼도(503) 기다리지 않게 함
// 말소 여부는 둘 다 "N번…말소" 기록으로만 판단 (Gemini가 빨간 줄을 잘 못 알아보고, 잘못 보면 위험 신호가 숨겨짐)
// 개인정보가 들어 있어 파일과 내용은 저장하지도, 로그로 남기지도 않음
import { GoogleGenAI } from "@google/genai";
import { getDocumentProxy } from "unpdf";
import { z } from "zod";
import data from "@/data/law-chunks.json";
import type { LawChunk } from "@/lib/law-search";
import { parseRegistry, toFacts, type Entry, type RegistryFacts, type TextItem } from "@/lib/registry";
import { generateWithFallback } from "@/lib/gemini";
import { REGISTRY_MAX_BYTES, REGISTRY_MAX_MB, checkRegistry, compareFacts, type RegistryResult } from "@/lib/registry-rules";

// Gemini 문서 이해(기본 모델 → 붐비면 예비 모델)가 기본 실행 시간 제한에 걸리지 않게.
// cacheComponents라 runtime 설정은 쓰지 않음(기본 Node.js)
export const maxDuration = 60;

const GEMINI_TIMEOUTS = [25_000, 32_000]; // 기본 모델, 예비 모델 (합이 maxDuration 안)

const lawById = new Map((data.chunks as LawChunk[]).map((c) => [c.id, c]));

async function textItems(bytes: Uint8Array): Promise<TextItem[]> {
  const pdf = await getDocumentProxy(bytes);
  const items: TextItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const { items: raw } = await (await pdf.getPage(p)).getTextContent();
    for (const it of raw) if ("str" in it && it.str.trim()) items.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str });
  }
  return items;
}

// ── Gemini 문서 이해 (글자가 없는 PDF용) ─────────────────────────────

const GEMINI_PROMPT = `이 문서는 한국 부동산 등기사항전부증명서(등기부등본)야.
갑구(소유권에 관한 사항)와 을구(소유권 이외의 권리에 관한 사항)의 모든 기록을 순서대로 옮겨 줘.
- 각 기록: section("갑" 또는 "을"), rank(순위번호, 예 "10", "10-1"), purpose(등기목적), receipt(접수), cause(등기원인), details(권리자 및 기타사항을 줄마다 나눈 배열)
- rank에는 순위번호 숫자만 넣어. "(전 3)" 같은 옛 번호는 빼.
- 한 기록이 다음 쪽으로 이어지면(예: "12번근저당권설정등" 다음 쪽에 "기말소") 하나의 기록으로 합쳐 줘.
- 글자는 보이는 그대로 옮기고, 없는 내용을 만들지 마.
- 문서 맨 위의 제목(title), 부동산 종류(propertyType: 집합건물/건물/토지), 소재지(address), 열람일시(viewedAt, YYYY-MM-DD)도 넣어 줘.`;

const entrySchema = {
  type: "object",
  properties: {
    section: { type: "string", enum: ["갑", "을"] },
    rank: { type: "string" },
    purpose: { type: "string" },
    receipt: { type: "string" },
    cause: { type: "string" },
    details: { type: "array", items: { type: "string" } },
  },
  required: ["section", "rank", "purpose", "receipt", "cause", "details"],
};
const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    propertyType: { type: "string" },
    address: { type: "string" },
    viewedAt: { type: "string" },
    entries: { type: "array", items: entrySchema },
  },
  required: ["title", "propertyType", "address", "viewedAt", "entries"],
};
const GeminiOut = z.object({
  title: z.string(),
  propertyType: z.string(),
  address: z.string(),
  viewedAt: z.string(),
  entries: z.array(
    z.object({
      section: z.enum(["갑", "을"]),
      rank: z.string(),
      purpose: z.string(),
      receipt: z.string(),
      cause: z.string(),
      details: z.array(z.string()),
    }),
  ),
});

async function geminiFacts(apiKey: string, bytes: Uint8Array): Promise<RegistryFacts> {
  const ai = new GoogleGenAI({ apiKey });
  const { res } = await generateWithFallback(ai, {
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: "application/pdf", data: Buffer.from(bytes).toString("base64") } }, { text: GEMINI_PROMPT }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: GEMINI_SCHEMA,
      temperature: 0,
    },
  }, GEMINI_TIMEOUTS);
  const out = GeminiOut.parse(JSON.parse(res.text ?? ""));
  const entries: Entry[] = out.entries.map((e) => ({
    ...e,
    rank: /\d+(?:-\d+)?/.exec(e.rank)?.[0] ?? e.rank, // "1(전 3)" → "1"
    purpose: e.purpose.replace(/\s+/g, ""),
    cancelled: false,
  }));
  // 말소 기록("7번…말소")으로 말소 표시 (텍스트 판독과 같은 규칙).
  // 쪽이 넘어가며 "12번근저당권설정등"에서 끊겨 "기말소"를 놓친 경우도 말소 기록으로 봄
  for (const e of entries) {
    const m = /^(\d+(?:-\d+)?)번.*(말소|설정등|설정등기)$/.exec(e.purpose);
    if (m) for (const t of entries) if (t.section === e.section && (t.rank === m[1] || t.rank.startsWith(`${m[1]}-`))) t.cancelled = true;
  }
  return toFacts({ entries, title: out.title, propertyType: out.propertyType, address: out.address, viewedAt: out.viewedAt || null });
}

// ── 핸들러 ─────────────────────────────

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "파일을 받지 못했어요." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "등기부등본 PDF를 올려 주세요." }, { status: 400 });
  if (file.size > REGISTRY_MAX_BYTES) return Response.json({ error: `${REGISTRY_MAX_MB}MB 이하 파일만 올릴 수 있어요.` }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return Response.json({ error: "PDF 파일만 올릴 수 있어요." }, { status: 415 });

  const ctx = {
    today: new Date().toISOString().slice(0, 10),
    deposit: num(form.get("deposit")) ?? 0,
    price: num(form.get("price")),
    landlord: String(form.get("landlord") ?? "").trim() || null,
  };

  const apiKey = process.env.GEMINI_API_KEY;
  const verify = form.get("mode") === "verify";
  const readGemini = () =>
    apiKey
      ? geminiFacts(apiKey, bytes.slice()).catch(() => {
          console.error("[registry] Gemini 문서 이해 실패"); // 등본 내용은 남기지 않음
          return null;
        })
      : Promise.resolve(null);

  // verify면 두 방식을 동시에 (pdf.js가 버퍼를 넘겨받을 수 있어 각각 복사본을 줌)
  const geminiP = verify ? readGemini() : null;
  let text: RegistryFacts | null = null;
  let hasText = false;
  try {
    const items = await textItems(bytes.slice());
    hasText = items.length > 20;
    // 글자가 있는데 등기사항증명서 제목이 없으면 등본이 아님 → Gemini에 읽히지 않고 바로 안내 (시간·비용 낭비 방지)
    if (hasText && !items.some((i) => /등기사항.*증명서/.test(i.str))) {
      return Response.json({ error: "등기사항전부증명서가 아닌 것 같아요. 인터넷등기소에서 열람한 PDF를 올려 주세요." }, { status: 422 });
    }
    const parsed = items.length ? parseRegistry(items) : null;
    if (parsed && parsed.entries.length) text = parsed;
  } catch {
    // 글자 추출 실패 → Gemini 결과만 씀
  }
  // 글자가 없는 스캔본일 때만 Gemini 단독으로 읽음
  const gemini = await (geminiP ?? (text || hasText ? Promise.resolve(null) : readGemini()));
  if (verify && !gemini) return Response.json({ error: "Gemini 교차 검증을 지금은 하지 못했어요." }, { status: 503 });

  // 판단은 정해진 칸 위치로 읽은 텍스트 판독을 우선, 없으면 Gemini
  const facts = text ?? gemini;
  if (!facts) {
    const error = apiKey
      ? "등기부등본을 읽지 못했어요. 인터넷등기소에서 열람한 PDF인지 확인해 주세요."
      : "글자를 읽을 수 없는 PDF예요. 인터넷등기소에서 열람한 PDF를 그대로 올려 주세요.";
    return Response.json({ error }, { status: 422 });
  }
  const source: RegistryResult["source"] = text && gemini ? "text+gemini" : text ? "text" : "gemini";
  const differences = text && gemini ? compareFacts(text, gemini) : null;

  if (!/등기사항.*증명서/.test(facts.title) && facts.entries.length === 0) {
    return Response.json({ error: "등기사항전부증명서가 아닌 것 같아요." }, { status: 422 });
  }

  const { entries: _entries, ...rest } = facts;
  void _entries;
  const signals = checkRegistry(facts, ctx);
  if (differences?.length) {
    signals.unshift({
      level: "caution",
      title: "두 방식으로 읽은 결과가 달라요",
      detail: `PDF 글자 판독과 Gemini 문서 이해 결과가 ${differences.length}곳에서 달라요: ${differences.join(" / ")}. 이 부분은 등본 원문을 직접 확인해 주세요.`,
      laws: [],
    });
  }
  const laws: RegistryResult["laws"] = {};
  for (const id of new Set(signals.flatMap((s) => s.laws))) {
    const c = lawById.get(id);
    if (c) laws[id] = { label: `${c.law} ${c.article}${c.title ? `(${c.title})` : ""}`, url: c.url };
  }
  const result: RegistryResult = { source, facts: rest, signals, laws, differences, canVerify: !!apiKey && source === "text" };
  return Response.json(result);
}
