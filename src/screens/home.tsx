import { View } from "react-native";
import {
  Badge,
  Card,
  Copy,
  NavButton,
  Row,
  Screen,
  Section,
} from "@/components/findfood/ui";
import { Icon } from "@/components/findfood/icon";
import { activity } from "@/data/preview";
import { colors } from "@/design/tokens";

export function HomeScreen() {
  return (
    <Screen
      title="Inicio"
      subtitle="Voluntario disponible"
      badge={<Badge>Disponible</Badge>}
      tabs="home"
      viewRole="volunteer"
    >
      <Card soft>
        <Copy weight="medium" style={{ fontSize: 12 }}>
          Resumen de hoy
        </Copy>
        <Row style={{ justifyContent: "space-between" }}>
          <Row>
            <Copy weight="bold" style={{ fontSize: 27, lineHeight: 34 }}>
              1
            </Copy>
            <Copy tone="secondary" style={{ fontSize: 12 }}>
              ruta activa
            </Copy>
          </Row>
          <Row>
            <Copy weight="bold" style={{ fontSize: 27, lineHeight: 34 }}>
              4
            </Copy>
            <Copy tone="secondary" style={{ fontSize: 12 }}>
              paradas
            </Copy>
          </Row>
        </Row>
      </Card>
      <Section title="Próxima ruta">
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Copy weight="semibold" style={{ fontSize: 18 }}>
              R-045
            </Copy>
            <Badge warning>En progreso</Badge>
          </Row>
          <Copy tone="secondary">Inicio 16:00 · 4 paradas</Copy>
          <Copy tone="secondary">Peso estimado: 120 kg</Copy>
          <NavButton href="/ruta-activa">Ver ruta</NavButton>
        </Card>
      </Section>
      <Section title="Actividad reciente">
        {activity.map((item) => (
          <Row key={item.title} style={{ paddingVertical: 8 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.soft,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Icon name={item.icon} size={17} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Copy weight="medium" style={{ fontSize: 12 }}>
                {item.title}
              </Copy>
              <Copy tone="secondary" style={{ fontSize: 11 }}>
                {item.detail}
              </Copy>
            </View>
          </Row>
        ))}
      </Section>
    </Screen>
  );
}
