/**
 * Full-screen reader of the Terms and Conditions (`src/content/terminos.ts`). "Aceptar" is
 * shown only with `onAccept`; "Cerrar", the close icon and Android back call `onClose`.
 */
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TERMS_SECTIONS, TERMS_UPDATED_AT } from "@/content/terminos";
import { colors } from "@/design/tokens";

import { Icon } from "./icon";
import { Pressing } from "./motion";
import { Button, Copy } from "./ui";

export function TermsModal({
  visible,
  onClose,
  onAccept,
}: {
  visible: boolean;
  onClose: () => void;
  onAccept?: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Copy weight="bold" style={styles.title}>
              Términos y Condiciones
            </Copy>
            <Copy tone="secondary" style={styles.updated}>
              {`Última actualización: ${TERMS_UPDATED_AT}`}
            </Copy>
          </View>
          <Pressing
            accessibilityRole="button"
            accessibilityLabel="Cerrar términos"
            onPress={onClose}
            scale={0.92}
            surface={styles.closeButton}
          >
            <Icon name="close" size={22} color={colors.text} />
          </Pressing>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {TERMS_SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <Copy weight="bold" style={styles.sectionTitle}>
                {section.title}
              </Copy>
              {section.paragraphs.map((paragraph, index) => (
                <Copy key={index}>{paragraph}</Copy>
              ))}
            </View>
          ))}
        </ScrollView>
        <View style={styles.footer}>
          {onAccept ? <Button onPress={onAccept}>Aceptar</Button> : null}
          <Button variant="outline" onPress={onClose}>
            Cerrar
          </Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  heading: { flex: 1, gap: 2 },
  title: { fontSize: 18, lineHeight: 24 },
  updated: { fontSize: 11, lineHeight: 16 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
  },
  scroll: { flex: 1 },
  content: { padding: 24, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, lineHeight: 20 },
  footer: {
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
});
