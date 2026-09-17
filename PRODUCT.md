# Find Food móvil

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

React Native 0.86, Expo SDK 57, Expo Router y TypeScript, conservando el proyecto proporcionado.

## Users

Donantes y voluntarios representados en el Figma proporcionado.

## Product Purpose

Representar los recorridos móviles de Find Food y preparar la interfaz para una integración posterior con servicios reales.

## Capabilities and Constraints

Frontend móvil sin backend: 22 pantallas de Figma mediante 21 componentes de pantalla, porque los perfiles de donante y voluntario comparten implementación. Incluye navegación de demostración, datos simulados e interacciones locales de formularios. No hay autenticación real, persistencia, solicitudes HTTP, correo u OTP real, cámara, GPS ni operaciones de donaciones o asignaciones. Los botones que avanzan recorridos solo navegan; las demás acciones de negocio están deshabilitadas. La web administrativa queda fuera de esta entrega.

El formulario 19 admite entrada local y selección del tipo de identificación y vehículo, usa desplazamiento vertical y presenta espacios de foto de documento, vehículo y licencia. No carga archivos ni envía la postulación. Las selecciones de cadena de frío siguen siendo ilustrativas. El registro conduce a la pantalla OTP; el cambio de vista desde cuenta permite recorrer el contexto voluntario. Cambiar de vista no concede permisos.

Los modelos de presentación, el puerto asíncrono de lectura y el proveedor de estado permiten sustituir parte de los datos de ejemplo. No constituyen un backend implementado ni un contrato API definitivo. Algunos datos visuales siguen declarados directamente en las pantallas.

## Brand Commitments

El archivo «Mock Up Proyecto de grado.fig» es la referencia visual actual. Conservar su identidad verde, tipografía Inter, logotipo y componentes nativos. Usar diseño flexible, áreas seguras y scroll en lugar de coordenadas absolutas de pantalla.

## Evidence on Hand

El inventario de los 22 marcos y sus rutas está en `docs/pantallas.md`. La galería `/pantallas` es una herramienta de revisión, no una pantalla de producto. Los perfiles comparten un componente; el marco 37 aparece con dos nombres. El logotipo conservado en `assets/brand/findfood-logo.png` procede de la entrega anterior del diseño.

Las comprobaciones de código, exportación y render SSR no acreditan fidelidad visual. El navegador de revisión bloqueó localhost con `ERR_BLOCKED_BY_CLIENT`; no se completó una revisión visual ni una prueba en dispositivo nativo.
