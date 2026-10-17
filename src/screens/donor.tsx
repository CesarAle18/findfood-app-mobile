import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { memo, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { isApiError } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";
import type { EstadoDonacion } from "@/api/types";
import {
  EmptyState,
  ErrorState,
  QueryContent,
} from "@/components/findfood/feedback";
import { Icon } from "@/components/findfood/icon";
import { PointMap } from "@/components/findfood/map";
import { Pressing } from "@/components/findfood/motion";
import {
  Badge,
  Button,
  Card,
  Choices,
  Copy,
  Detail,
  FormMessage,
  NavButton,
  Row,
  Screen,
  Section,
  Stack,
  TextLink,
} from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import {
  newDonationDraft,
  toCrearDonacionBody,
  validateDraft,
  type DraftProduct,
} from "@/domain/donation-draft";
import {
  assignedVolunteerFromDetalle,
  type AssignedVolunteerView,
  type DonationView,
} from "@/domain/mappers/donations";
import { formatKg } from "@/domain/mappers/profile";
import { relativeTime } from "@/notifications/relative-time";
import {
  useOpenNotification,
  type OpenableNotification,
} from "@/notifications/use-open-notification";
import { useUnidades } from "@/services/catalogos";
import {
  useActualizarDonacionMutation,
  useCrearDonacionMutation,
  usePublicarDonacionMutation,
  type CrearDonacionBody,
} from "@/services/donaciones";
import { notificacionesQuery, type BandejaPages } from "@/services/notificaciones";
import { useImpacto } from "@/services/perfil";
import { useMobile } from "@/state/mobile-context";
import { useMe } from "@/state/session";

import {
  filterDonations,
  formatInstant,
  isDelivered,
  isTracking,
  useDonationDetail,
  useDonationId,
  useDonationPages,
  useLatestDonation,
  type DonationDetail,
  type DonationFilter,
} from "./donation-queries";

export function Metrics({ values }: { values: [string, string][] }) {
  return (
    <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
      {values.map(([value, label]) => (
        <View key={label} style={{ gap: 4 }}>
          <Copy weight="bold" style={{ fontSize: 25, lineHeight: 32 }}>
            {value}
          </Copy>
          <Copy tone="secondary" style={{ fontSize: 11 }}>
            {label}
          </Copy>
        </View>
      ))}
    </Row>
  );
}

function DonationLinks({ id }: { id: string }) {
  return (
    <>
      <NavButton href={{ pathname: "/donante/seguimiento", params: { id } }}>
        Hacer seguimiento
      </NavButton>
      <TextLink href={{ pathname: "/donante/detalle-donacion", params: { id } }}>
        Ver detalle
      </TextLink>
    </>
  );
}

/** A donation summary with its links; also the row of the donations list. */
const DonationCard = memo(function DonationCard({ donation: d }: { donation: DonationView }) {
  return (
    <Card>
      <Row style={styles.spread}>
        <Copy weight="bold">{d.code}</Copy>
        <Badge warning={d.statusTone === "warning"}>{d.status}</Badge>
      </Row>
      <Copy>{d.category}</Copy>
      <Copy tone="secondary">
        {d.weightKg} kg · {d.pickupWindow}
      </Copy>
      {isTracking(d.estado) ? (
        <DonationLinks id={d.id} />
      ) : (
        <TextLink href={{ pathname: "/donante/detalle-donacion", params: { id: d.id } }}>
          Ver detalle
        </TextLink>
      )}
    </Card>
  );
});

const newDonationAction = (
  <NavButton href="/donante/nueva-donacion" showArrow={false}>
    Realiza una donación
  </NavButton>
);

function NoDonations() {
  return (
    <EmptyState
      title="Aún no tienes donaciones"
      description="Publica tu primera donación y te avisaremos cuando un voluntario la acepte."
      action={newDonationAction}
    />
  );
}

/** Shown when a screen opens without a donation id (or with a stale link). */
function MissingDonation({ href }: { href: Href }) {
  return (
    <EmptyState
      title="No encontramos la donación"
      description="Ábrela de nuevo desde la lista."
      action={
        <NavButton href={href} dismissTo showArrow={false}>
          Ir a la lista
        </NavButton>
      }
    />
  );
}

/** A row of "Actividad reciente": an inbox notification, ready to render and open. */
interface ActivityRow extends OpenableNotification {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  time: string | null;
  unread: boolean;
}

const RECENT_ACTIVITY = 5;

/** The newest notifications of the inbox's first page (the same cache as the alerts tab). */
function selectRecentActivity(data: BandejaPages): ActivityRow[] {
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

function RecentActivity() {
  const activity = useInfiniteQuery({ ...notificacionesQuery(), select: selectRecentActivity });
  const openNotification = useOpenNotification();
  return (
    <QueryContent query={activity} loadingLabel="Cargando tu actividad">
      {(rows) =>
        rows.length === 0 ? (
          <Copy tone="secondary">Aún no tienes actividad reciente.</Copy>
        ) : (
          <Stack gap={12}>
            {rows.map((row) => (
              <Pressing
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={row.unread ? `${row.titulo}, sin leer` : row.titulo}
                accessibilityHint="Abre la notificación"
                onPress={() => openNotification(row)}
                scale={1}
                surface={styles.activityRow}
              >
                <Row>
                  <Icon name={row.unread ? "bell" : "check"} />
                  <View style={styles.activityText}>
                    <Copy weight={row.unread ? "bold" : "medium"}>{row.titulo}</Copy>
                    <Copy tone="secondary">
                      {row.time ? `${row.cuerpo} · ${row.time}` : row.cuerpo}
                    </Copy>
                  </View>
                </Row>
              </Pressing>
            ))}
          </Stack>
        )
      }
    </QueryContent>
  );
}

export function DonorHomeScreen() {
  const me = useMe();
  const impacto = useImpacto();
  const latest = useLatestDonation();
  // Same query (and cache) as Mis donaciones. It counts the loaded pages only, the first
  // page of 20 newest on Inicio: donations under way are recent, so they are almost always
  // there. The API has no count by state.
  const pages = useDonationPages();
  const tracking = pages.data?.rows.filter((d) => isTracking(d.estado)).length;
  // The account totals of `GET /me` while the impact loads (or fails).
  const impact = impacto.data?.donante;
  const totals = impact ?? me.data?.donante;
  return (
    <Screen
      title="Inicio"
      subtitle="Usuario donante"
      badge={<Badge>Donante</Badge>}
    >
      <Card soft>
        <Copy weight="semibold">Resumen de donaciones</Copy>
        <Metrics
          values={[
            [totals ? String(totals.total_donaciones) : "—", "realizadas"],
            [totals ? formatKg(totals.total_kg_donados) : "—", "donados"],
            [impact ? String(impact.donaciones_entregadas) : "—", "entregadas"],
            [tracking === undefined ? "—" : String(tracking), "en seguimiento"],
          ]}
        />
      </Card>
      <NavButton href="/donante/nueva-donacion" showArrow={false}>
        Realiza una donación
      </NavButton>
      <NavButton
        href="/donante/registro-voluntario"
        variant="outline"
        showArrow={false}
      >
        ¿Quieres ser voluntario?
      </NavButton>
      <Section title="Tu última donación">
        <QueryContent query={latest} loadingLabel="Cargando tu última donación">
          {(donation) => (donation ? <DonationCard donation={donation} /> : <NoDonations />)}
        </QueryContent>
      </Section>
      <Section title="Actividad reciente">
        <RecentActivity />
      </Section>
    </Screen>
  );
}

/** The unfiltered view: the only one that loads the next page when the list end is reached. */
const UNFILTERED: DonationFilter = "todas";

const FILTERS: readonly { value: DonationFilter; label: string }[] = [
  { value: UNFILTERED, label: "Todas" },
  { value: "seguimiento", label: "En seguimiento" },
  { value: "entregadas", label: "Entregadas" },
];
const FILTER_LABELS = FILTERS.map(({ label }) => label);

const keyExtractor = (donation: DonationView) => donation.id;
const renderDonation = ({ item }: ListRenderItemInfo<DonationView>) => (
  <DonationCard donation={item} />
);
const ItemSeparator = () => <View style={styles.separator} />;
const filterEmpty = (
  <EmptyState
    title="No hay donaciones con este filtro"
    description="Prueba con otro filtro para ver el resto de tus donaciones."
  />
);

export function DonationsScreen() {
  const pages = useDonationPages();
  const [filter, setFilter] = useState(0);
  const filterValue = FILTERS[filter].value;
  const total = pages.data?.total;
  // Memoized so FlashList keeps the same data while nothing changed.
  const rows = pages.data?.rows;
  const visible = useMemo(
    () => (rows ? filterDonations(rows, filterValue) : []),
    [rows, filterValue],
  );
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = pages;
  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  };
  const footer = isFetchingNextPage ? (
    <ActivityIndicator
      accessibilityLabel="Cargando más donaciones"
      color={colors.primary}
      style={styles.footer}
    />
  ) : isFetchNextPageError ? (
    <ErrorState
      error={pages.error}
      title="No pudimos cargar más donaciones"
      onRetry={() => void fetchNextPage()}
    />
  ) : hasNextPage ? (
    <View style={styles.footer}>
      <Button variant="outline" onPress={() => void fetchNextPage()}>
        Cargar más
      </Button>
    </View>
  ) : null;
  return (
    <Screen
      title="Mis donaciones"
      subtitle="Historial y estado de tus envíos"
      badge={
        total === undefined ? null : (
          <Badge>{total === 1 ? "1 donación" : `${total} donaciones`}</Badge>
        )
      }
      scroll={false}
    >
      <QueryContent query={pages} loadingLabel="Cargando tus donaciones">
        {({ rows }) =>
          rows.length === 0 ? (
            <NoDonations />
          ) : (
            <>
              <Choices values={FILTER_LABELS} selected={filter} onChange={setFilter} />
              <FlashList
                data={visible}
                renderItem={renderDonation}
                keyExtractor={keyExtractor}
                ItemSeparatorComponent={ItemSeparator}
                ListEmptyComponent={filterEmpty}
                ListFooterComponent={footer}
                // A filter can match few rows, so the end is reached at once and every page
                // would load on its own: with a filter, only "Cargar más" loads more.
                onEndReached={filterValue === UNFILTERED ? loadMore : undefined}
                onEndReachedThreshold={0.5}
                contentContainerStyle={styles.listContent}
                contentInsetAdjustmentBehavior="automatic"
              />
            </>
          )
        }
      </QueryContent>
    </Screen>
  );
}

/** What the donor reads under "Estado actual". */
const CURRENT_STATE: Record<EstadoDonacion, string> = {
  BORRADOR: "Tu donación aún no se ha publicado.",
  PUBLICADA: "Estamos buscando un voluntario.",
  ASIGNADA: "Un voluntario aceptó tu donación y pronto irá a recogerla.",
  EN_RECOLECCION: "El voluntario va en camino a recoger tu donación.",
  EN_TRANSITO: "Tu donación va en camino al banco de alimentos.",
  ENTREGADA: "Tu donación fue entregada en el banco de alimentos.",
  RECIBIDA: "Tu donación fue entregada y recibida por el banco.",
  RECHAZADA: "El banco de alimentos no pudo recibir tu donación.",
  CANCELADA: "Cancelaste esta donación.",
  EXPIRADA: "La publicación venció sin que un voluntario la aceptara.",
};

function trackingSteps(
  dto: DonationDetail["dto"],
  volunteer: AssignedVolunteerView | null,
): [string, string | null][] {
  const accepted = formatInstant(dto.asignada_at);
  return [
    ["Donación publicada", formatInstant(dto.publicada_at)],
    ["Voluntario aceptó", accepted && volunteer ? `${volunteer.name} · ${accepted}` : accepted],
    ["Recogida realizada", formatInstant(dto.recogida_at)],
    ["Entregada en el banco", formatInstant(dto.entregada_at)],
  ];
}

function Tracking({ detail: { dto, view: d } }: { detail: DonationDetail }) {
  const volunteer = assignedVolunteerFromDetalle(dto);
  return (
    <>
      <Row style={styles.spread}>
        <Copy weight="bold">{d.code}</Copy>
        <Badge warning={d.statusTone === "warning"}>{d.status}</Badge>
      </Row>
      <Section title="Resumen del envío">
        <Card>
          <Copy>Voluntario: {volunteer ? volunteer.name : "Por asignar"}</Copy>
          {volunteer ? <Copy tone="secondary">Vehículo: {volunteer.vehicle}</Copy> : null}
          <Detail label="Ventana de recogida" value={d.pickupWindow} />
        </Card>
      </Section>
      <Card soft>
        <Copy weight="semibold">Estado actual</Copy>
        <Copy>{CURRENT_STATE[d.estado] ?? d.status}</Copy>
      </Card>
      <Section title="Proceso del envío">
        <Stack gap={22}>
          {trackingSteps(dto, volunteer).map(([label, at]) => (
            <Row key={label}>
              <View style={[styles.stepIcon, at ? styles.stepReached : styles.stepPending]}>
                <Icon
                  name={at ? "check" : "clock"}
                  size={17}
                  color={at ? colors.primary : colors.secondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Copy weight="semibold">{label}</Copy>
                <Copy tone="secondary">{at ?? "Pendiente"}</Copy>
              </View>
            </Row>
          ))}
        </Stack>
      </Section>
      <Button variant="outline">Contactar voluntario</Button>
      <NavButton href={{ pathname: "/donante/detalle-donacion", params: { id: d.id } }}>
        Ver detalle completo
      </NavButton>
    </>
  );
}

export function TrackingScreen() {
  const id = useDonationId();
  const detail = useDonationDetail(id);
  return (
    <Screen
      title="Seguimiento"
      subtitle="Sigue el avance de tu donación"
      back
    >
      {id ? (
        <QueryContent query={detail} loadingLabel="Cargando la donación">
          {(loaded) => <Tracking detail={loaded} />}
        </QueryContent>
      ) : (
        <MissingDonation href="/donante/donaciones" />
      )}
    </Screen>
  );
}

function DonationDetailContent({
  detail: { dto, view: d },
  asVolunteer,
}: {
  detail: DonationDetail;
  asVolunteer: boolean;
}) {
  const volunteer = assignedVolunteerFromDetalle(dto);
  return (
    <>
      <Row style={styles.spread}>
        <Copy weight="bold">{d.code}</Copy>
        <Badge warning={d.statusTone === "warning"}>{d.status}</Badge>
      </Row>
      <Section title="Resumen">
        <Card>
          <Detail label="Categoría" value={d.category || "Sin productos"} />
          <Row>
            <View style={{ flex: 1 }}>
              <Detail label="Peso estimado" value={`${d.weightKg} kg`} />
            </View>
            <View style={{ flex: 1 }}>
              <Detail label="Vencimiento" value={d.expiresOn || "Sin fecha"} />
            </View>
          </Row>
          <Detail
            label="Régimen térmico"
            value={d.refrigerated ? "Refrigerado" : "No requiere"}
          />
        </Card>
      </Section>
      <Section title="Recogida">
        <Card>
          <Detail label="Ventana de recogida" value={d.pickupWindow} />
          <Detail label="Ubicación" value={d.address} />
          {dto.referencia_recogida ? (
            <Detail label="Referencia" value={dto.referencia_recogida} />
          ) : null}
        </Card>
      </Section>
      {volunteer ? (
        <Section title="Voluntario asignado">
          <Card>
            <Copy weight="semibold">{volunteer.name}</Copy>
            <Copy tone="secondary">{volunteer.vehicle}</Copy>
            <Detail label="Estado actual" value={d.status} />
          </Card>
        </Section>
      ) : null}
      <Section title="Punto de recogida">
        <PointMap point={dto.ubicacion_recogida} title={d.address || "Punto de recogida"} />
        <Copy tone="secondary">
          La ubicación en vivo del voluntario aún no está disponible.
        </Copy>
      </Section>
      {!asVolunteer && volunteer && isDelivered(d.estado) ? (
        <NavButton
          href={{ pathname: "/donante/calificar-voluntario", params: { id: d.id } }}
          showArrow={false}
        >
          Calificar voluntario
        </NavButton>
      ) : null}
    </>
  );
}

/** Also opened by volunteers from their route (`asVolunteer`), without the donor actions. */
export function DonationDetailScreen({ asVolunteer = false }: { asVolunteer?: boolean }) {
  const id = useDonationId();
  const detail = useDonationDetail(id);
  const list = asVolunteer ? "/voluntario/rutas" : "/donante/donaciones";
  return (
    <Screen
      title="Detalle de donación"
      subtitle="Información completa del envío"
      back
    >
      {id ? (
        <QueryContent query={detail} loadingLabel="Cargando la donación">
          {(loaded) => <DonationDetailContent detail={loaded} asVolunteer={asVolunteer} />}
        </QueryContent>
      ) : (
        <MissingDonation href={list} />
      )}
      <TextLink href={list} dismissTo>
        Regresar
      </TextLink>
    </Screen>
  );
}

/** Shown when the API refuses to update a draft it already moved on (published, cancelled…). */
const NOT_EDITABLE_MESSAGE =
  "Esta donación ya no se puede editar. Revisa Mis donaciones antes de confirmar de nuevo: se creará una donación nueva.";
const INCOMPLETE_MESSAGE = "Faltan datos de la donación. Toca Editar información para completarlos.";

/**
 * Creates the donation (or updates the draft already created by an earlier attempt) and
 * publishes it. The API id is kept in the draft as soon as it exists, so a failed publish
 * retried later PATCHes the same BORRADOR instead of creating another one.
 */
function useConfirmDonation() {
  const { draft, setDraft } = useMobile();
  const { data: unidades } = useUnidades();
  const crear = useCrearDonacionMutation();
  const actualizar = useActualizarDonacionMutation();
  const publicar = usePublicarDonacionMutation();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const confirm = async () => {
    setError(undefined);
    // The window may have closed since the form was checked.
    const invalid = validateDraft(draft, Date.now());
    if (invalid) {
      setError(Object.values(invalid)[0] ?? INCOMPLETE_MESSAGE);
      return;
    }
    let body: CrearDonacionBody | null = null;
    try {
      body = unidades ? toCrearDonacionBody(draft, { unidades }) : null;
    } catch (failure) {
      setError(messageFor(failure));
      return;
    }
    if (!body) {
      setError(INCOMPLETE_MESSAGE);
      return;
    }
    setSending(true);
    const existing = draft.apiId;
    try {
      let id: string;
      if (existing) {
        await actualizar.mutateAsync({ id: existing, body });
        id = existing;
      } else {
        id = (await crear.mutateAsync(body)).id;
        setDraft((current) => ({ ...current, apiId: id }));
      }
      await publicar.mutateAsync(id);
      setDraft(newDonationDraft());
      router.replace({ pathname: "/donante/espera-voluntario", params: { id } });
    } catch (failure) {
      if (existing && isApiError(failure) && failure.type === "donacion-no-editable") {
        // It may have been published by an attempt whose answer was lost: never retry it
        // silently; the next confirmation creates a new donation.
        setDraft((current) => ({ ...current, apiId: null }));
        setError(NOT_EDITABLE_MESSAGE);
      } else {
        setError(messageFor(failure));
      }
    } finally {
      setSending(false);
    }
  };

  return { confirm, sending, error, ready: unidades !== undefined };
}

function ProductPhoto({ product }: { product: DraftProduct }) {
  if (!product.fotoUri) {
    return (
      <View style={[styles.photo, styles.noPhoto]}>
        <Copy tone="secondary" style={{ fontSize: 11 }}>
          Sin foto
        </Copy>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: product.fotoUri }}
      contentFit="cover"
      recyclingKey={product.fotoUri}
      style={styles.photo}
      accessibilityLabel={`Foto de ${product.name || "producto"}`}
    />
  );
}

export function ReviewDonationScreen() {
  const { draft } = useMobile();
  const { confirm, sending, error, ready } = useConfirmDonation();
  return (
    <Screen
      title="Revisar donación"
      subtitle="Confirma la información antes de publicar"
      back
    >
      <Card soft>
        <Copy weight="semibold">Punto general de recogida</Copy>
        <Copy>{draft.direccion.trim() || "Dirección pendiente"}</Copy>
        {draft.referencia.trim() ? (
          <Copy tone="secondary">Referencia: {draft.referencia.trim()}</Copy>
        ) : null}
        {draft.ubicacionRecogida ? (
          <PointMap point={draft.ubicacionRecogida} title="Punto de recogida" height={160} />
        ) : (
          <Copy tone="secondary">Punto pendiente de seleccionar en el mapa</Copy>
        )}
        <Copy tone="secondary">
          Ventana: {draft.pickupDate ? `${draft.pickupDate} · ` : ""}
          {draft.pickupFrom} – {draft.pickupUntil}
        </Copy>
      </Card>
      <Section title="Productos agregados">
        <Copy tone="secondary">
          Todos comparten el mismo punto de recogida.
        </Copy>
        {draft.products.map((product, i) => (
          <Card key={product.id}>
            <Row style={{ alignItems: "flex-start" }}>
              <ProductPhoto product={product} />
              <View style={{ flex: 1, gap: 4 }}>
                <Copy tone="secondary">Producto {i + 1}</Copy>
                <Copy weight="bold">{product.name || "Producto sin nombre"}</Copy>
                <Copy>
                  Cantidad / peso: {product.quantity || "—"} {product.unit}
                </Copy>
                <Copy tone="secondary">
                  Vence: {product.expiresOn || "Sin fecha"}
                </Copy>
                <Badge>{product.coldChain}</Badge>
              </View>
            </Row>
            <TextLink href="/donante/nueva-donacion" dismissTo>
              Editar información
            </TextLink>
          </Card>
        ))}
      </Section>
      <FormMessage message={error} />
      <Button onPress={() => void confirm()} loading={sending} disabled={!ready}>
        Confirmar
      </Button>
    </Screen>
  );
}


const styles = StyleSheet.create({
  spread: { justifyContent: "space-between", flexWrap: "wrap" },
  separator: { height: 16 },
  listContent: { paddingTop: 0, paddingBottom: 32 },
  footer: { paddingVertical: 16 },
  activityRow: { minHeight: 48, justifyContent: "center" },
  activityText: { flex: 1 },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  stepReached: { backgroundColor: colors.soft },
  stepPending: { backgroundColor: colors.muted },
  photo: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.muted },
  noPhoto: { alignItems: "center", justifyContent: "center" },
});
