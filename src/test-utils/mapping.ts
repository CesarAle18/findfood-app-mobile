/**
 * Helpers for mapper tests.
 */
import { MappingError, type MappingErrorCode } from "@/domain/mappers/errors";

/** Runs `fn` and returns the MappingError code it threw; any other outcome fails. */
export function errorCode(fn: () => unknown): MappingErrorCode {
  try {
    fn();
  } catch (error) {
    if (error instanceof MappingError) return error.code;
    throw error;
  }
  throw new Error("expected a MappingError");
}
