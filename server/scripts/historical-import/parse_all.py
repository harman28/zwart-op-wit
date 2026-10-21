import sys
import re
import json
import openpyxl

XLSX = sys.argv[1]
OUT_DIR = sys.argv[2]

print("loading workbook...", flush=True)
import time
_t0 = time.time()
wb = openpyxl.load_workbook(XLSX, data_only=True)
print(f"loaded in {time.time()-_t0:.1f}s", flush=True)

ROUND_RE = re.compile(r"Round\s*(\d+)", re.I)
ODD_RE = re.compile(r"^(.*?)\s+odd\s*$", re.I)
REP_RE = re.compile(r"\(([^)]*\brep\b[^)]*)\)", re.I)
# A "name" cell that's actually just a score token (e.g. "1R", "0.5") means
# this row isn't a real White/Black game row at all — almost always a nested
# non-Keizer sub-table (an external KNSB team match's one-name-one-score
# roster row) that happens to land in the same two columns as a real round's
# block, below where that round's own games end. Treating it as a game would
# fabricate a fictitious player named "1R".
SCORE_LIKE_RE = re.compile(r"^\d+(\.\d+)?r?$", re.I)


def norm(name):
    if name is None:
        return None
    s = str(name).strip()
    s = re.sub(r"\s+", " ", s)
    return s


def cellval(ws, r, c):
    v = ws.cell(row=r, column=c).value
    if v is None:
        return None
    if isinstance(v, str):
        return v
    return v


def parse_score(v):
    """Returns (numeric_value, is_forfeit) or None if blank/unparseable."""
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    forfeit = False
    if s.upper().endswith("R") and s[:-1].strip() != "":
        forfeit = True
        s = s[:-1].strip()
    try:
        return (float(s), forfeit)
    except ValueError:
        return None


def find_white_columns(ws):
    """Scan the WHOLE sheet (blocks can stack vertically below earlier ones
    in the same columns, not just side by side) for cells exactly 'White' —
    each marks one round-block's header row + White column; Black is the
    next column. Returns (header_row, white_col, end_row) where end_row is
    one row before the next block found in the same column (or sheet end)."""
    found = []
    for r in range(1, ws.max_row + 1):
        for c in range(1, ws.max_column + 1):
            v = ws.cell(row=r, column=c).value
            if isinstance(v, str) and v.strip().lower() == "white":
                found.append((r, c))
    # end_row per block = row before the next block in the SAME column, else sheet end.
    by_col = {}
    for r, c in found:
        by_col.setdefault(c, []).append(r)
    # Only the TOPMOST row of "White" headers is a real round block — a
    # Keizer round always starts at the sheet's first header row (fixed
    # left-to-right layout). Anything found at a LOWER row is a nested,
    # non-Keizer sub-table sharing the same columns (an external KNSB team
    # match scorecard, a "Knockout cup" bracket, a "Classical" side event) —
    # never a genuine additional round. Its presence still correctly bounds
    # the real block's end_row (stop before the nested table begins), it's
    # just never iterated as a block of its own.
    top_header_row = min(r for r, c in found)
    result = []
    for r, c in found:
        if r != top_header_row:
            continue
        later_in_col = [x for x in by_col[c] if x > r]
        end_row = (min(later_in_col) - 1) if later_in_col else ws.max_row
        result.append((r, c, end_row))
    return result


def find_round_number(ws, header_row, white_col):
    # The "Round N" label sits at this block's own White/Black columns,
    # a couple of rows above the header row — never reaching into the
    # previous block's columns (which would wrongly grab its label instead).
    for r in range(max(1, header_row - 3), header_row):
        for c in (white_col, white_col + 1):
            v = ws.cell(row=r, column=c).value
            if isinstance(v, str):
                m = ROUND_RE.search(v)
                if m:
                    return int(m.group(1))
    return None


def parse_matchups(sheet_name):
    ws = wb[sheet_name]
    blocks = find_white_columns(ws)
    print(f"  [{sheet_name}] blocks found: {len(blocks)} -> {blocks}", flush=True)
    name_variants = {}

    def track(raw):
        n = norm(raw)
        if n is None:
            return None
        key = n.lower()
        name_variants.setdefault(key, set()).add(n)
        return n

    rounds = {}
    excluded_rep = 0
    anomalies = []

    for header_row, white_col, end_row in blocks:
        black_col = white_col + 1
        round_number = find_round_number(ws, header_row, white_col)
        print(f"    block header_row={header_row} white_col={white_col} end_row={end_row} -> round={round_number}", flush=True)
        if round_number is None:
            anomalies.append(f"{sheet_name}: no round number found for block at header_row={header_row}, col={white_col}")
            continue
        entries = rounds.setdefault(round_number, [])

        r = header_row + 1
        while r <= end_row:
            wv = cellval(ws, r, white_col)
            bv = cellval(ws, r, black_col)
            if wv is None and bv is None:
                r += 1
                continue
            wv_s = norm(wv) if isinstance(wv, str) else wv
            bv_s = norm(bv) if isinstance(bv, str) else bv

            # Bye row: "<name> odd" in white col, nothing in black col.
            if isinstance(wv_s, str):
                m = ODD_RE.match(wv_s)
            else:
                m = None
            if m and (bv_s is None or bv_s == ""):
                player_raw = m.group(1).strip()
                rep_m = REP_RE.search(player_raw)
                if rep_m:
                    excluded_rep += 1
                    r += 1
                    continue
                player = track(player_raw)
                entries.append({"kind": "BYE", "player": player, "row": r})
                r += 1
                continue

            # Otherwise expect a normal game row: both white and black populated,
            # and neither looks like a stray score token from an unrelated
            # nested table (see SCORE_LIKE_RE).
            if (
                isinstance(wv_s, str)
                and isinstance(bv_s, str)
                and wv_s != ""
                and bv_s != ""
                and not SCORE_LIKE_RE.match(wv_s)
                and not SCORE_LIKE_RE.match(bv_s)
            ):
                white_raw = wv_s
                black_raw = bv_s
                rep_white = REP_RE.search(white_raw)
                rep_black = REP_RE.search(black_raw)
                odd_in_name = ODD_RE.match(white_raw) or ODD_RE.match(black_raw)
                excluded = bool(rep_white or rep_black)
                white_name = REP_RE.sub("", white_raw).strip()
                black_name = REP_RE.sub("", black_raw).strip()
                wm = ODD_RE.match(white_name)
                if wm:
                    white_name = wm.group(1).strip()
                bm = ODD_RE.match(black_name)
                if bm:
                    black_name = bm.group(1).strip()

                score_row = r + 1
                wsc = parse_score(cellval(ws, score_row, white_col))
                bsc = parse_score(cellval(ws, score_row, black_col))

                if excluded:
                    excluded_rep += 1
                    r += 2
                    continue

                if wsc is None and bsc is None:
                    # Both blank = a scheduled-but-not-yet-played game (future
                    # round, pairings entered ahead of time) — not an anomaly,
                    # just skip it like the engine's own result:null games do.
                    r += 2
                    continue
                if wsc is None or bsc is None:
                    # Only one side's score cell was filled in — the other is
                    # unambiguously its complement (0<->1, or 0.5<->0.5), so
                    # recover it mechanically rather than dropping real data.
                    # The blank side's forfeit-ness can't be recovered (no R
                    # marker to read), so the inferred side is never flagged
                    # a forfeit — if the FILLED side itself carries an R,
                    # that's honored as-is.
                    known, known_forfeit = wsc if wsc is not None else bsc
                    inferred = 1.0 - known if known in (0.0, 1.0) else known
                    if wsc is None:
                        wsc = (inferred, False)
                    else:
                        bsc = (inferred, False)
                    anomalies.append(
                        f"{sheet_name} round {round_number} row {r}: game '{white_raw}' vs '{black_raw}' had only one side's score entered at row {score_row} ({cellval(ws, score_row, white_col)!r}, {cellval(ws, score_row, black_col)!r}) — inferred the complement"
                    )

                wval, wforfeit = wsc
                bval, bforfeit = bsc
                white_p = track(white_name)
                black_p = track(black_name)

                if wval == 1 and bval == 0:
                    result = "WHITE_WIN_FORFEIT" if (wforfeit or bforfeit) else "WHITE_WIN"
                elif wval == 0 and bval == 1:
                    result = "BLACK_WIN_FORFEIT" if (wforfeit or bforfeit) else "BLACK_WIN"
                elif wval == 0.5 and bval == 0.5:
                    result = "DRAW"
                else:
                    anomalies.append(
                        f"{sheet_name} round {round_number} row {r}: unexpected score pair white={wval} black={bval} forfeit=({wforfeit},{bforfeit})"
                    )
                    r += 2
                    continue

                entries.append({
                    "kind": "GAME",
                    "white": white_p,
                    "black": black_p,
                    "result": result,
                    "row": r,
                })
                r += 2
                continue

            # Anything else (partial row, stray text) — note and skip one row.
            if (wv_s not in (None, "")) or (bv_s not in (None, "")):
                anomalies.append(f"{sheet_name} round {round_number} row {r}: unrecognized row shape white={wv_s!r} black={bv_s!r}")
            r += 1

    rounds_list = [{"number": n, "entries": entries} for n, entries in sorted(rounds.items())]
    variants_flagged = {k: sorted(v) for k, v in name_variants.items() if len(v) > 1}
    all_names = sorted({v for vs in name_variants.values() for v in vs})
    return {
        "sheet": sheet_name,
        "rounds": rounds_list,
        "excluded_rep_count": excluded_rep,
        "anomalies": anomalies,
        "name_variants_conflicting": variants_flagged,
        "all_names": all_names,
    }


def parse_standings(sheet_name):
    ws = wb[sheet_name]
    header_row = None
    name_col = None
    for r in range(1, min(ws.max_row, 10) + 1):
        for c in range(1, ws.max_column + 1):
            v = ws.cell(row=r, column=c).value
            if isinstance(v, str) and v.strip().lower() == "name":
                header_row = r
                name_col = c
                break
        if header_row:
            break
    if header_row is None:
        return {"sheet": sheet_name, "error": "no Name header found"}

    labels = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(row=header_row, column=c).value
        if isinstance(v, str):
            key = v.strip().lower()
            if key in ("value", "played", "win", "draw", "loss", "win%", "color", "odd", "points", "#"):
                labels.setdefault(key, c)

    rows = []
    r = header_row + 1
    while r <= ws.max_row:
        name = ws.cell(row=r, column=name_col).value
        if name is None or str(name).strip() == "":
            r += 1
            if r <= header_row + 3:
                continue
            break
        row = {"name": norm(name)}
        for key, c in labels.items():
            v = ws.cell(row=r, column=c).value
            row[key] = v
        rows.append(row)
        r += 1
    return {"sheet": sheet_name, "header_row": header_row, "rows": rows}


seasons = [4, 5, 6, 7, 8]
standings_sheet_name = {
    4: "S4 Final Standings",
    5: "S5 Final Standings",
    6: "S6 Current Standings",
    7: "S7 Current Standings",
    8: "S8 Current Standings",
}

import os
os.makedirs(OUT_DIR, exist_ok=True)

for s in seasons:
    m = parse_matchups(f"S{s} Matchups")
    st = parse_standings(standings_sheet_name[s])
    with open(f"{OUT_DIR}/season{s}_matchups.json", "w") as f:
        json.dump(m, f, indent=2)
    with open(f"{OUT_DIR}/season{s}_standings.json", "w") as f:
        json.dump(st, f, indent=2)
    print(f"season {s}: rounds={len(m['rounds'])} anomalies={len(m['anomalies'])} excluded_rep={m['excluded_rep_count']} standings_rows={len(st.get('rows', []))}")
    for a in m["anomalies"][:10]:
        print("   ANOMALY:", a)

# also parse S3 Final Standings as a possible predecessor hypothesis for S4 seeding
st3 = parse_standings("S3 Final Standings")
with open(f"{OUT_DIR}/season3_standings.json", "w") as f:
    json.dump(st3, f, indent=2)
print("season 3 (predecessor) standings_rows=", len(st3.get("rows", [])))
