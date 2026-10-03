/**
 * Regression test for the map translator (runs the REAL browser pipeline).
 *
 * The reference samples in `sample_data/` are the desired ENGLISH output of a
 * BMKG-style map. This test rebuilds the equivalent INDONESIAN input by painting
 * Indonesian text into the same panel boxes, runs the translator, and checks:
 *   - the detected title / table header / row labels / legend were translated
 *   - the month-year line is translated from the text detected in the image
 *   - nothing outside the rewritten text boxes changed (map body untouched)
 *   - no Indonesian word survives in the output panel (verified with OCR)
 *
 * Node's canvas + tesseract.js make the browser code paths testable here.
 * Run: npm test        (skips when sample_data/ is missing)
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test, { after } from 'node:test'

import { createCanvas, loadImage } from '@napi-rs/canvas'

import {
  applyEdits,
  buildOcrStrip,
  planMapTranslations,
  setCanvasFactory,
} from '../src/lib/localMap.js'
import { FONT_FAMILY, planPanelEdits } from '../src/lib/mapEdits.js'
import { analyzePanel } from '../src/lib/mapPanel.js'
import { buildWorkerPathOptions, disposeOcr, recognizePanel } from '../src/lib/mapOcr.js'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..', '..')
const SAMPLE = join(projectRoot, 'sample_data', 'Anomaly Juli 2026 (ENG).png')
const DAMAGED_SAMPLE = join(projectRoot, 'hasil_rusak', 'map_translated1.jpg')
const LATEST_SAMPLE = join(projectRoot, 'hasil_rusak', 'map_translated.jpg')
const OUT_DIR = join(projectRoot, 'sample_data', '_test_output')

setCanvasFactory((width, height) => createCanvas(width, height))

// The cached tesseract worker keeps the event loop (and thus `node --test`)
// alive after the assertions are done — release it so the run can exit.
after(async () => {
  await disposeOcr()
})

test('OCR worker options preserve Tesseract defaults when custom paths are unset', () => {
  assert.deepEqual(
    buildWorkerPathOptions({ worker: undefined, core: undefined, lang: undefined }),
    {},
  )
  assert.deepEqual(
    buildWorkerPathOptions({ worker: 'undefined', core: 'null', lang: '  ' }),
    {},
  )
  assert.deepEqual(
    buildWorkerPathOptions({ worker: '/ocr/worker.js', core: '/ocr/core', lang: '/ocr/lang' }),
    {
      workerPath: '/ocr/worker.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
    },
  )
})

/** Panel boxes measured from the reference sample. */
const FIXTURE_EDITS = [
  { box: [100, 646, 420, 680], text: 'PETA ANOMALI CURAH HUJAN', centered: true, size: 20 },
  { box: [150, 676, 370, 703], text: 'JULI 2026', centered: true, size: 19 },
  { box: [500, 644, 705, 674], text: 'ANOMALI CURAH HUJAN', centered: true, size: 16 },
  { box: [600, 712, 766, 740], text: 'DI BAWAH NORMAL', centered: false, size: 15 },
  { box: [600, 773, 766, 800], text: 'NORMAL', centered: false, size: 15 },
  { box: [600, 833, 766, 860], text: 'DI ATAS NORMAL', centered: false, size: 15 },
  { box: [800, 645, 970, 675], text: 'KETERANGAN', centered: true, size: 16 },
  { box: [830, 716, 970, 748], text: 'Batas Propinsi', centered: false, size: 16 },
  { box: [828, 754, 970, 790], text: 'Luar Negeri', centered: false, size: 16 },
]

const INDONESIAN_WORDS = [
  'PETA', 'CURAH', 'HUJAN', 'ANOMALI', 'KETERANGAN', 'BAWAH', 'ATAS',
  'BATAS', 'PROPINSI', 'NEGERI', 'JULI',
]

function paintIndonesianFixture(image) {
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  for (const item of FIXTURE_EDITS) {
    const [x0, y0, x1, y1] = item.box
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    ctx.fillStyle = '#000000'
    ctx.font = `bold ${item.size}px Arial`
    ctx.textAlign = item.centered ? 'center' : 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.text, item.centered ? (x0 + x1) / 2 : x0 + 2, (y0 + y1) / 2)
  }
  return canvas
}

/** Pixels that differ between two RGBA buffers. */
function changedPixels(before, after, width, height) {
  const points = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (
        before[i] !== after[i] ||
        before[i + 1] !== after[i + 1] ||
        before[i + 2] !== after[i + 2]
      ) {
        points.push([x, y])
      }
    }
  }
  return points
}

function insideAny(points, boxes, slack = 3) {
  return points.every(([x, y]) =>
    boxes.some(
      (box) =>
        x >= box[0] - slack && x <= box[2] + slack && y >= box[1] - slack && y <= box[3] + slack,
    ),
  )
}

test('map translator: Indonesian panel → English, map body untouched', async (t) => {
  if (!existsSync(SAMPLE)) {
    t.skip(`reference sample not found: ${SAMPLE}`)
    return
  }
  mkdirSync(OUT_DIR, { recursive: true })

  const reference = await loadImage(SAMPLE)
  const fixture = paintIndonesianFixture(reference)
  const fixtureCtx = fixture.getContext('2d')
  const { width, height } = fixture
  const fixtureData = fixtureCtx.getImageData(0, 0, width, height)

  // ---- detection ---------------------------------------------------------
  const panel = analyzePanel(fixtureData)
  assert.ok(panel, 'bottom panel must be detected')
  assert.ok(panel.panelTop > 0.5 * height, 'panel sits in the lower part of the map')
  assert.ok(panel.cells.length >= 3, `expected title/table/legend cells, got ${panel.cells.length}`)

  const before = Uint8ClampedArray.from(fixtureData.data)

  // ---- translate --------------------------------------------------------
  const { edits, stats } = await planMapTranslations(fixtureData, {
    sourceCanvas: fixture,
  })

  const texts = edits.map((edit) => edit.text)
  const summary = JSON.stringify(texts)
  assert.ok(stats, 'planner should report statistics')
  assert.ok(texts.includes('RAINFALL ANOMALY MAP'), `title missing: ${summary}`)
  assert.ok(texts.includes('RAINFALL ANOMALY'), `table header missing: ${summary}`)
  assert.ok(texts.includes('JULY 2026'), `date line missing: ${summary}`)
  assert.ok(texts.includes('Below Normal'), `Below Normal missing: ${summary}`)
  assert.ok(texts.includes('Above Normal'), `Above Normal missing: ${summary}`)
  assert.ok(texts.includes('LEGEND'), `LEGEND missing: ${summary}`)
  assert.ok(texts.includes('Provincial Borders'), `Provincial Borders missing: ${summary}`)
  assert.ok(texts.includes('Overseas'), `Overseas missing: ${summary}`)

  for (const edit of edits) {
    assert.ok(edit.box[1] >= panel.panelTop - 1, `edit above the panel: ${JSON.stringify(edit)}`)
    assert.ok(edit.box[3] <= panel.panelBottom + 1, `edit below the panel: ${JSON.stringify(edit)}`)
  }

  // ---- render -----------------------------------------------------------
  applyEdits(fixtureCtx, edits)
  const after = fixtureCtx.getImageData(0, 0, width, height).data
  const changed = changedPixels(before, after, width, height)
  assert.ok(changed.length > 500, 'the translator must actually rewrite text')
  assert.ok(
    insideAny(changed, edits.map((edit) => edit.box)),
    'only the translated text boxes may change (map body + swatches stay identical)',
  )

  const output = join(OUT_DIR, 'translated_from_indonesian.png')
  writeFileSync(output, await fixture.encode('png'))

  // ---- no Indonesian left (independent OCR check) ------------------------
  // OCR the same upscaled panel strip the pipeline uses, on the FINAL image.
  const { strip } = buildOcrStrip(fixture, fixtureCtx.getImageData(0, 0, width, height), panel)
  const { lines } = await recognizePanel(strip, { lang: 'ind+eng' })
  const flat = lines.map((line) => line.text.toUpperCase()).join(' ')
  for (const word of INDONESIAN_WORDS) {
    assert.ok(!flat.includes(word), `Indonesian word "${word}" still present in: ${flat}`)
  }
  // "NORMAL" is identical in both languages, so it must survive untouched
  // (the "115" range of its table row proves the row was not swallowed).
  for (const expected of ['RAINFALL ANOMALY MAP', 'BELOW NORMAL', 'ABOVE NORMAL', 'LEGEND', '115']) {
    assert.ok(flat.includes(expected), `expected "${expected}" in output OCR: ${flat}`)
  }

  console.log(
    `\nDetected ${edits.length} edits (labels=${stats.labels}, title=${stats.title}, date=${stats.date})`,
  )
  console.log(`Output image: ${output}`)
})

test('damaged-map regression: translate fused title and preserve update stamp styling', async (t) => {
  if (!existsSync(DAMAGED_SAMPLE)) {
    t.skip(`damaged-map sample not found: ${DAMAGED_SAMPLE}`)
    return
  }

  const image = await loadImage(DAMAGED_SAMPLE)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, image.width, image.height)
  const { edits, stats } = await planMapTranslations(imageData, { sourceCanvas: canvas })
  const texts = edits.map((edit) => edit.text)

  assert.ok(texts.includes('RAINFALL CHARACTERISTICS FORECAST'), `title missing: ${texts}`)
  assert.ok(texts.includes('RAINFALL CHARACTERISTICS :'), `fused header missing: ${texts}`)
  assert.ok(texts.includes('OVERSEAS'), `fused overseas label missing: ${texts}`)
  assert.ok(texts.includes('Update : 01 August 2026'), `update stamp missing: ${texts}`)
  assert.equal(stats.title, true)

  const date = edits.find((edit) => edit.kind === 'date')
  assert.ok(date, 'update stamp should use date rendering')
  const colorChannels = date.color.match(/^rgb\((\d+), (\d+), (\d+)\)$/)
  assert.ok(colorChannels, 'date should retain its detected RGB color')
  assert.ok(
    Number(colorChannels[3]) > Number(colorChannels[1]) + 50 &&
      Number(colorChannels[3]) > Number(colorChannels[2]) + 50,
    `date should retain its blue color: ${date.color}`,
  )
  assert.ok(date.size <= 32, `date font should match the source label: ${date.size}`)
})

test('latest result: detect the left panel edge and translate KETERANGAN', async (t) => {
  if (!existsSync(LATEST_SAMPLE)) {
    t.skip(`latest map sample not found: ${LATEST_SAMPLE}`)
    return
  }

  const image = await loadImage(LATEST_SAMPLE)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, image.width, image.height)
  const panel = analyzePanel(imageData)
  assert.ok(panel, 'bottom panel should be detected')
  assert.ok(panel.panelTop < 1210, `header text must remain in OCR crop: ${panel.panelTop}`)
  assert.ok(panel.cells[0].x0 > 120, `left panel border should be detected: ${panel.cells[0].x0}`)

  const { edits } = await planMapTranslations(imageData, { sourceCanvas: canvas })
  const legend = edits.find((edit) => edit.text === 'LEGEND :')
  const header = edits.find((edit) => edit.text === 'RAINFALL MM :')
  assert.ok(legend, `KETERANGAN should be translated: ${JSON.stringify(edits)}`)
  assert.ok(header, 'measurement header should be redrawn at a smaller size')
  assert.ok(header.size < 30, `measurement header font remains too large: ${header.size}`)
  assert.ok(header.box[0] >= panel.cells[1].x0, 'header edit must stay inside its cell')
  assert.ok(header.box[2] <= panel.cells[1].x1, 'header edit must stay inside its cell')
  assert.ok(legend.box[0] >= panel.cells[2].x0, 'legend edit must stay inside its cell')
  assert.ok(legend.box[2] <= panel.cells[2].x1, 'legend edit must stay inside its cell')

  const probeX = Math.round((panel.cells[1].x0 + panel.cells[1].x1) / 2)
  let separatorY = null
  for (let y = panel.panelTop + 60; y > panel.panelTop + 20; y -= 1) {
    const i = (y * image.width + probeX) * 4
    if (imageData.data[i] < 80) {
      separatorY = y
      break
    }
  }
  assert.ok(separatorY, 'table header separator should be detected')
  const separatorIndex = (separatorY * image.width + probeX) * 4
  const separatorBefore = Array.from(imageData.data.slice(separatorIndex, separatorIndex + 3))
  applyEdits(ctx, edits)
  const separatorAfter = Array.from(
    ctx.getImageData(0, 0, image.width, image.height).data.slice(separatorIndex, separatorIndex + 3),
  )
  assert.deepEqual(separatorAfter, separatorBefore, 'header rendering must preserve table borders')
})

test('long translated titles are fitted inside the title cell', () => {
  const width = 1000
  const height = 500
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  const imageData = { data, width, height }
  const canvas = createCanvas(1, 1)
  const ctx = canvas.getContext('2d')
  const words = [
    { text: 'PREDIKSI', bbox: { x0: 190, y0: 100, x1: 300, y1: 130 }, confidence: 95 },
    { text: 'SIFAT', bbox: { x0: 305, y0: 100, x1: 375, y1: 130 }, confidence: 95 },
    { text: 'HUJAN', bbox: { x0: 380, y0: 100, x1: 450, y1: 130 }, confidence: 95 },
  ]
  const { edits } = planPanelEdits({
    lines: [{ words }],
    imageData,
    cells: [
      { index: 0, x0: 140, x1: 480 },
      { index: 1, x0: 481, x1: 800 },
    ],
    panelHeight: 400,
    measure: (text, size) => {
      ctx.font = `bold ${size}px ${FONT_FAMILY}`
      return ctx.measureText(text).width
    },
  })

  const title = edits.find((edit) => edit.text === 'RAINFALL CHARACTERISTICS FORECAST')
  assert.ok(title, `translated title missing: ${JSON.stringify(edits)}`)
  ctx.font = `bold ${title.size}px ${FONT_FAMILY}`
  const renderedWidth = ctx.measureText(title.text).width
  assert.ok(title.textX - renderedWidth / 2 >= 143, 'text should not cross the left cell border')
  assert.ok(title.textX + renderedWidth / 2 <= 477, 'text should not cross the right cell border')
  assert.ok(title.box[0] >= 140 && title.box[2] <= 480, 'cover box should stay in the title cell')
})

test('low-confidence KETERANGAN OCR is still translated consistently', () => {
  const width = 800
  const height = 300
  const imageData = { data: new Uint8ClampedArray(width * height * 4).fill(255), width, height }
  const { edits } = planPanelEdits({
    lines: [{
      words: [{
        text: 'KETERANGAN:',
        bbox: { x0: 540, y0: 20, x1: 650, y1: 44 },
        confidence: 25,
      }],
    }],
    imageData,
    cells: [
      { index: 0, x0: 20, x1: 200 },
      { index: 1, x0: 210, x1: 480 },
      { index: 2, x0: 500, x1: 700 },
    ],
    panelHeight: 300,
    measure: (text, size) => text.length * size * 0.55,
  })

  assert.ok(edits.some((edit) => edit.text === 'LEGEND :'), `legend translation missing: ${JSON.stringify(edits)}`)
})

test('Overseas stays compact and to the right of its legend swatch', () => {
  const width = 800
  const height = 300
  const imageData = { data: new Uint8ClampedArray(width * height * 4).fill(255), width, height }
  const { edits } = planPanelEdits({
    lines: [{
      words: [
        { text: 'Luar', bbox: { x0: 520, y0: 100, x1: 560, y1: 130 }, confidence: 95 },
        { text: 'Negeri', bbox: { x0: 565, y0: 100, x1: 615, y1: 130 }, confidence: 95 },
      ],
    }],
    imageData,
    cells: [{ index: 2, x0: 500, x1: 700 }],
    panelHeight: 300,
    measure: (text, size) => text.length * size * 0.55,
  })

  const overseas = edits.find((edit) => edit.text === 'Overseas')
  assert.ok(overseas, `Overseas translation missing: ${JSON.stringify(edits)}`)
  const renderedWidth = 'Overseas'.length * overseas.size * 0.55
  assert.ok(overseas.size <= 29, `legend label should be compact: ${overseas.size}`)
  assert.ok(overseas.textX - renderedWidth / 2 >= 520, 'label should not cover the adjacent swatch')
  assert.ok(overseas.textX + renderedWidth / 2 <= 697, 'label should stay inside the legend cell')
})

test('HIGH labels are normalized and month-year dates are not undersized', () => {
  const width = 800
  const height = 400
  const imageData = { data: new Uint8ClampedArray(width * height * 4).fill(255), width, height }
  for (let x = 260; x <= 480; x += 1) {
    const i = (99 * width + x) * 4
    imageData.data[i] = 0
    imageData.data[i + 1] = 0
    imageData.data[i + 2] = 0
  }
  const { edits } = planPanelEdits({
    lines: [
      {
        words: [{ text: 'HEADER', bbox: { x0: 300, y0: 40, x1: 360, y1: 60 }, confidence: 95 }],
      },
      {
        words: [
          { text: 'H', bbox: { x0: 300, y0: 100, x1: 312, y1: 130 }, confidence: 95 },
          { text: 'IG', bbox: { x0: 316, y0: 100, x1: 340, y1: 130 }, confidence: 95 },
          { text: 'H', bbox: { x0: 344, y0: 100, x1: 356, y1: 130 }, confidence: 95 },
        ],
      },
      {
        words: [{ text: 'HIGH', bbox: { x0: 300, y0: 150, x1: 360, y1: 180 }, confidence: 95 }],
      },
      {
        words: [
          { text: 'Januari', bbox: { x0: 40, y0: 200, x1: 130, y1: 224 }, confidence: 95 },
          { text: '2025', bbox: { x0: 140, y0: 200, x1: 200, y1: 224 }, confidence: 95 },
        ],
      },
      {
        words: [
          { text: 'JANUARY', bbox: { x0: 40, y0: 260, x1: 130, y1: 284 }, confidence: 95 },
          { text: '2025', bbox: { x0: 140, y0: 260, x1: 200, y1: 284 }, confidence: 95 },
        ],
      },
    ],
    imageData,
    cells: [
      { index: 0, x0: 20, x1: 250 },
      { index: 1, x0: 260, x1: 480 },
    ],
    panelHeight: 400,
    measure: (text, size) => text.length * size * 0.55,
  })

  const high = edits.filter((edit) => edit.text === 'HIGH')
  const monthYear = edits.find((edit) => edit.text === 'January 2025')
  const existingMonthYear = edits.find((edit) => edit.text === 'JANUARY 2025')
  assert.equal(high.length, 2, 'both joined and unbroken English HIGH labels should be normalized')
  assert.ok(high.every((edit) => edit.size <= 29), `HIGH should fit its row: ${JSON.stringify(high)}`)
  assert.ok(monthYear, 'month-year line should be translated')
  assert.ok(monthYear.size >= 20, `month-year font should remain legible: ${monthYear.size}`)
  assert.ok(existingMonthYear, 'existing English month-year should be resized consistently')
  assert.ok(existingMonthYear.size >= 20, `existing date should remain legible: ${existingMonthYear.size}`)

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.fillRect(260, 99, 221, 1)
  applyEdits(ctx, edits)
  const borderPixel = ctx.getImageData(300, 99, 1, 1).data
  assert.deepEqual(Array.from(borderPixel.slice(0, 3)), [0, 0, 0], 'HIGH redraw must preserve the row border')
})

test('HIGH font scales with the actual table-row height', () => {
  const width = 800
  const height = 400
  const imageData = { data: new Uint8ClampedArray(width * height * 4).fill(255), width, height }
  const cell = { index: 1, x0: 260, x1: 480 }
  for (const y of [99, 161, 220, 340]) {
    for (let x = cell.x0; x <= cell.x1; x += 1) {
      const i = (y * width + x) * 4
      imageData.data[i] = 0
      imageData.data[i + 1] = 0
      imageData.data[i + 2] = 0
    }
  }

  const { edits } = planPanelEdits({
    lines: [
      {
        words: [{ text: 'TINGGI', bbox: { x0: 320, y0: 120, x1: 390, y1: 140 }, confidence: 95 }],
      },
      {
        words: [{ text: 'TINGGI', bbox: { x0: 320, y0: 260, x1: 390, y1: 280 }, confidence: 95 }],
      },
    ],
    imageData,
    cells: [{ index: 0, x0: 20, x1: 250 }, cell],
    panelHeight: 400,
    measure: (text, size) => text.length * size * 0.55,
  })

  const highEdits = edits.filter((edit) => edit.text === 'HIGH')
  assert.equal(highEdits.length, 2, 'both category labels should be translated')
  assert.ok(
    highEdits[1].size >= highEdits[0].size * 1.7,
    `font should grow with the taller row: ${highEdits.map((edit) => edit.size)}`,
  )
})