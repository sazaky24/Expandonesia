/**
 * Local (client-side) weather-map remaster / translator.
 *
 * Runs 100% in the phone browser (PWA) — no backend, no PC.
 *
 * Pipeline:
 *   1. locate the bottom info panel from the pixels themselves (no fixed
 *      coordinates, so 1280x912 crops and 2399x1709 originals both work)
 *   2. OCR only that panel strip (Indonesian + English model)
 *   3. map the recognised words through the ID→EN vocabulary, keeping the
 *      original word boxes so the new English text lands where the old text was
 *   4. cover exactly those boxes with white and draw the English text
 *
 * The map body (coastlines, colour shading, sea names, the "Update" stamp and
 * the BMKG logo) is never modified. The month/year line follows the UI values.
 */

import { FONT_FAMILY, planPanelEdits } from './mapEdits.js'
import { analyzePanel } from './mapPanel.js'
import { OCR_LANG, recognizePanel } from './mapOcr.js'

/** Reference size used by the UI warning; detection itself is size agnostic. */
export const CALIBRATION = { width: 1280, height: 912 }

/** OCR works best when the panel strip is ~1400px tall. */
const TARGET_PANEL_HEIGHT = 1400
const MAX_OCR_SCALE = 3

let canvasFactory = null
let measureCanvas = null

/** Node tests inject their canvas implementation here (browser default = DOM). */
export function setCanvasFactory(factory) {
  canvasFactory = factory
  measureCanvas = null
}

function makeCanvas(width, height) {
  if (canvasFactory) return canvasFactory(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context2d(canvas) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D tidak tersedia di perangkat ini')
  return ctx
}

/** Measure text width with the same font the renderer uses. */
export function measureText(text, size) {
  if (!measureCanvas) measureCanvas = makeCanvas(8, 8)
  const ctx = context2d(measureCanvas)
  ctx.font = `bold ${size}px ${FONT_FAMILY}`
  return ctx.measureText(text).width
}

/** Flatten an image into {data,width,height} (draws through a canvas). */
export function imageToImageData(image) {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const canvas = makeCanvas(width, height)
  const ctx = context2d(canvas)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0)
  return { canvas, ctx, imageData: ctx.getImageData(0, 0, width, height), width, height }
}

/** True when a row inside a cell is a solid table rule rather than text. */
function isRuleRow(imageData, y, cell) {
  const { data, width } = imageData
  const total = cell.x1 - cell.x0 + 1
  let dark = 0
  for (let x = cell.x0; x <= cell.x1; x += 1) {
    const i = (y * width + x) * 4
    if (data[i] < 170 && data[i + 1] < 170 && data[i + 2] < 170) dark += 1
  }
  return dark >= 0.9 * total
}

/** Build the OCR strip: panel crop, vertical rules whitened, upscaled. */
export function buildOcrStrip(sourceCanvas, imageData, panel) {
  const { width } = imageData
  const top = panel.panelTop
  const bottom = panel.panelBottom
  const height = bottom - top
  const scale = Math.max(1, Math.min(MAX_OCR_SCALE, TARGET_PANEL_HEIGHT / height))

  const strip = makeCanvas(Math.round(width * scale), Math.round(height * scale))
  const ctx = context2d(strip)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, strip.width, strip.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(sourceCanvas, 0, top, width, height, 0, 0, strip.width, strip.height)

  // Whiten the table borders (±2px, not just ±1) so the OCR neither reads
  // them as "I"/"l" nor gets confused by half-left rule remnants.
  ctx.fillStyle = '#FFFFFF'
  const ruleWidth = Math.max(4, Math.round(4 * scale))
  for (const rule of panel.vRules) {
    ctx.fillRect(rule * scale - ruleWidth / 2, 0, ruleWidth, strip.height)
  }

  // Cell-internal horizontal rules (header-row borders, table row lines) sit
  // right next to the text: remove them too, otherwise OCR word boxes stretch
  // to the rule and the redrawn font comes out far too large.
  const ruleHeight = Math.max(4, Math.round(4 * scale))
  for (let y = top; y < bottom; y += 1) {
    for (const cell of panel.cells) {
      if (!isRuleRow(imageData, y, cell)) continue
      const cy = (y - top) * scale
      ctx.fillRect(
        cell.x0 * scale,
        cy - ruleHeight / 2,
        (cell.x1 + 1 - cell.x0) * scale,
        ruleHeight,
      )
    }
  }

  return { strip, scale, cropBox: [0, top, width, bottom] }
}

function mapBox(box, scale, cropBox) {
  return {
    x0: Math.max(0, box.x0 / scale + cropBox[0]),
    y0: Math.max(0, box.y0 / scale + cropBox[1]),
    x1: box.x1 / scale + cropBox[0],
    y1: box.y1 / scale + cropBox[1],
  }
}

/**
 * OCR the panel and turn it into redraw instructions.
 * @returns {Promise<{edits:Array, stats:object|null, panel:object|null}>}
 */
export async function planMapTranslations(
  imageData,
  { month, year, sourceCanvas, onProgress, lang = OCR_LANG } = {},
) {
  const panel = analyzePanel(imageData)
  if (!panel || !panel.cells.length) return { edits: [], stats: null, panel: null }
  onProgress?.(0.45)

  const { strip, scale, cropBox } = buildOcrStrip(sourceCanvas, imageData, panel)
  onProgress?.(0.55)

  const { lines } = await recognizePanel(strip, { lang })
  onProgress?.(0.8)

  const mapped = lines.map((line) => ({
    text: line.text,
    confidence: line.confidence,
    bbox: line.bbox,
    words: line.words.map((word) => ({
      text: word.text,
      confidence: word.confidence,
      bbox: mapBox(word.bbox, scale, cropBox),
    })),
  }))

  const { edits, stats } = planPanelEdits({
    lines: mapped,
    imageData,
    cells: panel.cells,
    panelHeight: panel.panelBottom - panel.panelTop,
    measure: measureText,
    month,
    year,
  })
  onProgress?.(0.9)
  return { edits, stats, panel }
}

/** Cover the Indonesian text with white and draw the English translation. */
export function applyEdits(ctx, edits) {
  for (const edit of edits) {
    const [x0, y0, x1, y1] = edit.box
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0), Math.ceil(y1 - y0))

    ctx.fillStyle = '#000000'
    ctx.font = `bold ${edit.size}px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(
      edit.text,
      (x0 + x1) / 2,
      (y0 + y1) / 2 + edit.size * 0.36,
    )
  }
}

/** Load an image from a File/Blob/URL (browser only). */
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    let objectUrl = null
    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error('Gagal memuat gambar: format tidak didukung'))
    }
    if (typeof source === 'string') {
      image.src = source
    } else if (typeof Blob !== 'undefined' && (source instanceof Blob || source instanceof File)) {
      objectUrl = URL.createObjectURL(source)
      image.src = objectUrl
    } else {
      reject(new Error('Format sumber gambar tidak valid'))
    }
  })
}

/**
 * Remaster + translate the map locally.
 * @returns {Promise<{blob: Blob, stats: object|null}>}
 */
export async function remasterMapLocally(source, month, year, onProgress) {
  onProgress?.(0.15)

  const image = await loadImage(source)
  const { canvas, ctx, imageData } = imageToImageData(image)
  onProgress?.(0.35)

  const { edits, stats } = await planMapTranslations(imageData, {
    month,
    year,
    sourceCanvas: canvas,
    onProgress: (fraction) => {
      const pct = Math.round(fraction * 100)
      if (pct > 35) onProgress?.(pct)
    },
  })

  applyEdits(ctx, edits)
  onProgress?.(0.95)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Gagal menghasilkan JPEG'))),
      'image/jpeg',
      0.95,
    )
  })
  onProgress?.(1)
  return { blob, stats }
}