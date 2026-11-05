"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { onAssistantRequest, type AssistantMode } from "@/lib/assistant-events";
import type { AskResult } from "@/lib/law-search";
import { cx, focusRing } from "@/components/ui/styles";
import { RegistryCheck } from "@/components/screens/registry-check";

/** 자주 묻는 질문: 근거 조문이 확실히 나오는 것으로 고름 */
const SUGGESTIONS = [
  { label: "월세 10% 인상", question: "집주인이 재계약 때 월세를 10% 올린대요" },
  { label: "보일러 수리는 누가?", question: "보일러가 고장 나면 수리는 누가 해요?" },
  { label: "보증금을 못 돌려받으면?", question: "계약 끝났는데 보증금을 못 돌려받으면 어떡해요?" },
  { label: "집주인이 바뀌면?", question: "집주인이 바뀌면 저는 나가야 하나요?" },
];

type Message =
  | { role: "user"; text: string }
  | { role: "bot"; text: string; result?: AskResult; error?: boolean };

const TITLE: Record<AssistantMode, string> = {
  home: "HOME:ET 도우미",
  law: "계약서·특약 물어보기",
  registry: "등기부등본 확인하기",
};

/**
 * 오른쪽 아래 동그란 도우미 버튼 + 튀어나오는 창 (은행 앱 상담 버튼처럼).
 * 페이지는 스크롤하지 않고 창 안에서만 스크롤. 데스크톱은 떠 있는 창, 모바일은 아래에서 올라오는 시트.
 * 등본 확인·특약 물어보기는 화면에 따로 두지 않고 이 창의 첫 화면 버튼으로만 들어감.
 * 다른 화면에서 특정 기능으로 열고 싶으면 openAssistant({ mode })를 쓰면 됨 (lib/assistant-events.ts)
 */
export function Assistant({ deposit }: { deposit: number }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("home");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<(q: string) => void>(() => {});

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || asking) return;
    setMode("law");
    setDraft("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setAsking(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const result = (await res.json()) as AskResult;
      const text =
        result.answer ??
        (result.sources.length
          ? "지금은 설명을 만들지 못해서, 관련 조문만 찾아 드렸어요."
          : "관련 조문을 찾지 못했어요. 다른 말로 물어보거나 공인중개사, 대한법률구조공단(132)에 확인해 보세요.");
      setMessages((m) => [...m, { role: "bot", text, result }]);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "답변을 가져오지 못했어요. 잠시 뒤에 다시 시도해 주세요.", error: true }]);
    } finally {
      setAsking(false);
    }
  };
  // 이벤트로 열 때 최신 ask를 부르도록 (렌더 중에는 ref를 바꾸지 않음)
  useEffect(() => {
    askRef.current = ask;
  });

  // 다른 화면에서 열기 (예: 계약 D-day의 "등기부등본 확인하기" 버튼)
  useEffect(
    () =>
      onAssistantRequest((req) => {
        setOpen(true);
        setMode(req.mode);
        if (req.question) askRef.current(req.question);
      }),
    [],
  );

  // Esc로 닫기, 모바일 시트가 열려 있으면 뒤 페이지 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const prev = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 새 메시지가 오면 창 안에서만 맨 아래로
  useEffect(() => {
    const el = scrollRef.current;
    if (el && mode === "law") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, asking, mode]);

  useEffect(() => {
    if (open && mode === "law") inputRef.current?.focus();
  }, [open, mode]);

  const close = () => {
    setOpen(false);
    fabRef.current?.focus();
  };

  return (
    <>
      {/* 동그란 버튼. 모바일은 하단 고정 버튼 바 위에 */}
      <button
        ref={fabRef}
        type="button"
        aria-label={open ? "도우미 닫기" : "도우미 열기"}
        aria-expanded={open}
        aria-controls="home-et-assistant"
        onClick={() => (open ? close() : setOpen(true))}
        className={cx(
          "fixed right-4 z-40 grid h-16 w-16 place-items-center rounded-full bg-primary text-on-primary shadow-[0_10px_28px_rgb(27_42_74/0.28)] transition hover:bg-primary-hover active:scale-95",
          "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 md:right-6",
          open && "max-md:hidden",
          focusRing,
        )}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      {/* 닫아도 남겨 두고 숨기기만: 올린 등본 결과·대화가 유지됨 */}
      <div
          hidden={!open}
          id="home-et-assistant"
          role="dialog"
          aria-label={TITLE[mode]}
          className={cx(
            "fixed z-50 flex flex-col overflow-hidden border border-glass-border bg-surface shadow-[0_18px_48px_rgb(27_42_74/0.22)] motion-safe:animate-rise",
            // 모바일: 아래에서 올라오는 시트 / 데스크톱: 버튼 위에 떠 있는 창
            "inset-x-0 bottom-0 h-[88dvh] rounded-t-card",
            "md:inset-x-auto md:bottom-28 md:right-6 md:h-[min(640px,calc(100dvh-9rem))] md:w-[400px] md:rounded-card",
          )}
        >
          {/* 머리 */}
          <div className="flex items-center gap-2 border-b border-glass-border px-4 py-3">
            {mode !== "home" && (
              <IconButton label="처음으로" onClick={() => setMode("home")}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M11 4 6 9l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </IconButton>
            )}
            <p className="flex-1 truncate text-[15px] font-bold">{TITLE[mode]}</p>
            <IconButton label="닫기" onClick={close}>
              <CloseIcon />
            </IconButton>
          </div>

          {/* 본문: 이 안에서만 스크롤 */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {mode === "home" && (
              <div className="space-y-4">
                <Bubble>
                  안녕하세요! 무엇을 도와드릴까요?
                  <span className="mt-1 block text-fg-sub">계약 전에 등본을 확인하거나, 계약서·특약에서 궁금한 걸 물어보세요.</span>
                </Bubble>
                <div className="grid gap-2">
                  <MenuButton icon={<DocIcon />} title="등기부등본 확인하기" sub="등본 PDF로 소유자·근저당 위험 신호 찾기" onClick={() => setMode("registry")} />
                  <MenuButton icon={<ScaleIcon />} title="계약서·특약 물어보기" sub="궁금한 문장을 법 조문으로 쉽게 설명" onClick={() => setMode("law")} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-fg-sub">자주 묻는 질문</p>
                  <Suggestions onPick={ask} />
                </div>
              </div>
            )}

            {mode === "law" && (
              <div className="space-y-3">
                <Bubble>
                  계약서 문장이나 궁금한 점을 적어 주세요. 주택임대차보호법·민법 같은 관련 조문을 찾아 쉽게 설명해 드려요.
                </Bubble>
                {messages.length === 0 && <Suggestions onPick={ask} />}
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-line rounded-[18px] rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-on-primary">{m.text}</p>
                    </div>
                  ) : (
                    <Bubble key={i} tone={m.error ? "warning" : "default"}>
                      <span className="whitespace-pre-line">{m.text}</span>
                      {m.result && m.result.sources.length > 0 && <Sources result={m.result} />}
                    </Bubble>
                  ),
                )}
                {asking && (
                  <Bubble>
                    <span className="text-fg-sub">조문 찾는 중…</span>
                  </Bubble>
                )}
              </div>
            )}

            {/* 등본: 접었다 다른 메뉴를 봐도 결과가 남게 숨기기만 함 */}
            <div hidden={mode !== "registry"}>
              <RegistryCheck deposit={deposit} bare />
            </div>
          </div>

          {/* 특약 질문 입력 (아래 고정) */}
          {mode === "law" && (
            <form
              className="flex items-end gap-2 border-t border-glass-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
            >
              <textarea
                ref={inputRef}
                aria-label="질문"
                rows={1}
                maxLength={500}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                placeholder="예: 나갈 때 벽지 원상복구를 해야 하나요?"
                className="max-h-28 min-h-11 flex-1 resize-none rounded-[14px] border border-primary/18 bg-surface/80 px-3.5 py-2.5 text-base text-fg outline-none focus:border-primary md:text-[15px]"
              />
              <button
                type="submit"
                disabled={!draft.trim() || asking}
                aria-label="보내기"
                className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary transition disabled:opacity-40", focusRing)}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M9 14V4M4.5 8.5 9 4l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          )}

          <p className="border-t border-glass-border px-4 py-2 text-[11px] leading-snug text-fg-muted">
            일반 정보이며 법률 자문이 아니에요. 실제 계약은 원문과 공인중개사 설명으로 꼭 확인하세요.
          </p>
        </div>
    </>
  );
}

function Bubble({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warning" }) {
  return (
    <div className="flex">
      <div
        className={cx(
          "max-w-[92%] rounded-[18px] rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed",
          tone === "warning" ? "bg-accent-soft text-accent" : "bg-surface-muted text-fg",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUGGESTIONS.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onPick(s.question)}
          className={cx("rounded-full border border-primary/20 bg-surface px-3 py-1.5 text-[13px] font-semibold text-primary transition hover:bg-primary-soft", focusRing)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** 답변 아래 근거 조문: 이름만 보이고 누르면 원문 + 법제처 링크 */
function Sources({ result }: { result: AskResult }) {
  const list = result.answer ? result.sources.filter((s) => s.cited) : result.sources;
  const shown = list.length ? list : result.sources;
  return (
    <div className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
      <p className="text-xs font-semibold text-fg-sub">{result.answer ? "근거 조문" : "관련 조문"}</p>
      {shown.map((s) => (
        <details key={s.id} className="rounded-xl bg-surface px-3 py-2">
          <summary className="cursor-pointer list-none text-[13px] font-bold text-primary">{s.label}</summary>
          <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-fg-sub">{s.text}</p>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-xs font-semibold text-primary hover:underline">
            법제처에서 원문 보기 ↗
          </a>
        </details>
      ))}
      {result.source === "file-search" && <p className="text-[11px] text-fg-muted">Gemini API File Search로 찾은 조문이에요.</p>}
    </div>
  );
}

function MenuButton({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("flex w-full items-center gap-3 rounded-panel border border-border bg-surface p-3.5 text-left transition hover:bg-surface-muted", focusRing)}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-xs text-fg-sub">{sub}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-fg-muted">
        <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cx("grid h-9 w-9 place-items-center rounded-full text-fg-sub transition hover:bg-surface-muted", focusRing)}>
      {children}
    </button>
  );
}

function ChatIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 26 26" fill="none" aria-hidden>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h11A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A1.5 1.5 0 0 1 5 15.5v-9Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M9.5 10.5h.01M13 10.5h.01M16.5 10.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5.5 2.75h6l3.75 3.75v10a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75V3.5a.75.75 0 0 1 .75-.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11.25 2.75V6.5h3.75M7.5 10.5h5M7.5 13.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 3v13.5M6 16.5h8M4 6h12M10 3.5 4 6M10 3.5 16 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4 6-2.25 5a2.5 2.5 0 0 0 4.5 0L4 6ZM16 6l-2.25 5a2.5 2.5 0 0 0 4.5 0L16 6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
