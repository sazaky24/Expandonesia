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

## Deploy ke Produksi

Project ini adalah **monorepo**. Frontend web (Vite + React) di-deploy ke **Netlify**,
backend FastAPI di-deploy ke **Render** — jangan buat `requirements.txt`/`main.py` baru di root repo.

### Backend → Render

Paling mudah via Blueprint (file `render.yaml` sudah disiapkan):

1. Push repo ini ke GitHub, lalu di Render: **New + → Blueprint** → pilih repo.
   Blueprint sudah mengatur `rootDir: backend`, Runtime **Docker** (font DejaVu untuk
   `/translate-map` ikut ter-install via Dockerfile), dan health check `/health`.

Jika membuat Web Service manual, wajib mengatur:

| Setting | Nilai | Alasan |
|---------|-------|--------|
| Root Directory | `backend` | Monorepo — kode ada di subfolder, bukan root |
| Runtime | **Docker** | Native Python di Render tidak punya font DejaVu (peta jadi jelek) |
| Build Command | `pip install -r requirements.txt` | — |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` | `$PORT` di-inject Render |
| Env `CORS_ORIGINS` | `https://<site>.netlify.app` | Batasi CORS ke domain frontend |

Versi Python native (jika tidak pakai Docker) dipin via `backend/.python-version`.

**Alternatif gratis tanpa kartu kredit:** jika Render meminta payment method (Blueprint
memang mewajibkannya), gunakan **Hugging Face Spaces (Docker)** — panduan lengkap ada di
`backend/README.md`. Koyeb dan Fly.io saat ini juga mewajibkan kartu; Railway hanya kredit
$5 sekali pakai.

Verifikasi: buka `https://<service>.onrender.com/` (JSON status) dan `/docs` (Swagger UI).
Catatan free tier: service tidur setelah ±15 menit idle; request pertama butuh 30–60 detik.

### Frontend → Netlify

1. `netlify.toml` di root sudah mengatur: base `frontend-react`, build `npm run build`, publish `dist`.
2. Set env var di Netlify (**Site configuration → Environment variables**):
   - `VITE_API_URL` = URL backend Render (mis. `https://fastwork-backend.onrender.com`)
3. Baru **Trigger deploy** — Vite membaca env var saat *build*, bukan saat runtime.

## Lisensi

Internal project — bebas digunakan dan dimodifikasi.