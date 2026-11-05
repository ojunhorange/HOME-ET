import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Outfit } from "next/font/google";
import { authEnabled } from "@/auth";
import { Providers } from "@/components/providers";
import { firebaseEnabled } from "@/lib/firebase-env";
import "./globals.css";

// 본문: Noto Sans KR (가변 굵기). 한글 글리프는 unicode-range 조각으로 필요한 것만 받음
const notoSansKr = Noto_Sans_KR({ subsets: ["latin"], display: "swap", variable: "--font-noto-kr" });
// 로고 HOME:ET 전용
const outfit = Outfit({ subsets: ["latin"], weight: ["600"], display: "swap", variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "HOME:ET · 첫 자취, 해도 될까?",
  description: "서울 대학생을 위한 첫 자취 판단 도우미. 통학 시간과 체력을 돈으로 바꿔 자취의 실제 가치를 보여 드려요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // 하단 고정 버튼이 홈 인디케이터 영역(safe-area)을 피하도록
  interactiveWidget: "resizes-content", // Android: 키보드가 뜨면 레이아웃이 줄어 하단 버튼이 키보드 위에 붙음
  themeColor: "#f5f6f8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`h-full antialiased ${notoSansKr.variable} ${outfit.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <Providers authEnabled={authEnabled} savingEnabled={authEnabled && firebaseEnabled}>{children}</Providers>
      </body>
    </html>
  );
}
