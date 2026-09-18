import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";
import { Card, Copy, NavButton, Screen, Section, Row } from "@/components/findfood/ui";
import { Icon } from "@/components/findfood/icon";
import { useMobile } from "@/state/mobile-context";
import { colors } from "@/design/tokens";

/** Datos de presentación reemplazables por una futura asignación del backend. */
export const assignmentPreview = { vehicle: "Camioneta", eta: "15–20 minutos", status: "En camino al punto de recogida" };
export function AssignedVolunteerScreen() {
  const { data, draft } = useMobile();
  return <Screen title="Voluntario asignado" subtitle="Un voluntario aceptó tu donación." viewRole="donor" back>
    <Card soft><Row><Icon name="check" /><Copy weight="semibold">Tu recogida ya tiene voluntario</Copy></Row><Copy>{data.volunteer.name} se encargará de recoger tus productos.</Copy></Card>
    <Section title="Tu voluntario"><Card><Copy weight="bold">{data.volunteer.name}</Copy><Copy>{assignmentPreview.vehicle}</Copy><Copy tone="primary">{assignmentPreview.status}</Copy><Copy>Llegada estimada: {assignmentPreview.eta}</Copy></Card></Section>
    <Section title="Ubicación del voluntario">
      <Copy tone="secondary">Mapa de demostración · ubicación y tiempo simulados.</Copy>
      <Svg width="100%" height={264} viewBox="0 0 342 264" accessibilityLabel="Mapa de ejemplo: V indica el voluntario y D el punto de recogida del donante" role="img">
        <Rect width={342} height={264} rx={14} fill="#EEF3EE" />
        <Path d="M0 60H342M0 132H342M0 214H342M64 0V264M170 0V264M278 0V264" stroke="white" strokeWidth={18} />
        <Path d="M64 214V132H278V60" fill="none" stroke={colors.primary} strokeWidth={5} strokeLinejoin="round" />
        {[{ x: 64, y: 214, label: "V" }, { x: 278, y: 60, label: "D" }].map(point => <Circle key={point.label} cx={point.x} cy={point.y} r={18} fill={colors.primary} />)}
        <SvgText x={64} y={219} textAnchor="middle" fill="white" fontSize={15} fontWeight="bold">V</SvgText>
        <SvgText x={278} y={65} textAnchor="middle" fill="white" fontSize={15} fontWeight="bold">D</SvgText>
      </Svg>
      <Copy>V · Voluntario     D · Tu punto de recogida</Copy>
    </Section>
    <Section title="Recogida"><Copy>{draft.products.map(product => product.name || "Producto pendiente").join(", ")}</Copy><Copy>Horario: {draft.pickupFrom}–{draft.pickupUntil}</Copy></Section>
    <NavButton href="/inicio-donante" showArrow={false}>Volver al inicio</NavButton>
  </Screen>;
}
