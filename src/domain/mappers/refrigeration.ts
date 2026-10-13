/**
 * The "Cadena de frío" choice of the donation form ⇄ `requiere_refrigeracion`.
 */
import { MappingError } from "./errors";

/** The form's choices, in the order the select shows them. */
export const COLD_CHAIN_OPTIONS = ["Refrigerado", "No requiere"] as const;

export type ColdChain = (typeof COLD_CHAIN_OPTIONS)[number];

/** Accepts `string` because `DraftProduct.coldChain` is typed as one. */
export function toRequiereRefrigeracion(choice: string): boolean {
  if (choice === "Refrigerado") return true;
  if (choice === "No requiere") return false;
  throw new MappingError("invalid-cold-chain", choice, `Invalid cold-chain choice: ${choice}`);
}

export function fromRequiereRefrigeracion(requiereRefrigeracion: boolean): ColdChain {
  return requiereRefrigeracion ? "Refrigerado" : "No requiere";
}
