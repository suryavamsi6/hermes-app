// Offline demo backend. Same interface as HermesClient, no network: seeded chats, a word-by-word
// streamed markdown reply, simulated tool steps, and an approval that resolves locally.
import type { TurnAction } from "./chat-model";
import type { ChatClient, OnAction } from "./hermes";
import { HermesError } from "./errors";
import { inputText, type TurnInput } from "./run-stream";

type Msg = { role: "user" | "assistant"; content: string; timestamp?: number };
export type Session = { id: string; title: string; messages: Msg[] };
/** ageMin: how long ago the seeded chat happened (drives Home's relative times). */
export type MockFlavor = { ageMin?: number; sessions?: Session[]; reply?: (input: string) => string; tools?: { tool: string; preview: (input: string) => string; result: string }[] };

const defaultSessions: Session[] = [
  { id: "demo-pi", title: "Pi health check", messages: [
    { role: "user", content: "How is the Pi doing?" },
    { role: "assistant", content: "All good. **CPU** 7%, **RAM** 1.9 / 8 GB, disk 41% used. `tailscaled` and `hermes gateway` are both running." },
  ] },
  { id: "demo-markets", title: "Morning market brief", messages: [
    { role: "user", content: "Give me a quick market brief" },
    { role: "assistant", content: "The S&P 500 opened flat. Tech led gains, banks lagged.\n\n- Watch: earnings season this week\n- Your watchlist: no big moves" },
  ] },
  { id: "demo-cleanup", title: "Clean up old logs", messages: [] },
];

const reply = (input: string) => `Here's what I found for **"${input.slice(0, 40)}"**.

| Service | Status | Uptime |
|---|---|---|
| hermes gateway | running | 3d 4h |
| tailscaled | running | 3d 4h |
| litellm | running | 12h |

To check it yourself on the Pi:

\`\`\`bash
systemctl status tailscaled --no-pager
curl -s http://127.0.0.1:8642/health
\`\`\`

This is **demo mode**, so nothing above is real.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockHermesClient implements ChatClient {
  private sessions: Session[];
  private replyFor: (input: string) => string;
  private tools: NonNullable<MockFlavor["tools"]>;
  constructor(flavor: MockFlavor = {}) {
    const at = Date.now() / 1000 - (flavor.ageMin ?? 5) * 60; // Hermes stores unix seconds
    this.sessions = (flavor.sessions ?? defaultSessions).map((s) => ({ ...s, messages: s.messages.map((m, i, all) => {
      // Older exchanges go back a day each, so the demo shows date dividers.
      const back = all.length - 1 - i;
      return { timestamp: at - back * 30 - Math.floor(back / 2) * 86400, ...m };
    }) }));
    this.replyFor = flavor.reply ?? reply;
    this.tools = flavor.tools ?? [
      { tool: "web_search", preview: (i) => i.slice(0, 60), result: "5 results" },
      { tool: "terminal", preview: () => "systemctl list-units --state=running", result: "3 services running" },
    ];
  }
  private approvals = new Map<string, (c: "once" | "deny") => void>();
  private runs = 0;

  async capabilities() { return { platform: "demo" }; }
  async listSessions() { return this.sessions.map(({ id, title }) => ({ id, title })); }
  async createSession(title?: string) {
    const id = `demo-${Date.now()}`;
    this.sessions.unshift({ id, title: title || "New chat", messages: [] });
    return id;
  }
  async messages(sessionId: string) { return { messages: this.sessions.find((s) => s.id === sessionId)?.messages ?? [] }; }
  async stop(runId: string) { this.approvals.get(runId)?.("deny"); return { status: "stopping" }; }
  async approve(runId: string, _requestId: string, _gen: number, choice: "once" | "deny") {
    const resolve = this.approvals.get(runId);
    if (!resolve) throw new Error("No pending approval");
    resolve(choice);
    return { ok: true };
  }

  /** How long the "flaky" demo stays in the reconnecting state. */
  flakyMs = 2500;

  private steers = new Map<string, string[]>();
  async steer(runId: string, text: string) {
    const list = this.steers.get(runId);
    if (!list) throw new HermesError(409, `/v1/runs/${runId}/steer`, "run_not_accepting_steer", "This reply already finished. Send it as a new message.");
    list.push(text);
  }

  streamTurn(sessionId: string, turnInput: TurnInput, onAction: OnAction): () => void {
    let cancelled = false;
    const runId = `run-${++this.runs}`;
    const images = typeof turnInput === "string" ? 0 : turnInput.filter((p) => p.type === "image_url").length;
    const input = inputText(turnInput);
    this.steers.set(runId, []);
    const emit = (a: TurnAction) => { if (!cancelled) onAction(a); };
    const session = this.sessions.find((s) => s.id === sessionId);
    session?.messages.push({ role: "user", content: turnInput as any, timestamp: Date.now() / 1000 });

    (async () => {
      emit({ type: "run", runId });
      await sleep(600);
      if (/flaky|reconnect/i.test(input)) { // demo of a dropped connection that recovers on its own
        emit({ type: "delta", text: "Checking that for you… " });
        emit({ type: "reconnecting" });
        await sleep(this.flakyMs);
        if (cancelled) return;
        emit({ type: "reconnected" });
      }
      const risky = /delete|remove|clean|rm /i.test(input) || sessionId === "demo-cleanup";
      if (risky) {
        emit({ type: "tool", phase: "started", tool: "terminal", preview: "find /var/log -name '*.gz' -mtime +30" });
        await sleep(700);
        emit({ type: "tool", phase: "completed", tool: "terminal", preview: "37 files, 412 MB" });
        emit({ type: "tool", phase: "started", tool: "terminal", preview: "sudo rm /var/log/*.gz (37 files)" });
        const choice = await new Promise<"once" | "deny">((resolve) => {
          this.approvals.set(runId, resolve);
          emit({ type: "approval", approval: { runId, requestId: "demo-approval", generation: 1, title: "Run a terminal command",
            detail: "sudo rm /var/log/*.gz   # 37 files, 412 MB" } });
        });
        this.approvals.delete(runId);
        if (cancelled) return;
        if (choice === "deny") {
          emit({ type: "tool", phase: "failed", tool: "terminal", preview: "BLOCKED: denied by user" });
          await this.words("OK, I **didn't delete anything**. The 37 old log archives (412 MB) are still in `/var/log`.", emit, () => cancelled);
        } else {
          await sleep(800);
          emit({ type: "tool", phase: "completed", tool: "terminal", preview: "removed 37 files" });
          await this.words("Done. I removed **37 old log archives** and freed **412 MB** on the Pi.\n\n| Before | After |\n|---|---|\n| 41% used | 36% used |", emit, () => cancelled);
        }
      } else {
        for (const t of this.tools) {
          emit({ type: "tool", phase: "started", tool: t.tool, preview: t.preview(input) });
          await sleep(850);
          if (cancelled) return;
          emit({ type: "tool", phase: "completed", tool: t.tool, preview: t.result });
        }
        const seen = images ? `I can see ${images === 1 ? "the photo" : `${images} photos`} you sent. ` : "";
        await this.words(seen + this.replyFor(input || "photo"), emit, () => cancelled);
        const added = this.steers.get(runId) ?? [];
        if (added.length && !cancelled) await this.words(`\n\nAlso, as you asked: **${added.join("; ")}**. Noted and applied.`, emit, () => cancelled, true);
      }
      this.steers.delete(runId);
      if (cancelled) return;
      emit({ type: "done", status: "completed" });
      session?.messages.push({ role: "assistant", content: this.lastText, timestamp: Date.now() / 1000 });
    })();
    return () => { cancelled = true; this.steers.delete(runId); this.approvals.get(runId)?.("deny"); };
  }

  private lastText = "";
  private async words(text: string, emit: (a: TurnAction) => void, isCancelled: () => boolean, append = false) {
    this.lastText = append ? this.lastText + text : text;
    for (const piece of text.match(/\S+\s*|\s+/g) ?? []) {
      if (isCancelled()) return;
      emit({ type: "delta", text: piece });
      await sleep(35);
    }
  }
}
