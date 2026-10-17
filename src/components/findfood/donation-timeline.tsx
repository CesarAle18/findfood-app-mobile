/**
 * The state history of a donation (`GET /donaciones/:id/historial`) as a timeline: the
 * donation, its assignments, stops and incidents, oldest first.
 */
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import type { EstadoAsignacion, EstadoDonacion, EstadoParada, EstadoRuta } from "@/api/types";
import { Copy, Row, Stack } from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import { fromIsoToBogota } from "@/domain/mappers/dates";
import { MappingError } from "@/domain/mappers/errors";
import {
  asignacionStatus,
  donacionStatus,
  paradaStatus,
  rutaStatus,
} from "@/domain/mappers/statuses";
import {
  useHistorialDonacion,
  type AmbitoHistorial,
  type HistorialEstadoDto,
} from "@/services/donaciones";

export interface HistoryEntry {
  id: number;
  title: string;
  /** `DD/MM/AAAA · HH:mm` in Bogotá, or null when unreadable. */
  at: string | null;
  /** Who made the change, when the API names them. */
  by: string | null;
  motivo: string | null;
}

/** "EN_REVISION" → "En revision", for scopes without a label table. */
function humanize(value: string): string {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SCOPE_LABELS: Record<Exclude<AmbitoHistorial, "DONACION">, string> = {
  ASIGNACION: "Asignación",
  PARADA: "Recogida",
  RUTA: "Ruta",
  INCIDENCIA: "Incidencia",
  LOTE: "Lote",
};

function stateLabel(ambito: AmbitoHistorial, estado: string): string {
  // The API sends each scope's own enum; unknown values get a neutral label.
  if (ambito === "DONACION") return donacionStatus(estado as EstadoDonacion).label;
  if (ambito === "ASIGNACION") return asignacionStatus(estado as EstadoAsignacion).label;
  if (ambito === "PARADA") return paradaStatus(estado as EstadoParada).label;
  if (ambito === "RUTA") return rutaStatus(estado as EstadoRuta).label;
  return humanize(estado);
}

function entryTime(iso: string): string | null {
  try {
    const { date, time } = fromIsoToBogota(iso);
    return `${date} · ${time}`;
  } catch (error) {
    if (!(error instanceof MappingError)) throw error;
    return null;
  }
}

const timeOf = (iso: string) => Date.parse(iso) || 0;

/** The rows as timeline entries, oldest first. */
export function historyEntries(historial: readonly HistorialEstadoDto[]): HistoryEntry[] {
  return [...historial]
    .sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at))
    .map((row) => {
      const label = stateLabel(row.ambito, row.estado_nuevo);
      return {
        id: row.id,
        title: row.ambito === "DONACION" ? label : `${SCOPE_LABELS[row.ambito] ?? humanize(row.ambito)}: ${label}`,
        at: entryTime(row.created_at),
        by: row.usuario_nombres,
        motivo: row.motivo,
      };
    });
}

const EMPTY: HistorialEstadoDto[] = [];

/** The history of one donation; its failure only affects this block, never the screen. */
export const DonationTimeline = memo(function DonationTimeline({
  donationId,
}: {
  donationId: string;
}) {
  const { data = EMPTY, isPending, isError } = useHistorialDonacion(donationId);
  const entries = useMemo(() => historyEntries(data), [data]);
  if (isPending) return <Copy tone="secondary">Cargando el historial…</Copy>;
  if (isError) return <Copy tone="secondary">No pudimos cargar el historial.</Copy>;
  if (entries.length === 0) {
    return <Copy tone="secondary">Aún no hay movimientos registrados.</Copy>;
  }
  return (
    <Stack gap={16}>
      {entries.map((entry) => (
        <Row key={entry.id} style={styles.entry}>
          <View style={styles.dot} />
          <View style={styles.text}>
            <Copy weight="semibold">{entry.title}</Copy>
            {entry.at ? (
              <Copy tone="secondary">{entry.by ? `${entry.at} · ${entry.by}` : entry.at}</Copy>
            ) : null}
            {entry.motivo ? <Copy tone="secondary">{entry.motivo}</Copy> : null}
          </View>
        </Row>
      ))}
    </Stack>
  );
});

const styles = StyleSheet.create({
  entry: { alignItems: "flex-start" },
  dot: {
    width: 12,
    height: 12,
    marginTop: 4,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  text: { flex: 1, gap: 2 },
});
