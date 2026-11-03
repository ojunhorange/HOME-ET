"use client";
import { useState } from "react";
import { buildSteps, calendarUrl, ddayLabel } from "@/lib/dday";
import { useAppState } from "@/lib/state";
import terms from "@/data/terms.json";

const md = (d: string) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
const man = (n: number) => `${Math.round(n / 10000).toLocaleString("ko-KR")}만 원`;

export default function DdayPage() {
  const [s, set] = useAppState();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD (KST)
  const valid = s.contract && s.balance && s.contract <= s.balance;
  const steps = valid ? buildSteps({ today, contract: s.contract, balance: s.balance, deposit: s.deposit, rent: s.rent }) : [];
  const [sel, setSel] = useState<string>();
  const cur = steps.find((x) => x.key === sel) ?? steps.find((x) => (x.until ?? x.date) >= today) ?? steps[0];

  return (
    <div>
      <h1 className="text-3xl font-extrabold">첫 계약, 언제 무엇을 하면 될까?</h1>
      <p className="mt-2 text-muted">날짜만 넣으면 단계별 D-day를 알려 드리고, 그때 꼭 알아야 할 용어를 쉽게 풀어 드려요.</p>

      <section className="card mt-6 grid items-end gap-4 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">계약일</span>
          <input type="date" className="field" value={s.contract} onChange={(e) => set({ contract: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">잔금·입주일</span>
          <input type="date" className="field" value={s.balance} min={s.contract} onChange={(e) => set({ balance: e.target.value })} />
        </label>
        <div className="text-sm">
          <span className="mb-1.5 block font-bold">보증금 / 월세</span>
          <span className="block py-3">
            {man(s.deposit)} / {man(s.rent)}
          </span>
        </div>
        {cur && (
          <a className="btn text-center text-sm text-brand" href={calendarUrl(cur)} target="_blank" rel="noreferrer">
            Google 캘린더에 추가
          </a>
        )}
      </section>

      {!valid ? (
        <p className="card mt-5 text-sm text-accent">잔금·입주일은 계약일과 같거나 그 이후여야 해요.</p>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_2fr]">
          <section className="card">
            <h2 className="font-bold">
              D-day 타임라인 <span className="text-xs font-normal text-muted">오늘 {md(today)} 기준</span>
            </h2>
            <ul className="mt-3 space-y-2">
              {steps.map((x) => {
                const label = ddayLabel(today, x.date, x.until);
                const active = x.key === cur?.key;
                return (
                  <li key={x.key}>
                    <button
                      onClick={() => setSel(x.key)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${active ? "border-brand bg-brand-soft" : "border-line bg-white"}`}
                    >
                      <span className={`w-14 shrink-0 rounded-lg py-1.5 text-center text-xs font-bold ${label === "오늘" ? "bg-accent text-white" : "bg-bg"}`}>{label}</span>
                      <span>
                        <span className="block text-sm font-bold">{x.title}</span>
                        <span className="text-xs text-muted">
                          {x.until && x.until !== x.date ? `${md(x.date)} ~ ${md(x.until)}` : md(x.date)}
                          {x.key === "report" && "까지"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {cur && (
            <section className="card self-start">
              <p className="text-sm font-bold text-accent">
                {ddayLabel(today, cur.date, cur.until)} · {cur.until && cur.until !== cur.date ? `${md(cur.date)} ~ ${md(cur.until)}` : md(cur.date)}
              </p>
              <h2 className="mt-1 text-xl font-bold">{cur.title}</h2>
              <p className="mt-2">{cur.todo}</p>
              <h3 className="mt-5 text-sm font-bold text-muted">이 단계에서 알아야 할 용어</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {cur.terms.map((t) => (
                  <div key={t} className="rounded-xl border border-line bg-bg p-3">
                    <p className="text-sm font-bold text-brand">{t}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{terms[t as keyof typeof terms]}</p>
                  </div>
                ))}
              </div>
              <a className="btn-primary mt-5 inline-block text-sm" href={calendarUrl(cur)} target="_blank" rel="noreferrer">
                이 일정을 Google 캘린더에 추가
              </a>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
