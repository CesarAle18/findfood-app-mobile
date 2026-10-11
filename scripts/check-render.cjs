// Render smoke check: real React Native Web/SVG + Expo Slot, no network or browser.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const native = require("react-native-web");
const root = path.resolve(__dirname, "..");
const original = Module._load;
let routeParams = {};
let fixtures;
let draft;
/** Raw answer of a query key (`["donaciones", "detail", id]`…), or undefined. */
function answerFor(queryKey) {
  const [root, kind, arg] = queryKey;
  if (root === "perfil") return fixtures.impactoFixture();
  if (root !== "donaciones") return undefined;
  if (kind === "detail")
    return fixtures.detalleFixture({ id: arg, estado: "RECIBIDA" });
  if (kind === "list")
    return fixtures.pageFixture([
      fixtures.resumenFixture(),
      fixtures.resumenFixture({
        id: "uuid-2",
        codigo: "DON-1051",
        estado: "RECIBIDA",
      }),
    ]);
  return undefined;
}
// TanStack Query without a client or network: each query answers its fixture at once,
// through the screen's own `select`, as a settled result.
function settled(data) {
  return {
    data,
    error: null,
    status: data === undefined ? "pending" : "success",
    isPending: data === undefined,
    isFetching: false,
    refetch() {},
  };
}
const queryStubs = {
  useQuery: (options) => {
    const raw =
      options.enabled === false ? undefined : answerFor(options.queryKey);
    return settled(
      raw !== undefined && options.select ? options.select(raw) : raw,
    );
  },
  useInfiniteQuery: (options) => {
    const page = answerFor(options.queryKey);
    const raw = { pages: [page], pageParams: [options.initialPageParam] };
    return {
      ...settled(options.select ? options.select(raw) : raw),
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage() {},
    };
  },
};
Module._extensions[".tsx"] = Module._extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
};
Module._extensions[".png"] = (module) => {
  module.exports = { uri: "/logo.png" };
};
// Reanimated no se puede cargar en Node plano: arrastra react-native-worklets,
// que necesita el plugin de Babel y el runtime nativo. Este doble mínimo deja que
// las pantallas se monten; las animaciones se verifican en dispositivo, no aquí.
const chainable = () => {
  const builder = {};
  for (const method of [
    "duration",
    "delay",
    "easing",
    "springify",
    "damping",
    "dampingRatio",
    "mass",
    "stiffness",
    "rotate",
    "reduceMotion",
    "randomDelay",
    "withInitialValues",
    "withTargetValues",
    "build",
  ])
    builder[method] = () => builder;
  return builder;
};
const easingStub = () => 0;
// Las props de animación no llegan al DOM: react-native-web avisaría por ellas.
const withoutMotionProps = ({ entering, exiting, layout, ...props }) => props;
const reanimatedStub = {
  __esModule: true,
  View: (props) => React.createElement(native.View, withoutMotionProps(props)),
  Text: (props) => React.createElement(native.Text, withoutMotionProps(props)),
  ScrollView: (props) =>
    React.createElement(native.ScrollView, withoutMotionProps(props)),
  createAnimatedComponent: (component) => component,
  FadeIn: chainable(),
  FadeOut: chainable(),
  FadeInDown: chainable(),
  LinearTransition: chainable(),
  Keyframe: function Keyframe() {
    return chainable();
  },
  Easing: {
    linear: easingStub,
    quad: easingStub,
    cubic: easingStub,
    in: () => easingStub,
    out: () => easingStub,
    inOut: () => easingStub,
    elastic: () => easingStub,
    bezier: () => ({ factory: () => easingStub }),
  },
  LayoutAnimationConfig: ({ children }) =>
    React.createElement(React.Fragment, null, children),
  useSharedValue: (initial) => ({
    value: initial,
    get: () => initial,
    set() {},
  }),
  useAnimatedStyle: (factory) => factory(),
  withTiming: (value) => value,
  interpolateColor: (_progress, _input, output) => output[0],
};
reanimatedStub.default = reanimatedStub;
let Slot;
Module._load = function (name, parent, isMain) {
  if (name === "react-native-svg")
    return original.call(
      this,
      "react-native-svg/lib/commonjs/elements.web",
      parent,
      isMain,
    );
  if (name === "react-native") return native;
  if (name === "react-native-reanimated") return reanimatedStub;
  if (name === "react-native-safe-area-context")
    return {
      SafeAreaView: ({ edges, ...props }) =>
        React.createElement(native.View, props),
    };
  if (name === "expo-router")
    return {
      Link: ({ children, href, asChild }) =>
        React.createElement(
          Slot,
          { href: typeof href === "string" ? href : href.pathname },
          children,
        ),
      router: {
        canGoBack: () => false,
        replace() {},
        back() {},
        dismissAll() {},
      },
      useLocalSearchParams: () => routeParams,
    };
  // The account menu reads the roles; the real session needs Supabase and SecureStore.
  if (name === "@/state/session")
    return {
      useAccess: () => ({
        phase: "app",
        activeRole: "DONANTE",
        canDonor: true,
        canVolunteer: true,
        setActiveRole() {},
      }),
      useMe: () => settled(fixtures.meFixture()),
      deviceIdStorage: {},
    };
  if (name === "@/state/mobile-context")
    return {
      useMobile: () => ({
        available: true,
        setAvailable() {},
        draft,
        setDraft() {},
      }),
    };
  // No requests leave this check: the query hooks are stubbed above.
  if (name === "@/api") return { api: {} };
  if (name === "@tanstack/react-query")
    return {
      ...original.call(this, name, parent, isMain),
      ...queryStubs,
    };
  // FlashList needs native measurements; a plain map keeps the rows, header and footer.
  if (name === "@shopify/flash-list")
    return {
      FlashList: ({
        data,
        renderItem,
        keyExtractor,
        ListEmptyComponent,
        ListFooterComponent,
      }) =>
        React.createElement(
          native.View,
          null,
          data.length === 0
            ? ListEmptyComponent
            : data.map((item, index) =>
                React.createElement(
                  React.Fragment,
                  { key: keyExtractor(item, index) },
                  renderItem({ item, index }),
                ),
              ),
          ListFooterComponent,
        ),
    };
  if (name.startsWith("@/")) name = path.join(root, "src", name.slice(2));
  return original.call(this, name, parent, isMain);
};
Slot = require("expo-router/build/ui/Slot").Slot;
fixtures = require("../src/test-utils/fixtures.ts");
const {
  initialDonationDraft,
  appendProduct,
  removeProduct,
} = require("../src/domain/donation-draft.ts");
draft = initialDonationDraft;
const warnings = [];
const originalError = console.error;
console.error = (...args) => warnings.push(args.join(" "));
try {
  const modules = [
    "assigned-volunteer",
    "auth",
    "home",
    "donations",
    "volunteer",
    "route",
    "notifications",
    "donor",
    "account",
  ];
  let count = 0;
  for (const module of modules) {
    const exports = require(`../src/screens/${module}.tsx`);
    for (const [name, component] of Object.entries(exports)) {
      if (!name.endsWith("Screen")) continue;
      const html = renderToStaticMarkup(React.createElement(component));
      assert(html.includes("Find Food"), `${name} did not render its header`);
      if (name === "VolunteerRegistrationScreen") {
        assert(html.includes("Tipo de identificación"));
        assert(html.includes("Foto licencia"));
      }
      count++;
    }
  }
  const { ProfileScreen } = require("../src/screens/account.tsx");
  const volunteerProfileHtml = renderToStaticMarkup(
    React.createElement(ProfileScreen, { volunteer: true }),
  );
  assert(volunteerProfileHtml.includes("María García López"));
  assert(volunteerProfileHtml.includes("Camioneta"));
  count++;
  // Remote lists and details render their rows: human codes, never the UUIDs.
  const {
    DonationsScreen,
    DonorHomeScreen,
  } = require("../src/screens/donor.tsx");
  const donationsHtml = renderToStaticMarkup(
    React.createElement(DonationsScreen),
  );
  assert(donationsHtml.includes("DON-1058") && donationsHtml.includes("DON-1051"));
  assert(!donationsHtml.includes(fixtures.DONATION_ID));
  assert(
    renderToStaticMarkup(React.createElement(DonorHomeScreen)).includes(
      "DON-1058",
    ),
  );
  const { RatingScreen } = require("../src/screens/account.tsx");
  routeParams = { id: fixtures.DONATION_ID };
  const donorRatingHtml = renderToStaticMarkup(React.createElement(RatingScreen));
  assert(donorRatingHtml.includes("DON-1058") && donorRatingHtml.includes("Carlos Ruiz"));
  assert(
    renderToStaticMarkup(
      React.createElement(RatingScreen, { rater: "VOLUNTARIO" }),
    ).includes("María García"),
  );
  routeParams = {};
  assert(
    renderToStaticMarkup(React.createElement(RatingScreen)).includes(
      "No encontramos la donación",
    ),
  );
  const expanded = appendProduct(appendProduct(initialDonationDraft));
  assert.equal(expanded.products.length, 3);
  const removed = removeProduct(expanded, expanded.products[1].id);
  assert.equal(removed.products.length, 2);
  assert.deepEqual(removed.products, [
    expanded.products[0],
    expanded.products[2],
  ]);
  assert.equal(removeProduct(initialDonationDraft, 1).products.length, 1);
  const {
    calendarDays,
  } = require("../src/components/findfood/date-time-field.tsx");
  assert.equal(calendarDays(2028, 1).filter(Boolean).length, 29);
  assert.equal(calendarDays(2027, 1).filter(Boolean).length, 28);
  assert.equal(calendarDays(2026, 8)[0], null);
  const { WaitingScreen } = require("../src/screens/donations.tsx");
  const waitingHtml = renderToStaticMarkup(React.createElement(WaitingScreen));
  assert(waitingHtml.includes('href="/donante/voluntario-asignado"'));
  assert(waitingHtml.includes('href="/donante"'));
  assert.equal(initialDonationDraft.products.length, 1);
  assert.equal(new Set(expanded.products.map((p) => p.id)).size, 3);
  draft = {
    ...expanded,
    products: expanded.products.map((p, i) => ({
      ...p,
      name: `Producto prueba ${i + 1}`,
      unit: i === 1 ? "ML" : p.unit,
    })),
  };
  const { NewDonationScreen } = require("../src/screens/donations.tsx");
  const {
    ReviewDonationScreen,
    DonationDetailScreen,
  } = require("../src/screens/donor.tsx");
  const newHtml = renderToStaticMarkup(React.createElement(NewDonationScreen));
  assert.equal((newHtml.match(/Ubicación de la entrega/g) || []).length, 1);
  assert(newHtml.includes("Añadir otro producto"));
  const reviewHtml = renderToStaticMarkup(
    React.createElement(ReviewDonationScreen),
  );
  assert(reviewHtml.includes("Producto prueba 3") && reviewHtml.includes("ML"));
  routeParams = { id: fixtures.DONATION_ID };
  const donorDetailHtml = renderToStaticMarkup(
    React.createElement(DonationDetailScreen),
  );
  assert(donorDetailHtml.includes('href="/donante/calificar-voluntario"'));
  assert(donorDetailHtml.includes('href="/donante/donaciones"'));
  // Volunteers open the same detail from their route, without the donor actions.
  const volunteerDetailHtml = renderToStaticMarkup(
    React.createElement(DonationDetailScreen, { asVolunteer: true }),
  );
  assert(!volunteerDetailHtml.includes("Calificar voluntario"));
  assert(volunteerDetailHtml.includes('href="/voluntario/rutas"'));
  const { AccountScreen } = require("../src/screens/account.tsx");
  const accountHtml = renderToStaticMarkup(React.createElement(AccountScreen));
  assert(
    accountHtml.includes("Ver como donante") &&
      accountHtml.includes("Ver como voluntario"),
  );
  const { VerifyEmailScreen } = require("../src/screens/account.tsx");
  assert(
    renderToStaticMarkup(React.createElement(VerifyEmailScreen)).includes(
      'href="/login"',
    ),
  );
  const {
    VolunteerRegistrationScreen,
  } = require("../src/screens/volunteer.tsx");
  assert(
    renderToStaticMarkup(
      React.createElement(VolunteerRegistrationScreen),
    ).includes('href="/donante"'),
  );
  const {
    LoadingState,
    EmptyState,
    ErrorState,
    OfflineBanner,
  } = require("../src/components/findfood/feedback.tsx");
  const { Button, Field } = require("../src/components/findfood/ui.tsx");
  const noop = () => {};
  const feedbackHtml = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(LoadingState, { label: "Cargando donaciones" }),
      React.createElement(EmptyState, { title: "Aún no tienes donaciones" }),
      React.createElement(ErrorState, {
        error: null,
        onRetry: noop,
        secondaryAction: { label: "Cerrar sesión", onPress: noop },
      }),
      React.createElement(OfflineBanner),
      React.createElement(Field, {
        label: "Correo electrónico",
        value: "",
        onChangeText: noop,
        error: "Ingresa tu correo electrónico.",
      }),
      React.createElement(Button, { onPress: noop, loading: true }, "Ingresar"),
    ),
  );
  assert(feedbackHtml.includes("Cargando donaciones"));
  assert(feedbackHtml.includes("Aún no tienes donaciones"));
  assert(feedbackHtml.includes("Reintentar") && feedbackHtml.includes("Cerrar sesión"));
  assert(feedbackHtml.includes("Ingresa tu correo electrónico."));
  assert(feedbackHtml.includes('aria-invalid="true"'));
  assert(feedbackHtml.includes('aria-busy="true"'));
  // Server rendering has no connection state, so the offline banner stays hidden.
  assert(!feedbackHtml.includes("Sin conexión"));
  console.log(
    "PASS: loading, empty and error states, field error and busy button rendered.",
  );
  // Exercise local handlers without requiring a native device or browser.
  const realUseState = React.useState;
  function harness(Component, props = {}) {
    const states = [];
    let cursor = 0;
    return () => {
      cursor = 0;
      React.useState = (initial) => {
        const i = cursor++;
        if (!(i in states))
          states[i] = typeof initial === "function" ? initial() : initial;
        return [
          states[i],
          (value) => {
            states[i] = typeof value === "function" ? value(states[i]) : value;
          },
        ];
      };
      try {
        return Component(props);
      } finally {
        React.useState = realUseState;
      }
    };
  }
  function nodes(tree) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
  }
  const { Choices } = require("../src/components/findfood/ui.tsx");
  const choice = harness(Choices, { values: ["Sí, dispone", "No dispone"] });
  nodes(choice())
    .filter((n) => n.props?.role === "radio")[1]
    .props.onPress();
  assert.equal(
    nodes(choice()).filter((n) => n.props?.role === "radio")[1].props.selected,
    true,
  );
  routeParams = { id: fixtures.DONATION_ID };
  const rating = harness(RatingScreen, { rater: "VOLUNTARIO" });
  nodes(rating())
    .find((n) => n.props?.accessibilityLabel === "5 estrellas")
    .props.onPress();
  assert(
    nodes(rating())
      .filter((n) => n.props?.role === "checkbox")
      .every((n) => n.props.disabled),
  );
  nodes(rating())
    .find((n) => n.props?.accessibilityLabel === "4 estrellas")
    .props.onPress();
  assert(
    nodes(rating())
      .filter((n) => n.props?.role === "checkbox")
      .every((n) => !n.props.disabled),
  );
  const {
    AvailabilityField,
  } = require("../src/components/findfood/availability-field.tsx");
  let schedule;
  const availability = harness(AvailabilityField, {
    onChange: (value) => {
      schedule = value;
    },
  });
  nodes(availability())
    .find((n) => n.props?.label === "Desde · Lunes")
    .props.onChange("23:00");
  assert.equal(
    nodes(availability()).find((n) => n.props?.label === "Hasta · Lunes").props
      .value,
    "23:30",
  );
  assert(schedule.includes("23:00–23:30"));
  console.log(
    "PASS: option selection, five-star aspect lock/unlock and availability time boundaries.",
  );

  const invalid = warnings.filter((w) =>
    /does not recognize|Invalid|array of styles|Each child.*key/i.test(w),
  );
  assert.deepEqual(invalid, [], "React rendering warnings");
  console.log(
    `PASS: ${count} screen components rendered; identification/license fields, selected donation, segment links, account views and Slot/DOM regressions checked.`,
  );
  if (warnings.length) console.log("Other renderer notices:", warnings.length);
} finally {
  console.error = originalError;
  Module._load = original;
}
