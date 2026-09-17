import { useMobile } from "@/state/mobile-context";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Link, router, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts } from "@/design/tokens";
import { Icon, type IconName } from "./icon";

export function Copy({
  children,
  style,
  tone = "default",
  weight = "regular",
}: PropsWithChildren<{
  style?: StyleProp<TextStyle>;
  tone?: "default" | "secondary" | "primary";
  weight?: keyof typeof fonts;
}>) {
  return (
    <Text
      style={[
        styles.copy,
        {
          fontFamily: fonts[weight],
          color:
            tone === "secondary"
              ? colors.secondary
              : tone === "primary"
                ? colors.primary
                : colors.text,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Screen({
  children,
  title,
  subtitle,
  tabs,
  badge,
  back = false,
  center = false,
  viewRole,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  tabs?: "home" | "route" | "bell" | "user";
  badge?: ReactNode;
  back?: boolean;
  center?: boolean;
  viewRole?: "donor" | "volunteer";
}>) {
  const { role, setRole } = useMobile();
  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.frame}>
        <View style={styles.header}>
          {back && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={6}
              style={styles.iconButton}
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace("/pantallas")
              }
            >
              <Icon name="back" />
            </Pressable>
          )}
          <View style={styles.brand}>
            <Image
              source={require("../../../assets/brand/findfood-logo.png")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Logotipo de Find Food"
            />
            <Copy weight="semibold" style={styles.brandName}>
              Find Food
            </Copy>
          </View>
          <Link href="/cuenta" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Abrir menú de cuenta"
              onPress={() => setRole(viewRole ?? role)}
              style={styles.iconButton}
            >
              <Icon name="menu" size={19} />
            </Pressable>
          </Link>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            center && styles.centerContent,
          ]}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {title && (
            <View style={styles.heading}>
              <View style={styles.headingText}>
                <Copy weight="bold" style={styles.title}>
                  {title}
                </Copy>
                {subtitle && (
                  <Copy tone="secondary" style={styles.subtitle}>
                    {subtitle}
                  </Copy>
                )}
              </View>
              {badge}
            </View>
          )}
          {children}
        </ScrollView>
        {tabs && <BottomNav active={tabs} viewRole={viewRole} />}
      </View>
    </SafeAreaView>
  );
}

function BottomNav({
  active,
  viewRole,
}: {
  viewRole?: "donor" | "volunteer";
  active: "home" | "route" | "bell" | "user";
}) {
  const { role: currentRole, setRole } = useMobile();
  const role = viewRole ?? currentRole;
  const items: { title: string; icon: IconName; href?: Href }[] = [
    {
      title: "Inicio",
      icon: "home",
      href: role === "donor" ? "/inicio-donante" : "/inicio",
    },
    {
      title: role === "donor" ? "Donaciones" : "Rutas",
      icon: "route",
      href: role === "donor" ? "/mis-donaciones" : "/ruta-activa",
    },
    { title: "Alertas", icon: "bell", href: "/notificaciones" },
    {
      title: "Perfil",
      icon: "user",
      href: role === "donor" ? "/perfil-donante" : "/perfil-voluntario",
    },
  ];
  return (
    <View style={styles.nav}>
      {items.map((item) => {
        const selected = item.icon === active;
        const content = (
          <>
            <View style={[styles.navIcon, selected && styles.navSelected]}>
              <Icon
                name={item.icon}
                size={21}
                color={selected ? colors.primary : colors.secondary}
              />
            </View>
            <Copy
              style={styles.navLabel}
              tone={selected ? "primary" : "secondary"}
              weight={selected ? "semibold" : "regular"}
            >
              {item.title}
            </Copy>
          </>
        );
        return item.href ? (
          <Link key={item.title} href={item.href} replace asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityState={{ selected }}
              onPress={() => setRole(role)}
              style={styles.navItem}
            >
              {content}
            </Pressable>
          </Link>
        ) : (
          <View
            key={item.title}
            accessible
            accessibilityLabel="Perfil, pendiente de diseño"
            accessibilityState={{ disabled: true }}
            style={styles.navItem}
          >
            {content}
          </View>
        );
      })}
    </View>
  );
}

/** Un botón visual sin onPress: nunca ejecuta acciones de negocio. */
export function Button({
  children,
  variant = "primary",
  icon,
}: PropsWithChildren<{
  variant?: "primary" | "outline" | "danger";
  icon?: IconName;
}>) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      style={[
        styles.button,
        variant !== "primary" && styles.outline,
        variant === "danger" && styles.danger,
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          color={variant === "primary" ? colors.surface : colors.primary}
          size={19}
        />
      )}
      <Copy
        weight="bold"
        style={[
          styles.buttonText,
          {
            color:
              variant === "primary"
                ? colors.surface
                : variant === "danger"
                  ? colors.danger
                  : colors.primary,
          },
        ]}
      >
        {children}
      </Copy>
    </View>
  );
}

export function TextLink({
  children,
  href,
  align = "center",
}: PropsWithChildren<{ href: Href; align?: "left" | "center" | "right" }>) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        style={StyleSheet.flatten([
          styles.textLink,
          {
            alignItems:
              align === "left"
                ? "flex-start"
                : align === "right"
                  ? "flex-end"
                  : "center",
          },
        ])}
      >
        <Copy tone="primary" weight="medium" style={{ fontSize: 12 }}>
          {children}
        </Copy>
      </Pressable>
    </Link>
  );
}

export function NavButton({
  children,
  href,
  variant = "primary",
  showArrow = true,
}: PropsWithChildren<{
  href: Href;
  variant?: "primary" | "outline";
  showArrow?: boolean;
}>) {
  const foreground = variant === "primary" ? colors.surface : colors.primary;
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        style={StyleSheet.flatten([
          styles.button,
          variant === "outline" && styles.outline,
        ])}
      >
        <Copy weight="bold" style={[styles.buttonText, { color: foreground }]}>
          {children}
        </Copy>
        {showArrow && <Icon name="arrow" color={foreground} size={18} />}
      </Pressable>
    </Link>
  );
}

export function Field({
  label,
  value,
  select = false,
  secure = false,
  multiline = false,
  grow = false,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  select?: boolean;
  secure?: boolean;
  multiline?: boolean;
  grow?: boolean;
  onChangeText?: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={[styles.field, grow && { flex: 1 }]}>
      <Copy style={styles.label} weight="bold">
        {label}
      </Copy>
      <View
        style={[
          styles.inputRow,
          multiline && { minHeight: 88, alignItems: "flex-start" },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          editable={!!onChangeText}
          selectTextOnFocus={false}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={secure}
          multiline={multiline}
          style={[
            styles.input,
            multiline && { minHeight: 62, textAlignVertical: "top" },
          ]}
        />
        {(select || secure) && (
          <Icon
            name={secure ? "eye" : "chevron"}
            size={16}
            color={colors.secondary}
          />
        )}
      </View>
    </View>
  );
}

export function Section({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Copy weight="semibold" style={styles.sectionTitle}>
        {title}
      </Copy>
      {children}
    </View>
  );
}

export function Card({
  children,
  soft = false,
  style,
}: PropsWithChildren<{ soft?: boolean; style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      style={[
        styles.card,
        soft && { backgroundColor: colors.soft, borderColor: colors.soft },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Row({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.row, style]}>{children}</View>;
}
export function Stack({
  children,
  gap = 16,
}: PropsWithChildren<{ gap?: number }>) {
  return <View style={{ gap }}>{children}</View>;
}
export function Badge({
  children,
  warning = false,
}: PropsWithChildren<{ warning?: boolean }>) {
  return (
    <View
      style={[styles.badge, warning && { backgroundColor: colors.warningSoft }]}
    >
      <Copy
        weight="medium"
        style={[
          styles.badgeText,
          { color: warning ? colors.warning : colors.primary },
        ]}
      >
        {children}
      </Copy>
    </View>
  );
}
export function Choices({
  values,
  selected = 0,
}: {
  values: string[];
  selected?: number;
}) {
  return (
    <View style={styles.choices}>
      {values.map((v, i) => (
        <View
          key={v}
          accessible
          accessibilityState={{ selected: i === selected, disabled: true }}
          style={[styles.choice, i === selected && styles.choiceSelected]}
        >
          <Copy
            style={{ fontSize: 12 }}
            tone={i === selected ? "primary" : "secondary"}
            weight={i === selected ? "semibold" : "regular"}
          >
            {v}
          </Copy>
        </View>
      ))}
    </View>
  );
}
export function PhotoPlaceholder({
  label = "Fotografía",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: espacio de imagen sin captura activa`}
      style={[styles.photo, compact && { minHeight: 48 }]}
    >
      <Icon name="camera" size={30} color={colors.secondary} />
    </View>
  );
}
export function Detail({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: IconName;
}) {
  return (
    <Row>
      {icon && <Icon name={icon} size={18} />}
      <View style={{ flex: 1, gap: 4 }}>
        <Copy tone="secondary" style={styles.label}>
          {label}
        </Copy>
        <Copy weight="medium">{value}</Copy>
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: colors.surface,
  },
  header: {
    paddingHorizontal: 16,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  brand: { flexDirection: "row", alignItems: "center", flex: 1, gap: 7 },
  logo: { width: 33, height: 33 },
  brandName: { fontSize: 14 },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 24,
    flexGrow: 1,
  },
  centerContent: { paddingTop: 32 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 2,
  },
  headingText: { flex: 1, gap: 6 },
  title: { fontSize: 24, lineHeight: 31, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, lineHeight: 18 },
  copy: { fontSize: 13, lineHeight: 20 },
  field: { gap: 9 },
  label: { fontSize: 11, lineHeight: 18 },
  inputRow: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    paddingVertical: 13,
    minWidth: 0,
  },
  button: {
    minHeight: 52,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  buttonText: { fontSize: 13, textAlign: "center", flexShrink: 1 },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: { borderColor: "#E7CACA", backgroundColor: colors.surface },
  textLink: { minHeight: 44, justifyContent: "center" },
  section: { gap: 14 },
  sectionTitle: { fontSize: 15, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 18,
    gap: 14,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.soft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, lineHeight: 16 },
  choices: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  choice: {
    borderRadius: 8,
    paddingHorizontal: 13,
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.soft },
  photo: {
    minHeight: 150,
    backgroundColor: colors.muted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: 8,
    paddingBottom: 8,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    gap: 2,
  },
  navIcon: { paddingHorizontal: 18, paddingVertical: 5, borderRadius: 16 },
  navSelected: { backgroundColor: colors.soft },
  navLabel: { fontSize: 10, lineHeight: 16 },
});

/** Selector local reutilizable; su valor pertenece al formulario, sin persistencia. */
export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Copy style={styles.label} weight="bold">
        {label}
      </Copy>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${options.find((o) => o.value === value)?.label ?? "Selecciona"}`}
        onPress={() => setOpen(true)}
        style={styles.inputRow}
      >
        <Copy style={{ flex: 1 }} tone="secondary">
          {options.find((o) => o.value === value)?.label ?? "Selecciona"}
        </Copy>
        <Icon name="chevron" size={16} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000055",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 20,
              gap: 8,
            }}
          >
            <Copy weight="bold">{label}</Copy>
            {options.map((o) => (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: value === o.value }}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{ minHeight: 48, justifyContent: "center" }}
              >
                <Copy tone={o.value === value ? "primary" : "default"}>
                  {o.label}
                </Copy>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              style={{ minHeight: 48, justifyContent: "center" }}
            >
              <Copy tone="primary">Cerrar</Copy>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
