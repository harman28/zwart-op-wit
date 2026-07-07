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

## Backup / restore

Every season can be exported to a single JSON file (`GET /api/admin/seasons/:id/backup`)
containing the full player list and round-by-round game history. If the live system
ever breaks, that file can be re-imported to fully reconstruct the season — see the
plan doc for the exact format.
