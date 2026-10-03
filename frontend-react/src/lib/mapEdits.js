/**
 * Turn OCR words of the bottom panel into concrete redraw instructions.
 *
 * Every edit is self-contained: one white box to cover the Indonesian text and
 * one English string to draw inside it. Nothing outside the panel is touched,
 * and per-line "neighbour limits" stop an edit from covering the colour swatch,
 * the numeric ranges, or the table borders.
 */

import { solidRatio } from './mapPanel.js'
import { matchMonth, matchYear, tokenKey, translateRuns } from './vocabId.js'

export const FONT_FAMILY = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

export const RENDER = {
  minFont: 9,
  maxFont: 90,
  fontFactor: 1.5, // initial size ≈ glyph height × 1.5 (fit-to-width then applies)
  padX: 3,
  padY: 3,
  minConfidence: 40,
  maxSolidRatio: 0.85, // above this the "word" is a colour swatch, not text
  minHeightFrac: 0.008, // glyph height relative to the panel height
}

/** Union of OCR boxes. */
export function unionBoxes(boxes) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of boxes) {
    x0 = Math.min(x0, b.x0)
    y0 = Math.min(y0, b.y0)
    x1 = Math.max(x1, b.x1)
    y1 = Math.max(y1, b.y1)
  }
  return [x0, y0, x1, y1]
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Keep every OCR word (so junk still limits edits) but blank the key of words
 * that must never be translated (colour swatches, low confidence, tiny noise).
 */
function prepareWords(line, imageData, minHeight) {
  const words = (line.words || [])
    .filter((w) => w && w.bbox && w.text && w.text.trim())
    .map((w) => ({ text: w.text, bbox: w.bbox, confidence: w.confidence ?? 0 }))
    .sort((a, b) => a.bbox.x0 - b.bbox.x0)

  return words.map((w) => {
    const height = w.bbox.y1 - w.bbox.y0
    const width = w.bbox.x1 - w.bbox.x0
    const solid = solidRatio(imageData, [w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1])
    const trusted =
      w.confidence >= RENDER.minConfidence &&
      height >= minHeight &&
      width >= 3 &&
      solid < RENDER.maxSolidRatio
    return { ...w, key: trusted ? tokenKey(w.text) : '', solid }
  })
}

/** Horizontal room left for a run, bounded by neighbouring glyphs. */
function limitRange(words, runStart, runEnd, cell) {
  let left = cell.x0
  let right = cell.x1
  for (let i = 0; i < words.length; i += 1) {
    if (i < runStart) left = Math.max(left, words[i].bbox.x1 + 2)
    else if (i >= runEnd) right = Math.min(right, words[i].bbox.x0 - 2)
  }
  if (right - left < 20) return { left: cell.x0, right: cell.x1 }
  return { left, right }
}

function cellIndexFor(cells, x) {
  for (const cell of cells) {
    if (x >= cell.x0 && x <= cell.x1) return cell.index
  }
  return -1
}

function isDateKey(key) {
  return Boolean(matchMonth(key) || matchYear(key))
}

/**
 * Build the list of redraw instructions.
 *
 * @param {object} params
 * @param {Array} params.lines  OCR lines with word boxes, in image coordinates
 * @param {{data:Uint8ClampedArray,width:number,height:number}} params.imageData
 * @param {Array<{index:number,x0:number,x1:number}>} params.cells panel cells
 * @param {number} params.panelHeight
 * @param {(text:string,size:number)=>number} params.measure text width in px
 * @param {string} params.month English month name (from the UI)
 * @param {string} params.year  four-digit year (from the UI)
 * @returns {{edits:Array<object>, stats:object}}
 */
export function planPanelEdits({ lines, imageData, cells, panelHeight, measure, month, year }) {
  const minHeight = Math.max(5, Math.floor(panelHeight * RENDER.minHeightFrac))
  const edits = []
  const stats = { lines: 0, translated: 0, title: false, date: false, labels: 0 }
  const perCell = new Map()

  for (const line of lines) {
    const words = prepareWords(line, imageData, minHeight)
    if (!words.length) continue
    // One OCR line can span several cells — the title, the table header and
    // "KETERANGAN" all sit on the same baseline — so split its words into
    // per-cell groups: a cell must only ever receive its own words, otherwise
    // the rewrite lands in the wrong box.
    let group = null
    for (const word of words) {
      const cellIndex = cellIndexFor(cells, (word.bbox.x0 + word.bbox.x1) / 2)
      const cell = cells.find((c) => c.index === cellIndex)
      if (!cell) continue // word sits on a table border
      if (!group || group.cellIndex !== cellIndex) {
        group = { cellIndex, cell, words: [] }
        if (!perCell.has(cellIndex)) perCell.set(cellIndex, [])
        perCell.get(cellIndex).push(group)
      }
      group.words.push(word)
    }
  }

  for (const entries of perCell.values()) {
    entries.sort((a, b) => a.words[0].bbox.y0 - b.words[0].bbox.y0)
    const plans = []

    for (const { words, cell } of entries) {
      stats.lines += 1
      const keys = words.map((w) => w.key)

      // --- month / year line ------------------------------------------------
      // A month word must be present: a lone 4-digit number is far more often
      // a misread data value ("> 200 %" → "2009") than a year, and rewriting
      // that row as a date would destroy the table.
      if (words.some((w) => matchMonth(w.key))) {
        const dateBoxes = words.filter((w) => isDateKey(w.key)).map((w) => w.bbox)
        plans.push({
          kind: 'date',
          text: `${month} ${year}`.trim(),
          box: unionBoxes(dateBoxes.length ? dateBoxes : words.map((w) => w.bbox)),
          words,
          cell,
        })
        continue
      }

      // --- translated runs --------------------------------------------------
      for (const run of translateRuns(keys)) {
        plans.push({
          kind: 'text',
          text: run.text,
          box: unionBoxes(words.slice(run.start, run.end).map((w) => w.bbox)),
          words,
          cell,
          run,
        })
      }
    }

    // --- merge the title lines of the header cell into a single line --------
    const titlePlans = plans.filter((p) => p.kind === 'text' && /\bMAP\b/.test(p.text))
    if (titlePlans.length > 1) {
      const limits = titlePlans.map((p) => limitRange(p.words, p.run.start, p.run.end, p.cell))
      const merged = titlePlans[0]
      merged.text = titlePlans.map((p) => p.text).join(' ')
      merged.box = unionBoxes(titlePlans.map((p) => p.box))
      merged.height = median(titlePlans.map((p) => p.box[3] - p.box[1]))
      merged.limit = {
        left: Math.max(...limits.map((l) => l.left)),
        right: Math.min(...limits.map((l) => l.right)),
      }
      titlePlans.slice(1).forEach((p) => {
        p.drop = true
      })
    }

    for (const plan of plans) {
      if (plan.drop) continue
      const run = plan.run
      const limits =
        plan.limit ||
        limitRange(plan.words, run ? run.start : 0, run ? run.end : plan.words.length, plan.cell)
      const height = plan.height || plan.box[3] - plan.box[1]

      let size = Math.round(height * RENDER.fontFactor)
      size = Math.max(RENDER.minFont, Math.min(RENDER.maxFont, size))
      const available = Math.max(24, limits.right - limits.left)
      while (size > RENDER.minFont && measure(plan.text, size) > available) size -= 1

      const targetWidth = Math.min(measure(plan.text, size), available)
      const centre = (plan.box[0] + plan.box[2]) / 2
      let tx0 = centre - targetWidth / 2
      let tx1 = centre + targetWidth / 2
      if (tx0 < limits.left) {
        tx0 = limits.left
        tx1 = tx0 + targetWidth
      }
      if (tx1 > limits.right) {
        tx1 = limits.right
        tx0 = tx1 - targetWidth
      }

      const original = plan.words
        .slice(run ? run.start : 0, run ? run.end : plan.words.length)
        .map((w) => w.text)
        .join(' ')
      const letters = (value) => value.replace(/[^A-Za-z]/g, '').toLowerCase()
      if (letters(original) && letters(original) === letters(plan.text)) continue // already English

      const text = /:/.test(original) && !/:/.test(plan.text) ? `${plan.text} :` : plan.text
      const box = [
        Math.max(limits.left - 1, Math.min(tx0, plan.box[0]) - RENDER.padX),
        Math.max(0, plan.box[1] - RENDER.padY),
        Math.min(limits.right + 1, Math.max(tx1, plan.box[2]) + RENDER.padX),
        plan.box[3] + RENDER.padY,
      ]
      if (box[2] - box[0] < 8 || box[3] - box[1] < 6) continue

      edits.push({ box, text, size, kind: plan.kind, original })
      stats.translated += 1
      if (plan.kind === 'date') stats.date = true
      else if (/\bMAP\b/.test(text)) stats.title = true
      else stats.labels += 1
    }
  }

  edits.sort((a, b) => a.box[1] - b.box[1])
  return { edits, stats }
}