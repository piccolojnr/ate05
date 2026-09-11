export type PosClientErrorCode =
  | "validation"
  | "not_found"
  | "unavailable"
  | "invalid_state"
  | "database"
  | "invalid_pin"
  | "unauthorized"
  | "inactive_staff"
  | "duplicate_active_table_order"
  | "invalid_table_transition"
  | "insufficient_payment"
  | "payment_already_confirmed"
  | "printer_unavailable"
  | "print_failed"
  | "backup_failed"
  | "restore_failed";

/** Stable application-boundary errors; messages remain cashier-safe. */
export class PosClientError extends Error {
  constructor(
    public readonly code: PosClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PosClientError";
  }
}
