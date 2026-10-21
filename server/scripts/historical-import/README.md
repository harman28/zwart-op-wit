# Historical season import (Seasons 4-8) — investigation notes

Status as of 2026-10-21: **paused mid-investigation, on the user's request** ("we'll
come back to this ... i will ask you to pick it up again"). Nothing has been
imported. No database has been touched. This is a write-up of everything
figured out so far, plus the scripts used to figure it out, so picking this
back up doesn't mean re-deriving it from scratch.

## The hard constraint (non-negotiable, from the user directly)

> "I would only want to do this if you have a way of ingesting previous
> seasons data that doesn't touch the current season at all."

Whatever the import mechanism ends up being, it must not be able to affect
Season 9 (the live, current season) or any other existing data. Build and
verify entirely on **staging** first, with a before/after check that Season
9's own numbers are byte-identical, before this ever goes near production.
See CLAUDE.md's "Backup / restore" section — the full-instance JSON
export/import may be a useful verification tool (diff Season 9's slice of an
export taken before vs. after).

## The source file

The user uploaded `ZoW_Interne.xlsx` — their old Windows Keizer-pairing
software's own workbook (the thing this whole app replaced — see CLAUDE.md's
intro). **This file was not committed anywhere** (deliberately — it's
personal/club data, and partially-verified at that). It only ever existed as
a session upload, copied into that session's scratchpad directory, which does
not persist across sessions. **Picking this up again starts with asking the
user to re-share the file.**

Relevant sheets (season number N): `S{N} Matchups` (round-by-round game
results) and `S{N} Final Standings` (S4, S5) / `S{N} Current Standings` (S6,
S7, S8) (end-of-season snapshot, used as ground truth to verify against).
Season 9 is already live in the app — out of scope. `S3 Final Standings`
is also in the workbook and useful as season 4's predecessor for seeding (see
below) even though season 3 itself is out of scope.

## Sheet structure (reverse-engineered — don't redo this part)

Each Matchups sheet lays rounds out left-to-right in repeating 3-column
blocks: a date + "Round N" label, an "entries" count (= 2 × that round's game
count; odd means someone had a bye), then a header row (`White | Black` for
S4/S5, `# | White | Black` for S6-S8), then repeating row-pairs: one row with
the two player names, the row directly below with their two scores.

Two complications that weren't obvious at first, both already handled by
`parse_all.py`:

- **Round blocks can wrap.** When a season runs out of horizontal room, a
  later round's block restarts in the *same* columns, stacked underneath an
  earlier block, rather than only ever going further right. Only the
  **topmost** row of `White` headers in a given column is a genuine round
  block header — anything lower in the same columns is something else
  entirely (next point).
- **Non-Keizer sub-tables are embedded in the same columns**, directly below
  where a round's own games end: external KNSB team-match scorecards (e.g.
  "ZoW 2 vs ENPS 4", one row per board), a "Knockout cup" bracket, and one
  stray "Classical" side-event label. `parse_all.py` guards against
  misreading these as fabricated Keizer games (a name cell that's actually
  just a bare score token like `1R` would otherwise read as a player named
  "1R").

Byes: one row reading `"<PlayerName> odd"` in the White-name position, no
Black name, no score row — confirmed present in S4, S5, **and S6** (e.g. S6
round 5, "Enno odd"). S7/S8's sampled rounds all happened to have even
turnout so no example was seen there, but the parser detects the pattern
generically, not per-season.

## Decisions already made by the user — apply directly, don't re-ask

1. **`1R` / `0R` scores** (same row shape as a normal decisive game, just
   suffixed with `R`) = a forfeit: one side didn't show up. Map to the
   engine's existing `WHITE_WIN_FORFEIT` / `BLACK_WIN_FORFEIT` — confirmed
   these exist in `server/src/engine/` *specifically* for this case (see
   `server/src/engine/__tests__/results.test.ts`, test 39: "WHITE_WIN_FORFEIT
   scores identically to WHITE_WIN (the 1R/0R requirement end-to-end)").
   Value transfer is identical to a normal decisive result — only the display
   label and KNSB-export eligibility differ.
2. **Season 4's `(... rep)` entries** (e.g. `"Bodhi (Alex rep)"`,
   `"Joppe odd (Alex rep)"` — a substitute standing in for an absent
   registered player): **exclude these games/rows entirely.** Don't attribute
   the result to either the sub or the absentee. Count so far: S4 = 1
   occurrence, S5-S8 = 0.
3. **Season 4's stray `X`** in a third column next to ~33 rows (no equivalent
   in any other season): **ignore it, no meaning.**

## The real unknown: each season's starting baseline

The engine (`replaySeason` in `server/src/engine/standings.ts`) needs, per
season: `topValue`, a `baselines: {playerId, startingValue}[]` (the roster's
rank order *before* round 1), and `rounds: RoundInput[]`. The workbook has no
"opening standings" sheet — only end-of-season snapshots — so the starting
order has to be reconstructed, not read directly.

Also worth knowing (already true of the live app, confirmed in
CLAUDE.md): **`topValue` is a club-configured ceiling, not simply "however
many players enrolled."** It must be read from the ground-truth standings
sheet's own max `Value`, never inferred from a player count — an
enrolled-but-never-showed player can sit below the lowest value that ever
actually appears in a round.

**Seeding hypothesis tested and showing real signal:** continue the
*previous* season's final standings order for returning players (same
relative order), append brand-new players at the bottom in order of first
appearance. Implemented in `build_engine_input.py`. Season 4 (verified
against S3's own Final Standings as predecessor — the cleanest case, since
S3 is a closed season with no ambiguity about its own completeness) got
**36 of 54 players' final `Value` matching the workbook's own Final Standings
exactly**, with `Played`/`Win` also matching for that same clean majority.
That's reasonably strong evidence the pairing/result parsing and the general
seeding *direction* (continue-previous-season, append-new-at-bottom) are
fundamentally correct — the remaining gap has a diagnosed cause, not an
unknown one:

**Diagnosed remaining gap:** mismatches correlate with the computed replay
under-counting `Played` relative to ground truth — i.e. the math itself looks
right, we're just missing real games. Root cause: the external KNSB
team-match sub-tables mentioned above are *real historical participation*
the engine already has a slot for (`EXTERNAL_BYE` — counts toward
Played/Win/Loss, see `types.ts`), but the current parser (correctly)
discards them wholesale rather than turning them into entries. This explains
why S6-S8 (much heavier external-match content) reconciled far worse (roughly
6-9 exact matches out of 49-70 players) than S4/S5 (36/54, 9/56) in the one
pass done so far.

**Recommended next step:** teach the parser to turn the external team-match
sub-tables into `EXTERNAL_BYE` entries (outcome derived from the match
result, per the club's `EXTERNAL_BYE_FRACTION` rules already in the engine —
see CLAUDE.md's Keizer-system section), then re-run verification. This is
very likely most of the remaining gap, especially for S6-S8.

## Open question for the user (not yet answered)

**Season 8** in this workbook has rounds 19-20 dated June 2026 with pairings
entered but no results, and its standings sheet is titled "Current
Standings" (not "Final", unlike S4/S5's "Final Standings"). It may be a
live/in-progress season the workbook was still tracking when exported, not a
genuinely closed historical season — worth confirming with the user before
importing it at all, possibly as a reason to scope the first import pass to
S4-S7 only.

## Player identity matching (not started)

165 distinct player-name strings were seen across S4-S8 (after trimming
whitespace variants — no internal spelling conflicts surfaced within a given
parse run). **Cross-season spelling drift for the same person** (e.g. is
S8's "Sam" the same person as S4-S7's "Sam K."? is "Pau" short for someone
whose current app record is "Paul"?) has **not** been checked, and neither
has matching any of these names against the app's actual current `Player`
table. That's a distinct later phase — don't conflate it with the
replay-verification phase above. Expect to need a manual review pass (a
proposed name → existing-Player-id mapping, with ambiguous/unmatched names
flagged) before any real import, not an automatic fuzzy-match.

Also unresolved: the Matchups sheets' bye marker (`"<name> odd"`) doesn't
distinguish the engine's two bye kinds — `PAIRING_BYE` (the odd-one-out when
the field is uneven, worth `PAIRING_BYE_FRACTION` = 2/3 of own value) vs.
`REGULAR_BYE` (absent while enrolled, worth `REGULAR_BYE_FRACTION` = 1/3).
`build_engine_input.py` currently maps every such bye to `PAIRING_BYE` as a
simplification — correct when the round's entries count was odd (there
really was one odd-one-out), but potentially wrong for a round where
multiple players sat out (only one of them is the "true" pairing bye; the
rest should be `REGULAR_BYE`). Worth checking whether any round had more
than one bye-marked player before trusting this blanket mapping.

## How to re-run this

From the repo root, once the xlsx has been re-shared and copied into an
isolated scratch directory (it's an **untrusted upload** — see the
environment's own file-isolation rule: own empty directory, don't run
scripts from inside it, pass the path as an argument):

```bash
# openpyxl needs python3.13 specifically in this sandbox (not python3/python3.11)
pip3 install --quiet openpyxl
python3.13 -I server/scripts/historical-import/inspect.py <path-to-xlsx>   # sanity check sheet list

python3.13 -I server/scripts/historical-import/parse_all.py <path-to-xlsx> <out-dir>
# -> writes season{4..8}_matchups.json, season{4..8}_standings.json, season3_standings.json

# Each season's predecessor arg is a *_standings.json (ground truth from
# parse_all.py, shape: {rows: [{name, value, played, win, ...}]}) — season 4's
# predecessor is season3_standings.json (season 3 is otherwise out of scope),
# every later season's predecessor is the previous season's OWN
# season{N-1}_standings.json, not anything computed by this step.
python3.13 -I server/scripts/historical-import/build_engine_input.py <out-dir> 4 <out-dir>/season3_standings.json <out-dir>/engine_s4.json
python3.13 -I server/scripts/historical-import/build_engine_input.py <out-dir> 5 <out-dir>/season4_standings.json <out-dir>/engine_s5.json
python3.13 -I server/scripts/historical-import/build_engine_input.py <out-dir> 6 <out-dir>/season5_standings.json <out-dir>/engine_s6.json
python3.13 -I server/scripts/historical-import/build_engine_input.py <out-dir> 7 <out-dir>/season6_standings.json <out-dir>/engine_s7.json
python3.13 -I server/scripts/historical-import/build_engine_input.py <out-dir> 8 <out-dir>/season7_standings.json <out-dir>/engine_s8.json

# Verify against ground truth (run from server/, needs tsx — already a devDependency):
cd server
npx tsx scripts/historical-import/verify_season.ts <out-dir>/engine_s4.json <out-dir>/season4_standings.json
# ... repeat per season
```

(`smoke_engine.ts` is a 5-line sanity check that `replaySeason` imports
correctly from this script's new location — run it first if anything about
the import paths looks broken after moving things around.)

None of these scripts write to any database, call any API, or touch git —
they only read the xlsx and write JSON/stdout into whatever `<out-dir>` you
point them at (use a scratchpad directory, not the repo).
