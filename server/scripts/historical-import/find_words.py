import sys, re, openpyxl
path = sys.argv[1]
sheets = ["S6 Matchups", "S7 Matchups", "S8 Matchups"]
wb = openpyxl.load_workbook(path, data_only=True)
words_re = re.compile(r"bye|oneven|vrij|afwezig|bb\b", re.I)
for sheet in sheets:
    ws = wb[sheet]
    hits = []
    for r in range(1, ws.max_row+1):
        for c in range(1, ws.max_column+1):
            v = ws.cell(row=r, column=c).value
            if v is None: continue
            s = str(v)
            if words_re.search(s) and len(hits) < 8:
                hits.append((r,c,s))
    print(sheet, hits)
