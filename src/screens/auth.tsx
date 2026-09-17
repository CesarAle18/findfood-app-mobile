import { useState } from "react";
import { View } from "react-native";
import {
  Button,
  Card,
  Copy,
  Field,
  NavButton,
  SelectField,
  Row,
  Screen,
  Stack,
  TextLink,
} from "@/components/findfood/ui";
import { Icon } from "@/components/findfood/icon";
import { colors } from "@/design/tokens";

export function LoginScreen() {
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
      <Stack gap={24}>
        <Field label="Correo electrónico" value="usuario@correo.com" />
        <Field label="Contraseña" value="password" secure />
      </Stack>
      <View style={{ marginTop: -14 }}>
        <TextLink href="/recuperar-contrasena" align="right">
          ¿Olvidaste tu contraseña?
        </TextLink>
      </View>
      <NavButton href="/inicio-donante" showArrow={false}>
        Iniciar sesión
      </NavButton>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingTop: 20,
          gap: 22,
        }}
      >
        <Copy tone="secondary" style={{ fontSize: 11, textAlign: "center" }}>
          o continúa con
        </Copy>
        <NavButton href="/inicio-donante" variant="outline" showArrow={false}>
          Google
        </NavButton>
      </View>
      <TextLink href="/registro">¿No tienes cuenta? Regístrate</TextLink>
    </Screen>
  );
}
export function RegisterScreen() {
  const [documentType, setDocumentType] = useState("");
  return (
    <Screen
      title="Registrarse"
      subtitle="Crea tu cuenta para comenzar a usar Find Food."
      back
    >
      <Stack>
        <Field label="Nombre completo *" value="María García López" />
        <SelectField
          label="Tipo de documento *"
          value={documentType}
          onChange={setDocumentType}
          options={[
            { label: "Cédula de ciudadanía", value: "CC" },
            { label: "Cédula de extranjería", value: "CE" },
            { label: "Pasaporte", value: "PA" },
            { label: "Permiso por Protección Temporal", value: "PPT" },
          ]}
        />
        <Field label="Documento *" value="1234567890" />
        <Field label="Correo electrónico *" value="tu@correo.com" />
        <Field label="Contraseña *" value="Mínimo 8 caracteres" />
        <Field label="Confirmar contraseña *" value="Repite tu contraseña" />
        <Field label="Teléfono" value="+57 300 123 4567" />
      </Stack>
      <Row style={{ alignItems: "flex-start" }}>
        <View
          accessibilityRole="checkbox"
          accessibilityState={{ checked: false, disabled: true }}
          accessibilityLabel="Aceptar términos y condiciones"
          style={{
            width: 20,
            height: 20,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 4,
            marginTop: 2,
          }}
        />
        <Copy tone="secondary" style={{ flex: 1, fontSize: 11 }}>
          Acepto los Términos y Condiciones y la Política de Privacidad.
        </Copy>
      </Row>
      <NavButton href="/verificar-correo" showArrow={false}>
        Crear cuenta
      </NavButton>
      <TextLink href="/login">¿Ya tienes una cuenta? Iniciar sesión</TextLink>
    </Screen>
  );
}
export function ForgotPasswordScreen() {
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
          Ingresa el correo asociado a tu cuenta y te enviaremos las
          instrucciones.
        </Copy>
      </View>
      <Field label="Correo electrónico *" value="tu@correo.com" />
      <Button>Enviar instrucciones</Button>
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
