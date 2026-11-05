// 계약 D-day 규칙과 용어 카드 (기획서 ③)
import { brokerageFee, man } from "./calc";

export const TERMS: Record<string, string> = {
  등기부등본:
    "집의 주인과 그 집에 걸린 빚 같은 권리관계가 적힌 공식 서류예요. 계약 상대가 실제 소유자인지 꼭 확인해요.",
  근저당:
    "집주인이 집을 담보로 빌린 돈이에요. 많을수록 문제가 생겼을 때 보증금을 돌려받기 어려울 수 있어요.",
  선순위:
    "내 보증금보다 먼저 돌려받을 권리가 있는 채권이에요. 금액이 클수록 위험해요.",
  계약금:
    "계약을 확정하는 뜻으로 먼저 내는 돈이에요. 보통 보증금의 10%이고, 내가 계약을 깨면 돌려받지 못할 수 있어요.",
  특약:
    "기본 조항 외에 따로 적는 약속이에요. 예: “잔금일까지 근저당을 추가로 설정하지 않는다”, 수리 책임 범위.",
  잔금: "보증금에서 계약금을 뺀 나머지 돈이에요. 보통 입주일에 열쇠를 받으면서 내요.",
  전입신고:
    "이사한 주소를 주민센터나 정부24에 알리는 신고예요. 신고 다음 날 0시부터 대항력이 생겨요.",
  확정일자:
    "계약서에 받는 날짜 도장이에요. 전입신고와 함께 갖추면 우선변제권이 생겨요.",
  대항력:
    "집주인이 바뀌어도 계약 기간 동안 살 수 있고, 보증금을 돌려받을 때까지 버틸 수 있는 힘이에요. 입주 + 전입신고로 생겨요.",
  우선변제권:
    "집이 경매로 넘어가도 나보다 늦게 생긴 채권보다 먼저 보증금을 돌려받을 권리예요. 대항력 + 확정일자가 필요해요.",
  중개보수:
    "부동산에 내는 수수료예요. 법정 상한은 거래금액(보증금 + 월세 × 100, 5천만 원 미만이면 월세 × 70)에 요율을 곱해 정해요. 상한 안에서 협의할 수 있고 부가세는 별도예요.",
  "임대차 신고":
    "보증금 6천만 원 초과 또는 월세 30만 원 초과 계약은 계약일로부터 30일 안에 신고해야 해요. 신고하면 확정일자가 자동으로 붙어요.",
};

export interface Step {
  key: string;
  title: string;
  start: Date;
  end: Date; // 단일 날짜면 start와 같음
  deadline?: boolean; // "~까지"
  todo: string;
  terms: string[];
}

const DAY = 86_400_000;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(startOfDay(d).getTime() + n * DAY);
export const diffDays = (a: Date, b: Date) =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY);

export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
export const toInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const md = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;

export function needsLeaseReport(deposit: number, rent: number) {
  return deposit > 60_000_000 || rent > 300_000;
}

export function buildSteps(
  today: Date, contract: Date, balance: Date, deposit: number, rent: number,
): Step[] {
  const preEnd = addDays(contract, -1);
  const preStart = diffDays(preEnd, today) >= 0 ? startOfDay(today) : addDays(contract, -7);

  const steps: Step[] = [
    {
      key: "pre", title: "계약 전 확인", start: preStart, end: preEnd,
      todo: "등기부등본을 열람해 소유자가 계약 상대와 같은지, 근저당이 얼마나 걸려 있는지 확인하세요.",
      terms: ["등기부등본", "근저당", "선순위"],
    },
    {
      key: "contract", title: "계약일", start: contract, end: contract,
      todo: "계약서를 쓰고 계약금을 보내요. 특약에 원하는 조건이 들어갔는지, 계좌 명의가 집주인 본인인지 확인하세요.",
      terms: ["계약금", "특약"],
    },
    {
      key: "before-balance", title: "잔금 전날", start: addDays(balance, -1), end: addDays(balance, -1),
      todo: "등기부등본을 한 번 더 떼 보세요. 계약 뒤에 새로 근저당이 잡혔다면 잔금 전에 꼭 짚고 넘어가야 해요.",
      terms: ["근저당"],
    },
    {
      key: "balance", title: "잔금·입주일", start: balance, end: balance,
      todo: `잔금을 내고 열쇠를 받아요. 같은 날 전입신고와 확정일자까지 마치면 보증금을 지키는 장치가 갖춰져요. 중개보수도 보통 이날 내요 (이 계약의 법정 상한 약 ${man(brokerageFee(deposit, rent), 1)}, 부가세 별도).`,
      terms: ["잔금", "전입신고", "확정일자", "대항력", "우선변제권", "중개보수"],
    },
  ];

  if (needsLeaseReport(deposit, rent)) {
    const due = addDays(contract, 30);
    steps.push({
      key: "report", title: "임대차 신고 기한", start: due, end: due, deadline: true,
      todo: "보증금 6천만 원 또는 월세 30만 원을 넘는 계약이라 신고 대상이에요. 주민센터나 부동산거래관리시스템에서 신고하세요.",
      terms: ["임대차 신고"],
    });
  }

  return steps.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function dLabel(step: Step, today: Date) {
  const s = diffDays(step.start, today);
  const e = diffDays(step.end, today);
  if (s <= 0 && e >= 0) return "오늘";
  if (s > 0) return `D-${s}`;
  return "완료";
}

export function stepDateText(step: Step) {
  if (step.deadline) return `${md(step.end)}까지`;
  if (diffDays(step.end, step.start) === 0) return md(step.start);
  const sameMonth = step.start.getMonth() === step.end.getMonth();
  return `${md(step.start)} ~ ${sameMonth ? `${step.end.getDate()}일` : md(step.end)}`;
}

// ── 캘린더 ─────────────────────────────
const ymd = (d: Date) => toInput(d).replaceAll("-", "");

export function googleCalendarUrl(step: Step) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `[HOME:ET] ${step.title}`,
    dates: `${ymd(step.start)}/${ymd(addDays(step.end, 1))}`,
    details: `${step.todo}\n\n알아둘 용어: ${step.terms.join(", ")}`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** 계약 D-day를 내 Google 캘린더에 바로 넣는 권한. 로그인할 땐 받지 않고, 등록 버튼을 누를 때 따로 요청해요 */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
/** 캘린더 권한을 받는 중에 로그인한 계정과 다른 Google 계정을 고르면, 이 표시(?gcal=…)와 함께 돌려보냄 */
export const WRONG_ACCOUNT = "wrong-account";

/** Google 캘린더 API(/api/calendar)로 보낼 종일 일정. end는 다음 날(배타적) */
export interface CalendarEvent {
  key: string;
  summary: string;
  description: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD, 마지막 날 + 1
}

export const STEP_KEYS = ["pre", "contract", "before-balance", "balance", "report"] as const;

export const calendarEvents = (steps: Step[]): CalendarEvent[] =>
  steps.map((s) => ({
    key: s.key,
    summary: `[HOME:ET] ${s.title}`,
    description: `${s.todo}\n\n알아둘 용어: ${s.terms.join(", ")}`,
    start: toInput(s.start),
    end: toInput(addDays(s.end, 1)),
  }));

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

export function buildIcs(steps: Step[]) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HOME:ET//Contract D-day//KO", "CALSCALE:GREGORIAN"];
  for (const s of steps) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.key}-${ymd(s.start)}@home-et`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(s.start)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(s.end, 1))}`,
      `SUMMARY:${icsEscape(`[HOME:ET] ${s.title}`)}`,
      `DESCRIPTION:${icsEscape(`${s.todo}\n알아둘 용어: ${s.terms.join(", ")}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
