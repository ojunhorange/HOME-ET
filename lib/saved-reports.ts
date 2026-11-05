/** 저장된 리포트: 클라이언트·서버 공용 타입과 순수 함수 */
import type { AppState } from "./app-state";
import { compute } from "./calc";
import { findSchool } from "./data";

export const MAX_REPORTS = 3;
/** 저장 요청 본문 상한 (AppState 스냅샷은 보통 2~3KB) */
export const MAX_BODY_BYTES = 32_000;
export const SCHEMA_VERSION = 1;

/** 저장하는 입력 = AppState에서 화면 위치(step)·일시 선택(decision)을 뺀 것 */
export type ReportInput = Omit<AppState, "step" | "maxStep" | "decision">;

export interface ReportSummary {
  index: number; // 자취지수 0~100
  recommended: boolean;
  myHour: number; // 내가 매기는 1시간의 가치(원)
  buyBack: number; // 자취로 1시간을 되사는 가격(원)
}

export interface SavedReportMeta {
  id: string;
  title: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  summary: ReportSummary;
}
export interface SavedReport extends SavedReportMeta {
  input: unknown; // 예전 형식일 수 있어서 열 때 migrateState()로 옮김
}

export type ReportsError = "unauthorized" | "disabled" | "full" | "not_found" | "invalid" | "too_large" | "server";

export function toInput(s: AppState): ReportInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 저장에서 빼는 필드
  const { step, maxStep, decision, ...rest } = s;
  return rest;
}

/** 입력이 바뀌었는지 비교용 지문 (같은 입력이면 같은 값) */
export function inputHash(s: AppState): string {
  const str = JSON.stringify(toInput(s));
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `${str.length}:${(h >>> 0).toString(36)}`;
}

/** 목록 표시용 요약. 서버가 저장할 때 다시 계산해서 넣음 (클라이언트 값을 믿지 않음) */
export function buildSummary(s: AppState): ReportSummary | null {
  const r = compute(s.commute, s.costs, s.adj);
  const summary = {
    index: Math.round(r.index * 10) / 10,
    recommended: r.index >= 50,
    myHour: Math.round(r.myHourValue),
    buyBack: Math.round(r.buyBackPrice),
  };
  return [summary.index, summary.myHour, summary.buyBack].every(Number.isFinite) ? summary : null;
}

/** "고려대학교 · 남양주시 별내동" */
export function reportTitle(s: AppState): string {
  const school = findSchool(s.schoolId).name;
  const home = s.home.trim().replace(/^(서울특별시|서울시|서울|경기도|경기|인천광역시|인천)\s*/, "");
  const shortHome = home.length > 18 ? `${home.slice(0, 17)}…` : home;
  return shortHome ? `${school} · ${shortHome}` : school;
}

export const REPORT_ID = /^[A-Za-z0-9]{1,40}$/;
