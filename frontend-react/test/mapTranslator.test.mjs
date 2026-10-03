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

import { applyEdits, buildOcrStrip, planMapTranslations, setCanvasFactory } from '../src/lib/localMap.js'
import { analyzePanel } from '../src/lib/mapPanel.js'
import { buildWorkerPathOptions, disposeOcr, recognizePanel } from '../src/lib/mapOcr.js'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..', '..')
const SAMPLE = join(projectRoot, 'sample_data', 'Anomaly Juli 2026 (ENG).png')
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