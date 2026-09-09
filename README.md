# ATE05

ATE05 is an offline-first restaurant operations system. Its first application is a desktop point-of-sale (POS) app; ordering, seating, menu, kitchen, payments, inventory, and printing features will follow in later increments.

## Architecture

The V1 POS is a React/Vite frontend packaged with Tauri 2. SQLite is the initial local source of truth, accessed through Drizzle ORM. No cloud service is required for normal restaurant operation. Cloud sync and additional applications are intentionally deferred.

| Workspace             | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `apps/pos`            | Desktop POS shell (React, Vite, Tauri)                |
| `packages/database`   | SQLite, Drizzle schema, migrations, initialization    |
| `packages/domain`     | Framework-independent restaurant business modules     |
| `packages/ui`         | Shared React and shadcn/ui-style UI primitives        |
| `packages/printing`   | Printer capability and document abstractions          |
| `packages/validation` | Shared Zod schemas                                    |
| `packages/config`     | Shared TypeScript configuration                       |
| `packages/tooling`    | Reserved for minimal shared tooling as the repo grows |

## Getting started

Install dependencies:

```bash
pnpm install
```

Run the POS in a browser:

```bash
pnpm dev
```

Run it in Tauri desktop development mode (requires a Rust toolchain and platform prerequisites):

```bash
pnpm --filter @ate05/pos tauri dev
```

## Verification

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

The repository deliberately has no backend server, cloud API, authentication provider, or microservice. Future kitchen-display, back-office, waiter, and sync applications can reuse `domain`, `database`, `validation`, and `ui` without putting business rules in the POS shell.
