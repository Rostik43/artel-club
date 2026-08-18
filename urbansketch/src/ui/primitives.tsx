import { useState, type ReactNode } from 'react'

export function Section({
  title,
  children,
  defaultOpen = true,
  aside,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  aside?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="section">
      <button className="section-head" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="row">
          {aside}
          <span aria-hidden>{open ? '−' : '+'}</span>
        </span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <Field label={suffix ? `${label}, ${suffix}` : label}>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </Field>
  )
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

/** Часы в виде «14:30». */
export const fmtHour = (hour: number): string => {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

export const fmt = (value: number, digits = 0): string =>
  Number.isFinite(value) ? value.toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—'

export function Stat({
  label,
  value,
  tone,
  head,
}: {
  label: string
  value: string
  tone?: 'over' | 'near'
  head?: boolean
}) {
  return (
    <div className={`stat${head ? ' head' : ''}`}>
      <span className="label">{label}</span>
      <span className={`value${tone ? ` ${tone}` : ''}`}>{value}</span>
    </div>
  )
}

export function Bar({ value, limit }: { value: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(1.5, value / limit) : 0
  return (
    <div className={`bar${ratio > 1 ? ' over' : ''}`}>
      <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  )
}
