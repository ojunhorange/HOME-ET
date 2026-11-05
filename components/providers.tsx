"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import { CALENDAR_SCOPE } from "@/lib/dday";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface AuthState {
  enabled: boolean;
  /** 로그인 + Firebase가 모두 설정돼 리포트 저장을 쓸 수 있는지 */
  saving: boolean;
  status: "loading" | "authenticated" | "unauthenticated";
  name: string | null;
  image: string | null;
  email: string | null;
  /** 로그인 이동 중 (버튼 연타 방지: 두 번 시작하면 PKCE 값이 꼬여 로그인이 실패함) */
  signingIn: boolean;
  /** callbackUrl: 로그인 후 돌아올 주소 (기본: 지금 페이지) */
  signIn: (callbackUrl?: string) => void;
  /** Google 캘린더에 일정을 넣을 권한을 받았는지 */
  calendar: boolean;
  /** 캘린더 권한까지 받는 로그인 (이미 로그인했어도 권한 추가 화면으로). 끝나면 redirectTo로 돌아옴 */
  connectCalendar: (redirectTo: string) => void;
  signOut: () => void;
}

const disabled: AuthState = {
  enabled: false,
  saving: false,
  status: "unauthenticated",
  name: null,
  image: null,
  email: null,
  signingIn: false,
  signIn: () => {},
  calendar: false,
  connectCalendar: () => {},
  signOut: () => {},
};

const AuthContext = createContext<AuthState>(disabled);
export const useAuth = () => useContext(AuthContext);

function Bridge({ saving, children }: { saving: boolean; children: ReactNode }) {
  const { data, status } = useSession();
  const [signingIn, setSigningIn] = useState(false);
  const busy = useRef(false); // 같은 틱 안의 연타까지 막음 (state는 다음 렌더에 반영)

  // Google 화면에서 뒤로 가기로 돌아오면(bfcache) 버튼이 잠긴 채 남지 않게 풀어 줌
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        busy.current = false;
        setSigningIn(false);
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const start = useCallback((callbackUrl?: string, params?: Record<string, string>) => {
    if (busy.current) return;
    busy.current = true;
    setSigningIn(true);
    void signIn("google", callbackUrl ? { redirectTo: callbackUrl } : undefined, params).catch(() => {
      busy.current = false;
      setSigningIn(false);
    });
  }, []);

  const value: AuthState = {
    enabled: true,
    saving,
    status,
    name: data?.user?.name ?? null,
    image: data?.user?.image ?? null,
    email: data?.user?.email ?? null,
    signingIn,
    signIn: (callbackUrl) => start(callbackUrl),
    calendar: Boolean(data?.calendar),
    connectCalendar: (redirectTo) =>
      start(redirectTo, {
        scope: `openid email profile ${CALENDAR_SCOPE}`,
        include_granted_scopes: "true",
        access_type: "offline", // 1시간 뒤에도 등록할 수 있게 refresh token 받기
        // 이미 로그인했으면 그 계정으로 바로 (계정 선택 없이). 아니면 기본 로그인처럼 계정 선택부터(공용 기기 대비)
        // consent: 매번 동의 화면을 띄워 refresh token 받기
        ...(status === "authenticated" && data?.user?.email
          ? { login_hint: data.user.email, prompt: "consent" }
          : { prompt: "select_account consent" }),
      }),
    // 로그아웃하면 어느 화면에 있든 시작 화면으로 (?logout=1 → HomeEtApp이 이 기기의 입력도 비움)
    signOut: () => void signOut({ redirectTo: "/?logout=1" }),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** 브라우저용 Google Maps 키. 없으면 자동완성·지도 없이 기존 입력칸과 지도로 동작 */
export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function MapsProvider({ children }: { children: ReactNode }) {
  if (!MAPS_KEY) return children;
  return (
    <APIProvider apiKey={MAPS_KEY} language="ko" region="KR">
      {children}
    </APIProvider>
  );
}

export function Providers({
  authEnabled, savingEnabled, children,
}: { authEnabled: boolean; savingEnabled: boolean; children: ReactNode }) {
  if (!authEnabled) return <AuthContext.Provider value={disabled}><MapsProvider>{children}</MapsProvider></AuthContext.Provider>;
  return (
    <SessionProvider>
      <Bridge saving={savingEnabled}>
        <MapsProvider>{children}</MapsProvider>
      </Bridge>
    </SessionProvider>
  );
}
