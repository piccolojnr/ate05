# POS client operation inventory

This inventory records the client boundary before the capability split. The
production Tauri client and browser-preview client intentionally keep the same
composed `PosClient` contract so screens can continue to use one dependency.

## Capability ownership

| Capability      | Operations                                                                                                                                                                                | Implementations and main callers                                                                      | Existing coverage                                           | Adapter difference                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| SessionClient   | `authBootstrap`, `setupOwnerPin`, `saveSetupProgress`, `completeFirstRunSetup`, `authenticateUser`, `currentSession`, `lockSession`, `listStaff`, `createStaff`, `updateStaff`            | `tauri-client.ts`, `browser-preview-client.ts`; `app.tsx`, auth/setup screens, settings staff section | `auth.spec.ts`, `pos-client.test.ts`, native `auth` tests   | Tauri verifies Argon2 PINs and persists session in the native command boundary; preview uses deterministic local state/fixtures. |
| BootstrapClient | `bootstrap`                                                                                                                                                                               | Both adapters; `app.tsx` and POS/Orders/Tables/Inventory screens                                      | Existing Playwright workflows and database service tests    | Tauri reads SQLite; preview reads localStorage-backed state.                                                                     |
| CatalogClient   | `listMenuManagement`, `createMenuItem`, `updateMenuItem`, `createMenuCategory`, `updateMenuCategory`                                                                                      | Both adapters; Menu screen                                                                            | Menu Playwright flow and database service tests             | Tauri uses the native SQL client; preview mutates preview state.                                                                 |
| OrdersClient    | `addMenuItem`, `completeOrder`, `getOrder`, `updateOrderItemQuantity`, `updateOrderItemNote`, `removeOrderItem`                                                                           | Both adapters; POS, Orders, and Tables screens                                                        | POS/Table Playwright flows and database service tests       | Tauri delegates to native SQLite transactions; preview reproduces business behavior in localStorage.                             |
| PaymentsClient  | `recordPayment`, `listReceipts`                                                                                                                                                           | Both adapters; payment dialog, Orders, receipt actions                                                | POS Playwright flow and database service tests              | Tauri persists payment/receipt state in SQLite; preview persists equivalent state locally.                                       |
| KitchenClient   | `sendOrderToKitchen`, `retryPendingKitchenPrints`, `reprintKitchenTicket`                                                                                                                 | Both adapters; POS and print-issues UI                                                                | POS Playwright flow, printing tests, database service tests | Tauri invokes native printing; preview captures deterministic mock output.                                                       |
| TablesClient    | `createTable`, `updateTable`, `setTableReservationState`                                                                                                                                  | Both adapters; Tables and POS screens                                                                 | Tables Playwright flow and database service tests           | Tauri enforces table/order state in SQLite; preview mirrors the rules locally.                                                   |
| InventoryClient | `listInventory`, `getInventoryItem`, `listStockMovements`, `createInventoryItem`, `updateInventoryItem`, `receiveStock`, `issueStock`, `recordWaste`, `returnStock`, `adjustStockToCount` | Both adapters; Inventory screen                                                                       | Inventory Playwright flow and database service tests        | Tauri uses transactional stock movements; preview uses localStorage state.                                                       |
| PrintingClient  | `listPrinters`, `savePrinter`, `testPrinter`, `retryPendingReceiptPrints`, `reprintReceipt`                                                                                               | Both adapters; Settings, POS, Orders                                                                  | Printer Playwright flow and printing tests                  | Tauri sends TCP ESC/POS through Rust; preview is explicitly mock/preview-only.                                                   |
| RecoveryClient  | `listBackups`, `backupNow`, `exportBackup`, `databaseHealth`, `restoreBackup`                                                                                                             | Both adapters; Settings Data & Backup section                                                         | Backup native tests and browser preview messaging test      | Tauri performs SQLite-safe native filesystem operations; preview returns a clear native-only error.                              |
| SettingsClient  | No standalone methods yet; printer and staff configuration remain owned by their capabilities                                                                                             | Settings screen                                                                                       | Printer/staff Playwright coverage                           | No divergence; this marker preserves room for future non-printer settings without creating a generic service.                    |

## Boundary notes

- `apps/pos/src/lib/pos-client.ts` remains the source of shared DTOs and the
  composed `PosClient` type. Capability interfaces live in
  `apps/pos/src/lib/client-capabilities.ts` and only import those shared DTOs.
- `tauri-client.ts` and `browser-preview-client.ts` remain the concrete
  implementations. No SQL was moved into Rust and no preview implementation
  was removed.
- `bootstrap` is separated as `BootstrapClient` because it loads the initial
  cross-screen read model rather than belonging to one business workflow.
- Settings currently has no independent operation family. Keeping an empty
  marker rather than inventing generic settings methods makes that absence
  explicit and avoids a dumping-ground interface.
- Native database/service tests prove database behavior and native command
  tests prove selected native behavior. They do not, by themselves, prove
  renderer-to-production-client execution. Playwright covers the browser
  adapter workflows; a full native GUI suite remains a separate validation
  concern.
