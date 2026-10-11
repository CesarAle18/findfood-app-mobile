/**
 * Client validation for email sign-in, sign-up and code verification. Messages are Spanish
 * (zod's defaults are English); field names match the Supabase sign-up metadata that the
 * `auth.users` trigger reads to create the account (`nombres`, `apellidos`, `telefono`,
 * `acepto_terminos`).
 */
import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Ingresa tu correo electrónico.")
  .pipe(z.email("Ingresa un correo electrónico válido."));

/** Separators people type in phone numbers: spaces, dashes, dots and parentheses. */
const PHONE_SEPARATORS = /[\s().-]/g;
const COLOMBIAN_MOBILE = /^(?:\+57)?(3\d{9})$/;

/**
 * A Colombian mobile number (10 digits starting with 3, optionally after `+57`) as
 * `+57XXXXXXXXXX`, or null when the input is not one.
 */
export function normalizeColombianMobile(input: string): string | null {
  const match = COLOMBIAN_MOBILE.exec(input.replace(PHONE_SEPARATORS, ""));
  return match ? `+57${match[1]}` : null;
}

const MOBILE_MESSAGE = "Ingresa un celular colombiano de 10 dígitos que empiece por 3.";

const telefono = z
  .string()
  .trim()
  .min(1, "Ingresa tu número de celular.")
  .transform((value, ctx) => {
    const normalized = normalizeColombianMobile(value);
    if (normalized === null) {
      ctx.issues.push({ code: "custom", message: MOBILE_MESSAGE, input: value });
      return z.NEVER;
    }
    return normalized;
  });

const name = (missing: string) =>
  z.string().trim().min(1, missing).max(100, "Usa como máximo 100 caracteres.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Ingresa tu contraseña."),
});

export type LoginData = z.output<typeof loginSchema>;

export const registerSchema = z
  .object({
    nombres: name("Ingresa tus nombres."),
    apellidos: name("Ingresa tus apellidos."),
    email,
    telefono,
    password: z
      .string()
      .min(8, "Usa al menos 8 caracteres.")
      .regex(/\p{L}/u, "Incluye al menos una letra.")
      .regex(/\d/, "Incluye al menos un número."),
    confirmacion: z.string().min(1, "Confirma tu contraseña."),
    acepto_terminos: z.literal(true, "Debes aceptar los términos y condiciones."),
  })
  .refine((data) => data.password === data.confirmacion, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmacion"],
    // Compared as soon as both are text, even while other fields are still invalid, so the
    // confirmation field reports a mismatch on blur.
    when: ({ value }) => {
      const data = value as { password?: unknown; confirmacion?: unknown };
      return (
        typeof data.password === "string" &&
        typeof data.confirmacion === "string" &&
        data.confirmacion !== ""
      );
    },
  });

export type RegisterData = z.output<typeof registerSchema>;

export const OTP_LENGTH = 6;

export const otpSchema = z.object({
  token: z.string().regex(/^\d{6}$/, "Ingresa los 6 dígitos del código."),
});
