// Small haptic ticks (send, reply finished). Never throws: haptics are a nicety.
import * as Haptics from "expo-haptics";

export const tapHaptic = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const doneHaptic = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
