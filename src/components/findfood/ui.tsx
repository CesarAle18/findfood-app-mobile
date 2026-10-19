import { colors, fonts } from "@/design/tokens";
import { Link, router, type Href } from "expo-router";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edges } from "react-native-safe-area-context";
import { Icon, type IconName } from "./icon";
import {
  Animated,
  Pressing,
  dialogEnter,
  useActiveStyle,
  useRotation,
} from "./motion";

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

/**
 * Safe-area edges of the screen frame. On iOS the bottom edge is left to the scroll view
 * (`contentInsetAdjustmentBehavior`), so content scrolls behind the home indicator and the
 * translucent native tab bar. Android native tabs already lay their screens out above the
 * tab bar, where this edge measures nothing; on stack screens it clears the navigation bar.
 */
const SAFE_AREA_EDGES: Edges =
  Platform.OS === "ios"
    ? ["top", "left", "right"]
    : ["top", "left", "right", "bottom"];

export function Screen({
  children,
  title,
  subtitle,
  badge,
  back = false,
  center = false,
  scroll = true,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  badge?: ReactNode;
  back?: boolean;
  center?: boolean;
  /**
   * False for a screen whose body is a virtualized list: the heading and children fill the
   * frame without a ScrollView, and the list scrolls (and pads its bottom) on its own.
   */
  scroll?: boolean;
}>) {
  const heading = title ? (
    <View style={styles.heading}>
      <View style={styles.headingText}>
        <Copy weight="bold" style={styles.title}>
          {title}
        </Copy>
        {subtitle ? (
          <Copy tone="secondary" style={styles.subtitle}>
            {subtitle}
          </Copy>
        ) : null}
      </View>
      {badge}
    </View>
  ) : null;
  return (
    <SafeAreaView style={styles.safe} edges={SAFE_AREA_EDGES}>
      <View style={styles.frame}>
        <View style={styles.header}>
          {back ? (
            <Pressing
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={6}
              surface={styles.iconButton}
              // Without history (a cold deep link), the gate opens the right home.
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/")
              }
            >
              <Icon name="back" />
            </Pressing>
          ) : null}
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
            <Pressing
              accessibilityRole="link"
              accessibilityLabel="Abrir menú de cuenta"
              surface={styles.iconButton}
            >
              <Icon name="menu" size={32} />
            </Pressing>
          </Link>
        </View>
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              center && styles.centerContent,
            ]}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {heading}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.fixedContent]}>
            {heading}
            {children}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

/**
 * Action button. Without `onPress` it is visual only and stays disabled, as in the
 * prototype. `loading` shows an indicator and blocks repeated presses.
 */
export function Button({
  children,
  variant = "primary",
  icon,
  onPress,
  loading = false,
  disabled = false,
}: PropsWithChildren<{
  variant?: "primary" | "outline" | "danger";
  icon?: IconName;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
}>) {
  const surface = [
    styles.button,
    variant !== "primary" && styles.outline,
    variant === "danger" && styles.danger,
  ];
  const content = (
    <>
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.surface : colors.primary}
          size="small"
        />
      ) : icon ? (
        <Icon
          name={icon}
          color={variant === "primary" ? colors.surface : colors.primary}
          size={19}
        />
      ) : null}
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
    </>
  );
  if (!onPress) {
    return (
      <View
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        style={surface}
      >
        {content}
      </View>
    );
  }
  const inactive = disabled || loading;
  return (
    <Pressing
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      // aria-busy instead of accessibilityState.busy: react-native-web only reads aria-*.
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      opacity={disabled && !loading ? 0.45 : 1}
      surface={surface}
    >
      {content}
    </Pressing>
  );
}

/**
 * Link options shared by TextLink and NavButton. `dismissTo` goes back down the stack to
 * `href` (a tab of the segment, or an earlier screen) instead of pushing another copy; use it
 * from stacked screens to return to a tab.
 */
interface LinkOptions {
  href: Href;
  dismissTo?: boolean;
}

export function TextLink({
  children,
  href,
  dismissTo = false,
  align = "center",
}: PropsWithChildren<LinkOptions & { align?: "left" | "center" | "right" }>) {
  return (
    <Link href={href} dismissTo={dismissTo} asChild>
      <Pressing
        accessibilityRole="link"
        scale={1}
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
      </Pressing>
    </Link>
  );
}

export function NavButton({
  children,
  href,
  dismissTo = false,
  variant = "primary",
  showArrow = true,
}: PropsWithChildren<
  LinkOptions & {
    variant?: "primary" | "outline";
    showArrow?: boolean;
  }
>) {
  const foreground = variant === "primary" ? colors.surface : colors.primary;
  return (
    <Link href={href} dismissTo={dismissTo} asChild>
      <Pressing
        accessibilityRole="link"
        surface={StyleSheet.flatten([
          styles.button,
          variant === "outline" && styles.outline,
        ])}
      >
        <Copy weight="bold" style={[styles.buttonText, { color: foreground }]}>
          {children}
        </Copy>
        {showArrow && <Icon name="arrow" color={foreground} size={18} />}
      </Pressing>
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
  error,
  accessibilityHint,
  onBlur,
  onSubmitEditing,
  keyboardType,
  autoComplete,
  textContentType,
  autoCapitalize,
  returnKeyType,
  maxLength,
}: {
  label: string;
  value: string;
  select?: boolean;
  secure?: boolean;
  multiline?: boolean;
  grow?: boolean;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  /** Validation message: shown below the input and announced with it. */
  error?: string;
  accessibilityHint?: string;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
} & Pick<
  TextInputProps,
  | "keyboardType"
  | "autoComplete"
  | "textContentType"
  | "autoCapitalize"
  | "returnKeyType"
  | "maxLength"
>) {
  const [focused, setFocused] = useState(false);
  // Only a secure field can be revealed; the eye toggles it.
  const [revealed, setRevealed] = useState(false);
  const focusBorder = useActiveStyle(focused, { border: true });
  const hint =
    [error, accessibilityHint].filter(Boolean).join(" ") || undefined;
  return (
    <View style={[styles.field, grow && { flex: 1 }]}>
      <Copy style={styles.label} weight="bold">
        {label}
      </Copy>
      <Animated.View
        style={[
          styles.inputRow,
          multiline && { minHeight: 88, alignItems: "flex-start" },
          focusBorder,
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          aria-invalid={error ? true : undefined}
          editable={!!onChangeText}
          selectTextOnFocus={false}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          secureTextEntry={secure && !revealed}
          multiline={multiline}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          textContentType={textContentType}
          autoCapitalize={autoCapitalize}
          returnKeyType={returnKeyType}
          maxLength={maxLength}
          style={[
            styles.input,
            multiline && { minHeight: 62, textAlignVertical: "top" },
          ]}
        />
        {secure ? (
          <Pressing
            accessibilityRole="button"
            accessibilityLabel={
              revealed ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            accessibilityState={{ checked: revealed }}
            hitSlop={12}
            scale={0.9}
            onPress={() => setRevealed((r) => !r)}
            surface={styles.revealButton}
          >
            <Icon
              name={revealed ? "eye-off" : "eye"}
              size={18}
              color={colors.secondary}
            />
          </Pressing>
        ) : select ? (
          <Icon name="chevron" size={16} color={colors.secondary} />
        ) : null}
      </Animated.View>
      {error ? (
        <View accessibilityLiveRegion="polite">
          <Copy style={styles.fieldError}>{error}</Copy>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A message about the whole form (an error that belongs to no single field, a progress note
 * or a confirmation), announced when it appears. Renders nothing without a message.
 */
export function FormMessage({
  message,
  tone = "error",
}: {
  message: string | undefined;
  tone?: "error" | "info" | "success";
}) {
  if (!message) return null;
  return (
    <View
      accessible
      accessibilityRole={tone === "error" ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      style={[
        styles.formMessage,
        tone === "info" && styles.formMessageInfo,
        tone === "success" && styles.formMessageSuccess,
      ]}
    >
      <Copy
        weight="medium"
        style={{
          color:
            tone === "error" ? colors.danger : tone === "info" ? colors.secondary : colors.primary,
        }}
      >
        {message}
      </Copy>
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
/**
 * Opción seleccionable con transición de color. Base de Choices y de cualquier
 * lista de etiquetas elegibles, para no repetir la lógica de animación.
 */
export function Chip({
  label,
  selected,
  disabled = false,
  role = "radio",
  onPress,
  style,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  role?: "radio" | "checkbox";
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const selection = useActiveStyle(selected, { border: true, fill: true });
  const faded = useActiveStyle(disabled, { dim: true });
  return (
    <Animated.View style={faded}>
      <Pressing
        accessible
        accessibilityRole={role}
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        surface={[styles.choice, style, selection]}
      >
        <Copy
          style={{ fontSize: 12 }}
          tone={selected ? "primary" : "secondary"}
          weight={selected ? "semibold" : "regular"}
        >
          {label}
        </Copy>
      </Pressing>
    </Animated.View>
  );
}
export function Choices({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected?: number;
  onChange?: (index: number) => void;
}) {
  const [local, setLocal] = useState(0);
  const active = selected ?? local;
  return (
    <View style={styles.choices}>
      {values.map((v, i) => (
        <Chip
          key={v}
          label={v}
          role="radio"
          selected={i === active}
          onPress={() => {
            setLocal(i);
            onChange?.(i);
          }}
        />
      ))}
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
  fixedContent: { flex: 1, paddingBottom: 0 },
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
  fieldError: { fontSize: 11, lineHeight: 16, color: colors.danger },
  formMessage: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formMessageInfo: { borderColor: colors.border, backgroundColor: colors.muted },
  formMessageSuccess: { borderColor: colors.soft, backgroundColor: colors.soft },
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
  // A 40pt target inside the 48pt row; hitSlop extends it to the row's edge.
  revealButton: {
    width: 40,
    height: 40,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
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
  const openBorder = useActiveStyle(open, { border: true });
  const chevron = useRotation(open);
  return (
    <View style={styles.field}>
      <Copy style={styles.label} weight="bold">
        {label}
      </Copy>
      <Pressing
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${options.find((o) => o.value === value)?.label ?? "Selecciona"}`}
        onPress={() => setOpen(true)}
        surface={[styles.inputRow, openBorder]}
      >
        <Copy style={{ flex: 1 }} tone="secondary">
          {options.find((o) => o.value === value)?.label ?? "Selecciona"}
        </Copy>
        <Animated.View style={chevron}>
          <Icon name="chevron" size={16} />
        </Animated.View>
      </Pressing>
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
          <Animated.View
            accessibilityViewIsModal
            entering={dialogEnter}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 20,
              gap: 8,
              maxHeight: "85%",
              width: "100%",
              maxWidth: 480,
              alignSelf: "center",
            }}
          >
            <Copy weight="bold">{label}</Copy>
            <ScrollView>
              {options.map((o) => (
                <Pressing
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: value === o.value }}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  scale={1}
                  surface={{ minHeight: 48, justifyContent: "center" }}
                >
                  <Copy tone={o.value === value ? "primary" : "default"}>
                    {o.label}
                  </Copy>
                </Pressing>
              ))}
            </ScrollView>
            <Pressing
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              scale={1}
              surface={{ minHeight: 48, justifyContent: "center" }}
            >
              <Copy tone="primary">Cerrar</Copy>
            </Pressing>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
