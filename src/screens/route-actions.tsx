/**
 * Actions on the volunteer's route and its stops, shared by Rutas and the accepted pickups.
 */
import { Alert, Platform } from "react-native";

/**
 * Asks before an action that cannot be undone: a native alert, or the browser's dialog on
 * web (react-native-web's Alert.alert does nothing).
 */
export function confirmAction(
  { title, question, confirmLabel }: { title: string; question: string; confirmLabel: string },
  onConfirm: () => void,
) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(question)) onConfirm();
    return;
  }
  Alert.alert(title, question, [
    { text: "Volver", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
