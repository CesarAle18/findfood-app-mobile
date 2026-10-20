/**
 * "Armar ruta" (MOV-42): the accepted pickups still without a route, all preselected and
 * checked against the route limits before `POST /rutas`. The server still checks dates,
 * capacity and feasibility.
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { messageFor } from "@/api/problem-messages";
import { EmptyState, QueryContent } from "@/components/findfood/feedback";
import { Icon } from "@/components/findfood/icon";
import { Pressing } from "@/components/findfood/motion";
import { Button, Card, Copy, FormMessage, NavButton, Section } from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import { formatKg } from "@/domain/mappers/profile";
import {
  acceptedWithoutRoute,
  pickupWindowLabel,
  validateRouteSelection,
} from "@/domain/mappers/routes";
import { useOfertas, type OfertaDto } from "@/services/asignaciones";
import { useCrearRutaMutation } from "@/services/rutas";

import { AbandonAssignment } from "./route-actions";

/**
 * Without a current route (`standalone`) it is the whole tab: loading, error and empty states
 * included. Below a route it shows only when there are pickups to add.
 */
export function AcceptedPickups({
  standalone,
  onNotice,
}: {
  standalone: boolean;
  /** Shows the outcome of giving a pickup up (its row leaves the list). */
  onNotice: (message: string) => void;
}) {
  const ofertas = useOfertas();
  if (!standalone) {
    const pickups = ofertas.data ? acceptedWithoutRoute(ofertas.data) : [];
    return pickups.length > 0 ? (
      <PickupSelection title="Aceptadas sin ruta" pickups={pickups} onNotice={onNotice} />
    ) : null;
  }
  return (
    <QueryContent
      query={ofertas}
      loadingLabel="Cargando tus recogidas aceptadas"
      errorTitle="No pudimos cargar tus recogidas aceptadas"
    >
      {(rows) => {
        const pickups = acceptedWithoutRoute(rows);
        return pickups.length > 0 ? (
          <PickupSelection title="Armar ruta" pickups={pickups} onNotice={onNotice} />
        ) : (
          <EmptyState
            icon="route"
            title="No tienes recogidas aceptadas"
            description="Acepta una oferta para armar tu ruta."
            action={
              <NavButton href="/voluntario/oferta" showArrow={false}>
                Ver ofertas
              </NavButton>
            }
          />
        );
      }}
    </QueryContent>
  );
}

function PickupSelection({
  title,
  pickups,
  onNotice,
}: {
  title: string;
  pickups: OfertaDto[];
  onNotice: (message: string) => void;
}) {
  // Unchecked ids: everything is selected by default, including pickups accepted later.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string>();
  const { mutateAsync: crear, isPending } = useCrearRutaMutation();
  const selected = pickups.filter((pickup) => !unchecked.has(pickup.id));

  const toggle = (id: string) => {
    setError(undefined);
    setUnchecked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const create = async () => {
    const invalid = validateRouteSelection(selected);
    setError(invalid ?? undefined);
    if (invalid !== null) return;
    try {
      await crear({ donacion_ids: selected.map((pickup) => pickup.donacion_id) });
    } catch (failure) {
      setError(messageFor(failure));
    }
  };

  return (
    <Section title={title}>
      {pickups.map((pickup) => (
        <PickupRow
          key={pickup.id}
          pickup={pickup}
          checked={!unchecked.has(pickup.id)}
          onToggle={toggle}
          onNotice={onNotice}
        />
      ))}
      <FormMessage message={error} />
      <Button loading={isPending} onPress={() => void create()}>
        {`Crear ruta (${selected.length})`}
      </Button>
    </Section>
  );
}

function PickupRow({
  pickup,
  checked,
  onToggle,
  onNotice,
}: {
  pickup: OfertaDto;
  checked: boolean;
  onToggle: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const window = pickupWindowLabel(pickup.ventana_recogida_inicio, pickup.ventana_recogida_fin);
  return (
    <Card>
      <Pressing
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={`${pickup.codigo} · ${pickup.titulo ?? pickup.direccion_recogida}`}
        onPress={() => onToggle(pickup.id)}
        scale={1}
        surface={styles.row}
      >
        <View style={[styles.box, checked ? styles.boxChecked : null]}>
          {checked ? <Icon name="check" size={14} color={colors.surface} /> : null}
        </View>
        <View style={styles.text}>
          <Copy weight="bold">{pickup.codigo}</Copy>
          {pickup.titulo !== null ? <Copy weight="medium">{pickup.titulo}</Copy> : null}
          <Copy tone="secondary">{pickup.direccion_recogida}</Copy>
          {window !== null ? (
            <Copy tone="secondary" style={styles.small}>{`Ventana: ${window}`}</Copy>
          ) : null}
          <Copy tone="secondary" style={styles.small}>
            {formatKg(pickup.peso_estimado_kg)}
          </Copy>
        </View>
      </Pressing>
      <AbandonAssignment asignacionId={pickup.id} onDone={onNotice} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { flex: 1, gap: 2 },
  small: { fontSize: 12 },
});
