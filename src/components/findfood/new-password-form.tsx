/**
 * New password with its confirmation, shared by the reset screen (deep link) and the forced
 * change (`CAMBIAR_PASSWORD`). Applies the sign-up rules; a rejected `onSubmit` (for example
 * Supabase's `same_password` or `weak_password`) is shown above the button.
 */
import { newPasswordSchema } from "@/domain/validation/auth";
import { useZodForm } from "@/hooks/use-zod-form";

import { Button, Field, FormMessage, Stack } from "./ui";

const INITIAL = { password: "", confirmacion: "" };

export function NewPasswordForm({
  submitLabel,
  onSubmit,
}: {
  submitLabel: string;
  /** Receives the validated password; the button stays busy until it settles. */
  onSubmit: (password: string) => Promise<void>;
}) {
  const form = useZodForm(newPasswordSchema, INITIAL);
  const submit = form.handleSubmit(({ password }) => onSubmit(password));
  return (
    <>
      <Stack>
        <Field
          label="Nueva contraseña"
          {...form.field("password")}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          accessibilityHint="Mínimo 8 caracteres, con letras y números."
          returnKeyType="next"
        />
        <Field
          label="Confirmar contraseña"
          {...form.field("confirmacion")}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Stack>
      <FormMessage message={form.formError} />
      <Button onPress={submit} loading={form.submitting}>
        {submitLabel}
      </Button>
    </>
  );
}
