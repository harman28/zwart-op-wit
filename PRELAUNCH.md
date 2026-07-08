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

## 3. Give local dev its own database

**Most likely to get forgotten — read this before asking for more changes once
real data is in the system.**

Local development and the live production site currently point at the *same*
Railway Postgres database. That was fine while everything was disposable
sample data, but once real results are in there, any further local
development or testing (including work done via Claude Code) risks:
- creating test seasons/players/rounds that show up on the real site,
- colliding with invariants that assume test-friendly state (e.g. "only one
  active season") when real data violates them, and
- a test script mutating or wiping something real by mistake.

**Fix**: provision a second Postgres (a small Railway addon is enough) for
local dev/testing, point `server/.env`'s `DATABASE_URL` at it, and leave the
live `server` service's `DATABASE_URL` (set directly on Railway, not in this
repo) pointing at the real one. This is a small, one-time infrastructure
change — flag it explicitly the next time code changes are needed, since it
won't happen automatically.

## Not yet built (intentional, not broken)

- **Light mode** — the toggle exists in Settings but is disabled; no light
  palette has been designed yet.
- **KNSB rating export** — needs a sample export file from the old software
  before the real format can be built.
