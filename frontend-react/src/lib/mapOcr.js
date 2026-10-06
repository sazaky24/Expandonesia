/**
 * OCR helper around tesseract.js (lazy-loaded).
 *
 * Only the bottom info panel is OCR'd, so the payload is one image strip — fast
 * even on a phone. The worker is created once and reused; the language data
 * (ind + eng, ~4 MB total) is fetched from the jsDelivr CDN the first time and
 * then cached (tesseract.js keeps it in IndexedDB, and the service worker keeps
 * the engine files), so later runs — and offline runs — need no download.
 *
 * Advanced/offline setups can point at their own copies with:
 *   localStorage['expandonesia.ocrLangPath']  e.g. './tesseract/lang'
 *   localStorage['expandonesia.ocrCorePath']  e.g. './tesseract/core'
 *   localStorage['expandonesia.ocrWorkerPath'] e.g. './tesseract/worker.min.js'
 */

export const OCR_LANG = 'ind+eng'

const STORAGE = {
  lang: 'expandonesia.ocrLangPath',
  core: 'expandonesia.ocrCorePath',
  worker: 'expandonesia.ocrWorkerPath',
}

function readOption(key) {
  try {
    return String(window.localStorage.getItem(key) || '').trim() || undefined
  } catch {
    return undefined
  }
}

export function writeOption(key, value) {
  try {
    if (value) window.localStorage.setItem(STORAGE[key], String(value))
    else window.localStorage.removeItem(STORAGE[key])
  } catch {
    /* storage disabled — options simply stay default */
  }
}

export const OCR_OPTION_KEYS = STORAGE

const isBrowser = () => typeof window !== 'undefined' && typeof Worker !== 'undefined'

export function buildWorkerPathOptions({ worker, core, lang } = {}) {
  const options = {}
  const paths = { workerPath: worker, corePath: core, langPath: lang }
  for (const [key, path] of Object.entries(paths)) {
    const value = typeof path === 'string' ? path.trim() : ''
    if (value && value !== 'undefined' && value !== 'null') options[key] = value
  }
  return options
}

let workerPromise = null
let workerLang = ''

function loadTesseract() {
  return import('tesseract.js')
}

async function getWorker(lang, onProgress) {
  if (workerPromise && workerLang === lang) return workerPromise
  if (workerPromise) {
    const previous = workerPromise
    workerPromise = null
    previous.then((worker) => worker.terminate()).catch(() => undefined)
  }
  workerLang = lang
  workerPromise = (async () => {
    const { createWorker, OEM } = await loadTesseract()
    const options = {}
    // tesseract.js requires `logger` to be a function — only pass it when used.
    if (onProgress) {
      options.logger = (message) => {
        if (message && typeof message.progress === 'number') onProgress(message)
      }
    }
    if (isBrowser()) {
      // Same-origin vendored copies win when configured; otherwise the CDN.
      Object.assign(
        options,
        buildWorkerPathOptions({
          worker: readOption('worker'),
          core: readOption('core'),
          lang: readOption('lang'),
        }),
      )
    }
    const worker = await createWorker(lang, OEM.LSTM_ONLY, options)
    return worker
  })()
  try {
    return await workerPromise
  } catch (error) {
    workerPromise = null
    workerLang = ''
    throw error
  }
}

/** Flatten tesseract blocks → lines with word boxes. */
export function normalizeLines(data) {
  const lines = []
  for (const block of data?.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const words = (line.words || [])
          .filter((w) => w && w.bbox && String(w.text || '').trim())
          .map((w) => ({
            text: String(w.text).trim(),
            bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
            confidence: w.confidence ?? 0,
          }))
        if (!words.length) continue
        lines.push({
          text: String(line.text || '').trim(),
          bbox: line.bbox,
          confidence: line.confidence ?? 0,
          words,
        })
      }
    }
  }
  return lines
}

/**
 * OCR one image (canvas / Blob / Buffer) and return lines with word boxes.
 * Boxes are relative to the supplied image.
 */
export async function recognizePanel(imageLike, { lang = OCR_LANG, onProgress } = {}) {
  const worker = await getWorker(lang, onProgress)
  // Node tests hand over a @napi-rs/canvas Canvas; Tesseract needs a buffer there.
  const input =
    imageLike && typeof imageLike.encode === 'function'
      ? await imageLike.encode('png')
      : imageLike
  const result = await worker.recognize(input, {}, { blocks: true, text: true })
  return { lines: normalizeLines(result.data), confidence: result.data?.confidence ?? 0 }
}

export async function disposeOcr() {
  if (!workerPromise) return
  const pending = workerPromise
  workerPromise = null
  workerLang = ''
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    /* already gone */
  }
}