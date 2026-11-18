import { act } from "@testing-library/react-native";
import { router } from "expo-router";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { ApiMock } from "@/test-utils/api";
import { ofertaAceptadaFixture, ofertaFixture } from "@/test-utils/fixtures";
import { renderWithClient } from "@/test-utils/query";

import {
  acceptedLoadKg,
  closedReasonOf,
  exceedsCapacity,
  useAcceptOffer,
} from "../use-accept-offer";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

jest.mock("expo-router", () => ({ router: { dismissTo: jest.fn() } }));

const mockApi = api as unknown as ApiMock;
const conflict = (type: string) => new ApiError({ type, status: 409, title: "Conflict" });

beforeEach(() => {
  mockApi.post.mockReset().mockResolvedValue({ id: "asg-7", estado: "ACEPTADA" });
  jest.mocked(router.dismissTo).mockClear();
});

describe("closedReasonOf", () => {
  it.each([
    ["oferta-tomada", "unavailable"],
    ["donacion-no-disponible", "unavailable"],
    ["oferta-ya-respondida", "unavailable"],
    ["oferta-vencida", "expired"],
    ["sin-conexion", null],
    ["error-interno", null],
  ])("%s → %s", (type, reason) => {
    expect(closedReasonOf(type)).toBe(reason);
  });

  it("has no reason without a problem", () => {
    expect(closedReasonOf(null)).toBeNull();
  });
});

describe("useAcceptOffer", () => {
  it("accepts, reports it and goes to the routes", async () => {
    const onAccepted = jest.fn();
    const { result } = await renderWithClient(() => useAcceptOffer("asg-7", { onAccepted }));

    await act(() => result.current.accept());

    expect(mockApi.post).toHaveBeenCalledWith("/asignaciones/asg-7/aceptar");
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith("/voluntario/rutas");
    expect(result.current.error).toBeUndefined();
  });

  it("keeps the message and the reason of a lost race, without moving", async () => {
    mockApi.post.mockRejectedValue(conflict("oferta-tomada"));
    const onFailed = jest.fn();
    const { result } = await renderWithClient(() => useAcceptOffer("asg-7", { onFailed }));

    await act(() => result.current.accept());

    expect(result.current.error).toBe("Otro voluntario ya aceptó esta donación.");
    expect(result.current.closedReason).toBe("unavailable");
    expect(onFailed).toHaveBeenCalledWith("unavailable");
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it("leaves a network failure open to a retry", async () => {
    mockApi.post.mockRejectedValue(ApiError.network(new TypeError("offline")));
    const onFailed = jest.fn();
    const { result } = await renderWithClient(() => useAcceptOffer("asg-7", { onFailed }));

    await act(() => result.current.accept());

    expect(result.current.error).toMatch(/No pudimos conectarnos/);
    expect(result.current.closedReason).toBeNull();
    expect(onFailed).toHaveBeenCalledWith(null);
  });

  it("clears the last failure when trying again", async () => {
    mockApi.post.mockRejectedValueOnce(ApiError.network(new TypeError("offline")));
    const { result } = await renderWithClient(() => useAcceptOffer("asg-7"));
    await act(() => result.current.accept());
    expect(result.current.error).toBeDefined();

    await act(() => result.current.accept());

    expect(result.current.error).toBeUndefined();
    expect(router.dismissTo).toHaveBeenCalledWith("/voluntario/rutas");
  });
});

describe("capacity", () => {
  it("adds the accepted pickups still waiting for a route", () => {
    const ofertas = [
      ofertaAceptadaFixture({ peso_estimado_kg: 100 }),
      ofertaAceptadaFixture({ id: "asg-9", peso_estimado_kg: 30, ruta_id: "ruta-1" }),
      ofertaFixture(),
    ];
    expect(acceptedLoadKg(ofertas)).toBe(100);
  });

  it("warns only when this offer plus the accepted load exceeds a known capacity", () => {
    const offer = { weightKg: 45, accepted: false };
    expect(exceedsCapacity(offer, 500, 455)).toBe(false);
    expect(exceedsCapacity(offer, 500, 456)).toBe(true);
    expect(exceedsCapacity(offer, null, 10_000)).toBe(false);
    expect(exceedsCapacity({ ...offer, accepted: true }, 500, 10_000)).toBe(false);
  });
});
