/**
 * 법령 RAG 데이터 만들기: 법제처 국가법령정보 Open API → data/law-chunks.json
 *
 *   npm run build:law      (.env.local의 LAW_API_OC 필요, 등록한 IP에서만 동작)
 *
 * 법령명으로 검색해 이름이 정확히 같은 현행 법령을 고르고, 조문 단위로 잘라 저장해요.
 * 법령 일련번호(MST)는 개정 때마다 바뀌어서 코드에 고정하지 않아요.
 * 법이 바뀌었을 때만 다시 돌리고, 결과 JSON을 커밋하면 돼요 (DB 없음).
 */
import { mkdirSync, writeFileSync } from "node:fs";

interface Target {
  name: string;
  short: string; // 화면에 보여 줄 짧은 이름
  /** 넣을 조문 범위. 없으면 전체 */
  pick?: (no: number, title: string) => boolean;
}

const TARGETS: Target[] = [
  { name: "주택임대차보호법", short: "주택임대차보호법" },
  { name: "주택임대차보호법 시행령", short: "주택임대차보호법 시행령" },
  // 제7절 임대차 + 제654조가 준용하는 원상회복(제615조)
  { name: "민법", short: "민법", pick: (no) => (no >= 618 && no <= 654) || no === 615 },
  { name: "부동산 거래신고 등에 관한 법률", short: "부동산거래신고법", pick: (_, title) => title.includes("임대차") },
  { name: "공인중개사법", short: "공인중개사법", pick: (no) => [25, 32, 33].includes(no) }, // 확인·설명, 중개보수, 금지행위
  { name: "공인중개사법 시행규칙", short: "공인중개사법 시행규칙", pick: (no) => no === 20 }, // 중개보수 한도
];

const API = "https://www.law.go.kr/DRF";
const OC = process.env.LAW_API_OC;
const OUT = "data/law-chunks.json";
const PAUSE_MS = 800; // 짧은 시간에 몰아서 부르지 않기 (이용 제한 방지)

type Json = Record<string, unknown>;
const asList = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(path: string, params: Record<string, string>): Promise<Json> {
  const q = new URLSearchParams({ OC: OC!, type: "JSON", ...params });
  const res = await fetch(`${API}/${path}?${q}`, { signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  try {
    return JSON.parse(text) as Json;
  } catch {
    // 인증 실패(미등록 IP 등)면 JSON이 아닌 안내 문구가 옴
    throw new Error(`${path} 응답을 읽지 못했어요 (등록한 IP에서 실행했는지 확인): ${text.slice(0, 200)}`);
  }
}

async function findLaw(name: string) {
  const d = (await call("lawSearch.do", { target: "law", query: name })).LawSearch as Json;
  const hit = asList(d?.law as Json[]).find((l) => l["법령명한글"] === name);
  if (!hit) throw new Error(`"${name}"을(를) 찾지 못했어요`);
  return { mst: String(hit["법령일련번호"]), effective: String(hit["시행일자"]) };
}

/** 한자 병기·개정 표시를 빼고 읽기 좋게 */
function clean(s: string) {
  return s
    .replace(/\([\u3400-\u9FFF\uF900-\uFAFF·ㆍ\s]+\)/g, "") // 임대차(賃貸借) → 임대차
    .replace(/<[^>]*>/g, "") // <개정 2015.1.6>
    .replace(/\[[^\]]*(개정|신설|삭제|종전|이동)[^\]]*\]/g, "") // [본조신설 2013.8.13]
    .replace(/[^\S\n]+/g, " ") // 줄바꿈(항·호 구분)은 남기고 공백만 정리
    .replace(/ *\n */g, "\n")
    .trim();
}

const texts = (v: unknown): string[] => asList(v as string | string[]).filter((x): x is string => typeof x === "string");

/** 조문 → 본문 한 덩어리 (조문내용 → 항 → 호 → 목 순서) */
function articleText(u: Json) {
  const out = texts(u["조문내용"]);
  for (const hang of asList(u["항"] as Json[])) {
    out.push(...texts(hang["항내용"]));
    for (const ho of asList(hang["호"] as Json[])) {
      out.push(...texts(ho["호내용"]));
      for (const mok of asList(ho["목"] as Json[])) out.push(...texts(mok["목내용"]));
    }
  }
  return clean(out.join("\n"));
}

async function main() {
  if (!OC) throw new Error(".env.local에 LAW_API_OC가 없어요");
  const chunks = [];
  for (const t of TARGETS) {
    const { mst, effective } = await findLaw(t.name);
    await sleep(PAUSE_MS);
    const law = (await call("lawService.do", { target: "law", MST: mst })).법령 as Json;
    await sleep(PAUSE_MS);

    let n = 0;
    for (const u of asList((law["조문"] as Json)?.["조문단위"] as Json[])) {
      if (u["조문여부"] !== "조문") continue; // 장·절 제목
      const no = Number(u["조문번호"]);
      const branch = u["조문가지번호"] ? `의${u["조문가지번호"]}` : "";
      const title = clean(String(u["조문제목"] ?? ""));
      if (t.pick && !t.pick(no, title)) continue;
      const text = articleText(u);
      if (!text || /^제\d+조(의\d+)?\s*삭제/.test(text)) continue; // 삭제된 조문

      const article = `제${no}조${branch}`;
      chunks.push({
        id: `${t.short}:${article}`,
        law: t.short,
        article,
        title,
        text,
        effective,
        url: `https://www.law.go.kr/법령/${encodeURIComponent(t.name)}/${encodeURIComponent(article)}`,
      });
      n++;
    }
    console.log(`${t.name}: 조문 ${n}개 (시행 ${effective})`);
  }

  mkdirSync("data", { recursive: true });
  const data = { source: "법제처 국가법령정보 Open API", builtAt: new Date().toISOString().slice(0, 10), chunks };
  writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
  console.log(`→ ${OUT} (${chunks.length}개)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
