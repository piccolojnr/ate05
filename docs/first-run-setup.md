# First-run setup

ATE05 keeps restaurant setup inside the application, not inside the operating
system installer. A fresh database shows the setup wizard before the normal
staff lock screen.

## Setup state

Migration 5 adds `app_metadata.setup_status`. New databases start as
`not_started`. Databases that already contained an active business and
administrator are backfilled as `completed`, so upgrading an existing
installation does not unexpectedly re-enter onboarding.

The final setup write is one SQLite transaction. It saves the restaurant name,
owner name and Argon2id PIN hash, selected starter menu records, generated
tables, and the completed state together. A failed or interrupted finalization
does not leave half-created starter data.

## Wizard steps

1. Welcome and local/offline explanation.
2. Restaurant name and owner name/PIN confirmation.
3. Optional starter menu pack and initial table count.
4. Review and finish.

Printers are intentionally optional during onboarding. Configure kitchen and
receipt printers later in Settings. Starter menu prices are editable normal
menu records; no inventory or recipe relationships are created.

Available starter choices are Start empty, ATE05 Rice Menu, and Counter service.
ATE05 Rice Menu is the default and includes Rice, Proteins, Locals, Atiéké,
Loaded & Fries, Specials, Soups, and Meat. The supplied prices are editable
suggestions. Items without a supplied price are included at GHS 0.00 with a
Price to be configured description so they can be priced before selling.
Tables are created as available with the standard capacity when a count is
supplied.

## Resume and production safety

The setup finalization is idempotent at the record level and only marks setup
complete after all requested records are written. Production native startup
does not seed a known PIN or development menu. Development/browser fixtures
remain separate and may use deterministic test PINs.

After setup completes, ATE05 signs in the owner and subsequent launches show
the normal lock screen.
