/**
 * Actions on the volunteer's route and its stops, shared by Rutas and the accepted pickups:
 * the next stop of a route in progress (arrival, contact, detail, failed stop) and giving an
 * accepted pickup up.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";

import { messageFor } from "@/api/problem-messages";
import { CallButton } from "@/components/findfood/call-button";
import { QueryContent } from "@/components/findfood/feedback";
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
import { getCurrentFix } from "@/location/current-fix";
import { useAbandonarAsignacionMutation, useOfertas } from "@/services/asignaciones";
import { useMotivos, useTiposIncidencia, type TipoIncidenciaDto } from "@/services/catalogos";
import { donacionQuery } from "@/services/donaciones";
import {
  useParadaFallidaMutation,
  useRegistrarLlegadaMutation,
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
        <ArrivalButton paradaId={parada.id} label={pickup ? "Llegué al punto" : "Llegué al banco"} />
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
      {pickup ? <PickupActions parada={parada} onNotice={onNotice} /> : null}
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
 * `POST /paradas/:id/llegada`. The position is best effort: it goes only when the device has
 * a fix, and the arrival never waits on a missing permission.
 */
function ArrivalButton({ paradaId, label }: { paradaId: string; label: string }) {
  const { mutateAsync: registrar, isPending } = useRegistrarLlegadaMutation();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string>();

  const arrive = async () => {
    setError(undefined);
    setLocating(true);
    const fix = await getCurrentFix();
    setLocating(false);
    try {
      await registrar({ id: paradaId, body: fix ? { ubicacion: fix.ubicacion } : {} });
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
    <AbandonForm asignacionId={asignacionId} onBack={() => setOpen(false)} onDone={onDone} />
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

const styles = StyleSheet.create({
  dangerLink: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  dangerText: { color: colors.danger, fontSize: 13 },
  between: { justifyContent: "space-between" },
  title: { flex: 1, fontSize: 17, lineHeight: 24 },
  small: { fontSize: 12 },
  form: { gap: 12 },
  counter: { fontSize: 11, textAlign: "right" },
});
