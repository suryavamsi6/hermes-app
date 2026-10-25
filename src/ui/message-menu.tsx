// Long-press a message: tapback reactions, when it was sent, and Copy / Share / Quote / Retry.
import * as Clipboard from "expo-clipboard";
import { Copy, MessageSquareQuote, RefreshCw, RotateCcw, Share2 } from "lucide-react-native";
import { Pressable, Share, Text, View } from "react-native";
import type { Turn } from "../chat-model";
import { messageTime } from "./chat-rows";
import { REACTIONS } from "./reactions";
import { Sheet, SheetRow } from "./sheet";
import { colors, type } from "./theme";

export type MessageMenuActions = {
  react: (emoji: string | null) => void;
  quote: () => void;
  /** A failed or stopped reply: run it again in place. */
  retry?: () => void;
  /** The latest finished reply: ask the same question again. */
  askAgain?: () => void;
};

/** "> line" quote of the first few lines, for the composer. */
export const quoteOf = (text: string) =>
  text.trim().split("\n").slice(0, 4).map((l) => `> ${l}`.trimEnd()).join("\n") + (text.trim().split("\n").length > 4 ? "\n> …" : "") + "\n\n";

export function MessageMenu({ turn, reaction, onClose, actions }: { turn: Turn | null; reaction?: string; onClose: () => void; actions: MessageMenuActions }) {
  const icon = (I: typeof Copy) => <I size={20} color={colors.textSecondary} />;
  const run = (f?: () => void) => () => { onClose(); f?.(); };
  return (
    <Sheet visible={!!turn} onClose={onClose}>
      {turn ? <>
        <View style={{ flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 12, paddingBottom: 8 }}>
          {REACTIONS.map((e) => (
            <Pressable key={e} accessibilityLabel={`React ${e}`} onPress={run(() => actions.react(reaction === e ? null : e))}
              style={({ pressed }) => ({ padding: 8, borderRadius: 999, backgroundColor: reaction === e ? colors.controlActive : pressed ? colors.controlActive : "transparent" })}>
              <Text style={{ fontSize: 26 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        {turn.at ? <Text style={[type.label, { color: colors.muted, paddingHorizontal: 20, paddingBottom: 6 }]}>{turn.role === "user" ? "Sent" : "Replied"} {messageTime(turn.at)}</Text> : null}
        {turn.text ? <SheetRow icon={icon(Copy)} label="Copy" onPress={run(() => void Clipboard.setStringAsync(turn.text))} /> : null}
        {turn.text ? <SheetRow icon={icon(Share2)} label="Share" onPress={run(() => void Share.share({ message: turn.text }).catch(() => {}))} /> : null}
        {turn.text ? <SheetRow icon={icon(MessageSquareQuote)} label="Quote in reply" onPress={run(actions.quote)} /> : null}
        {actions.retry ? <SheetRow icon={icon(RotateCcw)} label="Retry" onPress={run(actions.retry)} /> : null}
        {actions.askAgain ? <SheetRow icon={icon(RefreshCw)} label="Ask again" onPress={run(actions.askAgain)} /> : null}
      </> : null}
    </Sheet>
  );
}
