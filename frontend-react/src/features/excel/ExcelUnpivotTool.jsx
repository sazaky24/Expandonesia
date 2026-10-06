import { useCallback, useState } from 'react'

import { Cpu, FileSpreadsheet, RotateCcw, Share2, Upload, Zap } from 'lucide-react'

import { Notice, Pill, PrimaryButton, ProgressBar, StepCard } from '../../components/ui'
import { postForm } from '../../lib/api'
import { saveFile } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { transformExcelLocally } from '../../lib/localExcel'

const MAX_BYTES = 50 * 1024 * 1024
const ACCEPTED = ['.xlsx', '.xls']
const RESULT_FILENAME = 'data_matang.xlsx'
const OUTPUT_COLUMNS = ['Kode', 'Produk', 'Negara', 'Pelabuhan', 'Berat', 'Nilai', 'Berat (Ton)']

/**
 * Data Excel — runs 100% inside the phone via ExcelJS (zero backend/PC needed),
 * with fallback to FastAPI if requested.
 */
export default function ExcelUnpivotTool({ notify, useLocalEngine = true }) {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null) // { blob }
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  const handlePicked = useCallback(
    (event) => {
      const picked = event.target.files?.[0]
      event.target.value = '' // so the same file can be picked again
      if (!picked) return

      const name = picked.name.toLowerCase()
      if (!ACCEPTED.some((extension) => name.endsWith(extension))) {
        notify('error', 'File harus berformat .xlsx atau .xls.')
        return
      }
      if (picked.size > MAX_BYTES) {
        notify('error', `Ukuran file ${formatBytes(picked.size)} melebihi batas 50 MB.`)
        return
      }

      setFile(picked)
      setResult(null)
      notify('info', `${picked.name} siap ditransformasi.`)
    },
    [notify],
  )

  const reset = () => {
    setFile(null)
    setResult(null)
    setProgress(0)
  }

  const handleTransform = async () => {
    if (!file || busy) return

    setBusy(true)
    setProgress(10)

    try {
      let blob

      if (useLocalEngine) {
        // Pemrosesan 100% di HP via ExcelJS (bisa offline tanpa PC/backend)
        blob = await transformExcelLocally(file, (pct) => {
          setProgress(pct)
        })
      } else {
        // Fallback backend FastAPI
        const formData = new FormData()
        formData.append('file', file)

        blob = await postForm('/transform', formData, {
          onUploadProgress: (event) => {
            if (event.total) setProgress(Math.round((event.loaded / event.total) * 100))
          },
        })
      }

      setResult({ blob })
      notify('success', `Transformasi selesai di HP (${formatBytes(blob.size)}).`)
    } catch (error) {
      notify('error', error.message || 'Gagal memproses file Excel.')
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  const handleSave = async () => {
    if (!result) return
    const outcome = await saveFile(result.blob, RESULT_FILENAME, {
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      title: 'Tabel hasil transformasi',
    })
    if (outcome === 'shared') notify('success', 'Hasil dikirim ke aplikasi pilihan Anda.')
    else if (outcome === 'downloaded') notify('success', `File ${RESULT_FILENAME} diunduh.`)
  }

  return (
    <div className="space-y-3">
      <header className="px-1 pb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Data Excel</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            <Cpu className="h-3 w-3" />
            In-Device (Offline)
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          Ubah Excel matriks menjadi tabel datar. Kolom Berat (Ton) dihitung dari Berat dibagi 1.000.
        </p>
      </header>

      <StepCard
        step="1"
        title="Pilih file Excel"
        subtitle="Satu workbook berisi dua matriks berat dan nilai. Baris/kolom berpita kuning dilewati."
      >
        <input
          id="excel-upload"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={handlePicked}
        />
        <label
          htmlFor="excel-upload"
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
            file ? 'border-blue-400 bg-blue-50' : 'border-slate-300 active:bg-slate-50'
          }`}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-slate-500 shadow-sm">
            <FileSpreadsheet className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold text-slate-900">
            {file ? file.name : 'Ketuk untuk memilih file .xlsx'}
          </span>
          <span className="text-[11px] text-slate-500">XLSX atau XLS · maksimal 50 MB</span>
        </label>

        {file ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill>{formatBytes(file.size)}</Pill>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 active:text-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Hapus file terpilih
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
            <Upload className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Baris <strong>Negara</strong> dan <strong>Pelabuhan</strong> dikenali dari label atau
              susunan header; nama negara pada sel gabungan diisi ke kolom berikutnya.
            </span>
          </div>
        )}
      </StepCard>

      <StepCard
        step="2"
        title="Jalankan transformasi"
        subtitle="Workbook dibaca di memori, baris/kolom kuning dilewati, lalu data diubah menjadi tabel datar."
      >
        <PrimaryButton
          icon={Zap}
          onClick={handleTransform}
          disabled={!file || busy}
          loading={busy}
        >
          {busy ? 'Memproses…' : 'Transformasi'}
        </PrimaryButton>

        {busy ? (
          <div className="space-y-1.5 pt-1">
            <ProgressBar value={progress || 4} />
            <p className="text-[11px] text-slate-500">
              {progress >= 100
                ? 'Menyimpan hasil…'
                : `Memproses Excel… ${progress}%`}
            </p>
          </div>
        ) : null}
      </StepCard>

      {result ? (
        <StepCard step="3" title="Hasil" subtitle="Tabel datar dengan kolom berikut.">
          <div className="flex flex-wrap items-center gap-1.5">
            {OUTPUT_COLUMNS.map((column) => (
              <Pill key={column} tone="blue">
                {column}
              </Pill>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone="emerald">Selesai</Pill>
            <Pill>XLSX · {formatBytes(result.blob.size)}</Pill>
          </div>

          <PrimaryButton icon={Share2} onClick={handleSave}>
            Simpan / Bagikan
          </PrimaryButton>

          <Notice tone="slate">
            Hasil hanya berada di memori aplikasi. Jika app ditutup sebelum disimpan, jalankan
            transformasi sekali lagi.
          </Notice>
        </StepCard>
      ) : null}

      <p className="px-1 pb-2 text-center text-[11px] leading-relaxed text-slate-400">
        Berat (Ton) = Berat ÷ 1.000. Pita kuning pada baris atau kolom dilewati; file asli tidak diubah.
      </p>
    </div>
  )
}
