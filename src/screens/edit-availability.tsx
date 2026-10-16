/**
 * `/voluntario/editar-disponibilidad`: the volunteer's weekly windows with
 * `PUT /voluntario/disponibilidad`, which replaces all of them. There is no GET: the windows
 * come from `GET /me` (`voluntario.disponibilidad`), and the saved ones are merged back into
 * that cache. Saving no window turns "Disponible" off (the API does it too), so it asks first.
 */
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Platform } from "react-native";

import { messageFor } from "@/api/problem-messages";
import type { FranjaDto, MeDto } from "@/api/types";
import { AvailabilityField } from "@/components/findfood/availability-field";
import { EmptyState, QueryContent } from "@/components/findfood/feedback";
import { Button, FormMessage, Screen } from "@/components/findfood/ui";
import {
  franjasBody,
  franjasFromDisponibilidad,
  validateFranjas,
  withDisponibilidad,
} from "@/domain/mappers/franjas";
import { useActualizarDisponibilidadMutation } from "@/services/perfil";
import { queryKeys } from "@/services/query-keys";
import { useMe } from "@/state/session";

const EMPTY_TITLE = "Sin franjas de disponibilidad";
const EMPTY_QUESTION =
  "Si guardas sin franjas, tu estado pasará a \"No disponible\" y dejarás de recibir ofertas.";

/** Asks before saving an empty schedule: a native alert, or the browser's dialog on web. */
function confirmEmpty(onConfirm: () => void) {
  if (Platform.OS === "web") {
    // react-native-web's Alert.alert does nothing.
    if (globalThis.confirm?.(EMPTY_QUESTION)) onConfirm();
    return;
  }
  Alert.alert(EMPTY_TITLE, EMPTY_QUESTION, [
    { text: "Cancelar", style: "cancel" },
    { text: "Guardar sin franjas", style: "destructive", onPress: onConfirm },
  ]);
}

/** Back to the screen that opened the editor, or the volunteer home on a cold deep link. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/voluntario");
}

function EditAvailabilityForm({ saved }: { saved: readonly FranjaDto[] }) {
  const queryClient = useQueryClient();
  const { mutate, reset, isPending, error } = useActualizarDisponibilidadMutation();
  // Undefined until the user edits: the saved windows show through until then.
  const [draft, setDraft] = useState<FranjaDto[] | undefined>(undefined);
  const franjas = draft ?? franjasFromDisponibilidad(saved);
  const invalid = validateFranjas(franjas);

  function change(next: FranjaDto[]) {
    reset();
    setDraft(next);
  }

  function save() {
    const body = { franjas: franjasBody(franjas) };
    mutate(body, {
      onSuccess: () => {
        queryClient.setQueryData<MeDto>(queryKeys.me, (me) => withDisponibilidad(me, body.franjas));
        leave();
      },
    });
  }

  function submit() {
    if (invalid || isPending) return;
    if (franjas.length === 0) confirmEmpty(save);
    else save();
  }

  return (
    <>
      <AvailabilityField
        title="Franjas semanales"
        value={franjas}
        onChange={change}
        error={invalid}
      />
      <FormMessage message={error ? messageFor(error) : undefined} />
      <Button onPress={submit} loading={isPending} disabled={invalid !== undefined}>
        Guardar disponibilidad
      </Button>
    </>
  );
}

export function EditAvailabilityScreen() {
  const me = useMe();
  return (
    <Screen title="Editar disponibilidad" subtitle="Cuándo puedes recoger donaciones" back>
      <QueryContent
        query={me}
        loadingLabel="Cargando tu disponibilidad"
        errorTitle="No pudimos cargar tu disponibilidad"
      >
        {(account) =>
          account.voluntario ? (
            <EditAvailabilityForm saved={account.voluntario.disponibilidad} />
          ) : (
            <EmptyState
              icon="truck"
              title="Aún no tienes perfil de voluntario"
              description="Completa tu registro como voluntario para registrar tu disponibilidad."
            />
          )
        }
      </QueryContent>
    </Screen>
  );
}
