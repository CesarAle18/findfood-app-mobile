import type { Href } from "expo-router";

/** Datos ilustrativos del Figma, sin modelos de negocio ni persistencia. */
export const activity = [
  {
    title: "Recogida completada",
    detail: "Restaurante El Buen Sabor",
    icon: "check" as const,
  },
  { title: "Oferta aceptada", detail: "DON-1048", icon: "box" as const },
];
export const notifications = [
  {
    title: "Nueva oferta",
    detail: "DON-1048 · vence en 10 min",
    time: "Hace 5 min",
    icon: "box" as const,
    highlight: true,
  },
  {
    title: "Cambio de ruta",
    detail: "R-045 tiene nueva secuencia",
    time: "Hace 5 min",
    icon: "route" as const,
  },
  {
    title: "Recogida completada",
    detail: "Restaurante El Buen Sabor",
    time: "Hace 5 min",
    icon: "check" as const,
  },
  {
    title: "Ruta actualizada",
    detail: "R-046 inicia a las 18:00",
    time: "Hace 5 min",
    icon: "clock" as const,
  },
];
export const previewScreens: {
  group: string;
  screens: { title: string; href: Href; frame: string }[];
}[] = [
  {
    group: "Diseño móvil actualizado",
    screens: [
      {
        title: "Login",
        href: "/login",
        frame: "07_Mobile_Login 1",
      },
      {
        title: "Inicio Voluntario",
        href: "/inicio",
        frame: "08_Mobile_Inicio_Voluntario 1",
      },
      {
        title: "Nueva Donacion",
        href: "/nueva-donacion",
        frame: "09_Mobile_Nueva_Donacion 1",
      },
      {
        title: "Oferta Voluntario",
        href: "/oferta",
        frame: "10_Mobile_Oferta_Voluntario 1",
      },
      {
        title: "Ruta Activa",
        href: "/ruta-activa",
        frame: "11_Mobile_Ruta_Activa 1",
      },
      {
        title: "Registrar Recogida",
        href: "/registrar-recogida",
        frame: "12_Mobile_Registrar_Recogida 1",
      },
      {
        title: "Entrega Voluntario",
        href: "/entrega-voluntario",
        frame: "13_Mobile_Entrega_Voluntario",
      },
      {
        title: "Notificaciones",
        href: "/notificaciones",
        frame: "14_Mobile_Notificaciones 1",
      },
      {
        title: "Registrarse",
        href: "/registro",
        frame: "16_Mobile_Registrarse 1",
      },
      {
        title: "Registro Voluntario",
        href: "/registro-voluntario",
        frame: "19_Mobile_Registro_Voluntario 1",
      },
      {
        title: "Espera Donante",
        href: "/espera-voluntario",
        frame: "21_Mobile_Espera_Donante 1",
      },
      {
        title: "Olvidaste Contrasena",
        href: "/recuperar-contrasena",
        frame: "29_Mobile_Olvidaste_Contrasena 1",
      },
      {
        title: "Inicio Donante",
        href: "/inicio-donante",
        frame: "32_Mobile_Inicio_Donante 1",
      },
      {
        title: "Mis Donaciones Donante",
        href: "/mis-donaciones",
        frame: "33_Mobile_Mis_Donaciones_Donante 1",
      },
      {
        title: "Seguimiento Donacion",
        href: "/seguimiento",
        frame: "34_Mobile_Seguimiento_Donacion 1",
      },
      {
        title: "Perfil Donante",
        href: "/perfil-donante",
        frame: "35_Mobile_Perfil_Donante 1",
      },
      {
        title: "Perfil Voluntario",
        href: "/perfil-voluntario",
        frame: "36_Mobile_Perfil_Voluntario 1",
      },
      {
        title: "Menu Cambio Vista",
        href: "/cuenta",
        frame: "37_Mobile_Menu_Cambio_Vista 1",
      },
      {
        title: "Detalle Donacion Completo",
        href: "/detalle-donacion",
        frame: "38_Mobile_Detalle_Donacion_Completo 1",
      },
      {
        title: "Verificacion Correo OTP",
        href: "/verificar-correo",
        frame: "40_Mobile_Verificacion_Correo_OTP 1",
      },
      {
        title: "Revision Donacion Antes Publicar",
        href: "/revisar-donacion",
        frame: "41_Mobile_Revision_Donacion_Antes_Publicar 1",
      },
      {
        title: "Calificacion Voluntario",
        href: "/calificar-voluntario",
        frame: "37_Mobile_Calificacion_Voluntario 1",
      },
    ],
  },
];
