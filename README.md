# FastWork Mobile — Excel Unpivoter & Map Translator (PWA)

**100% client-side Progressive Web App** — runs entirely in the browser, no backend required. Deploy to GitHub Pages and use from any phone.

## Features

| Feature | Implementation | Works Offline |
|---------|----------------|---------------|
| **Excel Matrix → Flat Table** | ExcelJS (lazy-loaded) | ✅ Yes |
| **Weather Map Legend Translate** | Tesseract.js OCR + Canvas redraw | ✅ Yes (after first model download ~4MB) |

## Quick Start (GitHub Pages)

1. **Push to GitHub** — GitHub Actions (`.github/workflows/deploy.yml`) auto-builds and deploys `frontend-react/dist` to GitHub Pages on every push to `main`
2. **Open** `https://<username>.github.io/ProjekAyah/` on your phone
3. **Install** via browser menu → "Add to Home Screen" / "Install App"

## Local Development

```bash
cd frontend-react
npm install
npm run dev          # http://localhost:5173
npm run build        # output to dist/
npm run preview      # preview production build at http://localhost:4173
```

## Windows Desktop App

The React app can also be packaged as a Windows installer using Electron:

```bash
cd frontend-react
npm install
npm run desktop:installer
```

The NSIS installer is written to `frontend-react/release/`. To build and open the
desktop version without creating an installer, use `npm run desktop:run`.

## Project Structure

```
.github/workflows/deploy.yml   # GitHub Pages auto-deploy
frontend-react/                # React 19 + Vite 8 + Tailwind 3 PWA
  src/
    features/
      excel/ExcelUnpivotTool.jsx      # Local Excel unpivot (ExcelJS)
      translate/TranslateMapTool.jsx  # Local map translate (Tesseract.js + Canvas)
    lib/
      localExcel.js        # ExcelJS-based unpivot logic
      localMap.js          # OCR + redraw pipeline
      mapOcr.js            # Tesseract.js wrapper
      mapPanel.js          # Panel detection (bottom info strip)
      mapEdits.js          # ID→EN vocab + edit planning
      api.js               # Smart API resolution (for optional backend)
      download.js          # Web Share API / fallback download
      pwa.js               # Install prompt, SW registration, online status
      vocabId.js           # Indonesian→English term mapping
    components/            # UI: TopBar, TabBar, Toast, SettingsSheet, primitives
  public/
    manifest.webmanifest   # PWA manifest
    sw.js                  # Service worker (cache app shell)
    icons/                 # PWA icons (generated via scripts/generate_icons.py)
```

## Supported Input Formats

### Excel (Coffee import/export format)
- Sheet 1: Weight matrix (Country row 0, Port row 1, HS codes in col A)
- Sheet 2: Value matrix (same layout)
- Merged cells in Country header row handled via forward-fill

### Weather Map (BMKG GSMaP)
- Precipitation analysis map with Indonesian legend panel at bottom
- Auto-detects panel location (works on 1280×912 and larger originals)
- Detects text in the panel and redraws its English translation over the original text positions
- Translates the title, legend labels, and detected month/year without requiring date input

## Output

- **Excel**: Flat table with columns `Kode`, `Produk`, `Negara`, `Pelabuhan`, `Berat`, `Nilai`, `Berat (Ton)`
- **Map**: JPEG with translated panel text, original map body untouched

## Optional Backend

The PWA includes smart API resolution (`src/lib/api.js`) for an optional FastAPI backend:
- Auto-detects LAN IP, tunnel URLs (cloudflared/ngrok), Tailscale
- Falls back to `/api` proxy on same origin (Vite proxies to local FastAPI)
- Backend endpoints: `/health`, `/transform`, `/translate-map`

To use backend: host FastAPI separately (Railway, Render, VPS, etc.) and set URL in **Pengaturan → Alamat backend**.

## Regenerate PWA Icons

```bash
python frontend-react/scripts/generate_icons.py
```

## License

Internal project — free to use and modify.