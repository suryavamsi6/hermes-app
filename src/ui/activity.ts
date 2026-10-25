// The live "what it's doing" line under a reply that's still being worked on, like Grok Bot's
// "Checking GitHub for updates". Pure (RN-free) so it can be unit-tested. Built from the run's
// stream: tool.started (tool + preview) and reasoning.available (Hermes's thinking summary).
import type { AssistantTurn } from "../chat-model";

const clip = (s: string, n = 48) => { const one = s.replace(/\s+/g, " ").trim(); return one.length > n ? `${one.slice(0, n - 1)}…` : one; };
const base = (p: string) => p.replace(/^["'`]|["'`]$/g, "").split(/[\\/]/).filter(Boolean).pop() ?? p;
const words = (s: string) => s.replace(/[_-]+/g, " ").trim();

const domain = (s: string) => { const m = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i.exec(s.trim()); return m ? m[1].toLowerCase() : undefined; };

/** One running tool -> a short, honest present-tense phrase built from the tool and its arguments.
 *  Unknown tools get "Using <tool>". Never claims more than the tool is doing. */
export function toolPhrase(tool: string, preview?: string): string {
  const t = tool.toLowerCase(), p = preview?.trim() ? preview.trim() : undefined;
  const mcp = /^mcp[_:]+([a-z0-9-]+?)[_:]+(.+)$/.exec(t);
  if (mcp) return `Asking ${words(mcp[1])}${p ? `: ${clip(p, 36)}` : ""}`;
  if (/web_?search|search_web|google|bing/.test(t)) return p ? `Searching the web for ${clip(p, 34)}` : "Searching the web";
  if (/web_?extract|fetch|browse|browser|crawl|scrape|url/.test(t)) { const d = p && domain(p); return d ? `Reading ${d}` : p ? `Reading ${clip(p, 40)}` : "Reading a web page"; }
  if (/terminal|shell|bash|exec|command|process/.test(t)) return p ? `Running ${clip(p, 40)}` : "Running a command";
  if (/read_?file|view|cat\b|open_?file/.test(t)) return p ? `Reading ${clip(base(p), 40)}` : "Reading a file";
  if (/write_?file|create_?file|^write/.test(t)) return p ? `Writing ${clip(base(p), 40)}` : "Writing a file";
  if (/patch|edit|replace/.test(t)) return p ? `Editing ${clip(base(p), 40)}` : "Editing files";
  if (/search_?files|grep|find|glob|list_?dir|ls\b/.test(t)) return p ? `Looking through files for ${clip(p, 30)}` : "Looking through files";
  if (/session_?search|recall/.test(t)) return "Looking back through past chats";
  if (/memory|remember/.test(t)) return p && /\b(add|save|replace|remove|update|forget)\b/i.test(p) ? "Updating memory" : "Checking memory";
  if (/skill/.test(t)) return p ? `Using the ${clip(p, 30)} skill` : "Using a skill";
  if (/bot_?mode|ask_?bot|message_?bot|send_?message|bot_?dm/.test(t)) return p ? `Handing off to ${clip(p, 30)}` : "Handing off to another bot";
  if (/delegate|subagent|spawn/.test(t)) return "Handing part of this to a helper";
  if (/todo|plan/.test(t)) return "Planning the next steps";
  if (/vision|image|screenshot/.test(t)) return "Looking at an image";
  if (/cron|schedule|routine/.test(t)) return "Setting up a routine";
  if (/code|python|execute/.test(t)) return "Running code";
  return `Using ${words(tool)}`;
}

// While nothing concrete is happening (no running tool, no thinking summary yet), the line rotates
// calm, generic phrases like Grok Bot's. None of them names an action, so they can't claim something
// that isn't happening. "start": before any tool ran; "wrapup": tools finished, the answer is forming.
export type IdleKind = "start" | "wrapup";
export const IDLE_PHRASES: Record<IdleKind, readonly string[]> = {
  start: [
    "Thinking", "Mulling it over", "Chipping away", "Digging in", "Working on it", "Thinking it through",
    "Getting my bearings", "Turning it over", "Sorting it out", "Considering", "Weighing it up", "Figuring it out",
    "Gathering my thoughts", "Working through it", "Taking a look", "On it", "Pondering", "Untangling it",
    "Piecing it together", "Making sense of it", "Getting into it", "Puzzling it out", "Chewing on it",
    "Lining things up", "Sketching an approach", "Following a hunch", "Settling on a plan", "Finding the angle",
    "One moment", "Almost there in my head", "Going step by step", "Thinking carefully",
  ],
  wrapup: [
    "Pulling it together", "Putting it together", "Tying it up", "Shaping the answer", "Wrapping up",
    "Finishing up", "Connecting the dots", "Bringing it together", "Drafting a reply", "Polishing it",
    "Rounding it off", "Summing it up", "Lining up the answer",
  ],
};
/** Extra phrases for a bot whose name, profile or description hints at its job. Mixed into the pool. */
const FLAVOURS: [RegExp, string[]][] = [
  [/financ|ledger|money|budget|account|expense|invest|tax|bank/i, ["Crunching numbers", "Tallying it up", "Running the numbers", "Balancing it out"]],
  [/code|dev|forge|build|engineer|ops|server|infra/i, ["Working through the logic", "Tracing it through", "Thinking in code"]],
  [/research|scout|search|news|analyst|study/i, ["Connecting the dots", "Weighing the sources", "Sifting through it"]],
  [/chef|cook|recipe|food|meal/i, ["Stirring it over", "Letting it simmer", "Tasting the options"]],
  [/write|writer|editor|blog|copy|nova/i, ["Finding the words", "Choosing my words", "Drafting in my head"]],
  [/travel|trip|atlas|map|route/i, ["Charting a course", "Plotting the route"]],
  [/fit|health|coach|run|gym/i, ["Pacing it out", "Warming up"]],
];
export function idlePool(kind: IdleKind, bot?: { name?: string; profile?: string; description?: string }): string[] {
  const pool = [...IDLE_PHRASES[kind]];
  const hint = bot ? `${bot.name ?? ""} ${bot.profile ?? ""} ${bot.description ?? ""}` : "";
  if (kind === "start" && hint.trim()) for (const [re, extra] of FLAVOURS) if (re.test(hint)) pool.push(...extra);
  return [...new Set(pool)];
}
/** A random phrase that isn't any of the last few shown (never an immediate repeat). */
export function nextPhrase(pool: readonly string[], recent: readonly string[], rand: () => number = Math.random): string {
  if (!pool.length) return "Thinking";
  const avoid = new Set(recent.slice(-Math.min(4, pool.length - 1)));
  const options = pool.filter((p) => !avoid.has(p));
  const from = options.length ? options : pool;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
}
/** How long a rotating phrase stays up: 4-6 s. */
export const phraseDelay = (rand: () => number = Math.random) => 4000 + Math.round(rand() * 2000);

/** Which rotating pool applies to a still-working reply, or null when there's a concrete line to show. */
export function idleKind(t: AssistantTurn): IdleKind | null {
  if (t.status !== "streaming" || t.text || t.reconnecting || t.approval || t.thought) return null;
  if (t.steps.some((s) => s.status === "running")) return null;
  return t.steps.length ? "wrapup" : "start";
}

/** The status line, or null when the reply text is already showing (or the turn is done). */
export function activityLine(t: AssistantTurn): string | null {
  if (t.status !== "streaming" || t.text) return null;
  if (t.reconnecting) return null; // the calm "Reconnecting…" note covers it
  if (t.approval) return "Waiting for your OK";
  for (let i = t.steps.length - 1; i >= 0; i--) if (t.steps[i].status === "running") return toolPhrase(t.steps[i].tool, t.steps[i].preview);
  if (t.thought) return clip(t.thought.split(/[.!?]\s/)[0], 64);
  return t.steps.length ? "Putting it together" : "Thinking";
}
