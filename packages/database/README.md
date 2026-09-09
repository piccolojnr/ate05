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
- A kitchen ticket belongs to an order but has its own sequence and type (`initial`, `addition`, or `cancellation`). Additions are new tickets, not full-order reprints.
- Table status is a small persisted operational snapshot for V1 (`available`, `occupied`, `reserved`). A future order-aware seating service can reconcile it; no floor-plan or reservation model exists yet.
- Inventory keeps `current_quantity` for fast offline reads and makes `stock_movements` the audit history. Updating a balance and inserting its movement must happen in one SQLite transaction.

## Transaction boundaries for future services

- record payment + recalculate/update order payment status
- create kitchen ticket + ticket-item snapshots + order status update
- create stock movement + update inventory balance
- close order + issue receipt snapshot + assign receipt number
- create order + item snapshots + assign local order number

The development seed is deliberately explicit: call `seedDevelopmentData` only in local development/test setup after `initializeDatabase`.

## POS operations

`createPosService(sqlite)` provides the small application-service surface used by a native POS bridge: menu/table reads, first-item order creation, open-order reads, item quantity changes, notes, and totals. It is deliberately not a generic repository framework. The first menu item creates the order inside the same transaction, preventing abandoned empty orders. Reopening an order always reads the persisted order-item snapshots rather than current menu prices.
