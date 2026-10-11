import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { authErrorMessages } from "@/api/problem-messages";
import {
  AUTH_UNAVAILABLE_CODE,
  isEmailAuthAvailable,
  requestPasswordReset,
  signIn,
  signUp,
} from "@/auth/email-auth";
import {
  Button,
  Card,
  Copy,
  Field,
  FormMessage,
  Row,
  Screen,
  Stack,
  TextLink,
} from "@/components/findfood/ui";
import { Icon } from "@/components/findfood/icon";
import { Pressing } from "@/components/findfood/motion";
import { colors } from "@/design/tokens";
import { forgotPasswordSchema, loginSchema, registerSchema } from "@/domain/validation/auth";
import { useZodForm } from "@/hooks/use-zod-form";

/**
 * `/verificar-correo` params. `origen=registro`: a sign-up just made Supabase send a code
 * (the screen also shows the neutral note). `enviar=1`: no code was sent yet, the screen
 * sends one when it opens.
 */
export const SIGN_UP_ORIGIN = "registro";
export const SEND_CODE = "1";

/**
 * Opens the code verification for `email`, right away: after a sign-up Supabase already sent
 * the code; after a sign-in with an unconfirmed email the verification sends a fresh one
 * itself and shows how that went. After a successful sign-in or sign-up with a session, the
 * screens never navigate: the session change closes the auth screens and the root guards open
 * the account's home.
 */
function openVerification(email: string, after: "sign-in" | "sign-up") {
  router.push({
    pathname: "/verificar-correo",
    params:
      after === "sign-up" ? { email, origen: SIGN_UP_ORIGIN } : { email, enviar: SEND_CODE },
  });
}

/** Field props that stay read-only (no onChangeText) while email auth is unavailable. */
function editableIf<TProps extends { onChangeText: (text: string) => void }>(
  available: boolean,
  props: TProps,
): Omit<TProps, "onChangeText"> & { onChangeText?: (text: string) => void } {
  return available ? props : { ...props, onChangeText: undefined };
}

/** Shown instead of a working form in the local profile (no Supabase, dev token). */
function LocalProfileNotice() {
  return (
    <Card soft>
      <Copy tone="secondary" style={{ fontSize: 12 }}>
        {authErrorMessages.auth_unavailable}
      </Copy>
    </Card>
  );
}

const LOGIN_INITIAL = { email: "", password: "" };

export function LoginScreen() {
  const available = isEmailAuthAvailable();
  const form = useZodForm(loginSchema, LOGIN_INITIAL);
  const submit = form.handleSubmit(async (credentials) => {
    try {
      await signIn(credentials);
    } catch (error) {
      if (!isAuthError(error) || error.code !== "email_not_confirmed") throw error;
      // The first code may have expired: the verification sends a fresh one.
      openVerification(credentials.email, "sign-in");
    }
  });
  const input = (name: keyof typeof LOGIN_INITIAL) => editableIf(available, form.field(name));

  return (
    <Screen center>
      <View style={{ gap: 9, marginTop: 12, marginBottom: 12 }}>
        <Copy weight="bold" style={{ fontSize: 28, lineHeight: 36 }}>
          Bienvenido
        </Copy>
        <Copy tone="secondary" style={{ fontSize: 12 }}>
          Gestiona donaciones y rescates de alimentos.
        </Copy>
      </View>
      {available ? null : <LocalProfileNotice />}
      <Stack gap={24}>
        <Field
          label="Correo electrónico"
          {...input("email")}
          placeholder="tu@correo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <Field
          label="Contraseña"
          {...input("password")}
          secure
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Stack>
      <View style={{ marginTop: -14 }}>
        <TextLink href="/recuperar-contrasena" align="right">
          ¿Olvidaste tu contraseña?
        </TextLink>
      </View>
      <FormMessage message={form.formError} />
      <Button onPress={submit} loading={form.submitting} disabled={!available}>
        Iniciar sesión
      </Button>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingTop: 20,
          gap: 12,
        }}
      >
        <Copy tone="secondary" style={{ fontSize: 11, textAlign: "center" }}>
          o continúa con
        </Copy>
        {/* TODO(F2-07): native Google sign-in. Without onPress the button stays disabled. */}
        <Button variant="outline">Google</Button>
        <Copy tone="secondary" style={{ fontSize: 11, textAlign: "center" }}>
          El acceso con Google estará disponible próximamente.
        </Copy>
      </View>
      <TextLink href="/registro">¿No tienes cuenta? Regístrate</TextLink>
    </Screen>
  );
}

/**
 * Supabase codes for an email that already has an account (sent when email confirmation is
 * off). They get the same answer as a new address, so the form never reveals which
 * addresses are registered.
 */
const EMAIL_TAKEN = new Set(["user_already_exists", "email_exists"]);

const REGISTER_INITIAL = {
  nombres: "",
  apellidos: "",
  email: "",
  telefono: "",
  password: "",
  confirmacion: "",
  acepto_terminos: false,
};

/** Also used by the profile completion while `ACEPTAR_TERMINOS` is pending. */
export function TermsCheckbox({
  checked,
  error,
  disabled,
  onToggle,
}: {
  checked: boolean;
  error: string | undefined;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={{ gap: 9 }}>
      <Pressing
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel="Acepto los Términos y Condiciones y la Política de Privacidad"
        accessibilityHint={error}
        disabled={disabled}
        onPress={onToggle}
        scale={1}
        hitSlop={6}
        surface={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44 }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: error ? colors.danger : checked ? colors.primary : colors.border,
            backgroundColor: checked ? colors.primary : colors.surface,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          {checked ? <Icon name="check" size={14} color={colors.surface} /> : null}
        </View>
        <Copy tone="secondary" style={{ flex: 1, fontSize: 11 }}>
          Acepto los Términos y Condiciones y la Política de Privacidad.
        </Copy>
      </Pressing>
      {error ? (
        <View accessibilityLiveRegion="polite">
          <Copy style={{ fontSize: 11, lineHeight: 16, color: colors.danger }}>{error}</Copy>
        </View>
      ) : null}
    </View>
  );
}

export function RegisterScreen() {
  const available = isEmailAuthAvailable();
  const form = useZodForm(registerSchema, REGISTER_INITIAL);
  const submit = form.handleSubmit(async (data) => {
    try {
      const { confirmationPending } = await signUp(data);
      if (confirmationPending) openVerification(data.email, "sign-up");
    } catch (error) {
      if (!isAuthError(error) || !error.code || !EMAIL_TAKEN.has(error.code)) throw error;
      openVerification(data.email, "sign-up");
    }
  });
  const input = (name: Exclude<keyof typeof REGISTER_INITIAL, "acepto_terminos">) =>
    editableIf(available, form.field(name));
  // Document type and number wait for API support (API-01); they are not sent yet.
  return (
    <Screen
      title="Registrarse"
      subtitle="Crea tu cuenta para comenzar a usar Find Food. Todos los campos son obligatorios."
      back
    >
      {available ? null : <LocalProfileNotice />}
      <Stack>
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Nombres"
              {...input("nombres")}
              autoComplete="given-name"
              textContentType="givenName"
              autoCapitalize="words"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Apellidos"
              {...input("apellidos")}
              autoComplete="family-name"
              textContentType="familyName"
              autoCapitalize="words"
            />
          </View>
        </Row>
        <Field
          label="Correo electrónico"
          {...input("email")}
          placeholder="tu@correo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <Field
          label="Celular"
          {...input("telefono")}
          placeholder="300 123 4567"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          accessibilityHint="Número celular de Colombia."
        />
        <Field
          label="Contraseña"
          {...input("password")}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          accessibilityHint="Mínimo 8 caracteres, con letras y números."
        />
        <Field
          label="Confirmar contraseña"
          {...input("confirmacion")}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
      </Stack>
      <TermsCheckbox
        checked={form.values.acepto_terminos}
        error={form.errors.acepto_terminos}
        disabled={!available}
        onToggle={() => form.setValue("acepto_terminos", !form.values.acepto_terminos)}
      />
      <FormMessage message={form.formError} />
      <Button onPress={submit} loading={form.submitting} disabled={!available}>
        Crear cuenta
      </Button>
      <TextLink href="/login">¿Ya tienes una cuenta? Iniciar sesión</TextLink>
    </Screen>
  );
}
/** Errors that say nothing about the account, so they can be shown: limits and connectivity. */
const RESET_RATE_LIMITS = new Set(["over_email_send_rate_limit", "over_request_rate_limit"]);

function isShownResetError(error: unknown): boolean {
  if (!isAuthError(error)) return true;
  if (isAuthRetryableFetchError(error) || error.status === 429) return true;
  return error.code === AUTH_UNAVAILABLE_CODE || (!!error.code && RESET_RATE_LIMITS.has(error.code));
}

const RESET_SENT =
  "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Ábrelo en este teléfono.";

const FORGOT_INITIAL = { email: "" };

export function ForgotPasswordScreen() {
  const available = isEmailAuthAvailable();
  const form = useZodForm(forgotPasswordSchema, FORGOT_INITIAL);
  const [sent, setSent] = useState(false);
  const submit = form.handleSubmit(async ({ email }) => {
    setSent(false);
    try {
      await requestPasswordReset(email);
    } catch (error) {
      // Supabase sends nothing to an unknown address and answers as if it did, so any other
      // failure (an SMTP error, say) can only come from a registered one: it gets the same
      // confirmation, and the screen never reveals which addresses have an account.
      if (isShownResetError(error)) throw error;
    }
    setSent(true);
  });
  return (
    <Screen back center>
      <View
        style={{
          alignItems: "center",
          gap: 20,
          marginTop: 14,
          marginBottom: 10,
        }}
      >
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: colors.soft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="mail" size={34} />
        </View>
        <Copy
          weight="bold"
          style={{ fontSize: 22, lineHeight: 29, textAlign: "center" }}
        >
          ¿Olvidaste tu contraseña?
        </Copy>
        <Copy tone="secondary" style={{ fontSize: 12, textAlign: "center" }}>
          Ingresa el correo asociado a tu cuenta y te enviaremos un enlace para crear una nueva
          contraseña.
        </Copy>
      </View>
      {available ? null : <LocalProfileNotice />}
      <Field
        label="Correo electrónico"
        {...editableIf(available, form.field("email"))}
        placeholder="tu@correo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <FormMessage message={form.formError} />
      <FormMessage message={sent ? RESET_SENT : undefined} tone="success" />
      <Button onPress={submit} loading={form.submitting} disabled={!available}>
        Enviar enlace
      </Button>
      <TextLink href="/login">Volver al inicio de sesión</TextLink>
      <Card soft>
        <Copy weight="semibold">Consejo</Copy>
        <Copy tone="secondary" style={{ fontSize: 12 }}>
          Revisa también la carpeta de correo no deseado si no recibes el
          mensaje en unos minutos.
        </Copy>
      </Card>
    </Screen>
  );
}
