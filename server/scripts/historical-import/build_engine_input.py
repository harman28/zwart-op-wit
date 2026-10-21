"""
Build per-season engine-ready input (topValue, baselines, rounds) from the
parsed matchups JSON, seeding each season's starting order by continuing the
PREVIOUS season's final standings order (returning players keep their
relative order from how the previous season ended), with brand-new players
appended at the bottom in order of first appearance (round number, then row).

Usage: build_engine_input.py <parsed_dir> <season_n> <predecessor_standings.json|-> <out.json>
predecessor can be '-' for season with no usable predecessor (then new
players are ordered by first appearance only, lowest rank last-seen-first
arbitrary — flagged as a weaker hypothesis).
"""
import sys
import json

PARSED_DIR = sys.argv[1]
SEASON = int(sys.argv[2])
PRED_PATH = sys.argv[3]
OUT_PATH = sys.argv[4]

with open(f"{PARSED_DIR}/season{SEASON}_matchups.json") as f:
    matchups = json.load(f)
with open(f"{PARSED_DIR}/season{SEASON}_standings.json") as f:
    standings = json.load(f)

# Previous season's final order, best -> worst, by name (lowercased for matching).
pred_order = []
if PRED_PATH != "-":
    with open(PRED_PATH) as f:
        pred = json.load(f)
    # The standings sheet is already listed top-to-bottom in rank order
    # (verified by inspection — rank1's row always precedes rank2's, etc.);
    # no need to re-sort by the "#" column, which isn't always reliable.
    pred_order = [r["name"] for r in pred["rows"]]

# First-appearance order of every player this season, from the matchups rounds.
first_seen = {}
for rnd in matchups["rounds"]:
    for i, e in enumerate(rnd["entries"]):
        names = [e["player"]] if e["kind"] == "BYE" else [e["white"], e["black"]]
        for n in names:
            key = n.lower()
            if key not in first_seen:
                first_seen[key] = (rnd["number"], i, n)

this_season_names = {n.lower(): orig for n, (_, _, orig) in first_seen.items()}
# Canonical display name: prefer the standings sheet's spelling when present.
standings_names = {r["name"].lower(): r["name"] for r in standings["rows"]}
for k, v in standings_names.items():
    this_season_names.setdefault(k, v)

all_keys = set(this_season_names.keys())

returning = [k for k in pred_order if k.lower() in all_keys]
returning_keys_seen = {k.lower() for k in returning}
new_players = sorted(
    (k for k in all_keys if k not in returning_keys_seen),
    key=lambda k: first_seen.get(k, (10**9, 10**9, k))[:2],
)

order_keys = [k.lower() for k in returning] + new_players
# De-dup while preserving order (defensive).
seen = set()
ordered = []
for k in order_keys:
    if k in seen:
        continue
    seen.add(k)
    ordered.append(k)

# Anyone in standings/matchups not caught above (shouldn't happen) goes last.
for k in all_keys:
    if k not in seen:
        ordered.append(k)
        seen.add(k)

# topValue is a club-configured ceiling (per CLAUDE.md: snapshotted at season
# creation, not derived from roster size) — it can exceed the count of
# players who ever actually got a recorded entry (enrolled-but-never-showed
# players sit silently at the bottom, never debuting, never affecting any
# replay math). Read it from the ground truth standings' own max Value
# rather than assuming it equals our distinct-name count.
top_value_from_gt = max((r.get("value") for r in standings["rows"] if r.get("value") is not None), default=None)
top_value = int(top_value_from_gt) if top_value_from_gt is not None else len(ordered)

name_to_id = {k: i + 1 for i, k in enumerate(ordered)}
id_to_name = {v: this_season_names.get(k, k) for k, v in name_to_id.items()}

baselines = [
    {"playerId": name_to_id[k], "startingValue": top_value - idx}
    for idx, k in enumerate(ordered)
]

rounds = []
for rnd in matchups["rounds"]:
    entries = []
    for e in rnd["entries"]:
        if e["kind"] == "BYE":
            pid = name_to_id.get(e["player"].lower())
            if pid is None:
                continue
            entries.append({"kind": "PAIRING_BYE", "playerId": pid})
        else:
            wid = name_to_id.get(e["white"].lower())
            bid = name_to_id.get(e["black"].lower())
            if wid is None or bid is None:
                continue
            entries.append({
                "kind": "GAME",
                "whitePlayerId": wid,
                "blackPlayerId": bid,
                "result": e["result"],
                "isSelfArranged": False,
            })
    rounds.append({"number": rnd["number"], "entries": entries})

out = {
    "season": SEASON,
    "topValue": top_value,
    "baselines": baselines,
    "rounds": rounds,
    "idToName": id_to_name,
    "seeding": {
        "returning_count": len(returning),
        "new_count": len(new_players),
        "predecessor": PRED_PATH,
    },
}
with open(OUT_PATH, "w") as f:
    json.dump(out, f, indent=2)

print(f"season {SEASON}: topValue={top_value} players={len(ordered)} returning={len(returning)} new={len(new_players)} rounds={len(rounds)}")
