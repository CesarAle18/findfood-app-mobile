/**
 * The volunteer's "Disponible / No disponible" toggle, shared by the home and profile
 * screens. The value is `me.voluntario.disponible` (the server's truth), changed with
 * `PATCH /voluntario/estado` optimistically; location tracking follows it on its own
 * (see useVolunteerLocationTracking).
 */
import type { Href } from "expo-router";

import { isApiError } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";
import { PermissionNotice } from "@/components/findfood/permission-notice";
import { Choices, FormMessage, Stack, TextLink } from "@/components/findfood/ui";
import { startLocationTracking } from "@/location/tracking";
import { useCambiarDisponibleMutation } from "@/services/perfil";
import { useMe } from "@/state/session";

import { useLocationTrackingStatus } from "./use-volunteer-location-tracking";

const CHOICES = ["Disponible", "No disponible"];
/** Turning availability on needs a schedule and a base location first. */
const NEEDS_SETUP = new Set(["sin-horario", "sin-ubicacion-base"]);

export function useAvailabilityToggle() {
  const { data: me } = useMe();
  const { mutate, reset, error } = useCambiarDisponibleMutation();
  const disponible = me?.voluntario?.disponible ?? false;

  function setDisponible(value: boolean) {
    if (value === disponible) return;
    reset();
    mutate({ disponible: value });
  }

  return {
    hasProfile: me?.voluntario != null,
    disponible,
    setDisponible,
    errorMessage: error ? messageFor(error) : undefined,
    needsSetup: isApiError(error) && NEEDS_SETUP.has(error.type),
  };
}

function retryTracking() {
  void startLocationTracking({ allowBackground: true });
}

/** `setupHref`: where the volunteer fixes a missing schedule or base location. */
export function AvailabilityToggle({ setupHref }: { setupHref?: Href }) {
  const { hasProfile, disponible, setDisponible, errorMessage, needsSetup } =
    useAvailabilityToggle();
  const tracking = useLocationTrackingStatus();
  if (!hasProfile) return null;
  const gate = tracking === "denied" || tracking === "blocked" ? tracking : "granted";
  return (
    <Stack gap={12}>
      <Choices
        values={CHOICES}
        selected={disponible ? 0 : 1}
        onChange={(index) => setDisponible(index === 0)}
      />
      <FormMessage message={errorMessage} />
      {needsSetup && setupHref ? (
        <TextLink href={setupHref} align="left">
          Completar mi disponibilidad
        </TextLink>
      ) : null}
      <PermissionNotice
        title="Activa tu ubicación"
        body="Mientras estás disponible o en una ruta compartimos tu ubicación para ofrecerte recogidas cercanas."
        gate={gate}
        onRequest={retryTracking}
      />
    </Stack>
  );
}

/** The badge text for the screen header. */
export function availabilityLabel(disponible: boolean): string {
  return disponible ? "Disponible" : "No disponible";
}
