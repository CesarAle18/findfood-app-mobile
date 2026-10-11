# Find Food móvil

Frontend móvil en React Native, Expo SDK 57 y TypeScript, basado en `Mock Up Proyecto de grado.fig`. Incluye 22 pantallas del diseño mediante 21 componentes de pantalla: ambos perfiles comparten implementación. El inventario completo está en [docs/pantallas.md](docs/pantallas.md).

## Alcance

Interfaz con componentes nativos, identidad verde, Inter local, navegación de demostración y datos simulados. No incluye backend, autenticación real, persistencia, solicitudes HTTP, envío de correo, verificación OTP, cámara ni GPS. La preparación de modelos y repositorio no define todavía el contrato API final.

Los enlaces y algunos botones permiten recorrer flujos sin ejecutar operaciones de negocio. Los demás botones de negocio están deshabilitados. Algunos campos admiten edición local; otros conservan valores ilustrativos de solo lectura. La edición no se envía ni se guarda. Las fotografías son espacios de muestra sin carga de archivos; los mapas son esquemas locales sin geolocalización. Estados como «10:00 min», «Reenviar código en 00:42» y «Ruta completada» son textos de demostración.

## Ejecutar

Requiere Node.js 22.13 o posterior y npm. Descomprimir `Findfood_Movil.zip` y entrar en `findfood-app-mobile`:

```bash
cd findfood-app-mobile
npm ci
npx expo start --clear
```

En la terminal de Expo, pulsar **w** para la vista previa web o escanear el **QR** con Expo Go compatible con SDK 57. También se puede abrir un emulador Android configurado; el simulador iOS requiere macOS y Xcode. La vista web corresponde a la interfaz móvil, no a la aplicación administrativa.

## Entornos

La configuración se lee de variables `EXPO_PUBLIC_*` (plantilla en `.env.example`). Si falta alguna o es inválida, la app muestra una pantalla de configuración inválida (en desarrollo lista las variables con problemas). Hay dos perfiles:

- **real** (por defecto): API desplegada y Supabase. Copiar `.env.example` a `.env.local` (no se versiona) y completar los valores. `npm run start:real` arranca Expo con este perfil y borra el `.env.development.local` generado, si existe.
- **local** (solo desarrollo): `findfood-api` en tu computador. `npm run start:local` (o `npm run start:local -- voluntario`; por defecto `donante`) firma un token de desarrollo para el usuario de prueba y escribe `.env.development.local`, que tiene prioridad sobre `.env.local` y solo se carga en desarrollo.

Requisitos del perfil local:

1. En `findfood-api`: `npm run datos:prueba` (crea los usuarios de prueba y `postman/FindFood-local.postman_environment.json`) y luego `npm run start:local`.
2. El script busca la API en `../findfood-api`; si está en otra carpeta, definir `FINDFOOD_API_DIR`.
3. El teléfono debe estar en la misma red LAN que el computador. Se usa la primera IPv4 de la LAN; si no es la correcta (VPN, WSL, adaptadores virtuales), definir `DEV_API_HOST`. El puerto es `DEV_API_PORT` (3000 por defecto).
4. En Windows, permitir conexiones entrantes al puerto 3000 en el firewall para redes privadas. Por ejemplo, en PowerShell como administrador: `New-NetFirewallRule -DisplayName "findfood-api 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private`.

El token dura 24 h (`DEV_TOKEN_TTL_HOURS`); al vencer, ejecutar de nuevo `npm run start:local`. `EXPO_PUBLIC_DEV_TOKEN` nunca debe ir en `.env`, `.env.local` ni en EAS. Los argumentos extra pasan a `expo start` (`npm run start:local -- donante --android`), y `--no-start` solo genera o borra el archivo.

## Build de desarrollo (EAS)

Las notificaciones push, los mapas y la ubicación en segundo plano no funcionan en Expo Go; la app usa `expo-dev-client`. Identificador nativo: `co.findfood.app` (Android e iOS).

Perfiles de `eas.json`:

| Perfil | Salida | Uso |
|---|---|---|
| `development` | APK con dev client (`distribution: internal`) | Instalar en el teléfono y cargar el JS desde `npm run start:local` / `start:real`. |
| `preview` | APK interno | Probar una versión sin servidor de desarrollo. |
| `production` | AAB para Google Play | Publicación; incrementa `versionCode` automáticamente. |

Primera vez (requiere una cuenta de Expo):

1. `npx eas-cli@latest login` y `npx eas-cli@latest init` (vincula el proyecto y agrega `extra.eas.projectId` a `app.json`).
2. Cargar las variables públicas en cada entorno de EAS (`development`, `preview`, `production`): `npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value <url> --visibility plaintext`, y lo mismo para `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` y los client IDs de Google. **Nunca** `EXPO_PUBLIC_DEV_TOKEN` ni `EXPO_PUBLIC_APP_ENV=local`. `src/config/build-config.test.ts` solo impide declararlos en `eas.json`; las variables remotas de EAS no las puede ver, así que revisa `npx eas-cli@latest env:list` antes de cada build.
3. `npx eas-cli@latest build --profile development --platform android` e instalar el APK desde el enlace que entrega EAS.
4. En el computador, `npm run start:local` o `npm run start:real` y abrir el proyecto desde el dev client.

Aunque la variable exista en el entorno, un bundle de release no contiene el token de desarrollo: se lee solo bajo `__DEV__` y el minificador elimina esa rama. `npm run check:release-token` lo comprueba exportando el bundle de Android con un token centinela y falla si el centinela aparece. Exporta sin bytecode de Hermes para poder buscar en el JS.

## Recorrer la demostración

Sin sesión, la aplicación abre `/login`. Con el perfil `real` (`npm run start:real`), el inicio de sesión, el registro y la verificación de correo usan Supabase Auth:

- **Registro** (`/registro`): nombres, apellidos, correo, celular colombiano (10 dígitos que empiezan por 3, con `+57` opcional), contraseña de al menos 8 caracteres con letras y números, su confirmación y la aceptación de los términos. La cuenta se crea como donante. El tipo y el número de documento no se piden hasta que la API los admita. La aplicación nunca revela si un correo ya está registrado: con un correo existente, el registro responde igual que con uno nuevo y lleva a la verificación, que explica qué hacer si ya se tiene cuenta (iniciar sesión o recuperar la contraseña).
- **Verificación** (`/verificar-correo?email=…`): Supabase envía un código de 6 dígitos al correo. Tras cada envío correcto hay que esperar 60 segundos para pedir otro código; si el código expiró o no es válido, el reenvío queda disponible de inmediato. Con una sesión iniciada cuyo correo aún no está confirmado, la pantalla verifica el correo de esa sesión y permite pedir un código sin esperar.
- **Inicio de sesión** (`/login`): si el correo aún no está confirmado, la aplicación abre la verificación de inmediato y esta envía un código nuevo; el contador de reenvío empieza solo cuando el envío se completa.
- **Recuperar contraseña** (`/recuperar-contrasena`): envía un enlace al correo y responde siempre con el mismo mensaje neutro, exista o no la cuenta; solo muestra como error los límites de envío y la falta de conexión. El enlace funciona únicamente en el teléfono que lo pidió (PKCE).
- **Restablecer contraseña** (`/restablecer-contrasena`, sin guard): el enlace abre esta pantalla, que canjea el código una sola vez y pide la contraseña nueva con las mismas reglas del registro. Mientras tanto la sesión temporal queda marcada como recuperación (la marca se guarda en el dispositivo: si la app se cierra antes de guardar la contraseña, al abrirla vuelve a esta pantalla) y no abre la app; un enlace inválido abierto durante una recuperación en curso no la interrumpe; al guardar, o con «Cancelar» (que cierra la sesión), la raíz decide a dónde ir. Un enlace vencido o inválido explica el problema y ofrece pedir uno nuevo.
- **Completar perfil** (`/completar-perfil`): si `GET /me` tiene pendiente el celular o los términos, la raíz abre esta pantalla con los datos que ya tiene la cuenta. Pide apellidos y celular (las cuentas de Google llegan sin ellos) y la aceptación de los términos cuando están pendientes; envía a `PATCH /me` solo lo que cambió.
- **Cambiar contraseña** (`/cambiar-contrasena`): si la cuenta debe cambiar su contraseña, la raíz abre esta pantalla; al guardar, Supabase actualiza la contraseña y la app vuelve a consultar `GET /me`.

Al iniciar sesión o verificar el código, las pantallas no navegan por su cuenta: la sesión nueva cierra las rutas de autenticación y la raíz abre el inicio del rol. Completar perfil y cambiar contraseña también ofrecen «Cerrar sesión». El acceso con Google llega en la siguiente tarea de la fase 2 (ver `odd/tasks/integracion-api-auth.md`). Con el perfil `local` (`npm run start:local`) no hay Supabase: los formularios de autenticación quedan deshabilitados con un aviso, y el token de desarrollo abre directamente la vista del rol elegido.

## Navegación

La raíz (`src/app/_layout.tsx`) mantiene el splash hasta resolver la sesión y `GET /me`, y protege cada grupo de rutas con `Stack.Protected` según la fase de acceso: sin sesión solo se alcanzan las rutas de autenticación; una cuenta sin rol móvil o bloqueada va a `/sin-acceso`; una cuenta con pasos pendientes va a `/completar-perfil` o `/cambiar-contrasena`, y una recuperación en curso a `/restablecer-contrasena`, la única ruta sin guard. El índice redirige al inicio del rol activo.

- `/donante`: pestañas nativas Inicio, Donaciones, Alertas y Perfil; requiere el rol `DONANTE`.
- `/voluntario`: pestañas nativas Inicio, Rutas, Alertas y Perfil; requiere el rol `VOLUNTARIO`.

Un donante sin rol voluntario no puede abrir `/voluntario/*`, ni siquiera por enlace profundo: la ruta bloqueada se descarta y vuelve al índice. El menú de tres puntos abre `/cuenta`, donde «Cambiar vista» solo ofrece los roles que tiene la cuenta.

El formulario `/donante/registro-voluntario` tiene scroll, tipo de identificación, datos personales y de vehículo, y espacios para fotos de documento, vehículo y licencia. Los campos y selectores habilitados actualizan estado local; «Enviar» vuelve al inicio donante como navegación de demostración.

## Organización

- `src/app`: rutas de Expo Router; segmentos `donante/` y `voluntario/` con sus pestañas.
- `src/navigation`: grupos de rutas, guards por fase y rol, y barra de pestañas.
- `src/screens`: composición de pantallas por contexto.
- `src/components/findfood`: componentes nativos, controles e iconos SVG.
- `src/design/tokens.ts`: colores, tipografía y espaciado.
- `src/domain/models.ts`: modelos de presentación tipados.
- `src/config/env.ts`: variables `EXPO_PUBLIC_*` validadas por perfil.
- `src/api`: cliente HTTP (`/v1`, Bearer, problem+json, renovación en 401), `QueryClient` y mensajes de error en español.
- `src/auth`: cliente de Supabase, almacenamiento seguro de la sesión y reglas de acceso.
- `src/services`: servicios por módulo (perfil, catálogos, donaciones, asignaciones, rutas, evidencias, notificaciones) con hooks de TanStack Query e invalidación por mutación.
- `src/domain/mappers`: conversión de fechas, unidades, refrigeración y estados entre la API y la interfaz.
- `src/state/session.tsx`: sesión, usuario de `GET /me`, rol activo y `cerrarSesion()`.
- `src/state/mobile-context.tsx`: estado local de interfaz (borrador de donación y disponibilidad).
- `src/data/preview.ts`: fixtures visuales de actividad y avisos, pendientes de sus endpoints.
- `assets/brand`: logotipo conservado del diseño proporcionado.
- `docs/integracion-backend.md`: límites y próximos pasos de integración.

## Comprobaciones

```bash
npm test
npm run typecheck
npm run lint
npx expo export --platform all
npm run test:render
```

Se completaron TypeScript, ESLint, el smoke test SSR de las 22 pantallas/variantes y la exportación de Android, iOS y web (27 rutas incluidas las auxiliares). La exportación genera bundles, no un APK ni un IPA. El smoke test SSR comprueba renderizado básico; no sustituye pruebas de interacción o dispositivo. Se conservan las correcciones de composición de enlaces con Slot y de propiedades SVG para web.

La revisión visual está pendiente: el navegador de revisión bloqueó localhost con `ERR_BLOCKED_BY_CLIENT`. No se validó en dispositivo nativo ni se certifica correspondencia píxel a píxel. Antes de una entrega de producción deben revisarse las 22 pantallas en Android/iOS, incluyendo áreas seguras, teclado, desplazamiento, fuentes y barras del sistema.

## Formulario de donación

«Añadir otro producto» agrega bloques editables con cantidad, unidad (KG, L, ML o G), vencimiento y cadena de frío. La ubicación es un bloque visual común, pendiente de integrar con Google Maps, sin captura manual ni detección real. La ventana de recogida también es común. El borrador vive en memoria en el proveedor; se conserva entre edición y revisión y se pierde al cerrar o recargar la aplicación. Las fotos siguen sin carga. «Calificar voluntario» abre la vista de demostración desde el detalle, conservando el identificador, sin validar el estado de la entrega ni enviar la calificación.


## Actualización de formulario y asignación

El menú de tres puntos mide 32 unidades dentro del área táctil de 48. Nueva donación utiliza un catálogo de productos de ejemplo (`productOptions`), selección de unidades, calendario mensual y selector de hora de 24 horas. Cada producto se puede quitar mientras quede al menos uno. El borrador se mantiene en memoria entre las vistas; no hay persistencia ni envío.

Desde Donación publicada, «Ver voluntario asignado (demo)» abre `/voluntario-asignado`. Muestra el perfil del voluntario de los datos de demostración, el resumen del borrador y un mapa esquemático con marcadores V (voluntario) y D (donante). No hay GPS, Google Maps ni asignación automática. La futura integración deberá reemplazar el catálogo local, la asignación y las coordenadas con datos reales.

Las fechas siguen usando DD/MM/AAAA y las horas HH:mm en el modelo de presentación; un adaptador de backend deberá convertirlas al contrato acordado, incluida la zona horaria. No se implementaron reglas de disponibilidad o vencimiento.

## Actualización: disponibilidad y calificaciones

- Disponibilidad: selector de días (hasta siete) y horas en intervalos de 30 minutos. El fin siempre es posterior al inicio; se pueden quitar días conservando uno.
- Cadena de frío, disponibilidad del voluntario y filtros de donaciones/notificaciones interactivos.
- Recogida: estado de producto, peso y observaciones editables; enlace a Calificar donante.
- Calificaciones: con 5 estrellas se deshabilitan y limpian los aspectos, queda editable el comentario. Se puede cambiar la puntuación o enviar.
- Ambos perfiles muestran promedio y número de calificaciones de demostración. Enviar suma la puntuación al promedio local del destinatario; no hay persistencia ni backend.

Para revisar: Registro voluntario → Disponibilidad y Cadena de frío; Registrar recogida → Calificar donante; Perfil donante/voluntario → promedio.
