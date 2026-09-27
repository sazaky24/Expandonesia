/**
 * Local (Client-Side) Excel Unpivoter using ExcelJS.
 * Runs 100% in the browser / mobile phone. No backend / PC needed.
 */
import ExcelJS from 'exceljs'

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

function extractMatrix(sheet, valueName) {
  const rowCount = sheet.rowCount
  const colCount = sheet.columnCount

  const rows = []
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r)
    const rowVals = []
    for (let c = 1; c <= colCount; c++) {
      rowVals.push(row.getCell(c).value)
    }
    rows.push(rowVals)
  }

  if (rows.length < 3) return new Map()

  const r0 = rows[0] // Baris 0: Negara (ffill)
  const r1 = rows[1] // Baris 1: Pelabuhan

  // Forward fill negara
  const negaraList = []
  let lastNegara = ''
  for (let c = 1; c < colCount; c++) {
    const raw = cleanCellValue(r0[c]).trim()
    const lower = raw.toLowerCase()
    if (raw && lower !== 'none' && lower !== 'nan' && lower !== 'null') {
      lastNegara = raw
    }
    negaraList.push(lastNegara)
  }

  // Pelabuhan list
  const pelabuhanList = []
  for (let c = 1; c < colCount; c++) {
    pelabuhanList.push(cleanCellValue(r1[c]).trim())
  }

  const records = new Map()

  // Data rows (baris 2 onwards)
  for (let r = 2; r < rows.length; r++) {
    const labelRaw = cleanCellValue(rows[r][0]).trim()
    const labelLower = labelRaw.toLowerCase()
    if (!labelRaw || ['totals', 'total', 'nan', '', 'none', 'null'].includes(labelLower)) {
      continue
    }

    // Ekstraksi kode SH: [Kode] Nama Produk
    const match = labelRaw.match(/\[\s*(.*?)\s*\]\s*(.*)/)
    const kode = match ? match[1].trim() : labelRaw
    const produk = match ? match[2].trim() : ''

    for (let c = 1; c < colCount; c++) {
      const neg = negaraList[c - 1]
      const pel = pelabuhanList[c - 1]
      if (!neg || !pel) continue

      const negLower = neg.toLowerCase()
      const pelLower = pel.toLowerCase()
      if (negLower.includes('total') || pelLower.includes('total')) continue

      const numVal = parseNumber(rows[r][c])
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

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(arrayBuffer)

  const sheets = workbook.worksheets
  if (sheets.length < 2) {
    throw new Error('File harus memiliki minimal 2 sheet (Weight dan Value).')
  }

  if (onProgress) onProgress(55)

  const wMap = extractMatrix(sheets[0], 'berat')
  const vMap = extractMatrix(sheets[1], 'nilai')

  // Outer merge on [Kode, Produk, Negara, Pelabuhan]
  const allKeys = new Set([...wMap.keys(), ...vMap.keys()])
  const merged = []

  for (const key of allKeys) {
    const w = wMap.get(key) || {}
    const v = vMap.get(key) || {}
    const [kode, produk, negara, pelabuhan] = key.split('|||')
    const berat = w.berat !== undefined ? w.berat : null
    const nilai = v.nilai !== undefined ? v.nilai : null
    const beratTon = berat !== null ? berat / 1000.0 : null

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
    { header: 'Berat', key: 'berat', width: 16, style: { numFmt: '#,##0.00' } },
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
