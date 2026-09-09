# Notifications

ATE05 uses the [shadcn Sonner pattern](https://ui.shadcn.com/docs/components/radix/sonner), adapted to the existing monorepo ownership boundary and light-mode tokens.

- `packages/ui/src/components/sonner.tsx` owns the Sonner dependency integration, semantic styling and reusable `Toaster`. The package exports `Toaster` and Sonner's `toast` API.
- `apps/pos/src/main.tsx` mounts one `Toaster`, outside screen navigation. No provider is required.
- `apps/pos/src/lib/notifications.ts` owns POS feedback policy. Workflows import `notify` from this module and call `notify.success`, `notify.info`, `notify.warning`, or `notify.error` with their own message text.

Success and informational messages last five seconds. Warnings and errors last eight seconds. Sonner handles stacking, keyboard access, hover pause, hidden-page pause, dismissal, and live-region announcements. The close button is labelled “Dismiss notification”. Avoid recreating timer or queue state in React.

Use success for confirmed actions, info for neutral results, warning for partial success requiring attention (such as a saved ticket awaiting printing), and error for failed actions. Payment/ticket success must remain distinct from printer failure. Persistent print state stays visible in the order; a toast is additional feedback.

The former custom `ToastProvider`, `useToast`, and timer component have been removed. Do not add a second Sonner wrapper under `apps/pos/components/ui`, mount a toaster per screen, or reintroduce banner state just to emit notifications. Other primitive ownership and the existing shadcn configuration remain unchanged.
