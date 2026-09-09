export type PrintDocumentKind = "receipt" | "kitchen-ticket" | "test";

export interface PrintDocument {
  id: string;
  kind: PrintDocumentKind;
  content: string;
}

export interface PrintResult {
  accepted: boolean;
  jobId?: string;
  message?: string;
}

/** Platform-neutral contract; transport adapters will implement this later. */
export interface Printer {
  print(document: PrintDocument): Promise<PrintResult>;
}
