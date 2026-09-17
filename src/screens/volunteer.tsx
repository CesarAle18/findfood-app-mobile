import { useState } from "react";
import type { VolunteerApplication } from "@/domain/models";
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
    availability: "",
  });
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
          <SelectField
            label="Tipo de vehículo *"
            value={form.vehicleType}
            onChange={change("vehicleType")}
            options={[
              { label: "Camioneta", value: "Camioneta" },
              { label: "Automóvil", value: "Automóvil" },
              { label: "Motocicleta", value: "Motocicleta" },
            ]}
          />
          <Field
            label="Capacidad de carga *"
            value={form.capacityKg}
            onChangeText={change("capacityKg")}
            placeholder="500 kg"
          />
          <Copy weight="medium" style={{ fontSize: 12 }}>
            Cadena de frío
          </Copy>
          <Choices values={["Sí, dispone", "No dispone"]} />
          <Field
            label="Disponibilidad *"
            value={form.availability}
            onChangeText={change("availability")}
            placeholder="Lunes a viernes · 08:00–18:00"
          />
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
      <NavButton href="/inicio-donante" showArrow={false}>
        Enviar
      </NavButton>
    </Screen>
  );
}
export function OfferScreen() {
  return (
    <Screen
      title="Nueva oferta"
      subtitle="Voluntario"
      tabs="home"
      viewRole="volunteer"
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
      <Row>
        <View style={{ flex: 1 }}>
          <Button variant="outline">Rechazar</Button>
        </View>
        <View style={{ flex: 1 }}>
          <NavButton href="/ruta-activa" showArrow={false}>
            Aceptar
          </NavButton>
        </View>
      </Row>
      <Copy tone="secondary" style={{ fontSize: 11, textAlign: "center" }}>
        Al aceptar, la ruta se agregará automáticamente.
      </Copy>
    </Screen>
  );
}
export function CollectionScreen() {
  return (
    <Screen title="Registrar recogida" subtitle="Parada 3 de 4" back>
      <Field label="Estado del producto" value="Bueno" select />
      <Field label="Peso aprox." value="20 kg" />
      <Section title="Evidencia fotográfica">
        <PhotoPlaceholder label="Evidencia fotográfica" />
      </Section>
      <Field label="Observaciones" value="Producto en buen estado." multiline />
      <NavButton href="/ruta-activa" showArrow={false}>
        Confirmar recogida
      </NavButton>
    </Screen>
  );
}
