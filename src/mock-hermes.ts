// Offline demo backend. Same interface as HermesClient, no network: seeded chats, a word-by-word
// streamed markdown reply, simulated tool steps, and an approval that resolves locally.
import type { TurnAction } from "./chat-model";
import type { ChatClient, OnAction } from "./hermes";

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

  streamTurn(sessionId: string, input: string, onAction: OnAction): () => void {
    let cancelled = false;
    const runId = `run-${++this.runs}`;
    const emit = (a: TurnAction) => { if (!cancelled) onAction(a); };
    const session = this.sessions.find((s) => s.id === sessionId);
    session?.messages.push({ role: "user", content: input, timestamp: Date.now() / 1000 });

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
        await this.words(this.replyFor(input), emit, () => cancelled);
      }
      if (cancelled) return;
      emit({ type: "done", status: "completed" });
      session?.messages.push({ role: "assistant", content: this.lastText, timestamp: Date.now() / 1000 });
    })();
    return () => { cancelled = true; this.approvals.get(runId)?.("deny"); };
  }

  private lastText = "";
  private async words(text: string, emit: (a: TurnAction) => void, isCancelled: () => boolean) {
    this.lastText = text;
    for (const piece of text.match(/\S+\s*|\s+/g) ?? []) {
      if (isCancelled()) return;
      emit({ type: "delta", text: piece });
      await sleep(35);
    }
  }
}
