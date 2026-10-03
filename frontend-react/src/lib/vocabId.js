/**
 * Indonesian → English vocabulary for BMKG weather-map panels.
 *
 * The map body is never touched (sea names, coordinates, "Update" stamp, BMKG
 * logo stay as-is, matching the reference translations). Only the info panel at
 * the bottom is translated: title cell, table header/row labels, legend cell.
 *
 * Two layers:
 *   - ID_EN_PHRASES : word-sequence rules (checked longest-first) so word ORDER
 *     changes correctly ("PETA PRAKIRAAN CURAH HUJAN" → "PRECIPITATION FORECAST MAP")
 *   - ID_EN_TOKENS  : single-word fallbacks
 *
 * Keeping this as data (not code) makes it easy to add new map families.
 */

/** Indonesian month (incl. abbreviations/typos) → English month. */
const MONTH_KEYS = [
  ['January', ['januari', 'jan', 'january']],
  ['February', ['februari', 'feb', 'pebruari', 'february']],
  ['March', ['maret', 'mar', 'mrt', 'march']],
  ['April', ['april', 'apr', 'aprl']],
  ['May', ['mei', 'may']],
  ['June', ['juni', 'jun', 'june']],
  ['July', ['juli', 'jul', 'july']],
  ['August', ['agustus', 'agu', 'ags', 'aug', 'august']],
  ['September', ['september', 'sept', 'sep']],
  ['October', ['oktober', 'okt', 'oct', 'october']],
  ['November', ['november', 'nov', 'nop']],
  ['December', ['desember', 'des', 'dec', 'december']],
]

const MONTH_LOOKUP = new Map()
for (const [english, keys] of MONTH_KEYS) {
  for (const key of keys) MONTH_LOOKUP.set(key, english)
}

/** Single-word fallbacks (lower-case keys, punctuation stripped). */
export const ID_EN_TOKENS = {
  peta: 'MAP',
  hujan: 'RAINFALL',
  curah: 'RAINFALL',
  anomali: 'ANOMALY',
  prakiraan: 'FORECAST',
  prediksi: 'FORECAST',
  perkiraan: 'FORECAST',
  forecast: 'FORECAST',
  analisis: 'ANALYSIS',
  analisa: 'ANALYSIS',
  ramalan: 'FORECAST',
  indonesia: 'INDONESIA',
  keterangan: 'LEGEND',
  keterangam: 'LEGEND',
  keterangn: 'LEGEND',
  legenda: 'LEGEND',
  batas: 'BORDER',
  propinsi: 'PROVINCIAL',
  provinsi: 'PROVINCIAL',
  luar: 'OVERSEAS',
  negeri: 'OVERSEAS',
  suhu: 'TEMPERATURE',
  udara: 'AIR',
  angin: 'WIND',
  tekanan: 'PRESSURE',
  kelembapan: 'HUMIDITY',
  kelembaban: 'HUMIDITY',
  perawanan: 'CLOUD',
  awan: 'CLOUD',
  normal: 'NORMAL',
  atas: 'ABOVE',
  bawah: 'BELOW',
  // tesseract sometimes glues "DI BAWAH"/"DI ATAS" into one word.
  diatas: 'ABOVE',
  dibawah: 'BELOW',
  rendah: 'LOW',
  menengah: 'MEDIUM',
  sedang: 'MEDIUM',
  tinggi: 'HIGH',
  sangat: 'VERY',
  agak: 'MODERATELY',
  cukup: 'MODERATELY',
  kering: 'DRY',
  basah: 'WET',
  hari: 'DAYS',
  bulan: 'MONTH',
  minggu: 'WEEK',
  tahun: 'YEAR',
  rata: 'AVERAGE',
  umum: 'GENERAL',
  mm: 'MM',
  ton: 'TON',
  sifat: 'CHARACTERISTICS',
  sifathujan: 'RAINFALL CHARACTERISTICS',
  sifatrainfall: 'RAINFALL CHARACTERISTICS',
  overseasnegeri: 'OVERSEAS',
  luarnegeri: 'OVERSEAS',
}

/** Word-sequence rules; the first matching (longest) entry wins. */
export const ID_EN_PHRASES = [
  // ---- full titles (the title cell is replaced as a single line) ----------
  [['peta', 'prakiraan', 'anomali', 'curah', 'hujan'], 'PRECIPITATION ANOMALY FORECAST MAP'],
  [['prediksi', 'sifat', 'hujan'], 'RAINFALL CHARACTERISTICS FORECAST'],
  [['prediksi', 'sifathujan'], 'RAINFALL CHARACTERISTICS FORECAST'],
  [['prediksi', 'sifatrainfall'], 'RAINFALL CHARACTERISTICS FORECAST'],
  [['peta', 'prakiraan', 'anomali', 'hujan'], 'RAINFALL ANOMALY FORECAST MAP'],
  [['peta', 'prakiraan', 'curah', 'hujan'], 'PRECIPITATION FORECAST MAP'],
  [['peta', 'analisis', 'anomali', 'curah', 'hujan'], 'PRECIPITATION ANOMALY ANALYSIS MAP'],
  [['peta', 'analisis', 'anomali', 'hujan'], 'RAINFALL ANOMALY ANALYSIS MAP'],
  [['peta', 'analisis', 'curah', 'hujan'], 'PRECIPITATION ANALYSIS MAP'],
  [['peta', 'anomali', 'curah', 'hujan'], 'RAINFALL ANOMALY MAP'],
  [['peta', 'anomali', 'hujan'], 'RAINFALL ANOMALY MAP'],
  [['peta', 'prakiraan', 'anomali', 'suhu', 'udara'], 'TEMPERATURE ANOMALY FORECAST MAP'],
  [['peta', 'prakiraan', 'suhu', 'udara'], 'TEMPERATURE FORECAST MAP'],
  [['peta', 'anomali', 'suhu', 'udara'], 'TEMPERATURE ANOMALY MAP'],
  [['peta', 'prakiraan', 'cuaca'], 'WEATHER FORECAST MAP'],
  [['peta', 'analisis', 'hujan'], 'PRECIPITATION ANALYSIS MAP'],
  [['peta', 'prakiraan', 'hujan'], 'PRECIPITATION FORECAST MAP'],
  [['peta', 'curah', 'hujan'], 'PRECIPITATION MAP'],
  [['peta', 'hujan'], 'PRECIPITATION MAP'],
  [['peta', 'suhu', 'udara'], 'AIR TEMPERATURE MAP'],
  [['peta', 'angin'], 'WIND MAP'],

  // ---- table headers -----------------------------------------------------
  [['prakiraan', 'anomali', 'curah', 'hujan'], 'PRECIPITATION ANOMALY FORECAST'],
  [['prakiraan', 'anomali', 'hujan'], 'RAINFALL ANOMALY FORECAST'],
  [['prakiraan', 'curah', 'hujan'], 'PRECIPITATION FORECAST'],
  [['analisis', 'anomali', 'curah', 'hujan'], 'PRECIPITATION ANOMALY ANALYSIS'],
  [['analisis', 'curah', 'hujan'], 'PRECIPITATION ANALYSIS'],
  [['anomali', 'curah', 'hujan'], 'RAINFALL ANOMALY'],
  [['anomali', 'hujan'], 'RAINFALL ANOMALY'],
  [['curah', 'hujan', 'bulanan'], 'MONTHLY RAINFALL'],
  [['curah', 'hujan'], 'RAINFALL'],
  [['anomali', 'suhu'], 'TEMPERATURE ANOMALY'],
  [['suhu', 'udara'], 'AIR TEMPERATURE'],
  [['tekanan', 'udara'], 'AIR PRESSURE'],
  [['arah', 'angin'], 'WIND DIRECTION'],
  [['kecepatan', 'angin'], 'WIND SPEED'],
  [['kelembapan', 'udara'], 'AIR HUMIDITY'],
  [['kelembaban', 'udara'], 'AIR HUMIDITY'],
  [['hari', 'hujan'], 'RAINY DAYS'],
  [['sifat', 'hujan'], 'RAINFALL CHARACTERISTICS'],

  // ---- legend / row labels ----------------------------------------------
  [['di', 'bawah', 'normal'], 'Below Normal'],
  [['di', 'atas', 'normal'], 'Above Normal'],
  [['bawah', 'normal'], 'Below Normal'],
  [['atas', 'normal'], 'Above Normal'],
  // tesseract sometimes glues "DI BAWAH"/"DI ATAS" into a single word.
  [['dibawah', 'normal'], 'Below Normal'],
  [['diatas', 'normal'], 'Above Normal'],
  [['sangat', 'tinggi'], 'Very High'],
  [['cukup', 'tinggi'], 'Moderately High'],
  [['agak', 'tinggi'], 'Moderately High'],
  [['sangat', 'rendah'], 'Very Low'],
  [['sangat', 'kering'], 'Very Dry'],
  [['sangat', 'basah'], 'Very Wet'],
  [['agak', 'kering'], 'Moderately Dry'],
  [['agak', 'basah'], 'Moderately Wet'],
  [['cukup', 'kering'], 'Moderately Dry'],
  [['cukup', 'basah'], 'Moderately Wet'],
  [['batas', 'propinsi'], 'Provincial Borders'],
  [['batas', 'provinsi'], 'Provincial Borders'],
  [['batas', 'wilayah'], 'Region Borders'],
  [['luar', 'negeri'], 'Overseas'],
  [['garis', 'pantai'], 'Coastline'],
  [['rata', 'rata'], 'Average'],
]

// Index phrases by their first word so matching stays cheap.
const PHRASES_BY_FIRST = new Map()
for (const [words, english] of ID_EN_PHRASES) {
  const key = words[0]
  if (!PHRASES_BY_FIRST.has(key)) PHRASES_BY_FIRST.set(key, [])
  PHRASES_BY_FIRST.get(key).push({ words, english })
}
for (const list of PHRASES_BY_FIRST.values()) {
  list.sort((a, b) => b.words.length - a.words.length)
}

/** Strip punctuation/spacing: "CURAH HUJAN (mm) :" token "mm" → "mm". */
export function tokenKey(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** True for tokens that can never be dictionary text (pure numbers/symbols). */
export function isNumericKey(key) {
  return key === '' || /^[0-9]+$/.test(key)
}

export function matchMonth(key) {
  const normalized = String(key ?? '').replace(/^\d+(?=[a-z])/, '')
  return MONTH_LOOKUP.get(normalized) || null
}

export function matchYear(raw) {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '')
  if (digits.length === 4) {
    const value = Number(digits)
    if (value >= 1900 && value <= 2100) return digits
  }
  return null
}

/**
 * Translate at a position using phrase rules first, then single tokens.
 * @returns {{text: string, consumed: number}|null}
 */
export function translateAt(keys, start) {
  const list = PHRASES_BY_FIRST.get(keys[start])
  if (list) {
    for (const phrase of list) {
      let ok = true
      for (let i = 0; i < phrase.words.length; i += 1) {
        if (keys[start + i] !== phrase.words[i]) {
          ok = false
          break
        }
      }
      if (ok) return { text: phrase.english, consumed: phrase.words.length }
    }
  }
  const single = ID_EN_TOKENS[keys[start]]
  if (single && !isNumericKey(keys[start])) return { text: single, consumed: 1 }
  return null
}

/** Collapse "RAINFALL RAINFALL" → "RAINFALL" and tidy spacing. */
export function tidyEnglish(words) {
  const flat = Array.isArray(words) ? words : String(words).split(' ')
  const out = []
  for (const word of flat) {
    if (!word) continue
    const previous = out[out.length - 1]
    if (previous && previous.toLowerCase() === word.toLowerCase()) continue
    out.push(word)
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Translate an entire token list into contiguous translated runs.
 * @returns {Array<{start:number, end:number, text:string}>}
 */
export function translateRuns(keys) {
  const runs = []
  let i = 0
  while (i < keys.length) {
    const first = translateAt(keys, i)
    if (!first) {
      i += 1
      continue
    }
    const start = i
    const parts = [first.text]
    i += first.consumed
    // Keep absorbing adjacent translatable tokens ("Batas Propinsi" + ":").
    for (;;) {
      const next = translateAt(keys, i)
      if (!next) break
      parts.push(next.text)
      i += next.consumed
    }
    runs.push({ start, end: i, text: tidyEnglish(parts.join(' ').split(' ')) })
  }
  return runs
}