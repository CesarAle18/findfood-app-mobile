/**
 * `/editar-perfil`, for any mobile role: names and phone with `PATCH /me`. In the volunteer
 * view it also changes cold chain and operation zone with `PATCH /voluntario/perfil`; vehicle,
 * plate and capacity are shown read-only. Only the changed fields are sent; each answer is
 * the whole account, stored as the `/me` cache.
 */
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";

import type { MeDto, MeVoluntarioDto } from "@/api/types";
import { QueryContent } from "@/components/findfood/feedback";
import {
  Button,
  Card,
  Copy,
  Detail,
  Field,
  FormMessage,
  Row,
  Screen,
  Section,
  Stack,
} from "@/components/findfood/ui";
import { ColdChainChoice, OperationZoneFields } from "@/components/findfood/volunteer-zone";
import { formatKg, profileChanges, volunteerProfileChanges } from "@/domain/mappers/profile";
import { editProfileSchema, editVolunteerProfileSchema } from "@/domain/validation/auth";
import { useZodForm } from "@/hooks/use-zod-form";
import {
  useActualizarPerfilMutation,
  useActualizarPerfilVoluntarioMutation,
} from "@/services/perfil";
import { queryKeys } from "@/services/query-keys";
import { useAccess, useMe } from "@/state/session";

/** Back to the screen that opened the editor, or the gate on a cold deep link. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

type ContactName = "nombres" | "apellidos" | "telefono";

/** Names and phone, bound to either form through its `field()`. */
function ContactFields({
  field,
}: {
  field: (name: ContactName) => {
    value: string;
    error: string | undefined;
    onChangeText: (text: string) => void;
    onBlur: () => void;
  };
}) {
  return (
    <>
      <Row style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Nombres"
            {...field("nombres")}
            autoComplete="given-name"
            textContentType="givenName"
            autoCapitalize="words"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Apellidos"
            {...field("apellidos")}
            autoComplete="family-name"
            textContentType="familyName"
            autoCapitalize="words"
          />
        </View>
      </Row>
      <Field
        label="Celular"
        {...field("telefono")}
        placeholder="300 123 4567"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        accessibilityHint="Número celular de Colombia."
      />
    </>
  );
}

/**
 * Mounted once `/me` is loaded, so the fields start from the account; from then on they hold
 * what the user typed.
 */
function ContactProfileForm({ me }: { me: MeDto }) {
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
        <ContactFields field={form.field} />
      </Stack>
      <FormMessage message={form.formError} />
      <Button onPress={submit} loading={form.submitting}>
        Guardar cambios
      </Button>
    </>
  );
}

/** The volunteer view: contact fields, then the vehicle (read-only) and the editable zone. */
function VolunteerProfileForm({ me, voluntario }: { me: MeDto; voluntario: MeVoluntarioDto }) {
  const queryClient = useQueryClient();
  const { mutateAsync: actualizarPerfil } = useActualizarPerfilMutation();
  const { mutateAsync: actualizarVoluntario } = useActualizarPerfilVoluntarioMutation();
  const form = useZodForm(editVolunteerProfileSchema, {
    nombres: me.nombres ?? "",
    apellidos: me.apellidos ?? "",
    telefono: me.telefono ?? "",
    tiene_refrigeracion: voluntario.tiene_refrigeracion,
    ubicacion_base: voluntario.ubicacion_base,
    radio_cobertura_km: String(voluntario.radio_cobertura_km),
  });
  const { values, errors } = form;

  // One request per endpoint, one after the other; each answer is stored at once, so after a
  // failed second request a retry only sends what is still pending. API field errors (400
  // `validacion`) land on their fields through useZodForm: the names match both bodies.
  const submit = form.handleSubmit(
    async ({ tiene_refrigeracion, ubicacion_base, radio_cobertura_km, ...contact }) => {
      const contactBody = profileChanges(me, contact);
      if (Object.keys(contactBody).length > 0) {
        queryClient.setQueryData(queryKeys.me, await actualizarPerfil(contactBody));
      }
      const volunteerBody = volunteerProfileChanges(voluntario, {
        tiene_refrigeracion,
        ubicacion_base,
        radio_cobertura_km,
      });
      if (Object.keys(volunteerBody).length > 0) {
        queryClient.setQueryData(queryKeys.me, await actualizarVoluntario(volunteerBody));
      }
      leave();
    },
  );

  return (
    <>
      <Section title="Información de voluntario">
        <Stack>
          <ContactFields field={form.field} />
        </Stack>
      </Section>
      <Section title="Vehículo y zona">
        <Stack>
          <Card>
            <Detail label="Vehículo" value={voluntario.tipo_vehiculo.nombre} />
            <Detail label="Placa" value={voluntario.placa_vehiculo} />
            <Detail label="Capacidad" value={formatKg(voluntario.capacidad_carga_kg)} />
          </Card>
          <ColdChainChoice
            value={values.tiene_refrigeracion}
            onChange={(value) => form.setValue("tiene_refrigeracion", value)}
          />
          <Copy weight="medium" style={{ fontSize: 12 }}>
            Zona de operación
          </Copy>
          <OperationZoneFields
            location={values.ubicacion_base}
            onLocationChange={(point) => form.setValue("ubicacion_base", point)}
            locationError={errors.ubicacion_base}
            radius={form.field("radio_cobertura_km")}
          />
        </Stack>
      </Section>
      <FormMessage message={form.formError} />
      <Button onPress={submit} loading={form.submitting}>
        Guardar cambios
      </Button>
    </>
  );
}

/** The volunteer view only while that role is active and the account has its profile. */
function EditProfileForm({ me }: { me: MeDto }) {
  const { activeRole } = useAccess();
  if (activeRole === "VOLUNTARIO" && me.voluntario) {
    return <VolunteerProfileForm me={me} voluntario={me.voluntario} />;
  }
  return <ContactProfileForm me={me} />;
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
