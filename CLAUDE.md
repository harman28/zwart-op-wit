# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal competition site for Zwart op Wit, a chess club, replacing their old Windows
Keizer-pairing software. Two audiences:

- **Public visitors** (no login) — anyone can view `/` (current round's pairings),
  `/round/:number` (any past round), and `/leaderboard` (season standings). Player
  names are clickable everywhere to see that player's results and value-over-time
  graph — this works for logged-out visitors too, not just admins.
- **The admin** — a single shared password (no per-admin accounts), but each login
  also takes a free-text name, attributed per-session to the audit log
  (`AdminActionLog` / Settings → Activity log) so "who did what" is still traceable
  even though everyone shares one password. In practice there's one primary admin
  (referred to as "Jim" throughout the codebase's own comments — the club's
  arbiter/organizer), who runs the weekly round cycle and submits KNSB rating-list
  results monthly. The admin flow: create a round → mark who's showed up → the
  engine auto-generates pairings → enter results → publish (makes it visible to
  the public). Players, seasons, external-team linking, and KNSB export all live
  under `/admin/*`.

## The Keizer system (the actual domain logic)

This is **not** Swiss or round-robin pairing. Each player has a **value** (not a
score in the usual sense) that *is* their current rank, re-assigned every round:
rank 1 gets `topValue`, rank 2 gets `topValue - 1`, and so on. Playing a game
transfers value directly between opponents:

- **Win** → winner gains the loser's entire current value; loser gains nothing.
- **Draw** → each gains half the other's value.
- **Bye** (absent while enrolled, or the odd-one-out when the field is uneven) →
  gains a fixed fraction of their *own* value (`REGULAR_BYE_FRACTION` = 1/3,
  `PAIRING_BYE_FRACTION` = 2/3 — a pairing bye is worth more since it's not the
  player's fault).
- **External match** (KNSB team competition, scraped from netstand.nl) → counts
  as a bye worth a fraction of own value based on the match outcome
  (`EXTERNAL_BYE_FRACTION`: win 0.75 / draw 0.5 / loss 0.25), only if the season
  has `countExternalMatches` on.

Crucially, every round is **replayed from scratch** on every query
(`engine/standings.ts`'s `replaySeason`): a player's score is their starting
baseline plus every historical entry's contribution, all recomputed under the
*current* snapshot of values — so if ranks shift, past contributions rebase too.
Nothing is stored incrementally; the engine always derives current state from the
full history of entries. Pairing itself (`engine/pairing.ts`) is rank-order
1v2/3v4/…, skipping any repeat pairing within `repeatPairingWindow` rounds, with
colors balanced by `|colorNumber|` imbalance (`engine/color.ts`). All of this is
pure, DB/HTTP-free, and enforced that way by an ESLint rule scoped to `src/engine/`
— see below.

The full rules — the actual source of truth — live in the club's own rules doc,
not restated here; the engine's test suite (`server/src/engine/__tests__/`) encodes
a real worked example from it and acts as a regression lock. If a change to that
test suite ever feels necessary, treat it as a signal to re-check the rules doc,
not the other way around.

## Commands

```bash
npm install                        # once, from repo root — both workspaces

npm run dev:server                 # terminal 1 — http://localhost:4000
npm run dev:web                    # terminal 2 — http://localhost:5173 (proxies /api)

npm test                           # server test suite (engine + integration), from repo root
cd server && npx vitest run path/to/file.test.ts   # a single test file
cd server && npx vitest run -t "test name substring"  # a single test by name

cd server && npm run lint          # ESLint — this is where the engine-isolation rule lives
cd server && npx tsc -p tsconfig.json --noEmit   # typecheck server
cd web && npx tsc -b --noEmit      # typecheck web
npm run build                      # both workspaces (web build also writes the deployed commit SHA)
```

CI (`.github/workflows/ci.yml`) runs all of the above against an ephemeral Postgres
on every push to `main` and every PR — mirror its steps when verifying locally.

## Architecture

Two independent npm workspaces:

- **`server/`** — Fastify + Prisma/PostgreSQL, owns all data.
  - `src/engine/` — the Keizer logic above. Pure functions only; ESLint
    (`server/eslint.config.js`) blocks it from importing Prisma, Fastify, `pg`,
    or anything under `db/`/`modules/`. `src/lib/mappers.ts` is the *only* place
    DB rows get translated into the engine's own input types.
  - `src/modules/*` — one folder per route group (seasons, rounds, players, auth,
    settings, knsb, externalTeams, backup, actionlog), each owning its own
    `*.routes.ts` + `*.service.ts`.
  - Every `/api/admin/*` route goes through `requireAdmin` (`src/lib/requireAdmin.ts`),
    one shared preHandler, which also attaches `actorName` for the audit log.
- **`web/`** — Vite + React + react-router, talks to `server/` over HTTP only.
  - `src/styles/tokens.css` is the *only* file a re-theme touches — every color
    used anywhere else references a custom property from here, never a literal.
  - `src/pages/*` map to routes in `App.tsx`; public pages (Rounds, Leaderboard)
    render for both logged-out visitors and admins (admin-only affordances are
    conditional within the same page, not separate admin/public page pairs).
    Admin-only pages are wrapped in `RequireAdmin` in `App.tsx`.
  - `src/context/AdminContext.tsx` and `ThemeContext.tsx` are the only two
    app-wide contexts (session state, and dark/light theme — persisted to
    `localStorage`, applied synchronously before React mounts via an inline
    script in `index.html` to avoid a theme flash).

Data model (`server/prisma/schema.prisma`) worth knowing up front:

- `Player` rows are **never deleted** — referenced by historical `RoundEntry`
  rows forever; "removing" a player means `archivedAt`, a display-only flag.
- `Season.topValue`/`repeatPairingWindow`/etc. are snapshotted at season creation,
  not read from a live settings table — a season's own history must never
  silently shift even if club-wide defaults change later.
- `Round.isPublished` gates public *visibility* only, never whether entries can
  still be edited by an admin.
- `RoundEntry.kind` (`GAME` / `PAIRING_BYE` / `REGULAR_BYE` / `EXTERNAL_BYE`) is
  the one row type covering every kind of round participation — see `engine/types.ts`
  for the pure-domain equivalent each maps to.
- `ClubSettings` is a singleton (id always 1) for non-season-scoped concerns:
  admin password hash, and the club's own defaults for new seasons.

## Design philosophy (frontend)

- **Dark is the default theme**, carried over 1:1 from the originally agreed
  mockup. Light mode is the literal "op wit" ("on white") half of the club's own
  name — warm paper/parchment tones, deliberately not a clinical white, so it
  still reads as the same product rather than a generic light-mode inversion.
- **Color carries meaning, and the meaning is fixed per color, not per theme.**
  Chess result colors (white won / black won) are *constant* across both themes
  — they represent actual chess piece colors, not page-theme colors, and "black
  won" is never styled as a loss. Separately, generic status colors (win/loss/draw
  pills, membership badges) use `--win`/`--loss`/`--draw`/`--secondary`, which *do*
  adapt per theme.
- **Value-graph comparison colors** were chosen with the `dataviz` skill's
  palette validator (CVD/contrast checked against the app's own `--accent`, not
  a generic default) — see the comment block above `--chart-series-2/3` in
  `tokens.css` for the reasoning, including why it's capped at 2 additional
  series rather than being open-ended.
- Any new chart, graph, or color-coded UI should load the `dataviz` skill before
  writing it, the same way the value graph was built.

## Deploy & environments

- **Production**: `main` branch, auto-deploys to Railway. `https://zwartopwit.up.railway.app`,
  also reachable at the custom domain `https://internal.zwartopwit.org` (not
  reachable from this sandbox's egress proxy — verify deploys via the
  `.up.railway.app` URL instead, and have the user confirm the custom domain
  themselves).
- **Staging**: `staging` branch, auto-deploys to Railway. `https://zwartopklad.up.railway.app`
  ("klad" = Dutch for rough draft) — its own Postgres, fully separate from
  production. All feature work and manual verification happens here first.
- **Test**: a disposable Postgres used only by the vitest suite
  (`server/.env.test`, `ADMIN_INITIAL_PASSWORD=test-password`). In this sandbox,
  local dev (`server/.env`, `ADMIN_INITIAL_PASSWORD=dev-password`) also points at
  a local Postgres rather than the real staging database, and **both `.env` and
  `.env.test` end up pointing at the same local `zwart_op_wit_test` database** —
  manually running the dev server and then the vitest suite against that shared
  DB leaves a `ClubSettings` row with the wrong password hash for whichever one
  runs next. Fix: `DELETE FROM "ClubSettings";` and restart whichever one you're
  about to use (it reseeds itself from its own `ADMIN_INITIAL_PASSWORD` on boot).
- Both environments expose `/api/commit.txt` with the deployed commit SHA — poll
  that to confirm a deploy actually landed rather than guessing from timing.

### Branch workflow

- **Every new piece of work gets its own topic branch off `main`** — never pile
  unrelated features onto one shared long-lived branch. Name it for what it does
  (e.g. `value-graph`, `fix-dropdown-clipping`).
  - Exception: a Claude Code cloud session may be bound by its own environment to
    a session-assigned branch (e.g. `claude/<session-id>`) it's required to push
    to. Treat that as the session's own branch, not a home for every feature —
    still cut real topic branches for actual work and PR them in; only fall back
    to the assigned branch if the session setup leaves no other option.
- PR the topic branch into `staging` to deploy it for review.
- Only promote `staging` → `main` (production) on explicit user approval — never
  on your own initiative.
- Promote via a GitHub PR (`staging` → `main`), squash-merged — matches the
  existing commit history style (`#97`, `#98`, …).
- After a squash-merge promotion, delete the merged topic branch (its history is
  now folded into `main`); don't reuse or reset it for the next piece of work.
- **Squash-merge drift**: once a PR squash-merges into `main`, `staging`'s own
  pre-squash commits have different SHAs than what's now on `main`, even though
  the content is identical — GitHub will then report a *later* PR from a fresh
  topic branch (cut from `main`) into `staging` as having merge conflicts, even
  when there's no real content conflict. Fix: confirm it's pure drift
  (`git diff origin/main origin/staging` should be empty), then resync `staging`
  to `main` — `git push origin origin/main:staging --force-with-lease` — and
  retry the merge.

## Chat conventions

- **Every URL in a chat reply is a markdown link, no exceptions** — not a bare
  URL, not backticked, not "see X at the URL below." This applies to every
  single one in a message, not just the first: a reply with a staging link
  and a production link needs both as links, not one link followed by a bare
  URL out of habit two sentences later. This has been pointed out multiple
  times in one session and still slipped — treat it as a hard formatting
  rule to check before sending any message that contains a URL, not a
  "remember to be nice about it" guideline.

## Backup / restore

The whole instance — every season, every player (active and archived, every
field), and the club-wide defaults — exports to one JSON file
(`GET /api/admin/backup`, or Settings → Export backup) and can fully re-import
(`POST /api/admin/backup/import`, or Settings → Replace with backup), wiping and
rebuilding the instance from it. Used to recover from a live break, or to bring
staging in line with real data. Exact format: `server/src/modules/backup/backup.schema.ts`.
