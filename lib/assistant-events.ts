/**
 * 오른쪽 아래 도우미(components/assistant/assistant.tsx)를 다른 화면에서 여는 신호.
 * 도우미는 앱 전체에 하나만 있어서, 화면끼리 props를 잇지 않고 브라우저 이벤트로 연다.
 */
export type AssistantMode = "home" | "law" | "registry";

const EVENT = "home-et:assistant";

export interface AssistantRequest {
  mode: AssistantMode;
  question?: string; // law: 열자마자 이 질문을 보냄
}

export function openAssistant(req: AssistantRequest) {
  window.dispatchEvent(new CustomEvent<AssistantRequest>(EVENT, { detail: req }));
}

export function onAssistantRequest(fn: (req: AssistantRequest) => void) {
  const handler = (e: Event) => fn((e as CustomEvent<AssistantRequest>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
