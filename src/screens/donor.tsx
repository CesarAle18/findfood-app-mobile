import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
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
import { Icon, RouteMap } from "@/components/findfood/icon";
import { useMobile } from "@/state/mobile-context";
import type { Donation } from "@/domain/models";
import { colors } from "@/design/tokens";

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
function DonationLinks({ donation }: { donation: Donation }) {
  return (
    <>
      <NavButton
        href={{ pathname: "/seguimiento", params: { id: donation.id } }}
      >
        Hacer seguimiento
      </NavButton>
      <TextLink
        href={{ pathname: "/detalle-donacion", params: { id: donation.id } }}
      >
        Ver detalle
      </TextLink>
    </>
  );
}
export function DonorHomeScreen() {
  const { data } = useMobile();
  const donation = data.donations[0];
  return (
    <Screen
      viewRole="donor"
      title="Inicio"
      subtitle="Usuario donante"
      badge={<Badge>Donante</Badge>}
      tabs="home"
    >
      <Card soft>
        <Copy weight="semibold">Resumen de donaciones</Copy>
        <Metrics
          values={[
            ["12", "realizadas"],
            ["2", "en seguimiento"],
            ["280 kg", "donados"],
          ]}
        />
      </Card>
      <NavButton href="/nueva-donacion" showArrow={false}>
        Realiza una donación
      </NavButton>
      <NavButton
        href="/registro-voluntario"
        variant="outline"
        showArrow={false}
      >
        ¿Quieres ser voluntario?
      </NavButton>
      <Section title="Tu última donación">
        {donation ? (
          <Card>
            <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <Copy weight="bold">{donation.id}</Copy>
              <Badge>{donation.status}</Badge>
            </Row>
            <Copy>{donation.category}</Copy>
            <Copy tone="secondary">Peso estimado: {donation.weightKg} kg</Copy>
            <Copy tone="secondary">Recogida: {donation.pickupWindow}</Copy>
            <DonationLinks donation={donation} />
          </Card>
        ) : (
          <Copy tone="secondary">Aún no tienes donaciones.</Copy>
        )}
      </Section>
      <Section title="Actividad reciente">
        {[
          ["Donación entregada", "DON-1051 · Ayer 18:40"],
          ["Voluntario aceptado", "DON-1058 · Hoy 14:12"],
          ["Donación publicada", "DON-1058 · Hoy 13:55"],
        ].map(([title, detail]) => (
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
export function DonationsScreen() {
  const { data } = useMobile();
  return (
    <Screen
      viewRole="donor"
      title="Mis donaciones"
      subtitle="Historial y estado de tus envíos"
      tabs="route"
      badge={<Badge>3 activas</Badge>}
    >
      <Choices values={["Todas", "En seguimiento", "Entregadas"]} />
      {data.donations.length === 0 && (
        <Copy tone="secondary">Aún no tienes donaciones.</Copy>
      )}
      {data.donations.map((d) => (
        <Card key={d.id}>
          <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <Copy weight="bold">{d.id}</Copy>
            <Badge>{d.status}</Badge>
          </Row>
          <Copy>{d.category}</Copy>
          <Copy tone="secondary">
            {d.weightKg} kg · {d.pickupWindow}
          </Copy>
          {d.status === "Completada" ? (
            <TextLink
              href={{ pathname: "/detalle-donacion", params: { id: d.id } }}
            >
              Ver detalle
            </TextLink>
          ) : (
            <DonationLinks donation={d} />
          )}
        </Card>
      ))}
    </Screen>
  );
}
function useDonation() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data } = useMobile();
  return {
    donation: id ? data.donations.find((d) => d.id === id) : data.donations[0],
    volunteer: data.volunteer,
  };
}
export function TrackingScreen() {
  const { donation: d, volunteer } = useDonation();
  if (!d)
    return (
      <Screen viewRole="donor" title="Seguimiento" back>
        <Copy>Donación no encontrada.</Copy>
      </Screen>
    );
  return (
    <Screen
      viewRole="donor"
      title="Seguimiento"
      subtitle="Sigue el avance de tu donación"
      tabs="route"
      back
    >
      <Row style={{ justifyContent: "space-between" }}>
        <Copy weight="bold">{d.id}</Copy>
        <Badge>
          {d.status === "Completada"
            ? "Completada"
            : d.status === "Buscando voluntario"
              ? d.status
              : "En camino"}
        </Badge>
      </Row>
      <Section title="Resumen del envío">
        <Card>
          <Copy>
            Voluntario:{" "}
            {d.status === "Buscando voluntario"
              ? "Por asignar"
              : volunteer.name}
          </Copy>
          <Copy tone="secondary">Vehículo: Camioneta</Copy>
          <Detail
            label="ETA"
            value={d.status === "Voluntario asignado" ? "18 min" : "—"}
          />
        </Card>
      </Section>
      <Card soft>
        <Copy weight="semibold">Estado actual</Copy>
        <Copy>
          {d.status === "Completada"
            ? "Tu donación fue entregada."
            : d.status === "Buscando voluntario"
              ? "Estamos buscando un voluntario."
              : "El voluntario ya va en camino a recoger tu donación."}
        </Copy>
      </Card>
      <Section title="Proceso del envío">
        <Stack gap={22}>
          {[
            ["Donación publicada", "Hoy · 13:55"],
            ["Voluntario aceptó", `${volunteer.name} · 14:12`],
            ["En camino a la recogida", "ETA 18 min"],
            ["Entrega completada", "Pendiente"],
          ].map(([label, detail], i) => {
            const reached =
              d.status === "Completada" ||
              (d.status === "Voluntario asignado" ? i < 3 : i === 0);
            return (
              <Row key={label}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: reached ? colors.soft : colors.muted,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    name={reached ? "check" : "clock"}
                    size={17}
                    color={reached ? colors.primary : colors.secondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Copy weight="semibold">{label}</Copy>
                  <Copy tone="secondary">
                    {reached ? (i === 3 ? "Hoy · 18:40" : detail) : "Pendiente"}
                  </Copy>
                </View>
              </Row>
            );
          })}
        </Stack>
      </Section>
      <Button variant="outline">Contactar voluntario</Button>
      <NavButton href={{ pathname: "/detalle-donacion", params: { id: d.id } }}>
        Ver detalle completo
      </NavButton>
    </Screen>
  );
}
export function DonationDetailScreen() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { donation: d, volunteer } = useDonation();
  if (!d)
    return (
      <Screen viewRole="donor" title="Detalle de donación" back>
        <Copy>Donación no encontrada.</Copy>
      </Screen>
    );
  return (
    <Screen
      viewRole={view === "volunteer" ? "volunteer" : "donor"}
      title="Detalle de donación"
      subtitle="Información completa del envío"
      back
      tabs="route"
    >
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <Copy weight="bold">{d.id}</Copy>
        <Badge>{d.status}</Badge>
      </Row>
      <Section title="Resumen">
        <Card>
          <Detail label="Categoría" value={d.category} />
          <Row>
            <View style={{ flex: 1 }}>
              <Detail label="Peso estimado" value={`${d.weightKg} kg`} />
            </View>
            <View style={{ flex: 1 }}>
              <Detail label="Vencimiento" value={d.expiresOn} />
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
        </Card>
      </Section>
      <Section title="Voluntario asignado">
        <Card>
          <Copy weight="semibold">
            {d.status === "Buscando voluntario"
              ? "Por asignar"
              : volunteer.name}
          </Copy>
          <Copy tone="secondary">Camioneta · 500 kg · Cadena de frío</Copy>
          <Detail
            label="Estado actual"
            value={
              d.status === "Voluntario asignado"
                ? "En camino a la recogida"
                : d.status
            }
          />
        </Card>
      </Section>
      <Section title="Ubicación en tiempo real">
        <RouteMap />
      </Section>
      <NavButton
        href={{ pathname: "/calificar-voluntario", params: { id: d.id } }}
        showArrow={false}
      >
        Calificar voluntario
      </NavButton>
      <TextLink
        href={view === "volunteer" ? "/ruta-activa" : "/mis-donaciones"}
      >
        Regresar
      </TextLink>
    </Screen>
  );
}
export function ReviewDonationScreen() {
  const { draft } = useMobile();
  return (
    <Screen
      viewRole="donor"
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
            <TextLink href="/nueva-donacion">Editar información</TextLink>
          </Card>
        ))}
      </Section>
      <NavButton href="/espera-voluntario" showArrow={false}>
        Confirmar
      </NavButton>
    </Screen>
  );
}
