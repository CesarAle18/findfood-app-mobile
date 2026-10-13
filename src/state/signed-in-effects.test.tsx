import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { usePushRegistration } from "@/notifications/push";
import { catalogosQuery } from "@/services/catalogos";
import { resetApiMock, type ApiMock } from "@/test-utils/api";
import { catalogosFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

import { SignedInEffects } from "./signed-in-effects";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockAccess = { phase: "loading" as string, canDonor: false, canVolunteer: false };

jest.mock("@/notifications/push", () => ({ usePushRegistration: jest.fn() }));

jest.mock("@/state/session", () => ({
  useAccess: () => mockAccess,
}));

const mockedApi = api as unknown as ApiMock;

const mockedPushRegistration = usePushRegistration as jest.Mock;

beforeEach(() => {
  mockAccess.canDonor = false;
  mockAccess.canVolunteer = false;
  mockedPushRegistration.mockClear();
  resetApiMock(mockedApi);
  mockedApi.get.mockResolvedValue(catalogosFixture);
});

async function renderEffects(phase: string) {
  mockAccess.phase = phase;
  const client = createTestQueryClient();
  const view = await render(
    <QueryClientProvider client={client}>
      <SignedInEffects />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

describe("SignedInEffects", () => {
  it.each(["loading", "auth", "error", "complete-profile"])(
    "does nothing while the phase is %s",
    async (phase) => {
      const { client } = await renderEffects(phase);

      expect(mockedApi.get).not.toHaveBeenCalled();
      expect(client.getQueryData(catalogosQuery().queryKey)).toBeUndefined();
      expect(mockedPushRegistration).not.toHaveBeenCalled();
    },
  );

  it("prefetches the whole catalog once signed in", async () => {
    const { client } = await renderEffects("app");

    await waitFor(() =>
      expect(client.getQueryData(catalogosQuery().queryKey)).toEqual(catalogosFixture),
    );
    expect(mockedApi.get).toHaveBeenCalledTimes(1);
    expect(mockedApi.get.mock.calls[0][0]).toBe("/catalogos");
  });

  it("registers for push only when the account has a role that receives pushes", async () => {
    await renderEffects("app");
    expect(mockedPushRegistration).toHaveBeenLastCalledWith(false);

    mockAccess.canVolunteer = true;
    await renderEffects("app");
    expect(mockedPushRegistration).toHaveBeenLastCalledWith(true);
  });

  it("renders nothing", async () => {
    const { toJSON } = await renderEffects("app");
    expect(toJSON()).toBeNull();
  });
});
