import { toast } from "@ate05/ui";

/** POS feedback policy. Persistent operational state stays in the screen. */
export const notify = {
  success: (message: string) => toast.success(message),
  info: (message: string) => toast.info(message),
  warning: (message: string) => toast.warning(message, { duration: 8000 }),
  error: (message: string) => toast.error(message, { duration: 8000 }),
};
