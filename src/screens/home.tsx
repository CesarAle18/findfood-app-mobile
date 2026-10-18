/**
 * Inicio voluntario (MOV-40): availability, today's summary, the next route (or the accepted
 * pickups waiting for one), a banner for live offers and the recent activity.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";

import type { RutaResumenDto } from "@/services/rutas";
import { ErrorState, LoadingState, QueryContent } from "@/components/findfood/feedback";
import { Icon, type IconName } from "@/components/findfood/icon";
import { Pressing } from "@/components/findfood/motion";
import { Badge, Card, Copy, NavButton, Row, Screen, Section, Stack } from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import { fromFechaVencimiento, fromIsoToBogota } from "@/domain/mappers/dates";
import { MappingError } from "@/domain/mappers/errors";
import { formatKg } from "@/domain/mappers/profile";
import { acceptedWithoutRoute, liveOffers, pendingStops } from "@/domain/mappers/routes";
import { rutaStatus } from "@/domain/mappers/statuses";
import { AvailabilityToggle, availabilityLabel } from "@/location/availability-toggle";
import { relativeTime } from "@/notifications/relative-time";
import {
  useOpenNotification,
  type OpenableNotification,
} from "@/notifications/use-open-notification";
import { useOfertas } from "@/services/asignaciones";
import { notificacionesQuery, type BandejaPages } from "@/services/notificaciones";
import { useMe } from "@/state/session";

import { useCurrentRoute } from "./route-queries";

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function HomeScreen() {
  const { data: me } = useMe();
  const voluntario = me?.voluntario;
  const route = useCurrentRoute();
  const ofertas = useOfertas();
  const offers = ofertas.data ?? [];
  const live = liveOffers(offers).length;
  const accepted = acceptedWithoutRoute(offers).length;
  const { summary, totals } = route;
  const paradas = route.ruta.data ? pendingStops(route.ruta.data.paradas).length : 0;
  const counting = route.isPending;

  return (
    <Screen
      title="Inicio"
      subtitle="Vista voluntario"
      badge={voluntario ? <Badge>{availabilityLabel(voluntario.disponible)}</Badge> : undefined}
    >
      <AvailabilityToggle />
      {live > 0 ? (
        <Card>
          <Row>
            <Icon name="truck" />
            <Copy weight="semibold" style={styles.bannerText}>
              {live === 1 ? "Tienes una oferta nueva" : `Tienes ${live} ofertas nuevas`}
            </Copy>
          </Row>
          <NavButton href="/voluntario/oferta">Ver oferta</NavButton>
        </Card>
      ) : null}
      <Card soft>
        <Copy weight="medium" style={styles.caption}>
          Resumen de hoy
        </Copy>
        <Row style={styles.spread}>
          <SummaryCount
            value={counting ? null : totals.enCurso + totals.planificadas}
            one="ruta activa"
            many="rutas activas"
          />
          <SummaryCount
            value={counting ? null : paradas}
            one="parada pendiente"
            many="paradas pendientes"
          />
        </Row>
      </Card>
      <Section title="Próxima ruta">
        {summary ? (
          <NextRouteCard summary={summary} />
        ) : route.isPending || ofertas.isPending ? (
          <LoadingState label="Cargando tu próxima ruta" />
        ) : route.isError ? (
          <ErrorState
            error={route.ruta.error}
            title="No pudimos cargar tu ruta"
            onRetry={() => void route.refetch()}
          />
        ) : accepted > 0 ? (
          <Card>
            <Copy weight="medium">
              {`Tienes ${accepted} ${plural(accepted, "recogida aceptada", "recogidas aceptadas")}`}
            </Copy>
            <Copy tone="secondary">Agrúpalas en una ruta para empezar a recoger.</Copy>
            <NavButton href="/voluntario/rutas">Armar ruta</NavButton>
          </Card>
        ) : (
          <Card>
            <Row>
              <Icon name="route" />
              <View style={styles.flex}>
                <Copy weight="medium">Sin rutas programadas</Copy>
                <Copy tone="secondary">Acepta una oferta para armar tu próxima ruta.</Copy>
              </View>
            </Row>
          </Card>
        )}
      </Section>
      <Section title="Actividad reciente">
        <RecentActivity />
      </Section>
    </Screen>
  );
}

/** A number of the summary; a dash while it loads, so the card keeps its size. */
function SummaryCount({ value, one, many }: { value: number | null; one: string; many: string }) {
  const label = value === null ? `Cargando ${many}` : `${value} ${plural(value, one, many)}`;
  return (
    <View accessible accessibilityLabel={label} style={styles.count}>
      <Copy weight="bold" style={styles.countValue}>
        {value === null ? "–" : String(value)}
      </Copy>
      <Copy tone="secondary" style={styles.caption}>
        {plural(value ?? 0, one, many)}
      </Copy>
    </View>
  );
}

/** `13/10/2026`, or the raw date when it does not parse. */
function routeDate(fecha: string): string {
  try {
    return fromFechaVencimiento(fecha);
  } catch (error) {
    if (!(error instanceof MappingError)) throw error;
    return fecha.slice(0, 10);
  }
}

function NextRouteCard({ summary }: { summary: RutaResumenDto }) {
  const status = rutaStatus(summary.estado);
  const stops = `${summary.paradas} ${plural(summary.paradas, "parada", "paradas")}`;
  const started = summary.iniciada_at ? startTime(summary.iniciada_at) : null;
  return (
    <Card>
      <Row style={styles.spread}>
        <Copy weight="semibold" style={styles.code}>
          {summary.codigo}
        </Copy>
        <Badge warning={status.tone === "warning"}>{status.label}</Badge>
      </Row>
      <Copy tone="secondary">
        {started
          ? `${routeDate(summary.fecha_programada)} · ${started} · ${stops}`
          : `${routeDate(summary.fecha_programada)} · ${stops}`}
      </Copy>
      {summary.peso_total_estimado_kg !== null ? (
        <Copy tone="secondary">{`Peso estimado: ${formatKg(summary.peso_total_estimado_kg)}`}</Copy>
      ) : null}
      <NavButton href="/voluntario/rutas">Ver ruta</NavButton>
    </Card>
  );
}

/** "Inicio 16:05" in Bogotá, or null when the timestamp does not parse. */
function startTime(iso: string): string | null {
  try {
    return `Inicio ${fromIsoToBogota(iso).time}`;
  } catch (error) {
    if (!(error instanceof MappingError)) throw error;
    return null;
  }
}

// --- Recent activity -----------------------------------------------------------------------

/** A row of "Actividad reciente": an inbox notification, ready to render and open. */
interface ActivityItem extends OpenableNotification {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  time: string | null;
  unread: boolean;
}

const RECENT_ACTIVITY = 5;

/** The newest notifications of the inbox's first page (the same cache as the alerts tab). */
function selectRecentActivity(data: BandejaPages): ActivityItem[] {
  const now = Date.now();
  return (data.pages[0]?.datos ?? []).slice(0, RECENT_ACTIVITY).map((dto) => ({
    id: dto.id,
    tipo: dto.tipo,
    titulo: dto.titulo,
    cuerpo: dto.cuerpo,
    donacion_id: dto.donacion_id,
    asignacion_id: dto.asignacion_id,
    time: relativeTime(dto.created_at, now),
    unread: dto.leida_at === null,
  }));
}

/** Same icons as the alerts tab. */
function activityIcon(tipo: string): IconName {
  if (tipo.startsWith("ASIGNACION_")) return "truck";
  if (tipo.startsWith("DONACION_")) return "box";
  if (tipo.startsWith("VERIFICACION_")) return "user";
  return "bell";
}

function RecentActivity() {
  const activity = useInfiniteQuery({ ...notificacionesQuery(), select: selectRecentActivity });
  const openNotification = useOpenNotification();
  return (
    <QueryContent query={activity} loadingLabel="Cargando tu actividad">
      {(items) =>
        items.length === 0 ? (
          <Copy tone="secondary">Aún no tienes actividad</Copy>
        ) : (
          <Stack gap={4}>
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} onPress={() => openNotification(item)} />
            ))}
          </Stack>
        )
      }
    </QueryContent>
  );
}

function ActivityRow({ item, onPress }: { item: ActivityItem; onPress: () => void }) {
  return (
    <Pressing
      accessibilityRole="button"
      accessibilityLabel={item.unread ? `${item.titulo}, sin leer` : item.titulo}
      accessibilityHint="Abre la notificación"
      onPress={onPress}
      scale={1}
      surface={styles.activityRow}
    >
      <Row>
        <View style={styles.activityIcon}>
          <Icon name={activityIcon(item.tipo)} size={17} />
        </View>
        <View style={styles.activityText}>
          <Copy weight={item.unread ? "bold" : "medium"} style={styles.caption}>
            {item.titulo}
          </Copy>
          <Copy tone="secondary" style={styles.activityDetail}>
            {item.time ? `${item.cuerpo} · ${item.time}` : item.cuerpo}
          </Copy>
        </View>
      </Row>
    </Pressing>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spread: { justifyContent: "space-between" },
  caption: { fontSize: 12 },
  bannerText: { flex: 1 },
  count: { flexDirection: "row", alignItems: "center", gap: 8 },
  countValue: { fontSize: 27, lineHeight: 34 },
  code: { fontSize: 18 },
  activityRow: { minHeight: 48, justifyContent: "center", paddingVertical: 8 },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.soft,
    justifyContent: "center",
    alignItems: "center",
  },
  activityText: { flex: 1, gap: 3 },
  activityDetail: { fontSize: 11 },
});
