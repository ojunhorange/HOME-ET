"use client";
import Link from "next/link";
import { AdvancedMarker, Map, Pin } from "@vis.gl/react-google-maps";
import { score, won } from "@/lib/score";
import { school, toScoreInput, useAppState } from "@/lib/state";
import { MAPS_KEY } from "../shell";

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 text-sm ${bold ? "mt-2 border-t border-line pt-3 font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function RentPage() {
  const [s, set] = useAppState();
  const dong = school.dongs.find((d) => d.name === s.dong) ?? school.dongs[0];
  // ② 상한: 선택 지역에서 학교까지의 시간을 T자취로 쓰고 그 지역 관리비 중앙값을 적용
  const r = score(toScoreInput(s, { livingOneWayMin: dong.oneWayMin, mgmt: dong.mgmt }));
  const fits = dong.rent <= r.rentCap;
  const pick = (d: (typeof school.dongs)[number]) => set({ dong: d.name, rent: d.rent, mgmt: d.mgmt });
  const who = s.name ? `${s.name} 님` : "나";

  return (
    <div>
      <h1 className="text-3xl font-extrabold">어디서, 얼마까지 내도 될까?</h1>
      <p className="mt-2 text-muted">리포트와 같은 기준으로, 내 가치관에서 자취가 손해가 되지 않는 월세 상한을 계산했어요.</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.8fr_1fr]">
        <section className="card">
          <h2 className="font-bold">자취 지역</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {school.dongs.map((d) => (
              <button
                key={d.name}
                onClick={() => pick(d)}
                className={`rounded-full border px-4 py-2 text-sm ${d.name === dong.name ? "border-brand bg-brand font-bold text-white" : "border-line bg-white"}`}
              >
                {d.name}
              </button>
            ))}
          </div>

          <div className="mt-4 h-80 overflow-hidden rounded-xl border border-line bg-bg">
            {MAPS_KEY ? (
              <Map defaultCenter={{ lat: school.lat, lng: school.lng }} defaultZoom={14} mapId="DEMO_MAP_ID" gestureHandling="cooperative" disableDefaultUI>
                <AdvancedMarker position={{ lat: school.lat, lng: school.lng }} title={school.name}>
                  <Pin background="#c2500f" borderColor="#8a3608" glyphColor="white" />
                </AdvancedMarker>
                {school.dongs.map((d) => (
                  <AdvancedMarker key={d.name} position={{ lat: d.lat, lng: d.lng }} title={d.name} onClick={() => pick(d)}>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold shadow ${d.name === dong.name ? "bg-brand text-white" : "bg-white text-ink"}`}>{d.name}</span>
                  </AdvancedMarker>
                ))}
              </Map>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">지도를 보려면 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY를 설정하세요.</div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              학교까지 <b>{dong.toSchool}</b>
            </span>
            <span>
              원룸 월세 중앙값 <b>{won(dong.rent)}</b> <span className="text-muted">(예시 데이터)</span>
            </span>
            <span>
              관리비 중앙값 <b>{won(dong.mgmt)}</b> <span className="text-muted">(예시 데이터)</span>
            </span>
          </div>
        </section>

        <section className="card">
          <h2 className="font-bold">{who}의 적정 월세 상한</h2>
          <p className="mt-2 text-4xl font-extrabold text-brand">
            {r.rentCap > 0 ? won(r.rentCap) : "0원"}
            <span className="ml-1 text-base font-normal text-muted">/ 월 이하</span>
          </p>
          <p className={`mt-3 rounded-xl p-3 text-sm leading-relaxed ${fits ? "bg-brand-soft text-brand" : "bg-accent-soft text-accent"}`}>
            {fits
              ? `${dong.name} 원룸 월세 중앙값(${won(dong.rent)})이 상한 안에 들어와요. 이 지역에서 고르면 통학보다 손해가 아니에요.`
              : `${dong.name} 원룸 월세 중앙값(${won(dong.rent)})이 상한보다 높아요. 상한 이하 매물을 찾거나 다른 지역을 비교해 보세요.`}
          </p>
          <div className="mt-3">
            <Row label="내 시간·체력 가치 기준 지불 의향" value={won(r.willingness)} />
            <Row label="− 관리비" value={won(dong.mgmt)} />
            <Row label="− 추가 생활비" value={won(s.extraLiving)} />
            {s.initialCost > 0 && <Row label="− 초기 비용 (2년 분할)" value={won(r.initialMonthly)} />}
            <Row label="− 보증금 기회비용" value={won(r.depositInterest)} />
            <Row label="+ 절약 교통비" value={won(r.savedFare)} />
            <Row label="월세 상한" value={won(r.rentCap)} bold />
          </div>
          <p className="mt-3 text-xs text-muted">
            리포트에서 조정한 가치관 기준: 돈 {Math.round(s.weights.money * 100)}% · 시간 {Math.round(s.weights.time * 100)}% · 체력{" "}
            {Math.round(s.weights.body * 100)}%
          </p>
        </section>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Link href="/report" className="btn">
          리포트로 돌아가기
        </Link>
        <Link href="/dday" className="btn-primary">
          계약 일정 등록하기
        </Link>
      </div>
    </div>
  );
}
