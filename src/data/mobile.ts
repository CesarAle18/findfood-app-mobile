import type { MobileData } from "@/domain/models";
/** Fixtures del diseño. No representan una sesión autenticada ni registros reales. */
export const mobileData: MobileData = {
  donor: {
    name: "María García López",
    initials: "MG",
    email: "maria@correo.com",
    phone: "+57 300 123 4567",
    role: "donor",
  },
  volunteer: {
    name: "Carlos Ruiz",
    initials: "CR",
    email: "carlos@correo.com",
    phone: "+57 300 123 4567",
    role: "volunteer",
  },
  donations: [
    {
      id: "DON-1058",
      category: "Frutas, verduras y panadería",
      weightKg: 35,
      status: "Voluntario asignado",
      pickupWindow: "Hoy · 16:00–18:00",
      expiresOn: "16/09/2026",
      address: "Cra 45 #12-30, Bogotá",
      refrigerated: true,
    },
    {
      id: "DON-1056",
      category: "Panadería",
      weightKg: 20,
      status: "Buscando voluntario",
      pickupWindow: "Mañana · 09:00–11:00",
      expiresOn: "17/09/2026",
      address: "Cra 45 #12-30, Bogotá",
      refrigerated: false,
    },
    {
      id: "DON-1051",
      category: "Lácteos y frutas",
      weightKg: 42,
      status: "Completada",
      pickupWindow: "Entregada",
      expiresOn: "15/09/2026",
      address: "Cra 45 #12-30, Bogotá",
      refrigerated: true,
    },
  ],
};
