export type PrintDocumentKind = "receipt" | "kitchen-ticket" | "test";

export type PrinterRole = "kitchen" | "receipt";
export type PrinterConnectionType = "network" | "usb";
export type PaperWidth = 58 | 80;

export interface PrinterConfig {
  id: string;
  businessId: string;
  name: string;
  role: PrinterRole;
  connectionType: PrinterConnectionType;
  address: string;
  port: number | null;
  paperWidth: PaperWidth;
  cutterEnabled: boolean;
  active: boolean;
}

export interface PrinterConnection {
  open(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface PrintDocument {
  id: string;
  kind: PrintDocumentKind;
  content: string;
}

export interface PrintJob {
  id: string;
  document: PrintDocument;
  printer: PrinterConfig;
  reprint?: boolean;
}

export interface PrintResult {
  accepted: boolean;
  jobId?: string;
  message?: string;
}

export class PrinterError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "disabled"
      | "connection_refused"
      | "timeout"
      | "write_failed"
      | "unsupported_transport"
      | "invalid_configuration"
      | "not_found"
      | "already_printed",
    message: string,
  ) {
    super(message);
    this.name = "PrinterError";
  }
}

/** Platform-neutral contract; transport adapters are implemented by the host. */
export interface Printer {
  print(job: PrintJob): Promise<PrintResult>;
}

export * from "./escpos";
export * from "./formatters/kitchen-ticket";
export * from "./formatters/receipt";
export * from "./preview";
