import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";
import { Platform } from "react-native";

import { api } from "@/api";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, type ApiMock } from "@/test-utils/api";
import { createTestQueryClient } from "@/test-utils/query";

import {
  donationKeysForPush,
  notificationFromData,
  useNotificationResponses,
} from "./use-notification-responses";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const mockAccess = {
  phase: "loading",
  canDonor: true,
  canVolunteer: true,
  activeRole: "DONANTE" as "DONANTE" | "VOLUNTARIO" | null,
  setActiveRole: jest.fn(),
};

jest.mock("@/state/session", () => ({ useAccess: () => mockAccess }));

const mockedApi = api as unknown as ApiMock;
const mocked = Notifications as jest.Mocked<typeof Notifications>;
const push = router.push as jest.Mock;

let nextKey = 0;
/** A tapped push; each one gets its own request identifier unless given. */
function response(
  data: Record<string, unknown>,
  {
    identifier = `req-${++nextKey}`,
    action = Notifications.DEFAULT_ACTION_IDENTIFIER,
  }: { identifier?: string; action?: string } = {},
) {
  return {
    actionIdentifier: action,
    notification: { request: { identifier, content: { data } } },
  } as unknown as Notifications.NotificationResponse;
}

const OFFER_DATA = {
  tipo: "ASIGNACION_OFRECIDA",
  asignacion_id: "asg-7",
  notificacion_id: "n-9",
};

let client: QueryClient | undefined;

function renderResponses(ready = true) {
  const queryClient = createTestQueryClient();
  client = queryClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ navigatorReady }: { navigatorReady: boolean }) => useNotificationResponses(navigatorReady),
    { wrapper, initialProps: { navigatorReady: ready } },
  );
}

/** The listener the hook subscribed for taps while the app runs. */
function tapListener(): (response: Notifications.NotificationResponse) => void {
  return mocked.addNotificationResponseReceivedListener.mock.calls.at(-1)![0];
}

beforeEach(() => {
  resetApiMock(mockedApi);
  mockedApi.post.mockResolvedValue(undefined);
  push.mockClear();
  mockAccess.phase = "loading";
  mockAccess.activeRole = "DONANTE";
  mockAccess.setActiveRole.mockClear();
  mocked.getLastNotificationResponse.mockReturnValue(null);
  mocked.clearLastNotificationResponseAsync.mockClear();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Until the read mutation settles and TanStack's batched notifications have run. */
async function settle(current: QueryClient) {
  while (current.isMutating() > 0) await tick();
  await tick();
}

/** A tap while the app runs, settled inside act. */
async function tap(tapped: Notifications.NotificationResponse) {
  await act(async () => tapListener()(tapped));
  // The open (and its read mutation) runs in the effect the tap's render commits.
  const current = client;
  if (current) await act(() => settle(current));
}

afterEach(async () => {
  const current = client;
  if (!current) return;
  await act(() => settle(current));
  current.clear();
  client = undefined;
});

describe("notificationFromData", () => {
  it("reads the API's push data and ignores fields of the wrong type", () => {
    expect(notificationFromData({ ...OFFER_DATA, donacion_id: 3 })).toEqual({
      id: "n-9",
      tipo: "ASIGNACION_OFRECIDA",
      donacion_id: null,
      asignacion_id: "asg-7",
    });
    expect(notificationFromData(null)).toEqual({
      id: null,
      tipo: "",
      donacion_id: null,
      asignacion_id: null,
    });
  });
});

describe("useNotificationResponses", () => {
  it("opens the cold-start tap only once the app phase is reached", async () => {
    mocked.getLastNotificationResponse.mockReturnValue(response(OFFER_DATA));
    const view = await renderResponses();

    expect(push).not.toHaveBeenCalled();

    mockAccess.phase = "app";
    await view.rerender({ navigatorReady: true });

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith({
        pathname: "/voluntario/oferta",
        params: { asignacionId: "asg-7" },
      }),
    );
    // The offer belongs to the other view: switch to it first.
    expect(mockAccess.setActiveRole).toHaveBeenCalledWith("VOLUNTARIO");
    expect(mockedApi.post).toHaveBeenCalledWith("/me/notificaciones/n-9/leer");
    expect(mocked.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });

  it("waits for the navigator even in the app phase", async () => {
    mockAccess.phase = "app";
    mocked.getLastNotificationResponse.mockReturnValue(response(OFFER_DATA));
    const view = await renderResponses(false);
    expect(push).not.toHaveBeenCalled();

    await view.rerender({ navigatorReady: true });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("opens the alerts tab of the current view for an unknown code", async () => {
    mockAccess.phase = "app";
    await renderResponses();

    await tap(response({ tipo: "ALGO_NUEVO", notificacion_id: "n-1" }));

    expect(push).toHaveBeenCalledWith("/donante/alertas");
    expect(mockAccess.setActiveRole).not.toHaveBeenCalled();
  });

  it("handles the same response once, even when the listener repeats the cold start", async () => {
    mockAccess.phase = "app";
    const coldStart = response(OFFER_DATA, { identifier: "same-request" });
    mocked.getLastNotificationResponse.mockReturnValue(coldStart);
    await renderResponses();
    expect(push).toHaveBeenCalledTimes(1);

    await tap(coldStart);

    expect(push).toHaveBeenCalledTimes(1);
  });

  it("skips the cold-start read on web, where the module does not offer it", async () => {
    const os = jest.replaceProperty(Platform, "OS", "web");
    mocked.getLastNotificationResponse.mockClear().mockImplementation(() => {
      throw new Error("ExpoNotifications.getLastNotificationResponse is not available on web");
    });
    mockAccess.phase = "app";
    try {
      await renderResponses();

      expect(mocked.getLastNotificationResponse).not.toHaveBeenCalled();
      // Taps while the page runs still open their screen.
      await tap(response(OFFER_DATA));
      expect(push).toHaveBeenCalledTimes(1);
    } finally {
      os.restore();
    }
  });

  it("ignores action buttons", async () => {
    mockAccess.phase = "app";
    await renderResponses();

    await tap(response(OFFER_DATA, { action: "reply" }));

    expect(push).not.toHaveBeenCalled();
  });

  it("refreshes the inbox and badge when a push arrives in the foreground", async () => {
    await renderResponses();
    const invalidate = jest.spyOn(client!, "invalidateQueries");
    const received = mocked.addNotificationReceivedListener.mock.calls.at(-1)![0];

    await act(() => received({} as Notifications.Notification));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.notificaciones.all });
  });

  it("refreshes the donation a foreground push is about", async () => {
    await renderResponses();
    const invalidate = jest.spyOn(client!, "invalidateQueries");
    const received = mocked.addNotificationReceivedListener.mock.calls.at(-1)![0];
    const notification = {
      request: { content: { data: { tipo: "ASIGNACION_ACEPTADA", donacion_id: "don-3" } } },
    } as unknown as Notifications.Notification;

    await act(() => received(notification));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.donaciones.detail("don-3") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.donaciones.historial("don-3") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.donaciones.lists() });
  });
});

describe("donationKeysForPush", () => {
  it("names the donation detail, history and lists", () => {
    expect(donationKeysForPush({ donacion_id: "don-3" })).toEqual([
      queryKeys.donaciones.detail("don-3"),
      queryKeys.donaciones.historial("don-3"),
      queryKeys.donaciones.lists(),
    ]);
  });

  it.each([undefined, null, {}, { donacion_id: "" }, { donacion_id: 7 }])(
    "is empty without a donation (%p)",
    (data) => {
      expect(donationKeysForPush(data as Record<string, unknown> | null | undefined)).toEqual([]);
    },
  );
});
