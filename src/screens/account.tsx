import { useState, type PropsWithChildren } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { router, type Href } from "expo-router";
import type { EstadoVerificacion, MeDto } from "@/api/types";
import type { MobileRole } from "@/auth/access";
import { EmptyState, QueryContent } from "@/components/findfood/feedback";
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
import { assignedVolunteerFromDetalle } from "@/domain/mappers/donations";
import {
  formatFranjas,
  formatKg,
  formatRating,
  profileFromMe,
} from "@/domain/mappers/profile";
import { useImpacto } from "@/services/perfil";
import { useMobile } from "@/state/mobile-context";
import { useAccess, useMe } from "@/state/session";
import { colors, fonts } from "@/design/tokens";

import {
  useDonationDetail,
  useDonationId,
  type DonationDetail,
} from "./donation-queries";
import { Metrics } from "./donor";

const VERIFICATION: Record<EstadoVerificacion, string> = {
  NO_INICIADA: "Verificación sin iniciar",
  PENDIENTE: "Verificación en revisión",
  APROBADA: "Voluntario verificado",
  RECHAZADA: "Verificación rechazada",
};

function ProfileCard({
  me,
  caption,
  average,
  children,
}: PropsWithChildren<{ me: MeDto; caption: string; average: number | null }>) {
  const profile = profileFromMe(me);
  return (
    <Card>
      <Row>
        <View style={styles.avatar}>
          <Copy weight="bold" style={{ fontSize: 20 }}>
            {profile.initials}
          </Copy>
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Copy weight="bold">{profile.name}</Copy>
          <Copy tone="secondary">{profile.email}</Copy>
        </View>
      </Row>
      <Copy tone="secondary">{caption}</Copy>
      <Row>
        <Icon name="star" />
        <Copy weight="bold">{formatRating(average)}</Copy>
      </Row>
      {children}
    </Card>
  );
}

function Details({ rows }: { rows: [string, string][] }) {
  return (
    <Card>
      {rows.map(([label, value]) => (
        <Detail key={label} label={label} value={value} />
      ))}
    </Card>
  );
}

/** `GET /me/impacto` as metrics; an empty state for a role without impact data yet. */
function ImpactMetrics({ volunteer }: { volunteer: boolean }) {
  const impacto = useImpacto();
  return (
    <QueryContent
      query={impacto}
      loadingLabel="Cargando tu impacto"
      errorTitle="No pudimos cargar tu impacto"
    >
      {({ donante, voluntario }) => {
        const values: [string, string][] | null = volunteer
          ? voluntario && [
              [String(voluntario.total_entregas), "entregas"],
              [formatKg(voluntario.total_kg_transportados), "transportados"],
              [String(voluntario.recolecciones_completadas), "recogidas"],
            ]
          : donante && [
              [String(donante.total_donaciones), "donaciones"],
              [formatKg(donante.total_kg_donados), "aportados"],
              [String(donante.donaciones_entregadas), "entregadas"],
            ];
        return values ? (
          <Card soft>
            <Metrics values={values} />
          </Card>
        ) : (
          <EmptyState
            title="Aún no hay datos de impacto"
            description="Aparecerán cuando completes tu primera entrega."
          />
        );
      }}
    </QueryContent>
  );
}

function DonorProfile({ me }: { me: MeDto }) {
  const profile = profileFromMe(me);
  return (
    <>
      <ProfileCard
        me={me}
        caption="Donante"
        average={me.donante?.calificacion_promedio ?? null}
      />
      <Section title="Resumen">
        <ImpactMetrics volunteer={false} />
      </Section>
      <Section title="Información personal">
        <Details
          rows={[
            ["Correo electrónico", profile.email],
            ["Teléfono", profile.phone],
            ["Rol activo", "Donante"],
          ]}
        />
      </Section>
    </>
  );
}

function VolunteerProfile({ me }: { me: MeDto }) {
  const { available, setAvailable } = useMobile();
  const voluntario = me.voluntario;
  if (!voluntario) {
    return (
      <EmptyState
        icon="truck"
        title="Aún no tienes perfil de voluntario"
        description="Completa tu registro como voluntario para recibir ofertas de recogida."
      />
    );
  }
  return (
    <>
      <ProfileCard
        me={me}
        caption={VERIFICATION[voluntario.estado_verificacion] ?? "Voluntario"}
        average={voluntario.calificacion_promedio}
      >
        {/* TODO(F3): persist with PATCH /voluntario/estado (useCambiarDisponibleMutation). */}
        <Choices
          values={["Disponible", "No disponible"]}
          selected={available ? 0 : 1}
          onChange={(i) => setAvailable(i === 0)}
        />
      </ProfileCard>
      <Section title="Resumen operativo">
        <ImpactMetrics volunteer />
      </Section>
      <Section title="Información de voluntario">
        <Details
          rows={[
            ["Vehículo", voluntario.tipo_vehiculo.nombre],
            ["Placa", voluntario.placa_vehiculo],
            ["Capacidad", formatKg(voluntario.capacidad_carga_kg)],
            ["Cadena de frío", voluntario.tiene_refrigeracion ? "Sí dispone" : "No dispone"],
            ["Disponibilidad", formatFranjas(voluntario.disponibilidad)],
            ["Zona de operación", `Hasta ${voluntario.radio_cobertura_km} km de tu base`],
          ]}
        />
      </Section>
    </>
  );
}

export function ProfileScreen({ volunteer = false }: { volunteer?: boolean }) {
  const me = useMe();
  return (
    <Screen
      title="Perfil"
      subtitle={volunteer ? "Vista voluntario" : "Vista donante"}
      badge={<Badge>{volunteer ? "Voluntario" : "Donante"}</Badge>}
    >
      <QueryContent
        query={me}
        loadingLabel="Cargando tu perfil"
        errorTitle="No pudimos cargar tu perfil"
      >
        {(account) =>
          volunteer ? <VolunteerProfile me={account} /> : <DonorProfile me={account} />
        }
      </QueryContent>
    </Screen>
  );
}
/** The views an account can switch between, one per mobile role it has. */
const VIEWS = [
  { role: "DONANTE", label: "Ver como donante", home: "/donante" },
  { role: "VOLUNTARIO", label: "Ver como voluntario", home: "/voluntario" },
] as const satisfies readonly { role: MobileRole; label: string; home: Href }[];

function AccountIdentity({ me }: { me: MeDto }) {
  const { name, email } = profileFromMe(me);
  return (
    <>
      <Copy weight="semibold">{name}</Copy>
      <Copy tone="secondary">{email}</Copy>
    </>
  );
}

export function AccountScreen() {
  const me = useMe();
  const { activeRole, canDonor, canVolunteer, setActiveRole } = useAccess();
  const views = VIEWS.filter(({ role }) =>
    role === "DONANTE" ? canDonor : canVolunteer,
  );
  return (
    <Screen title="Perfil" subtitle="Acciones de cuenta" back>
      <Card>
        <Copy weight="bold" style={{ fontSize: 20 }}>
          Cuenta
        </Copy>
        <QueryContent query={me} loadingLabel="Cargando tu cuenta">
          {(account) => <AccountIdentity me={account} />}
        </QueryContent>
        <Section title="Cambiar vista">
          {views.map(({ role, label, home }) => (
            <Pressing
              key={role}
              accessibilityRole="radio"
              accessibilityState={{ checked: activeRole === role }}
              onPress={() => {
                setActiveRole(role);
                // Only the chosen view stays in the history: back never returns to the
                // other role's screens.
                router.dismissAll();
                router.replace(home);
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
                    activeRole === role ? colors.primary : colors.surface,
                }}
              />
              <Copy>{label}</Copy>
            </Pressing>
          ))}
        </Section>
        <TextLink href="/login">Cerrar sesión</TextLink>
      </Card>
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
/** Who rates: the donor rates the volunteer, the volunteer rates the donor. */
export type Rater = Extract<MobileRole, "DONANTE" | "VOLUNTARIO">;

const RATING_COPY = {
  DONANTE: {
    title: "Calificar voluntario",
    subtitle: "Tu donación fue entregada",
    rated: "Voluntario",
    badge: "Entrega completada",
    missing: "Esta donación aún no tiene un voluntario asignado.",
  },
  VOLUNTARIO: {
    title: "Calificar donante",
    subtitle: "Experiencia durante la recogida",
    rated: "Donante",
    badge: "Recogida de donación",
    missing: "Los datos del donante estarán disponibles cuando aceptes la oferta.",
  },
} as const satisfies Record<Rater, Record<string, string>>;

/** The rated party's name: the assigned volunteer, or the donation's contact. */
function ratedName(dto: DonationDetail["dto"], rater: Rater): string | null {
  if (rater === "DONANTE") return assignedVolunteerFromDetalle(dto)?.name ?? null;
  return dto.contacto?.nombre ?? null;
}

export function RatingScreen({ rater = "DONANTE" }: { rater?: Rater }) {
  const [aspects, setAspects] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState("");
  const id = useDonationId();
  const detail = useDonationDetail(id);
  const copy = RATING_COPY[rater];
  if (!id || !detail.data) {
    return (
      <Screen title={copy.title} back>
        {id ? (
          <QueryContent query={detail} loadingLabel="Cargando la donación">
            {() => null}
          </QueryContent>
        ) : (
          <EmptyState
            title="No encontramos la donación"
            description="Abre la calificación desde el detalle de la donación."
          />
        )}
      </Screen>
    );
  }
  const name = ratedName(detail.data.dto, rater);
  if (!name) {
    return (
      <Screen title={copy.title} back>
        <EmptyState icon="user" title="Aún no puedes calificar" description={copy.missing} />
      </Screen>
    );
  }
  const donation = detail.data.view;
  return (
    <Screen title={copy.title} subtitle={copy.subtitle} back>
      <Card>
        <Copy weight="bold">{name}</Copy>
        <Copy tone="secondary">{copy.rated} · {donation.code}</Copy>
        <Badge>{copy.badge}</Badge>
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
        {/* Nothing is stored yet: the rating is only sent once the TODO(F3) below lands. */}
        <Copy tone="primary">El envío de calificaciones estará disponible próximamente.</Copy>
        <NavButton href={rater === "VOLUNTARIO" ? { pathname: "/voluntario/registrar-recogida", params: { id: donation.id } } : { pathname: "/donante/detalle-donacion", params: { id: donation.id } }} dismissTo showArrow={false}>{rater === "VOLUNTARIO" ? "Volver a recogida" : "Volver al detalle de donación"}</NavButton>
      </Animated.View> : (
        // TODO(F3): send it with useCalificarAsignacionMutation (POST /asignaciones/:id/calificacion).
        <Pressing accessibilityRole="button" onPress={() => setSubmitted(true)} surface={{ minHeight: 52, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Copy style={{ color: colors.surface }} weight="bold">Enviar calificación</Copy></Pressing>
      )}
      <Copy tone="secondary">
        Tu opinión ayuda a mejorar futuras asignaciones.
      </Copy>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.soft,
    justifyContent: "center",
    alignItems: "center",
  },
});
