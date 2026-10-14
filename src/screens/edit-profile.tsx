/**
 * `/editar-perfil`, for any mobile role: names and phone with `PATCH /me`. Only the changed
 * fields are sent; the answer is the whole account, stored as the `/me` cache.
 */
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";

import type { MeDto } from "@/api/types";
import { QueryContent } from "@/components/findfood/feedback";
import { Button, Field, FormMessage, Row, Screen, Stack } from "@/components/findfood/ui";
import { profileChanges } from "@/domain/mappers/profile";
import { editProfileSchema } from "@/domain/validation/auth";
import { useZodForm } from "@/hooks/use-zod-form";
import { useActualizarPerfilMutation } from "@/services/perfil";
import { queryKeys } from "@/services/query-keys";
import { useMe } from "@/state/session";

/** Back to the screen that opened the editor, or the gate on a cold deep link. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * Mounted once `/me` is loaded, so the fields start from the account; from then on they hold
 * what the user typed.
 */
function EditProfileForm({ me }: { me: MeDto }) {
  const queryClient = useQueryClient();
  const { mutateAsync } = useActualizarPerfilMutation();
  const form = useZodForm(editProfileSchema, {
    nombres: me.nombres ?? "",
    apellidos: me.apellidos ?? "",
    telefono: me.telefono ?? "",
  });

  // API field errors (400 `validacion`, 422) land on their fields through useZodForm.
  const submit = form.handleSubmit(async (data) => {
    const body = profileChanges(me, data);
    if (Object.keys(body).length > 0) {
      const updated = await mutateAsync(body);
      queryClient.setQueryData(queryKeys.me, updated);
    }
    leave();
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
      <FormMessage message={form.formError} />
      <Button onPress={submit} loading={form.submitting}>
        Guardar cambios
      </Button>
    </>
  );
}

export function EditProfileScreen() {
  const me = useMe();
  return (
    <Screen title="Editar perfil" subtitle="Tus datos de contacto" back>
      <QueryContent
        query={me}
        loadingLabel="Cargando tu perfil"
        errorTitle="No pudimos cargar tu perfil"
      >
        {(account) => <EditProfileForm me={account} />}
      </QueryContent>
    </Screen>
  );
}
