import type { Metadata } from "next";
import "./globals.css";
import Shell from "./shell";

export const metadata: Metadata = {
  title: "HOME:ET · 첫 집을 만나는 순간",
  description: "서울 대학생을 위한 첫 자취 판단 도우미. 통학 대비 자취의 가치를 수치로 보여 주고 적정 월세와 계약 D-day까지 안내해요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
