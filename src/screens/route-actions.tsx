/**
 * Actions on the volunteer's route and its stops, shared by Rutas and the accepted pickups:
 * the next stop of a route in progress (arrival, contact, detail, failed stop) and giving an
 * accepted pickup up.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";

import type { Coordenada } from "@/api/types";
import { isApiError } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";
import { CallButton } from "@/components/findfood/call-button";
import { EmptyState, QueryContent } from "@/components/findfood/feedback";
import { Pressing } from "@/components/findfood/motion";
import {
  MotivoField,
  motivoBody,
  validateMotivo,
  type MotivoSelection,
} from "@/components/findfood/motivo-field";
import {
  Badge,
  Button,
  Card,
  Copy,
  Detail,
  Field,
  FormMessage,
  NavButton,
  Row,
  Section,
  SelectField,
  TextLink,
} from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import {
  asignacionByDonacion,
  nextStop,
  pickupWindowLabel,
  stopProgress,
} from "@/domain/mappers/routes";
import {
  distanceToStop,
  getCurrentFix,
  isWithinArrivalRadius,
  needsManualConfirmation,
  type CurrentFix,
} from "@/location/current-fix";
import { useAbandonarAsignacionMutation, useOfertas } from "@/services/asignaciones";
import { useMotivos, useTiposIncidencia, type TipoIncidenciaDto } from "@/services/catalogos";
import { donacionQuery } from "@/services/donaciones";
import {
  rutaQuery,
  useConfirmarParadaMutation,
  useParadaFallidaMutation,
  useRegistrarLlegadaMutation,
  type ConfirmarParadaBody,
  type ParadaDto,
  type ParadaRutaDto,
  type RutaDetalleDto,
} from "@/services/rutas";

/**
 * Asks before an action that cannot be undone: a native alert, or the browser's dialog on
 * web (react-native-web's Alert.alert does nothing).
 */
export function confirmAction(
  { title, question, confirmLabel }: { title: string; question: string; confirmLabel: string },
  onConfirm: () => void,
) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(question)) onConfirm();
    return;
  }
  Alert.alert(title, question, [
    { text: "Volver", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

/**
 * The first open stop of a route in progress and what the volunteer can do there: arrive,
 * then register the pickup or the delivery; on pickups also call the donor, open the
 * donation, report a failed stop or give the pickup up.
 */
export function NextStop({
  ruta,
  onNotice,
}: {
  ruta: RutaDetalleDto;
  /** Shows the outcome of an action that closes this stop (the card moves on). */
  onNotice: (message: string) => void;
}) {
  const parada = nextStop(ruta.paradas);
  const queryClient = useQueryClient();
  const donacionId = parada?.tipo === "RECOGIDA" ? parada.donacion_id : null;

  // The pickup registration reads the donation's items: have them ready on arrival.
  useEffect(() => {
    if (donacionId !== null) void queryClient.prefetchQuery(donacionQuery(donacionId));
  }, [queryClient, donacionId]);

  if (parada === null) return null;
  const pickup = parada.tipo === "RECOGIDA";
  const window = pickupWindowLabel(parada.ventana_recogida_inicio, parada.ventana_recogida_fin);
  return (
    <Section title="Próxima parada">
      <Card>
        <Row style={styles.between}>
          <Copy weight="semibold" style={styles.title}>
            {pickup ? (parada.donacion_codigo ?? "Recogida") : ruta.almacen_destino.nombre}
          </Copy>
          <Badge>{stopProgress(ruta.paradas, parada)}</Badge>
        </Row>
        <Copy tone="secondary">{parada.direccion}</Copy>
        {window !== null ? (
          <Copy tone="secondary" style={styles.small}>{`Ventana: ${window}`}</Copy>
        ) : null}
        {parada.referencia_recogida !== null ? (
          <Copy tone="secondary" style={styles.small}>
            {`Referencia: ${parada.referencia_recogida}`}
          </Copy>
        ) : null}
        {pickup && parada.contacto_nombre !== null ? (
          <Detail label="Donante" value={parada.contacto_nombre} icon="user" />
        ) : null}
      </Card>
      {parada.estado === "PENDIENTE" ? (
        <ArrivalButton
          key={`llegada-${parada.id}`}
          paradaId={parada.id}
          stop={{ lat: parada.lat, lng: parada.lng }}
          label={pickup ? "Llegué al punto" : "Llegué al banco"}
        />
      ) : (
        <NavButton
          href={{
            pathname: pickup ? "/voluntario/registrar-recogida" : "/voluntario/entrega-voluntario",
            params: { paradaId: parada.id, rutaId: ruta.id },
          }}
          showArrow={false}
        >
          {pickup ? "Registrar recogida" : "Registrar entrega"}
        </NavButton>
      )}
      {/* Keyed by stop (distinct from its sibling): an open form or its text never carries over to the next stop. */}
      {pickup ? (
        <PickupActions key={`acciones-${parada.id}`} parada={parada} onNotice={onNotice} />
      ) : null}
    </Section>
  );
}

function PickupActions({
  parada,
  onNotice,
}: {
  parada: ParadaRutaDto;
  onNotice: (message: string) => void;
}) {
  // Stops only name their donation; abandoning needs the assignment from the offers.
  const { data: ofertas } = useOfertas();
  const asignacionId =
    ofertas && parada.donacion_id !== null
      ? asignacionByDonacion(ofertas).get(parada.donacion_id)
      : undefined;
  return (
    <>
      <CallButton phone={parada.contacto_telefono} label="Contactar al donante" />
      {parada.donacion_id !== null ? (
        <TextLink
          href={{ pathname: "/voluntario/detalle-donacion", params: { id: parada.donacion_id } }}
        >
          Ver detalle
        </TextLink>
      ) : null}
      <ReportFailedStop paradaId={parada.id} onNotice={onNotice} />
      {asignacionId !== undefined ? (
        <AbandonAssignment asignacionId={asignacionId} onDone={onNotice} />
      ) : null}
    </>
  );
}

/**
 * `POST /paradas/:id/llegada`. The arrival needs a fix within `ARRIVAL_RADIUS_M` of the stop:
 * without a fix or farther away nothing is sent (the API enforces the same radius).
 */
function ArrivalButton({
  paradaId,
  stop,
  label,
}: {
  paradaId: string;
  stop: Coordenada;
  label: string;
}) {
  const { mutateAsync: registrar, isPending } = useRegistrarLlegadaMutation();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string>();

  const arrive = async () => {
    setError(undefined);
    setLocating(true);
    let fix: CurrentFix | null = null;
    try {
      fix = await getCurrentFix();
    } catch {
      // `getCurrentFix` resolves null on its own; a rejection still means "no fix".
    } finally {
      setLocating(false);
    }
    if (fix === null) {
      setError("Activa tu ubicación para registrar la llegada.");
      return;
    }
    if (!isWithinArrivalRadius(fix, stop)) {
      const km = (distanceToStop(fix, stop) / 1000).toFixed(1);
      setError(`Estás a ${km} km de la parada. Acércate a menos de 1 km para registrar la llegada.`);
      return;
    }
    try {
      await registrar({ id: paradaId, body: { ubicacion: fix.ubicacion } });
    } catch (failure) {
      setError(messageFor(failure));
    }
  };

  return (
    <>
      <FormMessage message={error} />
      <Button loading={locating || isPending} onPress={() => void arrive()}>
        {label}
      </Button>
    </>
  );
}

/** Mirrors the API limits of `descripcion` on `POST /paradas/:id/fallida`. */
const DESCRIPCION_MIN = 5;
const DESCRIPCION_MAX = 2000;

const TIPO_REQUERIDO = "Selecciona el tipo de problema.";
const DESCRIPCION_CORTA = `Describe el problema con al menos ${DESCRIPCION_MIN} caracteres.`;
const DESCRIPCION_LARGA = `La descripción admite hasta ${DESCRIPCION_MAX} caracteres.`;

/** The validation message of a failed-stop report, or null when it can be sent. */
export function validateFailedStop({
  tipoId,
  descripcion,
}: {
  tipoId: string;
  descripcion: string;
}): string | null {
  if (tipoId === "") return TIPO_REQUERIDO;
  const length = descripcion.trim().length;
  if (length < DESCRIPCION_MIN) return DESCRIPCION_CORTA;
  if (length > DESCRIPCION_MAX) return DESCRIPCION_LARGA;
  return null;
}

function ReportFailedStop({
  paradaId,
  onNotice,
}: {
  paradaId: string;
  onNotice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tipos = useTiposIncidencia();
  if (!open) {
    return (
      <Button variant="outline" onPress={() => setOpen(true)}>
        Reportar problema
      </Button>
    );
  }
  return (
    <Section title="Reportar problema">
      <QueryContent
        query={tipos}
        loadingLabel="Cargando los tipos de problema"
        errorTitle="No pudimos cargar los tipos de problema"
      >
        {(lista) => (
          <FailedStopForm
            paradaId={paradaId}
            tipos={lista}
            onBack={() => setOpen(false)}
            onNotice={onNotice}
          />
        )}
      </QueryContent>
    </Section>
  );
}

/** `POST /paradas/:id/fallida` (pickups only): the stop fails and an incident opens. */
function FailedStopForm({
  paradaId,
  tipos,
  onBack,
  onNotice,
}: {
  paradaId: string;
  tipos: TipoIncidenciaDto[];
  onBack: () => void;
  onNotice: (message: string) => void;
}) {
  const { mutateAsync: reportar, isPending } = useParadaFallidaMutation();
  const [tipoId, setTipoId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    try {
      await reportar({
        id: paradaId,
        body: { tipo_incidencia_id: Number(tipoId), descripcion: descripcion.trim() },
      });
    } catch (failure) {
      setError(messageFor(failure));
      return;
    }
    onNotice("Reportamos el problema de la parada.");
    onBack();
  };

  const submit = () => {
    const invalid = validateFailedStop({ tipoId, descripcion });
    setError(invalid);
    if (invalid !== null) return;
    confirmAction(
      {
        title: "Reportar parada fallida",
        question: "La parada quedará como fallida y se abrirá una incidencia.",
        confirmLabel: "Reportar",
      },
      () => void send(),
    );
  };

  // Length problems belong to the description field; anything else goes below the form.
  const descripcionError =
    error === DESCRIPCION_CORTA || error === DESCRIPCION_LARGA ? error : undefined;
  return (
    <View style={styles.form}>
      <SelectField
        label="Tipo de problema *"
        value={tipoId}
        options={tipos.map((tipo) => ({ label: tipo.nombre, value: String(tipo.id) }))}
        onChange={setTipoId}
      />
      <Field
        label="Descripción *"
        value={descripcion}
        onChangeText={setDescripcion}
        placeholder="Cuéntanos qué pasó en el punto"
        multiline
        maxLength={DESCRIPCION_MAX}
        error={descripcionError}
      />
      <Copy tone="secondary" style={styles.counter}>
        {`${descripcion.length}/${DESCRIPCION_MAX}`}
      </Copy>
      <FormMessage message={descripcionError ? undefined : (error ?? undefined)} />
      <Button variant="danger" loading={isPending} onPress={submit}>
        Reportar parada fallida
      </Button>
      <Button variant="outline" disabled={isPending} onPress={onBack}>
        Volver
      </Button>
    </View>
  );
}

/** What the volunteer reads after giving a pickup up. */
export function abandonMessage(donacionRepublicada: boolean): string {
  return donacionRepublicada
    ? "Liberaste la recogida. La donación volvió a publicarse."
    : "Liberaste la recogida.";
}

/**
 * "No puedo hacer esta recogida" (MOV-45): gives an accepted pickup up with an
 * ABANDONO_ASIGNACION reason (`POST /asignaciones/:id/abandonar`), after a native
 * confirmation. The API refuses once the donation was picked up (`donacion-ya-recogida`).
 */
export function AbandonAssignment({
  asignacionId,
  onDone,
}: {
  asignacionId: string;
  /** Receives the outcome message (`abandonMessage`); the pickup leaves the screen. */
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return open ? (
    <AbandonForm
      asignacionId={asignacionId}
      onBack={() => setOpen(false)}
      onDone={(message) => {
        setOpen(false);
        onDone(message);
      }}
    />
  ) : (
    <Pressing
      accessibilityRole="button"
      scale={1}
      onPress={() => setOpen(true)}
      surface={styles.dangerLink}
    >
      <Copy weight="medium" style={styles.dangerText}>
        No puedo hacer esta recogida
      </Copy>
    </Pressing>
  );
}

function AbandonForm({
  asignacionId,
  onBack,
  onDone,
}: {
  asignacionId: string;
  onBack: () => void;
  onDone: (message: string) => void;
}) {
  const { data: motivos } = useMotivos("ABANDONO_ASIGNACION");
  const { mutateAsync: abandonar, isPending } = useAbandonarAsignacionMutation();
  const [selection, setSelection] = useState<MotivoSelection>({ comentario: "" });
  const [error, setError] = useState<string | null>(null);

  const send = async (motivoId: number) => {
    let republicada: boolean;
    try {
      const result = await abandonar({
        id: asignacionId,
        body: motivoBody({ ...selection, motivoId }),
      });
      republicada = result.donacion_republicada;
    } catch (failure) {
      setError(messageFor(failure));
      return;
    }
    onDone(abandonMessage(republicada));
  };

  const submit = () => {
    const invalid = validateMotivo(selection, motivos ?? []);
    setError(invalid);
    const { motivoId } = selection;
    if (invalid !== null || motivoId === undefined) return;
    confirmAction(
      {
        title: "Liberar recogida",
        question: "La recogida dejará de estar a tu cargo y la donación podrá ofrecerse a otra persona.",
        confirmLabel: "Liberar",
      },
      () => void send(motivoId),
    );
  };

  return (
    <Section title="No puedo hacer esta recogida">
      <MotivoField
        ambito="ABANDONO_ASIGNACION"
        value={selection}
        onChange={setSelection}
        error={error}
      />
      <Button variant="danger" loading={isPending} onPress={submit}>
        Confirmar abandono
      </Button>
      <Button variant="outline" disabled={isPending} onPress={onBack}>
        Volver
      </Button>
    </Section>
  );
}

/** The `?paradaId=&rutaId=` a stop screen opens with; undefined when either is missing. */
export function useStopParams(): { paradaId: string; rutaId: string } | undefined {
  const { paradaId, rutaId } = useLocalSearchParams<{ paradaId?: string; rutaId?: string }>();
  return typeof paradaId === "string" && paradaId !== "" && typeof rutaId === "string" && rutaId !== ""
    ? { paradaId, rutaId }
    : undefined;
}

/** `GET /rutas/:id`, idle without an id (the stop screens show their empty state). */
export function useStopRoute(rutaId: string | undefined) {
  return useQuery({ ...rutaQuery(rutaId ?? ""), enabled: Boolean(rutaId) });
}

/** A stop screen opened without its stop, or for a stop it cannot act on any more. */
export function StopUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      icon="truck"
      title={title}
      description={description}
      action={
        <NavButton href="/voluntario/rutas" dismissTo showArrow={false}>
          Ver mis rutas
        </NavButton>
      }
    />
  );
}

/** What each screen adds to a stop confirmation; time and location come from the hook. */
export type StopConfirmationFields = Omit<
  ConfirmarParadaBody,
  "confirmada_en_dispositivo" | "ubicacion" | "precision_m" | "confirmacion_manual"
>;

/** The location part of a confirmation: only what the device actually measured. */
function locationFields(fix: CurrentFix | null): Pick<ConfirmarParadaBody, "ubicacion" | "precision_m"> {
  if (fix === null) return {};
  return fix.precision_m !== null
    ? { ubicacion: fix.ubicacion, precision_m: fix.precision_m }
    : { ubicacion: fix.ubicacion };
}

/** Asks before confirming a stop without a fix the API accepts on its own. */
function askManualConfirmation(onConfirm: () => void) {
  confirmAction(
    {
      title: "Ubicación imprecisa",
      question:
        "La señal GPS es débil o no está disponible. ¿Confirmas que estás en el punto de la parada?",
      confirmLabel: "Confirmar sin GPS preciso",
    },
    onConfirm,
  );
}

/**
 * `POST /paradas/:id/confirmar` for the pickup and delivery screens. Captures the device
 * time when pressed, reads one fix and, when the API would refuse it (`precision-insuficiente`),
 * asks the volunteer to confirm manually first; a server refusal over precision offers the
 * same manual retry. `errorType` is the problem slug of the last failure, for screens that
 * answer a specific one (`recogidas-pendientes`).
 */
export function useConfirmStop(paradaId: string) {
  const { mutateAsync: confirmar, isPending } = useConfirmarParadaMutation();
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<{ message: string; type: string | null } | null>(null);

  const send = async (body: ConfirmarParadaBody, onDone: (parada: ParadaDto) => void) => {
    let parada: ParadaDto;
    try {
      parada = await confirmar({ id: paradaId, body });
    } catch (error) {
      if (isApiError(error) && error.type === "precision-insuficiente" && !body.confirmacion_manual) {
        askManualConfirmation(() => void send({ ...body, confirmacion_manual: true }, onDone));
        return;
      }
      setFailure({ message: messageFor(error), type: isApiError(error) ? error.type : null });
      return;
    }
    onDone(parada);
  };

  const confirm = async (fields: StopConfirmationFields, onDone: (parada: ParadaDto) => void) => {
    setFailure(null);
    const confirmada_en_dispositivo = new Date().toISOString();
    setLocating(true);
    let fix: CurrentFix | null = null;
    try {
      fix = await getCurrentFix();
    } catch {
      // `getCurrentFix` resolves null on its own; a rejection still means "no fix".
    } finally {
      setLocating(false);
    }
    const body: ConfirmarParadaBody = { confirmada_en_dispositivo, ...fields, ...locationFields(fix) };
    if (needsManualConfirmation(fix)) {
      askManualConfirmation(() => void send({ ...body, confirmacion_manual: true }, onDone));
      return;
    }
    await send(body, onDone);
  };

  return {
    confirm,
    busy: locating || isPending,
    error: failure?.message,
    errorType: failure?.type ?? null,
  };
}

const styles = StyleSheet.create({
  dangerLink: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  dangerText: { color: colors.danger, fontSize: 13 },
  between: { justifyContent: "space-between" },
  title: { flex: 1, fontSize: 17, lineHeight: 24 },
  small: { fontSize: 12 },
  form: { gap: 12 },
  counter: { fontSize: 11, textAlign: "right" },
});
