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
/** What the fake session reports: `useAccess().phase`, `.activeRole` and `useMe().data`. */
let accessPhase = "app";
let activeRole = "DONANTE";
let me;
let fixtures;
let draft;
/** What `GET /rutas/:id` answers for the stop screens. */
let routeDetail;
/** Raw answer of a query key (`["donaciones", "detail", id]`…), or undefined. */
function answerFor(queryKey) {
  const [root, kind, arg] = queryKey;
  if (root === "perfil") return fixtures.impactoFixture();
  if (root === "notificaciones" && kind === "list")
    return fixtures.bandejaFixture([fixtures.notificacionFixture()]);
  if (root === "asignaciones" && kind === "ofertas") return [fixtures.ofertaFixture()];
  if (root === "catalogos") return fixtures.catalogosFixture;
  if (root === "rutas" && kind === "detail") return routeDetail;
  if (root === "evidencias") return [];
  if (root !== "donaciones") return undefined;
  if (kind === "detail")
    return fixtures.detalleFixture({ id: arg, estado: "RECIBIDA" });
  if (kind === "historial") return [];
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
  // Only read by handlers (cache invalidation), never while rendering.
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  // Mutations only run from handlers.
  useMutation: () => ({ mutateAsync: async () => undefined, isPending: false }),
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
  // Needs its native module; the screens' scroll view renders as a plain one here.
  if (name === "react-native-keyboard-controller")
    return {
      KeyboardAwareScrollView: ({ bottomOffset, ...props }) =>
        React.createElement(native.ScrollView, props),
    };
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
        phase: accessPhase,
        activeRole,
        canDonor: true,
        canVolunteer: true,
        setActiveRole() {},
      }),
      useMe: () => settled(me),
      useSession: () => ({ status: "none" }),
      // Only called from handlers and effects, which server rendering never runs.
      useSessionActions: () => ({
        cerrarSesion: async () => {},
        setRecovering() {},
      }),
    };
  // SecureStore has no Node build; the push registration only writes from handlers.
  if (name === "@/state/device-storage") return { deviceIdStorage: {} };
  if (name === "@/state/mobile-context")
    return {
      useMobile: () => ({
        draft,
        setDraft() {},
      }),
    };
  // The real module defines a native background task (expo-location, expo-task-manager);
  // the screens only read its status and start it from handlers.
  if (name === "@/location/tracking")
    return {
      startLocationTracking: async () => "denied",
      stopLocationTracking: async () => {},
      trackingStatusStore: { get: () => "off", subscribe: () => () => {} },
    };
  // expo-location has no Node build; the stop actions only read a fix from handlers.
  if (name === "@/location/current-fix") return { getCurrentFix: async () => null };
  // Same for the route screen's live position: idle until the volunteer shares it.
  if (name === "@/location/live-route")
    return {
      useLiveRoute: () => ({
        position: null,
        seguimiento: null,
        gate: "unknown",
        request: async () => "unknown",
      }),
    };
  // The donor's live position joins a Supabase Realtime channel: idle here.
  if (name === "@/location/volunteer-live-position")
    return {
      useVolunteerLivePosition: () => ({ status: null, position: null }),
      useGlide: (target) => target,
    };
  // No requests leave this check: the query hooks are stubbed above.
  if (name === "@/api") return { api: {} };
  // Photo capture and upload need the native picker, manipulator and file system; the
  // fields only start them from handlers, so their idle state is enough here.
  if (name === "@/media/use-photo-capture")
    return {
      choosePhotoSource: async () => null,
      usePhotoCapture: () => ({
        pick: async () => null,
        cameraGate: "unknown",
        libraryGate: "unknown",
        requestCamera: async () => "unknown",
        requestLibrary: async () => "unknown",
      }),
    };
  if (name === "@/media/use-evidence-upload")
    return {
      useEvidenceUpload: () => ({
        pending: null,
        status: "idle",
        error: null,
        start: async () => {},
        retry: async () => {},
      }),
    };
  if (name === "expo-image") return { Image: native.Image };
  // react-native-maps needs its native module; each map renders as a labelled box here
  // (the map components are covered by Jest).
  if (name === "@/components/findfood/map") {
    const mapStub = (label) => () =>
      React.createElement(native.View, { "aria-label": label });
    return {
      DonorTrackingMap: mapStub("Mapa del recorrido del voluntario"),
      FindFoodMap: mapStub("Mapa"),
      LocationPicker: mapStub("Mapa para elegir el punto de recogida"),
      PointMap: mapStub("Mapa del punto de recogida"),
      RouteMapView: mapStub("Mapa de la ruta"),
    };
  }
  // The real module creates the Supabase client (SecureStore, Expo config); the forms only
  // call these actions from their handlers.
  if (name === "@/auth/email-auth") {
    const unused = async () => {
      throw new Error("not available in the render check");
    };
    return {
      AUTH_UNAVAILABLE_CODE: "auth_unavailable",
      isEmailAuthAvailable: () => true,
      signIn: unused,
      signUp: unused,
      verifyEmailOtp: unused,
      resendSignupOtp: unused,
      requestPasswordReset: unused,
      exchangeRecoveryCode: unused,
      updatePassword: unused,
    };
  }
  // The real module loads Google Sign-In's native module and the Supabase client; the login
  // only starts it from a handler.
  if (name === "@/auth/google-auth")
    return {
      isGoogleSignInAvailable: () => true,
      signInWithGoogle: async () => {
        throw new Error("not available in the render check");
      },
      signOutFromGoogle: async () => {},
    };
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
me = fixtures.meFixture();
// A route in progress whose first pickup the volunteer reached.
routeDetail = fixtures.rutaDetalleFixture({
  estado: "EN_CURSO",
  paradas: fixtures
    .rutaDetalleFixture()
    .paradas.map((p) => (p.id === "par-1" ? { ...p, estado: "EN_SITIO" } : p)),
});
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
    "donor-delivery",
    "account",
    "password",
    "profile-setup",
    "edit-profile",
    "edit-availability",
  ];
  let count = 0;
  for (const module of modules) {
    const exports = require(`../src/screens/${module}.tsx`);
    for (const [name, component] of Object.entries(exports)) {
      if (!name.endsWith("Screen")) continue;
      const html = renderToStaticMarkup(React.createElement(component));
      assert(html.includes("Find Food"), `${name} did not render its header`);
      if (name === "VolunteerRegistrationScreen") {
        // The default account is an approved volunteer: the status, not the form.
        assert(html.includes("Ya eres voluntario") && html.includes("Ir al modo voluntario"));
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
  // The volunteer view of the profile editor adds the vehicle (read-only) and the zone.
  const { EditProfileScreen } = require("../src/screens/edit-profile.tsx");
  assert(!renderToStaticMarkup(React.createElement(EditProfileScreen)).includes("Vehículo y zona"));
  activeRole = "VOLUNTARIO";
  const volunteerEditorHtml = renderToStaticMarkup(React.createElement(EditProfileScreen));
  activeRole = "DONANTE";
  assert(volunteerEditorHtml.includes("Información de voluntario"));
  assert(volunteerEditorHtml.includes("Vehículo y zona") && volunteerEditorHtml.includes("ABC123"));
  assert(volunteerEditorHtml.includes("Radio de cobertura (km)"));
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
  // Inicio: impact metrics, the latest donation and the inbox as recent activity.
  const homeHtml = renderToStaticMarkup(React.createElement(DonorHomeScreen));
  assert(homeHtml.includes("DON-1058") && homeHtml.includes("en seguimiento"));
  assert(homeHtml.includes("Donación recibida") && !homeHtml.includes("Ayer 18:40"));
  // The inbox renders its rows from the API, not the old preview data.
  const { NotificationsScreen } = require("../src/screens/notifications.tsx");
  const inboxHtml = renderToStaticMarkup(React.createElement(NotificationsScreen));
  assert(inboxHtml.includes("Donación recibida") && inboxHtml.includes("Marcar todas como leídas"));
  // The offer shows a real assignment: by its link, else the first one pending.
  const { OfferScreen } = require("../src/screens/volunteer.tsx");
  const offerHtml = renderToStaticMarkup(React.createElement(OfferScreen));
  assert(offerHtml.includes("DON-1048") && offerHtml.includes("15:10"));
  routeParams = { asignacionId: "otra" };
  assert(
    renderToStaticMarkup(React.createElement(OfferScreen)).includes(
      "Esta oferta ya no está disponible",
    ),
  );
  // The pickup registration reads its stop from the route and the items from the donation.
  const { CollectionScreen } = require("../src/screens/volunteer.tsx");
  routeParams = { paradaId: "par-1", rutaId: "ruta-1" };
  const collectionHtml = renderToStaticMarkup(React.createElement(CollectionScreen));
  assert(collectionHtml.includes("Parada 1 de 3") && collectionHtml.includes("Estado del producto"));
  assert(collectionHtml.includes("Total recogido: 35 kg"));
  routeParams = {};
  assert(
    renderToStaticMarkup(React.createElement(CollectionScreen)).includes(
      "Abre la recogida desde tu ruta",
    ),
  );
  // The delivery shows the warehouse of the route in progress.
  const { DeliveryScreen } = require("../src/screens/donations.tsx");
  routeParams = { paradaId: "par-3", rutaId: "ruta-1" };
  const volunteerDeliveryHtml = renderToStaticMarkup(React.createElement(DeliveryScreen));
  assert(volunteerDeliveryHtml.includes("Ruta R-045") && volunteerDeliveryHtml.includes("Bodega Norte"));
  routeParams = {};
  assert(
    renderToStaticMarkup(React.createElement(DeliveryScreen)).includes(
      "Abre la entrega desde tu ruta",
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
  // Without an id it asks to open the donation again; with one it shows the live donation.
  assert(
    renderToStaticMarkup(React.createElement(WaitingScreen)).includes(
      "No encontramos la donación",
    ),
  );
  routeParams = { id: fixtures.DONATION_ID };
  const waitingHtml = renderToStaticMarkup(React.createElement(WaitingScreen));
  routeParams = {};
  assert(waitingHtml.includes("DON-1058") && waitingHtml.includes("Ver voluntario asignado"));
  assert(!waitingHtml.includes("15–30 minutos") && !waitingHtml.includes("(demo)"));
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
  // The typed address and the map live side by side; nothing is picked yet.
  assert(newHtml.includes("Dirección de recogida"));
  assert(newHtml.includes("Mapa para elegir el punto de recogida"));
  assert(newHtml.includes("Ubica la dirección escrita, usa tu ubicación o mueve el mapa"));
  assert(newHtml.includes("Añadir otro producto"));
  const reviewHtml = renderToStaticMarkup(
    React.createElement(ReviewDonationScreen),
  );
  assert(reviewHtml.includes("Producto prueba 3") && reviewHtml.includes("ML"));
  assert(reviewHtml.includes("Punto pendiente de seleccionar en el mapa"));
  draft = {
    ...draft,
    direccion: "Cra 45 #12-30",
    ubicacionRecogida: { lat: 4.65, lng: -74.06 },
  };
  const pickedHtml = renderToStaticMarkup(
    React.createElement(ReviewDonationScreen),
  );
  assert(pickedHtml.includes("Cra 45 #12-30"));
  assert(pickedHtml.includes("Mapa del punto de recogida"));
  routeParams = { id: fixtures.DONATION_ID };
  const donorDetailHtml = renderToStaticMarkup(
    React.createElement(DonationDetailScreen),
  );
  assert(donorDetailHtml.includes('href="/donante/calificar-voluntario"'));
  assert(donorDetailHtml.includes('href="/donante/donaciones"'));
  assert(donorDetailHtml.includes("Mapa del punto de recogida"));
  // The history timeline, and the call once the API shares the volunteer's phone.
  assert(donorDetailHtml.includes("Historial") && donorDetailHtml.includes("Contactar voluntario"));
  assert(donorDetailHtml.includes('href="/donante/entrega-donacion"'));
  // The donor's delivery confirmation (MOV-39): real data and the rating CTA.
  const { DonorDeliveryScreen } = require("../src/screens/donor-delivery.tsx");
  const deliveryHtml = renderToStaticMarkup(React.createElement(DonorDeliveryScreen));
  assert(deliveryHtml.includes("Tu donación fue entregada") && deliveryHtml.includes("Carlos Ruiz"));
  assert(deliveryHtml.includes('href="/donante/calificar-voluntario"'));
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
  // Sign-out is an action (confirmed first), not a link to the login.
  assert(accountHtml.includes("Cerrar sesión") && !accountHtml.includes('href="/login"'));
  // Without an `email` param the verification links back to login.
  const { VerifyEmailScreen } = require("../src/screens/account.tsx");
  assert(
    renderToStaticMarkup(React.createElement(VerifyEmailScreen)).includes(
      'href="/login"',
    ),
  );
  routeParams = { email: "maria@correo.com" };
  const verifyHtml = renderToStaticMarkup(React.createElement(VerifyEmailScreen));
  assert(verifyHtml.includes("maria@correo.com"));
  // Nothing was sent from this screen: no cooldown.
  assert(!verifyHtml.includes("Reenviar código en"));
  // Only a sign-up shows the neutral note, which never says whether the address existed.
  assert(!verifyHtml.includes('href="/recuperar-contrasena"'));
  routeParams = { email: "maria@correo.com", origen: "registro" };
  const signUpVerifyHtml = renderToStaticMarkup(React.createElement(VerifyEmailScreen));
  assert(signUpVerifyHtml.includes("Si el correo es nuevo, te enviamos un código."));
  assert(!signUpVerifyHtml.includes('href="/recuperar-contrasena"'));
  // Supabase just sent the sign-up code: the cooldown runs from the start.
  assert(signUpVerifyHtml.includes("Reenviar código en 01:00"));
  routeParams = { email: "maria@correo.com", enviar: "1" };
  const sendVerifyHtml = renderToStaticMarkup(React.createElement(VerifyEmailScreen));
  assert(sendVerifyHtml.includes("Enviando un código a tu correo…"));
  assert(!sendVerifyHtml.includes("Reenviar código en"));
  routeParams = {};
  // The auth forms no longer link into the app: the guards open it after signing in.
  const { LoginScreen, RegisterScreen } = require("../src/screens/auth.tsx");
  const loginHtml = renderToStaticMarkup(React.createElement(LoginScreen));
  assert(loginHtml.includes("Iniciar sesión") && loginHtml.includes('href="/registro"'));
  assert(!loginHtml.includes('href="/donante"'));
  assert(loginHtml.includes("Continuar con Google") && !loginHtml.includes("próximamente"));
  const registerHtml = renderToStaticMarkup(React.createElement(RegisterScreen));
  assert(registerHtml.includes("Apellidos") && registerHtml.includes("Celular"));
  assert(!/documento/i.test(registerHtml));
  assert(!registerHtml.includes('href="/verificar-correo"'));
  // Password recovery and the account steps.
  const { ForgotPasswordScreen } = require("../src/screens/auth.tsx");
  const forgotHtml = renderToStaticMarkup(React.createElement(ForgotPasswordScreen));
  assert(forgotHtml.includes("Enviar enlace") && forgotHtml.includes('href="/login"'));
  const {
    ResetPasswordScreen,
    ChangePasswordScreen,
  } = require("../src/screens/password.tsx");
  // Without a link: a way to request one, never the form.
  const noLinkHtml = renderToStaticMarkup(React.createElement(ResetPasswordScreen));
  assert(noLinkHtml.includes('href="/recuperar-contrasena"'));
  assert(!noLinkHtml.includes("Nueva contraseña"));
  routeParams = { error: "access_denied", error_code: "otp_expired", error_description: "Email link is invalid or has expired" };
  const expiredHtml = renderToStaticMarkup(React.createElement(ResetPasswordScreen));
  assert(expiredHtml.includes("expiró o ya se usó") && !expiredHtml.includes("Email link"));
  routeParams = { code: "auth-code", sb_flow_id: "flow-id-1234" };
  assert(
    renderToStaticMarkup(React.createElement(ResetPasswordScreen)).includes("Validando el enlace…"),
  );
  routeParams = {};
  accessPhase = "recovering";
  const resetFormHtml = renderToStaticMarkup(React.createElement(ResetPasswordScreen));
  assert(resetFormHtml.includes("Nueva contraseña") && resetFormHtml.includes("Cancelar"));
  accessPhase = "app";
  const changeHtml = renderToStaticMarkup(React.createElement(ChangePasswordScreen));
  assert(changeHtml.includes("Confirmar contraseña") && changeHtml.includes("Cerrar sesión"));
  const { CompleteProfileScreen } = require("../src/screens/profile-setup.tsx");
  me = fixtures.meFixture({
    nombres: "Ana",
    apellidos: null,
    telefono: null,
    pendientes: ["TELEFONO", "ACEPTAR_TERMINOS"],
  });
  const profileHtml = renderToStaticMarkup(React.createElement(CompleteProfileScreen));
  assert(profileHtml.includes('value="Ana"') && profileHtml.includes("Acepto los Términos"));
  me = fixtures.meFixture({ telefono: null, pendientes: ["TELEFONO"] });
  assert(
    !renderToStaticMarkup(React.createElement(CompleteProfileScreen)).includes("Acepto los Términos"),
  );
  me = fixtures.meFixture();
  const {
    VolunteerRegistrationScreen,
  } = require("../src/screens/volunteer.tsx");
  // A donor without a request sees the form; a pending request only its status.
  me = fixtures.meFixture({ voluntario: null });
  const requestFormHtml = renderToStaticMarkup(React.createElement(VolunteerRegistrationScreen));
  assert(requestFormHtml.includes("Tipo de vehículo") && requestFormHtml.includes("Placa"));
  assert(requestFormHtml.includes("Documento (frente)") && requestFormHtml.includes("Enviar solicitud"));
  me = fixtures.meFixture({
    voluntario: { ...fixtures.meFixture().voluntario, estado_verificacion: "PENDIENTE" },
  });
  const pendingHtml = renderToStaticMarkup(React.createElement(VolunteerRegistrationScreen));
  assert(pendingHtml.includes("Tu solicitud está en revisión"));
  assert(!pendingHtml.includes("Enviar solicitud") && pendingHtml.includes('href="/donante"'));
  me = fixtures.meFixture();
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
  // The donor rates with the volunteer aspects of the catalog.
  const rating = harness(RatingScreen, { rater: "DONANTE" });
  assert.deepEqual(
    nodes(rating())
      .filter((n) => n.props?.role === "checkbox")
      .map((n) => n.props.label),
    ["Puntualidad", "Amabilidad"],
  );
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
  // Controlled: each render reads the windows the last change reported.
  let schedule = [{ dia_semana: 1, hora_inicio: "08:00", hora_fin: "18:00" }];
  const availability = () =>
    harness(AvailabilityField, {
      value: schedule,
      onChange: (value) => {
        schedule = value;
      },
    })();
  const endOf = () =>
    nodes(availability()).find((n) => n.props?.label === "Hasta · Lunes").props;
  nodes(availability())
    .find((n) => n.props?.label === "Desde · Lunes")
    .props.onChange("23:00");
  assert.equal(endOf().value, "23:30");
  assert.deepEqual(schedule, [{ dia_semana: 1, hora_inicio: "23:00", hora_fin: "23:30" }]);
  // The last start ends at 23:59: a window never crosses midnight.
  nodes(availability())
    .find((n) => n.props?.label === "Desde · Lunes")
    .props.onChange("23:30");
  assert.equal(endOf().value, "23:59");
  assert.deepEqual(endOf().options.map((o) => o.value), ["23:59"]);
  console.log(
    "PASS: option selection, five-star aspect lock/unlock and availability time boundaries.",
  );

  const invalid = warnings.filter((w) =>
    /does not recognize|Invalid|array of styles|Each child.*key/i.test(w),
  );
  assert.deepEqual(invalid, [], "React rendering warnings");
  console.log(
    `PASS: ${count} screen components rendered; volunteer request form/status, selected donation, segment links, account views and Slot/DOM regressions checked.`,
  );
  if (warnings.length) console.log("Other renderer notices:", warnings.length);
} finally {
  console.error = originalError;
  Module._load = original;
}
