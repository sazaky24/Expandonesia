import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'

const TONES = {
  success: { background: 'bg-emerald-600', Icon: CircleCheck },
  error: { background: 'bg-red-600', Icon: CircleAlert },
  info: { background: 'bg-slate-800', Icon: Info },
}

/** Transient banner pinned under the status bar (replaces the desktop banner). */
export default function Toast({ toast, onDismiss }) {
  if (!toast) return null

  const tone = TONES[toast.type] ?? TONES.info
  const Icon = tone.Icon

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div
        role="status"
        className={`animate-slide-down pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-white shadow-lg ${tone.background}`}
      >
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="flex-1 text-[13px] font-medium leading-snug">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup notifikasi"
          className="-mr-1 -mt-1 rounded-lg p-1 active:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
