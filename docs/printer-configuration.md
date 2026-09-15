# Printer configuration

Settings uses a guided flow for local printer setup: discover or enter a device, identify it, assign receipt or kitchen purpose, choose paper width, print a test page, then finish.

Paper width is stored in millimetres for compatibility with the existing SQLite printer profile. The UI displays the calculated printable width using:

`dots = round((millimetres / 25.4) × DPI)`

At the default 203 DPI profile this is 464 dots for 58 mm and 639 dots (approximately 640) for 80 mm. The character wrapping used by the current receipt and kitchen formatters remains the authoritative layout boundary; dot conversion is a profile preview, not a financial calculation.

Browser preview deliberately does not claim OS discovery or physical connectivity. Its test action is deterministic and simulated. Native Tauri uses the existing bounded test-print command and persists failures through the existing print-attempt pipeline.
