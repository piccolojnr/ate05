# ATE05

ATE05 is an offline-first restaurant operations system. Its first application is a desktop point-of-sale (POS) app; ordering, seating, menu, kitchen, payments, inventory, and printing features will follow in later increments.

## Architecture

The V1 POS is a React/Vite frontend packaged with Tauri 2. SQLite is the initial local source of truth, accessed through Drizzle ORM. No cloud service is required for normal restaurant operation. Cloud sync and additional applications are intentionally deferred.

| Workspace             | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `apps/pos`            | Desktop POS shell (React, Vite, Tauri)                 |
| `packages/database`   | SQLite, Drizzle schema, migrations, seed, repositories |
| `packages/domain`     | Framework-independent restaurant business modules      |
| `packages/ui`         | Shared React and shadcn/ui-style UI primitives         |
| `packages/printing`   | Printer capability and document abstractions           |
| `packages/validation` | Shared Zod schemas                                     |
| `packages/config`     | Shared TypeScript configuration                        |
| `packages/tooling`    | Reserved for minimal shared tooling as the repo grows  |

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

## Local database development

SQLite is the initial local source of truth. The database package stores GHS values as integer pesewas, UTC ISO timestamps, and application-generated string IDs. Its checked-in Drizzle migrations create business-scoped records for staff, menu, seating, orders, kitchen tickets, payments/receipts, inventory, and stock movements.

Generate a schema migration after an intentional schema change:

```bash
pnpm --filter @ate05/database db:generate
```

See [`packages/database/README.md`](packages/database/README.md) for numbering, history, and transaction-boundary decisions. Development seed data is separate from normal initialization.

## POS persistence boundary

Operational writes live in `packages/database` as a focused SQLite POS service; React never imports `better-sqlite3`. The desktop renderer selects the native-only typed Tauri client (`apps/pos/src/lib/tauri-client.ts`), which uses the official Tauri SQL plugin with fixed, parameterized operational queries. It shares `packages/domain` money/total helpers and never accepts SQL from React. The normal browser/Vite preview uses a clearly separated local-storage preview adapter so UI development and Playwright can run without a native runtime; it is not the production persistence implementation and is never selected when Tauri is present.

On desktop, `ate05.db` is created below Tauri's OS-specific application data directory (the plugin's supported SQLite base directory), alongside `backups/` and `logs/`. The registered Rust migration runs idempotently before the connection is used. Startup only ensures the ATE05 business and local owner bootstrap records; it never resets or production-seeds data. Development-mode native startup adds the existing demo data only when the local menu is empty.

Native Linux validation additionally needs the Tauri prerequisites `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, and the related GTK system libraries. The repository includes the Rust/plugin wiring, but those administrator-owned packages must be installed on the development machine before `cargo check` or `tauri dev` can complete.

The SQLite service itself is initialized with `initializeDatabase`, then explicitly seeded with `seedDevelopmentData` for local development/tests. This keeps production startup from silently adding demo records.

The repository deliberately has no backend server, cloud API, authentication provider, or microservice. Future kitchen-display, back-office, waiter, and sync applications can reuse `domain`, `database`, `validation`, and `ui` without putting business rules in the POS shell.
