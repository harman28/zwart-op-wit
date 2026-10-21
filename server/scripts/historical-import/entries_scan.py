import sys, openpyxl
path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True)
for sheet in ["S6 Matchups", "S7 Matchups", "S8 Matchups"]:
    ws = wb[sheet]
    print(f"--- {sheet} ---")
    for r in range(1, ws.max_row+1):
        for c in range(1, ws.max_column+1):
            v = ws.cell(row=r, column=c).value
            if isinstance(v, str) and v.strip().lower() in ("entries",):
                num = ws.cell(row=r, column=c-1).value
                try:
                    n = float(num)
                    if n % 2 != 0:
                        print(f"  ODD entries={n} at R{r}C{c}")
                except Exception:
                    pass
