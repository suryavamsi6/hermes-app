// Slash commands typed in the chat composer. Pure (RN-free) so parsing, the catalog, routing and the
// picker's filtering are unit-tested.
//
// Hermes's API server (/v1/runs, the chat sessions) has no command handling: a message that starts
// with "/" reaches the model as plain text. So every command Telegram accepts (Hermes's gateway command
// registry, hermes_cli/commands.py) is routed one of three ways:
//   - "app":    the app does it itself with the API it already uses (/stop, /retry, /model, /new, ...);
//   - "hermes": Hermes's own handler runs it (the one Telegram uses), through hermes-bridge 0.4+, which
//               reaches the gateway that owns the chat (POST /v1/profiles/<p>/commands/run). A few have
//               an app fallback when the bridge can't (an older bridge, or none);
//   - "no":     can't work from a phone (each says why). Typed, they're explained, never sent.
// Skills run as the same "the user invoked this skill" turn Hermes builds. "//text" sends "/text".

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

export type Screen = "settings" | "mcp" | "plugins" | "memory" | "routines" | "topics" | "activity" | "call" | "skills";
export type SlashAction =
  | { type: "help" }
  | { type: "status" }
  | { type: "stop" }
  | { type: "retry" }
  | { type: "steer"; text: string }
  | { type: "approve"; choice: "once" | "session" | "always" | "deny" }
  | { type: "model"; query: string }
  | { type: "open"; screen: Screen }
  | { type: "new" }
  | { type: "restart" }
  | { type: "rename"; title: string }
  | { type: "search" }
  | { type: "export" }
  | { type: "skill"; name: string; slug: string; arg: string }
  /** Run by Hermes's own handler. `command` is what's sent ("/title Trip"); `fallback` is what the app
   *  does when the bridge can't run commands; `profileWide` commands may run in the profile's Bot Chat
   *  when this chat isn't one the gateway owns (their answer doesn't depend on the chat). */
  | { type: "hermes"; name: string; command: string; fallback?: SlashAction; profileWide: boolean }
  | { type: "unsupported"; name: string; why: string }
  | { type: "missing"; name: string; why: string }
  | { type: "unknown"; name: string };

type Def = SlashCommand & {
  /** Telegram accepts it (Hermes's gateway command registry). */
  telegram?: boolean;
  app?: (arg: string) => SlashAction;
  hermes?: { fallback?: (arg: string) => SlashAction | undefined; profileWide?: boolean };
  no?: string;
};
const open = (screen: Screen) => () => ({ type: "open", screen }) as const;
const H = (profileWide = false, fallback?: (arg: string) => SlashAction | undefined) => ({ profileWide, fallback });
const WHERE = "Hermes runs it only from its CLI or a messaging chat (it refuses it for other apps)";

/** Every command, in picker order: what you use most, then the rest of Telegram's list, then app extras. */
const DEFS: Def[] = [
  // Session
  { name: "new", description: "Start a fresh chat with this bot", kind: "app", telegram: true, aliases: ["reset", "clear"], app: () => ({ type: "new" }) },
  { name: "stop", description: "Stop the reply that's being written", kind: "app", telegram: true, aliases: ["cancel"], app: () => ({ type: "stop" }) },
  { name: "retry", description: "Run the last message again", kind: "app", telegram: true, app: () => ({ type: "retry" }) },
  { name: "status", description: "Session, model, tokens and context (Hermes)", kind: "hermes", telegram: true, hermes: H(false, () => ({ type: "status" })) },
  { name: "model", description: "Switch this bot's model", kind: "app", telegram: true, args: "[name]", optional: true, app: (a) => ({ type: "model", query: a }) },
  { name: "help", description: "Hermes's command help", kind: "hermes", telegram: true, args: "[skills|filter]", optional: true, hermes: H(true, () => ({ type: "help" })) },
  { name: "commands", description: "Browse all of Hermes's commands and skills", kind: "hermes", telegram: true, args: "[page]", optional: true, hermes: H(true, () => ({ type: "help" })) },
  { name: "steer", description: "Add guidance to the running reply", kind: "app", telegram: true, aliases: ["s"], args: "<text>",
    app: (a) => (a ? { type: "steer", text: a } : { type: "missing", name: "steer", why: "Type what to add, like /steer keep it short." }) },
  { name: "approve", description: "Allow the waiting action", kind: "app", telegram: true, args: "[session|always]", optional: true,
    app: (a) => ({ type: "approve", choice: /^s/i.test(a) ? "session" : /^a/i.test(a) ? "always" : "once" }) },
  { name: "deny", description: "Don't run the waiting action", kind: "app", telegram: true, args: "[reason]", optional: true, app: () => ({ type: "approve", choice: "deny" }) },
  { name: "title", description: "Show or set this chat's title", kind: "hermes", telegram: true, args: "[name]", optional: true,
    hermes: H(false, (a) => (a ? { type: "rename", title: a } : undefined)) },
  { name: "sessions", description: "Topics and past sessions", kind: "app", telegram: true, app: open("topics") },
  { name: "resume", description: "Go back to an earlier session", kind: "app", telegram: true, args: "[name]", optional: true, app: open("topics") },
  { name: "topic", description: "Topics and sessions (Telegram's topic sessions, phone-style)", kind: "app", telegram: true, app: open("topics") },
  { name: "save", description: "Export this chat (shares it as Markdown)", kind: "app", telegram: true, args: "[format]", optional: true, app: () => ({ type: "export" }) },
  { name: "context", description: "Context window use, by category", kind: "hermes", telegram: true, aliases: ["ctx"], args: "[all]", optional: true, hermes: H() },
  { name: "usage", description: "Token use and rate limits for this chat", kind: "hermes", telegram: true, args: "[reset]", optional: true, hermes: H(false, open("activity")) },
  { name: "insights", description: "Usage insights and analytics", kind: "hermes", telegram: true, args: "[days]", optional: true, hermes: H(true, open("activity")) },
  // Agent work
  { name: "plan", description: "Write an implementation plan without doing anything", kind: "hermes", telegram: true, args: "[task]", optional: true, hermes: H(true) },
  { name: "goal", description: "A standing goal Hermes works on across turns", kind: "hermes", telegram: true, args: "[text|show|pause|resume|clear]", optional: true, hermes: H() },
  { name: "subgoal", description: "Extra criteria on the active goal", kind: "hermes", telegram: true, args: "[text|remove N|clear]", optional: true, hermes: H() },
  { name: "loop", description: "Re-run a prompt on an interval in this chat", kind: "hermes", telegram: true, aliases: ["proactive"], args: "[interval] <prompt>", optional: true, hermes: H() },
  { name: "heartbeat", description: "A recurring prompt that runs when the chat is idle", kind: "hermes", telegram: true, aliases: ["hb"], args: "[every <interval> <prompt>]", optional: true, hermes: H() },
  { name: "review", description: "Have a subagent review the work just discussed", kind: "hermes", telegram: true, args: "[instructions]", optional: true, hermes: H() },
  { name: "refine", description: "Save lessons from this chat to memory and skills", kind: "hermes", telegram: true, args: "[focus]", optional: true, hermes: H() },
  { name: "moa", description: "Run one prompt through Mixture of Agents", kind: "hermes", telegram: true, args: "<prompt>", hermes: H() },
  { name: "learn", description: "Learn a reusable skill from what you describe", kind: "hermes", telegram: true, args: "<what>", optional: true, hermes: H(true) },
  { name: "init", description: "Generate or update AGENTS.md from a repo scan", kind: "hermes", telegram: true, args: "[notes]", optional: true, hermes: H(true) },
  { name: "blueprint", description: "Set up an automation from a template", kind: "hermes", telegram: true, aliases: ["bp"], args: "[name]", optional: true, hermes: H(true) },
  { name: "suggestions", description: "Suggested automations to accept or dismiss", kind: "hermes", telegram: true, aliases: ["suggest"], args: "[accept|dismiss N]", optional: true, hermes: H(true) },
  { name: "kanban", description: "The multi-profile task board", kind: "hermes", telegram: true, args: "[subcommand]", optional: true, hermes: H(true) },
  { name: "curator", description: "Background skill maintenance", kind: "hermes", telegram: true, args: "[subcommand]", optional: true, hermes: H(true) },
  // Settings
  { name: "yolo", description: "Toggle YOLO mode (skip approvals for this chat)", kind: "hermes", telegram: true, hermes: H() },
  { name: "approvals", description: "Show or set the approval mode", kind: "hermes", telegram: true, args: "[manual|smart|off]", optional: true, hermes: H(true) },
  { name: "reasoning", description: "Reasoning effort and display", kind: "hermes", telegram: true, args: "[level|show|hide]", optional: true, hermes: H() },
  { name: "fast", description: "Fast mode (priority processing)", kind: "hermes", telegram: true, args: "[normal|fast|auto|status]", optional: true, hermes: H() },
  { name: "personality", description: "List or set a predefined personality", kind: "hermes", telegram: true, args: "[name]", optional: true, hermes: H() },
  { name: "verbose", description: "Cycle how much tool progress is shown", kind: "hermes", telegram: true, hermes: H(true) },
  { name: "footer", description: "Toggle the runtime footer on replies", kind: "hermes", telegram: true, args: "[on|off|status]", optional: true, hermes: H(true) },
  { name: "busy", description: "What messages do while Hermes is working", kind: "hermes", telegram: true, args: "[queue|steer|interrupt]", optional: true, hermes: H(true) },
  { name: "voice", description: "Hermes's voice reply mode", kind: "hermes", telegram: true, args: "[on|off|status]", optional: true, hermes: H() },
  { name: "codex-runtime", description: "Codex app-server runtime for OpenAI models", kind: "hermes", telegram: true, aliases: ["codex_runtime"], args: "[auto|codex_app_server]", optional: true, hermes: H(true) },
  { name: "autoprune", description: "Automatic pruning of old sessions", kind: "hermes", telegram: true, args: "[on|off|later|status]", optional: true, hermes: H(true) },
  // Skills, memory, info
  { name: "skills", description: "Review staged skill writes", kind: "hermes", telegram: true, args: "[pending|approval]", optional: true, hermes: H(true, open("skills")) },
  { name: "memory", description: "Review pending memory writes", kind: "hermes", telegram: true, args: "[pending|approve|reject]", optional: true, hermes: H(true, open("memory")) },
  { name: "bundles", description: "List skill bundles", kind: "hermes", telegram: true, hermes: H(true) },
  { name: "whoami", description: "Your command access in Hermes", kind: "hermes", telegram: true, hermes: H(true) },
  { name: "profile", description: "The active Hermes profile and its home", kind: "hermes", telegram: true, hermes: H(true) },
  { name: "version", description: "Hermes Agent's version", kind: "hermes", telegram: true, aliases: ["v"], hermes: H(true) },
  { name: "diff", description: "Git changes in Hermes's working directory", kind: "hermes", telegram: true, args: "[staged|all|session]", optional: true, hermes: H(true) },
  { name: "egress", description: "Docker egress proxy status", kind: "hermes", telegram: true, args: "[status]", optional: true, hermes: H(true) },
  { name: "login", description: "Sign in with a Nous account", kind: "hermes", telegram: true, hermes: H(true) },
  { name: "topup", description: "Your Nous balance and billing", kind: "hermes", telegram: true, hermes: H(true) },
  { name: "debug", description: "Upload a debug report (asks first)", kind: "hermes", telegram: true, args: "[nous|local]", optional: true, hermes: H(true) },
  { name: "reload-mcp", description: "MCP servers (Hermes reloads them when they change)", kind: "app", telegram: true, aliases: ["reload_mcp"], app: open("mcp") },
  { name: "restart", description: "Restart Hermes's gateway (asks first)", kind: "app", telegram: true, app: () => ({ type: "restart" }) },
  // Telegram commands that can't work from the phone
  { name: "compress", description: "Compress the conversation (not from the app)", kind: "hermes", telegram: true, aliases: ["compact"],
    no: `${WHERE}. It also compresses long chats by itself when the context fills up.` },
  { name: "undo", description: "Back up turns (not from the app)", kind: "hermes", telegram: true, no: `${WHERE}. Use /retry, or start over with /new.` },
  { name: "branch", description: "Branch this chat (not from the app)", kind: "hermes", telegram: true, aliases: ["fork"], no: `${WHERE}: it opens a new thread in a messaging app. Use /new for a fresh chat.` },
  { name: "queue", description: "Queue a prompt for the next turn (not from the app)", kind: "hermes", telegram: true, aliases: ["q"], no: `${WHERE}. Send it after this reply finishes, or /steer the running one.` },
  { name: "bg", description: "Run a prompt in the background (not from the app)", kind: "hermes", telegram: true,
    no: "Hermes answers it later as a separate event, which the app can't receive yet. Send it as a normal message instead." },
  { name: "btw", description: "Ask a side question (not from the app)", kind: "hermes", telegram: true,
    no: "Hermes answers it later as a separate event, which the app can't receive yet. Send it as a normal message instead." },
  { name: "agents", description: "Active agents and tasks (not from the app)", kind: "hermes", telegram: true, aliases: ["tasks"], no: `${WHERE}.` },
  { name: "rollback", description: "Restore file checkpoints (not from the app)", kind: "hermes", telegram: true, no: `${WHERE}: it restores files on the server.` },
  { name: "pause", description: "Pause all of Hermes's work (not from the app)", kind: "hermes", telegram: true, no: `${WHERE}.` },
  { name: "discard", description: "Drop a turn lost in a restart (not from the app)", kind: "hermes", telegram: true, no: `${WHERE}: it's for a messaging chat's stuck queue.` },
  { name: "reload-skills", description: "Re-scan installed skills (not from the app)", kind: "hermes", telegram: true, aliases: ["reload_skills"], no: `${WHERE}.` },
  { name: "platform", description: "Pause or resume a messaging platform (not from the app)", kind: "hermes", telegram: true, no: `${WHERE}.` },
  { name: "update", description: "Update Hermes on the server (not from the app)", kind: "hermes", telegram: true, no: `${WHERE}. Run hermes update on the server.` },
  { name: "sethome", description: "Make a messaging chat the home channel (not from the app)", kind: "hermes", telegram: true, aliases: ["set-home"],
    no: "It marks a messaging chat as the home channel for deliveries. The app isn't a messaging channel; its routines deliver to the Bot Chat." },
  { name: "start", description: "Telegram's start ping (nothing to do here)", kind: "hermes", telegram: true, no: "Telegram sends /start when you first open a bot. The app doesn't need it." },
  // App extras (not Telegram commands)
  { name: "search", description: "Search this chat", kind: "app", aliases: ["find"], app: () => ({ type: "search" }) },
  { name: "export", description: "Share this chat as Markdown", kind: "app", app: () => ({ type: "export" }) },
  { name: "topics", description: "Topics and past sessions", kind: "app", aliases: ["history"], app: open("topics") },
  { name: "tools", description: "Skills and tools for this bot", kind: "app", aliases: ["toolsets"], app: open("skills") },
  { name: "mcp", description: "Connected MCP servers", kind: "app", app: open("mcp") },
  { name: "plugins", description: "Plugins for this bot", kind: "app", app: open("plugins") },
  { name: "routines", description: "Scheduled routines (cron jobs)", kind: "app", aliases: ["cron", "jobs"], app: open("routines") },
  { name: "activity", description: "What this bot did recently", kind: "app", app: open("activity") },
  { name: "settings", description: "This bot's name, face and persona", kind: "app", app: open("settings") },
  { name: "call", description: "Talk to this bot by voice", kind: "app", app: open("call") },
];

/** The commands Telegram accepts (Hermes's gateway registry), by name. */
export const TELEGRAM = DEFS.filter((d) => d.telegram).map((d) => d.name);
/** Telegram commands that can't run from the app, with why. */
export const UNSUPPORTED: Record<string, string> = Object.fromEntries(DEFS.filter((d) => d.no).map((d) => [d.name, d.no!]));
/** How each Telegram command runs here: "app", "hermes" (Hermes's handler via the bridge) or "no". */
export const routeOf = (name: string): "app" | "hermes" | "no" | undefined => {
  const d = find(name);
  return !d ? undefined : d.no ? "no" : d.app ? "app" : "hermes";
};
const find = (name: string) => DEFS.find((c) => c.name === name || c.aliases?.includes(name));

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

/** Extra commands Hermes knows for this bot (hermes-bridge's GET /commands): your quick_commands and
 *  plugin commands. Run by Hermes like the built-ins. */
export type ServerCommand = { name: string; description?: string };

/** Everything the picker can offer for a bot: every command (Telegram's list plus app extras), then
 *  the server's own commands, then its enabled skills. A built-in wins a name clash, like in Hermes. */
export function catalog(skills: { name: string; description?: string; enabled?: boolean }[] = [], server: ServerCommand[] = []): SlashCommand[] {
  const out: SlashCommand[] = DEFS.map(({ app: _a, hermes: _h, no: _n, telegram: _t, ...c }) => c);
  const taken = new Set(out.flatMap((c) => [c.name, ...(c.aliases ?? [])]));
  for (const s of server) {
    const name = s.name.replace(/^\//, "").toLowerCase();
    if (!NAME.test(name) || taken.has(name)) continue;
    taken.add(name);
    out.push({ name, description: oneLine(s.description) || "A command from your Hermes server", kind: "hermes", args: "[args]", optional: true });
  }
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
 *  contains. Empty query: everything, in catalog order (the picker scrolls). */
export function filterCommands(cat: SlashCommand[], query: string, limit = 500): SlashCommand[] {
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

/** What a typed command does. `skills` are the bot's skills (for /<skill>); `server` its server commands. */
export function resolveSlash(text: string, skills: { name: string; enabled?: boolean }[] = [], server: ServerCommand[] = []): SlashAction | null {
  const p = parseSlash(text);
  if (!p) return null;
  const d = find(p.name);
  if (d?.no) return { type: "unsupported", name: d.name, why: d.no };
  if (d?.app) return d.app(p.arg);
  const command = `/${d?.name ?? p.name}${p.arg ? ` ${p.arg}` : ""}`;
  if (d?.hermes) {
    const fallback = d.hermes.fallback?.(p.arg);
    return { type: "hermes", name: d.name, command, profileWide: !!d.hermes.profileWide, ...(fallback ? { fallback } : {}) };
  }
  const skill = skills.find((s) => s.enabled !== false && skillSlug(s.name) === p.name);
  if (skill) return { type: "skill", name: skill.name, slug: p.name, arg: p.arg };
  if (server.some((s) => s.name.replace(/^\//, "").toLowerCase() === p.name)) return { type: "hermes", name: p.name, command, profileWide: false };
  return { type: "unknown", name: p.name };
}

const SKILL_HEAD = (name: string) =>
  `[IMPORTANT: The user has invoked the "${name}" skill, indicating they want you to follow its instructions.`;
/** The turn sent for /<skill>: Hermes's own wording for a skill command, asking the bot to load the
 *  skill with skill_view (the API server doesn't load it for us). */
export function skillMessage(name: string, arg: string): string {
  return `${SKILL_HEAD(name)} Load it with skill_view(name="${name}") and follow it.]${arg ? `\n\nUser instruction: ${arg}` : ""}`;
}
/** How a skill or command turn shows in the chat: "/slug arg" instead of the scaffold. Also matches
 *  the turns Hermes builds for skill commands and for prompt commands like /plan ("[/plan — plan mode]"). */
export function skillDisplay(text: string): string | null {
  const m = /^\[IMPORTANT: The user has invoked the "([^"]+)" skill[^\]]*\]/.exec(text);
  if (!m) {
    const c = /^\[\/([a-z0-9][a-z0-9_-]*)(?:\s[^\]\n]*)?\]/.exec(text);
    return c ? `/${c[1]}` : null;
  }
  const ins = /\n\s*User instruction:\s*([\s\S]*)$/.exec(text);
  return `/${skillSlug(m[1])}${ins ? ` ${ins[1].trim()}` : ""}`;
}

/** Why a command that Hermes runs didn't run, as shown to you. */
export type CommandFailure =
  | { kind: "no_bridge" }        // no hermes-bridge key in Settings
  | { kind: "old_bridge" }       // a bridge from before /commands (0.4)
  | { kind: "unavailable"; message: string }  // the bridge can't reach Hermes's gateway
  | { kind: "not_owned" }        // this chat is a phone session the gateway doesn't run commands for
  | { kind: "refused"; message: string };     // Hermes said no (its own message)

export function failureNote(name: string, f: CommandFailure): string {
  switch (f.kind) {
    case "no_bridge": return `/${name} runs with Hermes's own handler, through hermes-bridge. Add the bridge in Settings to use it here.`;
    case "old_bridge": return `/${name} needs hermes-bridge 0.4 or newer on your server (it runs Hermes's own command handler). Update the bridge, then try again.`;
    case "unavailable": return `Couldn't run /${name}: ${f.message}`;
    case "not_owned": return `/${name} runs in the bot's Bot Chat, and this chat is a separate phone session. Open the Bot Chat from Topics & sessions to use it.`;
    case "refused": return `/${name}: ${f.message}`;
  }
}

/** The note shown for a command that can't run from the app. */
export function explain(a: Extract<SlashAction, { type: "unsupported" | "unknown" | "missing" }>): string {
  if (a.type === "missing") return a.why;
  if (a.type === "unsupported") return `/${a.name} doesn't work from the app. ${a.why} It wasn't sent; start with // to send it as text.`;
  return `There's no /${a.name} command here. Type / to see what you can use, or start with // to send it as text.`;
}
