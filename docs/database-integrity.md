# Database integrity and crash recovery

ATE05 uses SQLite as the authoritative offline database. This document records the
invariants and recovery decisions that critical workflows must preserve.

## Runtime configuration

The native SQLx connection uses one pooled connection for the renderer-managed
database boundary. Every connection enables foreign keys and has a five-second
busy timeout. File-backed production databases use WAL journaling with
`synchronous=NORMAL`: WAL keeps readers responsive while writes are serialized,
and NORMAL provides the intended offline POS durability/performance balance.
The connection is deliberately single-writer; no application transaction holds a
database lock across network printing, filesystem dialogs, or UI waits.

The browser preview uses its separate in-memory/application adapter and does not
represent the native SQLite durability guarantees.

## Transaction boundaries and invariants

All database mutations that contain multiple related writes run in one SQLite
transaction:

- order creation, including table occupancy
- order item changes and materialized totals
- kitchen ticket, ticket items, and order status changes
- inventory movement, balance update, and audit row
- table completion and table release
- payment, payment status, receipt allocation, and receipt snapshot

Physical kitchen/receipt printing starts only after its database transaction has
committed. A printer failure therefore leaves the ticket or receipt pending and
does not undo the order, payment, or inventory operation.

The key invariants are:

- order totals are derived from immutable item price snapshots;
- only one active dine-in order can occupy a table;
- payment status is derived from recorded payments and does not complete an order
  or release a table;
- ticket items are immutable snapshots and ticket sequences are unique per order;
- stock movement and `current_quantity` always change together, and supported
  operations cannot create negative stock;
- historical order, payment, receipt, and stock attribution survives user or menu
  deactivation through foreign keys and snapshots.

SQLite constraints provide the final guard for foreign keys, non-negative money
and quantities, business-scoped order/receipt numbers, and per-order ticket
sequence uniqueness. Application services still validate friendly domain errors
before writes.

## Number sequences

Orders and receipts use keys in the existing `app_metadata` table, for example
`order:<business-id>` and `receipt:<business-id>`. Kitchen tickets use
`kitchen:<order-id>`. Within the caller's `BEGIN IMMEDIATE` transaction, the
allocator seeds a missing key from the current scoped maximum, increments it, and
returns the value. The metadata update and the business row insert are therefore
committed or rolled back together; a failed attempt does not consume a number.
The unique indexes remain a final duplicate defense. `MAX(number) + 1` is not used
by the production application paths.

Payment idempotency is protected by the business-scoped idempotency key and the
payment transaction. Repeating a committed request returns the existing logical
result without creating another payment or receipt. KOT submission, order
creation, and inventory actions rely on their transactional state guards and
service-level duplicate checks; a generalized idempotency framework is deferred.

## Startup, migrations, and health

Native startup follows this order: locate the app database, let the checked-in
migrations run, open the configured connection, run integrity/foreign-key/schema
health checks, then create the daily backup and expose commands/authentication.
If the health check fails, setup returns a recovery-required error and normal POS
commands are not exposed. This prevents sales from continuing against a known
corrupt or newer-schema database. The Phase 10A backup/restore flow validates
integrity and migrations before installing a restored database and reopens a new
pool after replacement.

Migration execution is deterministic and migration failure prevents normal
initialization. The existing startup migration plugin applies migrations before
the custom pool is installed. A dedicated pre-migration backup before every
pending plugin migration is not currently possible without changing that startup
integration; this is a known limitation and remains deferred.

## Busy and write failures

SQLite lock contention waits briefly through `busy_timeout`, then is surfaced as a
recoverable database-busy error. Transaction failures, constraint failures, and
write failures roll back all writes in that transaction. The UI normalizes these
errors into product language rather than exposing SQL text in production; native
technical details remain in local logs where available.

Tests use real temporary/in-memory SQLite databases and failure triggers to abort
operations after an earlier write. They verify that no partial order, KOT,
payment/receipt, or inventory state remains and that a rolled-back sequence can be
retried safely.

## Recovery guidance

If native startup reports that recovery is required, stop opening additional ATE05
windows. Use Settings or the documented backup workflow from a healthy launch to
restore the latest validated backup; restore first creates a pre-restore safety
backup. If the application cannot reach Settings, preserve the app-data directory
and have the support operator restore from a validated backup using the platform's
ATE05 recovery procedure. Never delete the original database before preserving it.

Hardware power loss durability still depends on the operating system and storage
device. Cloud backup, multi-terminal synchronization, distributed locking,
encryption redesign, and a generic retry framework are intentionally deferred.
