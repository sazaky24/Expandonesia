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

function sampleTextColor(imageData, box) {
  const { data, width, height } = imageData
  const [x0, y0, x1, y1] = box
  const bins = new Map()
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y += 1) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x += 1) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const saturation = Math.max(r, g, b) - Math.min(r, g, b)
      if (saturation < 55 || Math.max(r, g, b) > 240) continue
      const key = `${Math.floor(r / 32)},${Math.floor(g / 32)},${Math.floor(b / 32)}`
      const entry = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 }
      entry.count += 1
      entry.r += r
      entry.g += g
      entry.b += b
      bins.set(key, entry)
    }
  }

  let dominant = null
  for (const entry of bins.values()) {
    if (!dominant || entry.count > dominant.count) dominant = entry
  }
  if (!dominant) return '#000000'
  const channel = (sum) => Math.round(sum / dominant.count)
  return `rgb(${channel(dominant.r)}, ${channel(dominant.g)}, ${channel(dominant.b)})`
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
    const key = tokenKey(w.text)
    const solid = solidRatio(imageData, [w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1])
    const trusted =
      (w.confidence >= RENDER.minConfidence || /^keterang(?:an|am|n)$/.test(key)) &&
      height >= minHeight &&
      width >= 3 &&
      solid < RENDER.maxSolidRatio
    return { ...w, key: trusted ? key : '', solid }
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

/**
 * Build the list of redraw instructions.
 *
 * @param {object} params
 * @param {Array} params.lines  OCR lines with word boxes, in image coordinates
 * @param {{data:Uint8ClampedArray,width:number,height:number}} params.imageData
 * @param {Array<{index:number,x0:number,x1:number}>} params.cells panel cells
 * @param {number} params.panelHeight
 * @param {(text:string,size:number)=>number} params.measure text width in px
 * @returns {{edits:Array<object>, stats:object}}
 */
export function planPanelEdits({ lines, imageData, cells, panelHeight, measure }) {
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

    for (const [entryIndex, { words, cell }] of entries.entries()) {
      stats.lines += 1
      const keys = words.map((w) => w.key)
      const rawKeys = words.map((w) => tokenKey(w.text))

      // --- month / year line ------------------------------------------------
      // A month word must be present: a lone 4-digit number is far more often
      // a misread data value ("> 200 %" → "2009") than a year, and rewriting
      // that row as a date would destroy the table.
      const monthIndex = words.findIndex((w) => matchMonth(w.key))
      if (monthIndex >= 0) {
        const monthWord = words[monthIndex]
        const monthTranslation = monthWord ? matchMonth(monthWord.key) : null
        const detectedMonth =
          monthTranslation && monthWord.text === monthWord.text.toUpperCase()
            ? monthTranslation.toUpperCase()
            : monthTranslation
        const yearIndex = words.findIndex((w) => matchYear(w.text))
        const detectedYear = yearIndex >= 0 ? matchYear(words[yearIndex].text) : null
        const updateIndex = words.findIndex((w) => tokenKey(w.text) === 'update')
        let dateStart = monthIndex
        let dateEnd = Math.max(monthIndex, yearIndex)
        let dateText = [detectedMonth, detectedYear].filter(Boolean).join(' ')
        if (updateIndex >= 0) {
          dateStart = updateIndex
          const dayWord = words
            .slice(updateIndex + 1, monthIndex)
            .find((word) => /\d/.test(word.text))
          const dayDigits = dayWord?.text.match(/\d{1,2}/)?.[0]
          const day = dayDigits && dayDigits.length === 2 ? dayDigits : '01'
          dateText = `Update : ${day} ${detectedMonth} ${detectedYear || ''}`.trim()
        }
        const dateBoxWords = words.slice(dateStart, dateEnd + 1)
        const dateBox = unionBoxes(dateBoxWords.map((w) => w.bbox))
        plans.push({
          kind: 'date',
          text: dateText,
          box: dateBox,
          color: sampleTextColor(imageData, dateBox),
          words,
          cell,
          dateType: updateIndex >= 0 ? 'update' : 'monthYear',
        })
        continue
      }

      const hasRainfallMmHeader =
        cell.index === 1 &&
        entryIndex === 0 &&
        rawKeys.includes('mm') &&
        ((rawKeys.includes('curah') && rawKeys.includes('hujan')) ||
          rawKeys.includes('rainfall'))
      if (hasRainfallMmHeader) {
        plans.push({
          kind: 'text',
          text: 'RAINFALL MM :',
          box: unionBoxes(words.map((w) => w.bbox)),
          words,
          cell,
          run: { start: 0, end: words.length },
          compactHeader: true,
        })
        continue
      }

      // --- translated runs --------------------------------------------------
      for (const run of translateRuns(keys)) {
        const isCategoryLabel =
          cell.index === 1 &&
          /^HIGH$/i.test(run.text)
        plans.push({
          kind: 'text',
          text: run.text,
          box: unionBoxes(words.slice(run.start, run.end).map((w) => w.bbox)),
          words,
          cell,
          run,
          categoryLabel: isCategoryLabel,
          legendLabel: cell.index === 2 && /^(OVERSEAS|PROVINCIAL BORDERS)$/i.test(run.text),
          compact: (cell.index === 0 && /\bMAP\b|\bFORECAST\b/.test(run.text)) ||
            (cell.index === 1 && entryIndex === 0),
        })
      }

      // Already-English category labels still need consistent sizing so an
      // OCR bounding box inflated by nearby table artwork cannot render them
      // oversized relative to translated labels.
      if (cell.index === 1) {
        for (let start = 0; start < keys.length; start += 1) {
          let joined = ''
          for (let end = start; end < Math.min(keys.length, start + 4); end += 1) {
            if (!/^[a-z]+$/.test(keys[end]) || joined.length + keys[end].length > 4) break
            joined += keys[end]
            if (joined === 'high' && plans.some((plan) =>
              plan.words === words && plan.run?.start <= end && plan.run?.end > start
            )) {
              break
            }
            if (joined === 'high' && end > start) {
              const fragments = words.slice(start, end + 1)
              const top = Math.max(...fragments.map((word) => word.bbox.y0))
              const bottom = Math.min(...fragments.map((word) => word.bbox.y1))
              const height = Math.min(...fragments.map((word) => word.bbox.y1 - word.bbox.y0))
              const largestGap = Math.max(
                ...fragments.slice(1).map((word, index) => word.bbox.x0 - fragments[index].bbox.x1),
              )
              if (bottom - top < height * 0.55 || largestGap > height * 0.5) break
            }
            if (joined === 'high' && !plans.some((plan) =>
              plan.words === words && plan.run?.start <= end && plan.run?.end > start
            )) {
              plans.push({
                kind: 'text',
                text: 'HIGH',
                box: unionBoxes(words.slice(start, end + 1).map((word) => word.bbox)),
                words,
                cell,
                run: { start, end: end + 1 },
                categoryLabel: true,
              })
              start = end
              break
            }
            if (!'high'.startsWith(joined)) break
          }
        }
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

      const fontFactor = plan.kind === 'date'
        ? plan.dateType === 'update' ? 0.7 : 1
        : plan.legendLabel
          ? 0.95
          : plan.categoryLabel
            ? 0.95
        : plan.compactHeader
          ? 0.9
          : plan.compact
            ? 1.2
            : RENDER.fontFactor
      const panelDateSize =
        plan.kind === 'date' && plan.dateType === 'monthYear'
          ? Math.round(panelHeight * 0.07)
          : RENDER.minFont
      let size = Math.max(Math.round(height * fontFactor), panelDateSize)
      size = Math.max(RENDER.minFont, Math.min(RENDER.maxFont, size))
      const textLeft = Math.max(
        limits.left + RENDER.padX,
        plan.legendLabel ? plan.box[0] : -Infinity,
      )
      const textRight = limits.right - RENDER.padX
      const available = Math.max(24, textRight - textLeft)
      while (size > RENDER.minFont && measure(plan.text, size) > available) size -= 1

      const targetWidth = measure(plan.text, size)
      if (targetWidth > available) continue
      const centre = plan.legendLabel
        ? Math.max((plan.box[0] + plan.box[2]) / 2, textLeft + targetWidth / 2)
        : (plan.box[0] + plan.box[2]) / 2
      const textX = Math.max(
        textLeft + targetWidth / 2,
        Math.min(centre, textRight - targetWidth / 2),
      )
      const tx0 = textX - targetWidth / 2
      const tx1 = textX + targetWidth / 2

      const original = plan.words
        .slice(run ? run.start : 0, run ? run.end : plan.words.length)
        .map((w) => w.text)
        .join(' ')
      const letters = (value) => value.replace(/[^A-Za-z]/g, '').toLowerCase()
      if (
        !plan.compactHeader &&
        !plan.categoryLabel &&
        !(plan.kind === 'date' && plan.dateType === 'monthYear') &&
        letters(original) &&
        letters(original) === letters(plan.text)
      ) {
        continue
      }

      const text =
        plan.kind !== 'date' && /:/.test(original) && !/:/.test(plan.text)
          ? `${plan.text} :`
          : plan.text
      const padY = plan.compactHeader || plan.categoryLabel ? 0 : RENDER.padY
      const box = [
        Math.max(limits.left, Math.min(tx0, plan.box[0]) - RENDER.padX),
        Math.max(0, plan.box[1] - padY),
        Math.min(limits.right, Math.max(tx1, plan.box[2]) + RENDER.padX),
        plan.box[3] + padY,
      ]
      if (box[2] - box[0] < 8 || box[3] - box[1] < 6) continue

      edits.push({
        box,
        text,
        textX,
        size,
        color: plan.color || '#000000',
        kind: plan.kind,
        original,
      })
      stats.translated += 1
      if (plan.kind === 'date') stats.date = true
      else if (/\bMAP\b|\bFORECAST\b/.test(text) && plan.cell.index === 0) stats.title = true
      else stats.labels += 1
    }
  }

  edits.sort((a, b) => a.box[1] - b.box[1])
  return { edits, stats }
}