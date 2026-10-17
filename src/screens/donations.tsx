import { useState } from "react";
import { router } from "expo-router";

import { messageFor } from "@/api/problem-messages";
import type { EstadoDonacion } from "@/api/types";
import { DateTimeField } from "@/components/findfood/date-time-field";
import { EmptyState, QueryContent } from "@/components/findfood/feedback";
import { PhotoField } from "@/components/findfood/photo-field";
import { Icon, type IconName } from "@/components/findfood/icon";
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
  Badge,
  Button,
  Card,
  Copy,
  Field,
  FormMessage,
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
  productErrorKey,
  removeProduct,
  suggestDireccion,
  unitOptions,
  validateDraft,
  type DraftProduct,
} from "@/domain/donation-draft";
import { formatCoordenada } from "@/domain/mappers/geo";
import {
  COLD_CHAIN_OPTIONS,
  fromRequiereRefrigeracion,
} from "@/domain/mappers/refrigeration";
import {
  useMotivos,
  useTiposAlimento,
  useUnidades,
  type UnidadMedidaDto,
} from "@/services/catalogos";
import {
  useCancelarDonacionMutation,
  usePublicarDonacionMutation,
  type HistorialEstadoDto,
} from "@/services/donaciones";
import { useMobile } from "@/state/mobile-context";
import { StyleSheet, View } from "react-native";

import {
  PUBLISHED_POLL_MS,
  canCancel,
  formatTimeOfDay,
  isDelivered,
  isTracking,
  publishedSteps,
  useDonationDetail,
  useDonationHistory,
  useDonationId,
  type DonationDetail,
} from "./donation-queries";

const COLD_CHAIN_SELECT = COLD_CHAIN_OPTIONS.map((value) => ({ label: value, value }));
const NO_UNIDADES: UnidadMedidaDto[] = [];

/** A validation message under a control that has no `error` prop of its own. */
function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <View accessibilityLiveRegion="polite">
      <Copy style={formStyles.fieldError}>{message}</Copy>
    </View>
  );
}

const formStyles = StyleSheet.create({
  fieldError: { fontSize: 11, lineHeight: 16, color: colors.danger },
});

export function NewDonationScreen() {
  const { draft, setDraft } = useMobile();
  const tiposAlimento = useTiposAlimento();
  const { data: unidades = NO_UNIDADES } = useUnidades();
  /** When the donor last tried to continue; errors show from then on. */
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const errors = checkedAt === null ? null : validateDraft(draft, checkedAt);
  const productError = (id: number, field: Parameters<typeof productErrorKey>[1]) =>
    errors?.[productErrorKey(id, field)];
  const proceed = () => {
    const now = Date.now();
    setCheckedAt(now);
    if (validateDraft(draft, now) === null) router.push("/donante/revisar-donacion");
  };
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
                  <FieldError message={productError(product.id, "tipoAlimentoId")} />
                  <Row style={{ alignItems: "flex-start" }}>
                    <Field
                      label="Cantidad / peso"
                      value={product.quantity}
                      onChangeText={(quantity) => update(product.id, { quantity })}
                      keyboardType="decimal-pad"
                      error={productError(product.id, "quantity")}
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
                    error={productError(product.id, "expiresOn")}
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
                      onUploadedFile={({ ruta, localUri }) =>
                        update(product.id, { rutaFoto: ruta, fotoUri: localUri || null })
                      }
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
      <FieldError message={errors?.products} />
      <Section title="Ventana de recogida">
        <DateTimeField
          label="Fecha de recogida"
          value={draft.pickupDate}
          onChange={(pickupDate) =>
            setDraft((current) => ({ ...current, pickupDate }))
          }
          error={errors?.pickupDate}
        />
        <Row style={{ alignItems: "flex-start" }}>
          <DateTimeField
            mode="time"
            label="Desde"
            value={draft.pickupFrom}
            onChange={(pickupFrom) =>
              setDraft((current) => ({ ...current, pickupFrom }))
            }
            error={errors?.pickupFrom}
          />
          <DateTimeField
            mode="time"
            label="Hasta"
            value={draft.pickupUntil}
            onChange={(pickupUntil) =>
              setDraft((current) => ({ ...current, pickupUntil }))
            }
            error={errors?.pickupUntil}
          />
        </Row>
        <Copy tone="secondary">
          Si la hora de fin es anterior a la de inicio, la recogida termina al día siguiente.
        </Copy>
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
          error={errors?.direccion}
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
        <FieldError message={errors?.ubicacionRecogida} />
      </Section>
      <FormMessage
        message={errors ? "Revisa los campos marcados antes de continuar." : undefined}
      />
      <Button onPress={proceed}>Continuar</Button>
    </Screen>
  );
}
/** What the donor reads under the icon, by state. */
const WAITING_HEADLINE: Record<EstadoDonacion, [IconName, string, string]> = {
  BORRADOR: ["box", "Tu donación aún no se ha publicado", "Publícala para que un voluntario la acepte."],
  PUBLICADA: [
    "search",
    "Estamos buscando un voluntario",
    "Te avisaremos cuando alguien acepte tu donación.",
  ],
  ASIGNADA: ["user", "Un voluntario aceptó tu donación", "Pronto irá a recogerla."],
  EN_RECOLECCION: ["truck", "El voluntario va en camino", "Va a recoger tu donación."],
  EN_TRANSITO: ["truck", "Tu donación va en camino", "El voluntario la lleva al banco de alimentos."],
  ENTREGADA: ["check", "Tu donación fue entregada", "Gracias por donar."],
  RECIBIDA: ["check", "Tu donación fue recibida", "El banco de alimentos la recibió."],
  RECHAZADA: ["bell", "El banco no pudo recibir tu donación", "Revisa el detalle de la donación."],
  CANCELADA: ["box", "Cancelaste esta donación", "Ya no está visible para los voluntarios."],
  EXPIRADA: [
    "clock",
    "La publicación venció",
    "Ningún voluntario la aceptó a tiempo. Puedes volver a publicarla.",
  ],
};

/** From ASIGNADA on, a volunteer has (or had) the donation. */
const hasVolunteer = (estado: EstadoDonacion) =>
  estado !== "PUBLICADA" && (isTracking(estado) || isDelivered(estado));

const NO_HISTORY: HistorialEstadoDto[] = [];

export function WaitingScreen() {
  const id = useDonationId();
  // Polls every 15 s while PUBLICADA; a received push about it refreshes it at once.
  const detail = useDonationDetail(id, { live: true });
  const estado = detail.data?.dto.estado;
  const { data: historial = NO_HISTORY } = useDonationHistory(
    id,
    estado === "PUBLICADA" ? PUBLISHED_POLL_MS : false,
  );
  return (
    <Screen title="Donación publicada" subtitle="Sigue el estado de tu donación" back>
      {id ? (
        <QueryContent query={detail} loadingLabel="Cargando la donación">
          {(loaded) => <Waiting detail={loaded} historial={historial} />}
        </QueryContent>
      ) : (
        <EmptyState
          title="No encontramos la donación"
          description="Ábrela de nuevo desde Mis donaciones."
          action={
            <NavButton href="/donante/donaciones" dismissTo showArrow={false}>
              Ir a Mis donaciones
            </NavButton>
          }
        />
      )}
      <NavButton href="/donante" dismissTo variant="outline" showArrow={false}>
        Volver al inicio
      </NavButton>
    </Screen>
  );
}

function Waiting({
  detail: { dto, view: d },
  historial,
}: {
  detail: DonationDetail;
  historial: readonly HistorialEstadoDto[];
}) {
  const [icon, title, description] = WAITING_HEADLINE[d.estado] ?? ["box", d.status, ""];
  const expiresAt = d.estado === "PUBLICADA" ? formatTimeOfDay(dto.expira_publicacion_at) : null;
  return (
    <>
      <View style={waitingStyles.hero}>
        <View style={waitingStyles.heroIcon}>
          <Icon name={icon} size={32} />
        </View>
        <Copy weight="semibold" style={waitingStyles.heroTitle}>
          {title}
        </Copy>
        {description ? (
          <Copy tone="secondary" style={waitingStyles.heroText}>
            {description}
          </Copy>
        ) : null}
      </View>
      <Section title="Resumen de la donación">
        <Card>
          <Row style={waitingStyles.spread}>
            <Copy weight="bold">{d.code}</Copy>
            <Badge warning={d.statusTone === "warning"}>{d.status}</Badge>
          </Row>
          {dto.items.map((item) => (
            <View key={item.id} style={waitingStyles.item}>
              <Copy weight="semibold">{item.tipo_alimento.nombre}</Copy>
              <Copy tone="secondary">
                {`${item.cantidad} ${item.unidad_medida.nombre} · ${fromRequiereRefrigeracion(item.requiere_refrigeracion)}`}
              </Copy>
            </View>
          ))}
          <Copy tone="secondary">Recogida: {d.pickupWindow}</Copy>
        </Card>
      </Section>
      {expiresAt ? (
        <Card soft>
          <Copy weight="semibold">La publicación vence a las {expiresAt}</Copy>
        </Card>
      ) : null}
      {d.estado === "CANCELADA" ? <CancellationReason dto={dto} /> : null}
      <Section title="Estado de la donación">
        <Stack gap={18}>
          {publishedSteps(dto, historial).map((step) => (
            <Row key={step.label}>
              <View
                style={[
                  waitingStyles.dot,
                  step.reached || step.current ? waitingStyles.dotReached : null,
                ]}
              />
              <View style={waitingStyles.stepText}>
                <Copy
                  weight={step.current ? "semibold" : "regular"}
                  tone={step.reached || step.current ? "primary" : "secondary"}
                >
                  {step.label}
                </Copy>
                {step.at ? <Copy tone="secondary">{step.at}</Copy> : null}
              </View>
            </Row>
          ))}
        </Stack>
      </Section>
      {hasVolunteer(d.estado) ? (
        <Button
          onPress={() =>
            router.replace({ pathname: "/donante/voluntario-asignado", params: { id: d.id } })
          }
        >
          Ver voluntario asignado
        </Button>
      ) : null}
      {d.estado === "EXPIRADA" ? <Republish id={d.id} /> : null}
      {canCancel(d.estado) ? <CancelDonation id={d.id} /> : null}
    </>
  );
}

function CancellationReason({ dto }: { dto: DonationDetail["dto"] }) {
  return (
    <Card soft>
      <Copy weight="semibold">Motivo de la cancelación</Copy>
      <Copy>{dto.motivo_cancelacion?.nombre ?? "Sin motivo registrado"}</Copy>
      {dto.observacion_cancelacion ? (
        <Copy tone="secondary">{dto.observacion_cancelacion}</Copy>
      ) : null}
    </Card>
  );
}

/** "Volver a publicar" an EXPIRADA donation; the detail refetches into PUBLICADA. */
function Republish({ id }: { id: string }) {
  const { mutateAsync: publicar, isPending } = usePublicarDonacionMutation();
  const [error, setError] = useState<string | null>(null);
  const republish = async () => {
    setError(null);
    try {
      await publicar(id);
    } catch (failure) {
      setError(messageFor(failure));
    }
  };
  return (
    <>
      <FormMessage message={error ?? undefined} />
      <Button loading={isPending} onPress={() => void republish()}>
        Volver a publicar
      </Button>
    </>
  );
}

const waitingStyles = StyleSheet.create({
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
  spread: { justifyContent: "space-between" },
  item: { gap: 4 },
  stepText: { flex: 1 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dotReached: { backgroundColor: colors.primary, borderColor: colors.primary },
});

/**
 * "Cancelar donación" with a CANCELACION_DONACION reason: `POST /donaciones/:id/cancelar`,
 * then back home.
 */
function CancelDonation({ id }: { id: string }) {
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
    try {
      await cancelar({ id, body: motivoBody({ ...selection, motivoId }) });
    } catch (failure) {
      setError(messageFor(failure));
      return;
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
/** The volunteer hands the route over at the bank; the donor has `DonorDeliveryScreen`. */
export function DeliveryScreen() {
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
      <NavButton href="/voluntario" dismissTo showArrow={false}>
        Finalizar ruta
      </NavButton>
    </Screen>
  );
}
