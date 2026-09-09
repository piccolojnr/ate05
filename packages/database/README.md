# @ate05/database

This package owns ATE05's local SQLite persistence: the Drizzle schema, checked-in migrations, development fixture data, and small business-scoped repositories. The POS UI does not access SQLite directly.

## Local data rules

- Every operational record has an application-generated string ID. The globally unique ID is never shown to staff.
- Timestamps are UTC ISO 8601 strings (for example, `2026-01-02T12:00:00.000Z`). UI formatting is a separate concern.
- GHS money is stored as integer pesewas; `GHS 50.00` is `5000`.
- Order and receipt numbers are positive integers, unique within a business. V1 should allocate the next local number inside the same transaction that creates the record. They are friendly local references, distinct from immutable IDs and therefore may need a branch/device prefix once sync is introduced.

## Integrity decisions

- `orders.status` describes kitchen/operational progress; `orders.payment_status` describes settlement. They intentionally remain separate.
- Order items and kitchen-ticket items hold name, price/quantity, notes, and action snapshots. This allows historic receipts and ticket reprints to survive menu changes.
- A kitchen ticket belongs to an order but has its own sequence and type (`initial`, `addition`, or `cancellation`). Tickets are immutable, remain `pending` until a future printer succeeds, and are never marked printed on creation.
- Printer configuration is persisted per business and role. V1 uses one active network kitchen printer, but the schema also permits future receipt/bar printers and USB configurations.
- Physical printing is deliberately post-commit: a failed network write marks the ticket `failed` with attempt metadata and never removes or rolls back the kitchen instruction.
- Kitchen deltas are derived from ticket history: for each order line, sent quantity is the sum of ticket-item additions minus cancellations. This keeps the synchronization marker auditable without adding mutable sent-quantity fields to order items.
- A material note change is explicit: the next send creates a cancellation for the previously sent quantity/note followed by an addition for the current quantity/note. An unsent item removed before its first send creates no cancellation.
- Table status is a small persisted operational snapshot for V1 (`available`, `occupied`, `reserved`). A future order-aware seating service can reconcile it; no floor-plan or reservation model exists yet.
- Inventory keeps `current_quantity` for fast offline reads and makes `stock_movements` the audit history. Updating a balance and inserting its movement must happen in one SQLite transaction.

## Transaction boundaries for future services

- record payment + recalculate/update order payment status
- calculate kitchen delta + create ticket/item snapshots + update order status in one SQLite transaction
- create stock movement + update inventory balance
- close order + issue receipt snapshot + assign receipt number
- create order + item snapshots + assign local order number

The development seed is deliberately explicit: call `seedDevelopmentData` only in local development/test setup after `initializeDatabase`.

## POS operations

`createPosService(sqlite)` provides the small application-service surface used by a native POS bridge: menu/table reads, first-item order creation, open-order reads, item quantity changes, notes, totals, kitchen sending, and ticket history. It is deliberately not a generic repository framework. The first menu item creates the order inside the same transaction, preventing abandoned empty orders. Reopening an order always reads the persisted order-item and kitchen-ticket snapshots rather than current menu prices.
