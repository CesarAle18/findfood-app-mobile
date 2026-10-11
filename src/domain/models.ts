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
}
