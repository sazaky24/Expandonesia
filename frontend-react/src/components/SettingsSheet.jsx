import { useEffect, useState } from 'react'

import { Check, Download, HardDrive, Link, RefreshCw, RotateCcw, Share2, Smartphone, TriangleAlert, X, Zap } from 'lucide-react'

import { GhostButton, PrimaryButton } from './ui'
import { checkHealth, describeApiBase } from '../lib/api'
import { isIosDevice } from '../lib/pwa'

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span className="text-right text-[13px] font-semibold text-slate-800">{children}</span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Bottom sheet with everything device-specific: which backend to talk to,
 * whether the app can be installed, and the service-worker state.
 */
export default function SettingsSheet({
  onClose,
  apiUrl,
  customUrl,
  autoUrl,
  useLocalEngine = true,
  onToggleEngine,
  health,
  onSave,
  onReset,
  onCheck,
  online,
  sw,
  install,
  notify,
}) {
  const [urlDraft, setUrlDraft] = useState(customUrl || '')
  const [busy, setBusy] = useState('')

  // The sheet is only mounted while it is open (see App.jsx), so locking the page
  // behind it can be a plain mount effect.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const handleSave = () => {
    onSave(urlDraft)
    notify('success', 'Alamat backend disimpan.')
    onCheck(urlDraft || autoUrl)
  }

  const handleReset = () => {
    onReset()
    setUrlDraft('')
    notify('info', 'Alamat backend dikembalikan ke mode otomatis.')
    onCheck(autoUrl)
  }

  const handleTest = async () => {
    setBusy('test')
    const result = await checkHealth(urlDraft || apiUrl)
    setBusy('')
    notify(result.ok ? 'success' : 'error', result.message)
  }

  const handleInstall = async () => {
    setBusy('install')
    const outcome = await install.promptInstall()
    setBusy('')
    if (outcome === 'accepted') notify('success', 'Aplikasi dipasang di layar utama.')
    else if (outcome === 'dismissed') notify('info', 'Pemasangan dibatalkan.')
  }

  const handleClearCache = async () => {
    setBusy('cache')
    const cleared = await sw.clearCache()
    setBusy('')
    notify(
      cleared ? 'success' : 'error',
      cleared ? 'Cache aplikasi dibersihkan.' : 'Gagal membersihkan cache aplikasi.',
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Tutup pengaturan"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-slate-900/40"
      />

      <div className="animate-sheet-up relative flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">Pengaturan</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 active:bg-slate-200"
          >
            <X className="h-4 w-4 text-slate-600" />
          </button>
        </div>

        <div className="pb-safe flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <Section title="Engine Pemrosesan">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="engine"
                  checked={useLocalEngine}
                  onChange={() => onToggleEngine(true)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="space-y-0.5">
                  <span className="block text-sm font-bold text-slate-800">
                    Mesin HP Lokal (100% Offline)
                  </span>
                  <span className="block text-xs leading-relaxed text-slate-500">
                    Memproses translate peta & unpivot Excel langsung di dalam browser/PWA smartphone Anda menggunakan Web Canvas &amp; ExcelJS. Tidak butuh koneksi internet atau laptop PC menyala sama sekali.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-slate-200/80">
                <input
                  type="radio"
                  name="engine"
                  checked={!useLocalEngine}
                  onChange={() => onToggleEngine(false)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="space-y-0.5">
                  <span className="block text-sm font-bold text-slate-800">
                    Backend FastAPI Server (PC / Cloud)
                  </span>
                  <span className="block text-xs leading-relaxed text-slate-500">
                    Mengirim file ke server Python FastAPI di PC lokal / tunnel untuk pemrosesan.
                  </span>
                </div>
              </label>
            </div>
          </Section>

          <Section title="Status">
            <div className="rounded-2xl bg-slate-50 px-3 py-1">
              <Row label="Mode aktif">
                {useLocalEngine ? (
                  <span className="text-emerald-600 font-bold">In-Device (Offline)</span>
                ) : (
                  <span className="text-blue-600 font-bold">Backend FastAPI</span>
                )}
              </Row>
              <Row label="Jaringan HP">{online ? 'Terhubung' : 'Tidak ada internet'}</Row>
              {!useLocalEngine ? (
                <Row label="Backend FastAPI">
                  {health.checking ? (
                    <span className="text-slate-400">memeriksa…</span>
                  ) : health.ok ? (
                    <span className="text-emerald-600">aktif</span>
                  ) : health.ok === false ? (
                    <span className="text-red-600">tidak terjangkau</span>
                  ) : (
                    <span className="text-slate-400">belum diperiksa</span>
                  )}
                </Row>
              ) : null}
              <Row label="Mode aplikasi">{install.installed ? 'Terpasang' : 'Browser'}</Row>
              <Row label="Shell offline">
                {sw.offlineReady ? 'siap' : sw.supported ? 'menunggu' : 'tidak aktif'}
              </Row>
            </div>
            {!useLocalEngine && health.message ? (
              <p className="text-[12px] leading-relaxed text-slate-500">{health.message}</p>
            ) : null}
          </Section>

          <Section title="Alamat backend">
            <label className="block text-[12px] font-semibold text-slate-600" htmlFor="api-url">
              URL backend (kosongkan = otomatis)
            </label>
            <input
              id="api-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={urlDraft}
              placeholder={autoUrl}
              onChange={(event) => setUrlDraft(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <p className="text-[12px] leading-relaxed text-slate-500">
              Aktif sekarang:{' '}
              <span className="font-semibold text-slate-700">{describeApiBase(apiUrl)}</span>
              {customUrl ? ' — manual' : ' — otomatis'}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <GhostButton icon={Zap} onClick={handleTest} disabled={busy === 'test'}>
                {busy === 'test' ? 'Menguji…' : 'Uji koneksi'}
              </GhostButton>
              <GhostButton icon={RotateCcw} onClick={handleReset} disabled={busy !== ''}>
                Kembalikan otomatis
              </GhostButton>
            </div>
            <PrimaryButton icon={Check} onClick={handleSave} disabled={busy !== ''}>
              Simpan alamat
            </PrimaryButton>

            <div className="flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[12px] leading-relaxed text-blue-800">
              <Link className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1.5">
                <p>
                  <strong>Satu jaringan Wi-Fi:</strong>{' '}
                  <code className="font-semibold">http://192.168.1.10:8000</code> — pakai IP LAN PC
                  yang menjalankan FastAPI, bukan <code>localhost</code>.
                </p>
                <p>
                  <strong>Beda jaringan / pakai tunnel:</strong> kosongkan kolom di atas. Aplikasi
                  otomatis memanggil <code className="font-semibold">/api</code> pada origin yang
                  sama, dan Vite meneruskannya ke FastAPI di PC.
                </p>
              </div>
            </div>
          </Section>

          <Section title="Pasang sebagai aplikasi">
            {install.installed ? (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] font-semibold text-emerald-700">
                <Smartphone className="h-4 w-4 shrink-0" />
                Aplikasi sudah terpasang dan berjalan di mode standalone.
              </div>
            ) : install.canInstall ? (
              <>
                <PrimaryButton
                  icon={Download}
                  onClick={handleInstall}
                  disabled={busy === 'install'}
                >
                  {busy === 'install' ? 'Memproses…' : 'Pasang aplikasi'}
                </PrimaryButton>
                <p className="text-[12px] leading-relaxed text-slate-500">
                  Ikon aplikasi akan ditambahkan ke layar utama HP.
                </p>
              </>
            ) : (
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
                <p className="flex items-center gap-2 font-semibold text-slate-700">
                  <Share2 className="h-4 w-4 shrink-0" />
                  Cara memasang manual
                </p>
                {isIosDevice() ? (
                  <p>
                    Safari iOS: ketuk tombol <strong>Bagikan</strong> → pilih{' '}
                    <strong>Tambahkan ke Layar Utama</strong>.
                  </p>
                ) : (
                  <p>
                    Chrome Android: buka menu <strong>⋮</strong> → pilih <strong>Install app</strong>{' '}
                    / <strong>Tambahkan ke layar utama</strong>.
                  </p>
                )}
                <p className="text-slate-500">
                  Tombol pasang otomatis hanya muncul bila aplikasi dibuka dari alamat aman (HTTPS
                  atau <code>localhost</code>).
                </p>
              </div>
            )}
          </Section>

          <Section title="Aplikasi &amp; cache">
            {sw.needRefresh ? (
              <PrimaryButton icon={RefreshCw} onClick={sw.applyUpdate}>
                Versi baru tersedia — muat ulang
              </PrimaryButton>
            ) : null}

            <GhostButton
              icon={HardDrive}
              onClick={handleClearCache}
              disabled={busy === 'cache'}
              className="w-full"
            >
              {busy === 'cache' ? 'Membersihkan…' : 'Bersihkan cache aplikasi'}
            </GhostButton>

            {sw.error ? (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Service worker tidak aktif ({sw.error}). Mode offline dan tombol “Pasang aplikasi”
                  hanya bekerja pada origin aman (HTTPS / localhost); fitur translate &amp; Excel
                  tetap berjalan normal.
                </span>
              </div>
            ) : (
              <p className="text-[12px] leading-relaxed text-slate-500">
                Cache hanya menyimpan tampilan aplikasi (HTML/JS/CSS/ikon), bukan data hasil olahan.
                Hasil translate &amp; Excel selalu dihitung ulang oleh backend.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
