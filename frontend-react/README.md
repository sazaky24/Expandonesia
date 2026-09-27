# FastWork Mobile — PWA (`frontend-react`)

Frontend **mobile-first** untuk backend FastAPI di `../backend`. Dua fitur utama:

| Tab | Fitur | Endpoint |
|-----|-------|----------|
| Translate | Terjemahkan legenda peta curah hujan (ID → EN) + ganti judul bulan/tahun | `POST /translate-map` |
| Excel | Unpivot Excel matriks menjadi tabel datar | `POST /transform` |
| Pengaturan | Alamat backend, pasang aplikasi, cache & versi | `GET /health` |

## Perintah

```bash
npm install
npm run dev       # dev server + hot reload (host 0.0.0.0 → bisa dibuka dari HP)
npm run build     # build produksi → dist/
npm run preview   # serve hasil build di http://<ip-lan>:4173
npm run lint      # oxlint
```

Dari root proyek gunakan `start-mobile.bat` (HTTP) atau `start-mobile-https.bat`
(HTTPS self-signed) — keduanya menyalakan backend, build, lalu serve sekaligus.

## Struktur `src/`

```
src/
  App.jsx                  shell mobile: TopBar, layar fitur, TabBar, Toast, SettingsSheet
  lib/api.js               resolusi alamat backend, health check, POST multipart → Blob
  lib/download.js          Web Share API + fallback unduh (penting untuk iOS Safari)
  lib/pwa.js               install prompt, status online, lifecycle service worker
  lib/format.js            formatBytes + daftar nama bulan
  components/              Card, StepCard, Primary/GhostButton, Pill, ProgressBar,
                           Notice, TopBar, TabBar, Toast, SettingsSheet
  features/translate/      TranslateMapTool — kamera/galeri, bulan & tahun, hasil
  features/excel/          ExcelUnpivotTool — pilih file, transformasi, simpan
```

## Cara kerja PWA

- `public/manifest.webmanifest` → nama, ikon 192/512 (+maskable), `start_url`,
  `display: standalone`, shortcut `/?tab=translate` dan `/?tab=excel`.
- `public/sw.js` → cache *app shell*. Navigasi: network-first dengan fallback
  `index.html`; aset statis: stale-while-revalidate; request ke origin lain
  (backend API) tidak diintervensi sama sekali.
- Bar “Versi baru aplikasi sudah siap dipakai” mengirim pesan `SKIP_WAITING`
  lalu memuat ulang halaman.
- Service worker hanya didaftarkan pada build produksi (`import.meta.env.DEV`
  dilewati) dan hanya aktif pada origin aman (HTTPS / `localhost`).

## Alamat backend

`lib/api.js` menentukan URL API dengan urutan: nilai di
`localStorage['fastwork.apiBaseUrl']` → jika kosong, mengikuti alamat halaman —
host privat (LAN) memakai port **8000**/**8443**, sedangkan host publik
(tunnel/hosting) memakai **`/api`** pada origin yang sama (diteruskan proxy Vite
ke `127.0.0.1:8000`). Ubah lewat **Pengaturan → Alamat backend**, uji dengan
tombol **Uji koneksi**.

## HTTPS opsional

`npm run preview` memakai HTTPS bila `FASTWORK_HTTPS=1` dan
`certs/dev-key.pem` + `certs/dev-cert.pem` tersedia (dibuat oleh
`scripts/make_dev_cert.py`, butuh `openssl`).

## Ikon aplikasi

Dihasilkan oleh `python scripts/generate_icons.py` (Pillow, tanpa aset eksternal)
ke `public/icons/`. Ubah geometri mark di dalam script lalu jalankan ulang.
