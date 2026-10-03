import { useCallback, useEffect, useState } from 'react'

import { ArrowRightLeft, Camera, Cpu, RotateCcw, Share2, Upload } from 'lucide-react'

import { Notice, Pill, PrimaryButton, ProgressBar, StepCard } from '../../components/ui'
import { saveFile } from '../../lib/download'
import { MONTHS, currentMonthName, formatBytes } from '../../lib/format'
import { CALIBRATION, remasterMapLocally } from '../../lib/localMap'

const MAX_BYTES = 25 * 1024 * 1024

export default function TranslateMapTool({ notify }) {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [dimensions, setDimensions] = useState(null)
  const [month, setMonth] = useState(currentMonthName)
  const [year, setYear] = useState(() => String(new Date().getFullYear()))
  const [result, setResult] = useState(null) // { blob, url }
  const [view, setView] = useState('result') // 'original' | 'result'
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  useEffect(
    () => () => {
      if (result?.url) URL.revokeObjectURL(result.url)
    },
    [result],
  )

  // Read the pixel size locally so the calibration warning can be immediate.
  // Resetting happens in the picker handlers, so this effect only reacts to a
  // loaded image (never a synchronous setState).
  useEffect(() => {
    if (!previewUrl) return undefined
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled) setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.src = previewUrl
    return () => {
      cancelled = true
    }
  }, [previewUrl])

  const yearValue = year.trim()
  const yearValid = /^\d{4}$/.test(yearValue) && Number(yearValue) >= 1900 && Number(yearValue) <= 2100
  const sizeMismatch =
    dimensions && (dimensions.width !== CALIBRATION.width || dimensions.height !== CALIBRATION.height)

  const handlePicked = useCallback(
    (event) => {
      const picked = event.target.files?.[0]
      event.target.value = '' // so the same file can be picked again
      if (!picked) return

      if (!picked.type.startsWith('image/')) {
        notify('error', 'File harus berupa gambar (JPG, PNG, BMP, atau WEBP).')
        return
      }
      if (picked.size > MAX_BYTES) {
        notify('error', `Ukuran gambar ${formatBytes(picked.size)} melebihi batas 25 MB.`)
        return
      }

      setFile(picked)
      setPreviewUrl(URL.createObjectURL(picked))
      setDimensions(null)
      setResult(null)
      setView('result')
      notify('info', `${picked.name} siap diterjemahkan.`)
    },
    [notify],
  )

  const reset = () => {
    setFile(null)
    setPreviewUrl('')
    setResult(null)
    setDimensions(null)
    setView('result')
  }

  const handleTranslate = async () => {
    if (!file || busy) return
    if (!yearValid) {
      notify('error', 'Tahun harus 4 angka, contoh 2026.')
      return
    }

    setBusy(true)
    setProgress(10)

    try {
      // 100% client-side: OCR + rewrite run in this tab (see src/lib/localMap.js).
      const blob = await remasterMapLocally(file, month, yearValue, (pct) => {
        setProgress(pct)
      })

      setResult({ blob, url: URL.createObjectURL(blob) })
      setView('result')
      notify('success', `Peta ${month} ${yearValue} selesai diterjemahkan di HP.`)
    } catch (error) {
      notify('error', error.message || 'Gagal menerjemahkan peta.')
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  const handleSave = async () => {
    if (!result) return
    const filename = `map_${month.toLowerCase()}_${yearValue}.jpg`
    const outcome = await saveFile(result.blob, filename, {
      mime: 'image/jpeg',
      title: `Peta ${month} ${yearValue}`,
    })
    if (outcome === 'shared') notify('success', 'Hasil dikirim ke aplikasi pilihan Anda.')
    else if (outcome === 'downloaded') notify('success', `File ${filename} diunduh.`)
  }

  return (
    <div className="space-y-3">
      <header className="px-1 pb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Translate Peta</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            <Cpu className="h-3 w-3" />
            In-Device (Offline)
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          Legenda diterjemahkan langsung di mesin HP Anda. Saat pertama kali aplikasi mengunduh
          data bahasa OCR (±4 MB, sekali saja); setelahnya bisa diproses sepenuhnya offline.
        </p>
      </header>

      <StepCard
        step="1"
        title="Ambil gambar peta"
        subtitle="Foto langsung dari kamera atau pilih gambar yang sudah ada di HP."
      >
        <input
          id="map-camera"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePicked}
        />
        <input
          id="map-gallery"
          type="file"
          accept="image/*,.jpg,.jpeg,.png,.bmp,.webp"
          className="hidden"
          onChange={handlePicked}
        />

        <div className="grid grid-cols-2 gap-2">
          <label
            htmlFor="map-camera"
            className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-blue-600 font-bold text-white active:bg-blue-700"
          >
            <Camera className="h-5 w-5" />
            Kamera
          </label>
          <label
            htmlFor="map-gallery"
            className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white font-semibold text-slate-700 active:bg-slate-100"
          >
            <Upload className="h-5 w-5" />
            Galeri
          </label>
        </div>

        {file ? (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone="blue" className="max-w-full">
                {file.name}
              </Pill>
              <Pill>{formatBytes(file.size)}</Pill>
              {dimensions ? (
                <Pill>
                  {dimensions.width}×{dimensions.height} px
                </Pill>
              ) : null}
            </div>
            {sizeMismatch ? (
              <Notice tone="amber">
                Peta contoh berukuran {CALIBRATION.width}×{CALIBRATION.height} px. Ukuran lain tetap
                bisa diproses, tetapi posisi teks hasil bisa bergeser.
              </Notice>
            ) : null}
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 active:text-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Hapus gambar terpilih
            </button>
          </div>
        ) : null}
      </StepCard>

      <StepCard
        step="2"
        title="Pilih bulan & tahun"
        subtitle="Nilai ini menggantikan judul bulan/tahun pada peta hasil."
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1.5">
            <span className="block text-[12px] font-semibold text-slate-600">Bulan</span>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {MONTHS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-[12px] font-semibold text-slate-600">Tahun</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={year}
              onChange={(event) => setYear(event.target.value.replace(/[^\d]/g, ''))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <PrimaryButton
          icon={ArrowRightLeft}
          onClick={handleTranslate}
          disabled={!file || !yearValid || busy}
          loading={busy}
        >
          {busy ? 'Memproses…' : 'Translate peta'}
        </PrimaryButton>

        {busy ? (
          <div className="space-y-1.5 pt-1">
            <ProgressBar value={progress || 4} />
            <p className="text-[11px] text-slate-500">
              {progress >= 100 ? 'Menyimpan hasil…' : `Menerjemahkan di HP… ${progress}%`}
            </p>
          </div>
        ) : null}
      </StepCard>

      {previewUrl ? (
        <StepCard
          step="3"
          title="Hasil translate"
          subtitle={
            result
              ? 'Bandingkan gambar asli dengan hasil, lalu simpan ke HP.'
              : 'Hasil akan muncul di sini setelah proses selesai.'
          }
        >
          <div className="flex rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setView('original')}
              className={`h-9 flex-1 rounded-xl text-[13px] font-semibold transition-colors ${
                !result || view === 'original' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Asli
            </button>
            <button
              type="button"
              disabled={!result}
              onClick={() => setView('result')}
              className={`h-9 flex-1 rounded-xl text-[13px] font-semibold transition-colors disabled:text-slate-400 ${
                result && view === 'result' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Hasil
            </button>
          </div>

          <img
            src={!result || view === 'original' ? previewUrl : result.url}
            alt={!result || view === 'original' ? 'Peta asli' : 'Peta hasil translate'}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50"
          />

          {result ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone="emerald">Selesai</Pill>
                <Pill>JPEG · {formatBytes(result.blob.size)}</Pill>
              </div>
              <PrimaryButton icon={Share2} onClick={handleSave}>
                Simpan / Bagikan
              </PrimaryButton>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Di HP tombol ini membuka menu bagikan (pilih “Simpan ke Files”/“Simpan ke Galeri”);
                di desktop file langsung diunduh sebagai JPEG.
              </p>
            </>
          ) : (
            <p className="text-[12px] leading-relaxed text-slate-500">
              Tekan “Translate peta” di langkah 2 untuk memproses gambar ini.
            </p>
          )}
        </StepCard>
      ) : null}

      <p className="px-1 pb-2 text-center text-[11px] leading-relaxed text-slate-400">
        Proses berjalan sepenuhnya di browser (PWA) — tidak ada gambar yang dikirim ke server
        mana pun.
      </p>
    </div>
  )
}
