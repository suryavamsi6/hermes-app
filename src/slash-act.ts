import { Alert } from "react-native";
import { router } from "expo-router";
import type { Bot } from "./backend";
import { CommandError } from "./backend";
import type { AssistantTurn } from "./chat-model";
import type { Attachment, FileAttachment } from "./attach";
import { canSteer as steerable, runningTurn } from "./chat-tools";
import { explain, failureNote, skillMessage, type SlashAction } from "./slash";
import { setDraftText } from "./app-state";

type Deps = {
  bot: Bot;
  turns: { role: string; status?: string; prompt?: string; id: string; approval?: unknown }[];
  busy: boolean;
  backend: { kind?: string; supports: (s: string) => boolean; updateSession?: Function; botChatSession: (b: Bot) => Promise<string>; restartGateway?: () => Promise<void> } | null;
  chat: { busy: boolean; sessionId?: string };
  lastAssistant?: AssistantTurn;
  setNote: (s: string | null) => void;
  stop: (b: Bot) => void;
  retry: (b: Bot, id: string) => Promise<void>;
  onSteer: (t: string) => Promise<boolean>;
  approve: (b: Bot, id: string, c: "once" | "session" | "always" | "deny") => Promise<void>;
  setModelQuery: (q: string) => void;
  setModelSheet: (on: boolean) => void;
  newChat: (b: Bot) => Promise<void>;
  startSearch: () => void;
  exportChat: () => void;
  onSend: (t: string, images?: Attachment[], files?: FileAttachment[]) => void;
  runCommand: (b: Bot, command: string, profileWide: boolean) => Promise<{ type: string; output: string; message?: string; ranIn?: string }>;
  commandReply: (b: Bot, typed: string, answer: string) => void;
};

export function runSlash(d: Deps, a: SlashAction, typed: string, images: Attachment[] = [], files: FileAttachment[] = []): "sent" | "done" | "kept" {
  const running = runningTurn(d.turns as any);
  const { bot } = d;
  switch (a.type) {
    case "help": setTimeout(() => setDraftText(bot.id, "/"), 0); return "done";
    case "status": {
      const where = d.backend?.kind === "demo" ? "demo mode" : d.backend?.supports("mcp") ? "API server + bridge" : "API server";
      d.setNote(`${bot.name} \u00b7 profile ${bot.profile} \u00b7 model ${bot.model ?? "profile default"}${bot.provider ? ` (${bot.provider})` : ""} \u00b7 ${where}${d.busy ? " \u00b7 working" : ""}`);
      return "done";
    }
    case "stop": if (d.busy) d.stop(bot); else d.setNote("Nothing is running."); return "done";
    case "retry":
      if (d.busy) d.setNote("Wait for this reply to finish, or /stop it first.");
      else if (d.lastAssistant?.prompt) void d.retry(bot, d.lastAssistant.id);
      else d.setNote("Nothing to run again yet.");
      return "done";
    case "steer":
      if (running && steerable(running)) void d.onSteer(a.text); else d.setNote("Nothing is running. Send it as a normal message instead.");
      return "done";
    case "approve":
      if (d.lastAssistant?.approval && d.lastAssistant.status === "streaming") void d.approve(bot, d.lastAssistant.id, a.choice);
      else d.setNote("Nothing is waiting for your OK.");
      return "done";
    case "model": d.setModelQuery(a.query); d.setModelSheet(true); return "done";
    case "new":
      if (d.busy) { d.setNote("Wait for this reply to finish, or /stop it first."); return "done"; }
      void d.newChat(bot).then(() => d.setNote("New chat started. The previous one is under Topics & sessions."), (e: any) => d.setNote(`Couldn't start a new chat: ${String(e?.message ?? e)}`));
      return "done";
    case "search": d.startSearch(); return "done";
    case "export": d.exportChat(); return "done";
    case "open": {
      const to = { settings: `/bot-info/${bot.id}`, skills: `/bot-info/${bot.id}`, mcp: `/mcp/${bot.id}`, plugins: `/plugins/${bot.id}`, memory: `/memory/${bot.id}`, routines: `/routines?bot=${bot.id}`, topics: `/history/${bot.id}`, activity: `/activity/${bot.id}`, call: `/call/${bot.id}` }[a.screen];
      router.push(to as any);
      return "done";
    }
    case "skill": d.onSend(skillMessage(a.name, a.arg), images, files); return "sent";
    case "rename":
      if (!d.backend?.updateSession) { d.setNote("Renaming isn't available here."); return "done"; }
      void (async () => d.backend!.updateSession!(bot, d.chat.sessionId ?? (await d.backend!.botChatSession(bot)), { title: a.title }))().then(() => d.setNote(`Chat renamed to "${a.title}".`), (e: any) => d.setNote(`Couldn't rename the chat: ${String(e?.message ?? e)}`));
      return "done";
    case "restart":
      if (!d.backend?.restartGateway || !d.backend.supports("mcp")) { d.setNote("/restart needs hermes-bridge on your server. Add it in Settings."); return "done"; }
      Alert.alert("Restart Hermes's gateway?", "Hermes finishes running replies first. Every chat on this server pauses for a moment.", [
        { text: "Cancel", style: "cancel" },
        { text: "Restart", style: "destructive", onPress: () => void d.backend!.restartGateway!().then(() => d.setNote("Hermes's gateway is restarting."), (e: any) => d.setNote(`Couldn't restart: ${String(e?.message ?? e)}`)) },
      ]);
      return "done";
    case "hermes": {
      const name = a.command.split(/\s/)[0];
      d.setNote(`Running ${name}\u2026`);
      void d.runCommand(bot, a.command, a.profileWide).then((r) => {
        d.setNote(null);
        if (r.type === "send") {
          if (d.chat.busy) d.setNote(`Wait for this reply to finish, then run ${name} again.`); else d.onSend(r.message ?? "");
          return;
        }
        const answer = (r.output.trim() || "Done.") + (r.ranIn === "bot-chat" ? "\n\n_Ran in the Bot Chat (this chat is a separate phone session)._" : "");
        if (d.chat.busy) d.setNote(answer.replace(/[*_`]/g, "")); else d.commandReply(bot, typed, answer);
      }, (e: any) => {
        const f = e instanceof CommandError ? e.failure : { kind: "unavailable" as const, message: String(e?.message ?? e) };
        if (a.fallback && f.kind !== "refused") { d.setNote(null); runSlash(d, a.fallback, typed); return; }
        d.setNote(failureNote(a.name, f));
      });
      return "done";
    }
    default: d.setNote(explain(a)); return "kept";
  }
}
