# Native SQLite connection ownership

The SQL plugin executes each statement through a connection pool. Sending
`BEGIN IMMEDIATE`, writes, and `COMMIT` as separate plugin calls with the default
pool can use different connections. The transaction then blocks its own writes
with SQLITE_BUSY. A busy timeout alone cannot solve this.

After the plugin runs its existing preload migrations, native setup replaces the
pool with a single persistent connection, with no idle or lifetime recycling and
a five-second busy timeout. The renderer uses `Database.get`, because
`Database.load` would replace the configured pool with a default pool again.

Complete public native client operations share a Web Lock, including reads, so
their statements cannot interleave inside another operation's transaction.
Internal method calls retain the original client as `this` to avoid nested locks.
Web Locks also coordinate windows sharing the same application origin. Separate
native processes have separate SQLite connections and use SQLite's file locking.

The browser preview adapter remains independent. Regression tests exercise real
SQLite transaction commit/rollback through separate pool calls and concurrent
client operations through the Web Locks API.

This is a compatibility fix for the existing renderer-managed SQL operations.
Future native application commands should own entire transactions in Rust,
including rollback when a renderer closes during an operation.
