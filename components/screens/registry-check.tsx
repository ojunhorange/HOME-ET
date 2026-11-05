"use client";

import { useEffect, useRef, useState } from "react";
import { REGISTRY_MAX_BYTES, REGISTRY_MAX_MB, type RegistryResult, type Level } from "@/lib/registry-rules";
import { ToolShell } from "./tool-shell";
import { Badge, Button, Callout, Chip, Field, FinePrint, NumberInput, SectionLabel, TextInput, TextLink, type BadgeTone } from "@/components/ui";

const LEVEL: Record<Level, { label: string; tone: BadgeTone }> = {
  high: { label: "위험", tone: "solidAccent" },
  caution: { label: "주의", tone: "accent" },
  info: { label: "참고", tone: "neutral" },
};

const SOURCE_NOTE: Record<RegistryResult["source"], (diff: string[] | null) => string> = {
  "text+gemini": (diff) =>
    diff?.length
      ? "PDF 글자 판독과 Gemini 문서 이해, 두 방식으로 읽었는데 결과가 일부 달라요. "
      : "PDF 글자 판독과 Gemini 문서 이해, 두 방식으로 읽어 결과가 일치했어요. ",
  text: () => "PDF의 글자 위치로 읽은 결과예요. ",
  gemini: () => "Gemini 문서 이해로 읽은 결과예요. ",
};

// ── 화면 표시용 가리기 (발표·화면 공유용). 판단은 서버에서 원래 값으로 함 ─────────────
/** 은행·회사 같은 기관 이름은 가리지 않음 */
const ORG = /은행|주식회사|\(주\)|조합|공사|공단|회사|캐피탈|금고|보험|카드|협회|법인|신탁|중앙회/;
const maskName = (n: string) => (n.length <= 1 ? n : n[0] + "○".repeat(n.length - 1));
/** 동·읍·면까지만 보여 줌: "서울특별시 서초구 방배동 725외 …" → "서울특별시 서초구 방배동 ○○○" */
function maskAddress(a: string) {
  const parts = a.split(/\s+/);
  const i = parts.findIndex((t) => /(동|읍|면|가)$/.test(t) && !/^\d/.test(t));
  return i >= 0 ? `${parts.slice(0, i + 1).join(" ")} ○○○` : "주소 가림";
}
/** 결과 안의 사람 이름(소유자·권리자)을 모아 글 속에서 모두 가림 */
function nameMasker(r: RegistryResult) {
  const names = [
    ...r.facts.owners.map((o) => o.name),
    ...r.facts.rights.map((x) => x.holder ?? ""),
    ...r.facts.flags.map((x) => x.holder ?? ""),
  ]
    .map((n) => n.trim())
    .filter((n) => n && !ORG.test(n) && /^[가-힣]{2,5}$/.test(n))
    .sort((a, b) => b.length - a.length);
  return (text: string) => names.reduce((t, n) => t.split(n).join(maskName(n)), text);
}

const man = (won: number) => `${Math.round(won / 10_000).toLocaleString("ko-KR")}만 원`;

/**
 * 등기부등본 PDF → 위험 신호 (/api/registry, docs/registry.md)
 * 파일은 서버에서 읽고 바로 버림. 집주인 이름·시세도 이 화면에만 두고 저장하지 않음
 */
export function RegistryCheck({ deposit, bare }: { deposit: number; bare?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const scrollToResult = useRef(false); // 새로 검사했을 때만 결과로 내려감 (교차 검증으로 결과가 바뀔 때는 그대로)
  const [file, setFile] = useState<File | null>(null);
  const [landlord, setLandlord] = useState("");
  const [price, setPrice] = useState(0);
  const [result, setResult] = useState<RegistryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verify, setVerify] = useState<"idle" | "running" | "failed">("idle");
  const [masked, setMasked] = useState(true); // 화면 공유·발표 때 이름·주소가 보이지 않게 기본으로 가림
  const runId = useRef(0); // 새로 검사하면 이전 교차 검증 결과는 버림

  // 결과가 입력칸 아래에 생기니, 그려진 뒤 바로 보이게 (도우미 창 안에서는 창만 스크롤됨)
  useEffect(() => {
    if (!result || !scrollToResult.current) return;
    scrollToResult.current = false;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const send = (mode: "text" | "verify") => {
    const body = new FormData();
    body.set("file", file!);
    body.set("mode", mode);
    body.set("deposit", String(deposit));
    if (price > 0) body.set("price", String(price));
    if (landlord.trim()) body.set("landlord", landlord.trim());
    return fetch("/api/registry", { method: "POST", body });
  };

  /** Gemini 교차 검증: 결과를 먼저 보여 준 뒤 따로 돌림. 실패해도(붐빔 등) 앞의 결과는 그대로 */
  const runVerify = async (id: number) => {
    setVerify("running");
    try {
      const res = await send("verify");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as RegistryResult;
      if (runId.current !== id) return;
      setResult(json);
      setVerify("idle");
    } catch {
      if (runId.current === id) setVerify("failed");
    }
  };

  const check = async () => {
    if (!file || loading) return;
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    setVerify("idle");
    try {
      const res = await send("text");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "등기부등본을 읽지 못했어요.");
      const r = json as RegistryResult;
      scrollToResult.current = true;
      setResult(r);
      if (r.canVerify) void runVerify(id);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "등기부등본을 읽지 못했어요.");
    } finally {
      setLoading(false);
    }
  };

  const counts = result
    ? (["high", "caution"] as const).map((l) => ({ l, n: result.signals.filter((s) => s.level === l).length })).filter((c) => c.n)
    : [];
  const live = result?.facts.rights.filter((r) => !r.cancelled) ?? [];
  const hide = result && masked ? nameMasker(result) : (t: string) => t;
  const liveFlags = result?.facts.flags.filter((f) => !f.cancelled) ?? [];

  return (
    <ToolShell bare={bare} title="등기부등본 확인하기" meta="계약 전 · 잔금 전날">
      <p className="mt-2 text-sm text-fg-sub">
        인터넷등기소에서 열람한 등기사항전부증명서 PDF를 올리면 소유자, 근저당, 압류 같은 위험 신호를 찾아 드려요.
      </p>

      <div className="mt-4 grid gap-3 @2xl:grid-cols-3">
        <Field label="등기부등본 PDF" htmlFor="reg-file">
          <input
            ref={fileRef}
            id="reg-file"
            type="file"
            accept="application/pdf"
            className="block w-full text-sm text-fg-sub file:mr-3 file:rounded-control file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setResult(null);
              // 서버에 보내기 전에 크기부터 확인 (한도를 넘으면 Vercel이 우리 안내 없이 거절함)
              if (f && f.size > REGISTRY_MAX_BYTES) {
                setFile(null);
                e.target.value = "";
                setError(`${REGISTRY_MAX_MB}MB 이하 PDF만 올릴 수 있어요. 인터넷등기소에서 받은 등본은 보통 1MB가 안 돼요.`);
                return;
              }
              setFile(f);
              setError(null);
            }}
          />
        </Field>
        <Field label="계약 상대 이름 (선택)" htmlFor="reg-landlord" hint="등본의 소유자와 같은지 확인해요">
          <TextInput id="reg-landlord" value={landlord} onChange={(e) => setLandlord(e.target.value)} placeholder="예: 홍길동" autoComplete="off" />
        </Field>
        <Field label="집 매매 시세 (선택)" htmlFor="reg-price" hint="빚 + 보증금이 집값의 몇 %인지 계산해요">
          <NumberInput id="reg-price" suffix="원" step={10_000_000} value={price} onChange={setPrice} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <FinePrint>내 보증금 {man(deposit)} 기준 · 파일은 저장하지 않고 확인 후 바로 버려요.</FinePrint>
        <Button onClick={check} disabled={!file || loading}>
          {loading ? "등본 읽는 중…" : "등본 확인하기"}
        </Button>
      </div>

      {error && (
        <Callout tone="warning" className="mt-4">
          {error}
        </Callout>
      )}

      {result && (
        <div ref={resultRef} className="mt-5 scroll-mt-4 space-y-5" aria-live="polite">
          <div className="rounded-panel bg-surface-muted p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-bold">
                {result.facts.propertyType && `[${result.facts.propertyType}] `}
                {masked ? maskAddress(result.facts.address) : result.facts.address}
              </p>
              <Chip selected={masked} onClick={() => setMasked((m) => !m)}>
                {masked ? "✓ 이름·주소 가리는 중" : "이름·주소 가리기"}
              </Chip>
            </div>
            <p className="mt-1 text-fg-sub">
              열람일 {result.facts.viewedAt ?? "확인 불가"} · 소유자{" "}
              {result.facts.owners.map((o) => `${hide(o.name)}${o.share === "1" ? "" : `(${o.share})`}`).join(", ") || "확인 불가"}
            </p>
            <p className="mt-1 text-fg-sub">
              {counts.length ? counts.map((c) => `${LEVEL[c.l].label} ${c.n}건`).join(" · ") : "위험·주의 신호 없음"}
              {" · "}살아 있는 권리 {live.length + liveFlags.length}건
            </p>
          </div>

          <div className="space-y-2">
            <SectionLabel>확인할 것</SectionLabel>
            {result.signals.map((s, i) => (
              <div key={i} className="rounded-panel border border-border p-4">
                <div className="flex items-start gap-3">
                  <Badge tone={LEVEL[s.level].tone} className="shrink-0">
                    {LEVEL[s.level].label}
                  </Badge>
                  <div className="min-w-0">
                    <p className="font-bold">{hide(s.title)}</p>
                    <p className="mt-1 text-sm leading-relaxed text-fg-sub">{hide(s.detail)}</p>
                    {s.laws.some((id) => result.laws[id]) && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {s.laws
                          .filter((id) => result.laws[id])
                          .map((id) => (
                            <TextLink key={id} href={result.laws[id].url} target="_blank" rel="noopener noreferrer" className="text-xs">
                              {result.laws[id].label} ↗
                            </TextLink>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {(live.length > 0 || liveFlags.length > 0) && (
            <div className="space-y-2">
              <SectionLabel>지금 살아 있는 기록</SectionLabel>
              <ul className="divide-y divide-border rounded-panel border border-border text-sm">
                {liveFlags.map((f) => (
                  <li key={`갑${f.rank}`} className="flex justify-between gap-3 px-4 py-2.5">
                    <span>
                      갑구 {f.rank}번 · {f.kind}
                    </span>
                    <span className="text-fg-sub">{f.date}</span>
                  </li>
                ))}
                {live.map((r) => (
                  <li key={`을${r.rank}`} className="flex justify-between gap-3 px-4 py-2.5">
                    <span>
                      을구 {r.rank}번 · {r.kind}
                      {r.holder ? ` · ${hide(r.holder)}` : ""}
                    </span>
                    <span className="shrink-0 tabular-nums text-fg-sub">{r.amount ? man(r.amount) : r.date}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {verify === "running" && <Callout tone="neutral">Gemini 문서 이해로 한 번 더 읽어 교차 검증하는 중이에요… (10~30초)</Callout>}
          {verify === "failed" && (
            <Callout tone="neutral">
              지금은 Gemini가 붐벼서 교차 검증을 하지 못했어요. 위 결과는 PDF 글자 판독으로 읽은 거예요.{" "}
              <button type="button" className="font-semibold text-primary underline" onClick={() => void runVerify(runId.current)}>
                다시 시도
              </button>
            </Callout>
          )}

          <FinePrint>
            {SOURCE_NOTE[result.source](result.differences)}
            등기부등본 원문과 다를 수 있으니 중요한 내용은 원문과 공인중개사 설명으로 꼭 확인하세요. 법률 자문이 아니에요.
          </FinePrint>
          <Button
            variant="ghost"
            onClick={() => {
              runId.current++;
              setVerify("idle");
              setResult(null);
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            결과 지우기
          </Button>
        </div>
      )}
    </ToolShell>
  );
}
