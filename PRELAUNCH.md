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
  `Postgres`). Live at https://zwartopwit.up.railway.app. As of 2026-09-08,
  Jim is actively running the real internal competition here (Season 9,
  round 1 played 2026-09-08) — no longer sample data, treat it as live and
  handle with care. Deploys are now git-based (see below), not a manual
  `railway up`.
- **staging** — Railway `staging` environment, a full duplicate of
  production's service shape with its own empty Postgres. Live at
  https://zwartopklad.up.railway.app ("klad" = Dutch for a rough draft, a
  pun on the club's own name). `server/.env` (local dev) points here now,
  never at production. All future feature work and manual verification
  happens against this DB.
- **test** — a local Postgres database (`zwart_op_wit_test`, via Homebrew),
  used only by the vitest suite (`server/.env.test`, loaded by
  `vitest.setup.ts`). Fully disposable, isolated from both staging and
  production, so `npm test` can freely create/delete seasons without
  conflicting with real state. CI (`.github/workflows/ci.yml`) uses its own
  ephemeral Postgres service container, same schema, zero shared state with
  local test runs.

### Deploy pipeline (2026-09-08)

Branch-based, no one needs standing Railway access to ship a change:

- Feature branches merge (via PR) into `staging`. Railway's `staging`
  environment auto-deploys on every push to `staging` — this is how
  https://zwartopklad.up.railway.app gets updated now, replacing the old
  manual `railway up`.
- Once a change has been reviewed and tested on staging, `staging` merges
  (via PR) into `main`. Railway's `production` environment auto-deploys on
  every push to `main`.
- **One-time setup still needed on Railway's side** (Jim or whoever owns the
  Railway project): for both the `staging` and `production` environments'
  `web` and `server` services, set Source → connect the GitHub repo and pin
  the branch (`staging` branch for the staging environment's services,
  `main` for production's), with auto-deploy on push enabled. Until that's
  done, pushes to these branches don't deploy anywhere by themselves.

## ~~4. Light mode~~ — done (2026-07-09)

Full dark/light token set in `tokens.css`, toggle enabled in Settings,
verified across pages/breakpoints. Deployed to staging only so far — held
there by the production freeze above, not by anything technically
incomplete.

## ~~5. KNSB rating export~~ — done (2026-07-08)

Built and verified byte-for-byte against a real Jim-submitted export
(`server/src/modules/knsb/knsbExport.ts`'s golden-master test).
