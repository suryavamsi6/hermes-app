// Pure Home attention selection and metric formatting. IDs and destinations are kept explicit so
// rendering never has to guess which run or step list an item belongs to.
import type { AssistantTurn, Step, Turn } from "../chat-model";
import { activityLine } from "./activity";

export type AttentionChat = { busy: boolean; loaded: boolean; turns: Turn[] };
type Base = { key: string; botId?: string; metric: string; title: string; detail?: string };
export type AttentionItem =
  | (Base & { kind: "approval"; botId: string; turnId: string; destination: { kind: "chat"; path: string } })
  | (Base & { kind: "running"; botId: string; turnId: string; startedAt?: number; destination: { kind: "chat"; path: string } })
  | (Base & { kind: "failed"; botId: string; turnId: string; steps: Step[]; destination: { kind: "steps"; path: string } })
  | (Base & { kind: "unread"; botId: string; destination: { kind: "chat"; path: string } })
  | (Base & { kind: "routine"; botId: string; jobId: string; destination: { kind: "routines"; path: string } })
  | (Base & { kind: "time"; destination: null });
export type AttentionCounts = { approval: number; running: number; failed: number; time: number; unread?: number; routine?: number };
export type AttentionSelection = { items: AttentionItem[]; counts: AttentionCounts; loading: boolean };

const chatPath = (id: string) => `/bot/${encodeURIComponent(id)}`;
const stepsPath = (botId: string, turnId: string) => `/steps/${encodeURIComponent(botId)}/${encodeURIComponent(turnId)}`;
const assistants = (chats: Record<string, AttentionChat>) => Object.keys(chats).sort((a, b) => a.localeCompare(b));
const latestOpen = (turns: Turn[]): AssistantTurn | undefined => {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn.role === "assistant" && !turn.note && turn.status === "streaming") return turn;
  }
  return undefined;
};

/** Elapsed time is only shown when a local run supplied a trustworthy start timestamp. */
export function formatElapsed(startedAt: number | undefined, now: number): string {
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt) || startedAt < 0) return "Running";
  const seconds = Math.floor(Math.max(0, now - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatDeviceTime(now: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(now));
}

/**
 * Pick current actionable work in stable severity order. Approval owns its turn, and only the
 * newest open streaming turn owns a busy chat, avoiding stale approvals and split-run duplicates.
 */
export function selectAttentionItems(
  chats: Record<string, AttentionChat>,
  now: number,
  options: {
    loading?: boolean;
    locale?: string;
    unread?: { botId: string; count: number };
    routines?: { botId: string; jobId: string; name: string; detail?: string }[];
  } = {},
): AttentionSelection {
  const ids = assistants(chats);
  const items: AttentionItem[] = [];
  for (const botId of ids) {
    const chat = chats[botId];
    const turn = latestOpen(chat.turns);
    if (!turn?.approval) continue;
    items.push({ key: `approval:${botId}:${turn.id}`, kind: "approval", botId, turnId: turn.id,
      metric: "1", title: turn.approval.title, detail: turn.approval.detail,
      destination: { kind: "chat", path: chatPath(botId) } });
  }
  for (const botId of ids) {
    const chat = chats[botId];
    if (!chat.busy) continue;
    const turn = latestOpen(chat.turns);
    if (!turn || turn.approval) continue;
    const detail = turn.text ? "Writing a reply" : activityLine(turn) ?? "Thinking";
    items.push({ key: `running:${botId}:${turn.id}`, kind: "running", botId, turnId: turn.id,
      startedAt: turn.startedAt, metric: formatElapsed(turn.startedAt, now), title: detail,
      detail: turn.reconnecting ? "Reconnecting" : undefined,
      destination: { kind: "chat", path: chatPath(botId) } });
  }
  for (const botId of ids) {
    for (const turn of chats[botId].turns) {
      if (turn.role !== "assistant" || turn.note || turn.status !== "failed") continue;
      const failures = turn.steps.filter((step) => step.status === "failed");
      if (!failures.length) continue;
      items.push({ key: `failed:${botId}:${turn.id}`, kind: "failed", botId, turnId: turn.id,
        metric: String(failures.length), title: `${failures.length} failed ${failures.length === 1 ? "step" : "steps"}`,
        detail: failures.map((step) => step.tool).join(", "), steps: turn.steps,
        destination: { kind: "steps", path: stepsPath(botId, turn.id) } });
    }
  }
  for (const routine of options.routines ?? []) {
    items.push({ key: `routine:${routine.botId}:${routine.jobId}`, kind: "routine", botId: routine.botId, jobId: routine.jobId,
      metric: "Failed", title: routine.name, detail: routine.detail,
      destination: { kind: "routines", path: `/routines?bot=${encodeURIComponent(routine.botId)}&job=${encodeURIComponent(routine.jobId)}` } });
  }
  if (options.unread && options.unread.count > 0) {
    const { botId, count } = options.unread;
    items.push({ key: `unread:${botId}`, kind: "unread", botId, metric: String(count), title: `${count} unread ${count === 1 ? "reply" : "replies"}`,
      destination: { kind: "chat", path: chatPath(botId) } });
  }
  items.push({ key: "time:device", kind: "time", metric: formatDeviceTime(now, options.locale), title: "Local time", destination: null });
  const counts: AttentionCounts = { approval: 0, running: 0, failed: 0, time: 0 };
  for (const item of items) {
    if (item.kind === "failed") counts.failed += Number(item.metric);
    else if (item.kind === "approval" || item.kind === "running" || item.kind === "time") counts[item.kind]++;
    else if (item.kind === "unread") counts.unread = (counts.unread ?? 0) + 1;
    else if (item.kind === "routine") counts.routine = (counts.routine ?? 0) + 1;
  }
  return { items, counts, loading: !!options.loading || ids.some((id) => !chats[id].loaded) };
}

/** Keep a selected key if possible; otherwise choose the nearest surviving item by old position. */
export function reconcileAttentionKey(previousKey: string | undefined, previous: AttentionItem[], next: AttentionItem[]): string | undefined {
  if (!next.length) return undefined;
  if (previousKey && next.some((item) => item.key === previousKey)) return previousKey;
  const oldIndex = previous.findIndex((item) => item.key === previousKey);
  return next[Math.min(Math.max(oldIndex, 0), next.length - 1)].key;
}
