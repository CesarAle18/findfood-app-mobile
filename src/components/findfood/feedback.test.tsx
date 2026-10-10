import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { ApiError } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";

import { EmptyState, ErrorState, LoadingState, OfflineBanner } from "./feedback";

describe("LoadingState", () => {
  it("shows and announces its label", async () => {
    await render(<LoadingState label="Cargando donaciones" />);

    expect(screen.getByText("Cargando donaciones")).toBeOnTheScreen();
    expect(screen.getByRole("progressbar", { name: "Cargando donaciones" })).toBeBusy();
  });

  it("has an accessible name without a label", async () => {
    await render(<LoadingState />);

    expect(screen.getByRole("progressbar", { name: "Cargando" })).toBeOnTheScreen();
  });
});

describe("EmptyState", () => {
  it("shows its title, description and action", async () => {
    await render(
      <EmptyState
        icon="box"
        title="Aún no tienes donaciones"
        description="Cuando publiques una donación la verás aquí."
        action={<Text>Crear donación</Text>}
      />,
    );

    expect(screen.getByText("Aún no tienes donaciones")).toBeOnTheScreen();
    expect(screen.getByText("Cuando publiques una donación la verás aquí.")).toBeOnTheScreen();
    expect(screen.getByText("Crear donación")).toBeOnTheScreen();
  });

  it("renders with a title only", async () => {
    await render(<EmptyState title="Sin notificaciones" />);

    expect(screen.getByText("Sin notificaciones")).toBeOnTheScreen();
  });
});

describe("ErrorState", () => {
  it("shows the translated message and retries", async () => {
    const onRetry = jest.fn();
    const error = ApiError.timeout();
    await render(<ErrorState error={error} onRetry={onRetry} />);

    expect(screen.getByText(messageFor(error))).toBeOnTheScreen();
    expect(screen.getByRole("alert")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers a secondary action", async () => {
    const signOut = jest.fn();
    await render(
      <ErrorState
        error={new Error("boom")}
        onRetry={jest.fn()}
        secondaryAction={{ label: "Cerrar sesión", onPress: signOut }}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("marks the retry button busy while retrying", async () => {
    const onRetry = jest.fn();
    await render(<ErrorState error={null} onRetry={onRetry} retrying />);
    const retry = screen.getByRole("button", { name: "Reintentar" });

    expect(retry).toBeBusy();
    await fireEvent.press(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("has no retry button without onRetry", async () => {
    await render(<ErrorState error={null} />);

    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeOnTheScreen();
  });
});

describe("OfflineBanner", () => {
  afterEach(async () => {
    await act(() => onlineManager.setOnline(true));
  });

  it("renders nothing while online", async () => {
    await render(<OfflineBanner />);

    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
  });

  it("follows the TanStack online manager", async () => {
    await render(<OfflineBanner />);

    await act(() => onlineManager.setOnline(false));
    expect(screen.getByRole("alert")).toHaveTextContent(/Sin conexión/);

    await act(() => onlineManager.setOnline(true));
    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
  });
});
