import { FileSpreadsheet, MapPinned, SlidersHorizontal } from 'lucide-react'

const TABS = [
  { id: 'translate', label: 'Translate', fullLabel: 'Translate Peta', Icon: MapPinned },
  { id: 'excel', label: 'Excel', fullLabel: 'Data Excel', Icon: FileSpreadsheet },
  { id: 'settings', label: 'Pengaturan', fullLabel: 'Pengaturan', Icon: SlidersHorizontal },
]

/** Fixed bottom navigation — the primary navigation pattern on phones. */
export default function TabBar({ active, onChange }) {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 px-1 pb-1.5 pt-2.5 transition-colors active:bg-slate-100 ${
                isActive ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 2} />
              <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
