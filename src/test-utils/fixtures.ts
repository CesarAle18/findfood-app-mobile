/**
 * Representative API payloads for screen tests and the render smoke check
 * (`scripts/check-render.cjs`). Plain data: no Jest APIs here.
 */
import type { MeDto, Paged } from "@/api/types";
import type {
  AsignacionDonacionDto,
  DonacionDetalleDto,
  DonacionResumenDto,
} from "@/services/donaciones";
import type { OfertaDto } from "@/services/asignaciones";
import type { CatalogosDto } from "@/services/catalogos";
import type { BandejaDto, NotificacionDto } from "@/services/notificaciones";
import type { ImpactoDto } from "@/services/perfil";

export const DONATION_ID = "7d4f6a1e-0c2b-4f7e-9a51-3b8f2d1c9e10";

export function meFixture(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: "user-1",
    email: "maria@correo.com",
    nombres: "María",
    apellidos: "García López",
    telefono: "+573001234567",
    url_foto: null,
    estado: "ACTIVO",
    debe_cambiar_password: false,
    idioma: "es",
    acepto_terminos_at: "2026-09-01T12:00:00.000Z",
    created_at: "2026-09-01T12:00:00.000Z",
    email_verificado: true,
    roles: ["DONANTE", "VOLUNTARIO"],
    pendientes: [],
    donante: {
      id: "donante-1",
      activo: true,
      total_donaciones: 12,
      total_kg_donados: 280,
      calificacion_promedio: 4.5,
    },
    voluntario: {
      id: "voluntario-1",
      estado_verificacion: "APROBADA",
      disponible: true,
      placa_vehiculo: "ABC123",
      capacidad_carga_kg: 500,
      tiene_refrigeracion: true,
      radio_cobertura_km: 10,
      total_entregas: 18,
      calificacion_promedio: 4.8,
      tipo_vehiculo: { id: 2, codigo: "CAMIONETA", nombre: "Camioneta" },
      ubicacion_base: { lat: 4.65, lng: -74.06 },
      disponibilidad: [{ dia_semana: 1, hora_inicio: "08:00", hora_fin: "18:00" }],
      verificacion: null,
    },
    ...overrides,
  };
}

export function impactoFixture(): ImpactoDto {
  return {
    donante: {
      id: "donante-1",
      total_donaciones: 12,
      total_kg_donados: 280,
      calificacion_promedio: 4.5,
      total_calificaciones: 9,
      donaciones_entregadas: 4,
      kg_entregados: 120,
      donaciones_canceladas: 1,
      primera_donacion: "2026-09-02T12:00:00.000Z",
      ultima_donacion: "2026-09-23T18:50:00.000Z",
    },
    voluntario: {
      id: "voluntario-1",
      total_entregas: 18,
      total_kg_transportados: 1200,
      calificacion_promedio: 4.8,
      estado_verificacion: "APROBADA",
      recolecciones_completadas: 20,
    },
  };
}

export function resumenFixture(overrides: Partial<DonacionResumenDto> = {}): DonacionResumenDto {
  return {
    id: DONATION_ID,
    codigo: "DON-1058",
    estado: "ASIGNADA",
    titulo: "Frutas y panadería",
    peso_estimado_kg: 35,
    peso_recibido_kg: null,
    requiere_refrigeracion: true,
    ventana_recogida_inicio: "2026-09-23T21:00:00.000Z",
    ventana_recogida_fin: "2026-09-23T23:00:00.000Z",
    direccion_recogida: "Cra 45 #12-30, Bogotá",
    score_urgencia: null,
    publicada_at: "2026-09-23T18:55:00.000Z",
    expira_publicacion_at: null,
    created_at: "2026-09-23T18:50:00.000Z",
    almacen_destino: null,
    cantidad_productos: 3,
    ...overrides,
  };
}

export function asignacionFixture(
  overrides: Partial<AsignacionDonacionDto> = {},
): AsignacionDonacionDto {
  return {
    id: "asignacion-1",
    estado: "ACEPTADA",
    intento: 1,
    expira_at: "2026-09-23T20:00:00.000Z",
    aceptada_at: "2026-09-23T19:12:00.000Z",
    ruta_id: null,
    flota_banco: false,
    voluntario: {
      nombres: "Carlos",
      apellidos: "Ruiz",
      telefono: "+573001112233",
      placa_vehiculo: "XYZ987",
      tipo_vehiculo: "Camioneta",
    },
    ...overrides,
  };
}

export function detalleFixture(overrides: Partial<DonacionDetalleDto> = {}): DonacionDetalleDto {
  return {
    id: DONATION_ID,
    codigo: "DON-1058",
    estado: "ASIGNADA",
    modo_recoleccion: "VOLUNTARIO",
    titulo: null,
    descripcion: null,
    peso_estimado_kg: 35,
    peso_recogido_kg: null,
    peso_recibido_kg: null,
    requiere_refrigeracion: true,
    fecha_vencimiento_min: "2026-09-26T00:00:00.000Z",
    ventana_recogida_inicio: "2026-09-23T21:00:00.000Z",
    ventana_recogida_fin: "2026-09-23T23:00:00.000Z",
    direccion_recogida: "Cra 45 #12-30, Bogotá",
    referencia_recogida: null,
    ubicacion_recogida: { lat: 4.65, lng: -74.06 },
    score_urgencia: null,
    publicada_at: "2026-09-23T18:55:00.000Z",
    expira_publicacion_at: null,
    asignada_at: "2026-09-23T19:12:00.000Z",
    recogida_at: null,
    entregada_at: null,
    recibida_at: null,
    cancelada_at: null,
    observacion_cancelacion: null,
    created_at: "2026-09-23T18:50:00.000Z",
    updated_at: "2026-09-23T19:12:00.000Z",
    almacen_destino: null,
    motivo_cancelacion: null,
    contacto: { nombre: "María García", telefono: "+573001234567" },
    items: [],
    asignacion: asignacionFixture(),
    ...overrides,
  };
}

export function pageFixture<T>(datos: T[], total = datos.length, desplazamiento = 0): Paged<T> {
  return { datos, total, limite: 20, desplazamiento };
}

/** `GET /catalogos` with every catalog; ids are deliberately not in code order. */
export const catalogosFixture: CatalogosDto = {
  categorias_alimento: [
    { id: 1, codigo: "LACTEOS", nombre: "Lácteos", requiere_refrigeracion: true, vida_util_dias_ref: 10 },
  ],
  tipos_alimento: [
    {
      id: 11,
      codigo: "LECHE",
      nombre: "Leche",
      categoria_alimento_id: 1,
      unidad_medida_id: 22,
      requiere_refrigeracion: true,
      tipo_almacenamiento: "REFRIGERADO",
      perecedero: true,
      vida_util_dias: 10,
    },
    {
      id: 12,
      codigo: "ARROZ",
      nombre: "Arroz",
      categoria_alimento_id: 2,
      unidad_medida_id: 21,
      requiere_refrigeracion: false,
      tipo_almacenamiento: "SECO",
      perecedero: false,
      vida_util_dias: null,
    },
    {
      id: 13,
      codigo: "PAN",
      nombre: "Pan",
      categoria_alimento_id: 3,
      unidad_medida_id: 23,
      requiere_refrigeracion: false,
      tipo_almacenamiento: "SECO",
      perecedero: true,
      vida_util_dias: 3,
    },
  ],
  unidades_medida: [
    { id: 21, codigo: "KG", nombre: "Kilogramo", factor_a_kg: 1 },
    { id: 22, codigo: "L", nombre: "Litro", factor_a_kg: 1 },
    { id: 23, codigo: "UN", nombre: "Unidad", factor_a_kg: null },
    { id: 24, codigo: "G", nombre: "Gramo", factor_a_kg: 0.001 },
  ],
  tipos_vehiculo: [
    { id: 31, codigo: "MOTO", nombre: "Motocicleta", capacidad_referencia_kg: 30, permite_refrigeracion: false },
    { id: 32, codigo: "CAMIONETA", nombre: "Camioneta", capacidad_referencia_kg: 800, permite_refrigeracion: true },
  ],
  motivos: [
    { id: 41, ambito: "RECHAZO_ASIGNACION", codigo: "MUY_LEJOS", nombre: "Queda muy lejos", requiere_comentario: false },
    { id: 42, ambito: "RECHAZO_ASIGNACION", codigo: "OTRO_RECHAZO", nombre: "Otro", requiere_comentario: true },
    { id: 43, ambito: "CANCELACION_DONACION", codigo: "DONANTE_CANCELA", nombre: "Ya no está disponible", requiere_comentario: false },
    { id: 44, ambito: "ABANDONO_ASIGNACION", codigo: "IMPREVISTO", nombre: "Imprevisto", requiere_comentario: true },
  ],
  tipos_incidencia: [],
  tipos_destino_distribucion: [],
};

/** One inbox row: unread, about a donation the donor can open. */
export function notificacionFixture(overrides: Partial<NotificacionDto> = {}): NotificacionDto {
  return {
    id: "notif-1",
    tipo: "DONACION_RECIBIDA",
    titulo: "Donación recibida",
    cuerpo: "El banco de alimentos recibió tu donación.",
    data: null,
    donacion_id: DONATION_ID,
    asignacion_id: null,
    leida_at: null,
    created_at: "2026-10-13T14:00:00Z",
    ...overrides,
  };
}

/** A `GET /me/notificaciones` page; `no_leidas` counts its unread rows unless given. */
export function bandejaFixture(
  datos: NotificacionDto[],
  { total = datos.length, desplazamiento = 0, limite = 20, no_leidas }: Partial<BandejaDto> = {},
): BandejaDto {
  return {
    datos,
    total,
    limite,
    desplazamiento,
    no_leidas: no_leidas ?? datos.filter((row) => row.leida_at === null).length,
  };
}

/** A live offer of `GET /asignaciones/ofertas` (OFRECIDA: no donor contact yet). */
export function ofertaFixture(overrides: Partial<OfertaDto> = {}): OfertaDto {
  return {
    id: "asg-7",
    estado: "OFRECIDA",
    intento: 1,
    ofrecida_at: "2026-10-13T20:00:00Z",
    expira_at: "2026-10-13T20:10:00Z",
    aceptada_at: null,
    distancia_km: 2.84,
    ruta_id: null,
    donacion_id: DONATION_ID,
    codigo: "DON-1048",
    titulo: "Supermercado La 14",
    donacion_estado: "PUBLICADA",
    peso_estimado_kg: 45,
    requiere_refrigeracion: true,
    ventana_recogida_inicio: "2026-10-13T21:00:00Z",
    ventana_recogida_fin: "2026-10-13T23:00:00Z",
    direccion_recogida: "Calle 5 # 38-25, Cali",
    referencia_recogida: "Muelle de carga",
    lat: 3.42,
    lng: -76.54,
    almacen_id: null,
    almacen_nombre: null,
    almacen_direccion: null,
    contacto_nombre: null,
    contacto_telefono: null,
    productos: [
      { tipo: "Lácteos", cantidad: 20, unidad: "L", peso_estimado_kg: 20, requiere_refrigeracion: true },
      { tipo: "Pan", cantidad: 25, unidad: "KG", peso_estimado_kg: 25, requiere_refrigeracion: false },
    ],
    ...overrides,
  };
}
