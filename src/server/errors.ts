import type { Violation } from "./graphRules";

/** An error that maps straight to an HTTP status; the one error type of every service. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** A rule violation as an HttpError: `conflict` = 409, `invalid` = 400. */
export const violationError = (violation: Violation) => new HttpError(violation.kind === "conflict" ? 409 : 400, violation.message);
