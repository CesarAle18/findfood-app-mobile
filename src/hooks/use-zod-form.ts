/**
 * Form state for the app's forms: text values ready for `Field`, client validation with a
 * zod schema, and server errors (`ApiError.fields`) mapped onto the same fields.
 *
 * Plain state for everything rendered; the only ref is the submit re-entry guard, read and
 * written inside the handler (never during render), so the React Compiler can still memoize
 * the components that use it. Schemas must carry their own Spanish messages, e.g.
 * `z.string().min(1, "Ingresa tu correo.")`: zod's default messages are English.
 */
import { useRef, useState } from "react";
import type { z } from "zod";

import { FORM_ERROR_KEY, isApiError } from "@/api/errors";
import { messageFor, translateFieldMessage } from "@/api/problem-messages";

type FormValues = Record<string, unknown>;

/** Keys whose value is a string: the ones a `Field` can edit. */
type TextKey<TValues> = {
  [K in keyof TValues]: TValues[K] extends string ? K : never;
}[keyof TValues] &
  string;

export type FieldErrors<TValues> = Partial<Record<keyof TValues & string, string>>;

interface FormState<TValues> {
  values: TValues;
  errors: FieldErrors<TValues>;
  formError: string | undefined;
  /** Fields the user has typed in, so blur validation stays quiet while tabbing through. */
  touched: Partial<Record<keyof TValues & string, true>>;
  submitting: boolean;
}

type ErrorState<TValues> = Pick<FormState<TValues>, "errors" | "formError">;

function initialState<TValues>(values: TValues): FormState<TValues> {
  return { values, errors: {}, formError: undefined, touched: {}, submitting: false };
}

function without<TValues>(errors: FieldErrors<TValues>, name: string): FieldErrors<TValues> {
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => key !== name),
  ) as FieldErrors<TValues>;
}

/** The first message per field; issues without a matching field go to `formError`. */
function issueErrors<TValues>(
  issues: readonly z.core.$ZodIssue[],
  names: readonly string[],
): ErrorState<TValues> {
  const errors: Record<string, string> = {};
  let formError: string | undefined;
  for (const issue of issues) {
    const name = issue.path.length > 0 ? String(issue.path[0]) : undefined;
    if (name !== undefined && names.includes(name)) errors[name] ??= issue.message;
    else formError ??= issue.message;
  }
  return { errors: errors as FieldErrors<TValues>, formError };
}

/**
 * Field messages from the API land on the fields with the same name, translated. When
 * anything is left over (other paths, form-level messages, or no field messages at all),
 * `formError` explains the error as a whole.
 */
function serverErrors<TValues>(error: unknown, names: readonly string[]): ErrorState<TValues> {
  if (!isApiError(error)) return { errors: {}, formError: messageFor(error) };
  const errors: Record<string, string> = {};
  let leftover = false;
  for (const [path, messages] of Object.entries(error.fields)) {
    const [message] = messages;
    if (path !== FORM_ERROR_KEY && names.includes(path) && message) {
      errors[path] = translateFieldMessage(message);
    } else {
      leftover = true;
    }
  }
  const mapped = Object.keys(errors).length > 0;
  return {
    errors: errors as FieldErrors<TValues>,
    formError: mapped && !leftover ? undefined : messageFor(error),
  };
}

export function useZodForm<TSchema extends z.ZodType, TValues extends FormValues>(
  schema: TSchema,
  initialValues: TValues,
) {
  const [state, setState] = useState(() => initialState(initialValues));
  const { values, errors, formError, submitting } = state;
  // Re-entry guard: a double tap fires twice before React re-renders with `submitting`.
  const inFlight = useRef(false);

  const setValue = <K extends keyof TValues & string>(name: K, value: TValues[K]) => {
    setState((current) => ({
      ...current,
      values: { ...current.values, [name]: value },
      errors: without(current.errors, name),
      touched: { ...current.touched, [name]: true },
    }));
  };

  /**
   * Validates one field once the user has typed in it (even if they cleared it again), so
   * tabbing through untouched fields stays quiet.
   */
  const validateField = (name: keyof TValues & string) => {
    setState((current) => {
      if (!current.touched[name]) return current;
      const result = schema.safeParse(current.values);
      const message = result.success
        ? undefined
        : issueErrors<TValues>(result.error.issues, [name]).errors[name];
      return {
        ...current,
        errors: message
          ? { ...current.errors, [name]: message }
          : without(current.errors, name),
      };
    });
  };

  const setServerError = (error: unknown) => {
    setState((current) => ({
      ...current,
      ...serverErrors<TValues>(error, Object.keys(current.values)),
    }));
  };

  /**
   * Returns the submit handler: it validates, and only with valid values calls `onValid`
   * with the parsed data. While `onValid` runs, `submitting` is true and further submits
   * are ignored, so a double tap never sends the mutation twice. A rejection from `onValid`
   * (a failed mutation) is shown with `setServerError`.
   */
  const handleSubmit =
    (onValid: (data: z.output<TSchema>) => unknown) => async (): Promise<void> => {
      if (inFlight.current) return;
      const result = schema.safeParse(values);
      if (!result.success) {
        setState((current) => ({
          ...current,
          ...issueErrors<TValues>(result.error.issues, Object.keys(current.values)),
        }));
        return;
      }
      inFlight.current = true;
      setState((current) => ({ ...current, errors: {}, formError: undefined, submitting: true }));
      try {
        await onValid(result.data);
      } catch (error) {
        setServerError(error);
      } finally {
        inFlight.current = false;
        setState((current) => ({ ...current, submitting: false }));
      }
    };

  const reset = () => setState(initialState(initialValues));

  /** Props for `<Field {...form.field("correo")} />`. */
  const field = (name: TextKey<TValues>) => ({
    value: values[name] as string,
    error: errors[name],
    onChangeText: (text: string) => setValue(name, text as TValues[typeof name]),
    onBlur: () => validateField(name),
  });

  return {
    values,
    errors,
    formError,
    /** True while `onValid` runs: pass it to the submit `Button`'s `loading`. */
    submitting,
    field,
    setValue,
    setServerError,
    handleSubmit,
    reset,
  };
}
