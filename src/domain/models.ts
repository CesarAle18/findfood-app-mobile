/** Presentation models of the screens; API DTOs are mapped to them in `@/domain/mappers`. */
export type DocumentType = "CC" | "CE" | "PA" | "PPT";
export interface Donation {
  id: string;
  category: string;
  weightKg: number;
  status: string;
  pickupWindow: string;
  expiresOn: string;
  address: string;
  refrigerated: boolean;
}
export interface VolunteerApplication {
  fullName: string;
  email: string;
  phone: string;
  documentType: DocumentType | "";
  documentNumber: string;
  vehicleType: string;
  capacityKg: string;
  refrigerated: boolean;
  availability: string;
  // Photo fields hold Storage paths from `POST /evidencias/upload-url`; "" until uploaded.
  /** `documento_frente` (purpose DOCUMENTO_IDENTIDAD). */
  documentPhoto: string;
  /** `url_foto_vehiculo` (purpose VEHICULO). */
  vehiclePhoto: string;
  /**
   * Driving licence (purpose DOCUMENTO_IDENTIDAD). `POST /voluntario/solicitud` has no
   * licence field yet; the closest is `documento_reverso`.
   */
  licencePhoto: string;
}
