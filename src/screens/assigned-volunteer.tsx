import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";
import { EmptyState, QueryContent } from "@/components/findfood/feedback";
import { Card, Copy, Detail, NavButton, Screen, Section, Row } from "@/components/findfood/ui";
import { Icon } from "@/components/findfood/icon";
import { assignedVolunteerFromDetalle } from "@/domain/mappers/donations";
import { colors } from "@/design/tokens";

import { useDonationDetail, useDonationId, type DonationDetail } from "./donation-queries";

const backHome = (
  <NavButton href="/donante" dismissTo showArrow={false}>
    Volver al inicio
  </NavButton>
);

function AssignedVolunteer({ detail: { dto, view } }: { detail: DonationDetail }) {
  const volunteer = assignedVolunteerFromDetalle(dto);
  if (!volunteer) {
    return (
      <EmptyState
        icon="user"
        title="Aún no hay voluntario asignado"
        description={`${view.code} sigue buscando voluntario. Te avisaremos cuando alguien la acepte.`}
      />
    );
  }
  return (
    <>
      <Card soft><Row><Icon name="check" /><Copy weight="semibold">Tu recogida ya tiene voluntario</Copy></Row><Copy>{volunteer.name} se encargará de recoger tus productos.</Copy></Card>
      <Section title="Tu voluntario"><Card><Copy weight="bold">{volunteer.name}</Copy><Copy>{volunteer.vehicle}</Copy><Copy tone="primary">{view.status}</Copy>{volunteer.phone ? <Detail label="Teléfono" value={volunteer.phone} /> : null}</Card></Section>
      <Section title="Ubicación del voluntario">
        <Copy tone="secondary">Mapa de demostración · la ubicación en vivo aún no está disponible.</Copy>
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
      <Section title="Recogida"><Copy>{view.category}</Copy><Copy>Horario: {view.pickupWindow}</Copy><Copy tone="secondary">{view.address}</Copy></Section>
    </>
  );
}

/** Opened with `?id=` (donation UUID) once a volunteer accepts the donation. */
export function AssignedVolunteerScreen() {
  const id = useDonationId();
  const detail = useDonationDetail(id);
  return <Screen title="Voluntario asignado" subtitle="Un voluntario aceptó tu donación." back>
    {id ? (
      <QueryContent query={detail} loadingLabel="Cargando la asignación">
        {(loaded) => <AssignedVolunteer detail={loaded} />}
      </QueryContent>
    ) : (
      <EmptyState title="No encontramos la donación" description="Ábrela desde tus donaciones para ver su voluntario." />
    )}
    {backHome}
  </Screen>;
}
