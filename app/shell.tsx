"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { StateProvider } from "@/lib/state";
import { initAnalytics } from "@/lib/firebase";

export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

const STEPS = [
  ["/", "정보 입력"],
  ["/report", "자취 적합 리포트"],
  ["/rent", "맞춤 월세 추천"],
  ["/dday", "계약 D-day"],
] as const;

export function Logo() {
  return (
    <span className="text-xl font-extrabold tracking-tight">
      HOME<span className="text-accent">:</span>ET
    </span>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useEffect(() => {
    initAnalytics().catch(() => {}); // 광고 차단기 등으로 실패해도 앱은 계속 동작
  }, []);
  const body = (
    <StateProvider>
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <Logo />
            <span className="hidden text-xs text-muted sm:inline">첫 집을 만나는 순간</span>
          </Link>
          <nav className="flex gap-1 overflow-x-auto text-sm">
            {STEPS.map(([href, label], i) => (
              <Link
                key={href}
                href={href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 ${path === href ? "bg-brand font-bold text-white" : "text-muted hover:text-ink"}`}
              >
                {i + 1} {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </StateProvider>
  );
  return MAPS_KEY ? <APIProvider apiKey={MAPS_KEY} language="ko" region="KR">{body}</APIProvider> : body;
}
