// The chat row passes its reply's steps here. Kept out of the chat screen so that file doesn't have
// to change: it still renders <StepsRow steps={...} />, and this wrapper adds the page it opens.
import type { ComponentProps } from "react";
import { StepsRow as Pill } from "./steps-row";

export function StepsRow({ steps, botId = "chat", turnId }: ComponentProps<typeof Pill> & { turnId?: string }) {
  const id = turnId ?? steps.map((s) => `${s.tool}:${s.preview ?? ""}`).join("|").slice(0, 80) || "steps";
  return <Pill steps={steps} botId={botId} turnId={id} />;
}
