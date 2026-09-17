---
name: Find Food móvil
description: Sistema visual del frontend móvil basado en el Figma actualizado.
colors:
  primary: "#1F7A5A"
  text: "#17332A"
  secondary: "#66756F"
  background: "#F7FAF8"
  surface: "#FFFFFF"
  border: "#CAD7D1"
  soft: "#E9F7F1"
  muted: "#F0F4F2"
  warning: "#94651C"
  warningSoft: "#FFF5DD"
  danger: "#B44747"
typography:
  display:
    fontFamily: Inter
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "36px"
  headline:
    fontFamily: Inter
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "31px"
    letterSpacing: "-0.5px"
  title:
    fontFamily: Inter
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "21px"
  body:
    fontFamily: Inter
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: Inter
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "18px"
rounded:
  choice: "8px"
  control: "10px"
  photo: "12px"
  card: "14px"
  badge: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "13px 16px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "13px 16px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "13px 16px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "18px"
  badge:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.badge}"
    padding: "6px 12px"
  navigation:
    backgroundColor: "{colors.surface}"
    padding: "8px 0px"
---

# Design System: Find Food móvil

## Overview

La autoridad visual es el archivo «Mock Up Proyecto de grado.fig»: identidad verde, tipografía Inter, logotipo y textos originales. La implementación conserva la estructura de las 22 pantallas móviles (21 componentes de pantalla, con perfiles compartidos) con reflow flexible, áreas seguras y desplazamiento vertical. No incorpora una dirección de marca nueva.

Este documento describe el código presente en `src/design/tokens.ts`, `src/components/findfood` y `src/screens`, junto con las restricciones de `PRODUCT.md`. La revisión de código y el export no acreditan fidelidad visual verificada ni pruebas nativas en dispositivos. El alcance es un frontend móvil sin backend, con datos simulados, navegación de demostración e interacción local en controles habilitados.

**Key Characteristics:**

- Inter en cuatro pesos y jerarquía compacta.
- Verde principal, fondos claros y agrupaciones con bordes finos.
- Contenido flexible dentro de un marco móvil centrado.

## Colors

`primary` identifica botones, enlaces, iconos y selecciones. `text` sirve para contenido principal; `secondary`, para apoyo y valores de campos. Los colores semánticos auxiliares oscuros son ajustes de contraste de implementación; no todos fueron extraídos literalmente de Figma. El comentario de extracción en el archivo de tokens no implica procedencia literal de toda la paleta.

`background` cubre la pantalla; `surface`, tarjetas, campos y navegación. `border` delimita controles y divisores. `soft` señala resúmenes y estados seleccionados; `muted` reserva áreas fotográficas. `warning` sobre `warningSoft` representa estados pendientes; `danger` identifica cancelación. El borde de cancelación usa el valor local `#E7CACA`.

El mapa ilustrativo contiene colores locales de terreno y calles (`#EEF3EE`, `#D6E2D7`, `#D8E7D6`); no forman una escala general. No hay tema oscuro implementado.

## Typography

Se cargan `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold` e `Inter_700Bold` mediante Expo. La jerarquía del frontmatter corresponde al saludo de acceso, títulos de pantalla, secciones, texto base y etiquetas de campo. Los valores en px representan unidades lógicas del código React Native, no mediciones físicas del dispositivo.

Los subtítulos usan tamaño 12 y altura 18; las etiquetas de navegación, tamaño 10 y altura 16; las insignias, tamaño 11 y altura 16. Existen tamaños locales para cifras y mensajes de estado; no hay una escala matemática declarada. Los números del mapa SVG usan Inter Bold. No se declara familia alternativa para el contenido normal.

## Layout

`Screen` aplica áreas seguras en los cuatro bordes y centra un marco de ancho completo con máximo 520. Su cabecera tiene altura mínima 64 y margen interior horizontal 16. El contenido desplazable usa margen interior horizontal 24, superior 4, inferior 32 y separación 24. La variante de acceso eleva el margen superior a 32; no centra verticalmente toda la pantalla.

Las filas usan flex y separación 12; los grupos verticales parten de 16. Las opciones permiten salto de línea. Los campos de una fila pueden crecer con flex. La barra inferior permanece fuera del contenido desplazable. No se implementan breakpoints: el reflow sustituye coordenadas absolutas de pantalla. El marco Figma de referencia es 390 × 844; no limita la altura de la implementación.

La escala `spacing` está declarada en tokens; los componentes actualmente expresan sus separaciones con números locales, incluidos 9, 14, 18 y 20. La galería `/pantallas` es una herramienta de revisión separada del producto.

## Elevation & Depth

El sistema es plano: no se declaran sombras ni elevación nativa. La separación se obtiene mediante superficies blancas, verde suave, bordes de una unidad y espacio. La navegación tiene un borde superior.

## Shapes

Los controles tienen esquinas suaves, las tarjetas una curva algo mayor y las insignias forma de cápsula. Las áreas de fotografía usan borde discontinuo y altura mínima 150, o 90 en variante compacta. Los contenedores de iconos de estado son circulares. El logotipo se presenta sin recorte mediante `contain`, a 33 × 33 en la cabecera.

## Components

- **Button:** variantes primaria, contorno y cancelación, altura mínima 52, texto 13 en negrita y radio de control. Representa acciones de negocio inactivas y declara estado deshabilitado sin atenuar su aspecto. Los avances de demostración utilizan enlaces separados y no ejecutan estas operaciones.
- **NavButton y TextLink:** enlaces de navegación de demostración. NavButton conserva el aspecto primario, texto negrita de tamaño 13 y opacidad 0.8 al presionar. TextLink tiene altura mínima 44 y texto verde de tamaño 12. No hay estilos explícitos de hover ni foco en el código.
- **Field:** etiqueta separada 9, contenedor de altura mínima 48, borde fino y margen interior horizontal 14. Los valores son de solo lectura cuando no se proporciona un controlador de cambio; los campos habilitados editan estado local sin envío ni persistencia. La variante multilínea eleva el mínimo a 88; selección y contraseña agregan iconos, sin interacción de negocio. SelectField permite escoger opciones locales con la misma identidad visual.
- **Card:** margen interior 18 y separación 14; variante suave con fondo y borde `soft`.
- **Badge y Choices:** estados estáticos. Badge usa texto medio; Choices utiliza altura mínima 42, radio 8 y selección verde sobre fondo suave.
- **BottomNav:** cuatro posiciones iguales, cada una de altura mínima 54; el icono activo tiene fondo suave y la etiqueta activa es seminegrita. Las rutas de Inicio, Donaciones o Rutas, Alertas y Perfil dependen del contexto donante o voluntario; ambos perfiles tienen pantalla. El menú de cuenta permite cambiar de vista localmente.
- **Icon y RouteMap:** iconos SVG de línea con trazo 1.7 y extremos redondeados; tamaño predeterminado 22. El mapa es un esquema SVG local de altura 264 y cuatro paradas de ejemplo, sin proveedor de mapas ni ubicación real.

El formulario 19 conserva desplazamiento vertical y agrupaciones de datos personales y vehículo. Incluye tipo de identificación y espacios separados para documento, vehículo y licencia; estos espacios no cargan fotografías. Los perfiles donante y voluntario reutilizan una composición compartida.

Los fragmentos HTML del archivo auxiliar traducen primitivas para el panel de documentación; no sustituyen los componentes React Native. No se inventan estados interactivos para las acciones inactivas, escalas tonales, animaciones ni breakpoints. Las transiciones de Expo Router están desactivadas.

## Do's and Don'ts

- **Do** conservar Inter, la identidad verde, los textos y el logotipo de referencia.
- **Do** mantener áreas seguras, flex y desplazamiento vertical al extender una pantalla.
- **Do** reutilizar las variantes implementadas de controles y superficies.
- **Don't** presentar interacciones locales o datos simulados como operaciones de negocio reales.
- **Don't** tratar colores auxiliares, fragmentos HTML o el mapa local como extracción literal de Figma.
- **Don't** afirmar fidelidad visual verificada o validación nativa a partir de la revisión de código y el export.
