# ATE05 POS UI redesign plan

This plan follows the UI audit in `docs/ui-audit.md`. The current phase establishes shared foundations and the application shell; later phases migrate screens one at a time without changing their domain behavior.

## Screen migration map

### 1. POS

- Current problems: the catalog and order panel are functional but use mixed primitive ownership, hard-coded operator metadata, and dense local composition styles.
- Reusable components: PageHeader, SearchField, StatusBadge, ActionBar, Panel/Card, quantity controls, and a consistent currency/amount treatment.
- Planned layout: two-column desktop workspace with a focused catalog surface and a persistent order surface; the order panel remains visible at the minimum desktop width.
- Key interaction changes: make order context, kitchen state, payment state, and pending changes readable at a glance; keep add-item, quantity, notes, kitchen, payment, and receipt actions intact.
- Preserve: menu selection, order creation/reopening, quantities, notes, kitchen delta sending, payments, receipt actions, and printer feedback.

### 2. Orders

- Current problems: list and status presentation are basic grids; amount paid, amount due, and receipt availability need a clearer operational hierarchy.
- Reusable components: PageHeader, SearchField, StatusBadge, DataTable/operational list, EmptyState, and receipt action group.
- Planned layout: a scannable order table/list with strong order number, table/type, operational status, payment status, balance, and last activity columns.
- Key interaction changes: make reopening and payment/receipt actions discoverable without exposing implementation details.
- Preserve: open/completed order views, order reopening, payment status, balances, and receipt preview/reprint.

### 3. Tables

- Current problems: table cards are useful but need a stronger seating/workflow hierarchy and consistent table-state treatment.
- Reusable components: PageHeader, StatusBadge, operational Card, EmptyState, and table occupancy composition.
- Planned layout: room/table grid with visible table number, occupancy, current order summary, and primary action.
- Key interaction changes: make starting/opening a table order and returning to an active order the dominant actions.
- Preserve: seating data, table selection, active-order linking, and order creation.

### 4. Menu

- Current problems: the screen is still mock-era static content while the POS catalog is real; it needs a real menu-management information architecture.
- Reusable components: PageHeader, SearchField, DataTable, Badge, Dialog/Form primitives, EmptyState, and action bar.
- Planned layout: menu item list grouped by category with clear price, active state, and edit/create actions.
- Key interaction changes: replace static presentation cards with persisted menu management while retaining the POS catalog as the selling surface.
- Preserve: menu item names, prices, categories, active state, and the POS catalog's ability to add items.

### 5. Inventory

- Current problems: the workflow is functional but form controls and movement actions are visually raw and the list/history hierarchy can be more deliberate.
- Reusable components: PageHeader, StatusBadge for stock state, operational table, ActionBar, Dialog/Form controls, and history list.
- Planned layout: inventory table with current quantity as the main value, low-stock state, and a focused action menu; history appears in a detail panel/dialog.
- Key interaction changes: make Receive, Issue, Waste, Return, and Adjust actions consistent and keep current balance visible in each workflow.
- Preserve: offline SQLite inventory, immutable movements, opening stock, attribution, unit rules, negative-stock validation, low-stock warnings, and movement history.

### 6. Settings

- Current problems: printer forms repeat low-level field styling and combine configuration, retry state, and test actions without a strong section hierarchy.
- Reusable components: PageHeader, SectionHeader, FormField, Select/Input, StatusBadge, ActionBar, and ErrorState.
- Planned layout: settings sections for kitchen printer, receipt printer, and operational print queue, with one clear primary action per section.
- Key interaction changes: separate saved configuration from test/retry actions and make native-vs-preview behavior explicit.
- Preserve: printer roles, network configuration, paper width, active state, test print, retry, and failure messaging.

## Implementation order

1. POS: it is the highest-frequency workflow and validates the shell, panel, amount, and status foundations.
2. Orders: it shares order/payment/receipt state and provides the operational history surface.
3. Tables: it extends the order context into seating operations.
4. Menu: it replaces the remaining mock-era management surface.
5. Inventory: it applies the same operational table and movement-detail patterns.
6. Settings: it consolidates the established form and status patterns around printers.

Each migration should preserve the existing application/client boundary and should be verified with the current workflow tests rather than snapshotting markup.
