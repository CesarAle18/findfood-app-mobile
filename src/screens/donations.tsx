import { DateTimeField } from "@/components/findfood/date-time-field";
import { Icon } from "@/components/findfood/icon";
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
  Card,
  Copy,
  Field,
  NavButton,
  PhotoPlaceholder,
  Row,
  Screen,
  Section,
  SelectField,
  Stack,
} from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import {
  appendProduct,
  productOptions,
  removeProduct,
  type DraftProduct,
} from "@/domain/donation-draft";
import { useMobile } from "@/state/mobile-context";
import { View } from "react-native";

export function NewDonationScreen() {
  const { draft, setDraft } = useMobile();
  const update = (id: number, patch: Partial<DraftProduct>) =>
    setDraft((current) => ({
      ...current,
      products: current.products.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    }));
  return (
    <Screen title="Nueva donación" subtitle="Donante" back>
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
                value={product.name}
                onChange={(name) => update(product.id, { name })}
                options={productOptions}
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
                    options={["KG", "L", "ML", "G"].map((value) => ({
                      label: value,
                      value,
                    }))}
                    onChange={(unit) =>
                      update(product.id, { unit: unit as DraftProduct["unit"] })
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
                options={["Refrigerado", "No requiere"].map((value) => ({
                  label: value,
                  value,
                }))}
                onChange={(coldChain) => update(product.id, { coldChain })}
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
                <PhotoPlaceholder compact />
              </Section>
            </Section>
          </Animated.View>
        ))}
      </LayoutAnimationConfig>
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
        <Card soft>
          <Row>
            <Icon name="pin" />
            <View style={{ flex: 1 }}>
              <Copy>Ubicación pendiente de seleccionar en el mapa</Copy>
              <Copy tone="secondary">
                Este punto de recogida se compartirá entre todos los productos.
              </Copy>
            </View>
          </Row>
        </Card>
      </Section>
      <NavButton href="/revisar-donacion" showArrow={false}>
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
      <NavButton href="/voluntario-asignado" showArrow={false}>
        Ver voluntario asignado (demo)
      </NavButton>
      <NavButton href="/inicio-donante" variant="outline" showArrow={false}>
        Cancelar donación
      </NavButton>
    </Screen>
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
        <PhotoPlaceholder label="Evidencia de entrega" />
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
        <NavButton href="/inicio">Volver al inicio</NavButton>
      ) : (
        <NavButton href="/inicio" showArrow={false}>
          Finalizar ruta
        </NavButton>
      )}
    </Screen>
  );
}
