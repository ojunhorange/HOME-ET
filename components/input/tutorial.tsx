"use client";

import { useRef, useState, type ReactNode } from "react";
import { Badge, Button, Dialog, Meter } from "@/components/ui";
import { cx } from "@/components/ui/styles";
import { QUESTIONS } from "./questions";

const SEEN_KEY = "home-et:tutorial-seen";

/** 처음 들어온 사람인지 (튜토리얼을 아직 안 닫음). 저장소를 못 쓰면 매번 띄우지 않도록 false */
export function tutorialUnseen() {
  try {
    return localStorage.getItem(SEEN_KEY) === null;
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* 저장소를 못 쓰는 환경이면 그냥 넘어감 */
  }
}

/** 한 장 = 그림(실제 화면을 줄인 미리보기) + 제목 + 설명 */
const SLIDES: { title: string; body: string; art: ReactNode }[] = [
  {
    title: `질문 ${QUESTIONS.length}개에 답해요`,
    body: "학교, 본가, 통학 경로, 대학생활 목표를 물어봐요. 통학 경로는 Google 지도가 찾아 줘서 고르기만 하면 돼요.",
    art: <QuestionsArt />,
  },
  {
    title: "자취지수로 비교해요",
    body: "통학으로 잃는 시간과 체력을 돈으로 바꿔 0~100점으로 보여 드려요. 50점보다 높으면 자취가 이득이에요.",
    art: <ScoreArt />,
  },
  {
    title: "손해 안 보는 월세를 알려 드려요",
    body: "자취지수가 50이 되는 월세를 거꾸로 계산해 학교 주변 동네 시세와 비교해 드려요.",
    art: <RentArt />,
  },
  {
    title: "계약 일정은 캘린더로 챙겨요",
    body: "계약일과 입주일만 넣으면 단계별 할 일과 용어를 알려 드리고, Google 캘린더에 한 번에 넣어 드려요.",
    art: <DdayArt />,
  },
];

/** 랜딩 사용법 안내 (4장). 닫으면 다시 자동으로 뜨지 않음 */
export function Tutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const touchX = useRef<number | null>(null);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  const close = () => {
    markSeen();
    onClose();
    setI(0);
  };
  const goTo = (n: number) => {
    if (n < 0 || n >= SLIDES.length) return;
    setDir(n > i ? 1 : -1);
    setI(n);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={slide.title}
      actions={
        <>
          {i === 0 ? (
            <Button variant="secondary" onClick={close}>
              건너뛰기
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => goTo(i - 1)}>
              이전
            </Button>
          )}
          <Button onClick={last ? close : () => goTo(i + 1)}>{last ? "시작하기" : "다음"}</Button>
        </>
      }
    >
      {/* 좌우로 밀어서 넘기기 (모바일) */}
      <div
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 40) goTo(dx < 0 ? i + 1 : i - 1);
        }}
      >
        <div key={i} className={dir > 0 ? "motion-safe:animate-step-next" : "motion-safe:animate-step-prev"}>
          <div className="mb-4 rounded-panel bg-surface-muted p-4" aria-hidden>
            {slide.art}
          </div>
          <p>{slide.body}</p>
        </div>
        <div className="mt-5 flex justify-center gap-1.5" role="tablist" aria-label="안내 단계">
          {SLIDES.map((s, n) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={n === i}
              aria-label={`${n + 1}번째 안내: ${s.title}`}
              onClick={() => goTo(n)}
              className={cx("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-primary" : "w-1.5 bg-track")}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}

// ── 장마다 그림 (실제 화면 부품을 작게) ─────────────────────────────

function QuestionsArt() {
  return (
    <div>
      <div className="h-1 overflow-hidden rounded-full bg-track">
        <div className="h-full w-2/5 rounded-full bg-primary" />
      </div>
      <p className="mt-3 text-xs font-semibold text-primary">통학 경로</p>
      <p className="mt-0.5 text-[15px] font-bold text-fg">평소 이렇게 통학하나요?</p>
      <div className="mt-2.5 space-y-1.5">
        {["지하철 4호선 → 2호선 · 1시간 25분", "버스 → 지하철 · 1시간 32분"].map((t, n) => (
          <div
            key={t}
            className={cx(
              "rounded-control border px-3 py-2 text-xs font-semibold",
              n === 0 ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface/60 text-fg-sub",
            )}
          >
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreArt() {
  return (
    <div>
      <p className="text-xs text-fg-sub">나의 자취지수</p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight tabular-nums text-primary">68</span>
        <span className="text-sm text-fg-muted">/ 100</span>
      </p>
      <div className="mt-3">
        <Meter value={68} marker size="sm" />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-fg-muted">
        <span>통학이 나아요</span>
        <span>50</span>
        <span>자취가 이득</span>
      </div>
    </div>
  );
}

function RentArt() {
  const rows = [
    { name: "안암동", rent: 52, ok: true },
    { name: "제기동", rent: 48, ok: true },
    { name: "보문동", rent: 63, ok: false },
  ];
  return (
    <div>
      <p className="text-xs text-fg-sub">손해 안 보는 월세 상한</p>
      <p className="mt-0.5 text-2xl font-bold tracking-tight text-fg">
        58<span className="ml-0.5 text-sm font-semibold text-fg-muted">만 원</span>
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between rounded-control bg-surface/70 px-3 py-1.5 text-xs">
            <span className="font-semibold text-fg">{r.name}</span>
            <span className="tabular-nums text-fg-sub">
              시세 {r.rent}만 원 <b className={r.ok ? "text-primary" : "text-accent"}>{r.ok ? "추천" : "초과"}</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DdayArt() {
  const rows = [
    { badge: "오늘", tone: "solidAccent" as const, title: "계약 전 확인", sub: "등기부등본 열람" },
    { badge: "D-5", tone: "neutral" as const, title: "계약일", sub: "계약금 · 특약 확인" },
    { badge: "D-41", tone: "neutral" as const, title: "잔금·입주일", sub: "전입신고 · 확정일자" },
  ];
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.title} className="flex items-center gap-3 rounded-control bg-surface/70 px-2.5 py-2">
          <Badge tone={r.tone} className="h-7 w-12 shrink-0 rounded-lg px-0!">
            {r.badge}
          </Badge>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-fg">{r.title}</span>
            <span className="block text-[11px] text-fg-muted">{r.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
