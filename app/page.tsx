"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { school, useAppState, type AppState } from "@/lib/state";
import { MAPS_KEY } from "./shell";

const num = (v: string) => Number(v.replace(/[^\d.]/g, "")) || 0;

/** Places API (New) 자동완성. 키가 없으면 일반 입력창 */
function AddressInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const input = <input className="field" placeholder="예: 경기 남양주시 별내동" value={value} onChange={(e) => onChange(e.target.value)} />;
  return MAPS_KEY ? <AutocompleteInput value={value} onChange={onChange} /> : input;
}

function AutocompleteInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const places = useMapsLibrary("places");
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!places || !open || value.trim().length < 2) return setItems([]);
    const t = setTimeout(async () => {
      try {
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value, includedRegionCodes: ["kr"], language: "ko" });
        setItems(suggestions.flatMap((s) => (s.placePrediction ? [s.placePrediction.text.toString()] : [])).slice(0, 5));
      } catch {
        setItems([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [places, value, open]);

  return (
    <div className="relative">
      <input
        className="field"
        placeholder="예: 경기 남양주시 별내동"
        value={value}
        onChange={(e) => (onChange(e.target.value), setOpen(true))}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white text-sm shadow-lg">
          {items.map((t) => (
            <li key={t}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-bg" onMouseDown={() => (onChange(t), setOpen(false))}>
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Money({ label, value, onChange, hint }: { label: string; value: number; onChange: (n: number) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      <input className="field" inputMode="numeric" value={value.toLocaleString("ko-KR")} onChange={(e) => onChange(num(e.target.value))} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export default function InputPage() {
  const [s, set] = useAppState();
  const router = useRouter();
  const [routeMsg, setRouteMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadRoute() {
    if (!s.homeAddress.trim()) return setRouteMsg("본가 주소를 먼저 입력해 주세요.");
    setRouteMsg("Google 지도에서 경로를 찾는 중…");
    const r = await fetch("/api/commute", { method: "POST", body: JSON.stringify({ origin: s.homeAddress, destination: school.address }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false }));
    if (r.ok) {
      set({ oneWayMin: r.oneWayMin, transfers: r.transfers, fareRoundTrip: r.fareRoundTrip, commuteSource: "api" });
      setRouteMsg(r.fareEstimated ? "평일 오전 8시 출발 기준이에요. 교통비는 기본요금으로 추정했으니 실제와 다르면 고쳐 주세요." : "평일 오전 8시 출발 기준이에요.");
    } else {
      set({ commuteSource: "manual" });
      setRouteMsg("경로를 불러오지 못했어요. 아래 값을 직접 입력해 주세요.");
    }
  }

  async function start() {
    setLoading(true);
    const w = await fetch("/api/weights", { method: "POST", body: JSON.stringify({ goal: s.goal }) })
      .then((r) => r.json())
      .catch(() => null);
    const weights = w ? { money: w.money, time: w.time, body: w.body } : { money: 1 / 3, time: 1 / 3, body: 1 / 3 };
    set({ aiWeights: weights, weights, aiReason: w?.reason ?? "AI 분석을 사용할 수 없어 기본값(각 1/3)을 사용했어요." });
    router.push("/report");
  }

  const commuteField = (label: string, key: keyof AppState, unit: string) => (
    <label className="flex items-center gap-1.5">
      <span className="text-muted">{label}</span>
      <input
        className="w-16 rounded-md border border-line bg-white px-1.5 py-0.5 text-right font-bold"
        inputMode="numeric"
        value={(s[key] as number).toLocaleString("ko-KR")}
        onChange={(e) => set({ [key]: num(e.target.value), commuteSource: "manual" })}
      />
      <span className="text-muted">{unit}</span>
    </label>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.7fr]">
      <section className="pt-4">
        <p className="text-sm font-bold text-accent">서울 대학생을 위한 첫 자취 판단 도우미</p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight">
          첫 자취,
          <br />
          해도 될까?
        </h1>
        <p className="mt-5 leading-relaxed text-muted">
          자취 비용은 숫자로 보이지만 통학으로 잃는 시간과 체력은 보이지 않아요. 둘을 같은 기준으로 바꿔서, 지금 통학보다 자취가 나에게 얼마나
          이득인지 보여 드릴게요.
        </p>
        <ol className="mt-6 space-y-3 text-sm">
          {["통학 시간과 피로 회복 시간을 돈으로 환산", "내 가치관을 반영한 자취지수와 적정 월세", "계약금부터 확정일자까지 D-day 안내"].map((t, i) => (
            <li key={t} className="flex items-center gap-3">
              <span className="grid size-6 place-items-center rounded-md bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </section>

      <form
        className="card space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <h2 className="text-lg font-bold">내 통학 정보</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">이름 (선택)</span>
            <input className="field" placeholder="예: 서연" value={s.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">학교</span>
            <select className="field" value="ku" disabled>
              <option value="ku">{school.name}</option>
            </select>
          </label>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-bold">본가 주소</span>
          <div className="flex gap-2">
            <div className="flex-1">
              <AddressInput value={s.homeAddress} onChange={(v) => set({ homeAddress: v })} />
            </div>
            <button type="button" className="btn shrink-0 text-sm" onClick={loadRoute}>
              경로 불러오기
            </button>
          </div>
          {routeMsg && <p className="mt-1.5 text-xs text-muted">{routeMsg}</p>}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-bg px-4 py-3 text-sm">
          {commuteField("편도", "oneWayMin", "분")}
          {commuteField("환승", "transfers", "회")}
          {commuteField("왕복 교통비", "fareRoundTrip", "원")}
          <span className="text-xs text-muted self-center">{s.commuteSource === "api" ? "Google 지도 기준" : "직접 입력값"}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-sm font-bold">주당 등교일</span>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set({ daysPerWeek: d })}
                  className={`rounded-xl border py-2.5 text-sm ${s.daysPerWeek === d ? "border-brand bg-brand font-bold text-white" : "border-line bg-white"}`}
                >
                  {d}일
                </button>
              ))}
            </div>
          </div>
          <Money label="내 1시간의 기준 시급" value={s.hourlyWage} onChange={(n) => set({ hourlyWage: n })} hint="기본값은 2026년 최저임금(10,320원)이에요." />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">대학생활에서 얻고 싶은 것</span>
          <textarea
            className="field min-h-24"
            placeholder="예: 학점 관리를 제대로 하고 싶고, 통학 때문에 동아리를 못 해서 아쉬워요. 그래도 부모님께 부담은 덜 드리고 싶어요."
            value={s.goal}
            onChange={(e) => set({ goal: e.target.value })}
          />
          <span className="mt-1 block text-xs text-muted">Gemini가 이 글을 읽고 돈·시간·체력 중 무엇을 더 중요하게 여기는지 분석해요.</span>
        </label>

        <details className="rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold">자취 비용 가정 (학교 주변 시세 기본값, 수정 가능)</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Money label="예상 보증금" value={s.deposit} onChange={(n) => set({ deposit: n })} />
            <Money label="월세" value={s.rent} onChange={(n) => set({ rent: n })} />
            <Money label="관리비" value={s.mgmt} onChange={(n) => set({ mgmt: n })} />
            <Money label="추가 생활비 (식비·공과금 등 늘어나는 몫)" value={s.extraLiving} onChange={(n) => set({ extraLiving: n })} />
            <Money label="초기 비용 (중개수수료·이사·가구, 2년 분할)" value={s.initialCost} onChange={(n) => set({ initialCost: n })} hint="모르면 0으로 두세요." />
          </div>
        </details>

        <button className="btn-primary w-full py-4 text-base" disabled={loading}>
          {loading ? "가치관 분석 중…" : "자취 적합 검사 시작"}
        </button>
      </form>
    </div>
  );
}
