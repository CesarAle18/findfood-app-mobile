/**
 * "Donación entregada" (MOV-39): the donor's confirmation once the volunteer hands the
 * donation over at the bank. Opened with `?id=` (donation UUID), also by the
 * DONACION_ENTREGADA / DONACION_RECIBIDA pushes.
 */
import { StyleSheet, View } from "react-native";

import { EmptyState, QueryContent } from "@/components/findfood/feedback";
import { Icon } from "@/components/findfood/icon";
import {
  Badge,
  Card,
  Copy,
  Detail,
  FormMessage,
  NavButton,
  Screen,
  Section,
} from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import { assignedVolunteerFromDetalle } from "@/domain/mappers/donations";
import { formatKg } from "@/domain/mappers/profile";

import {
  formatInstant,
  isDelivered,
  useDonationDetail,
  useDonationId,
  type DonationDetail,
} from "./donation-queries";

const kgOrNull = (kg: number | null) => (kg === null ? null : formatKg(kg));

function Delivered({ detail: { dto, view: d } }: { detail: DonationDetail }) {
  if (!isDelivered(d.estado)) {
    return (
      <EmptyState
        icon="route"
        title="Tu donación aún no llega al banco"
        description={`${d.code} está en estado «${d.status}». Te avisaremos cuando se entregue.`}
        action={
          <NavButton
            href={{ pathname: "/donante/seguimiento", params: { id: d.id } }}
            showArrow={false}
          >
            Ver seguimiento
          </NavButton>
        }
      />
    );
  }
  const volunteer = assignedVolunteerFromDetalle(dto);
  const rated = dto.asignacion?.calificada_por_mi === true;
  const deliveredAt = formatInstant(dto.entregada_at);
  const receivedAt = formatInstant(dto.recibida_at);
  const collected = kgOrNull(dto.peso_recogido_kg);
  const received = kgOrNull(dto.peso_recibido_kg);
  const bank = dto.almacen_destino;
  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="check" size={32} />
        </View>
        <Copy weight="semibold" style={styles.heroTitle}>
          Tu donación fue entregada
        </Copy>
        <Copy tone="secondary" style={styles.heroText}>
          Gracias por ayudar a que más alimentos lleguen a quienes los necesitan.
        </Copy>
      </View>
      <Card>
        <View style={styles.spread}>
          <Copy weight="bold">{d.code}</Copy>
          <Badge>{d.status}</Badge>
        </View>
        <Detail label="Entregada en el banco" value={deliveredAt ?? "Sin hora registrada"} />
        <Detail
          label="Recibida por el banco"
          value={receivedAt ?? "Pendiente de confirmación del banco"}
        />
      </Card>
      {bank ? (
        <Section title="Banco de alimentos">
          <Card>
            <Copy weight="semibold">{bank.nombre}</Copy>
            <Copy tone="secondary">{bank.direccion}</Copy>
          </Card>
        </Section>
      ) : null}
      <Section title="Peso">
        <Card>
          <Detail label="Estimado" value={formatKg(dto.peso_estimado_kg)} />
          {collected ? <Detail label="Recogido" value={collected} /> : null}
          {received ? <Detail label="Recibido en el banco" value={received} /> : null}
        </Card>
      </Section>
      {volunteer ? (
        <Section title="Voluntario">
          <Card>
            <Copy weight="semibold">{volunteer.name}</Copy>
            <Copy tone="secondary">{volunteer.vehicle}</Copy>
          </Card>
          {rated ? (
            <FormMessage message="Ya calificaste a este voluntario." tone="success" />
          ) : (
            <NavButton
              href={{ pathname: "/donante/calificar-voluntario", params: { id: d.id } }}
              showArrow={false}
            >
              Calificar voluntario
            </NavButton>
          )}
        </Section>
      ) : null}
    </>
  );
}

export function DonorDeliveryScreen() {
  const id = useDonationId();
  const detail = useDonationDetail(id);
  return (
    <Screen title="Donación entregada" subtitle="Confirmación de entrega" back>
      {id ? (
        <QueryContent query={detail} loadingLabel="Cargando la donación">
          {(loaded) => <Delivered detail={loaded} />}
        </QueryContent>
      ) : (
        <EmptyState
          title="No encontramos la donación"
          description="Ábrela de nuevo desde Mis donaciones."
        />
      )}
      <NavButton href="/donante" dismissTo variant="outline" showArrow={false}>
        Volver al inicio
      </NavButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 16, paddingVertical: 12 },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 17, lineHeight: 23, textAlign: "center" },
  heroText: { textAlign: "center", fontSize: 12 },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
