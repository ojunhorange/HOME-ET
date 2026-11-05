/**
 * 법령 조문을 Gemini API File Search 저장소에 올리기 (Google 관리형 RAG)
 *
 *   npm run build:file-search             (.env.local의 GEMINI_FILE_SEARCH_API_KEY, 없으면 GEMINI_API_KEY)
 *   npm run build:file-search -- --fresh  (저장소를 지우고 새로 만들기)
 *
 * data/law-chunks.json의 조문을 하나씩 문서로 올려요(조문 1개 = 문서 1개).
 * 자르기·임베딩·색인은 File Search가 하고, 답변의 근거(grounding)가 조문 단위로 돌아와요.
 * 끝나면 출력되는 저장소 이름을 .env.local의 GEMINI_FILE_SEARCH_STORE에 넣으세요.
 * 저장소는 API 키의 프로젝트에 속해서, 배포에도 같은 키를 GEMINI_FILE_SEARCH_API_KEY로 넣어야 해요.
 *
 * GEMINI_FILE_SEARCH_STORE가 있으면 그 저장소에 빠진 조문만 이어서 올려요(중간에 끊겨도 다시 돌리면 됨).
 * 조문 데이터가 바뀌었으면 --fresh: 그 저장소를 지우고 새로 만들어요.
 */
import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

interface LawChunk {
  id: string;
  law: string;
  article: string;
  title: string;
  text: string;
}

// 저장소는 이 키의 프로젝트에 만들어짐 → 배포의 /api/ask도 같은 키(GEMINI_FILE_SEARCH_API_KEY)로 호출해야 함
const apiKey = process.env.GEMINI_FILE_SEARCH_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error(".env.local에 GEMINI_FILE_SEARCH_API_KEY(또는 GEMINI_API_KEY)가 없어요");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CONCURRENCY = 6; // 한꺼번에 올릴 문서 수 (너무 많으면 요청 제한에 걸림)
const fresh = process.argv.includes("--fresh");

/** 문서 이름 = 화면에 보여 줄 조문 이름. /api/ask가 근거를 조문으로 되돌릴 때 customMetadata의 id를 씀 */
const docName = (c: LawChunk) => `${c.law} ${c.article}${c.title ? `(${c.title})` : ""}`;

async function upload(storeName: string, c: LawChunk) {
  let op = await ai.fileSearchStores.uploadToFileSearchStore({
    fileSearchStoreName: storeName,
    file: new Blob([`${docName(c)}\n\n${c.text}`], { type: "text/plain" }),
    config: {
      mimeType: "text/plain",
      displayName: docName(c),
      customMetadata: [
        { key: "id", stringValue: c.id },
        { key: "law", stringValue: c.law },
      ],
      // 가장 긴 조문도 한두 조각이면 되게 크게 자름
      chunkingConfig: { whiteSpaceConfig: { maxTokensPerChunk: 512, maxOverlapTokens: 32 } },
    },
  });
  while (!op.done) {
    await sleep(1_500);
    op = await ai.operations.get({ operation: op });
  }
  if (op.error) throw new Error(`${c.id} 업로드 실패: ${JSON.stringify(op.error)}`);
}

async function main() {
  const { chunks } = JSON.parse(readFileSync("data/law-chunks.json", "utf8")) as { chunks: LawChunk[] };

  let storeName = process.env.GEMINI_FILE_SEARCH_STORE;
  if (storeName && fresh) {
    await ai.fileSearchStores.delete({ name: storeName, config: { force: true } }).catch(() => {});
    console.log(`이전 저장소 삭제: ${storeName}`);
    storeName = undefined;
  }
  if (!storeName) {
    storeName = (await ai.fileSearchStores.create({ config: { displayName: "home-et-law" } })).name!;
    console.log(`저장소 생성: ${storeName}`);
  }

  // 이미 올라간 조문은 건너뜀 (문서 이름 = 조문 이름)
  const done = new Set<string>();
  for await (const d of await ai.fileSearchStores.documents.list({ parent: storeName, config: { pageSize: 20 } })) {
    if (d.displayName) done.add(d.displayName);
  }
  const queue = chunks.filter((c) => !done.has(docName(c)));
  console.log(`이미 있음 ${done.size}개, 올릴 것 ${queue.length}개`);

  const total = queue.length;
  let finished = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        await upload(storeName!, c);
        process.stdout.write(`\r업로드 ${++finished}/${total}`);
      }
    }),
  );

  console.log(`\n\n완료 (${done.size + finished}/${chunks.length}). .env.local에 아래 줄이 있어야 해요:\nGEMINI_FILE_SEARCH_STORE=${storeName}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
