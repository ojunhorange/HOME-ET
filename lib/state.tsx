"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { EQUAL_WEIGHTS, MIN_WAGE_2026, type Weights, type ScoreInput } from "./score";
import schools from "@/data/schools.json";
import { addDays } from "./dday";

export const school = schools.ku;
export type Dong = (typeof school.dongs)[number];

export type AppState = {
  name: string;
  homeAddress: string;
  oneWayMin: number;
  transfers: number;
  fareRoundTrip: number;
  commuteSource: "api" | "manual";
  daysPerWeek: number;
  hourlyWage: number;
  goal: string;
  deposit: number;
  rent: number;
  mgmt: number;
  extraLiving: number;
  annualRate: number;
  initialCost: number;
  aiWeights: Weights;
  aiReason: string;
  weights: Weights;
  dong: string;
  contract: string;
  balance: string;
};

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD (KST)
const area = school.dongs[0];

export const initialState: AppState = {
  name: "",
  homeAddress: "",
  oneWayMin: 85,
  transfers: 2,
  fareRoundTrip: 4500,
  commuteSource: "manual",
  daysPerWeek: 4,
  hourlyWage: MIN_WAGE_2026,
  goal: "",
  deposit: area.deposit,
  rent: area.rent,
  mgmt: area.mgmt,
  extraLiving: 150000,
  annualRate: 0.035,
  initialCost: 0,
  aiWeights: EQUAL_WEIGHTS,
  aiReason: "",
  weights: EQUAL_WEIGHTS,
  dong: area.name,
  contract: addDays(today, 5),
  balance: addDays(today, 41),
};

/** 화면 상태 → 산출식 입력. livingOneWayMin을 주면 그 지역 기준(②), 없으면 학교 주변 기본값(①) */
export function toScoreInput(s: AppState, override?: { livingOneWayMin?: number; rent?: number; mgmt?: number }): ScoreInput {
  const living = override?.livingOneWayMin != null ? override.livingOneWayMin * 2 : school.defaultLivingRoundTripMin;
  return {
    commuteRoundTripH: (s.oneWayMin * 2) / 60,
    transfers: s.transfers,
    fareRoundTrip: s.fareRoundTrip,
    daysPerWeek: s.daysPerWeek,
    hourlyWage: s.hourlyWage,
    livingRoundTripH: living / 60,
    rent: override?.rent ?? s.rent,
    mgmt: override?.mgmt ?? s.mgmt,
    extraLiving: s.extraLiving,
    deposit: s.deposit,
    annualRate: s.annualRate,
    initialCost: s.initialCost,
    weights: s.weights,
  };
}

const KEY = "homeet-state";
const Ctx = createContext<[AppState, (p: Partial<AppState>) => void, boolean] | null>(null);

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved) setState({ ...initialState, ...JSON.parse(saved) });
    } catch {}
    setReady(true);
  }, []);

  const update = (p: Partial<AppState>) =>
    setState((s) => {
      const next = { ...s, ...p };
      try {
        sessionStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  // 저장값 복원 전에는 그리지 않음 (기본값이 잠깐 보였다가 바뀌는 깜빡임 방지)
  return <Ctx.Provider value={[state, update, ready]}>{ready && children}</Ctx.Provider>;
}

export const useAppState = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("StateProvider missing");
  return c;
};
