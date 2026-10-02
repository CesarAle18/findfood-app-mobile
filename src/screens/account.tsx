import { useState } from "react";
import { TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Badge,
  Chip,
  Choices,
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
import {
  Animated,
  Pressing,
  enterItem,
  fadeIn,
  fadeOut,
  itemLayout,
} from "@/components/findfood/motion";
import { Metrics } from "./donor";
import { useMobile } from "@/state/mobile-context";
import { colors, fonts } from "@/design/tokens";

export function ProfileScreen({ volunteer = false }: { volunteer?: boolean }) {
  const { data, available, setAvailable, ratings } = useMobile();
  const scores = ratings[volunteer ? "volunteer" : "donor"];
  const average = (scores.reduce((sum, n) => sum + n, 0) / scores.length).toFixed(1);
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
        <Row><Icon name="star" /><Copy weight="bold">{average} / 5</Copy><Copy tone="secondary">{scores.length} calificaciones</Copy></Row>
        <Copy tone="secondary">Promedio de demostración</Copy>
        {volunteer && <Choices values={["Disponible", "No disponible"]} selected={available ? 0 : 1} onChange={i => setAvailable(i === 0)} />}
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
            <Pressing
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: role === value }}
              onPress={() => {
                setRole(value);
                router.replace(
                  value === "donor" ? "/inicio-donante" : "/inicio",
                );
              }}
              scale={1}
              surface={{
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
            </Pressing>
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
export function RatingScreen({ donor = false }: { donor?: boolean }) {
  const { data, addRating } = useMobile();
  const [aspects, setAspects] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const donation = id
    ? data.donations.find((d) => d.id === id)
    : data.donations[0];
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState("");
  if (!donation) {
    return (
      <Screen title={donor ? "Calificar donante" : "Calificar voluntario"} back>
        <Copy>Donación no encontrada.</Copy>
      </Screen>
    );
  }
  return (
    <Screen
      viewRole={donor ? "volunteer" : "donor"}
      title={donor ? "Calificar donante" : "Calificar voluntario"}
      subtitle={donor ? "Experiencia durante la recogida" : "Tu donación fue entregada"}
      back
      tabs="route"
    >
      <Card>
        <Copy weight="bold">{donor ? data.donor.name : data.volunteer.name}</Copy>
        <Copy tone="secondary">{donor ? "Donante" : "Voluntario"} · {donation.id}</Copy>
        <Badge>{donor ? "Recogida de donación" : "Entrega completada"}</Badge>
      </Card>
      <Section title="¿Cómo fue tu experiencia?">
        <Row style={{ justifyContent: "center", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressing
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${n} estrellas`}
              accessibilityState={{ checked: n === rating }}
              onPress={() => { setRating(n); if (n === 5) setAspects([]); }}
              scale={0.88}
              surface={{ minWidth: 44, minHeight: 48, alignItems: "center", justifyContent: "center" }}
            >
              <Icon
                name="star"
                size={32}
                color={n <= rating ? colors.primary : colors.border}
              />
            </Pressing>
          ))}
        </Row>
        <Copy tone="secondary" style={{ textAlign: "center" }}>
          {rating} de 5 estrellas
        </Copy>
      </Section>
      <Section title="Aspectos a evaluar">
        {rating === 5 && <Animated.View entering={fadeIn} exiting={fadeOut}><Copy tone="secondary">Con 5 estrellas solo puedes añadir un comentario.</Copy></Animated.View>}
        <Row style={{ flexWrap: "wrap" }}>
          {[
            "Puntualidad",
            "Amabilidad",
            "Cuidado",
            "Comunicación",
            "Presentación",
          ].map((t) => (
            <Chip key={t} label={t} role="checkbox" selected={aspects.includes(t)} disabled={rating === 5} onPress={() => setAspects(current => current.includes(t) ? current.filter(v => v !== t) : [...current, t])} style={{ minHeight: 44, paddingVertical: 12 }} />
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
      {submitted ? <Animated.View entering={enterItem} layout={itemLayout} style={{ gap: 24 }}>
        <Copy tone="primary">Calificación guardada en esta sesión de demostración.</Copy>
        <NavButton href={donor ? "/registrar-recogida" : { pathname: "/detalle-donacion", params: { id: donation.id } }} showArrow={false}>{donor ? "Volver a recogida" : "Volver al detalle de donación"}</NavButton>
      </Animated.View> : <Pressing accessibilityRole="button" onPress={() => { addRating(donor ? "donor" : "volunteer", rating); setSubmitted(true); }} surface={{ minHeight: 52, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Copy style={{ color: colors.surface }} weight="bold">Enviar calificación</Copy></Pressing>}
      <Copy tone="secondary">
        Tu opinión ayuda a mejorar futuras asignaciones.
      </Copy>
    </Screen>
  );
}
