import { Icon } from "@/components/findfood/icon";
import { Pressing } from "@/components/findfood/motion";
import { Card, Copy, Screen, Section } from "@/components/findfood/ui";
import { previewScreens } from "@/data/preview";
import { colors } from "@/design/tokens";
import { Link } from "expo-router";
import { View } from "react-native";

/** Galería auxiliar para revisar el cascarón sin activar acciones de negocio. */
export default function PreviewGallery() {
  return (
    <Screen
      title="Pantallas móviles"
      subtitle="Galería de revisión · 22 diseños de Figma"
      back
    >
      <Card soft>
        <Copy weight="semibold">Vista de demostración</Copy>
        <Copy tone="secondary" style={{ fontSize: 12 }}>
          Los datos son ejemplos. La navegación y algunos controles son locales.
          No se envían formularios ni se conectan servicios.
        </Copy>
      </Card>
      {previewScreens.map((group) => (
        <Section key={group.group} title={group.group}>
          {group.screens.map((screen) => (
            <Link key={screen.href.toString()} href={screen.href} asChild>
              <Pressing
                accessibilityRole="link"
                surface={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  minHeight: 56,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Copy weight="medium">{screen.title}</Copy>
                  <Copy tone="secondary" style={{ fontSize: 10 }}>
                    {screen.frame}
                  </Copy>
                </View>
                <Icon name="chevron" size={17} />
              </Pressing>
            </Link>
          ))}
        </Section>
      ))}
    </Screen>
  );
}
