# Menu management decisions

The Menu screen and the POS catalog use the same persisted `menu_categories` and
`menu_items` records. There is no separate management-only menu dataset. Native
Tauri and browser preview clients expose the same management operations through
the typed POS client boundary.

## Item state

`active` controls whether an item is part of the managed menu. `available`
controls whether an active item can currently be added to a new order. The POS
catalog only exposes items that are both active and available, while the Menu
screen shows inactive and unavailable records for management and historical
continuity.

Availability changes do not affect inventory and do not alter existing order
items.

## Prices and history

Prices are entered as decimal currency in the form and converted to integer
minor units before reaching the application client. Order items already snapshot
their name and unit price, so later menu edits affect future additions only.

## Categories

Categories are business-scoped persisted records. V1 provides category creation
and category selection in the Menu screen. The service refuses to deactivate a
category while active menu items still reference it; items must be reassigned or
deactivated first. This prevents active items from becoming orphaned.

## Synchronization

After a menu mutation, the application refreshes the management list and POS
bootstrap data through the client boundary. This makes new prices and
availability visible to future POS additions without maintaining a second source
of truth or requiring an application restart.
