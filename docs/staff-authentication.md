# Staff authentication

ATE05 uses local staff accounts and a numeric PIN. Staff select their account and enter a 4–6 digit PIN. PINs are hashed with Argon2id-compatible Argon2 password hashing and per-user salts; hashes never enter renderer state.

## Roles

| Role            | Access                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Owner / Manager | POS, Orders, Tables, Menu, Inventory, Settings, staff, printers, backup/restore and inventory adjustments |
| Cashier         | POS, Orders, Tables, payments, receipts and normal service operations                                     |
| Kitchen         | POS/order visibility and inventory operations needed for kitchen work                                     |
| Inventory       | Inventory operations                                                                                      |
| Waiter          | POS, Orders and Tables                                                                                    |

The native authentication commands establish an in-memory session. Administrative commands check the session and permission at the application boundary; the UI also filters navigation for usability.

## Startup and locking

Native startup initializes the local database, then shows the lock screen. If the seeded owner has no PIN, the first owner must create one before signing in. Lock clears the in-memory session without closing the application. Five minutes without pointer or keyboard activity locks the terminal; active interaction resets the timer.

## Account lifecycle

Administrators can add, deactivate, and reactivate staff from Settings. PINs can be set during account creation or reset through the staff-management operation; existing PINs are never displayed. Accounts are deactivated rather than deleted so historical attribution remains intact. At least one active administrator is always required.

## Attribution and preview

Existing operational attribution fields continue to store the signed-in actor where supported. Browser preview uses deterministic fixture accounts only: `ATE05 Owner` PIN `2468` and `Preview Cashier` PIN `1357`. These are preview-only values and are not production credentials.

## Deferred

Cloud identity, MFA, biometrics, shifts, payroll, granular permission builders, and manager overrides are intentionally deferred.
