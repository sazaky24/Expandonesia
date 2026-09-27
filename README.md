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

## Aplikasi Mobile (PWA)

`frontend-react/` sekarang berupa **PWA mobile-first** yang membungkus kedua fitur
(Translate Peta + Data Excel) dalam satu aplikasi yang bisa dipasang di HP.

```
┌─────────────────────┐   HTTP/HTTPS   ┌───────────────────┐
│  HP — PWA (:4173)   │ ─────────────▶ │  Backend FastAPI  │
│  bottom tab, kamera │ ◀───────────── │  (:8000 / :8443)  │
└─────────────────────┘  JPEG / XLSX   └───────────────────┘
```

### Yang membedakan versi mobile

| Frontend desktop (lama) | PWA mobile (sekarang) |
|-------------------------|-----------------------|
| Tab di header | Bottom navigation: **Translate**, **Excel**, **Pengaturan** |
| Input file | Tombol **Kamera** (`capture="environment"`) dan **Galeri** |
| `API_URL` hard-code `localhost:8000` | Alamat backend dihitung otomatis dari host halaman, bisa diubah di Pengaturan |
| Preview before/after berdampingan | Tab **Asli / Hasil** (hemat layar HP) |
| Tautan `<a download>` | **Web Share API** (“Simpan ke Files/Galeri”), fallback unduh |
| — | Manifest + service worker: bisa di-*install* dan dibuka offline |

### Menjalankan (paling cepat)

```bat
start-mobile.bat
```

Skrip ini: 1) mendeteksi IP LAN PC, 2) menyalakan FastAPI di `0.0.0.0:8000`,
3) `npm install` (sekali saja) lalu `npm run build`, 4) menyajikan PWA di
`0.0.0.0:4173`. Lalu buka `http://<ip-lan-pc>:4173` di browser HP.

```bat
start-mobile.bat --check
```

mode `--check` hanya menampilkan diagnosa (IP LAN, Python, npm) tanpa
menyalakan server.

### Alamat backend dari HP

HP bukan mesin yang menjalankan FastAPI, jadi alamat API dicari otomatis:

| Halaman dibuka dari | Backend yang dipakai |
|---------------------|----------------------|
| `http://<ip-pc>:4173` | `http://<ip-pc>:8000` |
| `https://<ip-pc>:4173` | `https://<ip-pc>:8443` |
| `http://localhost:5173` | `http://localhost:8000` |

Alamat bisa dipaksa lewat **Pengaturan → Alamat backend** (disimpan di
`localStorage` HP). Tombol **Uji koneksi** memanggil `GET /health`.

### Kalau PC dan HP berbeda jaringan

Kasus PC memakai Ethernet/router kantor sedangkan HP memakai data seluler atau
Wi-Fi lain. Ada beberapa cara, urut dari paling praktis:

**1. Tunnel publik — paling praktis, langsung dapat HTTPS asli**

```bat
winget install --id Cloudflare.cloudflared
start-mobile-tunnel.bat
```

Skrip menyalakan backend + PWA, lalu mencetak alamat publik seperti
`https://kata-kata-acak.trycloudflare.com`. Buka alamat itu di HP, **boleh dari
data seluler**. Satu tunnel melayani aplikasi *dan* API: aplikasi memanggil
`/api/*` pada origin yang sama dan Vite meneruskannya ke FastAPI lokal
(`vite.config.js`), sehingga tidak ada CORS maupun mixed-content. Karena
origin-nya HTTPS resmi, tombol **Pasang aplikasi** dan mode offline langsung
aktif **tanpa** peringatan sertifikat.

Alternatif ngrok: `start-mobile-tunnel.bat` otomatis memakainya bila
cloudflared tidak ada — jalankan dulu `ngrok config add-authtoken <TOKEN>`.

**2. Hotspot HP / USB tethering — tanpa alat tambahan**

1. Nyalakan **Hotspot** (atau **USB tethering**) di HP, lalu sambungkan PC ke
   hotspot tersebut.
2. Jalankan `start-mobile.bat`; skrip mencetak **semua alamat IPv4 PC** beserta
   nama adapter. Pilih IP pada adapter hotspot/tethering (biasanya `192.168.43.x`
   atau `192.168.42.x`), **bukan** IP Ethernet.
3. Buka `http://<ip-tethering-pc>:4173` di browser HP.

**3. Windows Mobile Hotspot** (bila PC punya adapter Wi-Fi) — internet dari
Ethernet dibagi ke Wi-Fi: *Settings → Network & internet → Mobile hotspot* →
nyalakan → HP join ke hotspot PC → buka `http://192.168.137.1:4173`.

**4. Backend dijalankan di HP (Termux)** — tanpa PC sama sekali, tetapi perlu
penyiapan manual (Python + dependensi di Termux, lalu menyajikan
`frontend-react/dist` dari HP). Bilang saja kalau mau saya siapkan skripnya.

### Mode HTTPS (opsional, untuk install & offline)

Tombol *Pasang aplikasi* dan service worker hanya aktif pada **origin aman**:
HTTPS atau `localhost`. Untuk mencobanya dari HP:

```bat
start-mobile-https.bat
```

Sertifikat self-signed dibuat otomatis oleh
`frontend-react/scripts/make_dev_cert.py` (butuh `openssl` — sudah tersedia di Git
for Windows) dan mencakup semua IP LAN PC. HP akan menampilkan peringatan
sertifikat sekali; pilih *Advanced → Proceed*. Kalau ingin tanpa peringatan,
pakai tunnel (`cloudflared`/`ngrok`) atau hosting HTTPS sungguhan.

### Dev server (hot reload)

```bash
cd frontend-react
npm install
npm run dev          # buka http://localhost:5173
```

### Regenerasi ikon PWA

```bash
python frontend-react/scripts/generate_icons.py
```

### Catatan dependensi backend

`start-mobile*.bat` memasang dependensi backend ke `.venv\` (kalau ada) atau
Python di PATH. Karena `backend/requirements.txt` mem-pin `pandas==2.2.3` yang
belum punya wheel untuk Python 3.14, skrip otomatis mencoba instalasi tanpa pin
versi bila instalasi pertama gagal. Untuk pengalaman paling mulus gunakan
Python 3.12/3.13.

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

## Struktur Proyek

```
backend/                      FastAPI: /health, /transform, /translate-map
  map_translator.py           logika Pillow (hapus legenda Indonesia → tulis Inggris)
frontend/                     frontend Streamlit (versi lama, tetap berfungsi)
frontend-react/               PWA mobile-first (React 19 + Vite 8 + Tailwind 3)
  public/manifest.webmanifest manifest PWA
  public/sw.js                service worker (cache app shell)
  public/icons/               ikon PWA hasil generate
  scripts/generate_icons.py   pembuat ikon (Pillow)
  scripts/make_dev_cert.py    sertifikat HTTPS dev (openssl)
  src/lib/api.js              resolusi alamat backend + pemanggilan API
  src/lib/download.js         Web Share API / fallback unduh
  src/lib/pwa.js              install prompt, status online, service worker
  src/components/             TopBar, TabBar, Toast, SettingsSheet, UI primitives
  src/features/translate/     fitur Translate Peta
  src/features/excel/         fitur Data Excel
desktop/                      versi Tkinter offline (desktop/app.py)
start-mobile.bat              launcher backend + PWA (HTTP)
start-mobile-https.bat        launcher backend + PWA (HTTPS self-signed)
```

## Endpoint API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/health` | Cek kesehatan service |
| POST | `/transform` | Upload `.xlsx` → unduh tabel datar hasil unpivot |
| POST | `/translate-map` | Upload gambar peta + `target_month` & `target_year` → unduh JPEG hasil translate legenda |

**Contoh curl:**
```bash
curl -X POST http://localhost:8000/transform \
  -F "file=@sample.xlsx" \
  --output transformed.xlsx

curl -X POST http://localhost:8000/translate-map \
  -F "file=@peta.webp" \
  -F "target_month=JANUARY" \
  -F "target_year=2026" \
  --output translated_map.jpg
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
| pillow | 11.1.0 | Translate peta (Pillow) |
| python-multipart | 0.0.20 | Upload multipart FastAPI |
| streamlit | 1.41.1 | Frontend lama |
| requests | 2.32.3 | HTTP client frontend lama |
| react / react-dom | 19.2.8 | PWA mobile |
| vite | 8.3.0 | Build & serve PWA |
| tailwindcss | 3.4.1 | Styling PWA |
| axios | 1.20.0 | HTTP client PWA |
| lucide-react | 1.47.0 | Ikon PWA |

## Lisensi

Internal project — bebas digunakan dan dimodifikasi.