# Checkout flow inventory

## Before this phase

The POS order panel contained the payment form. `OrderPanel` delegated payment submission to the composed `PosClient.recordPayment` capability. Native SQLite records the payment, recalculates `payment_status`, allocates a business-scoped receipt number and creates the receipt snapshot in one `BEGIN IMMEDIATE` transaction. Physical receipt printing happens after commit and updates the receipt print state separately. The browser preview keeps the same observable order/payment shape with local persistence.

Order completion was already a separate `OrdersClient.completeOrder` operation. It is not triggered by payment or printing and releases a dine-in table only as part of that completion operation.

## After this phase

The order panel opens a dedicated Checkout workspace. It presents the authoritative order snapshot, amount due, payment method, cash tender/change or external reference, and an explicit `Confirm Payment` action. The existing `recordPayment` operation and idempotency key remain unchanged.

After commit, the workspace shows the payment result and receipt snapshot. Receipt printing remains an external post-commit operation. Failed printing preserves the payment and receipt and is retried with `retryReceiptPrint(orderId)`; successful receipts can be explicitly reprinted with the existing receipt record.

`Complete order · Release table` remains a separate action and is available only after the order is fully paid and operationally active. Returning to the order never clears persisted order or payment state.

## Domain capability note

Partial and mixed payments are supported by repeated `recordPayment` calls. A receipt is created when the recorded payments reach the authoritative order total. The current UI adds one tender at a time rather than introducing a separate split-tender draft engine.
