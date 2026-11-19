import { useState } from "react";
import { Linking } from "react-native";

import type { Coordenada } from "@/api/types";

import { WazeLogo } from "./icon";
import { Button, FormMessage } from "./ui";

/** Waze's universal link that starts turn-by-turn navigation to `lat,lng`. */
export function wazeUrl({ lat, lng }: Coordenada): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

/**
 * Opens Waze with navigation to `destino`; renders nothing without a usable point. No
 * `canOpenURL` check and no `waze://` scheme: the universal https link opens the app when it
 * is installed, or the Waze web/store page otherwise, so it needs no iOS
 * `LSApplicationQueriesSchemes`, no Android `<queries>` and no native build. A failed open is
 * caught and explained instead.
 */
export function WazeButton({
  destino,
  label = "Ir con Waze",
  variant = "outline",
}: {
  destino: Coordenada;
  label?: string;
  variant?: "primary" | "outline";
}) {
  const [failed, setFailed] = useState(false);
  if (!Number.isFinite(destino.lat) || !Number.isFinite(destino.lng)) return null;
  const url = wazeUrl(destino);
  const open = async () => {
    setFailed(false);
    try {
      await Linking.openURL(url);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <FormMessage
        message={failed ? "No pudimos abrir Waze. Instálalo o usa otra app de mapas." : undefined}
      />
      <Button variant={variant} icon={<WazeLogo />} onPress={() => void open()}>
        {label}
      </Button>
    </>
  );
}
