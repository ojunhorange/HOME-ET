import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 입력 방식 비교(A·B·C·기존) 때 쓰던 주소 → 확정된 A가 있는 / 로
  async redirects() {
    return ["/step", "/stack", "/sheet", "/classic"].map((source) => ({ source, destination: "/", permanent: false }));
  },
  partialPrefetching: true,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
