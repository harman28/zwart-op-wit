# Zwart op Wit

Internal chess competition site for Zwart op Wit — replaces the club's old Windows
Keizer-pairing software with a public leaderboard/rounds site plus an admin flow for
running the weekly cycle.

Two independent apps in one repo (npm workspaces):

- `server/` — Node + TypeScript + Fastify + Prisma/PostgreSQL. Owns all data and every
  bit of Keizer pairing/scoring logic (isolated in `server/src/engine/`, fully unit
  tested, zero DB/HTTP dependencies).
- `web/` — Vite + React. Talks to `server/` over HTTP only. All visual/theme decisions
  live in `web/src/styles/tokens.css` — that's the only file a future re-theme touches.

## Develop

```bash
npm install                 # once, from the repo root — installs both workspaces
cp server/.env.example server/.env   # fill in a real DATABASE_URL + SESSION_SECRET

npm run dev:server          # terminal 1 — http://localhost:4000
npm run dev:web             # terminal 2 — http://localhost:5173 (proxies /api to :4000)
```

## Test

```bash
npm test                    # runs the server test suite (engine tests + route tests)
```

The Keizer engine's test suite (`server/src/engine/__tests__/`) is a regression lock —
it encodes the club's actual rules doc and a real worked example. It should very
rarely need to change; if a change to it feels necessary, treat that as a signal to
double check the rules doc rather than the other way around.

## Environments & deploy

Three separate environments, each with its own Postgres:

- **production** — Railway `production` environment (`web`, `server`, `Postgres`).
  Live at https://zwartopwit.up.railway.app — the real club competition.
- **staging** — Railway `staging` environment, a full duplicate of production's
  service shape with its own Postgres. Live at https://zwartopklad.up.railway.app
  ("klad" = Dutch for a rough draft). `server/.env` (local dev) points here, never
  at production. All feature work and manual verification happens against this DB.
- **test** — a local/CI-only Postgres, used only by the vitest suite
  (`server/.env.test`). Fully disposable, isolated from both staging and production.

Deploys are branch-based, no one needs standing Railway access to ship a change:
feature branches merge (via PR) into `staging`, which auto-deploys to
zwartopklad.up.railway.app; once reviewed there, `staging` merges (via PR) into
`main`, which auto-deploys to production.

## Backup / restore

The whole instance — every season, every player (active and archived, with every
field), and the club-wide defaults — can be exported to a single JSON file
(`GET /api/admin/backup`, or Settings → Export backup). If the live system ever
breaks, or to bring staging in line with real data, that file can be re-imported
(`POST /api/admin/backup/import`, or Settings → Replace with backup) to fully wipe
and rebuild the instance from it. See `server/src/modules/backup/backup.schema.ts`
for the exact format.
