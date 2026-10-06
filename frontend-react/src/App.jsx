import { useCallback, useEffect, useRef, useState } from 'react'

import { RefreshCw } from 'lucide-react'

import SettingsSheet from './components/SettingsSheet'
import TabBar from './components/TabBar'
import Toast from './components/Toast'
import TopBar from './components/TopBar'
import ExcelUnpivotTool from './features/excel/ExcelUnpivotTool'
import TranslateMapTool from './features/translate/TranslateMapTool'
import { autoApiBaseUrl, checkHealth, normalizeBaseUrl, readStoredApiBaseUrl, storeApiBaseUrl } from './lib/api'
import { useInstallPrompt, useOnlineStatus, useServiceWorker } from './lib/pwa'

const FEATURE_TABS = ['translate', 'excel']
const SUBTITLES = {
  translate: 'Translate legenda peta curah hujan',
  excel: 'Excel matriks → tabel datar',
}

const STORAGE_ENGINE_KEY = 'expandonesia.useLocalEngine'

function readStoredEnginePreference() {
  try {
    const val = window.localStorage.getItem(STORAGE_ENGINE_KEY)
    if (val === null) return true // Default: 100% In-Device (Offline)
    return val === 'true'
  } catch {
    return true
  }
}

/** Deep links from the PWA shortcuts: /?tab=excel and /?tab=settings. */
function requestedTab() {
  const value = new URLSearchParams(window.location.search).get('tab')
  if (FEATURE_TABS.includes(value)) return value
  return value === 'settings' ? 'settings' : 'translate'
}

export default function App() {
  const [tab, setTab] = useState(() => (requestedTab() === 'excel' ? 'excel' : 'translate'))
  const [settingsOpen, setSettingsOpen] = useState(() => requestedTab() === 'settings')
  const [toast, setToast] = useState(null)
  const [customUrl, setCustomUrl] = useState(readStoredApiBaseUrl)
  const [useLocalEngine, setUseLocalEngine] = useState(readStoredEnginePreference)
  const [health, setHealth] = useState({ url: '', ok: null, message: '' })
  const toastTimer = useRef(null)

  const online = useOnlineStatus()
  const sw = useServiceWorker()
  const install = useInstallPrompt()
  const autoUrl = autoApiBaseUrl()
  const apiUrl = customUrl || autoUrl

  const notify = useCallback((type, message) => {
    if (!message) return
    setToast({ type, message })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 6000)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const runHealthCheck = useCallback(async (target) => {
    const result = await checkHealth(target)
    setHealth({ url: target, ok: result.ok, message: result.message })
    return result
  }, [])

  // Probe the backend on first paint and whenever the URL changes. "Checking" is
  // derived (no health entry for the current URL yet), so this effect never sets
  // state synchronously.
  useEffect(() => {
    if (useLocalEngine) return undefined
    let cancelled = false
    checkHealth(apiUrl).then((result) => {
      if (!cancelled) setHealth({ url: apiUrl, ok: result.ok, message: result.message })
    })
    return () => {
      cancelled = true
    }
  }, [apiUrl, useLocalEngine])

  // Keep the current tab in the URL so a reload (or the PWA shortcut) restores it.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', settingsOpen ? 'settings' : tab)
    window.history.replaceState(null, '', url)
  }, [tab, settingsOpen])

  const checking = health.url !== apiUrl

  const handleTabChange = (next) => {
    if (next === 'settings') {
      setSettingsOpen(true)
      return
    }
    setSettingsOpen(false)
    setTab(next)
  }

  const handleSaveUrl = (value) => {
    setCustomUrl(storeApiBaseUrl(normalizeBaseUrl(value)))
  }

  const handleResetUrl = () => {
    storeApiBaseUrl('')
    setCustomUrl('')
  }

  const handleToggleEngine = (isLocal) => {
    setUseLocalEngine(isLocal)
    try {
      window.localStorage.setItem(STORAGE_ENGINE_KEY, String(isLocal))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <TopBar
        subtitle={SUBTITLES[tab]}
        online={online}
        apiHealthy={useLocalEngine ? true : health.ok}
        useLocalEngine={useLocalEngine}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="pb-tabbar mx-auto max-w-md px-4 pt-4">
        {!online && !useLocalEngine ? (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800">
            Tidak ada koneksi internet. Aktifkan mode In-Device (Offline) di Pengaturan agar tetap bisa memproses tanpa jaringan.
          </div>
        ) : null}

        {sw.needRefresh ? (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[12px] leading-relaxed text-blue-800">
            <RefreshCw className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">Versi baru aplikasi sudah siap dipakai.</span>
            <button
              type="button"
              onClick={sw.applyUpdate}
              className="shrink-0 rounded-xl bg-blue-600 px-3 py-1.5 font-bold text-white active:bg-blue-700"
            >
              Muat ulang
            </button>
          </div>
        ) : null}

        {tab === 'excel' ? (
          <ExcelUnpivotTool notify={notify} useLocalEngine={useLocalEngine} />
        ) : (
          <TranslateMapTool notify={notify} useLocalEngine={useLocalEngine} />
        )}
      </main>

      <TabBar active={settingsOpen ? 'settings' : tab} onChange={handleTabChange} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {settingsOpen ? (
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          apiUrl={apiUrl}
          customUrl={customUrl}
          autoUrl={autoUrl}
          useLocalEngine={useLocalEngine}
          onToggleEngine={handleToggleEngine}
          health={{ ...health, checking }}
          onSave={handleSaveUrl}
          onReset={handleResetUrl}
          onCheck={runHealthCheck}
          online={online}
          sw={sw}
          install={install}
          notify={notify}
        />
      ) : null}
    </div>
  )
}
