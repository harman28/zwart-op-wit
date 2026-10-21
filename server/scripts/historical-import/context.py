import sys
import openpyxl

path = sys.argv[1]
sheet = sys.argv[2]
row = int(sys.argv[3])
col = int(sys.argv[4])

wb = openpyxl.load_workbook(path, data_only=True)
ws = wb[sheet]

def cell(r, c):
    v = ws.cell(row=r, column=c).value
    return "" if v is None else str(v)

for r in range(max(1, row - 3), row + 2):
    cells = [cell(r, c) for c in range(max(1, col - 4), col + 4)]
    print(f"R{r} C{max(1,col-4)}..{col+4}: " + " | ".join(cells))
