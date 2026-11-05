/**
 * 법령 조문 검색 (RAG의 "찾기" 단계). 외부 API·DB 없이 data/law-chunks.json만 씀.
 * 한글 2글자 단위(bigram) BM25: 띄어쓰기·조사가 달라도 "임차인이" ↔ "임차인" 처럼 겹치는 부분으로 찾음.
 * 데이터 만들기: scripts/build-law.mts (docs/law-rag.md)
 */

export interface LawChunk {
  id: string; // "주택임대차보호법:제3조의2"
  law: string;
  article: string; // "제3조의2"
  title: string;
  text: string;
  effective: string; // 시행일 YYYYMMDD
  url: string; // 법제처 원문
}

/**
 * 일상어 → 조문에 쓰이는 말. 질문에 왼쪽 말이 있으면 오른쪽 말을 검색어에 더함.
 * 조문은 "임대인·임차인·차임"처럼 쓰고, 사람들은 "집주인·세입자·월세"라고 물어서 생기는 차이를 메움.
 */
export const QUERY_SYNONYMS: Record<string, string> = {
  집주인: "임대인",
  주인: "임대인",
  세입자: "임차인",
  세입: "임차인",
  월세: "차임",
  방값: "차임",
  인상: "차임 증액 증감청구권",
  올리: "차임 증액 증감청구권",
  올린: "차임 증액 증감청구권",
  올려: "차임 증액 증감청구권",
  수리: "수선 필요비 임대인의 의무 사용 수익에 필요한 상태",
  고장: "수선 필요비 임대인의 의무 사용 수익에 필요한 상태",
  연장: "계약의 갱신 계약갱신 요구",
  재계약: "계약의 갱신 계약갱신 요구",
  나가: "계약 해지",
  이사: "인도 주민등록",
  전입: "주민등록 전입신고",
  깡통: "보증금 회수 우선변제",
  떼이: "보증금 회수 우선변제",
  돌려받: "보증금 반환 회수 임차권등기명령",
  못받: "보증금 반환 회수 임차권등기명령",
  복비: "중개보수",
  수수료: "중개보수",
  부동산: "개업공인중개사",
  중개사: "개업공인중개사",
  신고: "임대차 계약의 신고",
  원상복구: "원상회복 차주",
  벽지: "원상회복",
  특약: "약정 강행규정",
};

/** 질문 말끝에 흔한 2글자 (해요·나요·있어…)는 검색에서 뺌 */
const STOP = new Set(["해요", "하나", "나요", "있어", "어요", "돼요", "되나", "는데", "하면", "해야", "할수", "수있", "건가", "인가", "가요", "까요", "을까", "는지", "어떡", "떡해", "대요", "린대", "갑자", "자기"]);

const K1 = 1.2;
const B = 0.75;

/** 한글·영문·숫자만 남기고 어절마다 2글자씩 자름. 1글자 어절은 그대로 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of text.toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").split(" ")) {
    if (!word) continue;
    if (word.length === 1) out.push(word);
    for (let i = 0; i + 1 < word.length; i++) out.push(word.slice(i, i + 2));
  }
  return out;
}

export function expandQuery(q: string) {
  const extra = Object.entries(QUERY_SYNONYMS)
    .filter(([k]) => q.includes(k))
    .map(([, v]) => v);
  return [q, ...extra].join(" ");
}

export interface LawIndex {
  chunks: LawChunk[];
  docs: Map<string, number>[]; // 문서별 토큰 빈도
  lens: number[];
  avgLen: number;
  df: Map<string, number>;
}

export function buildIndex(chunks: LawChunk[]): LawIndex {
  // 조문 제목은 본문보다 핵심어라 두 번 넣어 가중치를 줌
  const docs = chunks.map((c) => {
    const tf = new Map<string, number>();
    for (const t of tokenize(`${c.title} ${c.title} ${c.law} ${c.text}`)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });
  const lens = docs.map((d) => [...d.values()].reduce((a, b) => a + b, 0));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  return { chunks, docs, lens, avgLen: lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length), df };
}

export interface Hit {
  chunk: LawChunk;
  score: number;
}

export function search(index: LawIndex, question: string, k = 5): Hit[] {
  const terms = [...new Set(tokenize(expandQuery(question)))].filter((t) => !STOP.has(t));
  const N = index.chunks.length;
  const hits: Hit[] = index.docs.map((tf, i) => {
    let score = 0;
    for (const t of terms) {
      const f = tf.get(t);
      if (!f) continue;
      const n = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.lens[i]) / index.avgLen));
    }
    return { chunk: index.chunks[i], score };
  });
  return hits
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ── /api/ask 응답 (화면과 서버가 같이 씀) ─────────────────────
export interface AskSource {
  id: string;
  label: string; // "주택임대차보호법 제10조(강행규정)"
  text: string;
  url: string;
  cited: boolean;
}

export interface AskResult {
  answer: string | null; // Gemini 키가 없거나 실패하면 null → 화면은 조문만 보여 줌
  sources: AskSource[];
  /** file-search = Gemini API File Search가 찾음, llm = BM25로 찾고 Gemini가 설명, search = 조문만 */
  source: "file-search" | "llm" | "search";
}
