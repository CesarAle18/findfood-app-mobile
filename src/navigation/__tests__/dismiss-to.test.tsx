/**
 * `dismissTo` on a link of a stacked screen: it must go back down the segment's stack to the
 * existing `(tabs)` route instead of pushing a second copy of the tabs. Uses the real donor
 * segment layouts (Stack anchored on `(tabs)` + native tabs) under a plain root Stack. Lives
 * outside `src/app`, where every file becomes a route.
 */
import { Stack, router } from "expo-router";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";

import * as DonorTabsModule from "@/app/donante/(tabs)/_layout";
import * as DonorLayoutModule from "@/app/donante/_layout";
import { TextLink } from "@/components/findfood/ui";

// The tab bar reads the unread count; the API is not under test here.
jest.mock("@/services/notificaciones", () => ({
  useNotificacionesNoLeidas: () => ({ data: 0 }),
}));

function StubRoute(name: string) {
  return function Route() {
    return <Text>{`route:${name}`}</Text>;
  };
}

function DismissingDetail() {
  return (
    <TextLink href="/donante/donaciones" dismissTo>
      Regresar
    </TextLink>
  );
}

function PushingDetail() {
  return <TextLink href="/donante/donaciones">Regresar</TextLink>;
}

function routes(detail: () => React.JSX.Element) {
  return {
    _layout: () => <Stack />,
    "donante/_layout": DonorLayoutModule,
    "donante/(tabs)/_layout": DonorTabsModule,
    "donante/(tabs)/index": StubRoute("index"),
    "donante/(tabs)/donaciones": StubRoute("donaciones"),
    "donante/(tabs)/alertas": StubRoute("alertas"),
    "donante/(tabs)/perfil": StubRoute("perfil"),
    "donante/detalle-donacion": detail,
  };
}

interface StateNode {
  name?: string;
  state?: { routes: StateNode[] };
}

/** Route names of the donor segment's stack, bottom first (under the `__root` route). */
function donorStack(rendered: ReturnType<typeof renderRouter>): string[] {
  const root = rendered.getRouterState() as StateNode["state"];
  const app = root?.routes.find((route) => route.name === "__root");
  const donante = app?.state?.routes.find((route) => route.name === "donante");
  return donante?.state?.routes.map((route) => route.name ?? "") ?? [];
}

/**
 * With RNTL 14 `render` is async, so `renderRouter` attaches its route getters to the
 * returned promise: it is wrapped, or awaiting it would unwrap the getters away.
 */
async function openDetailFromDonations(detail: () => React.JSX.Element) {
  const rendered = renderRouter(routes(detail), { initialUrl: "/donante/donaciones" });
  await rendered;
  await screen.findByText("route:donaciones");
  await act(async () => router.push("/donante/detalle-donacion"));
  expect(donorStack(rendered)).toEqual(["(tabs)", "detalle-donacion"]);
  return { rendered };
}

describe("dismissTo links", () => {
  it("return to the existing tabs instead of pushing another copy", async () => {
    const { rendered } = await openDetailFromDonations(DismissingDetail);

    await fireEvent.press(screen.getByText("Regresar"));

    expect(await screen.findByText("route:donaciones")).toBeOnTheScreen();
    expect(rendered.getPathname()).toBe("/donante/donaciones");
    // (`router.canGoBack()` stays true: the tabs keep their own history, index → donaciones.)
    expect(donorStack(rendered)).toEqual(["(tabs)"]);
  });

  it("differ from a plain link, which stacks a second copy of the tabs", async () => {
    const { rendered } = await openDetailFromDonations(PushingDetail);

    await fireEvent.press(screen.getByText("Regresar"));

    expect(await screen.findByText("route:donaciones")).toBeOnTheScreen();
    expect(donorStack(rendered)).toEqual(["(tabs)", "detalle-donacion", "(tabs)"]);
  });
});
