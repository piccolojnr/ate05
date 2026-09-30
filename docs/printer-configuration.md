# Printer configuration

## USB or Bluetooth printer on Windows

1. **Install ATE05** on the Windows PC and finish the restaurant setup.
2. **Connect the printer** by USB, or pair it using Windows Bluetooth settings.
   Turn it on, load receipt paper, and close the paper cover.
3. In Windows, open **Settings → Bluetooth & devices → Printers & scanners**.
   Add/install the printer using its supported driver, then open its printer
   properties and **print a Windows test page**. A Bluetooth pairing alone is
   not enough: it must appear in Printers & scanners as an installed printer.
4. In ATE05, open **Settings → Printers → Add printer → Printer installed on this
   PC**. Select the installed printer name from the list. Use **Refresh list** if
   it was installed while ATE05 was open. You can edit the friendly name staff
   will see without changing the selected Windows printer.
5. Choose **Customer receipts** or **Kitchen tickets**. Choose **58 mm** or
   **80 mm** paper to match the roll, and enable the cutter only if the printer
   has one. Leave **Printer enabled** checked to use it.
6. Choose **Review test → Print test page** to print an ATE05 test slip. Check
   that the slip physically printed, is readable, and feeds/cuts as expected.
   Then choose **Save & finish**.

**No IP address or network port is needed for a printer installed on this PC.**
Select its Windows printer name; Windows manages the USB or Bluetooth connection.
A Windows port label such as USB001 is not an ATE05 address.

The thermal printer must support ESC/POS printing. A Windows **Generic / Text
Only** queue is suitable when the printer supports raw ESC/POS data. Keep the
receipt and kitchen roles separate in ATE05 even if both use the same physical
printer.

## Network printer

Choose **Network printer**, enter its friendly name and network address, and
use port **9100** unless the printer supplier specifies another port. Continue
through purpose, paper profile, and test printing. Editing a saved network
printer keeps its existing address, port, and profile; it does not automatically
switch to a Windows installed printer.

Existing direct-USB configurations are preserved during upgrades, but direct USB
printing remains unsupported. To use such a device, install its Windows printer
queue and explicitly select **Printer installed on this PC** in ATE05.

## If something goes wrong

### The printer name is missing

- Check that the printer is connected or paired, powered on, and listed in
  Windows **Printers & scanners** under the same Windows account running ATE05.
- Add/install it there and print a Windows test page. Return to ATE05 and choose
  **Refresh list**. Select the printer name from the refreshed list.
- If the printer was renamed or removed, open **Edit setup** on the ATE05 printer
  and select the current Windows name. ATE05 will not silently choose another
  printer.
- If the Windows printer list cannot load, ask the person managing the PC to
  check that the **Windows Print Spooler** service is running and that your
  account can use the printer.

### Windows reports the printer offline

- Check power, paper, the cover, and the USB cable or Bluetooth connection.
- Open its Windows print queue. Resume paused printing and turn off **Use
  Printer Offline**, if that option is enabled. Clear a stuck test job if needed.
- Print another Windows test page before trying ATE05 again. Ask the person
  managing the PC to resolve Windows connection/driver problems if it still
  cannot print.

### The ATE05 test slip fails or never comes out

- Read the error in ATE05 and confirm that the selected Windows printer is the
  intended one and **Printer enabled** is checked.
- Try a Windows test page. If that also fails, fix the Windows printer first.
- If Windows prints but the ATE05 slip is blank or unreadable, check that the
  printer accepts ESC/POS and has a suitable raw-print driver/queue. Check the
  paper width and cutter setting, then test again.
- Windows may accept a job while an offline printer keeps it waiting. ATE05's
  successful test submission does **not** prove paper came out. Check the Windows
  queue for waiting jobs before sending more test slips, which could print later.
- Sales, payments, saved receipts, and kitchen tickets remain saved when printing
  fails. Once the connection is fixed, use the existing print-issue/retry controls
  for unresolved documents. Do not create a second sale or payment just to print.

## Installer physical acceptance — PENDING

Complete these checks on the installed Windows app with the actual printer.
Automated tests and a cross-build do not complete this checklist.

- [ ] Print a Windows test page over USB; repeat over Bluetooth if it will be used.
- [ ] Select that queue in ATE05 and physically inspect the ATE05 test slip.
- [ ] Print a customer receipt and a kitchen ticket to their selected queues;
      check readable text, paper width, feed, and configured cutter behavior.
- [ ] Restart ATE05 and confirm that each queue, role, paper width, and cutter
      setting is retained.
- [ ] Disconnect the printer or mark it offline, confirm the waiting/error state,
      reconnect, and recover without creating another order or payment.
- [ ] Refresh after renaming/removing a queue and verify that ATE05 requires the
      intended replacement to be selected. If upgrading, check saved network
      printers still work and legacy USB records have not changed.

## Paper profile and browser preview

Paper width is stored in millimetres for compatibility with the existing SQLite printer profile. The UI displays the calculated printable width using:

`dots = round((millimetres / 25.4) × DPI)`

At the default 203 DPI profile this is 464 dots for 58 mm and 639 dots (approximately 640) for 80 mm. The character wrapping used by the current receipt and kitchen formatters remains the authoritative layout boundary; dot conversion is a profile preview, not a financial calculation.

Browser preview cannot list installed Windows printers or physically print. Its
test action is simulated. Native receipt and kitchen printing records attempt
history; a setup test slip is separate and does not create an order, payment,
receipt, kitchen ticket, or operational print-attempt record.
