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
    important: true,
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
