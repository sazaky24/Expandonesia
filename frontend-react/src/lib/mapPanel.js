/**
 * Bottom info-panel geometry for BMKG-style weather maps.
 *
 * Pure pixel maths (no DOM) so it can be unit-tested in Node as well as used
 * from the browser. The panel is located by itself — no fixed coordinates — so
 * it works for 1280x912 crops and 2399x1709 originals alike.
 *
 * Steps:
 *   1. text mask  = near-black, low-saturation pixels (skips colour fills)
 *   2. h-rules    = rows whose mask covers > 50% of the width (table borders)
 *   3. panel top  = last h-rule above 85% height (bottom edge of the map frame)
 *   4. v-rules    = columns whose mask covers > 70% of the panel height
 *      v-rules split the panel into cells: title | table | legend | scale bar
 */

export const DETECT = {
  darkLum: 140,
  satMax: 45,
  hRuleRatio: 0.5,
  vRuleRatio: 0.7,
  vRuleMergeFrac: 0.06,
  panelGap: 3,
  margin: 4,
  minCellWidth: 12,
}

/** Luminance of an RGBA pixel at a flat index. */
function lumAt(data, index) {
  return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
}

/** Near-black + low-saturation → text / table borders (not colour swatches). */
export function buildTextMask(imageData, detect = DETECT) {
  const { data, width, height } = imageData
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const i = (row + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const sat = Math.max(r, g, b) - Math.min(r, g, b)
      if (sat < detect.satMax && lumAt(data, i) < detect.darkLum) mask[row + x] = 1
    }
  }
  return mask
}

/** Group consecutive set indices (gap tolerant) into [from, to] runs. */
export function groupRuns(flags, gap = 3) {
  const runs = []
  let start = null
  let prev = null
  for (let i = 0; i < flags.length; i += 1) {
    if (!flags[i]) continue
    if (start === null) {
      start = i
      prev = i
      continue
    }
    if (i - prev <= gap) {
      prev = i
      continue
    }
    runs.push([start, prev])
    start = i
    prev = i
  }
  if (start !== null) runs.push([start, prev])
  return runs
}

function centres(runs) {
  return runs.map(([a, b]) => Math.round((a + b) / 2))
}

/**
 * Locate the bottom info panel and its cells.
 * @param {{data:Uint8ClampedArray,width:number,height:number}} imageData
 * @returns {{
 *   width:number, height:number,
 *   panelTop:number, panelBottom:number,
 *   hRules:number[], vRules:number[],
 *   cells:Array<{index:number,x0:number,x1:number}>,
 *   mask:Uint8Array
 * }|null}
 */
export function analyzePanel(imageData, detect = DETECT) {
  const { width, height } = imageData
  const mask = buildTextMask(imageData, detect)

  const rowInk = new Uint32Array(height)
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let count = 0
    for (let x = 0; x < width; x += 1) count += mask[row + x]
    rowInk[y] = count
  }

  const hFlags = new Uint8Array(height)
  for (let y = detect.margin; y < height - detect.margin; y += 1) {
    hFlags[y] = rowInk[y] > detect.hRuleRatio * width ? 1 : 0
  }
  const hRules = centres(groupRuns(hFlags))

  const frameRules = hRules.filter((y) => y < 0.85 * height)
  if (!frameRules.length) return null
  const panelTop = frameRules[frameRules.length - 1] + detect.panelGap
  const panelBottom = height - detect.margin
  const panelHeight = panelBottom - panelTop
  if (panelHeight < 24) return null

  const colInk = new Uint32Array(width)
  for (let y = panelTop + 2; y < panelBottom - 1; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) colInk[x] += mask[row + x]
  }
  const colFlags = new Uint8Array(width)
  const needed = detect.vRuleRatio * (panelHeight - 3)
  for (let x = detect.margin; x < width - detect.margin; x += 1) {
    colFlags[x] = colInk[x] > needed ? 1 : 0
  }

  const vRules = []
  for (const centre of centres(groupRuns(colFlags))) {
    if (vRules.length && centre - vRules[vRules.length - 1] < detect.vRuleMergeFrac * width) continue
    vRules.push(centre)
  }

  const cells = []
  for (let i = 0; i < vRules.length - 1; i += 1) {
    const x0 = vRules[i] + 4
    const x1 = vRules[i + 1] - 3
    if (x1 - x0 >= detect.minCellWidth) cells.push({ index: i, x0, x1 })
  }

  return { width, height, panelTop, panelBottom, hRules, vRules, cells, mask }
}

/** Fraction of near-black/low-saturation pixels inside a box (swatch ≈ 1.0). */
export function solidRatio(imageData, box) {
  const { data, width } = imageData
  const [x0, y0, x1, y1] = box
  let solid = 0
  let total = 0
  for (let y = Math.max(0, y0); y < y1; y += 1) {
    for (let x = Math.max(0, x0); x < x1; x += 1) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const sat = Math.max(r, g, b) - Math.min(r, g, b)
      total += 1
      if (sat < 60 && lumAt(data, i) < 190) solid += 1
    }
  }
  return total ? solid / total : 0
}
