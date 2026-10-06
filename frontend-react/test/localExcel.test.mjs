import assert from 'node:assert/strict'
import test from 'node:test'

import ExcelJS from 'exceljs'

import { transformExcelLocally } from '../src/lib/localExcel.js'

const YELLOW_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' },
}

async function transformWorkbook(workbook) {
  const input = new Blob([await workbook.xlsx.writeBuffer()])
  const output = await transformExcelLocally(input)
  const result = new ExcelJS.Workbook()
  await result.xlsx.load(await output.arrayBuffer())
  return result.worksheets[0]
}

function addLabeledMatrix(workbook, sheetName, values, { highlightDataRow = false } = {}) {
  const sheet = workbook.addWorksheet(sheetName)
  sheet.mergeCells('A1:F1')
  sheet.getCell('A1').value = 'Impor Full HS Tahun 2026'
  sheet.getCell('C2').value = 'Negara/Wilayah/Entitas Tertentu'
  sheet.getCell('C3').value = 'Pelabuhan'
  sheet.mergeCells('D2:E2')
  sheet.getCell('D2').value = 'AUSTRALIA'
  sheet.getCell('D3').value = 'BELAWAN'
  sheet.getCell('E3').value = 'TANJUNG PRIOK'
  sheet.getCell('C2').fill = YELLOW_FILL
  sheet.getCell('C3').fill = YELLOW_FILL

  for (let c = 1; c <= 6; c += 1) {
    sheet.getCell(4, c).fill = YELLOW_FILL
    sheet.getCell(5, c).fill = YELLOW_FILL
  }
  for (let r = 1; r <= 8; r += 1) sheet.getCell(r, 6).fill = YELLOW_FILL

  sheet.getCell('A6').value = '[09011120] Arabica coffee'
  sheet.getCell('D6').value = values[0]
  sheet.getCell('E6').value = values[1]

  sheet.getCell('A7').value = '[09011130] Highlighted product'
  sheet.getCell('D7').value = 50000
  sheet.getCell('E7').value = 60000
  if (highlightDataRow) {
    for (let c = 1; c <= 6; c += 1) sheet.getCell(7, c).fill = YELLOW_FILL
  }

  return sheet
}

test('labeled matrices map values like the provided result and skip yellow bands', async () => {
  const workbook = new ExcelJS.Workbook()
  addLabeledMatrix(workbook, 'Weight', [160130, 1053], { highlightDataRow: true })
  addLabeledMatrix(workbook, 'Value', [19200, 30], { highlightDataRow: true })

  const output = await transformWorkbook(workbook)
  const headers = output.getRow(1).values.slice(1)
  assert.deepEqual(headers, ['Kode', 'Produk', 'Negara', 'Pelabuhan', 'Berat', 'Nilai', 'Berat (Ton)'])
  assert.equal(output.rowCount, 3)

  const first = output.getRow(2).values.slice(1)
  assert.deepEqual(first, ['09011120', 'Arabica coffee', 'AUSTRALIA', 'BELAWAN', 19.2, 160130, 0.0192])
  const second = output.getRow(3).values.slice(1)
  assert.deepEqual(second.slice(0, 6), [
    '09011120',
    'Arabica coffee',
    'AUSTRALIA',
    'TANJUNG PRIOK',
    0.03,
    1053,
  ])
  assert.ok(Math.abs(second[6] - 0.00003) < Number.EPSILON)
})

test('two-row matrices without explicit header labels are still supported', async () => {
  const workbook = new ExcelJS.Workbook()
  for (const [name, values] of [['Weight', [3500]], ['Value', [800]]]) {
    const sheet = workbook.addWorksheet(name)
    sheet.getCell('A1').value = 'Import Full HS 2026'
    sheet.getCell('B2').value = 'CANADA'
    sheet.getCell('B3').value = 'VANCOUVER'
    sheet.getCell('A4').value = '[09011120] Arabica coffee'
    sheet.getCell('B4').value = values[0]
  }

  const output = await transformWorkbook(workbook)
  assert.deepEqual(output.getRow(2).values.slice(1), [
    '09011120',
    'Arabica coffee',
    'CANADA',
    'VANCOUVER',
    0.8,
    3500,
    0.0008,
  ])
})
