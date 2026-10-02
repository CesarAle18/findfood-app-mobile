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
      router: { canGoBack: () => false, replace() {}, back() {} },
      useLocalSearchParams: () => routeParams,
    };
  if (name === "@/state/mobile-context")
    return {
      useMobile: () => ({
        data: fixtures,
        available: true,
        setAvailable() {},
        ratings: { donor: [5, 4], volunteer: [5, 5] },
        addRating() {},
        role: "donor",
        setRole() {},
        draft,
        setDraft() {},
      }),
    };
  if (name.startsWith("@/")) name = path.join(root, "src", name.slice(2));
  return original.call(this, name, parent, isMain);
};
Slot = require("expo-router/build/ui/Slot").Slot;
fixtures = require("../src/data/mobile.ts").mobileData;
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
  assert(
    renderToStaticMarkup(
      React.createElement(ProfileScreen, { volunteer: true }),
    ).includes("Carlos Ruiz"),
  );
  count++;
  const { RatingScreen } = require("../src/screens/account.tsx");
  routeParams = { id: "DON-1051" };
  assert(
    renderToStaticMarkup(React.createElement(RatingScreen)).includes(
      "DON-1051",
    ),
  );
  routeParams = { id: "DON-1056" };
  assert(
    renderToStaticMarkup(React.createElement(RatingScreen)).includes(
      "DON-1056",
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
  assert(waitingHtml.includes('href="/voluntario-asignado"'));
  assert(waitingHtml.includes('href="/inicio-donante"'));
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
  routeParams = { id: "DON-1058" };
  assert(
    renderToStaticMarkup(React.createElement(DonationDetailScreen)).includes(
      'href="/calificar-voluntario"',
    ),
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
    ).includes('href="/inicio-donante"'),
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
  const rating = harness(RatingScreen, { donor: true });
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
    `PASS: ${count} screen components rendered; identification/license fields, selected donation, preview navigation and Slot/DOM regressions checked.`,
  );
  if (warnings.length) console.log("Other renderer notices:", warnings.length);
} finally {
  console.error = originalError;
  Module._load = original;
}
