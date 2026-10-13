import { useState } from "react";
import { router } from "expo-router";

import { messageFor } from "@/api/problem-messages";
import { DateTimeField } from "@/components/findfood/date-time-field";
import { QueryContent } from "@/components/findfood/feedback";
import { PhotoField } from "@/components/findfood/photo-field";
import { Icon } from "@/components/findfood/icon";
import { LocationPicker } from "@/components/findfood/map";
import {
  MotivoField,
  motivoBody,
  validateMotivo,
  type MotivoSelection,
} from "@/components/findfood/motivo-field";
import {
  Animated,
  LayoutAnimationConfig,
  Pressing,
  enterItem,
  exitItem,
  fadeIn,
  fadeOut,
  itemLayout,
} from "@/components/findfood/motion";
import {
  Button,
  Card,
  Copy,
  Field,
  NavButton,
  Row,
  Screen,
  Section,
  SelectField,
  Stack,
} from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import {
  appendProduct,
  applyTipoAlimento,
  foodTypeOptions,
  removeProduct,
  suggestDireccion,
  unitOptions,
  type DraftProduct,
} from "@/domain/donation-draft";
import { formatCoordenada } from "@/domain/mappers/geo";
import { COLD_CHAIN_OPTIONS } from "@/domain/mappers/refrigeration";
import {
  useMotivos,
  useTiposAlimento,
  useUnidades,
  type UnidadMedidaDto,
} from "@/services/catalogos";
import { useCancelarDonacionMutation } from "@/services/donaciones";
import { useMobile } from "@/state/mobile-context";
import { View } from "react-native";

import { useDonationId } from "./donation-queries";

const COLD_CHAIN_SELECT = COLD_CHAIN_OPTIONS.map((value) => ({ label: value, value }));
const NO_UNIDADES: UnidadMedidaDto[] = [];

export function NewDonationScreen() {
  const { draft, setDraft } = useMobile();
  const tiposAlimento = useTiposAlimento();
  const { data: unidades = NO_UNIDADES } = useUnidades();
  const update = (id: number, patch: Partial<DraftProduct>) =>
    setDraft((current) => ({
      ...current,
      products: current.products.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    }));
  return (
    <Screen title="Nueva donación" subtitle="Donante" back>
      <QueryContent
        query={tiposAlimento}
        loadingLabel="Cargando productos"
        errorTitle="No pudimos cargar los productos"
      >
        {(tipos) => (
          <LayoutAnimationConfig skipEntering>
            {draft.products.map((product, index) => (
              <Animated.View
                key={product.id}
                entering={enterItem}
                exiting={exitItem}
                layout={itemLayout}
              >
                <Section title={`Producto ${index + 1}`}>
                  <SelectField
                    label="Producto"
                    value={product.tipoAlimentoId === null ? "" : String(product.tipoAlimentoId)}
                    onChange={(id) => {
                      const tipo = tipos.find((candidate) => String(candidate.id) === id);
                      if (!tipo) return;
                      setDraft((current) => ({
                        ...current,
                        products: current.products.map((p) =>
                          p.id === product.id ? applyTipoAlimento(p, tipo, unidades) : p,
                        ),
                      }));
                    }}
                    options={foodTypeOptions(tipos)}
                  />
                  <Row style={{ alignItems: "flex-end" }}>
                    <Field
                      label="Cantidad / peso"
                      value={product.quantity}
                      onChangeText={(quantity) => update(product.id, { quantity })}
                      grow
                    />
                    <View style={{ width: 110 }}>
                      <SelectField
                        label="Unidad"
                        value={product.unit}
                        options={unitOptions(unidades)}
                        onChange={(unit) =>
                          update(product.id, {
                            unit: unit as DraftProduct["unit"],
                            unitEdited: true,
                          })
                        }
                      />
                    </View>
                  </Row>
                  <DateTimeField
                    label="Fecha de vencimiento"
                    value={product.expiresOn}
                    onChange={(expiresOn) => update(product.id, { expiresOn })}
                  />
                  <SelectField
                    label="Cadena de frío"
                    value={product.coldChain}
                    options={COLD_CHAIN_SELECT}
                    onChange={(coldChain) =>
                      update(product.id, { coldChain, coldChainEdited: true })
                    }
                  />
                  <Pressing
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar producto ${index + 1}`}
                    accessibilityState={{ disabled: draft.products.length === 1 }}
                    disabled={draft.products.length === 1}
                    onPress={() =>
                      setDraft((current) => removeProduct(current, product.id))
                    }
                    scale={1}
                    opacity={draft.products.length === 1 ? 0.5 : 1}
                    surface={{ minHeight: 48, justifyContent: "center" }}
                  >
                    <Copy style={{ color: colors.danger }}>Quitar producto</Copy>
                  </Pressing>
                  {draft.products.length === 1 && (
                    <Animated.View entering={fadeIn} exiting={fadeOut}>
                      <Copy tone="secondary">
                        La donación debe tener al menos un producto.
                      </Copy>
                    </Animated.View>
                  )}
                  <Section title="Fotografía">
                    <PhotoField
                      label={`Foto del producto ${index + 1}`}
                      mode="file"
                      proposito="PRODUCTO"
                      compact
                    />
                  </Section>
                </Section>
              </Animated.View>
            ))}
          </LayoutAnimationConfig>
        )}
      </QueryContent>
      <Pressing
        accessibilityRole="button"
        onPress={() => setDraft(appendProduct)}
        surface={{
          minHeight: 52,
          borderWidth: 1,
          borderColor: colors.primary,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Copy tone="primary" weight="bold">
          Añadir otro producto
        </Copy>
      </Pressing>
      <Section title="Ventana de recogida">
        <Row>
          <DateTimeField
            mode="time"
            label="Desde"
            value={draft.pickupFrom}
            onChange={(pickupFrom) =>
              setDraft((current) => ({ ...current, pickupFrom }))
            }
          />
          <DateTimeField
            mode="time"
            label="Hasta"
            value={draft.pickupUntil}
            onChange={(pickupUntil) =>
              setDraft((current) => ({ ...current, pickupUntil }))
            }
          />
        </Row>
      </Section>
      <Section title="Ubicación de la entrega">
        <Field
          label="Dirección de recogida"
          value={draft.direccion}
          placeholder="Ej. Calle 76 #15-20, Bogotá"
          maxLength={255}
          onChangeText={(direccion) =>
            setDraft((current) => ({ ...current, direccion }))
          }
        />
        <Field
          label="Referencia (opcional)"
          value={draft.referencia}
          placeholder="Ej. Portería norte"
          maxLength={500}
          onChangeText={(referencia) =>
            setDraft((current) => ({ ...current, referencia }))
          }
        />
        <LocationPicker
          value={draft.ubicacionRecogida}
          onChange={(ubicacionRecogida) =>
            setDraft((current) => ({ ...current, ubicacionRecogida }))
          }
          // Only while the address is empty: a typed address is never replaced.
          onAddressSuggestion={
            draft.direccion.trim() === ""
              ? (text) => setDraft((current) => suggestDireccion(current, text))
              : undefined
          }
        />
        <Card soft>
          <Row>
            <Icon name="pin" />
            <View style={{ flex: 1 }}>
              <Copy>
                {draft.ubicacionRecogida
                  ? `Punto elegido: ${formatCoordenada(draft.ubicacionRecogida)}`
                  : "Mueve el mapa hasta tu punto de recogida o usa tu ubicación."}
              </Copy>
              <Copy tone="secondary">
                Este punto de recogida se compartirá entre todos los productos.
              </Copy>
            </View>
          </Row>
        </Card>
      </Section>
      <NavButton href="/donante/revisar-donacion" showArrow={false}>
        Publicar donación
      </NavButton>
    </Screen>
  );
}
export function WaitingScreen() {
  const { draft } = useMobile();
  return (
    <Screen
      title="Donación publicada"
      subtitle="Tu donación está esperando aceptación."
      back
    >
      <View style={{ alignItems: "center", gap: 16, paddingVertical: 12 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.soft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="search" size={32} />
        </View>
        <Copy
          weight="semibold"
          style={{ fontSize: 17, lineHeight: 23, textAlign: "center" }}
        >
          Estamos buscando un voluntario
        </Copy>
        <Copy tone="secondary" style={{ textAlign: "center", fontSize: 12 }}>
          Te avisaremos cuando alguien acepte tu donación.
        </Copy>
      </View>
      <Section title="Resumen de la donación">
        <Card>
          {draft.products.map((product) => (
            <View key={product.id} style={{ gap: 4 }}>
              <Copy weight="semibold">
                {product.name || "Producto pendiente"}
              </Copy>
              <Copy tone="secondary">
                {product.quantity || "—"} {product.unit} · {product.coldChain}
              </Copy>
            </View>
          ))}
          <Copy tone="secondary">
            Recogida: {draft.pickupFrom}–{draft.pickupUntil}
          </Copy>
        </Card>
      </Section>
      <Card soft>
        <Copy tone="secondary" style={{ fontSize: 12 }}>
          Tiempo estimado de respuesta
        </Copy>
        <Copy weight="semibold" style={{ fontSize: 20, lineHeight: 28 }}>
          15–30 minutos
        </Copy>
      </Card>
      <Section title="Estado de la donación">
        <Stack gap={18}>
          {[
            "Donación publicada",
            "Buscando voluntario",
            "Voluntario asignado",
            "En camino a recogida",
          ].map((label, i) => (
            <Row key={label}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: i <= 1 ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: i <= 1 ? colors.primary : colors.border,
                }}
              />
              <Copy
                weight={i === 1 ? "semibold" : "regular"}
                tone={i === 1 ? "primary" : "secondary"}
              >
                {label}
              </Copy>
            </Row>
          ))}
        </Stack>
      </Section>
      <NavButton href="/donante/voluntario-asignado" showArrow={false}>
        Ver voluntario asignado (demo)
      </NavButton>
      <CancelDonation />
      <NavButton href="/donante" dismissTo variant="outline" showArrow={false}>
        Volver al inicio
      </NavButton>
    </Screen>
  );
}

/**
 * "Cancelar donación" with a CANCELACION_DONACION reason. With `?id=` (the donation UUID) it
 * calls `POST /donaciones/:id/cancelar`; without one (the demo flow) it only goes back home.
 */
function CancelDonation() {
  const id = useDonationId();
  const { data: motivos } = useMotivos("CANCELACION_DONACION");
  const { mutateAsync: cancelar, isPending } = useCancelarDonacionMutation();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<MotivoSelection>({ comentario: "" });
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const invalid = validateMotivo(selection, motivos ?? []);
    setError(invalid);
    const { motivoId } = selection;
    if (invalid !== null || motivoId === undefined) return;
    if (id !== undefined) {
      try {
        await cancelar({ id, body: motivoBody({ ...selection, motivoId }) });
      } catch (failure) {
        setError(messageFor(failure));
        return;
      }
    }
    router.dismissTo("/donante");
  };

  if (!open) {
    return (
      <Button variant="outline" onPress={() => setOpen(true)}>
        Cancelar donación
      </Button>
    );
  }
  return (
    <Section title="Cancelar donación">
      <MotivoField
        ambito="CANCELACION_DONACION"
        value={selection}
        onChange={setSelection}
        error={error}
      />
      <Button variant="danger" loading={isPending} onPress={() => void confirm()}>
        Confirmar cancelación
      </Button>
      <Button variant="outline" disabled={isPending} onPress={() => setOpen(false)}>
        No cancelar
      </Button>
    </Section>
  );
}
export function DeliveryScreen({ donor = false }: { donor?: boolean }) {
  return (
    <Screen title="Entrega en banco" subtitle="Ruta R-045" back>
      <Card soft>
        <Row>
          <Icon name="check" size={19} />
          <Copy weight="medium">Ruta completada</Copy>
        </Row>
        <Copy weight="semibold" style={{ fontSize: 19, lineHeight: 27 }}>
          4 recogidas · 118 kg
        </Copy>
      </Card>
      <Section title="Evidencia de entrega">
        <PhotoField label="Evidencia de entrega" mode="evidence" proposito="EVIDENCIA" tipo="ENTREGA" />
      </Section>
      <Stack gap={8}>
        <Copy tone="secondary" style={{ fontSize: 12 }}>
          Hora de entrega
        </Copy>
        <Copy weight="semibold" style={{ fontSize: 22, lineHeight: 30 }}>
          18:42
        </Copy>
      </Stack>
      <View style={{ flex: 1, minHeight: 20 }} />
      {donor ? (
        <NavButton href="/donante" dismissTo>
          Volver al inicio
        </NavButton>
      ) : (
        <NavButton href="/voluntario" dismissTo showArrow={false}>
          Finalizar ruta
        </NavButton>
      )}
    </Screen>
  );
}
