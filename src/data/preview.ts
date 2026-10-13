/**
 * Datos ilustrativos del Figma para contenido que aún no tiene endpoint conectado en esta
 * fase. No son registros reales: cada bloque indica qué endpoint lo reemplaza.
 */

// TODO(F3): replace with the volunteer's latest stops from GET /rutas and GET /rutas/:id.
export const activity = [
  {
    title: "Recogida completada",
    detail: "Restaurante El Buen Sabor",
    icon: "check" as const,
  },
  { title: "Oferta aceptada", detail: "DON-1048", icon: "box" as const },
];

// TODO(F3): replace with the state history of the donor's latest donations
// (GET /donaciones/:id/historial).
export const donorActivity = [
  { title: "Donación entregada", detail: "DON-1051 · Ayer 18:40" },
  { title: "Voluntario aceptado", detail: "DON-1058 · Hoy 14:12" },
  { title: "Donación publicada", detail: "DON-1058 · Hoy 13:55" },
];
