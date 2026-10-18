import { useQuery } from "@tanstack/react-query";

import { EmptyState, LoadingState } from "@/components/findfood/feedback";
import { RouteMapView } from "@/components/findfood/map";
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
import { ROUTES_IN_PROGRESS, rutaQuery, rutasQuery } from "@/services/rutas";

/** Map of the route in progress: `GET /rutas?estado=EN_CURSO`, then `GET /rutas/:id`. */
function ActiveRouteMap() {
  const rutas = useQuery(rutasQuery(ROUTES_IN_PROGRESS));
  const id = rutas.data?.datos[0]?.id;
  const ruta = useQuery({ ...rutaQuery(id ?? ""), enabled: Boolean(id) });
  if (ruta.data) {
    return <RouteMapView geometria={ruta.data.geometria} paradas={ruta.data.paradas} />;
  }
  if (rutas.isPending || (id && ruta.isPending)) {
    return <LoadingState label="Cargando el mapa de la ruta" />;
  }
  const noRoute = rutas.data !== undefined && !id;
  return (
    <EmptyState
      icon="route"
      title={noRoute ? "No tienes una ruta en curso" : "No pudimos cargar el mapa"}
      description={noRoute ? "El mapa aparece cuando inicias una ruta." : undefined}
    />
  );
}

// TODO(F3): only the map reads the API so far. Read the next stop from the same route and
// pass its `donacion_id` (UUID) to registrar-recogida and detalle-donacion. Until then the
// rest of the screen is preview data and the detail link opens its empty state.
export function ActiveRouteScreen() {
  return (
    <Screen
      title="Ruta activa"
      subtitle="R-045"
      badge={<Badge warning>En progreso</Badge>}
    >
      <ActiveRouteMap />
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
      <NavButton href="/voluntario/registrar-recogida" showArrow={false}>
        Llegué al destino
      </NavButton>
      <TextLink href="/voluntario/detalle-donacion">Ver detalle</TextLink>
      <Button variant="outline">Contactar al donante</Button>
      <NavButton href="/voluntario/entrega-voluntario" showArrow={false}>
        Finalizar viaje
      </NavButton>
    </Screen>
  );
}
