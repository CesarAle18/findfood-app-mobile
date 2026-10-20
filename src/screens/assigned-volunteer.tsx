import { CallButton } from "@/components/findfood/call-button";
import { EmptyState, QueryContent } from "@/components/findfood/feedback";
import {
  Card,
  Copy,
  Detail,
  NavButton,
  Screen,
  Section,
  Row,
} from "@/components/findfood/ui";
import { Icon } from "@/components/findfood/icon";
import { PointMap } from "@/components/findfood/map";
import { assignedVolunteerFromDetalle } from "@/domain/mappers/donations";

import { useDonationDetail, useDonationId, type DonationDetail } from "./donation-queries";

const backHome = (
  <NavButton href="/donante" dismissTo showArrow={false}>
    Volver al inicio
  </NavButton>
);

/** "Contactar voluntario": dials the volunteer once the API shares the phone (after acceptance). */
export function ContactVolunteerButton({ phone }: { phone: string }) {
  return <CallButton phone={phone} label="Contactar voluntario" />;
}

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
      <Card soft>
        <Row>
          <Icon name="check" />
          <Copy weight="semibold">Tu recogida ya tiene voluntario</Copy>
        </Row>
        <Copy>{volunteer.name} se encargará de recoger tus productos.</Copy>
      </Card>
      <Section title="Tu voluntario">
        <Card>
          <Copy weight="bold">{volunteer.name}</Copy>
          <Copy>{volunteer.vehicle}</Copy>
          <Copy tone="primary">{view.status}</Copy>
          {volunteer.phone ? <Detail label="Teléfono" value={volunteer.phone} /> : null}
        </Card>
        {volunteer.phone ? <ContactVolunteerButton phone={volunteer.phone} /> : null}
      </Section>
      <Section title="Punto de recogida">
        <PointMap point={dto.ubicacion_recogida} title="Tu punto de recogida" />
        {/* Live location waits for API-06. */}
        <Copy tone="secondary">La ubicación en vivo del voluntario aún no está disponible.</Copy>
      </Section>
      <Section title="Recogida">
        <Copy>{view.category}</Copy>
        <Copy>Horario: {view.pickupWindow}</Copy>
        <Copy tone="secondary">{view.address}</Copy>
      </Section>
    </>
  );
}

/** Opened with `?id=` (donation UUID) once a volunteer accepts the donation. */
export function AssignedVolunteerScreen() {
  const id = useDonationId();
  const detail = useDonationDetail(id);
  return (
    <Screen title="Voluntario asignado" subtitle="Un voluntario aceptó tu donación." back>
      {id ? (
        <QueryContent query={detail} loadingLabel="Cargando la asignación">
          {(loaded) => <AssignedVolunteer detail={loaded} />}
        </QueryContent>
      ) : (
        <EmptyState
          title="No encontramos la donación"
          description="Ábrela desde tus donaciones para ver su voluntario."
        />
      )}
      {backHome}
    </Screen>
  );
}
