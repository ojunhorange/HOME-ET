"use client";

/** 저장된 리포트 상태·동작. HomeEtApp이 감싸고, 리포트 화면의 저장 패널과 헤더의 '내 리포트'가 같이 씀 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { migrateState, type AppState } from "@/lib/app-state";
import {
  MAX_REPORTS, inputHash, toInput,
  type ReportsError, type SavedReport, type SavedReportMeta,
} from "@/lib/saved-reports";
import { useAuth } from "../providers";

/** 지금 화면의 입력이 어느 저장 리포트에서 왔는지 (덮어쓰기·"저장됨" 표시용). 로그인 이동 후에도 남게 저장 */
type SavedRef = { id: string; hash: string };
const REF_KEY = "home-et:v1:saved-ref";
const readRef = (): SavedRef | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(REF_KEY) ?? "null");
    return v && typeof v.id === "string" && typeof v.hash === "string" ? v : null;
  } catch {
    return null;
  }
};
/** 로그아웃 때 '저장 리포트를 고치는 중' 표시도 지움 */
export const clearSavedRef = () => writeRef(null);
const writeRef = (v: SavedRef | null) => {
  try {
    if (v) sessionStorage.setItem(REF_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(REF_KEY);
  } catch {
    /* 저장소를 못 쓰면 이번 방문 동안만 기억 */
  }
};

const MESSAGES: Partial<Record<ReportsError, string>> = {
  unauthorized: "로그인이 풀렸어요. 다시 로그인해 주세요.",
  disabled: "지금은 리포트 저장을 쓸 수 없어요.",
  not_found: "리포트를 찾지 못했어요. 목록을 다시 불러왔어요.",
  invalid: "저장할 수 없는 리포트예요. 검사를 다시 해 주세요.",
  too_large: "리포트가 너무 커서 저장하지 못했어요.",
};
/** 로그인 후 돌아와서 목록을 열라는 표시 (?reports=1) */
const OPEN_PARAM = "reports";
const FULL_NOTICE = `리포트는 ${MAX_REPORTS}개까지 저장돼요. 하나를 지우면 새로 저장할 수 있어요.`;

class ApiError extends Error {
  constructor(public code: ReportsError) {
    super(code);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: ReportsError }).error ?? "server");
  return body as T;
}

interface ReportsCtx {
  /** 저장 기능이 켜져 있는지 (로그인 + Firebase 설정) */
  enabled: boolean;
  signedIn: boolean;
  /** 로그인 이동 중 (버튼 잠금용) */
  signingIn: boolean;
  /** 로그인 상태 확인 중 (버튼 잠금용) */
  authLoading: boolean;
  /** callbackUrl: 로그인 후 돌아올 주소 (기본: 지금 페이지) */
  signIn: (callbackUrl?: string) => void;
  /** 기존 리포트 보기: 로그인했으면 목록 열기, 아니면 로그인 후 돌아와서 목록 열기 */
  openReports: () => void;
  /** null = 아직 못 불러옴 */
  list: SavedReportMeta[] | null;
  busy: boolean;
  error: string | null;
  full: boolean;
  /** 지금 입력이 마지막으로 저장한 것과 같은지 */
  isSaved: boolean;
  /** 저장 리포트를 열어서 고치는 중이면 그 리포트 (덮어쓰기 대상) */
  editing: SavedReportMeta | null;
  /** 결과 화면(2~4단계)에서 저장 안 된 결과를 보고 있는지 (다른 리포트를 열기 전에 확인). 시작 화면에선 묻지 않음 */
  hasUnsaved: boolean;
  dialog: { open: boolean; notice: string | null };
  openDialog: (notice?: string) => void;
  closeDialog: () => void;
  saveNew: () => Promise<void>;
  overwrite: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  open: (id: string) => Promise<void>;
}

const Ctx = createContext<ReportsCtx | null>(null);

export function useReports() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReports는 ReportsProvider 안에서 써야 해요");
  return v;
}

export function ReportsProvider({
  state, ready, onLoad, runId, children,
}: {
  state: AppState;
  /** 새로 검사할 때마다 바뀌는 값. 바뀌면 '저장 리포트를 고치는 중' 표시를 지움 (새 결과는 새로 저장) */
  runId: number;
  /** sessionStorage 복원이 끝났는지 (그 전엔 저장 지문을 읽지 않음) */
  ready: boolean;
  /** 저장된 리포트를 현재 상태로 불러오기 */
  onLoad: (s: AppState) => void;
  children: ReactNode;
}) {
  const auth = useAuth();
  const enabled = auth.saving;
  const signedIn = enabled && auth.status === "authenticated";
  // 페이지를 연 직후 세션 확인 중: 이때 누르면 로그인 안 된 걸로 오인해 로그인 화면으로 보냄 → 버튼 잠금
  const authLoading = enabled && auth.status === "loading";
  const [list, setList] = useState<SavedReportMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRefState] = useState<SavedRef | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; notice: string | null }>({ open: false, notice: null });

  const setRef = useCallback((v: SavedRef | null) => {
    setRefState(v);
    writeRef(v);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 전용 값(sessionStorage)으로 초기화
    if (ready) setRefState(readRef());
  }, [ready]);

  // 새로 검사하면 예전에 열었던·저장했던 리포트와의 연결을 끊음 → '덮어쓰기' 대신 '리포트 저장'만
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 부모의 '새 검사' 신호에 맞춰 한 번 초기화
    if (runId > 0) setRef(null);
  }, [runId, setRef]);

  const refresh = useCallback(async () => {
    try {
      const { reports } = await api<{ reports: SavedReportMeta[] }>("/api/reports");
      setList(reports);
    } catch (e) {
      setError(MESSAGES[(e as ApiError).code] ?? "리포트 목록을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그인 상태가 바뀌면 목록을 다시 불러옴
    if (signedIn) void refresh();
    else setList(null);
  }, [signedIn, refresh]);

  const hash = useMemo(() => inputHash(state), [state]);
  const isSaved = !!ref && ref.hash === hash;
  const editing = (ref && list?.find((r) => r.id === ref.id)) || null;
  const full = (list?.length ?? 0) >= MAX_REPORTS;
  const hasUnsaved = state.step !== 1 && state.analysis !== null && !isSaved;

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (e) {
        const code = e instanceof ApiError ? e.code : "server";
        if (code === "full") setDialog({ open: true, notice: FULL_NOTICE });
        else setError(MESSAGES[code] ?? "잠시 후 다시 시도해 주세요. 저장 서버에 연결하지 못했어요.");
        if (code === "not_found" || code === "full") await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const saveNew = useCallback(async () => {
    if (full) {
      setDialog({ open: true, notice: FULL_NOTICE });
      return;
    }
    await run(async () => {
      const { report } = await api<{ report: SavedReportMeta }>("/api/reports", {
        method: "POST",
        body: JSON.stringify({ input: toInput(state) }),
      });
      setRef({ id: report.id, hash });
      setList((l) => [report, ...(l ?? []).filter((r) => r.id !== report.id)]);
    });
  }, [full, run, state, hash, setRef]);

  const overwrite = useCallback(async () => {
    if (!editing) return;
    await run(async () => {
      const { report } = await api<{ report: SavedReportMeta }>(`/api/reports/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({ input: toInput(state) }),
      });
      setRef({ id: report.id, hash });
      setList((l) => (l ?? []).map((r) => (r.id === report.id ? report : r)));
    });
  }, [editing, run, state, hash, setRef]);

  const remove = useCallback(
    async (id: string) => {
      await run(async () => {
        await api<void>(`/api/reports/${id}`, { method: "DELETE" });
        setList((l) => (l ?? []).filter((r) => r.id !== id));
        if (ref?.id === id) setRef(null);
        setDialog((d) => ({ ...d, notice: null }));
      });
    },
    [run, ref, setRef],
  );

  const open = useCallback(
    async (id: string) => {
      await run(async () => {
        const { report } = await api<{ report: SavedReport }>(`/api/reports/${id}`);
        const loaded = migrateState(report.input);
        if (!loaded?.analysis) throw new ApiError("invalid");
        const next: AppState = { ...loaded, step: 2, maxStep: Math.max(loaded.maxStep, 2) as AppState["maxStep"], decision: null };
        onLoad(next);
        setRef({ id: report.id, hash: inputHash(next) });
        setDialog({ open: false, notice: null });
      });
    },
    [run, onLoad, setRef],
  );

  const openDialog = useCallback((notice?: string) => setDialog({ open: true, notice: notice ?? null }), []);
  const closeDialog = useCallback(() => setDialog({ open: false, notice: null }), []);

  const { signIn } = auth;
  const openReports = useCallback(() => {
    if (authLoading) return;
    if (signedIn) openDialog();
    else signIn(`${window.location.pathname}?${OPEN_PARAM}=1`);
  }, [authLoading, signedIn, openDialog, signIn]);

  // '기존 리포트 보기'로 로그인하고 돌아왔으면 목록을 바로 열고, 주소의 표시는 지움
  useEffect(() => {
    if (!signedIn) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(OPEN_PARAM)) return;
    url.searchParams.delete(OPEN_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그인 후 돌아온 직후 한 번만
    openDialog();
  }, [signedIn, openDialog]);

  const value: ReportsCtx = {
    enabled,
    signedIn,
    signingIn: auth.signingIn,
    authLoading,
    signIn: auth.signIn,
    openReports,
    list,
    busy,
    error,
    full,
    isSaved,
    editing,
    hasUnsaved,
    dialog,
    openDialog,
    closeDialog,
    saveNew,
    overwrite,
    remove,
    open,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
