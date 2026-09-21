import io
import re
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

from map_translator import remaster_map

app = FastAPI(title="FastWork API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@app.get("/health")
def health() -> dict:
    """Liveness check usato dal frontend per sapere se il backend e acceso."""
    return {"status": "ok", "service": "excel-unpivoter"}


def extract_matrix(df: pd.DataFrame, value_name: str) -> pd.DataFrame:
    """Mengurai matriks dengan header Negara (baris 0) dan Pelabuhan (baris 1)"""
    # Ambil baris 0 (Negara) dan lakukan Forward Fill untuk membetulkan merged cell
    negara = df.iloc[0, 1:].ffill().astype(str).str.strip()
    # Ambil baris 1 (Pelabuhan)
    pelabuhan = df.iloc[1, 1:].astype(str).str.strip()

    # Gabungkan menjadi MultiIndex Header
    cols = pd.MultiIndex.from_arrays([negara, pelabuhan], names=['Negara', 'Pelabuhan'])

    # Pisahkan bagian angka (Value)
    body = df.iloc[2:, 1:].copy()
    body.columns = cols

    # Ambil label (Kode dan Nama Produk di Kolom 0)
    labels = df.iloc[2:, 0].astype(str).str.strip()

    # Buang baris yang merupakan 'Totals' atau kosong
    valid_rows = ~labels.str.lower().isin(['totals', 'nan', '', 'none'])
    body = body[valid_rows]
    labels = labels[valid_rows]

    # Unpivot (melt) kolom (Negara, Pelabuhan) menjadi baris.
    # stack() apre il MultiIndex in due kolom (Negara, Pelabuhan);
    # l'indice baris che rimane ci permette di riagganciare 'label'.
    long_df = body.stack(level=['Negara', 'Pelabuhan']).rename(value_name).reset_index(level=['Negara', 'Pelabuhan'])
    long_df['label'] = labels

    # EKSTRAKSI KODE SH: Pastikan angka 0 di depan tidak hilang (Regex sebagai String)
    long_df[['Kode', 'Produk']] = long_df['label'].str.extract(r'\[\s*(.*?)\s*\]\s*(.*)')
    long_df['Kode'] = long_df['Kode'].fillna(long_df['label'])  # Jika format tanpa kurung siku
    long_df['Produk'] = long_df['Produk'].fillna('')
    long_df = long_df.drop(columns=['label'])

    # Ubah nilai ke numerik, yang bukan angka akan jadi NaN
    long_df[value_name] = pd.to_numeric(long_df[value_name], errors='coerce')

    # Hapus baris yang nilainya kosong (NaN) agar data bersih
    long_df = long_df.dropna(subset=[value_name])

    # Buang kolom Totals sisa dari margin Excel
    long_df = long_df[~long_df['Negara'].str.lower().str.contains('totals', na=False)]
    long_df = long_df[~long_df['Pelabuhan'].str.lower().str.contains('totals', na=False)]

    return long_df


def process_coffee_workbook(data: bytes) -> bytes:
    """Membaca workbook di RAM, mengambil sheet 1 (Berat) & sheet 2 (Nilai), lalu digabung"""
    buf = io.BytesIO(data)
    xl = pd.ExcelFile(buf, engine="openpyxl")

    if len(xl.sheet_names) < 2:
        raise ValueError("File harus memiliki minimal 2 sheet (Weight dan Value).")

    # Ambil Sheet ke-1 dan ke-2 LOKASI ABSOLUT (Ignorando la denominazione)
    w_df = xl.parse(xl.sheet_names[0], header=None)
    v_df = xl.parse(xl.sheet_names[1], header=None)

    # Lakukan Unpivot
    w_long = extract_matrix(w_df, 'Berat')
    v_long = extract_matrix(v_df, 'Nilai')

    # Gabungkan (Merge) data Berat dan Nilai berdasarkan 4 pilar kunci
    merged = pd.merge(w_long, v_long, on=['Kode', 'Produk', 'Negara', 'Pelabuhan'], how='outer')

    # Rapikan urutan dan bersihkan sisa nilai yang tidak sinkron
    merged = merged[['Kode', 'Produk', 'Negara', 'Pelabuhan', 'Berat', 'Nilai']]

    # Kolom berat dalam ton (1 ton = 1000 kg), diletakkan di sebelah Nilai
    merged['Berat (Ton)'] = merged['Berat'] / 1000.0
    merged = merged[['Kode', 'Produk', 'Negara', 'Pelabuhan', 'Berat', 'Nilai', 'Berat (Ton)']]

    merged = merged.sort_values(by=['Kode', 'Negara', 'Pelabuhan']).reset_index(drop=True)

    # Simpan kembali ke dalam memory sebagai file Excel baru
    out_buf = io.BytesIO()
    merged.to_excel(out_buf, index=False, engine="openpyxl")
    out_buf.seek(0)

    return out_buf.getvalue()


@app.post("/transform")
async def transform(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=415, detail="Format file harus .xlsx")

    data = await file.read()
    try:
        output_bytes = process_coffee_workbook(data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal memproses data: {exc}")

    return Response(
        content=output_bytes,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": 'attachment; filename="data_matang.xlsx"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@app.post("/translate-map")
async def translate_map(
    file: UploadFile = File(...),
    target_month: str = Form(...),
    target_year: str = Form(...),
):
    """Terjemahkan legenda peta cuaca & ubah bulan/tahun (all in-memory)."""
    if not file.filename.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
        raise HTTPException(status_code=415, detail="Format file harus gambar (jpg/png/bmp/webp)")

    month, year = target_month.strip(), target_year.strip()
    if not month or not year:
        raise HTTPException(status_code=422, detail="target_month dan target_year wajib diisi")
    if not year.isdigit() or not (1900 <= int(year) <= 2100):
        raise HTTPException(status_code=422, detail="target_year harus berupa angka tahun yang valid")

    data = await file.read()
    try:
        output_bytes = remaster_map(data, month, year)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal memproses gambar: {exc}")

    return Response(
        content=output_bytes,
        media_type="image/jpeg",
        headers={
            "Content-Disposition": 'attachment; filename="translated_map.jpg"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)