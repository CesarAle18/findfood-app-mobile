import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import type { Href } from "expo-router";
import { memo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import type { EstadoDonacion } from "@/api/types";
import {
  EmptyState,
  ErrorState,
  QueryContent,
} from "@/components/findfood/feedback";
import { Icon, RouteMap } from "@/components/findfood/icon";
import {
  Badge,
  Button,
  Card,
  Choices,
  Copy,
  Detail,
  NavButton,
  Row,
  Screen,
  Section,
  Stack,
  TextLink,
} from "@/components/findfood/ui";
import { donorActivity } from "@/data/preview";
import { colors } from "@/design/tokens";
import {
  assignedVolunteerFromDetalle,
  type AssignedVolunteerView,
  type DonationView,
} from "@/domain/mappers/donations";
import { formatKg } from "@/domain/mappers/profile";
import { useMobile } from "@/state/mobile-context";
import { useMe } from "@/state/session";

import {
  formatInstant,
  isDelivered,
  isTracking,
  matchesFilter,
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

export function DonorHomeScreen() {
  const me = useMe();
  const latest = useLatestDonation();
  const donante = me.data?.donante;
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
            [donante ? String(donante.total_donaciones) : "—", "realizadas"],
            [donante ? formatKg(donante.total_kg_donados) : "—", "donados"],
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
        {donorActivity.map(({ title, detail }) => (
          <Row key={title}>
            <Icon name="check" />
            <View style={{ flex: 1 }}>
              <Copy weight="medium">{title}</Copy>
              <Copy tone="secondary">{detail}</Copy>
            </View>
          </Row>
        ))}
      </Section>
    </Screen>
  );
}

const FILTERS: readonly { value: DonationFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
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
                data={rows.filter((d) => matchesFilter(d.estado, filterValue))}
                renderItem={renderDonation}
                keyExtractor={keyExtractor}
                ItemSeparatorComponent={ItemSeparator}
                ListEmptyComponent={filterEmpty}
                ListFooterComponent={footer}
                // A filter can match few rows, so the end is reached at once and every page
                // would load on its own: with a filter, only "Cargar más" loads more.
                onEndReached={filterValue === "todas" ? loadMore : undefined}
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
      <Section title="Ubicación en tiempo real">
        <RouteMap />
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

export function ReviewDonationScreen() {
  const { draft } = useMobile();
  return (
    <Screen
      title="Revisar donación"
      subtitle="Confirma la información antes de publicar"
      back
    >
      <Card soft>
        <Copy weight="semibold">Punto general de recogida</Copy>
        <Copy>Ubicación pendiente de seleccionar en el mapa</Copy>
        <Copy tone="secondary">
          Ventana: {draft.pickupFrom} – {draft.pickupUntil}
        </Copy>
        <Copy tone="secondary">Fotografías pendientes</Copy>
      </Card>
      <Section title="Productos agregados">
        <Copy tone="secondary">
          Todos comparten el mismo punto de recogida.
        </Copy>
        {draft.products.map((product, i) => (
          <Card key={product.id}>
            <Copy tone="secondary">Producto {i + 1}</Copy>
            <Copy weight="bold">{product.name || "Producto sin nombre"}</Copy>
            <Copy>
              Cantidad / peso: {product.quantity || "—"} {product.unit}
            </Copy>
            <Copy tone="secondary">
              Vence: {product.expiresOn || "Pendiente"}
            </Copy>
            <Badge>{product.coldChain}</Badge>
            <TextLink href="/donante/nueva-donacion">Editar información</TextLink>
          </Card>
        ))}
      </Section>
      <NavButton href="/donante/espera-voluntario" showArrow={false}>
        Confirmar
      </NavButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spread: { justifyContent: "space-between", flexWrap: "wrap" },
  separator: { height: 16 },
  listContent: { paddingTop: 0, paddingBottom: 32 },
  footer: { paddingVertical: 16 },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  stepReached: { backgroundColor: colors.soft },
  stepPending: { backgroundColor: colors.muted },
});
