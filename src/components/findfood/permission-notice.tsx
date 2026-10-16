import { Linking } from "react-native";

import type { PermissionGate } from "@/platform/permissions";

import { Button, Card, Copy, Stack } from "./ui";

/**
 * Explains why a feature needs a permission and how to get it: the system prompt while the
 * OS still shows it (`denied`), the app's settings once it does not (`blocked`). Renders
 * nothing when the permission is granted or its status has not loaded yet.
 */
export function PermissionNotice({
  title,
  body,
  gate,
  onRequest,
}: {
  title: string;
  body: string;
  gate: PermissionGate;
  onRequest: () => void;
}) {
  if (gate !== "denied" && gate !== "blocked") return null;
  return (
    <Card soft>
      <Stack gap={12}>
        <Stack gap={4}>
          <Copy weight="bold">{title}</Copy>
          <Copy tone="secondary">{body}</Copy>
        </Stack>
        {gate === "blocked" ? (
          <Button variant="outline" onPress={openSettings}>
            Abrir ajustes
          </Button>
        ) : (
          <Button onPress={onRequest}>Permitir</Button>
        )}
      </Stack>
    </Card>
  );
}

function openSettings() {
  void Linking.openSettings();
}
