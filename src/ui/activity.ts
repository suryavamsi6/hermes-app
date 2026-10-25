// The live "what it's doing" line under a reply that's still being worked on, like Grok Bot's
// "Checking GitHub for updates". Pure (RN-free) so it can be unit-tested. Built from the run's
// stream: tool.started (tool + preview) and reasoning.available (Hermes's thinking summary).
import type { AssistantTurn } from "../chat-model";

const clip = (s: string, n = 48) => { const one = s.replace(/\s+/g, " ").trim(); return one.length > n ? `${one.slice(0, n - 1)}…` : one; };
const base = (p: string) => p.replace(/^["'`]|["'`]$/g, "").split(/[\\/]/).filter(Boolean).pop() ?? p;
const words = (s: string) => s.replace(/[_-]+/g, " ").trim();

/** One running tool -> a short present-tense phrase. Unknown tools get "Using <tool>". */
export function toolPhrase(tool: string, preview?: string): string {
  const t = tool.toLowerCase(), p = preview?.trim() ? preview.trim() : undefined;
  const mcp = /^mcp[_:]+([a-z0-9-]+?)[_:]+(.+)$/.exec(t);
  if (mcp) return `Using ${words(mcp[1])}${p ? `: ${clip(p, 36)}` : ""}`;
  if (/terminal|shell|bash|exec|command|process/.test(t)) return p ? `Running ${clip(p, 40)}` : "Running a command";
  if (/web_?search|search_web|google|bing/.test(t)) return p ? `Searching the web for ${clip(p, 34)}` : "Searching the web";
  if (/web_?extract|fetch|browse|browser|crawl|scrape|url/.test(t)) return p ? `Reading ${clip(p, 40)}` : "Reading a web page";
  if (/read_?file|view|cat\b|open_?file/.test(t)) return p ? `Reading ${clip(base(p), 40)}` : "Reading a file";
  if (/write|patch|edit|replace|create_?file/.test(t)) return p ? `Editing ${clip(base(p), 40)}` : "Editing files";
  if (/search_?files|grep|find|glob|list_?dir|ls\b/.test(t)) return p ? `Looking through files for ${clip(p, 30)}` : "Looking through files";
  if (/memory|remember/.test(t)) return "Updating memory";
  if (/session_?search|recall/.test(t)) return "Looking back through past chats";
  if (/skill/.test(t)) return p ? `Using the ${clip(p, 30)} skill` : "Using a skill";
  if (/delegate|subagent|spawn/.test(t)) return "Handing part of this to a helper";
  if (/todo|plan/.test(t)) return "Planning the next steps";
  if (/vision|image|screenshot/.test(t)) return "Looking at an image";
  if (/cron|schedule|routine/.test(t)) return "Setting up a routine";
  if (/code|python|execute/.test(t)) return "Running code";
  return `Using ${words(tool)}`;
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
