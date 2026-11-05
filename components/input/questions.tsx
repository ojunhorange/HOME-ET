"use client";

/** 입력 질문 정의 + 질문별 입력기 (한 화면에 질문 하나를 크게) */
import type { ReactNode } from "react";
import { GOAL_TAGS, goalText, schoolPatch, type AppState } from "@/lib/app-state";
import { hm, won, type Commute } from "@/lib/calc";
import { SCHOOLS, findSchool } from "@/lib/data";
import { Chip, HeroNumberInput, OptionList, QuickChips, Stepper, TextArea } from "@/components/ui";
import { AddressInput } from "./address-input";
import { RouteEditor } from "./route-editor";

/** 주당 등교일 범위 (학회·주말 활동까지 7일) */
export const DAYS_MIN = 1;
export const DAYS_MAX = 7;
/** 환승 횟수 상한 (피로 계수는 4번부터 최대치라 그 이상은 결과가 같음) */
export const TRANSFERS_MAX = 6;

export type QId = "school" | "home" | "route" | "oneway" | "transfers" | "fare" | "days" | "goal";

export interface Question {
  id: QId;
  group: string;
  label: string; // 요약 목록용 짧은 이름
  title: string; // \n 줄바꿈 허용
  sub?: string;
  /** choice = 목록에서 고르기, input = 직접 입력 (Enter로 다음). 둘 다 '다음'을 눌러야 넘어감 */
  kind: "choice" | "input";
  display: (s: AppState) => string;
  valid: (s: AppState) => boolean;
}

const always = () => true;

export const QUESTIONS: Question[] = [
  {
    id: "school", group: "학교 · 집", label: "학교", kind: "choice",
    title: "어느 학교에 다니세요?",
    display: (s) => findSchool(s.schoolId).name, valid: always,
  },
  {
    id: "home", group: "학교 · 집", label: "본가", kind: "input",
    title: "본가는 어디예요?",
    sub: "최소한 가까운 역 이름까지는 적어 주세요. 도로명 주소면 더 정확해요.",
    display: (s) => s.home.trim() || "입력 전", valid: (s) => s.home.trim().length > 0,
  },
  {
    id: "route", group: "통학 경로", label: "경로", kind: "choice",
    title: "평소 이렇게\n통학하나요?",
    display: (s) => (s.routeKey ? s.routeSummary || "직접 입력" : "입력 전"),
    // 경로 후보 중 하나나 '직접 입력할게요'를 골라야 통과 (못 찾아도 '직접 입력' 선택지는 항상 있음).
    // 본가·학교를 바꾸면 routeKey가 초기화돼서 다시 골라야 검사 시작이 눌림
    valid: (s) => s.routeKey !== null,
  },
  {
    id: "oneway", group: "통학 경로", label: "편도 시간", kind: "input",
    title: "본가에서 학교까지\n편도로 얼마나 걸려요?",
    display: (s) => hm(s.commute.oneWayMin), valid: (s) => s.commute.oneWayMin > 0,
  },
  {
    id: "transfers", group: "통학 경로", label: "환승", kind: "input",
    title: "가는 길에 몇 번 갈아타요?",
    display: (s) => (s.commute.transfers === 0 ? "없음" : `${s.commute.transfers}번`), valid: always,
  },
  {
    id: "fare", group: "통학 경로", label: "왕복 교통비", kind: "input",
    title: "하루 왕복 교통비는\n얼마예요?",
    display: (s) => won(s.commute.roundTripFare), valid: always,
  },
  {
    id: "days", group: "생활 패턴", label: "주당 등교일", kind: "input",
    title: "일주일에 며칠\n학교에 가요?",
    display: (s) => `주 ${s.commute.daysPerWeek}일`, valid: always,
  },
  {
    id: "goal", group: "가치관", label: "대학생활 목표", kind: "input",
    title: "대학생활에서\n얻고 싶은 걸 알려 주세요",
    sub: "해당하는 걸 모두 골라 주세요. 추가적인 목표는 직접 입력해주세요.",
    display: (s) => goalSummary(s), valid: (s) => goalText(s).length > 0,
  },
];

function goalSummary(s: AppState) {
  const labels: string[] = GOAL_TAGS.filter((t) => s.goalTags.includes(t.id)).map((t) => t.label);
  if (s.goal.trim()) labels.push(labels.length ? "추가 설명" : s.goal.trim());
  return labels.join(", ") || "입력 전";
}

export interface EditorProps {
  q: Question;
  state: AppState;
  update: (patch: Partial<AppState>) => void;
  /** 답을 마쳤을 때 (선택형은 고른 직후, 입력형은 Enter) */
  onDone?: () => void;
  autoFocus?: boolean;
  /** 데스크톱 한 화면 한 질문: 숫자키로 선택 */
  shortcuts?: boolean;
}

/** 질문 하나를 크게 */
export function HeroEditor({ q, state, update, onDone, autoFocus, shortcuts }: EditorProps) {
  const c = state.commute;
  const setC = (patch: Partial<Commute>) => update({ commute: { ...c, ...patch } });
  const id = `hero-${q.id}`;

  switch (q.id) {
    case "school":
      return (
        <OptionList
          label={q.label}
          shortcuts={shortcuts}
          value={state.schoolId}
          options={SCHOOLS.map((s) => ({ value: s.id, label: s.name, sub: s.district }))}
          onSelect={(v) => {
            // 학교가 바뀌면 예전 경로 선택은 무효
            update({ ...schoolPatch(state, v), ...(v !== state.schoolId && { routeKey: null, routeSummary: "" }) });
            onDone?.();
          }}
        />
      );
    case "home":
      return (
        <AddressInput
          id={id}
          label={q.label}
          autoFocus={autoFocus}
          placeholder="집 주소 또는 근처 역"
          value={state.home}
          // 본가가 바뀌면 예전 경로 선택은 무효
          onChange={(v) => update({ home: v, routeKey: null, routeSummary: "" })}
          onEnter={q.valid(state) ? onDone : undefined}
        />
      );
    case "route":
      return <RouteEditor state={state} update={update} onDone={onDone} shortcuts={shortcuts} />;
    case "oneway":
      return (
        <NumberWithChips
          id={id} label={q.label} autoFocus={autoFocus} onEnter={onDone}
          suffix="분" value={c.oneWayMin} onChange={(v) => setC({ oneWayMin: v })}
          chips={[30, 45, 60, 90, 120].map((v) => ({ value: v, label: hm(v) }))}
          note={c.oneWayMin > 0 ? <>하루 왕복 약 <b className="text-fg">{hm(2 * c.oneWayMin)}</b></> : null}
        />
      );
    case "transfers":
      return (
        <Stepper
          size="hero" label={q.label} unit="번" min={0} max={TRANSFERS_MAX}
          value={c.transfers} onChange={(v) => setC({ transfers: v })} autoFocus={autoFocus} onEnter={onDone}
        />
      );
    case "fare":
      return (
        <NumberWithChips
          id={id} label={q.label} autoFocus={autoFocus} onEnter={onDone} step={100}
          suffix="원" value={c.roundTripFare} onChange={(v) => setC({ roundTripFare: v })}
          chips={[0, 3_000, 4_500, 6_000].map((v) => ({ value: v, label: v === 0 ? "안 들어요" : won(v) }))}
        />
      );
    case "days":
      return (
        <Stepper
          size="hero" label={q.label} prefix="주" unit="일" min={DAYS_MIN} max={DAYS_MAX}
          value={c.daysPerWeek} onChange={(v) => setC({ daysPerWeek: v })} autoFocus={autoFocus} onEnter={onDone}
        />
      );
    case "goal":
      return <GoalEditor id={id} state={state} update={update} />;
  }
}

function NumberWithChips<T extends number>({
  id, label, value, onChange, suffix, step, chips, note, autoFocus, onEnter,
}: {
  id: string; label: string; value: number; onChange: (v: number) => void; suffix: string; step?: number;
  chips: { value: T; label: ReactNode }[]; note?: ReactNode; autoFocus?: boolean; onEnter?: () => void;
}) {
  return (
    <div className="space-y-5">
      <HeroNumberInput id={id} aria-label={label} autoFocus={autoFocus} suffix={suffix} step={step} value={value} onChange={onChange} onEnter={onEnter} />
      {note && <p className="-mt-2 text-sm text-fg-sub">{note}</p>}
      <QuickChips label={`${label} 추천값`} items={chips} value={value as T} onSelect={onChange} />
    </div>
  );
}

/** 대학생활 목표: 칩으로 먼저 고르고, 칩에 없는 건 아래 칸에 직접 (칩과 글은 따로 저장) */
export function GoalEditor({ id, state, update, rows = 3 }: { id: string; state: AppState; update: EditorProps["update"]; rows?: number }) {
  const toggle = (tag: AppState["goalTags"][number]) =>
    update({ goalTags: state.goalTags.includes(tag) ? state.goalTags.filter((t) => t !== tag) : [...state.goalTags, tag] });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="대학생활 목표 고르기">
        {GOAL_TAGS.map((t) => (
          <Chip key={t.id} selected={state.goalTags.includes(t.id)} onClick={() => toggle(t.id)}>
            {t.label}
          </Chip>
        ))}
      </div>
      <div>
        <label htmlFor={id} className="mb-2 block text-sm font-semibold text-fg">
          추가로 하고 싶은 말 <span className="font-normal text-fg-muted">(선택)</span>
        </label>
        <TextArea
          id={id}
          rows={rows}
          value={state.goal}
          onChange={(e) => update({ goal: e.target.value })}
          placeholder="예: 통학 때문에 동아리를 못 해서 아쉬워요."
        />
      </div>
    </div>
  );
}
