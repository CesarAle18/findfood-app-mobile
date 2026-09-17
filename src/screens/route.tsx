import {
  Badge,
  Button,
  NavButton,
  TextLink,
  Card,
  Copy,
  Row,
  Screen,
  Section,
} from "@/components/findfood/ui";
import { RouteMap } from "@/components/findfood/icon";

export function ActiveRouteScreen() {
  return (
    <Screen
      title="Ruta activa"
      subtitle="R-045"
      badge={<Badge warning>En progreso</Badge>}
      tabs="route"
      viewRole="volunteer"
    >
      <RouteMap />
      <Section title="Próxima parada">
        <Card>
          <Copy weight="semibold" style={{ fontSize: 17, lineHeight: 24 }}>
            Panadería Delicias
          </Copy>
          <Copy tone="secondary">Calle 76 #15-20 · 3,2 km</Copy>
          <Row style={{ justifyContent: "space-between" }}>
            <Copy tone="secondary" style={{ fontSize: 12 }}>
              Ventana 17:00–17:30
            </Copy>
            <Badge>3 de 4</Badge>
          </Row>
        </Card>
      </Section>
      <NavButton href="/registrar-recogida" showArrow={false}>
        Llegué al destino
      </NavButton>
      <TextLink
        href={{
          pathname: "/detalle-donacion",
          params: { id: "DON-1058", view: "volunteer" },
        }}
      >
        Ver detalle
      </TextLink>
      <Button variant="outline">Contactar al donante</Button>
      <NavButton href="/entrega-voluntario" showArrow={false}>
        Finalizar viaje
      </NavButton>
    </Screen>
  );
}
