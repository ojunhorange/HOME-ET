"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { AppState } from "@/lib/app-state";
import { WRONG_ACCOUNT, buildIcs, calendarEvents, type Step } from "@/lib/dday";
import { ddayModel, type DdayItem } from "@/lib/view-models";
import { useAuth } from "@/components/providers";
import {
  ActionBar, Badge, Button, ButtonAnchor, Callout, Card, CardTitle, Dialog, Eyebrow, Field, FinePrint, LinkButton, NumberInput,
  SectionLabel, TermCard, TextInput, TextLink, TimelineItem, type BadgeTone,
} from "@/components/ui";
import { cx, focusRing } from "@/components/ui/styles";

const badgeTone = (it: DdayItem): BadgeTone => (it.isToday ? "solidAccent" : it.done ? "muted" : "neutral");

function downloadIcs(content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "home-et-계약-일정.ics";
  a.click();
  URL.revokeObjectURL(url);
}

/** 캘린더 권한 로그인에서 돌아오면 붙는 표시. 보이면 등록을 이어서 진행 */
const RESUME_PARAM = "gcal";

type SyncState =
  | { kind: "idle" | "saving" | "ask" }
  | { kind: "done"; count: number; firstDate: string }
  | { kind: "error"; message: string };

/** 로그인한 사람의 Google 캘린더에 단계별 일정을 넣는다. 권한이 없으면 권한 요청부터 */
function useGoogleCalendar(steps: Step[], enabled: boolean) {
  const auth = useAuth();
  const [sync, setSync] = useState<SyncState>({ kind: "idle" });
  const resumed = useRef(false);

  const connect = () => {
    const url = new URL(window.location.href);
    url.searchParams.set(RESUME_PARAM, "1");
    auth.connectCalendar(url.pathname + url.search);
  };

  const save = async () => {
    if (!auth.calendar) return setSync({ kind: "ask" });
    setSync({ kind: "saving" });
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: calendarEvents(steps) }),
      });
      if (res.status === 401) return setSync({ kind: "ask" }); // 권한이 풀렸거나 만료 → 다시 받기
      if (!res.ok) throw new Error(String(res.status));
      const { count } = (await res.json()) as { count: number };
      setSync({ kind: "done", count, firstDate: calendarEvents(steps)[0].start });
    } catch {
      setSync({ kind: "error", message: "Google 캘린더에 연결하지 못했어요. 잠시 뒤 다시 눌러 주세요." });
    }
  };

  // 권한 화면에서 돌아오면 버튼을 다시 누르지 않아도 바로 등록
  const resume = useEffectEvent(() => {
    if (resumed.current) return;
    const url = new URL(window.location.href);
    const flag = url.searchParams.get(RESUME_PARAM);
    if (flag === null) return;
    resumed.current = true;
    url.searchParams.delete(RESUME_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    // 다른 계정을 골라서 서버가 거절함 (기존 로그인은 그대로)
    if (flag === WRONG_ACCOUNT) {
      const who = auth.email ? `로그인한 계정(${auth.email})` : "로그인한 계정";
      return setSync({ kind: "error", message: `다른 Google 계정을 골라서 등록하지 않았어요. ${who}으로 다시 눌러 주세요.` });
    }
    if (!enabled) return;
    // Google 권한 화면에서 캘린더 항목을 끄고 돌아온 경우
    if (!auth.calendar) setSync({ kind: "error", message: "캘린더 권한이 허용되지 않아 등록하지 못했어요. 다시 누르면 권한을 요청해요." });
    else void save();
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부(OAuth 리디렉션)에서 돌아온 걸 이어받음
    if (auth.status !== "loading") resume();
  }, [auth.status]);

  return {
    available: auth.enabled,
    /** 로그인 안 한 상태: 캘린더 버튼 대신 로그인 유도 카드 + .ics */
    needsLogin: auth.enabled && auth.status === "unauthenticated",
    loading: auth.status === "loading",
    signingIn: auth.signingIn,
    signIn: () => auth.signIn(),
    sync, setSync, save, connect,
  };
}

/** 2026-03-05 → Google 캘린더 그날 화면 */
const calendarDayUrl = (ymd: string) => `https://calendar.google.com/calendar/r/day/${ymd.replaceAll("-", "/")}`;

export function DdayScreen({
  state, update, today, onBack,
}: {
  state: AppState;
  update: (patch: Partial<AppState>) => void;
  today: Date;
  onBack: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false); // 모바일: 열린 단계를 다시 누르면 접힘
  const m = ddayModel(state, today, picked);
  const sel = m.selected;
  const gcal = useGoogleCalendar(m.steps, m.valid);
  const closeSync = () => gcal.setSync({ kind: "idle" });
  // 로그인한(또는 확인 중인) 상태에서만 Google 캘린더 등록이 기본 버튼. 아니면 .ics가 기본
  const gcalPrimary = gcal.available && !gcal.needsLogin;
  const extras = (
    <>
      {gcalPrimary && (
        <div className="flex justify-end max-md:justify-center md:mt-3 lg:justify-center">
          <LinkButton disabled={!m.valid} onClick={() => downloadIcs(buildIcs(m.steps))} className="font-medium text-fg-sub">
            Apple·다른 캘린더는 .ics 파일 받기
          </LinkButton>
        </div>
      )}
      {gcal.sync.kind === "error" && (
        <Callout tone="warning" className="mt-2 text-right max-md:text-center lg:text-center">
          {gcal.sync.message}
        </Callout>
      )}
    </>
  );
  const calendarButton = (className?: string) =>
    gcalPrimary ? (
      <Button size="lg" className={className} disabled={!m.valid || gcal.loading || gcal.sync.kind === "saving"} onClick={gcal.save}>
        {gcal.sync.kind === "saving" ? "캘린더에 넣는 중…" : "Google 캘린더에 등록"}
      </Button>
    ) : (
      <Button size="lg" className={className} disabled={!m.valid} onClick={() => downloadIcs(buildIcs(m.steps))}>
        캘린더 파일 받기 (.ics)
      </Button>
    );

  return (
    <div>
      {/* 데스크톱은 한 화면에 들어가게 제목 영역을 조금 작게 */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px] lg:text-2xl">첫 계약, 언제 무엇을 하면 될까?</h1>
        <p className="mt-2 text-[15px] text-fg-sub">날짜만 넣으면 단계별 D-day를 알려 드리고, 그때 꼭 알아야 할 용어를 쉽게 풀어 드려요.</p>
      </div>

      {/* 데스크톱(lg): 왼쪽 계약 정보 + 캘린더 버튼 | 오른쪽 가로 타임라인 → 단계 설명·용어. 그보다 좁으면: 계약 정보 → 세로 타임라인
          왼쪽 카드는 오른쪽 열과 아래 끝을 맞추고(stretch), 캘린더·돌아가기 버튼은 카드 맨 아래에 (등본·특약은 도우미로 빠져 오른쪽이 짧음) */}
      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-stretch">
        <Card padding="sm" className="flex flex-col">
          <CardTitle>내 계약 정보</CardTitle>
          {/* 2×2: 계약일 | 잔금·입주일 / 보증금 | 월세 (데스크톱도 2×2: 한 화면에 들어가게) */}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
            <Field label="계약일" htmlFor="contract">
              <TextInput id="contract" type="date" value={state.contract} onChange={(e) => update({ contract: e.target.value })} />
            </Field>
            <Field label="잔금·입주일" htmlFor="balance">
              <TextInput id="balance" type="date" value={state.balance} min={state.contract} onChange={(e) => update({ balance: e.target.value })} />
            </Field>
            <Field label="보증금" htmlFor="deposit">
              <NumberInput id="deposit" suffix="원" step={1_000_000} value={state.leaseDeposit} onChange={(v) => update({ leaseDeposit: v })} />
            </Field>
            <Field label="월세" htmlFor="rent">
              <NumberInput id="rent" suffix="원" step={10_000} value={state.leaseRent} onChange={(v) => update({ leaseRent: v })} />
            </Field>
          </div>
          {!m.valid && (
            <Callout tone="warning" className="mt-3">
              잔금·입주일은 계약일과 같거나 그 뒤여야 해요.
            </Callout>
          )}
          {/* 로그인 안 했으면: 로그인하면 캘린더에 바로 넣을 수 있다는 한 줄 (예전엔 따로 카드였는데 한 화면에 들어가게 여기로) */}
          {gcal.needsLogin && (
            <p className="mt-3 text-xs leading-relaxed text-fg-sub">
              로그인하면 단계별 일정을 Google 캘린더에 바로 넣을 수 있어요.{" "}
              <LinkButton onClick={gcal.signIn} disabled={gcal.signingIn} aria-busy={gcal.signingIn} className="text-xs">
                {gcal.signingIn ? "이동 중…" : "Google로 로그인"}
              </LinkButton>
            </p>
          )}
          {/* 데스크톱: 캘린더 버튼·돌아가기·안내를 이 카드 안에 (아래 버튼 줄 없이 한 화면에) */}
          <div className="mt-auto hidden pt-4 lg:block">
            {calendarButton("w-full")}
            {extras}
            <Button variant="ghost" size="sm" onClick={onBack} className="mt-2 w-full">
              ← 월세 추천으로 돌아가기
            </Button>
            <FinePrint className="mt-3 text-[11px]">{DISCLAIMER}</FinePrint>
          </div>
        </Card>

        <div className="min-w-0 space-y-5 lg:space-y-4">
          {m.valid && sel && (
            <>
              {/* 좁은 화면: 세로 타임라인, 고른 단계 설명이 바로 아래 펼쳐짐 */}
              <Card className="lg:hidden">
                <CardTitle meta={`오늘 ${m.todayText} 기준`}>D-day 타임라인</CardTitle>
                <ol className="mt-4 space-y-2">
                  {m.items.map((it) => (
                    <li key={it.key}>
                      <TimelineItem
                        badge={it.badge}
                        badgeTone={badgeTone(it)}
                        title={it.title}
                        sub={it.dateText}
                        done={it.done}
                        selected={it.key === sel.key}
                        expanded={it.key === sel.key && !collapsed}
                        onSelect={() => {
                          if (it.key === sel.key) return setCollapsed((c) => !c);
                          setPicked(it.key);
                          setCollapsed(false);
                        }}
                      />
                      {it.key === sel.key && !collapsed && (
                        <div className="px-1 pb-3 pt-4 motion-safe:animate-rise">
                          <p className="text-[15px] leading-relaxed">{sel.todo}</p>
                          <Terms terms={sel.terms} className="mt-6" />
                          <StepCalendarLink href={sel.calendarUrl} />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </Card>

              {/* 데스크톱: 가로 타임라인 (뒤로 이어지는 선 위에 단계 카드) */}
              <Card padding="sm" className="hidden lg:block">
                <div className="px-1">
                  <CardTitle meta={`오늘 ${m.todayText} 기준`}>D-day 타임라인</CardTitle>
                </div>
                <div className="relative mt-4">
                  <div aria-hidden className="absolute inset-x-[30px] top-[30px] h-0.5 bg-primary/14" />
                  <ol className="relative grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
                    {m.items.map((it) => {
                      const on = it.key === sel.key;
                      return (
                        <li key={it.key}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => setPicked(it.key)}
                            className={cx(
                              "flex h-full w-full flex-col items-start gap-2 rounded-[18px] border p-3.5 text-left transition",
                              focusRing,
                              on ? "border-primary/30 bg-surface/90 shadow-[0_8px_22px_rgb(27_42_74/0.12)]" : "border-glass-border bg-surface/40 hover:bg-surface/70",
                            )}
                          >
                            <Badge tone={badgeTone(it)} className="rounded-[10px]! text-[13px]!">
                              {it.badge}
                            </Badge>
                            <span className={cx("text-[15px]", on ? "font-bold" : "font-semibold", it.done && "text-fg-muted line-through")}>{it.title}</span>
                            <span className="text-xs text-fg-sub">{it.dateText}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </Card>

              {/* 데스크톱: 고른 단계 설명 */}
              <Card padding="sm" className="hidden lg:block">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Eyebrow>
                      {sel.badge} · {sel.dateText}
                    </Eyebrow>
                    <h2 className="mt-1 text-xl font-bold tracking-tight">{sel.title}</h2>
                  </div>
                  <StepCalendarLink href={sel.calendarUrl} className="mt-0 shrink-0" />
                </div>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-sub">{sel.todo}</p>
                {/* 용어도 같은 카드 안에 (카드 사이 여백을 줄여 한 화면에) */}
                <Terms terms={sel.terms} className="mt-4" cards />
              </Card>
            </>
          )}

          {/* 등기부등본 확인·계약서 특약 질문은 화면에 두지 않고 오른쪽 아래 도우미(components/assistant)에서 */}

        </div>
      </div>

      {/* 모바일: 하단 고정 (좁은 '이전' + 캘린더 등록), 태블릿: 오른쪽 정렬 버튼 줄, 데스크톱(lg): 캘린더 버튼은 왼쪽 카드에 있어서 '돌아가기'만 */}
      <div className="mt-5 lg:hidden">
        {/* 모바일: 고정 바가 차지하는 빈칸 위에, 태블릿: 버튼 줄 아래. 데스크톱은 왼쪽 카드 안에 */}
        <div className="md:hidden">{extras}</div>
        <ActionBar desktopClassName="md:justify-end md:border-0 md:bg-transparent md:p-0 lg:justify-start">
          <Button variant="secondary" size="lg" onClick={onBack} className="max-md:w-24 max-md:flex-none!">
            <span className="md:hidden">이전</span>
            <span className="hidden md:inline">월세 추천으로 돌아가기</span>
          </Button>
          {calendarButton("lg:hidden")}
        </ActionBar>
        <div className="max-md:hidden lg:hidden">{extras}</div>
      </div>

      <Dialog
        open={gcal.sync.kind === "ask"}
        onClose={closeSync}
        title="Google 캘린더 권한이 필요해요"
        actions={
          <>
            <Button variant="secondary" onClick={closeSync}>
              취소
            </Button>
            <Button onClick={gcal.connect}>권한 허용하기</Button>
          </>
        }
      >
        계약 단계 {m.steps.length}개를 내 캘린더에 바로 넣으려면 Google 계정에서 일정 추가 권한을 허용해 주세요. HOME:ET는 자기가 만든 일정만 넣고 고쳐요.
      </Dialog>

      <Dialog
        open={gcal.sync.kind === "done"}
        onClose={closeSync}
        title={gcal.sync.kind === "done" ? `캘린더에 일정 ${gcal.sync.count}개를 넣었어요` : ""}
        actions={
          <>
            <Button variant="secondary" onClick={closeSync}>
              닫기
            </Button>
            {gcal.sync.kind === "done" && (
              <ButtonAnchor href={calendarDayUrl(gcal.sync.firstDate)} target="_blank" rel="noopener noreferrer" onClick={closeSync}>
                캘린더 열기 ↗
              </ButtonAnchor>
            )}
          </>
        }
      >
        단계마다 전날 오전 9시에 알림이 가요. 날짜를 바꾸고 다시 등록하면 새로 쌓이지 않고 기존 일정이 고쳐져요.
      </Dialog>

      <FinePrint className="mt-6 lg:hidden">{DISCLAIMER}</FinePrint>
    </div>
  );
}

const DISCLAIMER = "HOME:ET의 계약 안내는 일반 정보이며 법률 자문이 아니에요. 실제 계약 전에는 등기부등본 원문과 공인중개사 설명을 꼭 함께 확인하세요.";

type Selected = NonNullable<ReturnType<typeof ddayModel>["selected"]>;

/** 이 단계에서 알아야 할 용어. cards = 데스크톱용 큰 유리 카드 격자 */
function Terms({ terms, className, cards }: { terms: Selected["terms"]; className?: string; cards?: boolean }) {
  return (
    <div className={cx("space-y-3", className)}>
      <SectionLabel>이 단계에서 알아야 할 용어</SectionLabel>
      <div className={cx("grid gap-3", cards ? "grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5" : "sm:grid-cols-2")}>
        {terms.map((t) =>
          cards ? (
            <div key={t.term} className="h-full rounded-panel border border-border bg-surface/60 p-3.5">
              <p className="text-sm font-bold text-primary">{t.term}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">{t.desc}</p>
            </div>
          ) : (
            <TermCard key={t.term} term={t.term}>
              {t.desc}
            </TermCard>
          ),
        )}
      </div>
    </div>
  );
}

function StepCalendarLink({ href, className = "mt-3" }: { href: string; className?: string }) {
  return (
    <TextLink href={href} target="_blank" rel="noopener noreferrer" className={className}>
      이 단계만 Google 캘린더에 추가 ↗
    </TextLink>
  );
}
