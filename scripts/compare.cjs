const ExcelJS = require('exceljs')
const path = require('path')

const files = [
  'c:\\Projek\\ProjekAyah\\output\\data_matang (3).xlsx',
  'c:\\Projek\\ProjekAyah\\output\\data_matang.xlsx',
]

async function load(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  const header = []
  ws.getRow(1).eachCell((cell, c) => { header.push(String(cell.value || '')) })
  const rows = []
  ws.eachRow((row, r) => {
    if (r === 1) return
    const obj = {}
    row.eachCell((cell, c) => { obj[header[c - 1] || `C${c}`] = cell.value })
    if (Object.values(obj).some(v => v !== null && v !== undefined && v !== '')) rows.push(obj)
  })
  rows.sort((a, b) => String(a.Kode || '').localeCompare(String(b.Kode || ''), undefined, { numeric: true }))
  return { name: path.basename(file), header, rows }
}

async function main() {
  const loaded = await Promise.all(files.map(load))
  for (const { name, header, rows } of loaded) {
    console.log('\n================', name, '================')
    console.log('COLUMNS:', header.join(' | '))
    console.log('ROW COUNT:', rows.length)
    rows.slice(0, 15).forEach((row, i) => {
      console.log(`\n-- ROW ${i + 1} --`)
      header.forEach(h => {
        const v = row[h]
        if (v === undefined || v === null || v === '') return
        let s = typeof v === 'object' ? JSON.stringify(v) : String(v)
        console.log(`  ${h}: ${s}`)
      })
    })
    if (rows.length > 15) console.log(`\n... (${rows.length - 15} more rows omitted)`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
