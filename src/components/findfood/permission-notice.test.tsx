import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { PermissionNotice } from "./permission-notice";

const TITLE = "Permite el acceso a la cámara";
const BODY = "La necesitamos para tomar la foto de evidencia.";

describe("PermissionNotice", () => {
  it("offers the system prompt while the permission can still be requested", async () => {
    const onRequest = jest.fn();
    await render(<PermissionNotice title={TITLE} body={BODY} gate="denied" onRequest={onRequest} />);

    expect(screen.getByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByText(BODY)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Permitir" }));

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Abrir ajustes" })).toBeNull();
  });

  it("sends the user to the app settings once the OS stops asking", async () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const onRequest = jest.fn();
    await render(<PermissionNotice title={TITLE} body={BODY} gate="blocked" onRequest={onRequest} />);

    fireEvent.press(screen.getByRole("button", { name: "Abrir ajustes" }));

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(onRequest).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Permitir" })).toBeNull();
    openSettings.mockRestore();
  });

  it.each(["granted", "unknown"] as const)("renders nothing when the gate is %s", async (gate) => {
    await render(<PermissionNotice title={TITLE} body={BODY} gate={gate} onRequest={jest.fn()} />);

    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
