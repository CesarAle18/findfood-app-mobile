import { act, waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import type { MeDto } from "@/api/types";
import type { MobileRole } from "@/auth/access";
import { resetApiMock, type ApiMock } from "@/test-utils/api";
import { meFixture, pageFixture } from "@/test-utils/fixtures";
import { renderWithClient } from "@/test-utils/query";

import { startLocationTracking, stopLocationTracking } from "@/location/tracking";
import {
  deriveShouldTrack,
  isActiveVolunteer,
  useVolunteerLocationTracking,
} from "./use-volunteer-location-tracking";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

jest.mock("@/location/tracking", () => ({
  startLocationTracking: jest.fn(async () => "background"),
  stopLocationTracking: jest.fn(async () => undefined),
  trackingStatusStore: { get: () => "off", subscribe: () => () => undefined },
}));

const mockSession: { activeRole: MobileRole | null; me: MeDto | undefined } = {
  activeRole: "VOLUNTARIO",
  me: undefined,
};

jest.mock("@/state/session", () => ({
  useAccess: () => ({ activeRole: mockSession.activeRole }),
  useMe: () => ({ data: mockSession.me }),
}));

const mockedApi = api as unknown as ApiMock;
const mockedStart = jest.mocked(startLocationTracking);
const mockedStop = jest.mocked(stopLocationTracking);

function volunteer(disponible: boolean, estado: "APROBADA" | "PENDIENTE" = "APROBADA"): MeDto {
  const base = meFixture();
  return {
    ...base,
    voluntario: { ...base.voluntario!, disponible, estado_verificacion: estado },
  };
}

function routesInProgress(count: number) {
  mockedApi.get.mockResolvedValue(pageFixture([], count));
}

beforeEach(() => {
  resetApiMock(mockedApi);
  mockedStart.mockClear();
  mockedStop.mockClear();
  mockSession.activeRole = "VOLUNTARIO";
  mockSession.me = volunteer(true);
  routesInProgress(0);
});

describe("deriveShouldTrack", () => {
  it.each([
    { activeVolunteer: true, disponible: true, routesInProgress: 0, expected: true },
    { activeVolunteer: true, disponible: false, routesInProgress: 1, expected: true },
    { activeVolunteer: true, disponible: false, routesInProgress: 0, expected: false },
    { activeVolunteer: false, disponible: true, routesInProgress: 3, expected: false },
  ])(
    "active=$activeVolunteer disponible=$disponible routes=$routesInProgress → $expected",
    ({ expected, ...input }) => {
      expect(deriveShouldTrack(input)).toBe(expected);
    },
  );
});

describe("isActiveVolunteer", () => {
  it("needs the volunteer role active and an approved verification", () => {
    expect(isActiveVolunteer("VOLUNTARIO", volunteer(true))).toBe(true);
    expect(isActiveVolunteer("DONANTE", volunteer(true))).toBe(false);
    expect(isActiveVolunteer("VOLUNTARIO", volunteer(true, "PENDIENTE"))).toBe(false);
    expect(isActiveVolunteer("VOLUNTARIO", meFixture({ voluntario: null }))).toBe(false);
  });
});

describe("useVolunteerLocationTracking", () => {
  it("starts while available and stops when the volunteer turns unavailable", async () => {
    const { rerender } = await renderWithClient(useVolunteerLocationTracking);
    await waitFor(() => expect(mockedStart).toHaveBeenCalledWith({ allowBackground: true }));

    mockSession.me = volunteer(false);
    await act(async () => rerender({}));

    await waitFor(() => expect(mockedStop).toHaveBeenCalledTimes(1));
  });

  it("keeps tracking while a route is in progress, even when unavailable", async () => {
    mockSession.me = volunteer(false);
    routesInProgress(1);

    await renderWithClient(useVolunteerLocationTracking);

    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));
    expect(mockedApi.get).toHaveBeenCalledWith(
      "/rutas",
      expect.objectContaining({ query: { estado: "EN_CURSO", limite: 1 } }),
    );
  });

  it("does nothing for the donor role and does not fetch routes", async () => {
    mockSession.activeRole = "DONANTE";

    await renderWithClient(useVolunteerLocationTracking);

    await act(async () => undefined);
    expect(mockedStart).not.toHaveBeenCalled();
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("stops on unmount (sign-out or role switch)", async () => {
    const { unmount } = await renderWithClient(useVolunteerLocationTracking);
    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));

    await act(async () => unmount());

    expect(mockedStop).toHaveBeenCalledTimes(1);
  });
});
