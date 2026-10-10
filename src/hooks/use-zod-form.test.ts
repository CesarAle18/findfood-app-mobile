import { act, renderHook } from "@testing-library/react-native";
import { z } from "zod";

import { ApiError, FORM_ERROR_KEY } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";

import { useZodForm } from "./use-zod-form";

const schema = z
  .object({
    correo: z
      .string()
      .trim()
      .min(1, "Ingresa tu correo.")
      .regex(/^\S+@\S+\.\S+$/, "Ingresa un correo válido."),
    password: z.string().min(8, "Usa al menos 8 caracteres."),
  })
  .refine((values) => values.password !== values.correo, "La contraseña no puede ser tu correo.");

const initialValues = { correo: "", password: "" };

async function renderForm() {
  return renderHook(() => useZodForm(schema, initialValues));
}

const validationError = (fields: Record<string, string[]>) =>
  new ApiError({ type: "validacion", status: 400, title: "Validation failed", fields });

describe("useZodForm", () => {
  it("exposes each field ready for Field", async () => {
    const { result } = await renderForm();

    expect(result.current.values).toEqual(initialValues);
    expect(result.current.field("correo")).toMatchObject({ value: "", error: undefined });

    await act(() => result.current.field("correo").onChangeText("ana@correo.com"));
    expect(result.current.values.correo).toBe("ana@correo.com");
    expect(result.current.field("correo").value).toBe("ana@correo.com");
  });

  it("shows the first message of each invalid field and does not submit", async () => {
    const onValid = jest.fn();
    const { result } = await renderForm();

    await act(() => result.current.handleSubmit(onValid)());

    expect(onValid).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual({
      correo: "Ingresa tu correo.",
      password: "Usa al menos 8 caracteres.",
    });
    expect(result.current.field("password").error).toBe("Usa al menos 8 caracteres.");
  });

  it("submits the parsed data when valid and clears previous errors", async () => {
    const onValid = jest.fn();
    const { result } = await renderForm();
    await act(() => result.current.handleSubmit(onValid)());

    await act(() => {
      result.current.setValue("correo", "  ana@correo.com ");
      result.current.setValue("password", "secreta123");
    });
    await act(() => result.current.handleSubmit(onValid)());

    expect(onValid).toHaveBeenCalledWith({ correo: "ana@correo.com", password: "secreta123" });
    expect(result.current.errors).toEqual({});
    expect(result.current.formError).toBeUndefined();
  });

  it("puts form-level schema issues in formError", async () => {
    const onValid = jest.fn();
    const { result } = await renderForm();
    await act(() => {
      result.current.setValue("correo", "ana@correo.com");
      result.current.setValue("password", "ana@correo.com");
    });

    await act(() => result.current.handleSubmit(onValid)());

    expect(onValid).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual({});
    expect(result.current.formError).toBe("La contraseña no puede ser tu correo.");
  });

  it("clears only the edited field's error", async () => {
    const { result } = await renderForm();
    await act(() => result.current.handleSubmit(jest.fn())());

    await act(() => result.current.field("correo").onChangeText("a"));

    expect(result.current.errors.correo).toBeUndefined();
    expect(result.current.errors.password).toBe("Usa al menos 8 caracteres.");
  });

  it("validates an edited field on blur, but not an untouched one", async () => {
    const { result } = await renderForm();

    await act(() => result.current.field("password").onBlur());
    expect(result.current.errors.password).toBeUndefined();

    await act(() => result.current.field("correo").onChangeText("ana"));
    await act(() => result.current.field("correo").onBlur());
    expect(result.current.errors).toEqual({ correo: "Ingresa un correo válido." });

    await act(() => result.current.field("correo").onChangeText("ana@correo.com"));
    await act(() => result.current.field("correo").onBlur());
    expect(result.current.errors).toEqual({});
  });

  it("maps server field messages onto the form, translated", async () => {
    const { result } = await renderForm();
    const error = validationError({
      correo: ["must be an email", "should not be empty"],
      password: ["must be longer than or equal to 8 characters"],
    });

    await act(() => result.current.setServerError(error));

    expect(result.current.errors).toEqual({
      correo: "Debe ser un correo electrónico válido.",
      password: "Debe tener al menos 8 caracteres.",
    });
    expect(result.current.formError).toBeUndefined();
  });

  it("sends server messages without a matching field to formError", async () => {
    const { result } = await renderForm();
    const error = validationError({
      correo: ["must be an email"],
      telefono: ["must be a valid phone number"],
      [FORM_ERROR_KEY]: ["property foo should not exist"],
    });

    await act(() => result.current.setServerError(error));

    expect(result.current.errors).toEqual({ correo: "Debe ser un correo electrónico válido." });
    expect(result.current.formError).toBe(messageFor(error));
  });

  it.each([
    ["a business problem", new ApiError({ type: "cuenta-suspendida", status: 403, title: "x" })],
    ["a network failure", ApiError.network(new TypeError("Network request failed"))],
    ["an unknown error", new Error("boom")],
  ])("shows %s as formError", async (_name, error) => {
    const { result } = await renderForm();
    await act(() => result.current.handleSubmit(jest.fn())());

    await act(() => result.current.setServerError(error));

    expect(result.current.errors).toEqual({});
    expect(result.current.formError).toBe(messageFor(error));
  });

  it("turns a rejected submit into server errors", async () => {
    const { result } = await renderForm();
    await act(() => {
      result.current.setValue("correo", "ana@correo.com");
      result.current.setValue("password", "secreta123");
    });
    const error = validationError({ correo: ["must be an email"] });

    await act(() =>
      result.current.handleSubmit(async () => {
        throw error;
      })(),
    );

    expect(result.current.errors).toEqual({ correo: "Debe ser un correo electrónico válido." });
  });

  it("resets values and errors", async () => {
    const { result } = await renderForm();
    await act(() => result.current.field("correo").onChangeText("ana"));
    await act(() => result.current.handleSubmit(jest.fn())());
    await act(() => result.current.setServerError(new Error("boom")));

    await act(() => result.current.reset());

    expect(result.current.values).toEqual(initialValues);
    expect(result.current.errors).toEqual({});
    expect(result.current.formError).toBeUndefined();
  });
});
