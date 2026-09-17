/** Modelos de presentación; el contrato HTTP definitivo se acordará con el backend. */
export type UserRole = "donor" | "volunteer";
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
export interface Profile {
  name: string;
  initials: string;
  email: string;
  phone: string;
  role: UserRole;
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
export interface MobileData {
  donations: Donation[];
  donor: Profile;
  volunteer: Profile;
}
