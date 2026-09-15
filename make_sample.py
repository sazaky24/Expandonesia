"""
Generate a small cross-tabulated (pivot) Excel workbook that exercises the
full unpivot pipeline, including merged Country cells, a Berat/Nilai measure
row, and a "Totals" row that must be dropped during cleaning.

Run:  python make_sample.py
Output: sample_data/sample_matrix.xlsx
"""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment

# (country, port, berat, nilai) columns. Each country forms a horizontal band
# of ports; the Berat & Nilai columns alternate inside every port band.
COLUMNS = [
    ("AUS", "SYD", 150, 120),
    ("AUS", "MEL", 180, 90),
    ("USA", "NYC", 200, 160),
    ("USA", "LAX", 210, 140),
]

# Each (kode, produk, {col_index: value}) row. We store values by column band.
DATA = [
    ("K001", "Tuna",
     {"AUS/SYD": (150, 120), "AUS/MEL": (180, 90),
      "USA/NYC": (200, 160), "USA/LAX": (210, 140)}),
    ("K002", "Shrimp",
     {"AUS/SYD": (50, 40), "AUS/MEL": (60, 30),
      "USA/NYC": (70, 55), "USA/LAX": (80, 60)}),
    ("K003", "Mackerel",
     {"AUS/SYD": (300, 250), "AUS/MEL": (280, 230),
      "USA/NYC": (320, 270), "USA/LAX": (290, 240)}),
]


def _cell(col: int) -> str:
    """1-based column index -> Excel column letter."""
    name = ""
    while col:
        col, rem = divmod(col - 1, 26)
        name = chr(65 + rem) + name
    return name


def build_workbook() -> Workbook:
    wb = Workbook()
    ws = wb.active
    ws.title = "Data"

    # Build the header block.
    row = 1
    # Row 0 (excel row 1): Country, merged across each port pair.
    col = 3  # columns A, B are the empty Kode / Produk header area
    for country, port, _berat, _nilai in COLUMNS:
        ws.merge_cells(start_row=row, start_column=col,
                       end_row=row, end_column=col + 1)
        c = ws.cell(row=row, column=col, value=country)
        c.alignment = Alignment(horizontal="center")
        col += 2

    # Row 1 (excel row 2): Port. Repeated per Berat/Nilai column.
    row += 1
    col = 3
    for country, port, _b, _n in COLUMNS:
        ws.cell(row=row, column=col, value=port)
        ws.cell(row=row, column=col + 1, value=port)
        col += 2

    # Row 2 (excel row 3): Measure type (Berat / Nilai), alternate.
    row += 1
    col = 3
    for country, port, _b, _n in COLUMNS:
        ws.cell(row=row, column=col, value="Berat")
        ws.cell(row=row, column=col + 1, value="Nilai")
        col += 2

    # Data rows.
    header_row = row
    row += 1
    first_data_row = row

    for kode, produk, values in DATA:
        ws.cell(row=row, column=1, value=kode)
        ws.cell(row=row, column=2, value=produk)
        col = 3
        for country, port, _b, _n in COLUMNS:
            berat, nilai = values[f"{country}/{port}"]
            ws.cell(row=row, column=col, value=berat)
            ws.cell(row=row, column=col + 1, value=nilai)
            col += 2
        row += 1

    # A "Totals" row that the pipeline must drop during cleaning.
    ws.cell(row=row, column=1, value="TOTALS")
    ws.cell(row=row, column=2, value="TOTALS")
    col = 3
    for country, port, _b, _n in COLUMNS:
        ws.cell(row=row, column=col, value=9999)
        ws.cell(row=row, column=col + 1, value=9999)
        col += 2
    totals_row = row

    # Freeze the header so it is obvious when opened in Excel.
    ws.freeze_panes = f"{_cell(3)}{first_data_row}"

    # Optional: hue the header area lightly to distinguish it.
    from openpyxl.styles import PatternFill  # noqa: PLC0415
    fill = PatternFill("solid", fgColor="DDEBF7")
    for r in range(header_row - 2, header_row + 1):
        for cc in range(3, 3 + 2 * len(COLUMNS)):
            ws.cell(row=r, column=cc).fill = fill

    return wb


def main() -> None:
    out_dir = Path(__file__).resolve().parent / "sample_data"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "sample_matrix.xlsx"
    build_workbook().save(out_path)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()