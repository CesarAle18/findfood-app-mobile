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

## Recorrer la demostración

La aplicación abre `/login`. Iniciar sesión y Google navegan a `/inicio-donante` sin autenticar. El enlace de registro lleva a `/registro`, después a `/verificar-correo` y al inicio de sesión; el código editable no se verifica contra ningún servicio.

Desde el menú de cuenta (`/cuenta`), seleccionar «Ver como voluntario» abre `/inicio`; «Ver como donante» vuelve a `/inicio-donante`. Este cambio solo afecta a la demostración local. Los perfiles, las donaciones, el seguimiento, la revisión y la calificación tienen rutas propias. El menú de tres puntos abre la cuenta; su enlace «Ver todas las pantallas» lleva a `/pantallas`, la galería de revisión con las 22 pantallas.

El formulario `/registro-voluntario` tiene scroll, tipo de identificación, datos personales y de vehículo, y espacios para fotos de documento, vehículo y licencia. Los campos y selectores habilitados actualizan estado local; «Enviar» vuelve al inicio donante como navegación de demostración.

## Organización

- `src/app`: rutas de Expo Router, layout y galería auxiliar.
- `src/screens`: composición de pantallas por contexto.
- `src/components/findfood`: componentes nativos, controles e iconos SVG.
- `src/design/tokens.ts`: colores, tipografía y espaciado.
- `src/domain/models.ts`: modelos de presentación tipados.
- `src/services/mobile-repository.ts`: puerto asíncrono de lectura y repositorio de demostración.
- `src/data/mobile.ts`: fixtures de perfiles y donaciones; quedan otros fixtures visuales locales en pantallas.
- `src/state/mobile-context.tsx`: proveedor de datos, rol local e inyección del repositorio.
- `src/data/preview.ts`: inventario de pantallas de revisión.
- `assets/brand`: logotipo conservado del diseño proporcionado.
- `docs/integracion-backend.md`: límites y próximos pasos de integración.

## Comprobaciones

```bash
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
