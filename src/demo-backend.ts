// Offline demo: three playful seeded bots, each with its own Bot Chat, routines, skills, toolsets,
// memory, MCP servers and plugins. Everything is in memory; no network calls.
import {
  type Backend, BOT_CHAT_TITLE, type Bot, type Job, type McpCatalogEntry, type McpServer, type Memory, type NewBot, type Plugin, type PluginCatalog, type Skill, type Toolset,
} from "./backend";
import type { ChatClient } from "./hermes";
import { MockHermesClient, type MockFlavor } from "./mock-hermes";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type BotData = { bot: Bot; client: MockHermesClient; jobs: Job[]; memory: Memory; mcp: McpServer[]; toolsets: Toolset[]; plugins: Plugin[] };

const TOOLSETS: Omit<Toolset, "enabled">[] = [
  { name: "web", label: "Web search", description: "Search and read the web" },
  { name: "terminal", label: "Terminal", description: "Run shell commands on the server" },
  { name: "browser", label: "Browser", description: "Drive a headless Chromium (browser_exec)" },
  { name: "computer_use", label: "Computer use", description: "Click and type in desktop apps (cua-driver)" },
  { name: "file", label: "Files", description: "Read and write files" },
  { name: "memory", label: "Memory", description: "Remember facts across chats" },
  { name: "cronjob", label: "Routines", description: "Schedule its own recurring jobs" },
];
const SKILLS: Skill[] = [
  { name: "github-pr-workflow", description: "Open, review and merge pull requests", category: "dev" },
  { name: "server-health", description: "Check containers, disks and services", category: "ops" },
  { name: "market-brief", description: "Summarise the markets, your watchlist and news", category: "finance" },
  { name: "obsidian-notes", description: "Read and append to your Obsidian vault", category: "notes" },
];
const PLUGIN_CATALOG: Omit<Plugin, "installed" | "enabled">[] = [
  { name: "camofox-browser", kind: "browser", version: "0.9.2", description: "Stealthy browser provider for browser_exec", tools: ["browser_exec"], skills: [] },
  { name: "lcm-context", kind: "context-engine", version: "1.3.0", description: "Lossless context management instead of summarising", tools: [], skills: [] },
  { name: "hindsight", kind: "memory-provider", version: "2.1.0", description: "Long-term memory with recall across chats", tools: ["hindsight_recall"], skills: [] },
  { name: "kanban", kind: "tools", version: "1.0.4", description: "A task board your bots can share", tools: ["kanban_add", "kanban_move"], skills: ["kanban-orchestrator"] },
  { name: "weather", kind: "tools", version: "0.2.0", description: "Forecasts for any city", tools: ["get_weather"], skills: [] },
];

const MCP_CATALOG: Omit<McpCatalogEntry, "installed" | "enabled">[] = [
  { name: "time", description: "Current time and timezone conversion", transport: "stdio", authType: "none", requiredEnv: [], command: "uvx mcp-server-time" },
  { name: "fetch", description: "Fetch a web page and return it as Markdown", transport: "stdio", authType: "none", requiredEnv: [], command: "uvx mcp-server-fetch" },
  { name: "github", description: "Issues, pull requests and code search on GitHub", transport: "http", authType: "env",
    requiredEnv: [{ name: "GITHUB_PERSONAL_ACCESS_TOKEN", prompt: "A GitHub token with repo scope", required: true }], url: "https://api.githubcopilot.com/mcp/" },
  { name: "linear", description: "Read and update Linear issues", transport: "http", authType: "oauth", requiredEnv: [], url: "https://mcp.linear.app/mcp" },
];

function bot(id: string, name: string, emoji: string, color: string, description: string, persona: string, model: string, look: Partial<Bot> = {}): Bot {
  return { id, profile: id === "atlas" ? "default" : id, name, emoji, color, description, persona, model, provider: "nous", ...look };
}
const ts = (on: string[]) => TOOLSETS.map((t) => ({ ...t, enabled: on.includes(t.name) }));
const plugins = (installed: string[], enabled: string[]) =>
  PLUGIN_CATALOG.map((p) => ({ ...p, installed: installed.includes(p.name), enabled: enabled.includes(p.name) }));
const session = (id: string, messages: { role: "user" | "assistant"; content: string }[]) => [{ id, title: BOT_CHAT_TITLE, messages }];

function seed(): BotData[] {
  const hermes: MockFlavor = { ageMin: 3,
    sessions: session("chat-atlas", [
      { role: "user", content: "Morning! Anything I should know today?" },
      { role: "assistant", content: "Morning ☀️ Three things:\n\n1. Your **dentist appointment** is Thursday at 10:00\n2. The library books are due Friday\n3. I tidied your task inbox: 4 tasks moved to *This week*" },
    ]),
  };
  const piOps: MockFlavor = { ageMin: 130,
    sessions: session("chat-forge", [
      { role: "user", content: "How's the server?" },
      { role: "assistant", content: "All green 🟢 `proxy`, `database` and `media` are up. Disk is at **41%**. Want me to clean old logs?" },
    ]),
    tools: [
      { tool: "terminal", preview: () => "docker ps --format '{{.Names}}'", result: "5 containers, all up" },
      { tool: "terminal", preview: () => "df -h /", result: "41% used" },
    ],
    reply: () => "Server report 🛠️\n\n| Container | State | IP |\n|---|---|---|\n| proxy | up | 172.18.0.2 |\n| database | up | 172.18.0.3 |\n| media | up | 172.18.0.4 |\n\n```bash\ndocker ps --format '{{.Names}}'\n```\n\nNothing needs you. I'll shout if anything goes red.",
  };
  const market: MockFlavor = { ageMin: 26 * 60,
    sessions: session("chat-nova", [
      { role: "user", content: "Quick market mood?" },
      { role: "assistant", content: "Cautiously optimistic 📈 the S&P 500 is up **0.4%**, tech is leading, and none of your watchlist moved more than 2%." },
    ]),
    tools: [
      { tool: "portfolio-get_watchlist", preview: () => "watchlist", result: "12 tickers" },
      { tool: "web_search", preview: () => "S&P 500 today", result: "6 results" },
    ],
    reply: () => "Here's today's brief 📈\n\n| Index | Change |\n|---|---|\n| S&P 500 | +0.42% |\n| Dow Jones | -0.15% |\n| Nasdaq 100 | +1.10% |\n\n```text\nTop mover on your watchlist: ACME +1.8%\n```\n\n*Demo data, not real prices.*",
  };
  return [
    { bot: bot("atlas", "Atlas", "🧭", "#2a3f5c", "Your main agent. Plans your day, keeps notes", "Warm, concise chief of staff.", "hermes-4-405b", { shape: "squircle", color: "#8c7bff", color2: "#1d2b4f" }),
      client: new MockHermesClient(hermes), memory: { memory: "- Prefers 24-hour times\n- Weekday briefs at 7:53 AM\n- Keeps tasks in one inbox", user: "Name: Alex\nPhone: Android\nHome server: a small Linux box" },
      jobs: [{ id: "j1", name: "Morning brief", schedule: "53 7 * * 1-5", prompt: "Summarise my calendar, tasks and inbox", paused: false, nextRun: "Mon 7:53 AM" }],
      mcp: [{ name: "tools-hub", url: "http://mcp.example.lan/mcp", enabled: true, hasAuth: true, tools: 55 }],
      toolsets: ts(["web", "terminal", "browser", "file", "memory", "cronjob"]), plugins: plugins(["hindsight", "kanban"], ["hindsight", "kanban"]) },
    { bot: bot("forge", "Forge", "🛠️", "#1f5a42", "Keeps the home server healthy. Loves uptime", "Terse SRE. Asks before anything destructive.", "glm-5.3", { shape: "hexagon", eyes: "wide" }),
      client: new MockHermesClient(piOps), memory: { memory: "- server runs Docker\n- Tailscale Funnel serves <your-host>.ts.net", user: "Owner: Alex" },
      jobs: [{ id: "j2", name: "Nightly health check", schedule: "0 2 * * *", prompt: "Check containers, disk and certs", paused: false, nextRun: "Tonight 2:00 AM" },
        { id: "j3", name: "Weekly log cleanup", schedule: "0 4 * * 0", prompt: "Delete logs older than 30 days", paused: true }],
      mcp: [{ name: "docker", url: "http://127.0.0.1:8811/mcp", enabled: true, hasAuth: true, tools: 12 }],
      toolsets: ts(["terminal", "file", "cronjob"]), plugins: plugins(["camofox-browser"], []) },
    { bot: bot("nova", "Nova", "📈", "#ffd66b", "Watches the markets and your watchlist", "Calm, numbers-first. Never gives buy/sell advice.", "deepseek-flash", { shape: "flower" }),
      client: new MockHermesClient(market), memory: { memory: "- Tracks a 12-ticker watchlist\n- Prefers tables", user: "Investor: long-term" },
      jobs: [{ id: "j4", name: "Market close recap", schedule: "15 16 * * 1-5", prompt: "Recap the market close and my watchlist", paused: false, nextRun: "Mon 4:15 PM" }],
      mcp: [{ name: "portfolio", url: "http://mcp.example.lan/mcp/portfolio", enabled: true, hasAuth: true, tools: 22 },
        { name: "budget", url: "http://mcp.example.lan/mcp/budget", enabled: false, hasAuth: true, tools: 33 }],
      toolsets: ts(["web", "memory", "cronjob"]), plugins: plugins(["weather"], ["weather"]) },
  ];
}

export class DemoBackend implements Backend {
  kind = "demo" as const;
  private data = seed();
  private seq = 10;
  supports() { return true; }
  private get(b: Bot) { const d = this.data.find((x) => x.bot.id === b.id); if (!d) throw new Error("Unknown bot"); return d; }

  async listBots() { return this.data.map((d) => d.bot); }
  async createBot(n: NewBot) {
    await sleep(700);
    const id = n.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `bot-${this.seq++}`;
    const b: Bot = { id, profile: id, name: n.name, emoji: n.emoji, color: n.color, color2: n.color2, shape: n.shape, eyes: n.eyes, description: n.description, persona: n.persona, model: n.model, provider: n.provider };
    const hello = `Hi, I'm **${n.name}** ${n.emoji}\n\n${n.description || "Fresh out of the oven."} ${n.persona ? `\n\n> ${n.persona}` : ""}\n\nWhat should we do first?`;
    this.data.push({ bot: b, client: new MockHermesClient({ sessions: session(`chat-${id}`, [{ role: "assistant", content: hello }]) }),
      jobs: [], memory: { memory: "", user: "Name: Alex" }, mcp: [], toolsets: ts(n.toolsets), plugins: plugins([], []) });
    return b;
  }
  async addExistingBot(b: Bot) { return this.createBot({ ...b, toolsets: ["web", "memory"] }); }
  async getPersona(b: Bot) { return this.get(b).bot.persona ?? ""; }
  async setPersona(b: Bot, text: string) { this.get(b).bot = { ...this.get(b).bot, persona: text }; }
  async updateBot(b: Bot) { this.get(b).bot = b; return b; }
  async removeBot(id: string) { this.data = this.data.filter((d) => d.bot.id !== id || id === "atlas"); }
  chat(b: Bot): ChatClient { return this.get(b).client; }
  async botChatSession(b: Bot) { return `chat-${b.id}`; }
  async listSessions(b: Bot) {
    return [{ id: await this.botChatSession(b), title: BOT_CHAT_TITLE, updated: "now" },
      { id: `${b.id}-cron-1`, title: "Routine run · yesterday", updated: "yesterday" }, { id: `${b.id}-old`, title: "Older thread", updated: "last week" }];
  }
  async listModels() {
    return [["hermes-4-405b", "nous"], ["glm-5.3", "zai"], ["deepseek-flash", "deepseek"], ["claude-sonnet-5", "anthropic"]].map(([id, provider]) => ({ id, provider, label: `${id} · ${provider}` }));
  }
  private skillOff = new Set<string>();
  async listSkills() { return SKILLS.map((s) => ({ ...s, enabled: !this.skillOff.has(s.name) })); }
  async setSkill(_: Bot, name: string, enabled: boolean) { if (enabled) this.skillOff.delete(name); else this.skillOff.add(name); }
  async listToolsets(b: Bot) { return this.get(b).toolsets; }
  async setToolset(b: Bot, name: string, enabled: boolean) { const t = this.get(b).toolsets.find((x) => x.name === name); if (t) t.enabled = enabled; }
  async listJobs(b: Bot) { return this.get(b).jobs; }
  async createJob(b: Bot, j: { name: string; schedule: string; prompt: string }) {
    const job: Job = { id: `j${this.seq++}`, ...j, paused: false, nextRun: "soon" }; this.get(b).jobs.push(job); return job;
  }
  async setJobPaused(b: Bot, id: string, paused: boolean) { const j = this.get(b).jobs.find((x) => x.id === id); if (j) j.paused = paused; }
  async runJob(b: Bot, id: string) { const j = this.get(b).jobs.find((x) => x.id === id); if (j) j.lastRun = "just now"; await sleep(400); }
  async updateJob(b: Bot, id: string, j: { name: string; schedule: string; prompt: string }) { const d = this.get(b); d.jobs = d.jobs.map((x) => (x.id === id ? { ...x, ...j } : x)); }
  async deleteJob(b: Bot, id: string) { const d = this.get(b); d.jobs = d.jobs.filter((x) => x.id !== id); }
  async getMemory(b: Bot) { return this.get(b).memory; }
  async setMemory(b: Bot, m: Memory) { this.get(b).memory = m; }
  async listMcp(b: Bot) { return this.get(b).mcp; }
  async addMcp(b: Bot, m: { name: string; url: string; authHeader?: string }) {
    await sleep(600); this.get(b).mcp.push({ name: m.name, url: m.url, enabled: true, hasAuth: Boolean(m.authHeader), tools: 3 + (m.name.length % 9) });
  }
  async setMcpEnabled(b: Bot, name: string, enabled: boolean) { const s = this.get(b).mcp.find((x) => x.name === name); if (s) s.enabled = enabled; }
  async removeMcp(b: Bot, name: string) { const d = this.get(b); d.mcp = d.mcp.filter((x) => x.name !== name); }
  async listPlugins(b: Bot) { return this.get(b).plugins.filter((p) => p.installed); }
  async listPluginCatalog(b: Bot): Promise<PluginCatalog> {
    await sleep(300);
    const mine = this.get(b).plugins;
    return { installSupported: true, entries: PLUGIN_CATALOG.map((p) => ({ name: p.name, title: p.name.replace(/(^|-)(\w)/g, (_, d, c) => `${d ? " " : ""}${c.toUpperCase()}`),
      description: p.description, maintainer: "community", tier: p.name === "hindsight" || p.name === "weather" ? "official" : "community", category: p.kind, version: p.version,
      installed: Boolean(mine.find((x) => x.name === p.name)?.installed), updateAvailable: p.name === "kanban", requiresEnv: p.name === "weather" ? ["OPENWEATHER_API_KEY"] : [], tools: p.tools })) };
  }
  async listMcpCatalog(b: Bot): Promise<McpCatalogEntry[]> {
    await sleep(300);
    const have = new Set(this.get(b).mcp.map((m) => m.name));
    return MCP_CATALOG.map((e) => ({ ...e, installed: have.has(e.name), enabled: have.has(e.name) }));
  }
  async installMcpCatalog(b: Bot, name: string, env: Record<string, string>) {
    await sleep(700);
    const e = MCP_CATALOG.find((x) => x.name === name);
    if (!e) throw new Error(`No catalog entry '${name}'`);
    const missing = e.requiredEnv.filter((v) => v.required && !env[v.name]?.trim()).map((v) => v.name);
    if (missing.length) throw new Error(`Fill in ${missing.join(", ")}`);
    this.get(b).mcp.push({ name, url: e.url ?? e.command ?? "", enabled: true, hasAuth: e.requiredEnv.length > 0, tools: 4 + (name.length % 7) });
  }
  async installPlugin(b: Bot, name: string) { await sleep(700); const p = this.get(b).plugins.find((x) => x.name === name); if (p) { p.installed = true; p.enabled = true; } }
  async setPluginEnabled(b: Bot, name: string, enabled: boolean) { const p = this.get(b).plugins.find((x) => x.name === name); if (p) p.enabled = enabled; }
}
