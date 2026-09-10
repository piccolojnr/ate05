# ATE05 UI consistency audit

Date: 2026-09-10

This pass reviewed the six production workspaces together: POS, Orders, Tables, Menu, Inventory, and Settings. The audit was intentionally limited to repeated visual, interaction, and accessibility patterns. Order, payment, kitchen, receipt, printer, inventory, and table-lifecycle semantics were not changed.

## Baseline findings

The application already had a coherent warm-neutral visual direction and a shared shell, but the secondary management screens had drifted in their form controls. Menu, Inventory, Tables, and Settings used native selects and checkboxes with slightly different heights, focus behavior, and borders. Menu also had the only remaining raw textarea. Two dialogs referenced `shadow-float`, while the token provided by the design system is `shadow-floating`. Settings passed the internal value `success` through the operational status mapper, which produced a lower-case fallback label rather than a product-facing test result.

The six screens otherwise share the same PageHeader, Card, Button, Input, StatusBadge, currency formatter, navigation shell, and semantic color tokens. Their different layouts are intentional: POS is a persistent selling workspace, Orders is a list/detail workspace, Tables is a seating grid, Menu is management, Inventory is an audit-oriented stock surface, and Settings is configuration.

## Standardized patterns

- `@ate05/ui` now owns the reusable `Checkbox`, `Select`, and `Textarea` primitives alongside Button, Input, Card, and Badge.
- Management forms now use the same control height, border, background, focus ring, disabled state, and typography.
- Settings test feedback uses a success Badge with the human-facing label `Test succeeded`; operational status mapping remains reserved for actual persisted states.
- Dialog elevation uses the existing `shadow-floating` token consistently.
- Existing `formatGhs` remains the single money display helper. Inventory quantities remain tabular and use local grouping with the canonical unit.
- Existing status mappings remain the shared source for order, payment, kitchen/print, table, availability, and inventory states.

## Accessibility and interaction review

The shell provides a stable landmark and keyboard-focusable navigation. Buttons and selectable rows retain semantic button elements, and existing dialogs expose `role="dialog"`, `aria-modal`, and labelled headings. Shared inputs and the new controls now expose the same visible focus treatment. Existing submit guards and disabled pending states were preserved.

## Intentionally accepted inconsistencies

- POS intentionally uses a denser two-workspace layout, while management screens use list/detail or card layouts.
- The platform-native select appearance is retained; the shared wrapper standardizes sizing and focus without introducing a custom dropdown interaction.
- Orders uses concise local time in its primary list, while Inventory history includes the day and month because movement chronology matters there.
- Existing fixed-overlay dialogs were not replaced with a new dialog framework during this audit. Their current labelled semantics and close actions remain intact; a full focus-trap abstraction is follow-up UX debt.
- The existing hand-authored icon set was retained to avoid visual churn; icon-family replacement is not needed for the current operational workflows.

## Remaining UX debt

- Some screen-specific dialogs can eventually share a product-level dialog shell and focus trap.
- Search/filter controls remain screen compositions rather than one universal toolbar component because their actions and density differ.
- The browser preview and native runtime distinction is correctly represented in Settings, but no live printer monitoring is implied by the UI.

## Validation scope

The implementation was reviewed at the intended desktop breakpoints of 1366×768, 1440×900, and 1920×1080 through the existing layout tests and full browser workflow suite. The full suite uses the repository’s preview server on port 4173; the separate Tauri development port may be occupied by an existing local process and is not used as a second application instance during validation.
