# Preparación para integrar el backend

La app consume `findfood-api` mediante un cliente HTTP, la sesión de Supabase y una capa de servicios con TanStack Query. Las pantallas de donaciones, perfiles y cuenta leen datos reales; las que aún no tienen endpoint conectado conservan datos ilustrativos señalados en el código.

## Estructura presente

| Archivo | Responsabilidad |
|---|---|
| `src/api/` | Cliente HTTP, errores (`ApiError`), mensajes en español y `QueryClient` compartido. |
| `src/state/session.tsx` | Sesión, `useMe()` (`GET /me`), acceso por rol y cierre de sesión. |
| `src/services/*.ts` | Un módulo por recurso (`donaciones`, `perfil`, `asignaciones`, `rutas`, `notificaciones`, `catalogos`, `evidencias`): DTO, peticiones, `queryOptions`, hooks de consulta y mutaciones con sus invalidaciones. |
| `src/services/query-keys.ts` | Claves jerárquicas de TanStack Query; cada mutación invalida solo lo que cambia. |
| `src/domain/mappers/` | Conversión de DTO a modelos de presentación (`DonationView`, perfil, fechas, unidades, estados). |
| `src/screens/donation-queries.ts` | Consultas de donaciones adaptadas a las pantallas: lista paginada, última donación y detalle por `id`. |
| `src/components/findfood/feedback.tsx` | `LoadingState`, `EmptyState`, `ErrorState` (con reintento) y `QueryContent`, que elige entre ellos según la consulta. |
| `src/state/mobile-context.tsx` | Solo estado de interfaz: borrador de donación y conmutador de disponibilidad. |

Cada pantalla con datos remotos muestra un indicador de carga, un estado de error con «Reintentar» (vuelve a ejecutar la consulta) o un estado vacío. Las pantallas de detalle reciben el UUID de la donación en `?id=`; sin él muestran un estado vacío y no hacen peticiones. Las listas muestran el código legible (`DON-1058`), filtran por `estado` y no por etiquetas, y una fila con una ventana de recogida ilegible se muestra con «Ventana por confirmar» en lugar de invalidar toda la lista. El detalle aplica la misma tolerancia campo por campo: una ventana ilegible muestra «Ventana por confirmar» y un vencimiento ilegible, «Sin fecha». La lista de donaciones usa FlashList y carga páginas de 20: con «Todas» pide la siguiente al llegar al final; con un filtro activo, solo con «Cargar más». Una donación que se repite entre páginas aparece una sola vez.

## Límites de los datos actuales

Estos contenidos aún no tienen endpoint conectado y usan datos ilustrativos marcados con `TODO(F3)`:

- Actividad reciente del donante y del voluntario (`src/data/preview.ts`), pendiente de `GET /donaciones/:id/historial` y de `GET /rutas`.
- Bandeja de avisos (`src/data/preview.ts`), pendiente de `GET /me/notificaciones`.
- Inicio del voluntario, ruta activa, oferta y registro de recogida, pendientes de `GET /asignaciones/ofertas` y `GET /rutas/:id`. Mientras tanto, «Ver detalle» de la ruta activa no lleva `id` y abre el estado vacío.
- Envío de calificaciones: la pantalla de calificación lee los nombres reales del detalle de la donación, pero la calificación no se envía ni se guarda; al enviarla, la pantalla avisa que el envío estará disponible próximamente (falta `POST /asignaciones/:id/calificacion`).
- Disponibilidad del voluntario: el conmutador es local (falta `PATCH /voluntario/estado`).

Los formularios de nueva donación y de registro de voluntario mantienen sus datos en memoria y aún no los envían. Los mapas esquemáticos y los espacios fotográficos no usan servicios del dispositivo.

## Siguiente integración

1. Conectar las pantallas del voluntario (ofertas, rutas, recogida) y la bandeja de avisos con sus servicios.
2. Enviar la nueva donación, la calificación y la disponibilidad con las mutaciones existentes, con sus estados de envío y error.
3. Incorporar carga de fotos, ubicación y mapas con sus permisos y servicios correspondientes.
4. Probar los recorridos en Android/iOS contra la API real, incluidos errores, cancelación y conectividad.

## Borrador de donación

`src/domain/donation-draft.ts` define productos con unidad KG/L/ML/G y una ventana de recogida común. `MobileProvider` conserva el borrador durante la navegación para compartirlo entre nueva donación y revisión. No hay almacenamiento persistente, envío ni normalización de unidades contra el backend. La ubicación es un bloque visual único pendiente de Google Maps. El enlace «Calificar voluntario» del detalle solo aparece cuando la donación fue entregada y tiene voluntario.


## Actualización de formulario y asignación

El menú de tres puntos mide 32 unidades dentro del área táctil de 48. Nueva donación utiliza un catálogo de productos de ejemplo (`productOptions`), selección de unidades, calendario mensual y selector de hora de 24 horas. Cada producto se puede quitar mientras quede al menos uno. El borrador se mantiene en memoria entre las vistas; no hay persistencia ni envío.

Desde Donación publicada, «Ver voluntario asignado (demo)» abre `/donante/voluntario-asignado`; como ese flujo aún no publica la donación, llega sin `id` y muestra un estado vacío. Con el `id` de la donación muestra el voluntario asignado según `GET /donaciones/:id`, el resumen de la recogida y un mapa esquemático con marcadores V (voluntario) y D (donante). No hay GPS, Google Maps ni asignación automática. La futura integración deberá reemplazar el catálogo local, la asignación y las coordenadas con datos reales.

Las fechas siguen usando DD/MM/AAAA y las horas HH:mm en el modelo de presentación; un adaptador de backend deberá convertirlas al contrato acordado, incluida la zona horaria. No se implementaron reglas de disponibilidad o vencimiento.

## Configuración requerida en Supabase

`findfood-api` no versiona `supabase/config.toml`; el proyecto alojado se configura en el panel de Supabase. La autenticación móvil depende de estos ajustes:

| Sección del panel | Ajuste | Motivo |
|---|---|---|
| Authentication → URL Configuration | Agregar `findfoodappmobile://**` a *Redirect URLs* | El enlace de restablecer contraseña vuelve a la app (PKCE). |
| Authentication → Providers → Email | *Confirm email* activo; revisar longitud y vigencia del OTP | El registro exige verificar el correo con código. |
| Authentication → Email Templates → Confirm signup | Incluir `{{ .Token }}` en el cuerpo | La app pide el código de 6 dígitos (`verifyOtp` tipo `email`). |
| Authentication → Email Templates → Reset password | Mantener `{{ .ConfirmationURL }}` | El enlace abre `restablecer-contrasena` con `code`. |
| Authentication → Rate Limits | Intervalo mínimo de reenvío (60 s por defecto) | Define el contador de «Reenviar código». |
| Authentication → SMTP Settings | SMTP propio | El SMTP integrado solo envía unos pocos correos por hora. |
| Authentication → Providers → Google | Habilitar; *Client IDs*: primero el ID web y luego el de iOS; secreto del cliente web; activar *Skip nonce checks* | Inicio de sesión nativo con `signInWithIdToken`. |

En Google Cloud se registran el cliente web, el cliente iOS y el cliente Android con las huellas SHA-1 del keystore de EAS y del de Google Play.
