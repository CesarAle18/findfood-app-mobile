/**
 * A one-time message for the login screen, left by a flow that ends there (the password
 * reset). It lives in memory instead of the route params because those flows reach the login
 * through the gate (`index` → Redirect), which drops params.
 */
let pending: string | undefined;

export function setLoginNotice(message: string): void {
  pending = message;
}

/**
 * The pending message, without forgetting it: safe in a state initializer, which React may
 * call twice. The screen that shows it calls clearLoginNotice once mounted.
 */
export function readLoginNotice(): string | undefined {
  return pending;
}

export function clearLoginNotice(): void {
  pending = undefined;
}
