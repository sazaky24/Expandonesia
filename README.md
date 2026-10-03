# FastWork Desktop - Penerjemah Peta dan Pengolah Excel

FastWork Desktop adalah aplikasi Windows untuk menerjemahkan teks pada peta curah hujan dan mengubah data Excel matriks menjadi tabel datar. Kedua fitur diproses di perangkat pengguna melalui aplikasi desktop Electron.

## Fitur

- **Terjemahkan peta**: pilih gambar peta BMKG, deteksi teks panel, lalu simpan hasil terjemahan sebagai gambar.
- **Olah Excel**: ubah format Excel matriks menjadi tabel datar.
- **Pemrosesan lokal**: gambar dan file Excel diproses di aplikasi, tidak perlu backend.

### Format Excel

Fitur Excel mendukung format matriks berikut:

- Sheet pertama berisi matriks berat: baris negara dan pelabuhan di bagian atas, kode HS di kolom A.
- Sheet kedua berisi matriks nilai dengan susunan serupa.
- Sel gabungan pada baris negara ditangani dengan pengisian nilai ke kolom berikutnya.
- Hasil berupa tabel dengan kolom `Kode`, `Produk`, `Negara`, `Pelabuhan`, `Berat`, `Nilai`, dan `Berat (Ton)`.

### Peta cuaca

Fitur peta ditujukan untuk peta curah hujan BMKG GSMaP. Aplikasi mendeteksi panel legenda, menerjemahkan judul dan label yang dikenali, serta menyesuaikan ukuran teks agar tetap berada dalam batas panel. Bagian peta di luar panel dipertahankan.

Pada penggunaan OCR pertama kali, aplikasi mungkin memerlukan koneksi internet untuk mengunduh worker dan data bahasa. Setelah tersimpan di cache, data tersebut dapat digunakan kembali.

## Menjalankan aplikasi

Unduh installer Windows dari halaman [GitHub Releases](https://github.com/sazaky24/ProjekAyah/releases) dan jalankan file `.exe`. Installer menyediakan pilihan lokasi pemasangan serta shortcut Desktop dan Start Menu.

## Membangun installer Windows

Persyaratan: Windows x64, Node.js, dan npm.

```powershell
cd frontend-react
npm ci
npm run desktop:installer
```

Installer NSIS akan dibuat di `frontend-react/release/`. Untuk build dan menjalankan aplikasi tanpa membuat installer:

```powershell
npm run desktop:run
```

Workflow [release-desktop.yml](./.github/workflows/release-desktop.yml) dapat membangun installer dan menerbitkannya sebagai GitHub Release saat tag versi `v*` didorong ke GitHub.

## Pengembangan dan pengujian

Jalankan lint dan tes dari `frontend-react/`:

```powershell
npm run lint
npm test
```

Source aplikasi berada di `frontend-react/src/`; integrasi Electron ada di `frontend-react/electron/`.

## Lisensi

Proyek internal - bebas digunakan dan dimodifikasi.
