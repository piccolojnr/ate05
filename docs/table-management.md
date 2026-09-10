# Table management decisions

## Lifecycle

Tables use the existing `available`, `reserved`, and `occupied` states.

- Available tables can start a dine-in order or be reserved.
- Reserved tables can be released or used to start a dine-in order.
- Occupied tables expose their active order and can only return to available when that order is explicitly completed.

Payment does not release a table. A paid order remains operationally active
while it is open, sent to the kitchen, preparing, or ready.

## Occupancy authority

Active dine-in orders are the authority for occupancy. Table creation and order
creation run through transactional application operations, and the service
rejects a second active dine-in order for the same table. The table status is
updated alongside order creation/completion as a materialized operational hint;
bootstrap/list queries still derive occupied status from active orders.

## Management rules

Table names are unique within a business. Tables can be renamed, resized, or
deactivated, but an occupied table cannot be deactivated. Inactive tables remain
visible through the management filter and retain their historical order
references; they cannot receive new orders until reactivated.

The current order schema stores a table reference rather than a separate table
name snapshot. Completed historical orders therefore retain their `table_id`,
while a later table rename is reflected wherever the current table name is
joined for display.

## Deferred

Reservations are intentionally only a state marker. Customer details, times,
floor plans, table merging/moving, multi-table orders, timers, and cancellation
turnover workflows remain deferred.
