# Printing reliability

ATE05 treats physical printing as an external side effect. Database state is
authoritative and is committed before any network printer call.

## Operational flow

Kitchen tickets and receipt snapshots are created in SQLite transactions first.
After commit, the native boundary attempts one TCP ESC/POS write. A connection or
write failure changes only the document's durable print state to `failed`; the
ticket, receipt, payment, order, table, and inventory records remain committed.

The persisted `print_attempts` table records the document, role printer, attempt
time, context (`initial`, `retry`, or `reprint`), outcome, and normalized failure
category/message. The ticket/receipt counters and latest error remain available
for the fast operational view. Historical attempts are not deleted after a
successful retry.

## Retry and reprint

Retry targets only an unresolved ticket or receipt and reuses its original
snapshot and number. It never recalculates a KOT delta or creates a new payment,
receipt, or kitchen ticket. Pending retries are loaded from SQLite, so they
survive application restart. Manual retry processes unresolved kitchen documents
in persisted order; there is no automatic backlog replay on reconnect.

Reprint is an explicit additional copy of an existing document. It leaves the
business record unchanged, records a `reprint` attempt, and sends a visible
`REPRINT` marker in the ESC/POS document. The original order/ticket/receipt
number remains unchanged.

## Transport and errors

V1 supports network/TCP ESC/POS only. Connection and write operations each have a
five-second bound. Errors are normalized into categories such as `timeout`,
`connection_refused`, `write_failed`, `invalid_configuration`, `disabled`, and
`not_configured`; the cashier sees concise product language while technical
details remain in native logs.

An unconfigured or intentionally disabled printer is distinct from an offline
printer. The business operation still commits and the document remains
retryable. Retry uses the currently configured printer, so correcting a printer
address and retrying is supported without changing historical documents.

Test Print is a separate native command and does not create a kitchen ticket,
receipt, payment, or operational print-attempt row. Browser preview remains a
mock/preview path and does not claim physical hardware success.

## Payload robustness and limitations

Ticket and receipt formatting remains deterministic for 58mm and 80mm widths.
Text is bounded to the configured line width and unsupported printer-side
character handling is outside the current raw TCP protocol guarantee. The app
can confirm that bytes were accepted by the TCP socket, not that paper emerged
or that a cutter physically completed its cycle. Cutter status polling and
Bluetooth/USB transports are intentionally deferred.

## Recovery procedure

If a printer is offline, continue taking orders. Confirm that the ticket or
receipt is saved, then use Print Issues → Retry after restoring power/network
connectivity. Retry each unresolved document in order. A successful retry clears
the unresolved state but leaves the attempt history available for diagnosis.

If the app restarts, sign in and use the persisted Print Issues list; no in-memory
queue is required. If the configured printer is disabled, enable it in Settings
before retrying. Physical thermal-printer validation is not part of automated CI
and must be performed with a compatible network printer before deployment.
