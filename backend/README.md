---
title: FastWork API
emoji: 🔄
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8000
pinned: false
---

# FastWork API (backend)

Backend FastAPI untuk **Excel Matrix Unpivoter** dan **Weather Map Translator** (stateless, semua proses in-memory).

Endpoint: `GET /`, `GET /health`, `GET /docs`, `POST /transform`, `POST /translate-map`

## Deploy ke Hugging Face Spaces (gratis, tanpa kartu kredit)

Folder ini bisa di-deploy sebagai **Docker Space** — 100% gratis, tidak perlu kartu kredit
(CPU basic: 2 vCPU / 16 GB RAM; Space tidur setelah 48 jam idle).

Langkah:

1. Buat Space baru di huggingface.co → SDK: **Docker** → template **Blank**.
2. Clone repo Space, lalu salin **5 file** dari folder `backend/` monorepo ini ke root
   repo Space: `README.md` (file ini — jangan ubah bagian metadata di atas),
   `Dockerfile`, `main.py`, `map_translator.py`, `requirements.txt`.
3. Push → HF membangun otomatis. URL: `https://{username}-{nama-space}.hf.space`
4. Opsional: Settings → **Variables and secrets** → tambah `CORS_ORIGINS` = URL Netlify frontend.

Catatan: `app_port: 8000` di metadata cocok dengan CMD Dockerfile (`--port ${PORT:-8000}`).
