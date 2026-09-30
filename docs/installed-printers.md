# Installed Windows thermal printers

ATE05 supports receipt and kitchen printers through two enabled transports:

- `network`: the existing TCP ESC/POS transport, using an address and port.
- `system`: a Windows installed printer queue, using its exact queue name.

The legacy `usb` connection type remains stored but direct USB printing is
unsupported. USB and Bluetooth devices can use `system` once Windows has
installed them as printer queues. The device must accept ESC/POS bytes.

## Setup

1. Install the printer in Windows. For a USB thermal printer, an example is a
   **Generic / Text Only** queue on **USB001**. For Bluetooth, pair the device and
   install its Windows printer queue.
2. In ATE05 Settings, set up a receipt or kitchen printer and choose
   **Printer installed on this PC**.
3. Select the queue from the list. Use **Refresh list** after installing or
   renaming a printer. Configure paper width and cutter, then print a test page.

Windows manages USB001 or the Bluetooth port. These ports are display metadata,
not the saved queue identifier and not a network address.

## Native contract

`list_printer_queues` returns local and connected Windows printer queues:

```ts
Array<{
  name: string; // Exact queue name, passed to OpenPrinterW
  driverName: string;
  portName: string;
  status: number; // Windows PRINTER_STATUS_* bitmask; 0 means no reported flags
  jobs: number;
}>;
```

The same printer request is used by `print_receipt`, `print_kitchen_ticket`, and
`test_printer`. For example:

```json
{
  "connectionType": "system",
  "queueName": "Generic / Text Only",
  "address": "",
  "port": null,
  "paperWidth": 80,
  "cutterEnabled": true
}
```

Queue names are preserved exactly, including Unicode. Renaming or removing a
queue requires updating its ATE05 configuration. Both discovery and system
printing return `unsupported_platform` on Linux and macOS; TCP remains available.

ATE05 uses Winspool directly with the `RAW` datatype and the existing ESC/POS
payload. It handles partial writes and aborts unfinished documents before closing
the printer handle. Errors distinguish `queue_not_found`, `spooler_error`,
`write_failed`, `invalid_configuration`, and unsupported transports/platforms.
Successful submission means the spooler accepted the job, not confirmation that
paper physically printed. Queue status is informational and does not block
submission.

Migration `0006_system_printer_queues.sql` (native version 7) preserves legacy
network/USB configurations and print-history links. It adds nullable `queue_name`
and requires system configurations to have a queue name, empty address, and null
port. The native backup/restore migration sequence also includes version 7.

## Windows hardware verification

The following checks require a running Windows spooler and real devices:

- Select the Generic / Text Only USB001 queue and print a test, receipt, and
  kitchen ticket; confirm layout, feed, and configured cutting.
- Repeat with a paired, installed Bluetooth queue.
- Rename/delete a selected queue and verify the missing-queue error, then refresh
  and select its new name.
- Stop the spooler or deny queue access and verify actionable errors.
- Check that failed submissions leave no active unfinished ATE05 jobs or handles.

Rust tests cover request validation, transport dispatch, bounded spooler error
mapping, TCP payload preservation, unsupported platforms, and migration data
preservation. Cross-target compilation checks Windows API signatures and linking;
it cannot perform these hardware checks.
