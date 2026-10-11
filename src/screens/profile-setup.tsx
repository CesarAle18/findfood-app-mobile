/**
 * `/completar-perfil`, open in the `complete-profile` phase (`TELEFONO` or
 * `ACEPTAR_TERMINOS` pending): saves what is missing with `PATCH /me`. Google accounts arrive
 * here without surnames and phone.
 */
import { useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";

import type { MeDto } from "@/api/types";
import { QueryContent } from "@/components/findfood/feedback";
import { Button, Field, FormMessage, Row, Screen, Stack } from "@/components/findfood/ui";
import {
  completeProfileSchema,
  normalizeColombianMobile,
  type CompleteProfileData,
} from "@/domain/validation/auth";
import { useZodForm } from "@/hooks/use-zod-form";
import { useActualizarPerfilMutation, type ActualizarPerfilBody } from "@/services/perfil";
import { queryKeys } from "@/services/query-keys";
import { useMe } from "@/state/session";

import { SignOutButton } from "./access";
import { TermsCheckbox } from "./auth";

/** Only what changed, plus the terms while they are pending: nothing else is rewritten. */
function profileChanges(
  me: MeDto,
  data: CompleteProfileData,
  termsPending: boolean,
): ActualizarPerfilBody {
  const body: ActualizarPerfilBody = {};
  if (data.nombres !== me.nombres) body.nombres = data.nombres;
  if (data.apellidos !== (me.apellidos ?? "")) body.apellidos = data.apellidos;
  const currentPhone = me.telefono === null ? null : normalizeColombianMobile(me.telefono);
  if (data.telefono !== currentPhone) body.telefono = data.telefono;
  if (termsPending) body.acepto_terminos = true;
  return body;
}

function CompleteProfileForm({ me }: { me: MeDto }) {
  const queryClient = useQueryClient();
  const actualizar = useActualizarPerfilMutation();
  const termsPending = me.pendientes.includes("ACEPTAR_TERMINOS");
  const form = useZodForm(completeProfileSchema(termsPending), {
    nombres: me.nombres ?? "",
    apellidos: me.apellidos ?? "",
    telefono: me.telefono ?? "",
    acepto_terminos: false,
  });

  // API field errors (400 `validacion`) land on their fields through useZodForm.
  const submit = form.handleSubmit(async (data) => {
    const updated = await actualizar.mutateAsync(profileChanges(me, data, termsPending));
    // The answer is the updated account: the guards move on without waiting for a refetch.
    queryClient.setQueryData(queryKeys.me, updated);
  });

  return (
    <>
      <Stack>
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Nombres"
              {...form.field("nombres")}
              autoComplete="given-name"
              textContentType="givenName"
              autoCapitalize="words"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Apellidos"
              {...form.field("apellidos")}
              autoComplete="family-name"
              textContentType="familyName"
              autoCapitalize="words"
            />
          </View>
        </Row>
        <Field
          label="Celular"
          {...form.field("telefono")}
          placeholder="300 123 4567"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          accessibilityHint="Número celular de Colombia."
        />
      </Stack>
      {termsPending ? (
        <TermsCheckbox
          checked={form.values.acepto_terminos}
          error={form.errors.acepto_terminos}
          disabled={false}
          onToggle={() => form.setValue("acepto_terminos", !form.values.acepto_terminos)}
        />
      ) : null}
      <FormMessage message={form.formError} />
      <Button onPress={submit} loading={form.submitting}>
        Guardar y continuar
      </Button>
    </>
  );
}

export function CompleteProfileScreen() {
  const me = useMe();
  return (
    <Screen
      title="Completa tu perfil"
      subtitle="Antes de continuar necesitamos estos datos. Todos los campos son obligatorios."
    >
      <QueryContent query={me} loadingLabel="Cargando tu cuenta" errorTitle="No pudimos cargar tu cuenta">
        {(account) => <CompleteProfileForm me={account} />}
      </QueryContent>
      <SignOutButton variant="outline" />
    </Screen>
  );
}
