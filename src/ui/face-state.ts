// Which expression a bot's face shows (pure, RN-free, unit-tested). Every mood comes from real app
// state: a face never looks busy, pleased or expectant unless the chat says so.
//   idle      nothing going on (occasional blink, glance, slow breath)
//   listening you're typing to it or dictating (eyes open a little wider, look up at you)
//   thinking  a run started and nothing has come back yet (eyes up and to the side, slow drift)
//   working   a tool is running or the reply is being written (focused squint, small steady nod)
//   waiting   the run is paused for your OK, or queued behind another client (head tilt, looks at you)
//   success   a reply just finished, or a setting was saved (^ ^ eyes and one hop; ~1 s)
//   error     the last run failed or the chat couldn't load (concerned, lowered eyes; no "z", no nap)
import type { AssistantTurn, Turn } from "../chat-model";
import { motionPolicy } from "./motion-tokens";

export type FaceMood = "idle" | "listening" | "thinking" | "working" | "waiting" | "success" | "error";
export const FACE_MOODS: FaceMood[] = ["idle", "listening", "thinking", "working", "waiting", "success", "error"];

type ChatLike = { busy: boolean; error?: string; turns: Turn[] } | undefined;

function lastAssistant(turns: Turn[] | undefined): AssistantTurn | undefined {
  for (let i = (turns?.length ?? 0) - 1; i >= 0; i--) { const t = turns![i]; if (t.role === "assistant" && !t.note) return t; }
  return undefined;
}

/** The face for one streaming reply (the small face on its status line). */
export function turnMood(t: AssistantTurn): FaceMood {
  if (t.status !== "streaming") return t.status === "failed" ? "error" : "idle";
  if (t.approval) return "waiting";
  if (t.steps.some((s) => s.status === "running") || t.text) return "working";
  return "thinking";
}

/** The face for a bot, from its chat. `happy` is the short flag set when a reply completes (or a
 *  setting was saved); `listening` is the composer being focused or dictating. Order matters: a
 *  pending approval outranks everything (it needs you), then live work, then the brief success,
 *  then a failure, then listening. */
export function faceMood(c: ChatLike, o: { happy?: boolean; listening?: boolean } = {}): FaceMood {
  const last = lastAssistant(c?.turns);
  if (last?.status === "streaming" && last.approval) return "waiting";
  if (last?.status === "queued") return "waiting";
  if (c?.busy) return last?.status === "streaming" ? turnMood(last) : "thinking";
  if (o.happy) return "success";
  if (c?.error || last?.status === "failed") return "error";
  if (o.listening) return "listening";
  return "idle";
}
