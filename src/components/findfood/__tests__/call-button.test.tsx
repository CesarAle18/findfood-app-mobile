import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { CallButton, sanitizePhone } from "../call-button";

let openURL: jest.SpyInstance;

beforeEach(() => {
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

afterEach(() => {
  openURL.mockRestore();
});

describe("sanitizePhone", () => {
  it.each([
    ["+57 300 111 2233", "+573001112233"],
    ["(300) 999-88.77", "3009998877"],
    ["  ", ""],
    [null, ""],
    [undefined, ""],
  ])("%p → %p", (phone, clean) => {
    expect(sanitizePhone(phone)).toBe(clean);
  });
});

describe("CallButton", () => {
  it("dials the number without spaces or punctuation", async () => {
    await render(<CallButton phone="+57 300 111-2233" label="Contactar al donante" />);

    await fireEvent.press(screen.getByRole("button", { name: "Contactar al donante" }));

    expect(openURL).toHaveBeenCalledWith("tel:+573001112233");
  });

  it("shows the number when the phone app cannot open", async () => {
    openURL.mockRejectedValueOnce(new Error("no handler"));
    await render(<CallButton phone="+57 300 111 2233" label="Contactar al donante" />);

    await fireEvent.press(screen.getByRole("button", { name: "Contactar al donante" }));

    expect(
      await screen.findByText("No pudimos abrir la app de llamadas. Marca al +57 300 111 2233."),
    ).toBeOnTheScreen();
  });

  it.each([null, "", " - "])("renders nothing without a number (%p)", async (phone) => {
    await render(<CallButton phone={phone} label="Contactar al donante" />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
