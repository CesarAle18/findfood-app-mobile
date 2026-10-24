/**
 * `GET /donaciones/:id/seguimiento` payloads for the donor's live tracking. Plain data: no
 * Jest APIs here.
 */
import type { SeguimientoDonacionDto } from "@/services/donaciones";

import { DONATION_ID } from "../fixtures";

/**
 * On the way to the donor's pickup (the same point as `detalleFixture`), with the street path
 * from Google and the volunteer's last stored sample. Arrival 16:40 in Bogotá.
 */
export function seguimientoDonacionFixture(
  overrides: Partial<SeguimientoDonacionDto> = {},
): SeguimientoDonacionDto {
  return {
    donacion_id: DONATION_ID,
    estado_donacion: "EN_RECOLECCION",
    activo: true,
    fase: "HACIA_RECOGIDA",
    ruta_id: "ruta-1",
    paradas_antes: 0,
    recogida: { direccion: "Cra 45 #12-30, Bogotá", lat: 4.65, lng: -74.06 },
    banco: {
      id: "alm-1",
      nombre: "Bodega Norte",
      direccion: "Calle 80 # 30-12, Bogotá",
      lat: 4.69,
      lng: -74.08,
    },
    voluntario_posicion: {
      lat: 4.67,
      lng: -74.05,
      at: "2026-09-23T21:28:00.000Z",
      fuente: "ULTIMA_UBICACION",
    },
    tramo: {
      trayecto: {
        type: "LineString",
        coordinates: [
          [-74.05, 4.67],
          [-74.055, 4.66],
          [-74.06, 4.65],
        ],
      },
      distancia_km: 3.2,
      duracion_min: 12,
      llegada_estimada: "2026-09-23T21:40:00.000Z",
      proveedor: "GOOGLE",
    },
    ...overrides,
  };
}
