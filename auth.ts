import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getToken } from "next-auth/jwt";
import { CALENDAR_SCOPE, WRONG_ACCOUNT } from "@/lib/dday";

// 로그인은 선택 사항: AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET 이 있을 때만 켜져요.
// 회원 DB 없이 JWT 세션만 씁니다 (MVP).
export const authEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET,
);

declare module "next-auth" {
  interface Session {
    /** 캘린더 권한을 받았는지 (토큰 자체는 브라우저로 보내지 않음) */
    calendar?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number; // 초 단위 (Unix)
    scope?: string;
  }
}

/** 브라우저가 보낸 세션 쿠키(JWT)를 서버에서 직접 풀어 읽음 (Google 토큰은 session 응답에 없으므로) */
export const readSessionToken = (req: Request) =>
  getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: new URL(req.url).protocol === "https:" });

// 요청을 받아 설정을 만드는 형태: 로그인 콜백에서 기존 세션 쿠키를 읽기 위해
export const { handlers, auth, signIn, signOut } = NextAuth((req) => ({
  // 항상 Google 계정 선택 화면을 띄움 (안 그러면 브라우저에 로그인된 계정으로 바로 넘어가서
  // 다른 계정으로 바꾸거나, 공용 기기에서 다음 사람이 자기 계정으로 로그인할 수 없음)
  providers: [Google({ authorization: { params: { prompt: "select_account" } } })],
  session: { strategy: "jwt" },
  callbacks: {
    // 이미 로그인한 사람이 캘린더 권한을 추가하다가 다른 계정을 고르면 거절 → 기존 로그인·저장 리포트가 그대로 유지됨
    async signIn({ account }) {
      if (!req || account?.provider !== "google" || !account.scope?.split(" ").includes(CALENDAR_SCOPE)) return true;
      const prev = await readSessionToken(req);
      if (typeof prev?.uid === "string" && prev.uid !== `google:${account.providerAccountId}`) return `/?gcal=${WRONG_ACCOUNT}`;
      return true;
    },
    // 어댑터 없는 OAuth에선 user.id가 로그인마다 새 UUID라서(token.sub도 바뀜),
    // 리포트 저장 키로는 Google 계정 고유 ID(sub)를 따로 담아 둔다.
    // Google 토큰은 암호화된 세션 쿠키(JWT) 안에만 보관. /api/calendar 가 서버에서 꺼내 씀
    jwt({ token, account }) {
      if (account?.provider === "google" && account.providerAccountId) {
        token.uid = `google:${account.providerAccountId}`;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt = account.expires_at;
        token.scope = account.scope;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      session.calendar = Boolean(token.scope?.split(" ").includes(CALENDAR_SCOPE));
      return session;
    },
  },
}));

/** 서버에서 로그인한 사용자의 저장 키. 로그인 안 했거나 예전 세션(uid 없음)이면 null */
export async function currentUid(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === "string" && id.startsWith("google:") ? id : null;
}
