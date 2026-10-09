# Preparación para integrar el backend

Esta entrega implementa el frontend móvil y una separación inicial de datos. No implementa backend, cliente HTTP, autenticación ni un contrato API definitivo.

## Estructura presente

| Archivo | Responsabilidad |
|---|---|
| `src/domain/models.ts` | Tipos de presentación `Donation`, `Profile`, `VolunteerApplication`, `MobileData`, roles y tipos de documento. |
| `src/data/mobile.ts` | Fixtures de perfiles y donaciones para la demostración. |
| `src/services/mobile-repository.ts` | Interfaz `MobileRepository` con `load(signal?: AbortSignal): Promise<MobileData>` y `demoRepository`. |
| `src/state/mobile-context.tsx` | `MobileProvider`, datos compartidos, rol local y `useMobile()`. Permite inyectar un repositorio. |

El repositorio de demostración devuelve datos locales. Para una implementación distinta, el proveedor contempla carga inicial, error y reintento; pasa una señal de cancelación e ignora respuestas tras desmontarse. El adaptador futuro deberá respetar esa señal. Estos estados no acreditan conectividad real ni una prueba contra un servicio.

La interfaz es únicamente un puerto de **lectura**. No existen métodos de escritura, subida de archivos, login, registro, OTP, publicación, asignación, recogida, entrega o calificación. Los tipos reflejan lo que necesita la vista actual, no el esquema de una base de datos ni los DTO definitivos.

## Límites de los datos actuales

Los perfiles y parte de las donaciones usan el contexto. Métricas, detalles de rutas, avisos, textos de estados y otros valores ilustrativos permanecen dentro de las pantallas. La extracción de fixtures es parcial; reemplazar `demoRepository` no conecta automáticamente toda la aplicación.

El rol guardado por el proveedor controla la vista de demostración. No es una sesión ni un mecanismo de autorización. Los formularios editables mantienen datos en memoria local y no los envían ni persisten. Los selectores ilustrativos, los espacios fotográficos y los mapas esquemáticos no interactúan con servicios del dispositivo.

## Siguiente integración

1. Acordar con el backend entidades, identificadores, estados, fechas, unidades, errores y permisos de cada rol.
2. Implementar un adaptador que cumpla `MobileRepository` y traduzca las respuestas al modelo de presentación; inyectarlo en `MobileProvider`.
3. Extraer los fixtures restantes y definir las operaciones de escritura y sus estados de carga, error y confirmación.
4. Implementar sesión, permisos, validación y persistencia conforme al contrato acordado. Conectar cada acción de negocio solo cuando exista su operación real.
5. Incorporar carga de documentos/fotos, ubicación y mapas con sus permisos y servicios correspondientes cuando formen parte del alcance.
6. Probar la integración con servicios reales y revisar los recorridos en Android/iOS, incluidos errores, cancelación y conectividad.

No se prescriben endpoints, proveedores de identidad, formatos de token ni almacenamiento de credenciales: son decisiones pendientes de la integración.

## Borrador de donación

`src/domain/donation-draft.ts` define productos con unidad KG/L/ML/G y una ventana de recogida común. `MobileProvider` conserva el borrador durante la navegación para compartirlo entre nueva donación y revisión. No hay almacenamiento persistente, envío ni normalización de unidades contra el backend. La ubicación es un bloque visual único pendiente de Google Maps. La navegación a calificación está habilitada para demostración sin comprobar el estado real de entrega.


## Actualización de formulario y asignación

El menú de tres puntos mide 32 unidades dentro del área táctil de 48. Nueva donación utiliza un catálogo de productos de ejemplo (`productOptions`), selección de unidades, calendario mensual y selector de hora de 24 horas. Cada producto se puede quitar mientras quede al menos uno. El borrador se mantiene en memoria entre las vistas; no hay persistencia ni envío.

Desde Donación publicada, «Ver voluntario asignado (demo)» abre `/voluntario-asignado`. Muestra el perfil del voluntario de los datos de demostración, el resumen del borrador y un mapa esquemático con marcadores V (voluntario) y D (donante). No hay GPS, Google Maps ni asignación automática. La futura integración deberá reemplazar el catálogo local, la asignación y las coordenadas con datos reales.

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
