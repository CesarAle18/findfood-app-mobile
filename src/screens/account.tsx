import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Badge,
  Card,
  Copy,
  Detail,
  Field,
  NavButton,
  Row,
  Screen,
  Section,
  TextLink,
} from "@/components/findfood/ui";
import { Icon } from "@/components/findfood/icon";
import { Metrics } from "./donor";
import { useMobile } from "@/state/mobile-context";
import { colors, fonts } from "@/design/tokens";

export function ProfileScreen({ volunteer = false }: { volunteer?: boolean }) {
  const { data } = useMobile();
  const p = volunteer ? data.volunteer : data.donor;
  return (
    <Screen
      viewRole={volunteer ? "volunteer" : "donor"}
      title="Perfil"
      subtitle={volunteer ? "Vista voluntario" : "Vista donante"}
      badge={<Badge>{volunteer ? "Voluntario" : "Donante"}</Badge>}
      tabs="user"
    >
      <Card>
        <Row>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.soft,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Copy weight="bold" style={{ fontSize: 20 }}>
              {p.initials}
            </Copy>
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Copy weight="bold">{p.name}</Copy>
            <Copy tone="secondary">{p.email}</Copy>
          </View>
        </Row>
        <Copy tone="secondary">
          {volunteer ? "Voluntario activo" : "Donante desde Sep 2026"}
        </Copy>
        {volunteer && <Badge>Disponible</Badge>}
      </Card>
      <Section title={volunteer ? "Resumen operativo" : "Resumen"}>
        <Card soft>
          <Metrics
            values={
              volunteer
                ? [
                    ["18", "rutas"],
                    ["1.2 t", "transportadas"],
                    ["98%", "cumplimiento"],
                  ]
                : [
                    ["12", "donaciones"],
                    ["280 kg", "aportados"],
                    ["4", "completadas"],
                  ]
            }
          />
        </Card>
      </Section>
      <Section
        title={volunteer ? "Información de voluntario" : "Información personal"}
      >
        <Card>
          {(volunteer
            ? [
                ["Vehículo", "Camioneta"],
                ["Capacidad", "500 kg"],
                ["Cadena de frío", "Sí dispone"],
                ["Disponibilidad", "Lun–Vie · 08:00–18:00"],
                ["Zona de operación", "Bogotá y área metropolitana"],
              ]
            : [
                ["Correo electrónico", p.email],
                ["Teléfono", p.phone],
                ["Rol activo", "Donante"],
              ]
          ).map(([label, value]) => (
            <Detail key={label} label={label} value={value} />
          ))}
        </Card>
      </Section>
    </Screen>
  );
}
export function AccountScreen() {
  const { data, role, setRole } = useMobile();
  return (
    <Screen title="Perfil" subtitle="Acciones de cuenta" tabs="user" back>
      <Card>
        <Copy weight="bold" style={{ fontSize: 20 }}>
          Cuenta
        </Copy>
        <Copy weight="semibold">{data.donor.name}</Copy>
        <Copy tone="secondary">{data.donor.email}</Copy>
        <Section title="Cambiar vista">
          {(["donor", "volunteer"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: role === value }}
              onPress={() => {
                setRole(value);
                router.replace(
                  value === "donor" ? "/inicio-donante" : "/inicio",
                );
              }}
              style={{
                minHeight: 52,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  backgroundColor:
                    role === value ? colors.primary : colors.surface,
                }}
              />
              <Copy>
                Ver como {value === "donor" ? "donante" : "voluntario"}
              </Copy>
            </Pressable>
          ))}
        </Section>
        <TextLink href="/login">Cerrar sesión</TextLink>
      </Card>
      <TextLink href="/pantallas">Ver todas las pantallas</TextLink>
    </Screen>
  );
}
export function VerifyEmailScreen() {
  const [code, setCode] = useState("482");
  return (
    <Screen
      title="Verifica tu correo"
      subtitle="Confirma tu cuenta para completar el registro"
      back
    >
      <View style={{ alignItems: "center", gap: 18 }}>
        <Icon name="mail" size={40} />
        <Copy>Enviamos un código de 6 dígitos a</Copy>
        <Copy weight="bold">ma***@correo.com</Copy>
      </View>
      <Section title="Código de verificación">
        <View style={{ position: "relative" }}>
          <Row style={{ gap: 8 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Copy weight="bold" style={{ fontSize: 24 }}>
                  {code[i] || ""}
                </Copy>
              </View>
            ))}
          </Row>
          <TextInput
            accessibilityLabel="Código de verificación de seis dígitos"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.02,
              fontFamily: fonts.regular,
            }}
          />
        </View>
      </Section>
      <Copy tone="secondary" style={{ textAlign: "center" }}>
        ¿No recibiste el código?
      </Copy>
      <Copy tone="primary" style={{ textAlign: "center" }}>
        Reenviar código en 00:42
      </Copy>
      <NavButton href="/login" showArrow={false}>
        Verificar correo
      </NavButton>
      <Card soft>
        <Copy weight="semibold">¿Por qué verificamos tu correo?</Copy>
        <Copy tone="secondary">
          Necesitamos confirmar que el correo te pertenece antes de marcar tu
          usuario como verificado.
        </Copy>
      </Card>
    </Screen>
  );
}
export function RatingScreen() {
  const { data } = useMobile();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const donation = id
    ? data.donations.find((d) => d.id === id)
    : data.donations[0];
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState("");
  if (!donation) {
    return (
      <Screen title="Calificar voluntario" back>
        <Copy>Donación no encontrada.</Copy>
      </Screen>
    );
  }
  return (
    <Screen
      viewRole="donor"
      title="Calificar voluntario"
      subtitle="Tu donación fue entregada"
      back
      tabs="route"
    >
      <Card>
        <Copy weight="bold">Carlos Ruiz</Copy>
        <Copy tone="secondary">Voluntario asignado a {donation.id}</Copy>
        <Badge>Entrega completada · Hoy 18:40</Badge>
      </Card>
      <Section title="¿Cómo fue tu experiencia?">
        <Row style={{ justifyContent: "center", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${n} estrellas`}
              accessibilityState={{ checked: n === rating }}
              onPress={() => setRating(n)}
              style={{ padding: 8 }}
            >
              <Icon
                name="star"
                size={32}
                color={n <= rating ? colors.primary : colors.border}
              />
            </Pressable>
          ))}
        </Row>
        <Copy tone="secondary" style={{ textAlign: "center" }}>
          {rating} de 5 estrellas
        </Copy>
      </Section>
      <Section title="Aspectos a evaluar">
        <Row style={{ flexWrap: "wrap" }}>
          {[
            "Puntualidad",
            "Amabilidad",
            "Cuidado",
            "Comunicación",
            "Presentación",
          ].map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </Row>
      </Section>
      <Field
        label="Comentario adicional"
        value={comment}
        onChangeText={setComment}
        placeholder="Ej. Fue muy puntual y cuidadoso con la entrega."
        multiline
      />
      <NavButton href={{ pathname: "/detalle-donacion", params: { id: donation.id } }} showArrow={false}>Enviar calificación</NavButton>
      <Copy tone="secondary">
        Tu opinión ayuda a mejorar futuras asignaciones.
      </Copy>
    </Screen>
  );
}
