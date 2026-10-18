/**
 * Rutas (MOV-42): the volunteer's current route (in progress, else the next planned one)
 * with its map and stops, or the "Armar ruta" step from the accepted pickups.
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { messageFor } from "@/api/problem-messages";
import { ErrorState, LoadingState } from "@/components/findfood/feedback";
import { RouteMapView } from "@/components/findfood/map";
import { Badge, Button, Card, Copy, FormMessage, Row, Screen, Section } from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import { fromFechaVencimiento } from "@/domain/mappers/dates";
import { MappingError } from "@/domain/mappers/errors";
import { formatKg } from "@/domain/mappers/profile";
import { pickupWindowLabel } from "@/domain/mappers/routes";
import { paradaStatus, rutaStatus, type StatusView } from "@/domain/mappers/statuses";
import {
  useCancelarRutaMutation,
  useIniciarRutaMutation,
  type ParadaRutaDto,
  type RutaDetalleDto,
} from "@/services/rutas";

import { AcceptedPickups } from "./accepted-pickups";
import { NextStop, confirmAction } from "./route-actions";
import { useCurrentRoute } from "./route-queries";

export function ActiveRouteScreen() {
  const current = useCurrentRoute();
  const ruta = current.ruta.data;
  // The outcome of an action that removed its own control (a failed or abandoned stop).
  const [notice, setNotice] = useState<string>();
  return (
    <Screen title="Mis rutas" subtitle="Voluntario">
      <FormMessage tone="success" message={notice} />
      {ruta ? (
        <>
          <RouteDetail ruta={ruta} onNotice={setNotice} />
          <AcceptedPickups standalone={false} />
        </>
      ) : current.isError ? (
        <ErrorState
          error={current.error}
          title="No pudimos cargar tu ruta"
          onRetry={() => void current.refetch()}
        />
      ) : current.isPending ? (
        <LoadingState label="Cargando tu ruta" />
      ) : (
        <AcceptedPickups standalone />
      )}
    </Screen>
  );
}

/** `13/10/2026` from the date-only `fecha_programada`. */
function routeDate(fecha: string): string {
  try {
    return fromFechaVencimiento(fecha.slice(0, 10));
  } catch (error) {
    if (!(error instanceof MappingError)) throw error;
    return fecha.slice(0, 10);
  }
}

/** `12,4 km · 48 min · 70 kg`, skipping what the planner did not estimate. */
function routeMetrics(ruta: RutaDetalleDto): string {
  return [
    ruta.distancia_total_km === null
      ? null
      : `${String(Math.round(ruta.distancia_total_km * 10) / 10).replace(".", ",")} km`,
    ruta.duracion_estimada_min === null ? null : `${ruta.duracion_estimada_min} min`,
    ruta.peso_total_estimado_kg === null ? null : formatKg(ruta.peso_total_estimado_kg),
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

function StatusBadge({ status }: { status: StatusView }) {
  return <Badge warning={status.tone === "warning"}>{status.label}</Badge>;
}

function RouteDetail({
  ruta,
  onNotice,
}: {
  ruta: RutaDetalleDto;
  onNotice: (message: string) => void;
}) {
  const metrics = routeMetrics(ruta);
  return (
    <>
      <Card>
        <Row style={styles.between}>
          <Copy weight="bold" style={styles.code}>
            {ruta.codigo}
          </Copy>
          <StatusBadge status={rutaStatus(ruta.estado)} />
        </Row>
        <Copy tone="secondary">{`${routeDate(ruta.fecha_programada)} · ${ruta.paradas.length} paradas`}</Copy>
        {metrics !== "" ? <Copy tone="secondary">{metrics}</Copy> : null}
      </Card>
      <RouteMapView geometria={ruta.geometria} paradas={ruta.paradas} />
      {ruta.estado === "PLANIFICADA" ? <PlannedActions rutaId={ruta.id} /> : null}
      {ruta.estado === "EN_CURSO" ? <NextStop ruta={ruta} onNotice={onNotice} /> : null}
      <Section title="Paradas">
        <Card>
          {ruta.paradas.map((parada) => (
            <StopRow key={parada.id} parada={parada} destino={ruta.almacen_destino.nombre} />
          ))}
        </Card>
      </Section>
    </>
  );
}

/** Start (`POST /rutas/:id/iniciar`) or cancel (`POST /rutas/:id/cancelar`) a planned route. */
function PlannedActions({ rutaId }: { rutaId: string }) {
  const { mutateAsync: iniciar, isPending: starting } = useIniciarRutaMutation();
  const { mutateAsync: cancelar, isPending: cancelling } = useCancelarRutaMutation();
  const [error, setError] = useState<string>();

  const run = async (action: (id: string) => Promise<unknown>) => {
    setError(undefined);
    try {
      await action(rutaId);
    } catch (failure) {
      setError(messageFor(failure));
    }
  };

  const cancel = () =>
    confirmAction(
      {
        title: "Cancelar ruta",
        question: "Tus recogidas vuelven a la lista de aceptadas sin ruta.",
        confirmLabel: "Cancelar ruta",
      },
      () => void run(cancelar),
    );

  return (
    <>
      <FormMessage message={error} />
      <Button loading={starting} disabled={cancelling} onPress={() => void run(iniciar)}>
        Iniciar ruta
      </Button>
      <Button variant="outline" loading={cancelling} disabled={starting} onPress={cancel}>
        Cancelar ruta
      </Button>
    </>
  );
}

const TIPOS_PARADA = { RECOGIDA: "Recogida", ENTREGA: "Entrega" } as const;

function StopRow({ parada, destino }: { parada: ParadaRutaDto; destino: string }) {
  const window = pickupWindowLabel(parada.ventana_recogida_inicio, parada.ventana_recogida_fin);
  const title = parada.tipo === "ENTREGA" ? destino : (parada.donacion_codigo ?? "Recogida");
  return (
    <View style={styles.stop}>
      <View style={styles.order}>
        <Copy weight="bold" tone="primary">
          {String(parada.orden)}
        </Copy>
      </View>
      <View style={styles.stopText}>
        <Copy weight="semibold">{title}</Copy>
        <Copy tone="secondary">{`${TIPOS_PARADA[parada.tipo] ?? parada.tipo} · ${parada.direccion}`}</Copy>
        {window !== null ? (
          <Copy tone="secondary" style={styles.small}>{`Ventana: ${window}`}</Copy>
        ) : null}
      </View>
      <StatusBadge status={paradaStatus(parada.estado)} />
    </View>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: "space-between" },
  code: { fontSize: 20, lineHeight: 28 },
  stop: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 6 },
  order: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  stopText: { flex: 1, gap: 2 },
  small: { fontSize: 12 },
});
