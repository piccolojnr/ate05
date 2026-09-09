# ATE05 POS UI audit

Date: 2026-09-09

This audit treats ATE05 as an offline-first restaurant operations desktop app: the interface should be calm, highly scannable, and dense enough for a cashier or manager working at a 1366 × 768 terminal. The visual direction is a warm-neutral workspace, charcoal navigation, and restrained terracotta emphasis. The current pass keeps motion low and prioritizes operational clarity over decorative variety.

## Current architecture

The application has three overlapping UI layers:

- `packages/ui` contains the product's currently used shared `Button`, `Card`, `Badge`, `StatusMessage`, and `cn` utilities.
- `apps/pos/src/components` contains product compositions such as the sidebar, menu catalog, order panel, and hand-authored icons.
- `apps/pos/src/components/ui` contains a partially generated shadcn/Radix layer. Its `Input` is used, while its local `Button`, `Dialog`, and `ScrollArea` are not used by the application.

`apps/pos/src/screens/placeholders.tsx` contains all screen compositions, including functional Orders, Tables, Inventory, and Settings screens. The filename is now misleading: these are product screens, not only placeholders. The shell is currently assembled directly in `app.tsx`, with a hidden header fragment left over from an earlier layout.

The existing shadcn configuration is in `apps/pos/components.json`. It is a valid existing setup and does not need to be initialized again or replaced with another primitive system.

## Component usage

| Component or layer                  | Actual usage                                                   | Finding                                                                                    |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `@ate05/ui/Button`                  | Menu catalog, order panel, screens, sidebar                    | Authoritative shared button today                                                          |
| `@ate05/ui/Card`                    | Menu catalog, order panel, screens                             | Authoritative shared surface today                                                         |
| `@ate05/ui/Badge`                   | Order and inventory views                                      | Used, but status mappings are repeated in screens                                          |
| `@ate05/ui/StatusMessage`           | No imports found                                               | Unused                                                                                     |
| `@ate05/ui/cn`                      | Sidebar and product components                                 | Used utility                                                                               |
| `apps/pos/components/ui/Input`      | Menu catalog and order panel                                   | Shared only within the app; should move to `packages/ui`                                   |
| `apps/pos/components/ui/Button`     | Only imported by unused local Dialog                           | Dead duplicate primitive                                                                   |
| `apps/pos/components/ui/Dialog`     | No imports outside its own file                                | Dead composition                                                                           |
| `apps/pos/components/ui/ScrollArea` | No imports found                                               | Dead primitive                                                                             |
| `apps/pos/components/ui/Tooltip`    | Provider mounted in `main.tsx`; no tooltip trigger usage found | Infrastructure without an active consumer                                                  |
| `components/icons.tsx`              | Sidebar, menu catalog, order panel, app                        | Product icon set, but hand-authored and not centralized with the shadcn icon configuration |
| `screens/placeholders.tsx`          | All secondary screens                                          | Active product code with an obsolete filename                                              |

## Duplication and inconsistency

The repository has two Button implementations and two `cn` conventions. The app's local Input is the only local form primitive actually consumed, while most secondary screens use raw HTML inputs and selects. This creates inconsistent focus, height, border, and error behavior.

The shared package's primary Button uses a hard-coded slate background even though the global primary token is terracotta. The sidebar uses multiple raw dark hex values instead of navigation tokens. Status colors are selected directly in screen code rather than through one status presentation mapping.

Several useful application compositions are missing: there is no shared page header, action bar, empty state, error state, or operational status mapping. The hidden header in `app.tsx` is dead markup. Menu metadata also contains presentation-era hard-coded values, while the Menu screen itself still contains mock-era static content even though the POS catalog is real.

## Dead or placeholder-era UI

The local Button, Dialog, and ScrollArea files are unused after import tracing and can be removed once the shared package boundary is established. `StatusMessage` is exported but currently unused. The Tooltip provider is mounted but no actual tooltip is rendered. The `placeholders.tsx` name should eventually be replaced with a screen module name that reflects its real contents.

The hidden header in `app.tsx` can be removed as part of the shell extraction. Static Menu screen content and hard-coded POS metadata should be handled during their screen redesigns, not expanded during this foundation phase.

## Ownership decision

`packages/ui` is the authoritative reusable visual system. It owns visual primitives with no restaurant-domain knowledge: Button, Badge, Card, Input, and future primitives such as Label, Select, Separator, Dialog, and Popover when they have real consumers. It owns token-based styles and accessibility-friendly primitive behavior.

`apps/pos` owns product composition and feature interaction: AppShell, AppSidebar, PageHeader, ActionBar, EmptyState, ErrorState, StatusBadge mappings, operational tables, forms, and all screen-specific workflows. These components may consume `@ate05/ui`, but `packages/ui` must not know about orders, tickets, printers, payments, or inventory.

The existing Radix/shadcn primitives remain valid where they are useful. We will not create a second shadcn system. Unused local duplicates are removed only after import verification.

## ATE05 design tokens

The foundation uses semantic CSS variables and Tailwind aliases rather than raw screen colors:

- Workspace: warm neutral background, white cards, neutral borders, and muted surfaces.
- Navigation: charcoal background, light foreground, muted navigation text, and terracotta active state.
- Brand/action: terracotta primary with a readable light foreground.
- Feedback: success, warning, destructive, and info semantic colors.
- Shape: 12px cards, 10px controls, 8px compact controls, and full-radius status pills.
- Elevation: restrained card and floating shadows, used to separate work surfaces rather than decorate them.
- Type: Geist variable font already present in the app, with explicit title, section, body, metadata, and numeric emphasis conventions.
- Focus: one visible primary-colored focus ring for keyboard and accessibility feedback.

The target visual variance is intentionally low (`3/10`), motion is minimal (`2/10`), and operational density is moderate-high (`6/10`) because this is a desktop workflow product, not a marketing page.

## Foundation work in this phase

This phase establishes the package boundary, moves the consumed Input primitive into `packages/ui`, aligns the Button with the primary token, adds semantic navigation/status tokens, extracts the application shell, and introduces reusable page-header/status compositions. Empty/error states remain a follow-up application-layer migration where the existing screens need them. It does not redesign every screen or remove working domain controls.
