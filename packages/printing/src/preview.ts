import type { PrintJob, PrintResult, Printer } from "./index";

/** Browser-only mock transport. It captures jobs and never touches hardware. */
export interface PreviewPrinter extends Printer {
  readonly jobs: PrintJob[];
}

export function createPreviewPrinter(): PreviewPrinter {
  const jobs: PrintJob[] = [];
  return {
    jobs,
    async print(job: PrintJob): Promise<PrintResult> {
      jobs.push(job);
      return {
        accepted: true,
        jobId: `preview-${job.id}`,
        message:
          "Captured by the browser print preview; no hardware was contacted.",
      };
    },
  };
}
