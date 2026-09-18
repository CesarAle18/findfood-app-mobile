export type QuantityUnit = "KG" | "L" | "ML" | "G";
export interface DraftProduct {
  id: number;
  name: string;
  quantity: string;
  unit: QuantityUnit;
  expiresOn: string;
  coldChain: string;
}
export interface DonationDraft {
  products: DraftProduct[];
  pickupFrom: string;
  pickupUntil: string;
}
export const initialDonationDraft: DonationDraft = {
  products: [
    {
      id: 1,
      name: "Lácteos",
      quantity: "15",
      unit: "KG",
      expiresOn: "07/09/2026",
      coldChain: "Refrigerado",
    },
  ],
  pickupFrom: "16:00",
  pickupUntil: "18:00",
};
export function appendProduct(draft: DonationDraft): DonationDraft {
  const id = Math.max(0, ...draft.products.map((p) => p.id)) + 1;
  return {
    ...draft,
    products: [
      ...draft.products,
      {
        id,
        name: "",
        quantity: "",
        unit: "KG",
        expiresOn: "",
        coldChain: "No requiere",
      },
    ],
  };
}

/** Conserva al menos un producto y no modifica el borrador original. */
export function removeProduct(draft: DonationDraft, id: number): DonationDraft {
  if (draft.products.length <= 1) return draft;
  return { ...draft, products: draft.products.filter(product => product.id !== id) };
}
export const productOptions = ["Lácteos", "Frutas", "Verduras", "Panadería", "Arroz", "Legumbres", "Enlatados", "Otros alimentos"].map(value => ({ label: value, value }));
