import sys, openpyxl
path = sys.argv[1]
sheet = sys.argv[2]
cols = [int(x) for x in sys.argv[3].split(',')]
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb[sheet]
for r in range(1, ws.max_row+1):
    vals = [ws.cell(row=r, column=c).value for c in cols]
    if all(v is None for v in vals):
        continue
    print(f"R{r}:", " | ".join("" if v is None else str(v) for v in vals))
