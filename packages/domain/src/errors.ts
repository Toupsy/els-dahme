export type DomainErrorCode = "INVALID_INPUT" | "INVALID_TRANSITION" | "CONFLICT";

/** Fachfehler mit Code; die Meldung ist für die Bedienung gedacht. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function fail(code: DomainErrorCode, message: string): never {
  throw new DomainError(code, message);
}
