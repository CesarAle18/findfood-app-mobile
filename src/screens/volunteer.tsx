import { AvailabilityField } from "@/components/findfood/availability-field";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { messageFor } from "@/api/problem-messages";
import { QueryContent } from "@/components/findfood/feedback";
import {
  MotivoField,
  motivoBody,
  validateMotivo,
  type MotivoSelection,
} from "@/components/findfood/motivo-field";
import type { VolunteerApplication } from "@/domain/models";
import { useMotivos, useTiposVehiculo, type TipoVehiculoDto } from "@/services/catalogos";
import { useRechazarOfertaMutation } from "@/services/asignaciones";
import { View } from "react-native";
import {
  Badge,
  Button,
  Card,
  Choices,
  Copy,
  Detail,
  Field,
  SelectField,
  NavButton,
  PhotoPlaceholder,
  Row,
  Screen,
  Section,
  Stack,
} from "@/components/findfood/ui";
import { colors } from "@/design/tokens";

import { useDonationId } from "./donation-queries";

/**
 * The catalog vehicle types, keyed by their id as text (the select's value); the request
 * sends it back as the numeric `tipo_vehiculo_id` (`Number(form.vehicleType)`).
 */
export function vehicleTypeOptions(tipos: readonly TipoVehiculoDto[]) {
  return tipos.map((tipo) => ({ label: tipo.nombre, value: String(tipo.id) }));
}

export function VolunteerRegistrationScreen() {
  const [form, setForm] = useState<VolunteerApplication>({
    fullName: "",
    email: "",
    phone: "",
    documentType: "",
    documentNumber: "",
    vehicleType: "",
    capacityKg: "",
    refrigerated: true,
    availability: "Lunes · 08:00–18:00",
  });
  const tiposVehiculo = useTiposVehiculo();
  const change = (key: keyof VolunteerApplication) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Screen
      title="Registro como voluntario"
      subtitle="Completa la información para postularte."
      back
    >
      <Section title="Datos personales">
        <Stack>
          <Field
            label="Nombre completo *"
            value={form.fullName}
            onChangeText={change("fullName")}
            placeholder="Juan Pérez Sánchez"
          />
          <Field
            label="Correo electrónico *"
            value={form.email}
            onChangeText={change("email")}
            placeholder="juan@correo.com"
          />
          <Field
            label="Teléfono *"
            value={form.phone}
            onChangeText={change("phone")}
            placeholder="+57 300 123 4567"
          />
          <SelectField
            label="Tipo de identificación *"
            value={form.documentType}
            onChange={change("documentType")}
            options={[
              { label: "Cédula de ciudadanía", value: "CC" },
              { label: "Cédula de extranjería", value: "CE" },
              { label: "Pasaporte", value: "PA" },
              { label: "Permiso por Protección Temporal", value: "PPT" },
            ]}
          />
          <Field
            label="Documento *"
            value={form.documentNumber}
            onChangeText={change("documentNumber")}
            placeholder="1234567890"
          />
        </Stack>
      </Section>
      <Section title="Información del vehículo">
        <Stack>
          <QueryContent
            query={tiposVehiculo}
            loadingLabel="Cargando tipos de vehículo"
            errorTitle="No pudimos cargar los tipos de vehículo"
          >
            {(tipos) => (
              <SelectField
                label="Tipo de vehículo *"
                value={form.vehicleType}
                onChange={change("vehicleType")}
                options={vehicleTypeOptions(tipos)}
              />
            )}
          </QueryContent>
          <Field
            label="Capacidad de carga *"
            value={form.capacityKg}
            onChangeText={change("capacityKg")}
            placeholder="500 kg"
          />
          <Copy weight="medium" style={{ fontSize: 12 }}>
            Cadena de frío
          </Copy>
          <Choices values={["Sí, dispone", "No dispone"]} selected={form.refrigerated ? 0 : 1} onChange={(index) => setForm(current => ({ ...current, refrigerated: index === 0 }))} />
          <AvailabilityField onChange={change("availability")} />
          <Row style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Section title="Foto documento">
                <PhotoPlaceholder label="Documento" compact />
              </Section>
            </View>
            <View style={{ flex: 1 }}>
              <Section title="Foto vehículo">
                <PhotoPlaceholder label="Vehículo" compact />
              </Section>
            </View>
          </Row>
          <Section title="Foto licencia">
            <PhotoPlaceholder label="Licencia" compact />
          </Section>
        </Stack>
      </Section>
      <NavButton href="/donante" dismissTo showArrow={false}>
        Enviar
      </NavButton>
    </Screen>
  );
}
export function OfferScreen() {
  const [rejecting, setRejecting] = useState(false);
  return (
    <Screen
      title="Nueva oferta"
      subtitle="Voluntario"
      badge={<Badge warning>10:00 min</Badge>}
    >
      <Card>
        <Copy weight="bold" style={{ fontSize: 20, lineHeight: 28 }}>
          DON-1048
        </Copy>
        <Copy weight="medium">Supermercado La 14</Copy>
        <Copy tone="secondary">45 kg · Refrigeración requerida</Copy>
        <Copy tone="secondary">Ventana: 16:00–18:00</Copy>
      </Card>
      <Section title="Información para decidir">
        <Card>
          <Detail label="Distancia" value="2,8 km" icon="pin" />
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <Detail label="Tiempo" value="18 min" icon="clock" />
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <Detail label="Capacidad" value="120 kg" icon="truck" />
          <View style={{ height: 1, backgroundColor: colors.border }} />
        </Card>
      </Section>
      {rejecting ? (
        <RejectOffer onBack={() => setRejecting(false)} />
      ) : (
        <Row>
          <View style={{ flex: 1 }}>
            <Button variant="outline" onPress={() => setRejecting(true)}>
              Rechazar
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <NavButton href="/voluntario/rutas" dismissTo showArrow={false}>
              Aceptar
            </NavButton>
          </View>
        </Row>
      )}
      <Copy tone="secondary" style={{ fontSize: 11, textAlign: "center" }}>
        Al aceptar, la ruta se agregará automáticamente.
      </Copy>
    </Screen>
  );
}
/**
 * Rejects the offer with a RECHAZO_ASIGNACION reason. With `?asignacionId=` it calls
 * `POST /asignaciones/:id/rechazar`; without one (the demo offer) it only goes back home.
 */
function RejectOffer({ onBack }: { onBack: () => void }) {
  const { asignacionId } = useLocalSearchParams<{ asignacionId?: string }>();
  const { data: motivos } = useMotivos("RECHAZO_ASIGNACION");
  const { mutateAsync: rechazar, isPending } = useRechazarOfertaMutation();
  const [selection, setSelection] = useState<MotivoSelection>({ comentario: "" });
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const invalid = validateMotivo(selection, motivos ?? []);
    setError(invalid);
    const { motivoId } = selection;
    if (invalid !== null || motivoId === undefined) return;
    if (typeof asignacionId === "string" && asignacionId !== "") {
      try {
        await rechazar({ id: asignacionId, body: motivoBody({ ...selection, motivoId }) });
      } catch (failure) {
        setError(messageFor(failure));
        return;
      }
    }
    router.dismissTo("/voluntario");
  };

  return (
    <Section title="Rechazar oferta">
      <MotivoField
        ambito="RECHAZO_ASIGNACION"
        value={selection}
        onChange={setSelection}
        error={error}
      />
      <Button variant="danger" loading={isPending} onPress={() => void confirm()}>
        Confirmar rechazo
      </Button>
      <Button variant="outline" disabled={isPending} onPress={onBack}>
        Volver
      </Button>
    </Section>
  );
}

/** Opened from the active route; `?id=` is the stop's donation (UUID), when known. */
export function CollectionScreen() {
  const id = useDonationId();
  const [condition, setCondition] = useState("Bueno");
  const [weight, setWeight] = useState("20 kg");
  const [notes, setNotes] = useState("");
  return (
    <Screen title="Registrar recogida" subtitle="Parada 3 de 4" back>
      <SelectField label="Estado del producto" value={condition} onChange={setCondition} options={["Bueno", "Regular", "Malo"].map(value => ({ label: value, value }))} />
      <Field label="Peso aprox." value={weight} onChangeText={setWeight} />
      <Section title="Evidencia fotográfica">
        <PhotoPlaceholder label="Evidencia fotográfica" />
      </Section>
      <Field label="Observaciones" value={notes} onChangeText={setNotes} placeholder="Describe el estado del producto" multiline />
      <NavButton href={{ pathname: "/voluntario/calificar-donante", params: { id } }} showArrow={false}>Calificar donante</NavButton>
      <NavButton href="/voluntario/rutas" dismissTo showArrow={false}>
        Confirmar recogida
      </NavButton>
    </Screen>
  );
}
