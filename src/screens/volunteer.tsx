import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ApiError, isApiError } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";
import type { MeVoluntarioDto, VerificacionVoluntarioDto } from "@/api/types";
import { CallButton } from "@/components/findfood/call-button";
import { Countdown } from "@/components/findfood/countdown";
import { EmptyState, QueryContent } from "@/components/findfood/feedback";
import { LocationPicker } from "@/components/findfood/map";
import { PhotoField } from "@/components/findfood/photo-field";
import {
  MotivoField,
  motivoBody,
  validateMotivo,
  type MotivoSelection,
} from "@/components/findfood/motivo-field";
import {
  initialVolunteerRequest,
  volunteerRequestSchema,
  type VolunteerRequestForm,
} from "@/domain/volunteer-request";
import { useZodForm } from "@/hooks/use-zod-form";
import { useMotivos, useTiposVehiculo, type TipoVehiculoDto } from "@/services/catalogos";
import { useSolicitarVoluntarioMutation } from "@/services/perfil";
import { offerFromOferta, selectOffer, type OfferView } from "@/domain/mappers/offers";
import { formatKg } from "@/domain/mappers/profile";
import { acceptedWithoutRoute } from "@/domain/mappers/routes";
import { queryKeys } from "@/services/query-keys";
import {
  useAceptarOfertaMutation,
  useOfertas,
  useRechazarOfertaMutation,
} from "@/services/asignaciones";
import { useAccess, useMe } from "@/state/session";
import { StyleSheet, View } from "react-native";
import {
  Badge,
  Button,
  Card,
  Choices,
  Copy,
  Detail,
  Field,
  FormMessage,
  SelectField,
  NavButton,
  Row,
  Screen,
  Section,
  Stack,
} from "@/components/findfood/ui";
import { colors } from "@/design/tokens";

import { useDonationId } from "./donation-queries";
import { AbandonAssignment } from "./route-actions";

/**
 * The catalog vehicle types, keyed by their id as text (the select's value); the request
 * sends it back as the numeric `tipo_vehiculo_id`.
 */
export function vehicleTypeOptions(tipos: readonly TipoVehiculoDto[]) {
  return tipos.map((tipo) => ({ label: tipo.nombre, value: String(tipo.id) }));
}

/**
 * Registro voluntario (MOV-38): the request form, or the state of the last request from
 * `GET /me` (`voluntario.estado_verificacion`). A pending request cannot be sent again; a
 * rejected one shows why and allows a new request.
 */
export function VolunteerRegistrationScreen() {
  const me = useMe();
  return (
    <Screen
      title="Registro como voluntario"
      subtitle="Completa la información para postularte."
      back
    >
      <QueryContent
        query={me}
        loadingLabel="Cargando tu cuenta"
        errorTitle="No pudimos cargar tu cuenta"
      >
        {(account) => <VolunteerRequest voluntario={account.voluntario} />}
      </QueryContent>
    </Screen>
  );
}

function VolunteerRequest({ voluntario }: { voluntario: MeVoluntarioDto | null }) {
  // Sent from this screen: pending at once, while `/me` refreshes.
  const [sent, setSent] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const estado = voluntario?.estado_verificacion;
  if (sent || estado === "PENDIENTE") return <RequestPending />;
  if (estado === "APROBADA") return <RequestApproved />;
  if (estado === "RECHAZADA" && !retrying) {
    return (
      <RequestRejected
        verificacion={voluntario?.verificacion ?? null}
        onRetry={() => setRetrying(true)}
      />
    );
  }
  return <VolunteerRequestFormView onSent={() => setSent(true)} />;
}

function RequestPending() {
  return (
    <>
      <Card soft>
        <Badge warning>En revisión</Badge>
        <Copy weight="bold" style={{ fontSize: 18 }}>
          Tu solicitud está en revisión
        </Copy>
        <Copy tone="secondary">
          Revisaremos tus datos y documentos. Te avisaremos cuando tengamos una respuesta.
        </Copy>
      </Card>
      <NavButton href="/donante" dismissTo showArrow={false}>
        Volver al inicio
      </NavButton>
    </>
  );
}

function RequestApproved() {
  const { canVolunteer, setActiveRole } = useAccess();
  return (
    <>
      <Card soft>
        <Badge>Aprobada</Badge>
        <Copy weight="bold" style={{ fontSize: 18 }}>
          Ya eres voluntario
        </Copy>
        <Copy tone="secondary">
          {canVolunteer
            ? "Tu solicitud fue aprobada. Cambia al modo voluntario para recibir ofertas."
            : "Tu solicitud fue aprobada. Pronto podrás usar el modo voluntario desde tu perfil."}
        </Copy>
      </Card>
      {canVolunteer ? (
        <Button
          onPress={() => {
            setActiveRole("VOLUNTARIO");
            // Only the volunteer view stays in the history, as when switching from Perfil.
            router.dismissAll();
            router.replace("/voluntario");
          }}
        >
          Ir al modo voluntario
        </Button>
      ) : null}
    </>
  );
}

function RequestRejected({
  verificacion,
  onRetry,
}: {
  verificacion: VerificacionVoluntarioDto | null;
  onRetry: () => void;
}) {
  return (
    <>
      <Card soft>
        <Badge warning>Rechazada</Badge>
        <Copy weight="bold" style={{ fontSize: 18 }}>
          Tu solicitud no fue aprobada
        </Copy>
        {verificacion?.motivo ? (
          <Copy tone="secondary">{`Motivo: ${verificacion.motivo}`}</Copy>
        ) : null}
        {verificacion?.observacion ? (
          <Copy tone="secondary">{verificacion.observacion}</Copy>
        ) : null}
        <Copy tone="secondary">Puedes corregir tus datos y enviar una nueva solicitud.</Copy>
      </Card>
      <Button onPress={onRetry}>Enviar una nueva solicitud</Button>
    </>
  );
}

/** `archivo-invalido` and `archivo-no-subido` name the photo in `campo`: show it there. */
function onPhotoField(error: unknown): unknown {
  if (!isApiError(error) || !error.type.startsWith("archivo-")) return error;
  const { campo } = error.extensions;
  if (typeof campo !== "string") return error;
  return new ApiError({
    type: error.type,
    status: error.status,
    title: error.title,
    detail: error.detail,
    instance: error.instance,
    extensions: error.extensions,
    fields: { [campo]: [messageFor(error)] },
  });
}

const REFRIGERATION = ["Sí, dispone", "No dispone"];
const GROUP = ["A título personal", "Con una organización"];

function VolunteerRequestFormView({ onSent }: { onSent: () => void }) {
  // Read once: the age is checked against the day the form was opened.
  const [schema] = useState(() => volunteerRequestSchema(Date.now()));
  const form = useZodForm(schema, initialVolunteerRequest);
  const { values, errors } = form;
  const tiposVehiculo = useTiposVehiculo();
  const { mutateAsync: solicitar } = useSolicitarVoluntarioMutation();
  const setPhoto =
    (name: keyof Pick<
      VolunteerRequestForm,
      "documento_frente" | "documento_reverso" | "selfie" | "url_foto_vehiculo"
    >) =>
    ({ ruta }: { ruta: string }) =>
      form.setValue(name, ruta);

  // API field errors (400 `validacion`, 422 `archivo-*`) land on their fields; conflicts
  // (`placa-registrada`, `solicitud-en-curso`…) show below the form, through useZodForm.
  const submit = form.handleSubmit(async (body) => {
    try {
      await solicitar(body);
    } catch (error) {
      throw onPhotoField(error);
    }
    onSent();
  });

  return (
    <>
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
                value={values.tipo_vehiculo_id}
                onChange={(value) => form.setValue("tipo_vehiculo_id", value)}
                options={vehicleTypeOptions(tipos)}
              />
            )}
          </QueryContent>
          <FormMessage message={errors.tipo_vehiculo_id} />
          <Field
            label="Placa *"
            {...form.field("placa_vehiculo")}
            placeholder="ABC123"
            autoCapitalize="characters"
            maxLength={12}
          />
          <Row style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Capacidad de carga (kg) *"
                {...form.field("capacidad_carga_kg")}
                placeholder="500"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Volumen (m³)"
                {...form.field("capacidad_volumen_m3")}
                placeholder="Opcional"
                keyboardType="decimal-pad"
              />
            </View>
          </Row>
          <Copy weight="medium" style={{ fontSize: 12 }}>
            Cadena de frío
          </Copy>
          <Choices
            values={REFRIGERATION}
            selected={values.tiene_refrigeracion ? 0 : 1}
            onChange={(index) => form.setValue("tiene_refrigeracion", index === 0)}
          />
          <Section title="Foto vehículo *">
            <PhotoField
              label="Vehículo"
              mode="file"
              proposito="VEHICULO"
              compact
              onUploaded={setPhoto("url_foto_vehiculo")}
            />
            <FormMessage message={errors.url_foto_vehiculo} />
          </Section>
        </Stack>
      </Section>
      <Section title="Datos personales">
        <Stack>
          <Field
            label="Fecha de nacimiento *"
            {...form.field("fecha_nacimiento")}
            placeholder="DD/MM/AAAA"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            accessibilityHint="Debes tener al menos 18 años."
          />
          <Copy weight="medium" style={{ fontSize: 12 }}>
            ¿Cómo te registras?
          </Copy>
          <Choices
            values={GROUP}
            selected={values.es_grupo ? 1 : 0}
            onChange={(index) => form.setValue("es_grupo", index === 1)}
          />
          {values.es_grupo ? (
            <Field
              label="Organización *"
              {...form.field("organizacion")}
              placeholder="Nombre de la organización"
              autoCapitalize="words"
              maxLength={150}
            />
          ) : null}
        </Stack>
      </Section>
      <Section title="Zona de cobertura">
        <Stack>
          <Copy tone="secondary">Mueve el mapa hasta el punto desde el que sueles salir.</Copy>
          <LocationPicker
            value={values.ubicacion_base}
            onChange={(point) => form.setValue("ubicacion_base", point)}
          />
          <FormMessage message={errors.ubicacion_base} />
          <Field
            label="Radio de cobertura (km)"
            {...form.field("radio_cobertura_km")}
            placeholder="10"
            keyboardType="decimal-pad"
          />
        </Stack>
      </Section>
      <Section title="Documento de identidad">
        <Stack>
          <Row style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <PhotoField
                label="Documento (frente) *"
                mode="file"
                proposito="DOCUMENTO_IDENTIDAD"
                compact
                onUploaded={setPhoto("documento_frente")}
              />
            </View>
            <View style={{ flex: 1 }}>
              <PhotoField
                label="Documento (reverso)"
                mode="file"
                proposito="DOCUMENTO_IDENTIDAD"
                compact
                onUploaded={setPhoto("documento_reverso")}
              />
            </View>
          </Row>
          <FormMessage message={errors.documento_frente ?? errors.documento_reverso} />
          <PhotoField
            label="Selfie"
            mode="file"
            proposito="DOCUMENTO_IDENTIDAD"
            compact
            onUploaded={setPhoto("selfie")}
          />
          <FormMessage message={errors.selfie} />
        </Stack>
      </Section>
      <FormMessage message={form.formError} />
      <Button onPress={() => void submit()} loading={form.submitting}>
        Enviar solicitud
      </Button>
    </>
  );
}
/**
 * A live offer, opened from its push or inbox row with `?asignacionId=`. Without one, the
 * first offer still waiting for an answer. An offer no longer listed (expired, taken or
 * already rejected) says so instead of showing stale data. While the screen is open the
 * offers are polled, and the countdown disables accepting at `expira_at`; the server stays
 * the authority (`oferta-vencida`).
 */
export function OfferScreen() {
  const { asignacionId } = useLocalSearchParams<{ asignacionId?: string }>();
  const requestedId = typeof asignacionId === "string" && asignacionId !== "" ? asignacionId : undefined;
  // A stack leaf (nothing opens on top of it), so mounted means visible; TanStack pauses
  // the polling while the app is in the background.
  const ofertas = useOfertas({ live: true });
  const oferta = ofertas.data ? selectOffer(ofertas.data, requestedId) : null;
  const offer = oferta ? offerFromOferta(oferta) : null;
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const capacityKg = me?.voluntario?.capacidad_carga_kg ?? null;
  // The id of the offer whose countdown reached zero (another offer starts unexpired).
  const [expiredId, setExpiredId] = useState<string | null>(null);
  const expired = offer !== null && expiredId === offer.id;

  const onExpire = () => {
    if (offer === null) return;
    setExpiredId(offer.id);
    // The API drops expired offers: the list answers whether it is really gone.
    void queryClient.invalidateQueries({ queryKey: queryKeys.asignaciones.ofertas() });
  };

  return (
    <Screen
      title="Nueva oferta"
      subtitle="Voluntario"
      badge={
        offer && !offer.accepted ? (
          <Countdown key={offer.id} expiresAt={offer.expiresAtIso} onExpire={onExpire} />
        ) : null
      }
    >
      <QueryContent query={ofertas} loadingLabel="Cargando la oferta">
        {(rows) =>
          offer ? (
            <OfferDetails
              offer={offer}
              expired={expired}
              capacityKg={capacityKg}
              acceptedKg={acceptedWithoutRoute(rows).reduce(
                (total, row) => total + row.peso_estimado_kg,
                0,
              )}
            />
          ) : (
            <EmptyState
              icon="truck"
              title={requestedId ? "Esta oferta ya no está disponible" : "No tienes ofertas pendientes"}
              description={
                requestedId
                  ? "Pudo expirar o asignarse a otro voluntario."
                  : "Te avisaremos cuando haya una donación cerca de ti."
              }
              action={
                <NavButton href="/voluntario" dismissTo showArrow={false}>
                  Volver al inicio
                </NavButton>
              }
            />
          )
        }
      </QueryContent>
    </Screen>
  );
}

/** "45 kg de tu capacidad de 500 kg", or the weight alone while the capacity is unknown. */
function loadDisplay(weightKg: number, capacityKg: number | null): string {
  return capacityKg === null
    ? formatKg(weightKg)
    : `${formatKg(weightKg)} de tu capacidad de ${formatKg(capacityKg)}`;
}

function OfferDetails({
  offer,
  expired,
  capacityKg,
  acceptedKg,
}: {
  offer: OfferView;
  /** The countdown reached `expira_at`: accepting would answer `oferta-vencida`. */
  expired: boolean;
  capacityKg: number | null;
  /** Estimated weight of the accepted pickups still waiting for a route. */
  acceptedKg: number;
}) {
  const [rejecting, setRejecting] = useState(false);
  const { mutateAsync: aceptar, isPending: accepting } = useAceptarOfertaMutation();
  const [error, setError] = useState<string>();
  // One route carries the accepted pickups: more than the vehicle holds ends in
  // `excede-capacidad` when the route is created.
  const overCapacity =
    !offer.accepted && capacityKg !== null && offer.weightKg + acceptedKg > capacityKg;

  const accept = async () => {
    setError(undefined);
    try {
      await aceptar(offer.id);
    } catch (failure) {
      setError(messageFor(failure));
      return;
    }
    router.dismissTo("/voluntario/rutas");
  };

  return (
    <>
      <Card>
        <Copy weight="bold" style={styles.offerCode}>
          {offer.code}
        </Copy>
        <Copy weight="medium">{offer.title}</Copy>
        <Copy tone="secondary">{offer.summary}</Copy>
        <Copy tone="secondary">{`Ventana: ${offer.pickupWindow}`}</Copy>
      </Card>
      <Section title="Información para decidir">
        <Card>
          <Detail label="Recogida" value={offer.address} icon="pin" />
          {offer.distance !== null ? (
            <>
              <View style={styles.divider} />
              <Detail label="Distancia" value={offer.distance} icon="truck" />
            </>
          ) : null}
          <View style={styles.divider} />
          <Detail label="Peso" value={loadDisplay(offer.weightKg, capacityKg)} icon="box" />
          <View style={styles.divider} />
          <Detail label="Responde antes de" value={offer.expiresAt} icon="clock" />
        </Card>
        <FormMessage
          tone="info"
          message={
            overCapacity
              ? "Con tus recogidas aceptadas superarías tu capacidad para una sola ruta"
              : undefined
          }
        />
      </Section>
      {offer.products.length > 0 ? (
        <Section title="Productos">
          <Card>
            {offer.products.map((product) => (
              <Copy key={product} tone="secondary">
                {product}
              </Copy>
            ))}
          </Card>
        </Section>
      ) : null}
      {offer.accepted ? (
        <>
          <Section title="Contacto del donante">
            <Card>
              {offer.contactName !== null ? (
                <Detail label="Donante" value={offer.contactName} icon="user" />
              ) : null}
              <CallButton phone={offer.contactPhone} label="Contactar al donante" />
            </Card>
          </Section>
          <AbandonAssignment
            asignacionId={offer.id}
            onDone={() => router.dismissTo("/voluntario")}
          />
          <NavButton href="/voluntario/rutas" dismissTo showArrow={false}>
            Ver mis rutas
          </NavButton>
        </>
      ) : rejecting ? (
        <RejectOffer asignacionId={offer.id} onBack={() => setRejecting(false)} />
      ) : (
        <>
          <FormMessage message={expired ? "Esta oferta venció" : error} />
          <Row>
            <View style={styles.flex}>
              <Button
                variant="outline"
                disabled={accepting || expired}
                onPress={() => setRejecting(true)}
              >
                Rechazar
              </Button>
            </View>
            <View style={styles.flex}>
              <Button loading={accepting} disabled={expired} onPress={() => void accept()}>
                Aceptar
              </Button>
            </View>
          </Row>
          <Copy tone="secondary" style={styles.footnote}>
            Al aceptar, podrás armar tu ruta con tus recogidas aceptadas.
          </Copy>
        </>
      )}
    </>
  );
}

/** Rejects the offer with a RECHAZO_ASIGNACION reason (`POST /asignaciones/:id/rechazar`). */
function RejectOffer({ asignacionId, onBack }: { asignacionId: string; onBack: () => void }) {
  const { data: motivos } = useMotivos("RECHAZO_ASIGNACION");
  const { mutateAsync: rechazar, isPending } = useRechazarOfertaMutation();
  const [selection, setSelection] = useState<MotivoSelection>({ comentario: "" });
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const invalid = validateMotivo(selection, motivos ?? []);
    setError(invalid);
    const { motivoId } = selection;
    if (invalid !== null || motivoId === undefined) return;
    try {
      await rechazar({ id: asignacionId, body: motivoBody({ ...selection, motivoId }) });
    } catch (failure) {
      setError(messageFor(failure));
      return;
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
        <PhotoField label="Evidencia fotográfica" mode="evidence" proposito="EVIDENCIA" tipo="RECOGIDA" />
      </Section>
      <Field label="Observaciones" value={notes} onChangeText={setNotes} placeholder="Describe el estado del producto" multiline />
      <NavButton href={{ pathname: "/voluntario/calificar-donante", params: { id } }} showArrow={false}>Calificar donante</NavButton>
      <NavButton href="/voluntario/rutas" dismissTo showArrow={false}>
        Confirmar recogida
      </NavButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  offerCode: { fontSize: 20, lineHeight: 28 },
  divider: { height: 1, backgroundColor: colors.border },
  footnote: { fontSize: 11, textAlign: "center" },
});
