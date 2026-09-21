# Excel Matrix Unpivoter

Aplikasi stateless untuk mengubah file Excel cross-tabulated (pivot) menjadi tabel relasional datar (flat table).

## Arsitektur

```
┌─────────────────┐     HTTP POST      ┌──────────────────┐
│   Frontend      │ ──────────────────▶ │    Backend       │
│   (Streamlit)   │ ◀────────────────── │   (FastAPI)      │
│   Port 8501     │   .xlsx response    │   Port 8000      │
└─────────────────┘                     └──────────────────┘
```

- **Backend**: FastAPI + pandas + openpyxl — transformasi sepenuhnya di memori
- **Frontend**: Streamlit — upload file, panggil API, download hasil
- **Docker Compose**: Menjalankan kedua layanan di jaringan `excel-net`

## Format Input yang Didukung

### A) Format Coffee import/export real (utama)

Workbook Coffee memiliki dua matriks mentah (sheet) yang masing-masing:

- **Sheet `Weight Imp`** atau **`Weight Exp`** → **Berat**
- **Sheet `Value Import`** atau **`Value Ex`** → **Nilai**

Matriksa ima isteji layout:

| Baris | Kolom A | Kolom B+ |
|-------|---------|----------|
| 0     | (kosong) | **Negara** (merged cells → `ffill()`) |
| 1     | (kosong) | **Pelabuhan** |
| 2+    | `[kodice HS] Deskripsion` | Nilai numerik per (Negara, Pelabuhan) |

Kedua matriks (Berat + Nilai) di-unpivot dan digabung berdasarkan
`(Kode, Produk, Negara, Pelabuhan)` sehingga menghasilkan format yang sama
dengan sheet `wv`. Sheet `w` dan `v` adalah referensi pemetaan; header negara
dan pelabuhan pada matriks sudah cukup untuk transformasi, termasuk saat
negara disimpan sebagai merged cell.

### B) Format generiku (sintetiu)

| Baris | Kolom A/B | Kolom C+ |
|-------|-----------|----------|
| 0     | (kosong) | **Negara** (`ffill()`) |
| 1     | (kosong) | **Pelabuhan** |
| 2*    | (kosong) | **Berat / Nilai** (opsional) |
| 3+    | **Kode** | **Produk** | Nilai numerik |

*Baris 2 opsional — jika tidak ada, seluruh nilai dianggap sebagai **Berat**.

## Format Output

Tabel datar dengan kolom: `Kode`, `Produk`, `Negara`, `Pelabuhan`, `Berat`, `Nilai`

Baris "Totals" / "Total" / NaN otomatis dibuang.

## Menjalankan dengan Docker (Direkomendasikan)

```bash
docker-compose up --build
```

Akses:
- Frontend: http://localhost:8501
- Backend health: http://localhost:8000/health

## Menjalankan Secara Lokal

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend (terminal terpisah):**
```bash
cd frontend
pip install -r requirements.txt
streamlit run app.py
```

## Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/health` | Cek kesehatan service |
| POST | `/transform` | Upload `.xlsx`, download hasil transformasi |

**Contoh curl:**
```bash
curl -X POST http://localhost:8000/transform \
  -F "file=@sample.xlsx" \
  --output transformed.xlsx
```

## Testing

```bash
# Generate sample file
python make_sample.py

# Test pipeline end-to-end
python test_transform.py

# Test HTTP layer
python test_api.py
```

## Detail Teknis Transformasi

1. **Baca workbook** dengan `header=None` (pandas + openpyxl)
2. **Bangun MultiIndex kolom** dari baris header:
   - Baris 0: Negara → forward-fill untuk merged cells
   - Baris 1: Pelabuhan → forward-fill
   - Baris 2 (opsional): Jenis ukuran (Berat/Nilai)
3. **Melt (unpivot)** kolom nilai ke long form dengan `stack()`
4. **Pivot** Berat & Nilai jadi kolom terpisah
5. **Bersihkan**: hapus baris "Totals"/NaN, baris di mana kedua ukuran kosong
6. **Serialisasi** ke `.xlsx` di memori (`io.BytesIO`) → stream response

Tidak ada file yang pernah ditulis ke disk — sepenuhnya stateless.

## Dependensi Utama

| Package | Versi | Digunakan Di |
|---------|-------|--------------|
| fastapi | 0.115.6 | Backend |
| uvicorn | 0.34.0 | Backend server |
| pandas | 2.2.3 | Transformasi data |
| openpyxl | 3.1.5 | Baca/tulis Excel |
| streamlit | 1.41.1 | Frontend |
| requests | 2.32.3 | HTTP client frontend |

## Lisensi

Internal project — bebas digunakan dan dimodifikasi.