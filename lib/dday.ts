// 계약 D-day 규칙 (기획서 ③ 표). 날짜는 'YYYY-MM-DD', UTC 기준으로 계산해 시간대 오차를 없앰.

export type Step = {
  key: string;
  title: string;
  date: string; // 대표 날짜 (D-day 계산 기준)
  until?: string; // 기간형 단계의 끝
  todo: string;
  terms: string[];
};

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(d + "T00:00:00Z");
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
export const diffDays = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY);

/** 임대차 신고 대상: 보증금 6천만 원 초과 또는 월세 30만 원 초과 */
export const needsLeaseReport = (deposit: number, rent: number) => deposit > 60_000_000 || rent > 300_000;

export function buildSteps(p: { today: string; contract: string; balance: string; deposit: number; rent: number }): Step[] {
  const steps: Step[] = [];
  if (p.today < p.contract)
    steps.push({
      key: "before",
      title: "계약 전 확인",
      date: p.today,
      until: addDays(p.contract, -1),
      todo: "등기부등본을 열람해 소유자가 계약 상대와 같은지, 근저당이 얼마나 걸려 있는지 확인하세요.",
      terms: ["등기부등본", "근저당", "선순위"],
    });
  steps.push({
    key: "contract",
    title: "계약일",
    date: p.contract,
    todo: "계약서를 작성하고 계약금을 지급해요. 특약에 원하는 조건(수리, 근저당 말소 등)이 들어갔는지 확인하세요.",
    terms: ["계약금", "특약"],
  });
  steps.push({
    key: "prebalance",
    title: "잔금 전날",
    date: addDays(p.balance, -1),
    todo: "등기부등본을 다시 열람해 계약 후 새 근저당이 생기지 않았는지 확인하세요.",
    terms: ["근저당"],
  });
  steps.push({
    key: "balance",
    title: "잔금·입주일",
    date: p.balance,
    todo: "잔금을 지급하고, 당일 주민센터(또는 정부24)에서 전입신고와 확정일자를 받으세요.",
    terms: ["잔금", "전입신고", "확정일자", "대항력", "우선변제권"],
  });
  if (needsLeaseReport(p.deposit, p.rent))
    steps.push({
      key: "report",
      title: "임대차 신고 기한",
      date: addDays(p.contract, 30),
      todo: "계약일로부터 30일 안에 임대차 신고를 해야 해요. 전입신고 때 계약서를 내면 함께 처리돼요.",
      terms: ["임대차 신고"],
    });
  return steps.sort((a, b) => a.date.localeCompare(b.date));
}

export const ddayLabel = (today: string, date: string, until?: string) => {
  if (until && today >= date && today <= until) return "오늘";
  const n = diffDays(today, date);
  return n === 0 ? "오늘" : n > 0 ? `D-${n}` : `D+${-n}`;
};

/** Google 캘린더 일정 추가 링크 (하루 종일 일정) */
export function calendarUrl(s: Step) {
  const ymd = (d: string) => d.replaceAll("-", "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `[HOME:ET] ${s.title}`,
    dates: `${ymd(s.date)}/${ymd(addDays(s.until ?? s.date, 1))}`,
    details: `${s.todo}\n\n알아야 할 용어: ${s.terms.join(", ")}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
