# TODO

Standing list of paused or in-flight work. **Claude Code sessions working in
this repo should check this file before starting something unrelated**, and
should keep it current: add an item when work gets paused instead of
finished, remove it (or move it to the relevant PR/commit history) once it's
actually done. A git branch alone is not a reliable memory of paused work —
this file, on `main`, is.

## Historical Season 4-8 import — paused

- **Status**: investigation only. Nothing imported. No database touched.
- **Source file**: `server/scripts/historical-import/source-data/ZoW_Interne.xlsx`
  — the club's own old Windows Keizer-pairing software export (seasons 1-9).
  Only seasons 4-8 are in scope; season 9 is the app's current live season
  and must never be touched by this work.
- **Full write-up**: `server/scripts/historical-import/README.md` — sheet
  structure, decisions already made with the user (1R/0R forfeits, Season 4's
  rep-substitution rows, the stray X column), the seeding hypothesis that got
  Season 4 to 36/54 exact matches against its own ground-truth standings, and
  the diagnosed cause of the remaining gap. Reusable parsing/verification
  scripts are alongside it.
- **Hard constraint**: must never touch Season 9 / current data. Build and
  verify entirely on staging first, with a before/after check that Season 9
  is byte-identical.
- **Next step when resumed**: teach the parser to turn the external KNSB
  team-match sub-tables (currently discarded) into `EXTERNAL_BYE` entries —
  diagnosed as the cause of most of the remaining reconciliation gap,
  especially for S6-S8 — then re-verify all five seasons.
- **Open question for the user**: is Season 8 in this file actually a
  closed/final season, or still in-progress when it was exported? (rounds
  19-20 have pairings but no results entered; its sheet is titled "Current
  Standings", not "Final" like S4/S5's.)
- **Not started**: matching the 165 distinct player-name strings found in
  the file against the app's actual current `Player` records (including
  likely cross-season spelling drift for the same person) — a separate,
  later phase from the replay-verification work above.
