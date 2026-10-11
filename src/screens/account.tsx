import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { isAuthError } from "@supabase/supabase-js";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { messageFor } from "@/api/problem-messages";
import type { EstadoVerificacion, MeDto } from "@/api/types";
import type { MobileRole } from "@/auth/access";
import { resendSignupOtp, verifyEmailOtp } from "@/auth/email-auth";
import { OTP_LENGTH, otpSchema } from "@/domain/validation/auth";
import { useZodForm } from "@/hooks/use-zod-form";
import { EmptyState, QueryContent } from "@/components/findfood/feedback";
import {
  Badge,
  Chip,
  Choices,
  Card,
  Copy,
  Button,
  Detail,
  Field,
  FormMessage,
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
import { useAccess, useMe, useSession } from "@/state/session";
import { colors, fonts } from "@/design/tokens";

import { SEND_CODE, SIGN_UP_ORIGIN } from "./auth";

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
/**
 * Milliseconds after a successful send before another code can be requested; Supabase also
 * limits sends per address (60 s by default).
 */
export const RESEND_COOLDOWN_MS = 60_000;

const twoDigits = (n: number) => String(n).padStart(2, "0");

/** `01:00`, `00:42`… */
function formatCountdown(seconds: number): string {
  return `${twoDigits(Math.floor(seconds / 60))}:${twoDigits(seconds % 60)}`;
}

/**
 * Seconds left before a resend, derived from when the last code was sent (null: a resend is
 * allowed now). `codeJustSent` starts the cooldown at mount (a sign-up just sent a code).
 * A single interval ticks while the cooldown lasts and is cleared when it ends, when the code
 * is sent again, or on unmount.
 */
function useResendCooldown(codeJustSent: boolean) {
  const [clock, setClock] = useState<{ sentAt: number | null; now: number }>(() => {
    const now = Date.now();
    return { sentAt: codeJustSent ? now : null, now };
  });
  const { sentAt } = clock;
  useEffect(() => {
    if (sentAt === null) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setClock((current) => ({ ...current, now }));
      if (now >= sentAt + RESEND_COOLDOWN_MS) clearInterval(timer);
    }, 1_000);
    return () => clearInterval(timer);
  }, [sentAt]);
  const remaining =
    sentAt === null ? 0 : Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_MS - clock.now) / 1_000));
  const restart = useCallback(() => {
    const now = Date.now();
    setClock({ sentAt: now, now });
  }, []);
  const allowNow = useCallback(() => setClock((current) => ({ ...current, sentAt: null })), []);
  return { remaining, restart, allowNow };
}

function CodeBoxes({
  code,
  error,
  onChange,
}: {
  code: string;
  error: string | undefined;
  onChange: (code: string) => void;
}) {
  return (
    <Section title="Código de verificación">
      <View style={{ position: "relative" }}>
        <Row style={{ gap: 8 }}>
          {Array.from({ length: OTP_LENGTH }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 56,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: error ? colors.danger : colors.border,
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
          accessibilityHint={error}
          aria-invalid={error ? true : undefined}
          value={code}
          onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, OTP_LENGTH))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={OTP_LENGTH}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.02,
            fontFamily: fonts.regular,
          }}
        />
      </View>
      {error ? (
        <View accessibilityLiveRegion="polite">
          <Copy style={{ fontSize: 11, lineHeight: 16, color: colors.danger }}>{error}</Copy>
        </View>
      ) : null}
    </Section>
  );
}

/**
 * After a sign-up: the same words whether the address is new or already had an account
 * (Supabase sends no code then), so the screen never reveals which addresses are registered.
 */
function SignUpNote() {
  return (
    <Card soft>
      <Copy tone="secondary" style={{ fontSize: 12 }}>
        Si el correo es nuevo, te enviamos un código. Si ya tienes cuenta, inicia sesión o
        recupera tu contraseña.
      </Copy>
      <Row style={{ justifyContent: "space-between" }}>
        <TextLink href="/login" align="left">
          Iniciar sesión
        </TextLink>
        <TextLink href="/recuperar-contrasena" align="right">
          Recuperar contraseña
        </TextLink>
      </Row>
    </Card>
  );
}

interface SendState {
  sending: boolean;
  error?: string;
  sent?: boolean;
}

/**
 * How the screen was opened: right after a sign-up (Supabase sent a code: the cooldown runs
 * from the start), asked to send a code (`enviar=1`: sent on mount, the cooldown only starts
 * once it was sent), or with nothing sent (a resend is allowed right away).
 */
type Opening = "after-sign-up" | "send-code" | "nothing-sent";

function VerifyEmailForm({ email, opening }: { email: string; opening: Opening }) {
  const form = useZodForm(otpSchema, { token: "" });
  const cooldown = useResendCooldown(opening === "after-sign-up");
  const { restart } = cooldown;
  const [resend, setResend] = useState<SendState>({ sending: opening === "send-code" });
  // Sends on mount at most once, even if the effect runs twice (Strict Mode in development).
  const sentOnMount = useRef(false);

  /** Sends a code; only a successful send starts the cooldown. */
  const send = useCallback(
    (): Promise<void> =>
      resendSignupOtp(email).then(
        () => {
          restart();
          setResend({ sending: false, sent: true });
        },
        (error: unknown) => setResend({ sending: false, error: messageFor(error) }),
      ),
    [email, restart],
  );

  useEffect(() => {
    if (opening !== "send-code" || sentOnMount.current) return;
    sentOnMount.current = true;
    // `sending` already starts true for this opening; state only changes once it settles.
    // Then `enviar` is consumed: a remount or the same deep link opened again must not send
    // another code. Not right away: on a cold deep link this effect can run before the
    // navigator is ready to take a params update.
    void send().finally(() => router.setParams({ enviar: undefined }));
  }, [opening, send]);

  // On success Supabase stores the session: the guards close this screen and open the app.
  // Signed in with an unconfirmed email (verify-email phase) the session keeps its status;
  // the session provider fetches `/me` again on the SIGNED_IN event, which clears
  // CONFIRMAR_CORREO.
  const submit = form.handleSubmit(async ({ token }) => {
    try {
      await verifyEmailOtp(email, token);
    } catch (error) {
      // Supabase answers a wrong or expired code alike: a new code can be requested now.
      if (isAuthError(error) && error.code === "otp_expired") cooldown.allowNow();
      throw error;
    }
  });

  const resendCode = () => {
    if (resend.sending) return;
    setResend({ sending: true });
    void send();
  };

  const waiting = cooldown.remaining > 0;
  return (
    <>
      <View style={{ alignItems: "center", gap: 18 }}>
        <Icon name="mail" size={40} />
        <Copy>{`Ingresa el código de ${OTP_LENGTH} dígitos enviado a`}</Copy>
        <Copy weight="bold">{email}</Copy>
      </View>
      {opening === "after-sign-up" ? <SignUpNote /> : null}
      <CodeBoxes
        code={form.values.token}
        error={form.errors.token}
        onChange={(token) => form.setValue("token", token)}
      />
      <FormMessage message={form.formError} />
      <Button onPress={submit} loading={form.submitting}>
        Verificar correo
      </Button>
      <Copy tone="secondary" style={{ textAlign: "center" }}>
        ¿No recibiste el código?
      </Copy>
      <Button
        variant="outline"
        onPress={resendCode}
        loading={resend.sending}
        disabled={waiting}
      >
        {waiting ? `Reenviar código en ${formatCountdown(cooldown.remaining)}` : "Reenviar código"}
      </Button>
      <FormMessage message={resend.sending ? "Enviando un código a tu correo…" : undefined} tone="info" />
      <FormMessage message={resend.error} />
      <FormMessage
        message={resend.sent ? "Te enviamos un código nuevo." : undefined}
        tone="success"
      />
    </>
  );
}

function openingFor(params: { origen?: string; enviar?: string }, fromParam: boolean): Opening {
  if (fromParam && params.origen === SIGN_UP_ORIGIN) return "after-sign-up";
  if (fromParam && params.enviar === SEND_CODE) return "send-code";
  return "nothing-sent";
}

/**
 * `/verificar-correo?email=…[&origen=registro | &enviar=1]` (see openVerification). Without
 * the param (the gate opens it in the verify-email phase), the signed-in session's email is
 * verified instead, and nothing was sent for it.
 */
export function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string; origen?: string; enviar?: string }>();
  const session = useSession();
  const paramEmail = typeof params.email === "string" ? params.email.trim() : "";
  const sessionEmail = session.status === "present" ? (session.email?.trim() ?? "") : "";
  const email = paramEmail || sessionEmail;
  return (
    <Screen
      title="Verifica tu correo"
      subtitle="Confirma tu cuenta para completar el registro"
      back
    >
      {email ? (
        <VerifyEmailForm email={email} opening={openingFor(params, paramEmail !== "")} />
      ) : (
        <EmptyState
          icon="mail"
          title="No sabemos qué correo verificar"
          description="Inicia sesión con tu correo y contraseña: si aún no lo has confirmado, te enviaremos un código nuevo."
          action={
            <NavButton href="/login" showArrow={false}>
              Ir a iniciar sesión
            </NavButton>
          }
        />
      )}
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
