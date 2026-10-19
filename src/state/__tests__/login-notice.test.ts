import { clearLoginNotice, readLoginNotice, setLoginNotice } from "@/state/login-notice";

afterEach(clearLoginNotice);

it("has no notice until a flow leaves one", () => {
  expect(readLoginNotice()).toBeUndefined();
});

it("keeps the notice across reads until it is cleared", () => {
  setLoginNotice("Listo");

  expect(readLoginNotice()).toBe("Listo");
  expect(readLoginNotice()).toBe("Listo");

  clearLoginNotice();
  expect(readLoginNotice()).toBeUndefined();
});

it("keeps only the latest notice", () => {
  setLoginNotice("Primero");
  setLoginNotice("Segundo");

  expect(readLoginNotice()).toBe("Segundo");
});
