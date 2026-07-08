# Before going live

The site currently has mock/sample data on purpose, so Jim (or anyone else) can
click around, try the admin flow, and give feedback without touching anything
real. Do these before switching over to actual club use:

## 1. Wipe the sample data

The active season is deliberately named "... - Sample Data" as a reminder.
Before real use:
- End the sample season (Settings → End season), then
- Start the real one — either paste the real roster fresh (Settings → new
  season → roster textarea), or restore a real historical export via
  Settings → Replace with backup.

## 2. Set a real admin password

Still `chessclub123` — a placeholder approved early on "for now, we'll change
it later." Change it in Settings → Change password before anyone outside this
feedback loop has the URL.

## 3. ~~Give local dev its own database~~ — done (2026-07-08)

Three separate environments now exist, each with its own Postgres:
- **production** — Railway `production` environment (`web`, `server`,
  `Postgres`). Only ever touched by a deliberate `railway up` deploy once
  something's been verified elsewhere. This is what Jim uses.
- **staging** — Railway `staging` environment, a full duplicate of
  production's service shape with its own empty Postgres
  (https://web-staging-2c9c.up.railway.app). `server/.env` (local dev) points
  here now, never at production. All future feature work and manual
  verification happens against this DB.
- **test** — a local Postgres database (`zwart_op_wit_test`, via Homebrew),
  used only by the vitest suite (`server/.env.test`, loaded by
  `vitest.setup.ts`). Fully disposable, isolated from both staging and
  production, so `npm test` can freely create/delete seasons without
  conflicting with real state. CI (`.github/workflows/ci.yml`) uses its own
  ephemeral Postgres service container, same schema, zero shared state with
  local test runs.

## Not yet built (intentional, not broken)

- **Light mode** — the toggle exists in Settings but is disabled; no light
  palette has been designed yet.
- **KNSB rating export** — needs a sample export file from the old software
  before the real format can be built.
