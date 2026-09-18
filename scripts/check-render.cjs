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
  assert.deepEqual(removed.products, [expanded.products[0], expanded.products[2]]);
  assert.equal(removeProduct(initialDonationDraft, 1).products.length, 1);
  const { calendarDays } = require("../src/components/findfood/date-time-field.tsx");
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
