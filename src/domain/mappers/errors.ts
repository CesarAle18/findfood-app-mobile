/**
 * The error every mapper throws when a value cannot be converted between the app's
 * presentation format and the findfood-api contract.
 */

/** Stable codes: forms branch on them; messages are for logs only. */
export type MappingErrorCode =
  /** Not a valid `DD/MM/AAAA` (or `YYYY-MM-DD` from the API) calendar date. */
  | "invalid-date"
  /** Not a valid 24 h `HH:mm` time. */
  | "invalid-time"
  /** Not an ISO 8601 timestamp with an explicit offset (`Z` or `±HH:mm`). */
  | "invalid-timestamp"
  /** A pickup window whose end is not after its start. */
  | "invalid-window"
  /** The `/catalogos` units do not contain the unit. */
  | "unknown-unit"
  /** A unit the app does not offer (only KG, L, ML and G). */
  | "unsupported-unit"
  /** Neither of the cold-chain choices of the donation form. */
  | "invalid-cold-chain";

export class MappingError extends Error {
  readonly code: MappingErrorCode;
  /** The rejected input, for logs and tests. */
  readonly value: unknown;

  constructor(code: MappingErrorCode, value: unknown, message: string) {
    super(message);
    this.name = "MappingError";
    this.code = code;
    this.value = value;
  }
}
