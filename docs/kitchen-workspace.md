# Kitchen workspace

## Current lifecycle

ATE05 stores kitchen instructions as immutable `kitchen_tickets`. The
operational stage is authoritative on the owning order:

`sent_to_kitchen` → `preparing` → `ready`

The Kitchen workspace presents these order stages as **New**, **Preparing**,
and **Ready**. Each persisted ticket is shown as its own card so additions and
cancellations remain visible as distinct instructions. Because the current
schema has no ticket-level status, advancing a card advances the owning order
transactionally; all tickets for that order therefore move together.

## Board behaviour

Tickets are ordered oldest first by their persisted `created_at`, then by order
number and ticket sequence. Age is derived at display time and refreshes every
30 seconds. Urgency is derived, never persisted: normal (under 10 minutes),
approaching (10–19), late (20–29), and critical (30 minutes or more). Labels
and text accompany the restrained semantic styling so urgency is not conveyed
by colour alone.

The board loads active orders with durable kitchen tickets through the typed
`KitchenClient` boundary. It refreshes on entry, after stage transitions, on
window focus, and through the visible Refresh action. A failed refresh keeps
the last loaded tickets visible and offers a retry.

## Semantics preserved

Ready means ready for operational handoff. It does not imply payment, receipt
printing, order completion, or table release. Those remain separate existing
workflows. Kitchen actions do not create payments or receipts.

The current post-send edit model remains unchanged: POS can create addition or
cancellation tickets through its existing delta lifecycle. The Kitchen board
does not reinterpret those deltas or merge them into the original ticket.

## Permissions and deferred work

The `kitchen` permission is available to owner/manager and kitchen roles. The
native and browser clients enforce the same boundary. There are no stations,
courses, recall transitions, live multi-device sync, automatic backlog
printing, or item-level preparation states in this phase.
