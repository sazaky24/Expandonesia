import { ArrowRightLeft, Cpu, Wifi, WifiOff } from 'lucide-react'

/**
 * App bar. Displays current engine mode (In-Device CPU or Remote Network)
 * and allows instant access to settings.
 */
export default function TopBar({
  subtitle,
  online,
  apiHealthy,
  useLocalEngine = true,
  onOpenSettings,
}) {
  const dotClass =
    apiHealthy === true ? 'bg-emerald-500' : apiHealthy === false ? 'bg-red-500' : 'bg-slate-300'

  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600">
          <ArrowRightLeft className="h-4 w-4 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight text-slate-900">
            FastWork Mobile
          </h1>
          <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Buka pengaturan engine dan backend"
          className="flex h-9 shrink-0 items-center gap-2 rounded-xl bg-slate-100 px-2.5 active:bg-slate-200"
        >
          {useLocalEngine ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Cpu className="h-4 w-4" />
              <span>Offline</span>
            </span>
          ) : online ? (
            <Wifi className="h-4 w-4 text-slate-600" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        </button>
      </div>
    </header>
  )
}
