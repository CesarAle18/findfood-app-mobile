import { View } from "react-native";
import {
  Card,
  Choices,
  Copy,
  Row,
  Screen,
  Stack,
} from "@/components/findfood/ui";
import { Icon } from "@/components/findfood/icon";
import { notifications } from "@/data/preview";
import { colors } from "@/design/tokens";

export function NotificationsScreen() {
  return (
    <Screen title="Notificaciones" subtitle="Últimas novedades" tabs="bell">
      <Choices values={["Todas", "Sin leer", "Importantes"]} />
      <Stack gap={12}>
        {notifications.map((item) => (
          <Card key={item.title} soft={item.highlight}>
            <Row style={{ alignItems: "flex-start" }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: item.highlight
                    ? colors.surface
                    : colors.soft,
                  borderRadius: 16,
                }}
              >
                <Icon name={item.icon} size={17} />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Copy weight="semibold">{item.title}</Copy>
                <Copy tone="secondary" style={{ fontSize: 12 }}>
                  {item.detail}
                </Copy>
                {item.time && (
                  <Copy tone="secondary" style={{ fontSize: 11 }}>
                    {item.time}
                  </Copy>
                )}
              </View>
              {item.highlight && (
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: colors.primary,
                    marginTop: 6,
                  }}
                />
              )}
            </Row>
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}
