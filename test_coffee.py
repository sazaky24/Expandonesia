"""Validate the transformer against the REAL Coffee import/export workbooks,
comparing the unpivoted output with each workbook's own 'wv' reference sheet."""
import io
from pathlib import Path

import pandas as pd

from backend.main import unpivot_matrix, OUTPUT_COLUMNS

FILES = ["Coffee export 202606.xlsx", "Coffee import 202606.xlsx"]


def main() -> None:
    for fname in FILES:
        path = Path("sample_data") / fname
        data = path.read_bytes()

        out = pd.read_excel(io.BytesIO(unpivot_matrix(data)))
        print(f"\n=== {fname}: produced {len(out)} rows, {out.shape[1]} cols ===")
        assert list(out.columns)[:6] == OUTPUT_COLUMNS, list(out.columns)
        print(out.head(8).to_string(index=False))

        # Reference 'wv' sheet embedded in the same workbook.
        ref = pd.read_excel(io.BytesIO(data), sheet_name="wv")
        ref.columns = [str(c).strip() for c in ref.columns]
        ref = ref.dropna(subset=["Kode", "Produk", "Negara", "Pelabuhan"])
        for frame in (ref, out):
            # Excel may expose the same HS code as 9011120 or 9011120.0.
            frame["Kode"] = pd.to_numeric(frame["Kode"], errors="coerce").astype("Int64").astype(str)
            for column in ("Produk", "Negara", "Pelabuhan"):
                frame[column] = frame[column].astype(str).str.strip()

        key_columns = ["Kode", "Produk", "Negara", "Pelabuhan"]
        ref_rows = ref.set_index(key_columns)[["Berat", "Nilai"]].sort_index()
        out_rows = out.set_index(key_columns)[["Berat", "Nilai"]].sort_index()
        pd.testing.assert_frame_equal(out_rows, ref_rows, check_dtype=False, check_exact=False, atol=1e-9)

        # Compare Berat & Nilai totals per (negara, pelabuhan) against reference.
        ref_agg = ref.groupby(["Negara", "Pelabuhan"])[["Berat", "Nilai"]].sum(numeric_only=True)
        out_agg = out.groupby(["Negara", "Pelabuhan"])[["Berat", "Nilai"]].sum(numeric_only=True)

        common = ref_agg.index.intersection(out_agg.index)
        miss = ref_agg.index.difference(out_agg.index)
        print(f"  reference (negara,pelabuhan) pairs: {len(ref_agg)}; produced: {len(out_agg)}; "
              f"present in both: {len(common)}; missing from output: {len(miss)}")
        if len(miss):
            print("  MISSING pairs (sample):", list(miss)[:10])

        # numeric agreement on common pairs
        ber = out_agg["Berat"].reindex(common).fillna(0).sub(ref_agg["Berat"].reindex(common).fillna(0)).abs().max()
        nil = out_agg["Nilai"].reindex(common).fillna(0).sub(ref_agg["Nilai"].reindex(common).fillna(0)).abs().max()
        print(f"  max |diff| on common pairs -> Berat:{ber:.2f}  Nilai:{nil:.2f}")
        assert ber < 0.5 and nil < 0.5, (ber, nil)

    print("\nREAL FILE TESTS PASSED")


if __name__ == "__main__":
    main()