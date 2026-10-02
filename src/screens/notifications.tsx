import { Icon } from "@/components/findfood/icon";
import {
  Animated,
  LayoutAnimationConfig,
  enterItem,
  exitItem,
  itemLayout,
} from "@/components/findfood/motion";
import {
  Card,
  Choices,
  Copy,
  Row,
  Screen,
  Stack,
} from "@/components/findfood/ui";
import { notifications } from "@/data/preview";
import { colors } from "@/design/tokens";
import { useState } from "react";
import { View } from "react-native";

export function NotificationsScreen() {
  const [filter, setFilter] = useState(0);
  return (
    <Screen title="Notificaciones" subtitle="Últimas novedades" tabs="bell">
      <Choices
        values={["Todas", "Sin leer", "Importantes"]}
        selected={filter}
        onChange={setFilter}
      />
      <Stack gap={12}>
        <LayoutAnimationConfig skipEntering>
          {notifications
            .filter(
              (item) =>
                filter === 0 ||
                (filter === 1 ? item.highlight : item.important),
            )
            .map((item) => (
              <Animated.View
                key={item.title}
                entering={enterItem}
                exiting={exitItem}
                layout={itemLayout}
              >
                <Card soft={item.highlight}>
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
              </Animated.View>
            ))}
        </LayoutAnimationConfig>
      </Stack>
    </Screen>
  );
}
