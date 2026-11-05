import type { ReactNode } from "react";
import { Card, CardTitle } from "@/components/ui";

/**
 * 등본 확인의 겉모양. bare면 카드와 제목 없이 내용만
 * (오른쪽 아래 도우미 창 안에서는 창 머리가 제목 역할을 해서 bare로 씀). 안쪽 배치는 담긴 영역 폭 기준(@container)
 */
export function ToolShell({ bare, title, meta, children }: { bare?: boolean; title: string; meta?: string; children: ReactNode }) {
  if (bare) return <div className="@container">{children}</div>;
  return (
    <Card className="@container">
      <CardTitle meta={meta}>{title}</CardTitle>
      {children}
    </Card>
  );
}
