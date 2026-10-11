import { loginSchema, normalizeColombianMobile, otpSchema, registerSchema } from "./auth";

/** The first message per field, as useZodForm shows them. */
function errorsOf(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const errors: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

describe("loginSchema", () => {
  it("accepts a trimmed email and any non-empty password", () => {
    expect(loginSchema.parse({ email: "  ana@correo.com ", password: " x " })).toEqual({
      email: "ana@correo.com",
      password: " x ",
    });
  });

  it("requires both fields, in Spanish", () => {
    expect(errorsOf(loginSchema.safeParse({ email: " ", password: "" }))).toEqual({
      email: "Ingresa tu correo electrónico.",
      password: "Ingresa tu contraseña.",
    });
  });

  it("rejects a malformed email", () => {
    expect(errorsOf(loginSchema.safeParse({ email: "ana@", password: "x" }))).toEqual({
      email: "Ingresa un correo electrónico válido.",
    });
  });
});

describe("normalizeColombianMobile", () => {
  it.each([
    ["3001234567", "+573001234567"],
    ["300 123 4567", "+573001234567"],
    ["+57 300 123 4567", "+573001234567"],
    ["+57 (300) 123-4567", "+573001234567"],
    ["+573001234567", "+573001234567"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeColombianMobile(input)).toBe(expected);
  });

  it.each([
    "2001234567", // landline prefix
    "300123456", // 9 digits
    "30012345678", // 11 digits
    "+58 300 123 4567", // another country
    "573001234567", // country code without +
    "300-abc-4567",
    "",
  ])("rejects %s", (input) => {
    expect(normalizeColombianMobile(input)).toBeNull();
  });
});

const validRegistration = {
  nombres: " María ",
  apellidos: " García López ",
  email: " maria@correo.com ",
  telefono: "300 123 4567",
  password: "secreta123",
  confirmacion: "secreta123",
  acepto_terminos: true,
};

describe("registerSchema", () => {
  it("parses a valid registration, trimming names and normalizing the phone", () => {
    expect(registerSchema.parse(validRegistration)).toEqual({
      nombres: "María",
      apellidos: "García López",
      email: "maria@correo.com",
      telefono: "+573001234567",
      password: "secreta123",
      confirmacion: "secreta123",
      acepto_terminos: true,
    });
  });

  it("requires every field, in Spanish", () => {
    const errors = errorsOf(
      registerSchema.safeParse({
        nombres: "",
        apellidos: " ",
        email: "",
        telefono: "",
        password: "",
        confirmacion: "",
        acepto_terminos: false,
      }),
    );
    expect(errors).toEqual({
      nombres: "Ingresa tus nombres.",
      apellidos: "Ingresa tus apellidos.",
      email: "Ingresa tu correo electrónico.",
      telefono: "Ingresa tu número de celular.",
      password: "Usa al menos 8 caracteres.",
      confirmacion: "Confirma tu contraseña.",
      acepto_terminos: "Debes aceptar los términos y condiciones.",
    });
  });

  it.each([
    ["secret1", "Usa al menos 8 caracteres."],
    ["12345678", "Incluye al menos una letra."],
    ["solamente", "Incluye al menos un número."],
  ])("rejects the password %s", (password, message) => {
    const result = registerSchema.safeParse({ ...validRegistration, password, confirmacion: password });
    expect(errorsOf(result).password).toBe(message);
  });

  it("puts a confirmation mismatch on the confirmation field", () => {
    const result = registerSchema.safeParse({ ...validRegistration, confirmacion: "secreta124" });
    expect(errorsOf(result)).toEqual({ confirmacion: "Las contraseñas no coinciden." });
  });

  it("reports a mismatch even while another field is still invalid", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      acepto_terminos: false,
      confirmacion: "otra-cosa1",
    });
    expect(errorsOf(result)).toMatchObject({
      confirmacion: "Las contraseñas no coinciden.",
      acepto_terminos: "Debes aceptar los términos y condiciones.",
    });
  });

  it("rejects a phone that is not a Colombian mobile", () => {
    const result = registerSchema.safeParse({ ...validRegistration, telefono: "601 234 5678" });
    expect(errorsOf(result)).toEqual({
      telefono: "Ingresa un celular colombiano de 10 dígitos que empiece por 3.",
    });
  });
});

describe("otpSchema", () => {
  it("accepts exactly six digits", () => {
    expect(otpSchema.parse({ token: "012345" })).toEqual({ token: "012345" });
  });

  it.each(["", "12345", "1234567", "12a456"])("rejects %j", (token) => {
    expect(errorsOf(otpSchema.safeParse({ token }))).toEqual({
      token: "Ingresa los 6 dígitos del código.",
    });
  });
});
