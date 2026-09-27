/** Shared mobile UI primitives, matching the Tailwind look of the desktop build. */

import { Info, LoaderCircle } from 'lucide-react'

export function Card({ children, className = '' }) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  )
}

/** Numbered step wrapper used by both features. */
export function StepCard({ step, title, subtitle, children }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight text-slate-900">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </Card>
  )
}

export function PrimaryButton({
  children,
  icon: Icon,
  loading = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 font-bold text-white transition-colors active:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 ${className}`}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" />
      ) : Icon ? (
        <Icon className="h-5 w-5 shrink-0" />
      ) : null}
      <span className="truncate">{children}</span>
    </button>
  )
}

export function GhostButton({ children, icon: Icon, className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors active:bg-slate-100 disabled:opacity-50 ${className}`}
      {...props}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </button>
  )
}

const PILL_TONES = {
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
}

export function Pill({ children, tone = 'slate', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        PILL_TONES[tone] ?? PILL_TONES.slate
      } ${className}`}
    >
      {children}
    </span>
  )
}

export function ProgressBar({ value }) {
  const width = Math.min(100, Math.max(0, Number(value) || 0))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-blue-600 transition-[width] duration-200"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

const NOTICE_TONES = {
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
}

export function Notice({ tone = 'blue', children, className = '' }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[12px] leading-relaxed ${
        NOTICE_TONES[tone] ?? NOTICE_TONES.blue
      } ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
