# FastWork Desktop - Frontend

Frontend React/Vite aplikasi desktop Windows. Tampilan dan pemrosesan fitur Excel serta penerjemah peta dibungkus dengan Electron.

## Build dan jalankan desktop

```powershell
npm ci
npm run desktop:run
```

Untuk membuat installer Windows x64:

```powershell
npm run desktop:installer
```

Installer NSIS tersedia di `release/`. Panduan penggunaan, format file, serta distribusi ada di [README proyek](../README.md).

## Pemeriksaan

```powershell
npm run lint
npm test
```
