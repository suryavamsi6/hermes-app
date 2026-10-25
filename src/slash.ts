// Slash commands typed in the chat composer. Pure (RN-free) so parsing, the catalog and the picker's
// filtering are unit-tested.
//
// Why the app handles them itself: Hermes's API server (/v1/runs, the chat sessions) has no command
// handling. A message that starts with "/" goes to the model as plain text, so "/status" got a chatty
// guess instead of a status. Hermes runs commands only inside its own chat surfaces (CLI, dashboard
// websocket, messaging gateways). So the app:
//   - runs app commands itself (/stop, /retry, /model, /approve, /mcp, /help, ...),
//   - turns /<skill> into the same "the user invoked this skill" turn Hermes builds, so the bot loads
//     the skill with its skill_view tool and follows it,
//   - never sends a Hermes-only command (/compress, /yolo, ...) as text; it says where it runs instead.
// "//text" sends "/text" literally.

export type SlashKind = "app" | "skill" | "hermes";
export type SlashCommand = {
  name: string;
  description: string;
  kind: SlashKind;
  /** Argument hint ("<text>"); a command with args is inserted for you to finish, not run on tap. */
  args?: string;
  /** Args optional: tapping runs it bare, typing more passes them. */
  optional?: boolean;
  aliases?: string[];
};

export type SlashAction =
  | { type: "help" }
  | { type: "status" }
  | { type: "stop" }
  | { type: "retry" }
  | { type: "steer"; text: string }
  | { type: "approve"; choice: "once" | "session" | "always" | "deny" }
  | { type: "model"; query: string }
  | { type: "open"; screen: "settings" | "mcp" | "plugins" | "memory" | "routines" | "topics" | "activity" | "call" | "skills" }
  | { type: "search" }
  | { type: "export" }
  | { type: "skill"; name: string; slug: string; arg: string }
  | { type: "hermes"; name: string }
  | { type: "missing"; name: string; why: string }
  | { type: "unknown"; name: string };

const APP: (SlashCommand & { action: (arg: string) => SlashAction })[] = [
  { name: "help", description: "Show the commands you can use here", kind: "app", aliases: ["commands"], action: () => ({ type: "help" }) },
  { name: "status", description: "This bot's model, profile and connection", kind: "app", action: () => ({ type: "status" }) },
  { name: "stop", description: "Stop the reply that's being written", kind: "app", aliases: ["cancel"], action: () => ({ type: "stop" }) },
  { name: "retry", description: "Run the last message again", kind: "app", action: () => ({ type: "retry" }) },
  { name: "steer", description: "Add guidance to the running reply", kind: "app", args: "<text>", action: (a) => (a ? { type: "steer", text: a } : { type: "missing", name: "steer", why: "Type what to add, like /steer keep it short." }) },
  { name: "approve", description: "Allow the waiting action once", kind: "app", args: "[session|always]", optional: true,
    action: (a) => ({ type: "approve", choice: /^s/i.test(a) ? "session" : /^a/i.test(a) ? "always" : "once" }) },
  { name: "deny", description: "Don't run the waiting action", kind: "app", action: () => ({ type: "approve", choice: "deny" }) },
  { name: "model", description: "Switch this bot's model", kind: "app", args: "[name]", optional: true, action: (a) => ({ type: "model", query: a }) },
  { name: "search", description: "Search this chat", kind: "app", aliases: ["find"], action: () => ({ type: "search" }) },
  { name: "export", description: "Share this chat as Markdown", kind: "app", action: () => ({ type: "export" }) },
  { name: "skills", description: "Skills and tools for this bot", kind: "app", aliases: ["tools", "toolsets"], action: () => ({ type: "open", screen: "skills" }) },
  { name: "mcp", description: "Connected MCP servers", kind: "app", aliases: ["reload-mcp"], action: () => ({ type: "open", screen: "mcp" }) },
  { name: "plugins", description: "Plugins for this bot", kind: "app", action: () => ({ type: "open", screen: "plugins" }) },
  { name: "memory", description: "What this bot remembers", kind: "app", action: () => ({ type: "open", screen: "memory" }) },
  { name: "routines", description: "Scheduled routines (cron jobs)", kind: "app", aliases: ["cron", "jobs"], action: () => ({ type: "open", screen: "routines" }) },
  { name: "topics", description: "Topics and past sessions", kind: "app", aliases: ["new", "sessions", "history", "resume"], action: () => ({ type: "open", screen: "topics" }) },
  { name: "activity", description: "What this bot did recently", kind: "app", aliases: ["usage", "insights"], action: () => ({ type: "open", screen: "activity" }) },
  { name: "settings", description: "This bot's name, face and persona", kind: "app", aliases: ["personality", "profile"], action: () => ({ type: "open", screen: "settings" }) },
  { name: "call", description: "Talk to this bot by voice", kind: "app", aliases: ["voice"], action: () => ({ type: "open", screen: "call" }) },
];

/** Hermes commands that only run in its own chat surfaces. Typed here, they're explained, never sent. */
export const HERMES_ONLY: Record<string, string> = {
  compress: "Compress the conversation", compact: "Compress the conversation", reset: "Start a fresh session",
  clear: "Start a fresh session", undo: "Undo the last turn", reasoning: "Set reasoning effort", yolo: "Skip approvals",
  verbose: "Show tool details", fast: "Fast mode", goal: "Set a goal", loop: "Repeat a task", plan: "Plan before acting",
  learn: "Learn from this session", init: "Set up a project", moa: "Mixture of agents", debug: "Upload a debug report",
  snapshot: "Save or restore a snapshot", queue: "Queue a message", title: "Rename the session", footer: "Reply footer",
  busy: "Busy behaviour", approvals: "Approval mode", "codex-runtime": "Codex runtime", heartbeat: "Heartbeat",
  kanban: "Kanban board", review: "Review the session", refine: "Refine the last answer", curator: "Skill curator",
  version: "Hermes version", whoami: "Who you are to Hermes", context: "Context usage", diff: "Session diff",
};

const NAME = /^[a-z0-9][a-z0-9_.:-]*$/i;
/** The command in a composer text, or null for normal text ("//x" is an escape, "/ x" and paths aren't commands). */
export function parseSlash(text: string): { name: string; arg: string } | null {
  const m = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m || !NAME.test(m[1])) return null;
  return { name: m[1].toLowerCase(), arg: (m[2] ?? "").trim() };
}
/** "//text" sends "/text" as a normal message. */
export const unescapeSlash = (text: string) => (/^\/\//.test(text.trim()) ? text.trim().slice(1) : text);

export const skillSlug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Everything the picker can offer for a bot: app commands, then its enabled skills (an app command
 *  wins a name clash, like Hermes's built-ins do). */
export function catalog(skills: { name: string; description?: string; enabled?: boolean }[] = []): SlashCommand[] {
  const out: SlashCommand[] = APP.map(({ action, ...c }) => c);
  const taken = new Set(out.flatMap((c) => [c.name, ...(c.aliases ?? [])]));
  for (const s of skills) {
    if (s.enabled === false) continue;
    const slug = skillSlug(s.name);
    if (!slug || taken.has(slug)) continue;
    taken.add(slug);
    out.push({ name: slug, description: oneLine(s.description) || `Use the ${s.name} skill`, kind: "skill", args: "[what to do]", optional: true });
  }
  return out;
}
const oneLine = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 90);

/** Picker rows for what's typed after "/": name prefix, then alias prefix, then name/description
 *  contains. Empty query: app commands first, then skills. */
export function filterCommands(cat: SlashCommand[], query: string, limit = 8): SlashCommand[] {
  const q = query.toLowerCase().replace(/^\//, "");
  if (!q) return cat.slice(0, limit);
  const score = (c: SlashCommand) =>
    c.name.startsWith(q) ? 0 : c.aliases?.some((a) => a.startsWith(q)) ? 1 : c.name.includes(q) ? 2 : c.description.toLowerCase().includes(q) ? 3 : 9;
  return cat.map((c, i) => ({ c, s: score(c), i })).filter((x) => x.s < 9).sort((a, b) => a.s - b.s || a.i - b.i).slice(0, limit).map((x) => x.c);
}

/** The text after "/" while the picker should show: just "/" or "/partial" (no space yet). */
export function pickerQuery(text: string): string | null {
  const m = /^\/([a-z0-9_.:-]*)$/i.exec(text);
  return m ? m[1] : null;
}

/** What a typed command does. `skills` are the bot's skills (for /<skill>). */
export function resolveSlash(text: string, skills: { name: string; enabled?: boolean }[] = []): SlashAction | null {
  const p = parseSlash(text);
  if (!p) return null;
  const app = APP.find((c) => c.name === p.name || c.aliases?.includes(p.name));
  if (app) return app.action(p.arg);
  const skill = skills.find((s) => s.enabled !== false && skillSlug(s.name) === p.name);
  if (skill) return { type: "skill", name: skill.name, slug: p.name, arg: p.arg };
  if (p.name in HERMES_ONLY) return { type: "hermes", name: p.name };
  return { type: "unknown", name: p.name };
}

const SKILL_HEAD = (name: string) =>
  `[IMPORTANT: The user has invoked the "${name}" skill, indicating they want you to follow its instructions.`;
/** The turn sent for /<skill>: Hermes's own wording for a skill command, asking the bot to load the
 *  skill with skill_view (the API server doesn't load it for us). */
export function skillMessage(name: string, arg: string): string {
  return `${SKILL_HEAD(name)} Load it with skill_view(name="${name}") and follow it.]${arg ? `\n\nUser instruction: ${arg}` : ""}`;
}
/** How a skill turn shows in the chat: "/slug arg" instead of the scaffold. Also matches the turn
 *  Hermes builds when a skill command is run from Telegram or the CLI. */
export function skillDisplay(text: string): string | null {
  const m = /^\[IMPORTANT: The user has invoked the "([^"]+)" skill[^\]]*\]/.exec(text);
  if (!m) return null;
  const ins = /\n\s*User instruction:\s*([\s\S]*)$/.exec(text);
  return `/${skillSlug(m[1])}${ins ? ` ${ins[1].trim()}` : ""}`;
}

/** The note shown for a command that can't run from the app. */
export function explain(a: Extract<SlashAction, { type: "hermes" | "unknown" | "missing" }>): string {
  if (a.type === "missing") return a.why;
  if (a.type === "hermes") return `/${a.name} (${HERMES_ONLY[a.name].toLowerCase()}) runs only in Hermes's own chat (CLI, dashboard or a messaging app). The API server this app talks to doesn't take commands, so it wasn't sent. Start with // to send it as text.`;
  return `There's no /${a.name} command here. Type / to see what you can use, or start with // to send it as text.`;
}
