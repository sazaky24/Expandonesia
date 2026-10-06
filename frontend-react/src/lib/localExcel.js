/**
 * Local (Client-Side) Excel Unpivoter.
 * Runs 100% in the browser / mobile phone. No backend / PC needed.
 *
 * ExcelJS is lazy-loaded (dynamic import) so the initial Pages bundle stays
 * small — it is only downloaded when the user runs a local transform.
 */

function cleanCellValue(val) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'object') {
    if (val.result !== undefined && val.result !== null) return cleanCellValue(val.result)
    if (Array.isArray(val.richText)) return val.richText.map((t) => t.text || '').join('')
    if (val.text !== undefined && val.text !== null) return String(val.text)
  }
  return String(val)
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'object' && val.result !== undefined) val = val.result
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  const str = String(val).replace(/,/g, '').trim()
  if (!str) return null
  const num = Number(str)
  return Number.isFinite(num) ? num : null
}

function isYellowCell(cell) {
  const fill = cell.fill
  if (fill?.type !== 'pattern' || fill.pattern !== 'solid') return false
  const color = String(fill.fgColor?.argb || '').toUpperCase()
  return color.endsWith('FFFF00') || Number(fill.fgColor?.indexed) === 6
}

function findYellowBands(sheet) {
  const yellowRows = new Set()
  const yellowColumns = new Set()
  const rowCount = sheet.rowCount
  const columnCount = sheet.columnCount
  const coverage = 0.8

  for (let r = 1; r <= rowCount; r += 1) {
    let yellowCount = 0
    for (let c = 1; c <= columnCount; c += 1) {
      if (isYellowCell(sheet.getCell(r, c))) yellowCount += 1
    }
    if (yellowCount / columnCount >= coverage) yellowRows.add(r)
  }

  for (let c = 1; c <= columnCount; c += 1) {
    let yellowCount = 0
    for (let r = 1; r <= rowCount; r += 1) {
      if (isYellowCell(sheet.getCell(r, c))) yellowCount += 1
    }
    if (yellowCount / rowCount >= coverage) yellowColumns.add(c)
  }

  return { yellowRows, yellowColumns }
}

function normalizeHeader(value) {
  return cleanCellValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findHeaderRows(sheet, yellowRows) {
  let countryRow = -1
  let portRow = -1
  let countryLabelColumn = -1

  for (let r = 1; r <= sheet.rowCount; r += 1) {
    if (yellowRows.has(r)) continue
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const value = normalizeHeader(sheet.getCell(r, c).value)
      if (countryRow < 0 && /\b(negara|country)\b/.test(value)) {
        countryRow = r
        countryLabelColumn = c
      }
      if (portRow < 0 && /\b(pelabuhan|port)\b/.test(value)) portRow = r
    }
  }

  if (countryRow >= 0 && portRow >= 0) {
    return { countryRow, portRow, firstMatrixColumn: countryLabelColumn + 1 }
  }

  let firstDataRow = sheet.rowCount + 1
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const label = cleanCellValue(sheet.getCell(r, 1).value).trim()
    if (/^\[\s*.+?\s*]\s*\S/.test(label)) {
      firstDataRow = r
      break
    }
  }

  const candidates = []
  for (let r = 1; r < firstDataRow; r += 1) {
    if (yellowRows.has(r)) continue
    const values = new Set()
    for (let c = 2; c <= sheet.columnCount; c += 1) {
      const value = normalizeHeader(sheet.getCell(r, c).value)
      if (value) values.add(value)
    }
    if (values.size >= 2) candidates.push(r)
  }

  if (candidates.length >= 2) {
    const [countryHeader, portHeader] = candidates.slice(-2)
    return {
      countryRow: countryHeader,
      portRow: portHeader,
      firstMatrixColumn: 2,
    }
  }

  const nonYellowRows = []
  for (let r = 1; r < firstDataRow; r += 1) {
    if (!yellowRows.has(r)) nonYellowRows.push(r)
  }
  if (nonYellowRows.length < 2) {
    throw new Error(`Header Negara dan Pelabuhan tidak ditemukan pada sheet "${sheet.name}".`)
  }
  const [countryHeader, portHeader] = nonYellowRows.slice(-2)
  return {
    countryRow: countryHeader,
    portRow: portHeader,
    firstMatrixColumn: 2,
  }
}

function extractMatrix(sheet, valueName) {
  const rowCount = sheet.rowCount
  const colCount = sheet.columnCount
  if (rowCount < 3 || colCount < 2) return new Map()

  const { yellowRows, yellowColumns } = findYellowBands(sheet)
  const { countryRow, portRow, firstMatrixColumn } = findHeaderRows(sheet, yellowRows)
  const negaraByColumn = new Map()
  let lastNegara = ''
  for (let c = firstMatrixColumn; c <= colCount; c += 1) {
    if (yellowColumns.has(c)) {
      lastNegara = ''
      continue
    }
    const raw = cleanCellValue(sheet.getCell(countryRow, c).value).trim()
    const lower = raw.toLowerCase()
    if (raw && lower !== 'none' && lower !== 'nan' && lower !== 'null') {
      lastNegara = raw
    }
    negaraByColumn.set(c, lastNegara)
  }

  const records = new Map()

  for (let r = Math.max(countryRow, portRow) + 1; r <= rowCount; r += 1) {
    if (yellowRows.has(r)) continue
    const labelRaw = cleanCellValue(sheet.getCell(r, 1).value).trim()
    const labelLower = labelRaw.toLowerCase()
    if (!labelRaw || ['totals', 'total', 'nan', '', 'none', 'null'].includes(labelLower)) {
      continue
    }

    // Ekstraksi kode SH: [Kode] Nama Produk
    const match = labelRaw.match(/\[\s*(.*?)\s*\]\s*(.*)/)
    const kode = match ? match[1].trim() : labelRaw
    const produk = match ? match[2].trim() : ''

    for (let c = firstMatrixColumn; c <= colCount; c += 1) {
      if (yellowColumns.has(c)) continue
      const neg = negaraByColumn.get(c)
      const pel = cleanCellValue(sheet.getCell(portRow, c).value).trim()
      if (!neg || !pel) continue

      const negLower = neg.toLowerCase()
      const pelLower = pel.toLowerCase()
      if (negLower.includes('total') || pelLower.includes('total')) continue

      const numVal = parseNumber(sheet.getCell(r, c).value)
      if (numVal === null) continue // dropna

      const key = `${kode}|||${produk}|||${neg}|||${pel}`
      records.set(key, {
        kode,
        produk,
        negara: neg,
        pelabuhan: pel,
        [valueName]: numVal,
      })
    }
  }

  return records
}

/**
 * Transforms an Excel File/Blob locally and returns a new .xlsx Blob.
 * @param {Blob|File|ArrayBuffer} data
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<Blob>}
 */
export async function transformExcelLocally(data, onProgress) {
  if (onProgress) onProgress(15)

  let arrayBuffer
  if (data instanceof ArrayBuffer) {
    arrayBuffer = data
  } else if (data?.arrayBuffer) {
    arrayBuffer = await data.arrayBuffer()
  } else {
    throw new Error('Data input tidak valid')
  }

  if (onProgress) onProgress(35)

  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(arrayBuffer)

  const sheets = workbook.worksheets
  if (sheets.length < 2) {
    throw new Error('File harus memiliki minimal 2 sheet (Weight dan Value).')
  }

  if (onProgress) onProgress(55)

  // Match the provided result workbook: first matrix supplies Nilai, second supplies Berat.
  const vMap = extractMatrix(sheets[0], 'nilai')
  const wMap = extractMatrix(sheets[1], 'berat')

  // Outer merge on [Kode, Produk, Negara, Pelabuhan]
  const allKeys = new Set([...wMap.keys(), ...vMap.keys()])
  const merged = []

  for (const key of allKeys) {
    const w = wMap.get(key) || {}
    const v = vMap.get(key) || {}
    const [kode, produk, negara, pelabuhan] = key.split('|||')
    const berat = w.berat !== undefined ? w.berat / 1000 : null
    const nilai = v.nilai !== undefined ? v.nilai : null
    const beratTon = berat !== null ? berat / 1000 : null

    merged.push({
      kode,
      produk,
      negara,
      pelabuhan,
      berat,
      nilai,
      beratTon,
    })
  }

  // Sort by [Kode, Negara, Pelabuhan]
  merged.sort((a, b) => {
    if (a.kode !== b.kode) return a.kode.localeCompare(b.kode, undefined, { numeric: true })
    if (a.negara !== b.negara) return a.negara.localeCompare(b.negara)
    return a.pelabuhan.localeCompare(b.pelabuhan)
  })

  if (onProgress) onProgress(75)

  // Build new output workbook
  const outWb = new ExcelJS.Workbook()
  outWb.creator = 'FastWork Mobile'
  outWb.created = new Date()

  const outWs = outWb.addWorksheet('data_matang', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  outWs.columns = [
    { header: 'Kode', key: 'kode', width: 14 },
    { header: 'Produk', key: 'produk', width: 36 },
    { header: 'Negara', key: 'negara', width: 22 },
    { header: 'Pelabuhan', key: 'pelabuhan', width: 22 },
    { header: 'Berat', key: 'berat', width: 16, style: { numFmt: '#,##0.000' } },
    { header: 'Nilai', key: 'nilai', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'Berat (Ton)', key: 'beratTon', width: 16, style: { numFmt: '#,##0.000' } },
  ]

  // Header row styling
  const headerRow = outWs.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate 800
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

  // Add data rows
  for (const row of merged) {
    outWs.addRow({
      kode: row.kode,
      produk: row.produk,
      negara: row.negara,
      pelabuhan: row.pelabuhan,
      berat: row.berat,
      nilai: row.nilai,
      beratTon: row.beratTon,
    })
  }

  if (onProgress) onProgress(90)

  const buffer = await outWb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  if (onProgress) onProgress(100)

  return blob
}
