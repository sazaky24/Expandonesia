FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Bold truetype fonts (DejaVuSans-Bold) used by the map translator fallbacks.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better Docker layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application source.
COPY main.py map_translator.py ./

EXPOSE 8000

# Stateless: uvicorn runs the FastAPI app; no volumes / persisted state.
# Render (Docker runtime) meng-inject $PORT; fallback ke 8000 untuk dev lokal.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]