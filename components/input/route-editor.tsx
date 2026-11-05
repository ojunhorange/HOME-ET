"use client";

/**
 * 통학 경로 선택. 본가 → 학교 경로를 Google Routes API(/api/commute)로 찾아 home-et 선택지(OptionList)로 보여 줌.
 * 고르면 편도 시간·환승·왕복 교통비를 채우고 다음 질문(편도 → 환승 → 교통비)에서 확인·수정함.
 */
import { useEffect, useState } from "react";
import type { CommuteResponse, RouteOption, Segment } from "@/app/api/commute/route";
import type { AppState } from "@/lib/app-state";
import { hm, won } from "@/lib/calc";
import { findSchool } from "@/lib/data";
import { OptionList } from "@/components/ui";

const MANUAL = "manual";
const KIND_LABEL: Record<RouteOption["kind"], string> = { walk: "역까지 걸어서", bus: "역까지 버스로", other: "가장 빠른 경로" };

// 같은 (본가, 학교) 결과는 다시 부르지 않음. 이전/다음으로 오갈 때 API 호출 절약
const cache = new Map<string, RouteOption[]>();

/**
 * 역 이름 한 줄: 출발 → 탑승역(그 노선 색) → … → 도착
 * 버스 구간은 노선 번호로, 내린 정류장과 갈아타는 역 이름이 달라도 다음 구간의 탑승역 이름만 씀
 */
function StopChain({ segments }: { segments: Segment[] }) {
  const rides = segments.filter((g): g is Extract<Segment, { type: "ride" }> => g.type === "ride");
  const last = rides.at(-1);
  if (!last) return null;
  const pill = "rounded-full px-2.5 py-0.5 text-xs font-bold";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={`${pill} border border-border font-semibold text-fg-muted`}>출발</span>
      {rides.map((g, i) => (
        <span key={i} className="contents">
          <span aria-hidden className="text-fg-muted">→</span>
          <span className={pill} style={{ background: g.color, color: g.textColor }} title={`${g.from}에서 ${g.line || g.vehicle} 탑승`}>
            {g.vehicle.includes("버스") ? `${g.line || "버스"}번` : g.from}
          </span>
        </span>
      ))}
      <span aria-hidden className="text-fg-muted">→</span>
      <span className={`${pill} border-2 border-fg text-fg`} title={`${last.to}에서 하차`}>
        도착
      </span>
    </span>
  );
}

export function RouteEditor({
  state, update, onDone, shortcuts,
}: {
  state: AppState;
  update: (patch: Partial<AppState>) => void;
  onDone?: () => void;
  shortcuts?: boolean;
}) {
  const school = findSchool(state.schoolId);
  const cacheKey = `${state.home.trim()}|${school.id}`;
  // 응답이 오면 캐시에 넣고 이 값을 바꿔 다시 그리게만 함. 표시할 목록은 캐시에서 읽음 (null = 불러오는 중)
  const [, setLoadedKey] = useState("");
  const options = cache.get(cacheKey) ?? null;

  useEffect(() => {
    if (cache.has(cacheKey)) return;
    let alive = true;
    fetch("/api/commute", {
      method: "POST",
      body: JSON.stringify({ origin: state.home.trim(), destination: { lat: school.lat, lng: school.lng } }),
    })
      .then((r) => r.json() as Promise<CommuteResponse>)
      .catch((): CommuteResponse => ({ ok: false }))
      .then((r) => {
        cache.set(cacheKey, r.ok ? r.options : []);
        if (alive) setLoadedKey(cacheKey);
      });
    return () => {
      alive = false;
    };
  }, [cacheKey, state.home, school.lat, school.lng]);

  if (options === null) {
    return <p className="rounded-panel bg-surface-muted p-4 text-[15px] text-fg-sub">Google 지도에서 경로를 찾는 중…</p>;
  }

  const pick = (key: string) => {
    if (key === MANUAL) {
      update({ routeKey: MANUAL, routeSummary: "직접 입력" });
    } else {
      const o = options.find((x) => x.key === key);
      if (!o) return;
      update({
        routeKey: o.key,
        routeSummary: o.summary,
        commute: { ...state.commute, oneWayMin: o.oneWayMin, transfers: o.transfers, roundTripFare: o.roundTripFare },
      });
    }
    onDone?.();
  };

  return (
    <div className="space-y-4">
      {options.length === 0 && (
        <p className="rounded-panel bg-surface-muted p-4 text-[15px] text-fg-sub">
          경로를 찾지 못했어요. 직접 입력하기 옵션을 선택한 뒤 다음으로 이동해주세요.
        </p>
      )}
      <OptionList
        label="통학 경로"
        shortcuts={shortcuts}
        value={state.routeKey ?? undefined}
        onSelect={pick}
        options={[
          ...options.map((o) => ({
            value: o.key,
            label: <StopChain segments={o.segments} />,
            sub: (
              <span className="mt-1.5 block">
                {KIND_LABEL[o.kind]} · 편도 {hm(o.oneWayMin)} · 환승 {o.transfers === 0 ? "없음" : `${o.transfers}번`} · 왕복 약 {won(o.roundTripFare)}
              </span>
            ),
          })),
          { value: MANUAL, label: options.length ? "실제로는 달라요. 직접 입력할게요" : "직접 입력할게요" },
        ]}
      />
    </div>
  );
}
