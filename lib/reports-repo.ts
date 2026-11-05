// 서버 전용: Firestore users/{uid}/reports/{id} 읽기·쓰기
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import type { AppState } from "./app-state";
import { firestore } from "./firebase-admin";
import {
  MAX_REPORTS, SCHEMA_VERSION, buildSummary, reportTitle, toInput,
  type ReportSummary, type SavedReport, type SavedReportMeta,
} from "./saved-reports";

export class ReportsFullError extends Error {}
export class InvalidReportError extends Error {}

const reports = (uid: string) => firestore().collection("users").doc(uid).collection("reports");

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : new Date(0).toISOString());

function toMeta(doc: DocumentSnapshot): SavedReportMeta {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    title: String(d.title ?? ""),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt ?? d.createdAt),
    summary: d.summary as ReportSummary,
  };
}

function payload(state: AppState) {
  const summary = buildSummary(state);
  if (!summary) throw new InvalidReportError("summary not finite");
  return { input: toInput(state), summary, schemaVersion: SCHEMA_VERSION, updatedAt: FieldValue.serverTimestamp() };
}

export async function listReports(uid: string): Promise<SavedReportMeta[]> {
  const snap = await reports(uid).orderBy("createdAt", "desc").limit(MAX_REPORTS).get();
  return snap.docs.map(toMeta);
}

export async function getReport(uid: string, id: string): Promise<SavedReport | null> {
  const doc = await reports(uid).doc(id).get();
  return doc.exists ? { ...toMeta(doc), input: doc.data()?.input } : null;
}

/** 새로 저장. 이미 MAX_REPORTS개면 ReportsFullError (트랜잭션이라 연타해도 넘지 않음) */
export async function createReport(uid: string, state: AppState): Promise<SavedReportMeta> {
  const col = reports(uid);
  const data = payload(state);
  const ref = col.doc();
  await firestore().runTransaction(async (tx) => {
    const existing = await tx.get(col.limit(MAX_REPORTS));
    if (existing.size >= MAX_REPORTS) throw new ReportsFullError();
    tx.create(ref, { ...data, title: reportTitle(state), createdAt: FieldValue.serverTimestamp() });
  });
  return toMeta(await ref.get());
}

/** 덮어쓰기 (개수와 무관). 없으면 null */
export async function updateReport(uid: string, id: string, state: AppState): Promise<SavedReportMeta | null> {
  const ref = reports(uid).doc(id);
  const data = payload(state);
  const ok = await firestore().runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists) return false;
    tx.update(ref, { ...data, title: reportTitle(state) });
    return true;
  });
  return ok ? toMeta(await ref.get()) : null;
}

export async function deleteReport(uid: string, id: string): Promise<boolean> {
  const ref = reports(uid).doc(id);
  if (!(await ref.get()).exists) return false;
  await ref.delete();
  return true;
}
