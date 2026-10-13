/**
 * Password reset from the email link (`/restablecer-contrasena`, never guarded) and the forced
 * password change (`/cambiar-contrasena`, open in the `change-password` phase).
 */
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { messageFor } from "@/api/problem-messages";
import { exchangeRecoveryCode, updatePassword } from "@/auth/email-auth";
import { EmptyState, LoadingState } from "@/components/findfood/feedback";
import { NewPasswordForm } from "@/components/findfood/new-password-form";
import { Button, Card, Copy, FormMessage, NavButton, Screen } from "@/components/findfood/ui";
import { queryKeys } from "@/services/query-keys";
import { useAccess, useSessionActions } from "@/state/session";

import { SignOutButton } from "./access";

/**
 * Waits for a fresh `/me`, reusing the fetch the session provider starts on USER_UPDATED,
 * so the screen stays busy until the guards can see the account's new state.
 */
function refreshMe(queryClient: QueryClient): Promise<void> {
  return queryClient.refetchQueries({ queryKey: queryKeys.me }, { cancelRefetch: false });
}

/**
 * Params of the reset link: `code` (+ `sb_flow_id` when auth-js appends it), or Supabase's
 * `error`, `error_code` (`otp_expired`…) and `error_description` (English, never shown).
 */
type ResetParams = {
  code?: string | string[];
  sb_flow_id?: string | string[];
  error?: string | string[];
  error_code?: string | string[];
};

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : undefined;
}

type Outcome = { code: string; failed: false } | { code: string; failed: true; error: unknown };

/**
 * Exchanges the link's code for the recovery session, once per code: a ref guards against the
 * effect running twice, and the code is removed from the params once settled so a remount
 * never reuses it (it is single use, and its verifier is gone after the first attempt).
 */
function useRecoveryExchange(
  code: string | undefined,
  flowId: string | undefined,
  /**
   * A recovery from an earlier link is in progress: a failure here must not end it.
   * Undefined until the stored flag is read (cold start): the exchange waits for it.
   */
  recoveringAlready: boolean | undefined,
) {
  const { setRecovering } = useSessionActions();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const started = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!code || recoveringAlready === undefined || started.current === code) return;
    started.current = code;
    const setByThisLink = !recoveringAlready;
    // Stored before the exchange: its session must never reach the gate as an ordinary
    // sign-in (it exists before the new password does), not even after a restart.
    void setRecovering(true)
      .then(() => exchangeRecoveryCode(code, flowId))
      .then(
        (): Outcome => ({ code, failed: false }),
        async (error: unknown): Promise<Outcome> => {
          // auth-js only stores a session after a successful exchange: nothing to sign out.
          // An earlier link's recovery session is still there: only this link's flag ends.
          if (setByThisLink) await setRecovering(false);
          return { code, failed: true, error };
        },
      )
      .then((settled) => {
        if (!mounted.current) return;
        setOutcome(settled);
        router.setParams({ code: undefined, sb_flow_id: undefined });
      });
  }, [code, flowId, recoveringAlready, setRecovering]);

  return { running: code !== undefined && outcome?.code !== code, outcome };
}

// Explanations for the `error_code` / `error` params Supabase puts on a link it refused
// (never its English `error_description`). A failed exchange uses messageFor instead.
const RESET_LINK_EXPIRED =
  "El enlace para restablecer tu contraseña expiró o ya se usó. Solicita uno nuevo y ábrelo en este teléfono.";
const RESET_LINK_REJECTED =
  "No pudimos validar el enlace para restablecer tu contraseña. Solicita uno nuevo y ábrelo en este teléfono.";

function LinkProblem({ description }: { description: string }) {
  return (
    <EmptyState
      icon="mail"
      title="El enlace ya no es válido"
      description={description}
      action={
        <NavButton href="/recuperar-contrasena" showArrow={false}>
          Solicitar un enlace nuevo
        </NavButton>
      }
    />
  );
}

function ResetForm() {
  const queryClient = useQueryClient();
  const { setRecovering, cerrarSesion } = useSessionActions();
  const [cancelling, setCancelling] = useState(false);

  const save = async (password: string) => {
    await updatePassword(password);
    // The recovery session is now an ordinary one: once `/me` is fresh, the gate opens the
    // account's screen. This screen is never guarded, so it has to hand over itself.
    await refreshMe(queryClient);
    await setRecovering(false);
    router.replace("/");
  };

  const cancel = () => {
    setCancelling(true);
    // Also clears the recovery flag; cerrarSesion never rejects.
    void cerrarSesion().then(() => router.replace("/"));
  };

  return (
    <>
      <NewPasswordForm submitLabel="Guardar contraseña" onSubmit={save} />
      <Button variant="outline" onPress={cancel} loading={cancelling}>
        Cancelar
      </Button>
    </>
  );
}

function ResetContent() {
  const params = useLocalSearchParams<ResetParams>();
  const code = single(params.code);
  const linkError = single(params.error_code) ?? single(params.error);
  const { phase } = useAccess();
  const recovering = phase === "recovering";
  // `loading`: the stored recovery flag (or the session) is not known yet.
  const exchange = useRecoveryExchange(
    code,
    single(params.sb_flow_id),
    phase === "loading" ? undefined : recovering,
  );

  if (exchange.running) return <LoadingState label="Validando el enlace…" />;
  if (phase === "loading") return <LoadingState />;
  const failure = exchange.outcome?.failed ? messageFor(exchange.outcome.error) : undefined;
  const problem =
    failure ??
    (linkError ? (linkError === "otp_expired" ? RESET_LINK_EXPIRED : RESET_LINK_REJECTED) : undefined);
  // A recovery already in progress (an earlier link) goes on: a bad new link only says why.
  if (recovering) {
    return (
      <>
        <FormMessage message={problem} />
        <ResetForm />
      </>
    );
  }
  if (problem) return <LinkProblem description={problem} />;
  return (
    <EmptyState
      icon="mail"
      title="Abre el enlace de tu correo"
      description="Para restablecer tu contraseña, abre en este teléfono el enlace que te enviamos por correo."
      action={
        <NavButton href="/recuperar-contrasena" showArrow={false}>
          Solicitar un enlace
        </NavButton>
      }
    />
  );
}

/** `/restablecer-contrasena?code=…&sb_flow_id=…` or `?error=…&error_code=…`. */
export function ResetPasswordScreen() {
  return (
    <Screen title="Restablece tu contraseña" subtitle="Crea una contraseña nueva para tu cuenta.">
      <ResetContent />
    </Screen>
  );
}

/** `/cambiar-contrasena`: the account must set a new password (`CAMBIAR_PASSWORD`). */
export function ChangePasswordScreen() {
  const queryClient = useQueryClient();
  // The database clears debe_cambiar_password with the new password; the guards move on
  // once `/me` says so.
  const save = async (password: string) => {
    await updatePassword(password);
    await refreshMe(queryClient);
  };
  return (
    <Screen
      title="Cambia tu contraseña"
      subtitle="Por seguridad debes definir una contraseña nueva antes de continuar."
    >
      <NewPasswordForm submitLabel="Guardar contraseña" onSubmit={save} />
      <Card soft>
        <Copy tone="secondary" style={{ fontSize: 12 }}>
          ¿No eres tú o prefieres hacerlo después? Cierra la sesión en este teléfono.
        </Copy>
      </Card>
      <SignOutButton variant="outline" />
    </Screen>
  );
}
