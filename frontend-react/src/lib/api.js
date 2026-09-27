/**
 * Backend connection helpers for FastWork Mobile.
 *
 * The phone is not the machine running FastAPI, so the API base URL can not be
 * hard-coded to localhost like the desktop build did. Resolution order:
 *
 *   1. the URL the user saved in Pengaturan (localStorage), else
 *   2. a value derived from the page's own address:
 *      - private/LAN host  → same host with the API port appended
 *        (http://<ip-pc>:4173 → http://<ip-pc>:8000, https → :8443)
 *      - anything else (public tunnel / hosting) → `/api` on the same origin,
 *        which Vite forwards to the local FastAPI (see vite.config.js)
 *
 * Case 2's second branch is what makes start-mobile-tunnel.bat work: one HTTPS
 * tunnel serves both the app and the API, so a phone on another network (or on
 * mobile data) can use the app with no CORS and no mixed-content problems.
 */

import axios from 'axios'

const STORAGE_KEY = 'fastwork.apiBaseUrl'
const HTTP_PORT = 8000
const HTTPS_PORT = 8443

/** Same-origin prefix that Vite proxies to the local backend. */
export const PROXY_API_BASE = '/api'

// Private/LAN addresses, plus Tailscale's CGNAT range (100.64.0.0/10): on the
// same tailnet the phone reaches the PC at 100.x.y.z.
const PRIVATE_HOST_PATTERN =
  /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|::1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|[^.]+\.local)$/i

export function isPrivateHost(hostname) {
  return PRIVATE_HOST_PATTERN.test(String(hostname ?? ''))
}

export function normalizeBaseUrl(value) {
  return String(value ?? '')
    .trim()
    .replace(/\/+$/, '')
}

export function autoApiBaseUrl() {
  if (typeof window === 'undefined') return `http://localhost:${HTTP_PORT}`
  const { protocol, hostname } = window.location
  if (!hostname) return `http://localhost:${HTTP_PORT}` // opened from file:// (e.g. inside Capacitor)

  // Public tunnel / hosting: stay on this origin, let the proxy reach FastAPI.
  if (!isPrivateHost(hostname)) return PROXY_API_BASE

  const secure = protocol === 'https:'
  return `${secure ? 'https' : 'http'}://${hostname}:${secure ? HTTPS_PORT : HTTP_PORT}`
}

/** Readable label for the settings screen (the proxy base is not a real host). */
export function describeApiBase(baseUrl) {
  const value = normalizeBaseUrl(baseUrl)
  if (value === PROXY_API_BASE) return `${PROXY_API_BASE} — satu origin, diteruskan proxy`
  if (value.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${value}`
  }
  return value
}

/** Absolute form used inside error messages. */
function describeTarget(baseUrl) {
  const value = normalizeBaseUrl(baseUrl)
  if (value.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${value}`
  }
  return value
}

export function readStoredApiBaseUrl() {
  try {
    return normalizeBaseUrl(window.localStorage.getItem(STORAGE_KEY) || '')
  } catch {
    return ''
  }
}

export function storeApiBaseUrl(value) {
  const clean = normalizeBaseUrl(value)
  try {
    if (clean) window.localStorage.setItem(STORAGE_KEY, clean)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private mode / storage disabled — the auto URL still works */
  }
  return clean
}

export function resolveApiBaseUrl() {
  return readStoredApiBaseUrl() || autoApiBaseUrl()
}

/** Turn an axios failure into a sentence a non-technical user can act on. */
async function readErrorDetail(payload) {
  let data = payload

  if (typeof Blob !== 'undefined' && payload instanceof Blob) {
    let raw = ''
    try {
      raw = await payload.text()
    } catch {
      return ''
    }
    try {
      data = JSON.parse(raw)
    } catch {
      return raw.slice(0, 300)
    }
  }

  if (typeof data === 'string') return data.slice(0, 300)

  const detail = data?.detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || '')
      .filter(Boolean)
      .join('; ')
  }
  if (typeof detail === 'string') return detail
  return ''
}

export async function describeError(error, baseUrl) {
  const response = error?.response
  const target = describeTarget(baseUrl)

  if (response) {
    if (response.status === 413) return 'File terlalu besar untuk dikirim ke backend.'
    const detail = await readErrorDetail(response.data)
    if (detail) return `Backend menolak permintaan (HTTP ${response.status}): ${detail}`
    if ([500, 502, 503, 504].includes(response.status)) {
      return `Backend tidak merespons (HTTP ${response.status}) di ${target}. Pastikan jendela "FastWork Backend" masih hidup.`
    }
    if (response.status === 404) {
      return `Endpoint API tidak ditemukan di ${target}. Kalau aplikasi dibuka lewat tunnel, jalankan dengan "npm run preview"/"npm run dev" (bukan static server biasa), atau isi alamat backend manual di Pengaturan.`
    }
    return `Backend mengembalikan error HTTP ${response.status}.`
  }

  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return `Permintaan ke ${target} melebihi batas waktu. Coba lagi.`
  }

  if (error?.request) {
    return `Tidak bisa menghubungi backend di ${target}. Pastikan FastAPI sudah jalan (dan, untuk akses LAN, HP ada di jaringan yang sama dengan PC).`
  }

  return error?.message || 'Terjadi kesalahan yang tidak diketahui.'
}

/** POST a multipart form and return the binary response as a Blob. */
export async function postForm(path, formData, { onUploadProgress } = {}) {
  const baseUrl = resolveApiBaseUrl()

  try {
    const response = await axios.post(`${baseUrl}${path}`, formData, {
      responseType: 'blob',
      timeout: 0, // big workbooks / images may take a while on a phone network
      onUploadProgress,
    })
    return response.data
  } catch (error) {
    throw new Error(await describeError(error, baseUrl))
  }
}

/** Liveness probe used by the connection badge in Pengaturan. */
export async function checkHealth(baseUrl) {
  const target = normalizeBaseUrl(baseUrl) || autoApiBaseUrl()

  try {
    const response = await axios.get(`${target}/health`, { timeout: 6000 })
    const ok = response.status === 200 && response.data?.status === 'ok'
    return {
      ok,
      message: ok
        ? `Backend aktif di ${describeTarget(target)}${response.data?.service ? ` (${response.data.service})` : ''}.`
        : `Backend di ${describeTarget(target)} menjawab, tetapi status health bukan "ok".`,
    }
  } catch (error) {
    return { ok: false, message: await describeError(error, target) }
  }
}
