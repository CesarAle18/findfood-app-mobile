import { AuthApiError, isAuthError } from "@supabase/supabase-js";

import { messageFor } from "@/api/problem-messages";

import {
  AUTH_UNAVAILABLE_CODE,
  isEmailAuthAvailable,
  resendSignupOtp,
  signIn,
  signUp,
  verifyEmailOtp,
} from "./email-auth";

const mockAuth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  verifyOtp: jest.fn(),
  resend: jest.fn(),
};
let mockClient: { auth: typeof mockAuth } | null = { auth: mockAuth };

jest.mock("./supabase", () => ({
  get supabase() {
    return mockClient;
  },
}));

const session = { access_token: "token" };
const user = (identities: unknown[] = [{ id: "identity" }]) => ({ id: "user-1", identities });

const registration = {
  nombres: "María",
  apellidos: "García López",
  email: "maria@correo.com",
  telefono: "+573001234567",
  password: "secreta123",
  confirmacion: "secreta123",
  acepto_terminos: true as const,
};

beforeEach(() => {
  mockClient = { auth: mockAuth };
  for (const fn of Object.values(mockAuth)) fn.mockReset();
});

describe("signIn", () => {
  it("signs in with the email and password", async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });

    await signIn({ email: "ana@correo.com", password: "secreta123" });

    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@correo.com",
      password: "secreta123",
    });
  });

  it("throws the AuthError Supabase returns", async () => {
    const error = new AuthApiError("Email not confirmed", 400, "email_not_confirmed");
    mockAuth.signInWithPassword.mockResolvedValue({ data: { session: null }, error });

    await expect(signIn({ email: "ana@correo.com", password: "x" })).rejects.toBe(error);
  });
});

describe("signUp", () => {
  it("sends the profile as user metadata, without the confirmation", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: user(), session: null }, error: null });

    await signUp(registration);

    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: "maria@correo.com",
      password: "secreta123",
      options: {
        data: {
          nombres: "María",
          apellidos: "García López",
          telefono: "+573001234567",
          acepto_terminos: true,
        },
      },
    });
  });

  it("reports a pending confirmation when Supabase returns no session", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: user(), session: null }, error: null });

    await expect(signUp(registration)).resolves.toEqual({ confirmationPending: true });
  });

  it("reports no pending confirmation when Supabase signs the user in", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: user(), session }, error: null });

    await expect(signUp(registration)).resolves.toEqual({ confirmationPending: false });
  });

  it("does not tell an existing address (obfuscated user) from a new one", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: user([]), session: null }, error: null });

    await expect(signUp(registration)).resolves.toEqual({ confirmationPending: true });
  });

  it("throws the AuthError Supabase returns", async () => {
    const error = new AuthApiError("User already registered", 422, "user_already_exists");
    mockAuth.signUp.mockResolvedValue({ data: { user: null, session: null }, error });

    await expect(signUp(registration)).rejects.toBe(error);
  });
});

describe("verifyEmailOtp", () => {
  it("verifies the code as an email OTP", async () => {
    mockAuth.verifyOtp.mockResolvedValue({ data: { session }, error: null });

    await verifyEmailOtp("maria@correo.com", "123456");

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      email: "maria@correo.com",
      token: "123456",
      type: "email",
    });
  });

  it("throws the AuthError Supabase returns", async () => {
    const error = new AuthApiError("Token has expired or is invalid", 403, "otp_expired");
    mockAuth.verifyOtp.mockResolvedValue({ data: { session: null }, error });

    await expect(verifyEmailOtp("maria@correo.com", "123456")).rejects.toBe(error);
  });
});

describe("resendSignupOtp", () => {
  it("resends the sign-up code", async () => {
    mockAuth.resend.mockResolvedValue({ data: {}, error: null });

    await resendSignupOtp("maria@correo.com");

    expect(mockAuth.resend).toHaveBeenCalledWith({ type: "signup", email: "maria@correo.com" });
  });

  it("throws the AuthError Supabase returns", async () => {
    const error = new AuthApiError("Rate limit", 429, "over_email_send_rate_limit");
    mockAuth.resend.mockResolvedValue({ data: {}, error });

    await expect(resendSignupOtp("maria@correo.com")).rejects.toBe(error);
  });
});

describe("without Supabase (local profile)", () => {
  beforeEach(() => {
    mockClient = null;
  });

  it("is not available", () => {
    expect(isEmailAuthAvailable()).toBe(false);
  });

  it.each([
    ["signIn", () => signIn({ email: "a@b.co", password: "x" })],
    ["signUp", () => signUp(registration)],
    ["verifyEmailOtp", () => verifyEmailOtp("a@b.co", "123456")],
    ["resendSignupOtp", () => resendSignupOtp("a@b.co")],
  ])("%s throws an error with a Spanish explanation", async (_name, action) => {
    const error: unknown = await action().catch((e: unknown) => e);

    expect(isAuthError(error) && error.code).toBe(AUTH_UNAVAILABLE_CODE);
    expect(messageFor(error)).toMatch(/^Este perfil local no usa Supabase/);
  });
});
